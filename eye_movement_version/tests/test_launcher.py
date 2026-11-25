import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intuition_eye.launcher_gui import normalize_subject, validate_selection, history_summary
from intuition_eye.session_generator import generate_session
from intuition_eye.model import load_session


class LauncherTests(unittest.TestCase):
    def test_subjects_and_validation(self):
        for variant, prefix in [('training-1', 'T1'), ('experiment-2', 'E2'), ('experiment-4-v2', 'E4'), ('experiment-5-v3', 'E5')]:
            self.assertEqual(normalize_subject(variant, '1'), prefix + '-0001')
            self.assertEqual(normalize_subject(variant, prefix + '-9999'), prefix + '-9999')
        for value in ('0', '10000', '../1', 'E2-0001'):
            with self.assertRaises(ValueError):
                normalize_subject('training-1', value)
        for age in ('0', '121', '2.5', ''):
            with self.assertRaises(ValueError):
                validate_selection('training-1', '1', '0', age, 'dummy')
        with self.assertRaises(ValueError):
            validate_selection('training-1', '1', '0', '20', 'other')

    def test_generation_is_unique_and_valid(self):
        selection = validate_selection('training-1', '9999', 0, 25, 'dummy')
        with tempfile.TemporaryDirectory() as temp:
            first = generate_session(selection, seed=37, sessions_root=temp)
            second = generate_session(selection, seed=37, sessions_root=temp)
            self.assertNotEqual(first, second)
            self.assertEqual(first.parent, Path(temp) / 'T1-9999' / 'training-1')
            self.assertEqual(load_session(first)['participant']['subject_id'], 'T1-9999')
            self.assertTrue(second.is_file())
            self.assertEqual(list(first.parent.glob('*.tmp')), [])

    def test_missing_generator_does_not_create_archive(self):
        with tempfile.TemporaryDirectory() as temp, patch('intuition_eye.session_generator.shutil.which', return_value=None):
            with self.assertRaises(RuntimeError):
                generate_session(validate_selection('training-1', '1', 0, 25, 'dummy'), sessions_root=temp)
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_empty_history(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertIn('暂无', history_summary(temp, 'T1-0001'))


if __name__ == '__main__':
    unittest.main()
