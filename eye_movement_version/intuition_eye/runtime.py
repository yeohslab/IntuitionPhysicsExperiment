"""Standalone, flip-driven PsychoPy runtime and deterministic headless rehearsal.

All timestamps within a graphical run use PsychoPy's monotonic clock. Tracker
callbacks additionally log perf_counter timestamps for clock mapping. Headless
runs use an explicit virtual clock and never claim valid acquisition timing.
"""
from __future__ import annotations

import math
import time
from pathlib import Path

from .model import angular_delta, mastery, physics_index
from .physics import Pendulum, scene_alpha
from .storage import RunStore, atomic_json
from .tracker import make_tracker


class StopRun(Exception):
    """An orderly, durable stop requested by Escape or a rehearsal limit."""


class SkipGuided(Exception):
    pass


class FocusPause(Exception):
    """Restart the current unit/trial after the display regains focus."""


class HeadlessDisplay:
    simulated = True
    keyboard_backend = 'synthetic'
    window = None

    def __init__(self, config):
        self.size = tuple(config['window']['size'])
        self.geometry = {'configured_size': self.size, 'window_size': self.size,
                         'client_size': self.size, 'framebuffer_size': self.size,
                         'viewport': [0, 0, *self.size], 'client_to_framebuffer_scale': [1.0, 1.0],
                         'content_scale_factor': 1.0, 'coordinate_system': 'top_left_drawable_pixels',
                         'simulated': True}
        self.interval = 1 / float(config['headless']['refresh_hz'])
        self.time = 0.0

    def now(self):
        return self.time

    def next_flip(self):
        return self.time + self.interval

    def flip(self, state, callback):
        self.time += self.interval
        callback(self.time)
        return self.time

    def clear(self):
        pass

    def keys(self):
        return []

    def pointer(self):
        return 0.0, 0.0, False

    def cursor(self, visible):
        pass

    def close(self):
        pass


class PsychoPyDisplay:
    simulated = False

    def __init__(self, config, event_sink):
        # Set audio preferences before importing sound or constructing a window.
        from psychopy import prefs
        prefs.hardware['audioLib'] = config['audio'].get('libraries', ['ptb', 'sounddevice'])
        from psychopy import core, event, visual
        from .render import SceneRenderer
        self.core, self.event, self.window = core, event, None
        self.keyboard, self.keyboard_backend = None, 'psychopy.event'
        try:
            cfg = config['window']
            self.window = visual.Window(size=cfg['size'], fullscr=cfg['fullscreen'],
                                        screen=cfg['screen'], units='pix', color='#f8fafc',
                                        winType='pyglet', waitBlanking=True,
                                        allowGUI=not cfg['fullscreen'], checkTiming=False)
            self.size = tuple(int(x) for x in self.window.size)
            framebuffer = tuple(int(x) for x in self.window.frameBufferSize)
            client = tuple(int(x) for x in self.window.clientSize)
            if self.size != framebuffer or any(int(x) != 0 for x in self.window.viewport[:2]):
                raise RuntimeError('Full-framebuffer viewport required for EyeLink display coordinates')
            self.geometry = {
                'configured_size': list(cfg['size']), 'window_size': self.size,
                'client_size': client, 'framebuffer_size': framebuffer,
                'viewport': [int(x) for x in self.window.viewport],
                'client_to_framebuffer_scale': [framebuffer[i] / client[i] for i in (0, 1)],
                'content_scale_factor': float(self.window.getContentScaleFactor()),
                'coordinate_system': 'top_left_drawable_pixels',
                'mouse_coordinates': 'PsychoPy event.Mouse already converts client to drawable pixels',
                'gaze_to_render_scale': [self.size[i] / framebuffer[i] for i in (0, 1)],
                'simulated': False,
            }
            self.renderer = SceneRenderer(self.window, config.get('render', {}))
            self.mouse = event.Mouse(win=self.window)
            self.interval = 1 / float(config['timing']['expected_refresh_hz'])
            if config.get('keyboard_backend') == 'ptb':
                # Explicit PTB request fails visibly rather than silently changing clocks.
                from psychopy.hardware.keyboard import Keyboard
                self.keyboard = Keyboard(backend='ptb', clock=core.monotonicClock)
                actual = getattr(self.keyboard, 'backend', 'ptb')
                if actual != 'ptb':
                    raise RuntimeError(f'PTB keyboard requested but PsychoPy selected {actual}')
                self.keyboard_backend = 'psychopy.hardware.keyboard.ptb'
            self.focus_armed, self.focus_loss_reason = False, None
            self.focus_active = bool(getattr(self.window.winHandle, '_has_focus', True))
            self.focus_visible = True

            def focus_changed(attribute, value, reason):
                setattr(self, attribute, value)
                if not self.focus_armed:
                    return
                if not value and self.focus_loss_reason is None:
                    # Keep this latch even if activation follows before the next
                    # runtime poll: a brief interruption still invalidates a trial.
                    self.focus_loss_reason = reason
                    event_sink({'event': 'display_focus_lost', 'reason': reason,
                                'clock_sec': self.now()})
                elif value and self.focused:
                    event_sink({'event': 'display_focus_restored', 'clock_sec': self.now()})

            self.window.winHandle.push_handlers(
                on_deactivate=lambda: focus_changed('focus_active', False, 'window_deactivated'),
                on_hide=lambda: focus_changed('focus_visible', False, 'window_hidden'),
                on_activate=lambda: focus_changed('focus_active', True, 'window_activated'),
                on_show=lambda: focus_changed('focus_visible', True, 'window_shown'))
            self.geometry['focus_detection'] = 'pyglet_activation_and_visibility'
            event_sink({'event': 'display_open', **self.geometry,
                        'clock': 'psychopy.core.monotonicClock',
                        'keyboard_backend': self.keyboard_backend,
                        'perf_counter_sec': time.perf_counter(), 'clock_sec': self.now()})
        except BaseException:
            self.close()
            raise

    @property
    def focused(self):
        return self.focus_active and self.focus_visible

    def poll_events(self):
        # A hidden/minimized window must still receive activation events even
        # when no experiment frames are being presented.
        self.window.winHandle.dispatch_events()

    def now(self):
        return self.core.monotonicClock.getTime()

    def next_flip(self):
        return self.window.getFutureFlipTime(clock=self.core.monotonicClock)

    def flip(self, state, callback):
        if state.get('phase') == 'fixation':
            self.renderer.draw_fixation(state.get('text', '+'))
        elif 'text' in state:
            self.renderer.draw_text(state['text'], state.get('footer', ''))
        else:
            self.renderer.draw(state)
        result, failures = [], []

        def on_flip():
            stamp = self.now()
            result.append(stamp)
            try:
                callback(stamp)
            except BaseException as exc:
                failures.append(exc)

        self.window.callOnFlip(on_flip)
        self.window.flip()
        if failures:
            raise failures[0]
        return result[0]

    def clear(self):
        self.event.clearEvents(eventType='keyboard')
        if self.keyboard is not None:
            self.keyboard.clearEvents()
        self.mouse.clickReset()

    def keys(self):
        if self.keyboard is not None:
            # rt is relative to the supplied monotonicClock, which is never reset.
            return [(key.name, float(key.rt)) for key in
                    self.keyboard.getKeys(waitRelease=False, clear=True)]
        return [(name, float(stamp)) for name, stamp in
                self.event.getKeys(timeStamped=self.core.monotonicClock)]

    def pointer(self):
        x, y = self.mouse.getPos()
        return self.size[0] / 2 + x, self.size[1] / 2 - y, bool(self.mouse.getPressed()[0])

    def cursor(self, visible):
        self.mouse.setVisible(visible)

    def close(self):
        if self.window is not None:
            try:
                self.window.close()
            finally:
                self.window = None


class Audio:
    def __init__(self, config, event_sink, simulated=False):
        self.sink, self.active, self.hum, self.cue = event_sink, False, None, None
        if not config.get('enabled', True) or simulated:
            return
        import numpy as np
        import soundfile as sf
        from psychopy import sound
        # Match the browser's Web Audio samples, including its gain and envelope.
        # Apply gain to the WAV samples: PsychoPy clips Sound.volume above 1.0,
        # whereas the browser uses a 1.5 GainNode on this peak-0.25 asset.
        # Enabled audio failures remain fatal rather than silently losing cues.
        samples, sample_rate = sf.read(str(config['mask_file']), dtype='float32', always_2d=True)
        samples *= float(config.get('mask_volume', 1.5))
        self.hum = sound.Sound(samples, sampleRate=sample_rate, loops=-1,
                               volume=1.0, hamming=False)
        cue_rate = 48000
        t = np.arange(round(.08 * cue_rate), dtype=np.float64) / cue_rate
        envelope = np.exp(math.log(.0001) * np.minimum(t / .07, 1.0))
        cue = (float(config.get('cue_volume', 1.0)) * envelope * np.sin(2 * np.pi * 880 * t)).astype('float32')
        self.cue = sound.Sound(cue, sampleRate=cue_rate, volume=1.0, hamming=False)

    def set(self, masking, response=False):
        if masking != self.active:
            if self.hum is not None:
                self.hum.play() if masking else self.hum.stop()
            self.active = masking
            self.sink({'event': 'audio_mask_on' if masking else 'audio_mask_off',
                       'hardware_audio': self.hum is not None})
        if response:
            if self.cue is not None:
                self.cue.play()
            self.sink({'event': 'audio_response_cue', 'hardware_audio': self.cue is not None})

    def close(self):
        for sound in (self.hum, self.cue):
            if sound is not None:
                sound.stop()
        self.active = False


MARKER_COLUMNS = {
    'CUE_ONSET': 'psychopy_cue_onset_sec',
    'CUE_OFFSET': 'psychopy_cue_offset_sec',
    'MOTION_ONSET': 'psychopy_motion_onset_sec',
    'BLANK_ONSET': 'psychopy_blank_onset_sec',
    'RESPONSE_ONSET': 'psychopy_response_onset_sec',
    'TRIAL_END': 'psychopy_trial_end_sec',
}


class ExperimentRuntime:
    def __init__(self, session, config, tracker_mode='dummy', headless=False, smoke_seconds=None):
        if (headless or smoke_seconds is not None) and tracker_mode != 'dummy':
            raise ValueError('Headless and smoke runs require --tracker dummy')
        self.session, self.config, self.mode = session, config, tracker_mode
        self.headless, self.smoke_seconds = headless, smoke_seconds
        self.auto = headless or smoke_seconds is not None
        self.store = self.display = self.tracker = self.audio = None
        self.active = None
        self.presentation = self.frame_count = 0
        self.started = self.previous_frame = self.motion_previous = None
        self.guided_skipped, self.loop_index, self.attempt = False, 0, 1
        self.assessment_errors, self.assessments = [], []
        self.descriptors = {d['unit_id']: d for d in session['trial_descriptors']}
        self.physics = physics_index(session)
        self.markers = set()
        self.flip_events = []

    def event(self, record):
        self.store.event({'presentation_id': self.active.get('presentation_id') if self.active else None,
                          **record})

    def marker(self, name, stamp, flip_aligned=False, **fields):
        record = {'event': name, 'clock_sec': stamp, 'flip_aligned': flip_aligned, **fields}
        self.event(record)
        if self.tracker is not None:
            self.tracker.message(f'{name} {stamp:.9f}')
        if self.active is not None and name in MARKER_COLUMNS:
            self.active[MARKER_COLUMNS[name]] = stamp

    def once(self, marker):
        if marker in self.markers:
            return []
        self.markers.add(marker)
        return [marker]

    def flip(self, state, markers=(), audio=None):
        from .render import frame_geometry
        self.guard()
        state = {**state, 'window_size': self.display.size}

        def callback(stamp):
            for name in markers:
                self.marker(name, stamp, flip_aligned=True)
            if audio is not None:
                self.audio.set(*audio)

        stamp = self.display.flip(state, callback)
        self.frame_count += 1
        motion = self.active is not None and state.get('motion_elapsed') is not None
        gap = None if self.previous_frame is None else stamp - self.previous_frame
        self.previous_frame = stamp
        row = self.active
        if motion:
            mgap = None if self.motion_previous is None else stamp - self.motion_previous
            self.motion_previous = stamp
            row['sim_frame_count'] += 1
            if mgap is not None:
                row['sim_max_frame_gap_ms'] = max(row['sim_max_frame_gap_ms'], mgap * 1000)
                if mgap > self.display.interval * self.config['timing']['drop_frame_multiplier']:
                    row['dropped_frame_count'] += 1
            visible = state.get('alpha', 1) > 0 and state.get('phase') != 'blank'
            elapsed = state['motion_elapsed']
            if visible:
                row['actual_last_visible_frame_sec'] = stamp
            for i, segment in enumerate(self.visible_segments):
                if visible and segment['tStartSec'] <= elapsed <= segment['tEndSec']:
                    row['actual_visible_segment_frame_counts'][i] += 1
        if self.config.get('log_frames', True):
            geometry = frame_geometry(state) if 'unit' in state else {}
            # Training has horizontal motion rather than a pendulum.
            if state.get('linear_x_m') is not None and geometry:
                rod_m = float(state.get('descriptor', {}).get('rod_length_m', 4))
                geometry['bob_screen_x'] = (geometry['canvas_left'] + geometry['anchor_x'] * geometry['scale']
                                            + state['linear_x_m'] * geometry['rod_px'] / rod_m * geometry['scale'])
                geometry['bob_screen_y'] = geometry['canvas_top'] + 280 * geometry['scale']
            self.store.frame({'frame_index': self.frame_count, 'presentation_id': row.get('presentation_id') if row else None,
                              'clock_sec': stamp, 'frame_gap_sec': gap, 'phase': state.get('phase', 'text'),
                              'motion_elapsed_sec': state.get('motion_elapsed'),
                              'theta_rad': state.get('theta_rad'), 'omega_rad_sec': state.get('omega_rad_sec'),
                              'linear_x_m': state.get('linear_x_m'), 'alpha': state.get('alpha'),
                              'markers': list(markers), 'simulated': self.headless, **geometry})
        # Keep recoverable incremental streams reasonably current during long rests.
        if self.frame_count % int(self.config.get('flush_every_frames', 120)) == 0:
            self.store.flush()
        self.guard()
        return stamp

    def guard(self):
        if self.display is None:
            return
        if hasattr(self.display, 'poll_events'):
            self.display.poll_events()
        reason = getattr(self.display, 'focus_loss_reason', None)
        if reason is None and getattr(self.display, 'focus_armed', False) and not self.display.focused:
            reason = 'window_unfocused'
        if reason is not None:
            raise FocusPause(reason)
        if self.smoke_seconds is not None and self.started is not None:
            if self.display.now() - self.started >= self.smoke_seconds:
                raise StopRun('smoke_complete')
        limit = self.config['headless'].get('abort_after_frames') if self.headless else None
        if limit and self.frame_count >= int(limit):
            raise StopRun('headless_requested_abort')
        if self.tracker is not None and self.active is not None:
            self.tracker.check_recording()

    def keys(self):
        values = sorted(self.display.keys(), key=lambda pair: pair[1])
        if any(key == 'escape' for key, _ in values):
            raise StopRun('escape')
        self.guard()
        return values

    def pause_for_focus(self, reason, presentation_id=None):
        """Wait without advancing any protocol unit or keeping a trial open.

        Interrupted presentations are persisted before entering this method.
        Their visibility_pause_sec is zero because the trial has ended; the
        full time spent between presentations is recorded in focus_pause_end.
        """
        onset = self.display.now()
        self.audio.close()
        self.event({'event': 'focus_pause_start', 'clock_sec': onset, 'reason': reason,
                    'interrupted_presentation_id': presentation_id})
        self.store.status('paused', reason=reason)
        self.store.flush()
        resumed = False
        try:
            while True:
                if hasattr(self.display, 'poll_events'):
                    self.display.poll_events()
                # Bypass keys()/flip(): their guards deliberately reject the
                # latched loss until this pause has completed.
                if any(key == 'escape' for key, _ in self.display.keys()):
                    raise StopRun('escape')
                self.display.flip({'text': '实验已暂停。请切回实验窗口。', 'phase': 'focus_pause',
                                   'footer': '返回后将重新开始受影响试次；Esc 退出'}, lambda stamp: None)
                if self.display.focused:
                    break
                if not self.display.simulated:
                    time.sleep(.02)
            self.display.clear()
            self.display.focus_loss_reason = None
            # Do not include the inter-trial pause in frame-gap diagnostics.
            self.previous_frame = self.motion_previous = None
            resumed = True
        finally:
            duration = self.display.now() - onset
            if self.started is not None:
                self.started += duration
            self.event({'event': 'focus_pause_end', 'clock_sec': self.display.now(),
                        'duration_sec': duration, 'resumed': resumed,
                        'interrupted_presentation_id': presentation_id})
            if resumed:
                self.store.status('running', reason=None)
            self.store.flush()

    def text(self, unit):
        from .render import text_pages
        if unit['type'] == 'training1Summary':
            passed = bool(self.assessments and self.assessments[-1]['passed'])
            unit = {**unit, 'text': f'训练结束。结果：{"f（通过）" if passed else "nf（未完成）"}'}
        for page in text_pages(unit.get('text', unit.get('html', ''))):
            self.display.clear()
            self.display.cursor(False)
            onset = self.flip({'text': page, 'phase': 'instructions', 'footer': '按空格继续；Esc 退出'}, ['INSTRUCTION_ONSET'])
            while True:
                values = self.keys()
                if any(key == 'space' and stamp >= onset for key, stamp in values):
                    break
                if self.auto and self.display.now() - onset >= .05:
                    break
                self.flip({'text': page, 'phase': 'instructions', 'footer': '按空格继续；Esc 退出'})

    def timed_text(self, unit):
        marks = ['FIXATION_ONSET']
        if self.active is not None and 'psychopy_cue_onset_sec' in self.active and 'psychopy_cue_offset_sec' not in self.active:
            marks.append('CUE_OFFSET')
        onset = self.flip({'text': unit.get('text', '+'), 'phase': 'fixation'}, marks)
        duration = unit['durationMs'] / 1000
        while self.display.next_flip() - onset < duration - 1e-9:
            self.keys()
            self.flip({'text': unit.get('text', '+'), 'phase': 'fixation'})

    def cue(self, unit, task, descriptor, pendulum):
        self.display.cursor(False)
        state = {'text': unit['text'], 'phase': 'cue', 'footer': ''}
        self.display.clear()
        onset = self.flip(state, ['CUE_ONSET'])
        while self.display.next_flip() - onset < unit['durationMs'] / 1000 - 1e-9:
            self.keys()
            self.flip(state)

    def demo(self, unit):
        p = Pendulum(self.physics[unit['id']])
        d = {'amplitude_deg': unit.get('amplitudeDeg', 50), 'rod_length_m': unit.get('rodLengthM', 4)}
        onset = self.flip({'unit': 'E4', 'descriptor': d, 'phase': 'motion',
                           'theta_rad': p.at(0)[0], 'alpha': 1}, ['DEMO_ONSET'])
        while self.display.next_flip() - onset < p.analysis['T']:
            self.keys()
            t = self.display.next_flip() - onset
            self.flip({'unit': 'E4', 'descriptor': d, 'phase': 'motion',
                       'theta_rad': p.at(t)[0], 'alpha': 1})
        self.marker('DEMO_END', self.display.now())

    def begin_trial(self, item, trial, task):
        self.presentation += 1
        self.markers, self.motion_previous = set(), None
        d = {**self.descriptors[task['id']], 'window_size': self.display.size}
        self.scene = {'training-1': 'training', 'experiment-2': 'E2', 'experiment-4-v2': 'E4',
                      'experiment-5-v3': 'E5'}[self.session['runtime_variant_id']]
        if self.scene == 'E2':
            d['speed_color_strips'] = d.get('speed_cue_type') == 'color-strips'
            d['speed_bar_v_max_m_per_sec'] = d.get('speed_color_v_max_m_per_sec', 15.336231610144651)
        self.visible_segments = task.get('visibleSegments') or []
        if not self.visible_segments and d.get('visible_segments_json'):
            import json
            self.visible_segments = json.loads(d['visible_segments_json'])
        self.active = {**d, **self.session['participant'], 'session_id': self.session['session_id'],
                       'experiment_id': self.session['experiment_id'],
                       'protocol_version': self.session['protocol_version'], 'data_schema_version': 1,
                       'runtime_variant_id': self.session['runtime_variant_id'],
                       'template_trial_id': trial['id'], 'presentation_id': f'p{self.presentation:05d}',
                       'presentation_index': self.presentation, 'loop_index': self.loop_index,
                       'tracker_mode': self.mode, 'trial_status': 'running',
                       'assessment_attempt': self.attempt if self.scene == 'training' and not task.get('feedbackShown') else None,
                       'feedback_phase_skipped': False,
                       'feedback_available': bool(task.get('feedbackShown')) if self.scene == 'training' else item['kind'] == 'practice',
                       'feedback_shown': bool(task.get('feedbackShown')) if self.scene == 'training' else item['kind'] == 'practice',
                       'feedback_presented': False,
                       'report_available_at_sec': task.get('reportDelaySec') if self.scene == 'training' else None,
                       'first_traversal_duration_sec': task.get('firstTraversalDurationSec') if self.scene == 'training' else None,
                       'rt_total_sec': None, 'rt_speed_sec': None, 'rt_angle_sec': None,
                       'psychopy_confirmation_sec': None,
                       'psychopy_trial_start_sec': self.display.now(),
                       'psychopy_clock': 'virtual' if self.headless else 'psychopy.core.monotonicClock',
                       'keyboard_backend': self.display.keyboard_backend,
                       'sim_frame_count': 0, 'sim_max_frame_gap_ms': 0.0, 'dropped_frame_count': 0,
                       'actual_visible_segment_frame_counts': [0] * len(self.visible_segments),
                       'visibility_pause_count': 0, 'visibility_pause_sec': 0.0,
                       'timing_valid': False if self.auto else None}
        # Start the tracker before fixation so fixation/cue messages are recorded too.
        if self.config['tracker'].get('drift_check', True) and self.mode == 'eyelink':
            self.tracker.drift_check()
        self.tracker.start_trial(self.active['presentation_id'], {
            'template_trial_id': trial['id'], 'formal_trial_index': d.get('formal_trial_index'),
            'loop_index': self.loop_index, 'assessment_attempt': self.active['assessment_attempt']})
        self.event({'event': 'trial_prepared', 'trial_id': trial['id'], 'unit_id': task['id'],
                    'clock_sec': self.display.now()})
        self.store.flush()
        return d

    def finish_trial(self, status='completed', reason=None):
        if self.active is None:
            return
        row = self.active
        row['trial_status'], row['interruption_reason'] = status, reason
        if 'psychopy_trial_end_sec' not in row:
            self.marker('TRIAL_END', self.display.now())
        report_start = row.get('psychopy_response_onset_sec')
        confirmation = row.get('psychopy_confirmation_sec')
        if report_start is not None and confirmation is not None:
            row['rt_total_sec'] = max(0.0, float(confirmation) - float(report_start))
        valid_segments = not self.visible_segments or min(row['actual_visible_segment_frame_counts']) >= 2
        row['timing_valid'] = (not self.auto and status == 'completed' and valid_segments and
                               row['sim_max_frame_gap_ms'] <= self.config['timing']['max_frame_gap_ms'])
        # The behavior record is durable even when tracker stop/transfer subsequently fails.
        self.store.trial(row)
        self.active = None
        self.tracker.stop_trial(0 if status == 'completed' else 1)
        # Responses can be interrupted during feedback. Only a completed
        # presentation contributes to mastery, so its replacement is not counted twice.
        if (status == 'completed' and self.scene == 'training' and row['assessment_attempt'] is not None
                and 'abs_delta_strip_position' in row):
            self.assessment_errors.append(row['abs_delta_strip_position'])

    def run_trial(self, item, trial):
        while True:
            try:
                self.guard()
                self._run_trial(item, trial)
                return
            except FocusPause as exc:
                self.pause_for_focus(str(exc), getattr(exc, 'presentation_id', None))

    def _run_trial(self, item, trial):
        task = next((u for u in trial['units'] if u['id'] in self.descriptors), None)
        if task is None:
            for unit in trial['units']:
                self.control(unit)
            return
        d = self.begin_trial(item, trial, task)
        p = Pendulum(self.physics[task['id']]) if task['id'] in self.physics else None
        try:
            for unit in trial['units']:
                if unit is task:
                    self.stimulus(task, d, p)
                elif unit['type'] == 'textDisplay' and unit.get('text') != '+' and p is not None:
                    self.cue(unit, task, d, p)
                else:
                    self.control(unit)
            self.finish_trial()
        except FocusPause as exc:
            exc.presentation_id = self.active['presentation_id']
            self.active['visibility_pause_count'] += 1
            self.finish_trial('interrupted', str(exc))
            raise
        except SkipGuided:
            self.guided_skipped = True
            self.active['feedback_phase_skipped'] = True
            self.finish_trial('skipped', 'guided_feedback_skipped')
            raise
        except BaseException as exc:
            self.finish_trial('interrupted' if isinstance(exc, (StopRun, KeyboardInterrupt)) else 'error',
                              f'{type(exc).__name__}: {exc}')
            raise

    def control(self, unit):
        while True:
            try:
                if unit['type'] == 'textDisplay':
                    self.timed_text(unit)
                elif unit['type'] == 'protocol2PendulumDemo':
                    self.demo(unit)
                else:
                    self.text(unit)
                return
            except FocusPause as exc:
                if self.active is not None:
                    raise  # Restart the whole trial, including fixation and cue.
                self.pause_for_focus(str(exc))

    def stimulus(self, u, d, p):
        training, e2, e5 = self.scene == 'training', self.scene == 'E2', self.scene == 'E5'
        row = self.active
        can_skip = training and u.get('mode') == 'guided' and str(u.get('trainingSegment', '')).startswith('guided_')
        report = 'speed' if training else d.get('report_target', 'angle')
        if training:
            end = float(u.get('reportDelaySec', 4))
            truth = float(u['targetStripPosition'])
        elif e2:
            # hide1T is an inherited field name; its exported value is seconds.
            show = float(u['show1T']) * float(p.analysis['T'])
            fade = float(u.get('fadeMs', 0)) / 1000
            blank = show + fade
            end = blank + float(u['hide1T'])
            truth = p.at(end)[0]
            p.at(0)
        else:
            end, blank = float(u['queryTimeSec']), float(u['blankStartSec'])
            fade = float(self.session['protocol_settings'].get('protocol_2_constants', {}).get('PROTOCOL_2_FADE_SEC', .3))
            qtheta, qomega = p.at(end)
            physical_speed_truth = p.params['rodLengthM'] * abs(qomega)
            truth = (min(1.0, max(0.0, physical_speed_truth /
                                  float(d['speed_scale_linear_m_per_sec']))) if report == 'speed' else qtheta)
            row['linear_speed_q_m_per_sec'] = physical_speed_truth if report == 'speed' else None
            p.at(0)
        row['speed_strip_truth_position'] = truth if report == 'speed' else None
        base = {'unit': self.scene, 'descriptor': d, 'response_mode': report, 'selected': None,
                'truth': truth, 'show_skip': can_skip}
        if e5:
            row.update(response_key=None, response_judgment=None, correct=None, rt_sec=None, timed_out=False)
            base['footer'] = f'可以到达：按 {u.get("yesKey", "f").upper()}；不可以到达：按 {u.get("noKey", "j").upper()}。运动开始后即可作答。'
        selected = None
        confirmed = None
        response_onset = first_interaction = None
        phase = 'motion'
        self.display.cursor(False)
        self.display.clear()
        first = {**base, 'phase': 'motion', 'motion_elapsed': 0.0, 'alpha': 1.0}
        if training:
            from .model import training_motion
            first['linear_x_m'], first['direction'] = training_motion(u, 0)
        else:
            first['theta_rad'], first['omega_rad_sec'] = p.at(0)
        start_markers = ['MOTION_ONSET']
        if 'psychopy_cue_onset_sec' in row and 'psychopy_cue_offset_sec' not in row:
            start_markers.append('CUE_OFFSET')
        if e5:
            start_markers.extend(['RESPONSE_GATE_OPEN', 'RESPONSE_ONSET'])
        onset = self.flip(first, start_markers)
        row['psychopy_motion_onset_sec'] = onset
        previous_down = self.display.pointer()[2]
        angle_dragging = False
        while confirmed is None:
            now = self.display.now()
            elapsed = max(0., self.display.next_flip() - onset)
            keys = [(key, stamp) for key, stamp in self.keys() if stamp >= onset]
            if e5:
                yes, no = u.get('yesKey', 'f'), u.get('noKey', 'j')
                response = next(((key, stamp) for key, stamp in keys if key in (yes, no)), None)
                if response is None and self.auto and now - onset >= self.config['headless']['e5_rt_sec']:
                    judgment = u['correctResponse']
                    response = (yes if judgment == 'reachable' else no, now)
                if response is not None:
                    key, confirmed = response
                    row.update(response_key=key, response_judgment='reachable' if key == yes else 'unreachable',
                               correct=('reachable' if key == yes else 'unreachable') == u['correctResponse'],
                               rt_sec=confirmed - onset, timed_out=False,
                               psychopy_response_event_sec=confirmed, psychopy_confirmation_sec=confirmed, rt_total_sec=max(0.0, confirmed - onset))
                    self.marker('RESPONSE', confirmed, response_key=key)
                    break
            from .render import angle_from_pointer, hit_canvas, hit_confirm, hit_skip, strip_value
            x, y, down = self.display.pointer()
            click = down and not previous_down
            previous_down = down
            if can_skip and (any(k == 's' for k, _ in keys) or click and hit_skip(x, y, self.scene, d) or
                             self.auto and self.config['headless'].get('skip_guided')):
                raise SkipGuided()
            if not e5 and response_onset is not None:
                button = click and hit_confirm(x, y, self.scene, d)
                if not down:
                    angle_dragging = False
                elif click and report == 'angle':
                    angle_dragging = not button and hit_canvas(x, y, self.scene, d)
                if down and not button and not (can_skip and hit_skip(x, y, self.scene, d)) and (report == 'speed' or angle_dragging):
                    value = strip_value(x, y, self.scene, d) if report == 'speed' else angle_from_pointer(self.scene, d, x, y)
                    if value is not None:
                        selected = value
                        if first_interaction is None:
                            first_interaction = now
                if self.auto and now - response_onset >= self.config['headless']['response_delay_sec']:
                    error = 0.5 if training and not u.get('feedbackShown') and self.attempt <= self.config['headless'].get('assessment_failures', 0) else 0.0
                    selected = min(1.0, truth + error) if report == 'speed' else truth
                    first_interaction = first_interaction if first_interaction is not None else now
                    button = True
                if selected is not None:
                    # Keep the latest input even if Escape/focus loss precedes confirmation.
                    self.score(report, selected, truth, p, None, response_onset)
                    row['rt_speed_sec' if report == 'speed' else 'rt_angle_sec'] = first_interaction - response_onset
                key_confirmation = next((stamp for key, stamp in keys if key in ('space', 'return') and stamp >= response_onset), None)
                if selected is not None and (button or key_confirmation is not None):
                    confirmed = key_confirmation if key_confirmation is not None else now
                    row.update(psychopy_response_event_sec=confirmed, psychopy_confirmation_sec=confirmed,
                               rt_estimate_sec=confirmed - response_onset,
                               rt_total_sec=max(0.0, confirmed - response_onset),
                               motion_elapsed_at_confirmation_sec=confirmed - onset)
                    self.marker('RESPONSE', confirmed, selected=selected)
                    break
            state = {**base, 'selected': selected, 'motion_elapsed': elapsed}
            marks, audio = [], None
            if not training and elapsed >= blank:
                marks += self.once('BLANK_ONSET')
            if training:
                state['linear_x_m'], state['direction'] = training_motion(u, elapsed)
                state['alpha'] = 1.0
            else:
                state['theta_rad'], state['omega_rad_sec'] = p.at(min(elapsed, end))
                state['alpha'] = (1.0 if elapsed < show else max(0.0, 1 - (elapsed - show) / fade)) if e2 and fade > 0 else (float(elapsed < show) if e2 else scene_alpha(elapsed, blank, fade))
                fade_start = show if e2 else max(0., blank - fade)
                if elapsed >= fade_start:
                    marks += self.once('FADE_ONSET')
            if elapsed >= end and response_onset is None:
                phase = 'blank' if e5 else 'estimate'
                state['phase'] = phase
                marks += self.once('QUERY_END' if e5 else 'RESPONSE_ONSET')
                audio = (False, True)
                self.display.cursor(not e5)
                response_onset = self.flip(state, marks, audio)
                row['sim_elapsed_actual_sec'] = response_onset - onset
                row['sim_end_overshoot_ms'] = max(0., response_onset - onset - end) * 1000
                continue
            state['phase'] = 'estimate' if response_onset is not None and not e5 else ('blank' if not training and elapsed >= blank else 'motion')
            if not training and response_onset is None and elapsed >= fade_start:
                audio = (True, False)
            self.flip(state, marks, audio)
        if first_interaction is not None:
            row['rt_speed_sec' if report == 'speed' else 'rt_angle_sec'] = first_interaction - response_onset
        if not e5:
            self.score(report, selected, truth, p, confirmed, response_onset)
        feedback = training and u.get('feedbackShown') or (not training and d.get('segment_kind') == 'practice')
        # Response closes the stimulus on the very next refresh. Practice feedback
        # is a separate visual phase; formal trials go straight to a blank frame.
        self.audio.set(False)
        if feedback:
            e4_speed_replay = self.scene == 'E4' and report == 'speed'
            state = {**base, 'phase': 'feedback', 'selected': selected, 'alpha': 1.0}
            if not training and not e5:
                if e4_speed_replay:
                    feedback_footer = (
                        '练习反馈：蓝色跟着摆球的真实速度移动。遮挡和消失都是半透明的，摆球一直看得到。'
                        '运动结束后蓝色停住，再出现橙色，那是您的选择。'
                        '色带只表示快慢，不表示方向。左端是静止，右端是最高速，越靠右越快。'
                        '右端是这套实验里摆球能达到的最快速度，经过下方时也不一定顶到最右端。'
                        '蓝线靠近左端，表示当时几乎停住，多在较高处、快要转向；越靠右表示越快。'
                        '蓝线在橙线右边，说明当时比您判断的更快；在左边，说明更慢。看完后按空格继续。'
                    )
                else:
                    feedback_footer = f'练习反馈：橙色为您的选择，蓝色为真实{"速度" if report == "speed" else "角度"}。'
                state['footer'] = feedback_footer + ('' if e2 or e4_speed_replay else '按空格继续。')
            if training:
                state['linear_x_m'], state['direction'] = training_motion(u, self.display.next_flip() - onset)
            elif not e4_speed_replay:
                state['theta_rad'], state['omega_rad_sec'] = p.at(end)
            if e5:
                state.update(replay=True, motion_elapsed=None,
                             footer=f'{"正确" if row["correct"] else "错误"}。这个铃铛{"可以" if u["correctResponse"] == "reachable" else "不可以"}到达。下面再看一次遮挡后面的运动。按空格继续。')
                state['theta_rad'], state['omega_rad_sec'] = p.at(0)
            if e4_speed_replay:
                scale = float(d.get('speed_scale_linear_m_per_sec') or row.get('speed_scale_linear_m_per_sec') or 1)
                rod = float(p.params['rodLengthM'])
                theta0, omega0 = p.at(0)
                state.update(replay=True, hide_choice=True, selected=None, motion_elapsed=None,
                             theta_rad=theta0, omega_rad_sec=omega0,
                             alpha=scene_alpha(0, blank, fade),
                             truth=min(1.0, max(0.0, rod * abs(omega0) / scale)) if scale > 0 else 0.0)
            feedback_onset = self.flip(state, ['FEEDBACK_ONSET'])
            row['feedback_presented'] = True
            self.display.clear()
            hold = self.session['protocol_settings'].get('constants', {}).get('TRAINING_1_FEEDBACK_HOLD_MS', 2000) / 1000
            while True:
                keys = self.keys()
                now = self.display.now()
                replay_done = True
                if training:
                    if self.display.next_flip() - feedback_onset + 1e-9 >= hold:
                        break
                    state['linear_x_m'], state['direction'] = training_motion(u, self.display.next_flip() - onset)
                else:
                    feedback_delay = 0.3 if e2 else 0.0
                    if e2 and self.display.next_flip() - feedback_onset + 1e-9 >= feedback_delay:
                        state['footer'] = feedback_footer + '按空格继续。'
                    if e4_speed_replay:
                        replay_t = min(end, max(0., self.display.next_flip() - feedback_onset))
                        theta_now, omega_now = p.at(replay_t)
                        state['theta_rad'], state['omega_rad_sec'] = theta_now, omega_now
                        state['alpha'] = scene_alpha(replay_t, blank, fade)
                        state['truth'] = min(1.0, max(0.0, rod * abs(omega_now) / scale)) if scale > 0 else 0.0
                        replay_done = replay_t + 1e-9 >= end
                        if replay_done:
                            state.update(hide_choice=False, selected=selected, truth=truth)
                        else:
                            replay_done = False
                    choice_visible = (not e4_speed_replay) or state.get('choice_flipped')
                    if choice_visible and replay_done and (any(k == 'space' and stamp >= feedback_onset + feedback_delay
                            for k, stamp in keys)
                            or self.auto and now - feedback_onset >= (feedback_delay if feedback_delay else 0.1)):
                        break
                x, y, down = self.display.pointer()
                if can_skip and (any(k == 's' for k, _ in keys) or down and not previous_down and hit_skip(x, y, self.scene, d)):
                    self.guided_skipped = True
                    row['feedback_phase_skipped'] = True
                    break
                previous_down = down
                if e5:
                    replay_t = min(end, max(0., self.display.next_flip() - feedback_onset))
                    state['theta_rad'], state['omega_rad_sec'] = p.at(replay_t)
                self.flip(state)
                if e4_speed_replay and not state.get('hide_choice'):
                    state['choice_flipped'] = True
        self.flip({'text': '', 'phase': 'trial_end'}, ['TRIAL_END'])

    def score(self, report, selected, truth, p, confirmed, response_onset):
        row = self.active
        if report == 'speed':
            scale = float(row.get('speed_scale_linear_m_per_sec', row.get('speed_bar_v_max_m_per_sec', 6.260990336999411)))
            delta = selected - truth
            reported_speed = selected * scale
            physical_truth = row.get('linear_speed_q_m_per_sec')
            if physical_truth is None:
                physical_truth = truth * scale
            physical_truth = float(physical_truth)
            row.update(speed_strip_position=selected, speed_strip_truth_position=truth,
                       delta_strip_position=delta, abs_delta_strip_position=abs(delta),
                       speed_reported_m_per_sec=reported_speed,
                       linear_speed_reported_m_per_sec=reported_speed,
                       linear_speed_q_m_per_sec=physical_truth,
                       delta_linear_speed_m_per_sec=reported_speed - physical_truth,
                       abs_delta_linear_speed_m_per_sec=abs(reported_speed - physical_truth))
        else:
            # E2 exports wrapDeltaThetaDeg for both regimes; E4 exports a
            # direct subtraction, including oscillations wider than 90 degrees.
            delta = angular_delta(selected, truth, self.scene == 'E2')
            row.update(theta_estimated_rad=selected, theta_estimated_deg=math.degrees(selected),
                       theta_reported_rad=selected, theta_reported_deg=math.degrees(selected),
                       delta_theta_deg=delta, abs_delta_theta_deg=abs(delta),
                       delta_theta_rad=math.radians(delta), abs_delta_theta_rad=abs(math.radians(delta)))

    def item(self, item):
        if item['kind'] == 'rest':
            for unit in item['units']:
                self.control(unit)
        else:
            for trial in item['children']:
                try:
                    self.run_trial(item, trial)
                except SkipGuided:
                    return

    def sequence(self):
        items = self.session['stimulus_set']['sequence']
        if self.session['runtime_variant_id'] != 'training-1':
            for item in items:
                self.item(item)
            return
        retry_start = next(i for i, item in enumerate(items) if item['id'] == 'training-1-remediation-intro')
        retry_end = next(i for i, item in enumerate(items) if item['id'] == 'training-1-assessment-2')
        i = 0
        while i < len(items):
            item = items[i]
            identifier = item['id']
            if identifier == 'training-1-remediation-intro' and self.assessments and self.assessments[-1]['passed']:
                i = retry_end + 1
                continue
            if self.guided_skipped and identifier.startswith('training-1-guided-'):
                i += 1
                continue
            if identifier in ('training-1-assessment-1', 'training-1-assessment-2'):
                self.assessment_errors = []
            self.item(item)
            if identifier in ('training-1-assessment-1', 'training-1-assessment-2'):
                result = {'attempt': self.attempt, **mastery(self.assessment_errors)}
                self.assessments.append(result)
                self.event({'event': 'assessment_result', **result})
                self.store.flush()
                if not result['passed']:
                    self.attempt += 1
                    self.loop_index += 1
                    i = retry_start
                    continue
            i += 1

    def run(self):
        """Return a result only after all resources and durable logs are closed."""
        state, reason, error = 'error', None, None
        cleanup_errors = []
        self.store = RunStore(self.config['output_dir'], self.session, self.config, self.mode)
        self.store.status('starting', simulated=self.headless, smoke=self.smoke_seconds is not None)
        try:
            self.display = HeadlessDisplay(self.config) if self.headless else PsychoPyDisplay(self.config, self.event)
            atomic_json(self.store.path / 'display.json', self.display.geometry)
            self.event({'event': 'display_geometry', **self.display.geometry})
            self.started = self.display.now()
            self.audio = Audio(self.config['audio'], self.event, self.headless)
            self.tracker = make_tracker(self.mode, self.config['tracker'], self.event)
            self.tracker.setup(self.display.window, self.display.size)
            self.tracker.calibrate()
            if not self.headless:
                self.display.focus_armed = True
            self.store.status('running')
            self.sequence()
            state = 'smoke_completed' if self.smoke_seconds is not None else ('headless_completed' if self.headless else 'completed')
        except (StopRun, KeyboardInterrupt) as exc:
            reason = str(exc) or 'keyboard_interrupt'
            state = 'smoke_completed' if reason == 'smoke_complete' else 'interrupted'
        except BaseException as exc:
            error, reason = exc, f'{type(exc).__name__}: {exc}'
        finally:
            # Each cleanup step is independent. A failed audio/window stop cannot
            # prevent EDF retrieval or writing the final run status.
            if self.active is not None:
                try:
                    self.finish_trial('interrupted' if state != 'error' else 'error', reason)
                except BaseException as exc:
                    cleanup_errors.append(f'finish_trial: {type(exc).__name__}: {exc}')
            if self.audio is not None:
                try:
                    self.audio.close()
                except BaseException as exc:
                    cleanup_errors.append(f'audio: {type(exc).__name__}: {exc}')
            if self.tracker is not None:
                try:
                    result = self.tracker.close(self.store.path / 'recording.edf')
                    self.event({'event': 'tracker_cleanup', **result})
                    cleanup_errors.extend(result.get('warnings', []))
                except BaseException as exc:
                    cleanup_errors.append(f'tracker: {type(exc).__name__}: {exc}')
            if self.display is not None:
                try:
                    self.display.close()
                except BaseException as exc:
                    cleanup_errors.append(f'window: {type(exc).__name__}: {exc}')
            if cleanup_errors and state in ('completed', 'headless_completed', 'smoke_completed'):
                state = 'cleanup_error'
            self.event({'event': 'run_end', 'state': state, 'reason': reason, 'cleanup_errors': cleanup_errors})
            self.store.status(state, completed_trials=self.store.count, reason=reason, cleanup_errors=cleanup_errors,
                              training_result=('f' if self.assessments and self.assessments[-1]['passed'] and state.endswith('completed') else 'nf')
                              if self.session['runtime_variant_id'] == 'training-1' else None,
                              assessments=self.assessments)
            self.store.close()
        result = {'state': state, 'run_folder': str(self.store.path), 'trials': self.store.count,
                  'reason': reason, 'cleanup_errors': cleanup_errors}
        if error is not None:
            result['error'] = f'{type(error).__name__}: {error}'
        return result
