import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from intuition_eye.model import load_session, mastery, training_motion, validate_session
from intuition_eye.physics import Pendulum
from intuition_eye.storage import RunStore


class SessionTests(unittest.TestCase):
    def test_generated_sessions_and_rejection(self):
        for name in ('training-1', 'experiment-2', 'experiment-4-v2', 'experiment-5-v3'):
            path = ROOT / 'sessions' / f'fresh-{name}.json'
            if not path.exists():
                self.skipTest('Generate fresh sessions before integration tests')
            session = load_session(path)
            broken = copy.deepcopy(session)
            broken['trial_descriptors'].pop()
            with self.assertRaises(ValueError):
                validate_session(broken)
            broken = copy.deepcopy(session)
            broken['rng_seed'] = -1
            with self.assertRaises(ValueError):
                validate_session(broken)

    def test_mastery_boundary(self):
        self.assertTrue(mastery([.15]*6)['passed'])
        self.assertFalse(mastery([.25,.25,.25,.25,.26,0])['passed'])
        self.assertFalse(mastery([0]*5)['passed'])

    def test_training_ping_pong(self):
        unit = {'loopMode':'ping_pong','linearSpeedMPerSec':2,'trackLeftXM':-4,'trackRightXM':4,'initialXM':-4}
        self.assertEqual(training_motion(unit, 0), (-4, 'rightward'))
        self.assertEqual(training_motion(unit, 4), (4, 'leftward'))
        self.assertEqual(training_motion(unit, 6), (0, 'leftward'))

    def test_cross_language_physics(self):
        path = ROOT / 'tests' / 'physics-parity-fixtures.json'
        if not path.exists():
            self.skipTest('Generate fixtures before integration tests')
        try:
            import scipy  # noqa
        except ImportError:
            self.skipTest('scipy unavailable')
        for fixture in json.loads(path.read_text(encoding='utf-8'))['fixtures']:
            model = Pendulum(fixture)
            for sample in fixture['samples']:
                theta, omega = model.at(sample['t_sec'])
                self.assertAlmostEqual(theta, sample['theta'], delta=1e-7, msg=fixture['name'])
                self.assertAlmostEqual(omega, sample['omega'], delta=1e-7, msg=fixture['name'])

    def test_persistent_store(self):
        session = {'runtime_variant_id':'experiment-2','participant':{'subject_id':'E2-0001'},'session_id':'test','behavior_columns':['trial_id']}
        with tempfile.TemporaryDirectory() as root:
            store = RunStore(root, session, {}, 'dummy')
            store.trial({'trial_id':'a','presentation_id':'b','trial_status':'complete'})
            store.status('completed')
            folder = store.path
            store.close()
            self.assertEqual(json.loads((folder/'status.json').read_text(encoding='utf8'))['state'], 'completed')
            self.assertEqual(json.loads((folder/'trials.jsonl').read_text(encoding='utf8'))['trial_id'], 'a')
            self.assertFalse((folder/'recording.edf').exists())

if __name__ == '__main__':
    unittest.main()
