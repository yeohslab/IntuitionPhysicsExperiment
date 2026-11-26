"""Exercise participant input through the real scoring and durable output path."""
import csv
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from intuition_eye.render import frame_geometry
from intuition_eye.runtime import Audio, ExperimentRuntime, HeadlessDisplay, StopRun
from intuition_eye.storage import RunStore
from intuition_eye.tracker import make_tracker


class InputDisplay(HeadlessDisplay):
    def __init__(self, config, scene, descriptor, *, angle=None, strip=None, key=None, stop_after=None):
        super().__init__(config)
        self.scene, self.descriptor = scene, descriptor
        self.angle, self.strip, self.key = angle, strip, key
        self.response_at = None
        self.key_sent = False
        self.e5_start = self.feedback_at = None
        self.stop_after = stop_after
        self.time = 123.0  # A trial does not start at the session clock's zero.
        self.trial_start = self.time

    def flip(self, state, callback):
        stamp = super().flip(state, callback)
        if state.get('phase') == 'estimate' and self.response_at is None:
            self.response_at = stamp
        if self.e5_start is None and state.get('phase') == 'motion':
            self.e5_start = stamp
        if state.get('phase') == 'feedback' and self.feedback_at is None:
            self.feedback_at = stamp
        if stamp > self.trial_start + 10:
            raise AssertionError('input loop did not terminate')
        return stamp

    def pointer(self):
        if self.response_at is None or not (self.interval * .5 < self.now() - self.response_at < self.interval * 1.5):
            return (0., 0., False)
        g = frame_geometry({'unit': self.scene, 'descriptor': self.descriptor})
        if self.strip is not None:
            from intuition_eye.render import speed_strip_bounds
            bounds = speed_strip_bounds(self.scene, self.descriptor)
            if bounds is None:
                x, y = 150 + 700 * self.strip, 520
            else:
                left, right, top, bottom = bounds
                x = left + (right - left) * self.strip
                y = (top + bottom) / 2
        else:
            x = g['anchor_x'] + 100 * math.sin(self.angle)
            y = g['anchor_y'] + 100 * math.cos(self.angle)
        return (g['canvas_left'] + x * g['scale'], g['canvas_top'] + y * g['scale'], True)

    def keys(self):
        anchor = self.e5_start if self.key else self.response_at
        if self.stop_after is not None and anchor is not None and self.now() >= anchor + self.stop_after:
            raise StopRun('test_interrupt')
        if self.feedback_at is not None and self.now() >= self.feedback_at + .35:
            return [('space', self.now())]
        due = (self.e5_start is not None and self.now() >= self.e5_start + .2) if self.key else (
            self.response_at is not None and self.now() >= self.response_at + .1)
        if due and not self.key_sent:
            self.key_sent = True
            return [(self.key or 'space', self.now())]
        return []


class ResponseParityTests(unittest.TestCase):
    def run_response(self, scene, *, angle=None, strip=None, key=None, correct='reachable',
                     regime='oscillation', practice=False, stop_after=None, truth_deg=None, guided_skipped=False):
        config = {'window': {'size': [1000, 760]}, 'log_frames': False, 'tracker': {'drift_check': False},
                  'headless': {'refresh_hz': 60, 'response_delay_sec': .1, 'e5_rt_sec': .1},
                  'timing': {'drop_frame_multiplier': 1.5, 'max_frame_gap_ms': 50}}
        variant = {'training': 'training-1', 'E2': 'experiment-2', 'E4': 'experiment-4-v2', 'E5': 'experiment-5-v3'}[scene]
        session = {'physics': [], 'protocol_settings': {}, 'experiment_id': variant, 'protocol_version': 'test',
                   'participant': {'subject_id': 'test', 'gender_code': 0, 'age_years': 20}, 'runtime_variant_id': variant,
                   'session_id': 'test-session', 'behavior_columns': []}
        descriptor = {'report_target': 'speed' if strip is not None else 'angle',
                      'unit_id': 'task', 'trial_id': 'trial',
                      'segment_kind': 'practice' if practice else 'block', 'window_size': [1000, 760],
                      'pendulum_regime': regime, 'w_max_deg': 179., 'speed_scale_linear_m_per_sec': 2.0}
        unit = {'id': 'task', 'show1T': .1, 'hide1T': .1, 'fadeMs': 0,
                'queryTimeSec': .3, 'blankStartSec': .15, 'correctResponse': correct,
                'yesKey': 'f', 'noKey': 'j', 'reportDelaySec': 4., 'firstTraversalDurationSec': 4.,
                'targetStripPosition': .4, 'feedbackShown': practice,
                'loopMode': 'ping_pong', 'linearSpeedMPerSec': 2., 'trackLeftXM': -4.,
                'trackRightXM': 4., 'initialXM': -4., 'mode': 'assessment'}
        session['trial_descriptors'] = [descriptor]
        trial = {'id': 'trial', 'units': [unit]}
        truth_angle = math.radians(truth_deg if truth_deg is not None else (-179 if regime == 'rotation' else 10))
        pendulum = SimpleNamespace(analysis={'T': 1., 'regime': regime},
                                   params={'rodLengthM': 4.},
                                   at=lambda t: (truth_angle, 1.0))
        with tempfile.TemporaryDirectory() as root:
            r = ExperimentRuntime(session, config, headless=True)
            r.auto = False
            r.display = InputDisplay(config, scene, descriptor, angle=angle, strip=strip, key=key, stop_after=stop_after)
            r.store = RunStore(root, session, config, 'dummy')
            r.audio = Audio({'enabled': False}, lambda event: r.event(event))
            r.tracker = make_tracker('dummy', {}, r.event)
            r.tracker.setup(None, r.display.size)
            r.guided_skipped = guided_skipped
            try:
                d = r.begin_trial({'kind': 'practice' if practice else 'block'}, trial, unit)
                try:
                    r.stimulus(unit, d, pendulum)
                    r.finish_trial()
                except StopRun as exc:
                    r.finish_trial('interrupted', str(exc))
                folder = r.store.path
                r.store.close()
                with (folder / 'behavior.csv').open(encoding='utf-8-sig', newline='') as stream:
                    csv_row = next(csv.DictReader(stream))
                with (folder / 'trials.jsonl').open(encoding='utf-8') as stream:
                    json_row = json.loads(stream.readline())
                return csv_row, json_row
            finally:
                r.store.close()

    def assert_number(self, rows, name, expected):
        for row in rows:
            self.assertAlmostEqual(float(row[name]), expected, places=6, msg=name)

    def test_training_report_duration(self):
        rows = self.run_response('training', strip=.7)
        self.assert_number(rows, 'speed_strip_position', .7)
        self.assert_number(rows, 'delta_strip_position', .3)
        for row in rows:
            self.assertAlmostEqual(float(row['rt_total_sec']), float(row['psychopy_confirmation_sec']) - float(row['psychopy_response_onset_sec']))
            self.assertGreater(float(row['rt_total_sec']), 0)

    def test_feedback_wait_is_excluded_from_rt_and_fields_survive_csv(self):
        for scene in ('training', 'E2', 'E4', 'E5'):
            with self.subTest(scene=scene):
                rows = self.run_response(scene, key='f' if scene == 'E5' else None,
                                         strip=.7 if scene != 'E5' else None, practice=True)
                csv_row, row = rows
                self.assertLess(row['rt_total_sec'], .3)
                self.assertAlmostEqual(row['rt_total_sec'], row['psychopy_confirmation_sec'] - row['psychopy_response_onset_sec'])
                self.assertGreater(row['psychopy_trial_end_sec'] - row['psychopy_confirmation_sec'], .3)
                self.assertTrue(row['feedback_shown'])
                self.assertTrue(row['feedback_presented'])
                self.assertFalse(set(row) - set(csv_row), 'CSV silently dropped fields')
                if scene == 'training':
                    self.assert_number(rows, 'report_available_at_sec', 4.)
                    self.assert_number(rows, 'first_traversal_duration_sec', 4.)
                    self.assertLess(row['rt_speed_sec'], row['rt_total_sec'])
                    self.assertGreater(row['psychopy_trial_end_sec'] - row['psychopy_motion_onset_sec'], 6.)

    def test_unconfirmed_input_is_saved_without_fabricating_confirmation_rt(self):
        csv_row, row = self.run_response('training', strip=.7, stop_after=.05)
        self.assertEqual(row['trial_status'], 'interrupted')
        self.assertEqual(csv_row['rt_total_sec'], '')
        self.assertIsNone(row['rt_total_sec'])
        self.assertIsNone(row['psychopy_confirmation_sec'])
        self.assert_number((csv_row, row), 'speed_strip_position', .7)
        self.assertGreater(row['rt_speed_sec'], 0)

    def test_e5_interruption_is_not_a_wrong_answer(self):
        csv_row, row = self.run_response('E5', key='f', stop_after=.1)
        self.assertEqual(row['trial_status'], 'interrupted')
        for field in ('response_key', 'response_judgment', 'correct', 'rt_sec', 'rt_total_sec'):
            self.assertIsNone(row[field], field)
            self.assertEqual(csv_row[field], '', field)

    def test_assessment_after_skipping_guided_is_not_marked_skipped(self):
        _, row = self.run_response('training', strip=.7, guided_skipped=True)
        self.assertFalse(row['feedback_phase_skipped'])
        self.assertFalse(row['feedback_shown'])
        self.assertFalse(row['feedback_presented'])
        self.assertEqual(row['assessment_attempt'], 1)

    def test_e2_half_turn_uses_positive_180_boundary(self):
        rows = self.run_response('E2', angle=math.pi, truth_deg=0., regime='rotation')
        self.assert_number(rows, 'delta_theta_deg', 180.)

    def test_e2_wraps_wide_oscillation_angle_error(self):
        rows = self.run_response('E2', angle=math.radians(170), truth_deg=-170.)
        self.assert_number(rows, 'delta_theta_deg', -20.)

    def test_e4_speed_preserves_unclamped_physical_truth(self):
        rows = self.run_response('E4', strip=.25)
        self.assert_number(rows, 'linear_speed_q_m_per_sec', 4.)
        self.assert_number(rows, 'linear_speed_reported_m_per_sec', .5)
        self.assert_number(rows, 'delta_linear_speed_m_per_sec', -3.5)

    def test_e4_angle_nonzero_error(self):
        rows = self.run_response('E4', angle=math.radians(30))
        self.assert_number(rows, 'theta_reported_deg', 30.)
        self.assert_number(rows, 'delta_theta_deg', 20.)

    def test_e2_rotation_wraps_angle_error(self):
        rows = self.run_response('E2', angle=math.radians(179), regime='rotation')
        self.assert_number(rows, 'delta_theta_deg', -2.)
        self.assert_number(rows, 'abs_delta_theta_deg', 2.)

    def test_e5_both_keys_and_wrong_answers(self):
        for key, truth, judgment in [('f', 'unreachable', 'reachable'), ('j', 'reachable', 'unreachable')]:
            with self.subTest(key=key):
                csv_row, json_row = self.run_response('E5', key=key, correct=truth)
                for row in (csv_row, json_row):
                    self.assertEqual(row['response_key'], key)
                    self.assertEqual(row['response_judgment'], judgment)
                    self.assertIn(row['correct'], (False, 'False'))
                    self.assertGreater(float(row['rt_sec']), 0)


if __name__ == '__main__':
    unittest.main()
