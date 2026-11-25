"""Protocol boundary regressions, using the actual stimulus loop and a virtual display."""
import math
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from intuition_eye.runtime import Audio, ExperimentRuntime, HeadlessDisplay
from intuition_eye.physics import scene_alpha


class TraceDisplay(HeadlessDisplay):
    def __init__(self, config):
        super().__init__(config)
        self.states = []

    def flip(self, state, callback):
        stamp = super().flip(state, callback)
        self.states.append((stamp, dict(state)))
        return stamp


class TimingTests(unittest.TestCase):
    def trace(self, scene, *, e5_rt=2.0, practice=False, feedback=False, blank=.7, report='angle'):
        cfg = {'window': {'size': [1000, 760]}, 'log_frames': False,
               'headless': {'refresh_hz': 60, 'response_delay_sec': .1, 'e5_rt_sec': e5_rt},
               'timing': {'drop_frame_multiplier': 1.5}}
        session = {'trial_descriptors': [], 'physics': [], 'protocol_settings': {}}
        r = ExperimentRuntime(session, cfg, headless=True)
        r.display = TraceDisplay(cfg)
        r.store = Mock()
        r.scene, r.visible_segments = scene, []
        r.active = {'sim_frame_count': 0, 'sim_max_frame_gap_ms': 0., 'dropped_frame_count': 0}
        events = []
        r.store.event.side_effect = events.append
        r.audio = Audio({'enabled': False}, lambda event: r.event({'clock_sec': r.display.now(), **event}))
        u = {'show1T': 1.2, 'hide1T': .7, 'fadeMs': 500,
             'queryTimeSec': blank + .7, 'blankStartSec': blank, 'correctResponse': 'reachable',
             'reportDelaySec': 4., 'targetStripPosition': .4, 'feedbackShown': feedback,
             'loopMode': 'ping_pong', 'linearSpeedMPerSec': 2., 'trackLeftXM': -4.,
             'trackRightXM': 4., 'initialXM': -4., 'mode': 'assessment'}
        d = {'report_target': report, 'segment_kind': 'practice' if practice else 'block',
             'speed_scale_linear_m_per_sec': 6.260990336999411}
        p = SimpleNamespace(analysis={'T': 2., 'regime': 'oscillation'},
                            params={'rodLengthM': 4}, at=lambda t: (math.sin(t), math.cos(t)))
        r.stimulus(u, d, p)
        return r, events

    def event_time(self, events, name):
        values = [e['clock_sec'] for e in events if e['event'] == name]
        self.assertEqual(len(values), 1, (name, values))
        return values[0]

    def test_each_experiment_audio_and_visibility_boundaries(self):
        for scene, fade_start, blank, end in [('training', None, None, 4.),
                                               ('E2', 2.4, 2.9, 3.6),
                                               ('E4', .4, .7, 1.4),
                                               ('E5', .4, .7, 1.4)]:
            with self.subTest(scene=scene):
                r, events = self.trace(scene)
                onset = self.event_time(events, 'MOTION_ONSET')
                cue = self.event_time(events, 'audio_response_cue')
                self.assertAlmostEqual(cue - onset, end, delta=1 / 60 + 1e-8)
                if fade_start is None:
                    self.assertFalse(any(e['event'] == 'audio_mask_on' for e in events))
                    response = [s for _, s in r.display.states if s.get('phase') == 'estimate']
                    self.assertTrue(response)
                    self.assertTrue(all(s['alpha'] == 1 for s in response))
                    self.assertGreater(response[-1]['motion_elapsed'], 4.)
                else:
                    self.assertAlmostEqual(self.event_time(events, 'audio_mask_on') - onset,
                                           fade_start, delta=1 / 60 + 1e-8)
                    self.assertEqual(self.event_time(events, 'audio_mask_off'), cue)
                    self.assertAlmostEqual(self.event_time(events, 'BLANK_ONSET') - onset,
                                           blank, delta=1 / 60 + 1e-8)
                    self.assertTrue(all(s['alpha'] == 0 for _, s in r.display.states
                                        if s.get('phase') in ('blank', 'estimate')))

    def test_e5_early_response_does_not_force_boundary_or_mask(self):
        r, events = self.trace('E5', e5_rt=.05)
        self.assertFalse(any(e['event'] in ('audio_mask_on', 'audio_response_cue', 'QUERY_END') for e in events))
        self.assertLess(r.active['rt_sec'], .1)

    def test_e5_response_during_mask_stops_it_without_boundary_ping(self):
        r, events = self.trace('E5', e5_rt=.9)
        self.assertTrue(any(e['event'] == 'audio_mask_on' for e in events))
        self.assertFalse(any(e['event'] in ('audio_response_cue', 'QUERY_END') for e in events))
        self.assertFalse(r.audio.active)

    def test_feedback_rules(self):
        r, events = self.trace('training', feedback=True)
        feedback = self.event_time(events, 'FEEDBACK_ONSET')
        self.assertAlmostEqual(self.event_time(events, 'TRIAL_END') - feedback, 2., delta=1 / 60 + 1e-8)
        onset = self.event_time(events, 'MOTION_ONSET')
        from intuition_eye.model import training_motion
        last_stamp, last = r.display.states[-2]
        self.assertAlmostEqual(last['linear_x_m'], training_motion(
            {'loopMode': 'ping_pong', 'linearSpeedMPerSec': 2., 'trackLeftXM': -4.,
             'trackRightXM': 4., 'initialXM': -4.}, last_stamp - onset)[0])
        r, events = self.trace('E2', practice=True)
        feedback = self.event_time(events, 'FEEDBACK_ONSET')
        self.assertGreaterEqual(self.event_time(events, 'TRIAL_END') - feedback, .3 - 1e-8)
        feedback_frames = [(t, s) for t, s in r.display.states if s.get('phase') == 'feedback']
        self.assertNotIn('按空格继续', feedback_frames[0][1]['footer'])
        self.assertIn('按空格继续', feedback_frames[-1][1]['footer'])
        self.assertTrue(all('按空格继续' not in s['footer'] for t, s in feedback_frames
                            if t - feedback < .3 - 1e-8))
        r, events = self.trace('E5', practice=True, e5_rt=.05)
        replay = [s for _, s in r.display.states if s.get('phase') == 'feedback']
        self.assertEqual(replay[0]['theta_rad'], 0.)
        self.assertTrue(all(s['alpha'] == 1 for s in replay))
        self.assertLess(replay[-1]['theta_rad'], math.sin(.2))  # Auto Space may end feedback before replay finishes.
        r, events = self.trace('E4', practice=True, report='speed')
        feedback = self.event_time(events, 'FEEDBACK_ONSET')
        self.assertGreaterEqual(self.event_time(events, 'TRIAL_END') - feedback, 1.4 - 1 / 60)
        frames = [s for _, s in r.display.states if s.get('phase') == 'feedback']
        self.assertTrue(frames[0]['replay'] and frames[0]['hide_choice'])
        self.assertIsNone(frames[0]['selected'])
        self.assertFalse(frames[-1]['hide_choice'])
        self.assertIsNotNone(frames[-1]['selected'])

    def test_short_fade_starts_fully_visible_and_finishes_at_blank(self):
        self.assertEqual(scene_alpha(0, .1), 1.)
        self.assertAlmostEqual(scene_alpha(.05, .1), .5)
        self.assertEqual(scene_alpha(.1, .1), 0.)
        self.assertEqual(scene_alpha(1., 2.), 1.)
        self.assertAlmostEqual(scene_alpha(1.85, 2.), .5)
        self.assertEqual(scene_alpha(2., 2.), 0.)

    def test_audio_samples_match_web_gain_and_exponential_ping(self):
        factory = Mock()
        with patch.dict(sys.modules, {'psychopy': SimpleNamespace(sound=SimpleNamespace(Sound=factory))}):
            Audio({'mask_file': ROOT / 'assets' / 'masked-hum.wav'}, lambda _: None)
        hum, ping = factory.call_args_list
        original, rate = sf.read(ROOT / 'assets' / 'masked-hum.wav', dtype='float32', always_2d=True)
        np.testing.assert_array_equal(hum.args[0], original * 1.5)
        self.assertEqual(hum.kwargs['sampleRate'], rate)
        self.assertEqual(hum.kwargs['loops'], -1)
        self.assertFalse(hum.kwargs['hamming'])
        samples = ping.args[0]
        self.assertEqual(len(samples), 3840)
        self.assertEqual(ping.kwargs['sampleRate'], 48000)
        self.assertFalse(ping.kwargs['hamming'])
        t = np.arange(3840) / 48000
        expected = np.sin(2 * np.pi * 880 * t) * np.power(.0001, np.minimum(t / .07, 1))
        np.testing.assert_allclose(samples, expected, atol=3e-8)
        self.assertLessEqual(np.max(np.abs(samples[3360:])), .00010001)


if __name__ == '__main__':
    unittest.main()
