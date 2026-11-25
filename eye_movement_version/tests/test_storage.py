import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from intuition_eye.storage import RunStore, archive_name


class RunStoreArchiveTests(unittest.TestCase):
    def make_session(self, subject='E2-0001', experiment='experiment-2'):
        return {
            'runtime_variant_id': experiment,
            'experiment_id': experiment,
            'participant': {'subject_id': subject},
            'session_id': f'{subject}-{experiment}',
            'behavior_columns': ['trial_id'],
        }

    def test_new_runs_are_archived_by_subject_then_experiment(self):
        with tempfile.TemporaryDirectory() as root:
            store = RunStore(root, self.make_session(), {}, 'dummy')
            try:
                self.assertEqual(store.path.parent.parent, Path(root).resolve() / 'E2-0001')
                self.assertEqual(store.path.parent.name, 'experiment-2')
                self.assertEqual(store.path.parent.parent.name, 'E2-0001')
                self.assertTrue(store.path.is_dir())
            finally:
                store.close()

    def test_runtime_variant_is_the_experiment_archive_key(self):
        with tempfile.TemporaryDirectory() as root:
            session = self.make_session('E4-0001', 'experiment-4-v2')
            session['experiment_id'] = 'experiment-4'
            store = RunStore(root, session, {}, 'dummy')
            try:
                self.assertEqual(store.path.parent.name, 'experiment-4-v2')
            finally:
                store.close()

    def test_existing_root_records_are_preserved_and_runs_remain_unique(self):
        with tempfile.TemporaryDirectory() as root:
            legacy = Path(root) / 'legacy-run'
            legacy.mkdir()
            marker = legacy / 'session.json'
            marker.write_text('{"legacy":true}\n', encoding='utf-8')
            session = self.make_session()
            first = RunStore(root, session, {}, 'dummy')
            second = RunStore(root, session, {}, 'dummy')
            try:
                self.assertNotEqual(first.path, second.path)
                self.assertEqual(marker.read_text(encoding='utf-8'), '{"legacy":true}\n')
                self.assertTrue(first.path.is_dir())
                self.assertTrue(second.path.is_dir())
            finally:
                first.close()
                second.close()

    def test_unknown_csv_field_raises_and_jsonl_retains_the_record(self):
        with tempfile.TemporaryDirectory() as root:
            store = RunStore(root, self.make_session(), {}, 'dummy')
            row = {'trial_id': 'trial-1', 'new_response_field': .7}
            folder = store.path
            try:
                with self.assertRaisesRegex(ValueError, 'new_response_field'):
                    store.trial(row)
            finally:
                store.close()
            saved = (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines()
            self.assertEqual([json.loads(line) for line in saved], [row])

    def test_sanitized_ids_do_not_alias_archive_directories(self):
        self.assertNotEqual(archive_name('a/b'), archive_name('a_b'))
        self.assertNotEqual(archive_name('x' * 49), archive_name('x' * 48 + 'y'))

    def test_records_are_retained_in_archived_run(self):
        with tempfile.TemporaryDirectory() as root:
            store = RunStore(root, self.make_session('E2-0002'), {}, 'dummy')
            store.event({'event': 'before_trial'})
            store.frame({'frame': 1})
            store.trial({'trial_id': 'trial-1', 'presentation_id': 'p1', 'trial_status': 'complete'})
            folder = store.path
            store.close()
            events = [json.loads(line) for line in (folder / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
            frames = [json.loads(line) for line in (folder / 'frames.jsonl').read_text(encoding='utf-8').splitlines()]
            trials = [json.loads(line) for line in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertEqual([event['event'] for event in events], ['run_created', 'before_trial'])
            self.assertEqual(frames, [{'frame': 1}])
            self.assertEqual(trials, [{'trial_id': 'trial-1', 'presentation_id': 'p1', 'trial_status': 'complete'}])


if __name__ == '__main__':
    unittest.main()
