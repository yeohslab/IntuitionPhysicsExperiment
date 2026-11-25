"""Focus interruptions must be durable and restart timing from a fresh presentation."""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intuition_eye.runtime import ExperimentRuntime, HeadlessDisplay, PsychoPyDisplay


def config(root):
    return {
        'output_dir': root,
        'window': {'size': [1000, 760], 'fullscreen': False, 'screen': 0},
        'audio': {'enabled': False},
        'tracker': {'drift_check': False},
        'headless': {'refresh_hz': 60},
        'timing': {'expected_refresh_hz': 60, 'max_frame_gap_ms': 100,
                   'drop_frame_multiplier': 1.5},
        'log_frames': True,
    }


def session(training=False, rest=False):
    variant = 'training-1' if training else 'experiment-2'
    tasks = [{'id': f'task-{i}', 'type': 'speedColorTrainingStimulus'} for i in range(2)]
    trials = [{'id': f'trial-{i}', 'units': [
        {'id': f'fix-{i}', 'type': 'textDisplay', 'text': '+', 'durationMs': 50}, task,
    ]} for i, task in enumerate(tasks)]
    items = [{'id': 'block', 'kind': 'block', 'children': trials}]
    if rest:
        items.insert(0, {'id': 'rest', 'kind': 'rest', 'units': [
            {'id': 'rest-text', 'type': 'textDisplay', 'text': 'Rest', 'durationMs': 50},
        ]})
    return {
        'session_id': 'focus-test', 'runtime_variant_id': variant, 'experiment_id': variant,
        'protocol_version': '1.0.0', 'participant': {'subject_id': 'focus-test'},
        'trial_descriptors': [{'unit_id': task['id']} for task in tasks],
        'physics': [], 'stimulus_set': {'sequence': items},
    }


class FocusDisplay(HeadlessDisplay):
    """A real-runtime display substitute with a virtual clock and focus events."""
    focus_armed = False
    focused = True
    focus_loss_reason = None

    def __init__(self, cfg, runtime, phase, presentation=2, brief=False, escape=False):
        super().__init__(cfg)
        self.runtime, self.target = runtime, phase
        self.target_presentation, self.brief, self.escape = presentation, brief, escape
        self.triggered = False
        self.pause_frames = 0
        self.pause_snapshots = []
        self.phases = []
        self.last_phase = None
        self.clear_count = 0

    def poll_events(self):
        pass

    def flip(self, state, callback):
        phase = state.get('phase')
        self.last_phase = phase
        self.phases.append(phase)
        if phase == 'focus_pause':
            self.pause_frames += 1
            # Simulate a long stay in another app without real test sleeps.
            self.time += 10
            folder = self.runtime.store.path
            self.pause_snapshots.append({
                'active': self.runtime.active,
                'trials': [json.loads(line) for line in
                           (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines()]
                          if (folder / 'trials.jsonl').exists() else [],
                'status': json.loads((folder / 'status.json').read_text(encoding='utf-8')),
            })
            if self.pause_frames >= 3:
                self.focused = True
        result = super().flip(state, callback)
        index = self.runtime.active['presentation_index'] if self.runtime.active else None
        if (not self.triggered and self.focus_armed and phase == self.target
                and index == self.target_presentation):
            self.triggered = True
            self.focus_loss_reason = 'window_deactivated'
            self.focused = self.brief
        return result

    def keys(self):
        if self.escape and self.pause_frames:
            return [('escape', self.now())]
        if self.last_phase == 'instructions':
            return [('space', self.now())]
        return []

    def clear(self):
        self.clear_count += 1


class ScriptedRuntime(ExperimentRuntime):
    """Exercise trial/control lifecycle without requiring the PsychoPy SDK."""
    def sequence(self):
        for item in self.session['stimulus_set']['sequence']:
            self.item(item)

    def stimulus(self, task, descriptor, pendulum):
        for phase in ('cue', 'motion', 'response', 'feedback'):
            for i in range(3):
                state = {'text': phase, 'phase': phase}
                if phase == 'motion':
                    state['motion_elapsed'] = i / 60
                self.flip(state)
                self.keys()
            if phase == 'response':
                self.score('speed', .4, .5, None, self.display.now(), self.display.now())
        self.flip({'text': '', 'phase': 'trial_end'}, ['TRIAL_END'])


class FocusRuntimeTests(unittest.TestCase):
    def run_focus(self, root, phase, *, training=False, rest=False, **options):
        runtime = ScriptedRuntime(session(training=training, rest=rest), config(root))
        display = FocusDisplay(runtime.config, runtime, phase, **options)
        with patch('intuition_eye.runtime.PsychoPyDisplay', return_value=display):
            result = runtime.run()
        folder = Path(result['run_folder'])
        trials_path = folder / 'trials.jsonl'
        trials = ([json.loads(line) for line in trials_path.read_text(encoding='utf-8').splitlines()]
                  if trials_path.exists() else [])
        events = [json.loads(line) for line in (folder / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
        return runtime, display, result, trials, events

    def test_loss_in_each_trial_phase_is_saved_before_pause_and_repeated(self):
        for phase in ('fixation', 'cue', 'motion', 'response', 'feedback'):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as root:
                runtime, display, result, rows, events = self.run_focus(root, phase)
                self.assertEqual(result['state'], 'completed', result)
                self.assertEqual([r['trial_status'] for r in rows], ['completed', 'interrupted', 'completed'])
                self.assertEqual([r['presentation_id'] for r in rows], ['p00001', 'p00002', 'p00003'])
                self.assertEqual(rows[1]['template_trial_id'], rows[2]['template_trial_id'])
                self.assertFalse(rows[1]['timing_valid'])
                self.assertTrue(rows[2]['timing_valid'])
                self.assertEqual(rows[1]['interruption_reason'], 'window_deactivated')
                self.assertEqual(rows[1]['visibility_pause_count'], 1)
                # This scripted stimulus emits no report/confirmation markers;
                # trial lifetime must never be substituted for a response RT.
                self.assertIsNone(rows[1]['rt_total_sec'])
                self.assertIsNone(rows[2]['rt_total_sec'])
                self.assertEqual(display.pause_frames, 3)
                for snapshot in display.pause_snapshots:
                    self.assertIsNone(snapshot['active'])
                    self.assertEqual(snapshot['trials'], rows[:2])
                    self.assertEqual(snapshot['status']['state'], 'paused')
                pauses = [e for e in events if e['event'] == 'focus_pause_end']
                self.assertEqual(len(pauses), 1)
                self.assertTrue(pauses[0]['resumed'])
                self.assertGreater(pauses[0]['duration_sec'], 30)
                self.assertEqual(pauses[0]['interrupted_presentation_id'], 'p00002')
                stopped = [e['result'] for e in events if e['event'] == 'stop_trial']
                self.assertEqual(stopped, [0, 1, 0])
                with (Path(result['run_folder']) / 'behavior.csv').open(encoding='utf-8-sig', newline='') as stream:
                    self.assertEqual(len(list(csv.DictReader(stream))), 3)
                frames = [json.loads(line) for line in (Path(result['run_folder']) / 'frames.jsonl')
                          .read_text(encoding='utf-8').splitlines()]
                self.assertTrue(all((f['frame_gap_sec'] or 0) < 1 for f in frames))
                self.assertIsNone(runtime.active)

    def test_brief_loss_and_regain_still_invalidates_presentation(self):
        with tempfile.TemporaryDirectory() as root:
            _, display, result, rows, _ = self.run_focus(root, 'motion', brief=True)
            self.assertEqual(result['state'], 'completed')
            self.assertEqual(display.pause_frames, 1)
            self.assertEqual(rows[1]['trial_status'], 'interrupted')
            self.assertEqual(rows[2]['trial_status'], 'completed')
            self.assertIsNone(display.focus_loss_reason)

    def test_escape_during_pause_preserves_all_existing_trials(self):
        with tempfile.TemporaryDirectory() as root:
            _, display, result, rows, events = self.run_focus(root, 'motion', escape=True)
            self.assertEqual(result['state'], 'interrupted', result)
            self.assertEqual(result['reason'], 'escape')
            self.assertEqual([r['trial_status'] for r in rows], ['completed', 'interrupted'])
            self.assertEqual(display.pause_frames, 1)
            self.assertFalse(next(e for e in events if e['event'] == 'focus_pause_end')['resumed'])
            status = json.loads((Path(result['run_folder']) / 'status.json').read_text(encoding='utf-8'))
            self.assertEqual(status['completed_trials'], 2)
            self.assertEqual(status['state'], 'interrupted')

    def test_rest_without_active_trial_restarts_after_focus_returns(self):
        with tempfile.TemporaryDirectory() as root:
            _, display, result, rows, _ = self.run_focus(root, 'fixation', rest=True, presentation=None)
            self.assertEqual(result['state'], 'completed', result)
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(r['trial_status'] == 'completed' for r in rows))
            self.assertTrue(all(s['active'] is None and not s['trials'] for s in display.pause_snapshots))
            self.assertGreaterEqual(display.phases.count('fixation'), 3)

    def test_feedback_interruption_does_not_count_assessment_twice(self):
        with tempfile.TemporaryDirectory() as root:
            runtime, _, result, rows, _ = self.run_focus(root, 'feedback', training=True)
            self.assertEqual(result['state'], 'completed', result)
            self.assertEqual(len(rows), 3)
            self.assertEqual(len(runtime.assessment_errors), 2)
            self.assertTrue(all(abs(error - .1) < 1e-9 for error in runtime.assessment_errors))


class FocusDisplayTests(unittest.TestCase):
    def test_fixation_uses_centered_renderer_and_keeps_flip_callback(self):
        display = PsychoPyDisplay.__new__(PsychoPyDisplay)
        display.renderer = Mock()
        display.core = SimpleNamespace(monotonicClock=SimpleNamespace(getTime=lambda: 12.5))
        display.window = Mock()
        display.window.callOnFlip.side_effect = lambda callback: callback()
        callback = Mock()
        self.assertEqual(display.flip({'text': '+', 'phase': 'fixation'}, callback), 12.5)
        display.renderer.draw_fixation.assert_called_once_with('+')
        display.renderer.draw_text.assert_not_called()
        display.window.flip.assert_called_once()
        callback.assert_called_once_with(12.5)

    def test_callbacks_require_visible_active_window_and_latch_brief_loss(self):
        handle = SimpleNamespace(_has_focus=True, push_handlers=Mock(), dispatch_events=Mock())
        window = SimpleNamespace(size=(1000, 760), frameBufferSize=(1000, 760),
                                 clientSize=(1000, 760), viewport=(0, 0, 1000, 760),
                                 winHandle=handle, getContentScaleFactor=lambda: 1, close=Mock())
        psychopy = SimpleNamespace(
            prefs=SimpleNamespace(hardware={}),
            core=SimpleNamespace(monotonicClock=SimpleNamespace(getTime=lambda: 1)),
            event=SimpleNamespace(Mouse=Mock()), visual=SimpleNamespace(Window=lambda **kwargs: window),
        )
        events = []
        with patch.dict(sys.modules, {'psychopy': psychopy}), patch('intuition_eye.render.SceneRenderer'):
            display = PsychoPyDisplay(config('unused'), events.append)
        handlers = handle.push_handlers.call_args.kwargs
        display.focus_armed = True
        handlers['on_deactivate']()
        handlers['on_activate']()
        self.assertTrue(display.focused)
        self.assertEqual(display.focus_loss_reason, 'window_deactivated')
        display.focus_loss_reason = None
        handlers['on_hide']()
        handlers['on_activate']()
        self.assertFalse(display.focused)
        self.assertEqual(display.focus_loss_reason, 'window_hidden')
        handlers['on_show']()
        self.assertTrue(display.focused)
        display.poll_events()
        handle.dispatch_events.assert_called_once()
        self.assertEqual(sum(e['event'] == 'display_focus_lost' for e in events), 2)
        display.close()


if __name__ == '__main__':
    unittest.main()
