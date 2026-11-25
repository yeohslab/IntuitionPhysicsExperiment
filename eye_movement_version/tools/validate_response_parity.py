"""Rehearse all four protocols and verify durable CSV/JSONL response parity.

Run with the eye_movement_version virtual environment. Output contains synthetic
responses, is marked headless_completed, and is unsuitable for participant analysis.
"""
from __future__ import annotations

import csv
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from run_experiment import load_config
from intuition_eye.model import iter_units, load_session
from intuition_eye.runtime import ExperimentRuntime
from intuition_eye.session_generator import generate_session


def main():
    audit = ROOT / 'validation' / ('response-parity-' + uuid.uuid4().hex[:8])
    results = []
    cases = [('training-1', 0), ('experiment-2', 0), ('experiment-4-v2', 0),
             ('experiment-5-v3', 0), ('training-1', 2)]
    for variant, failures in cases:
        # Export from the working tree on every audit, just like GUI Start.
        # Archived sessions intentionally keep the protocol captured at creation.
        prefix = {'training-1': 'T1', 'experiment-2': 'E2',
                  'experiment-4-v2': 'E4', 'experiment-5-v3': 'E5'}[variant]
        session_path = generate_session(
            {'experiment': variant, 'subject': prefix + '-9999', 'gender': 0, 'age': 20},
            seed=20261121, sessions_root=audit / 'sessions')
        session = load_session(session_path)
        config = load_config()
        config['output_dir'] = str(audit)
        config['log_frames'] = False
        config['headless']['assessment_failures'] = failures
        if variant == 'experiment-5-v3':
            config['headless']['e5_rt_sec'] = max(
                u.get('queryTimeSec', 0) for _, _, u in iter_units(session)) + .2
        runtime = ExperimentRuntime(session, config, headless=True)
        runtime.run()
        folder = runtime.store.path
        status = json.loads((folder / 'status.json').read_text(encoding='utf-8'))
        assert status['state'] == 'headless_completed', status
        rows = [json.loads(line) for line in (folder / 'trials.jsonl').read_text(encoding='utf-8').splitlines()]
        with (folder / 'behavior.csv').open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            columns = set(reader.fieldnames)
            csv_rows = list(reader)
        expected = 58 if failures else {
            'training-1': 30, 'experiment-2': 159, 'experiment-4-v2': 108, 'experiment-5-v3': 40}[variant]
        assert len(rows) == len(csv_rows) == expected, (variant, len(rows), expected)
        for row, csv_row in zip(rows, csv_rows):
            assert not set(row) - columns, set(row) - columns
            assert row['trial_status'] == 'completed'
            assert row['timing_valid'] is False
            delta = row['psychopy_confirmation_sec'] - row['psychopy_response_onset_sec']
            assert abs(row['rt_total_sec'] - delta) < 1e-9
            assert abs(float(csv_row['rt_total_sec']) - delta) < 1e-9
            if variant != 'experiment-5-v3':
                assert .099 <= delta <= .118, (variant, delta)
            if variant == 'training-1':
                assert row['report_available_at_sec'] == 4
                assert row['feedback_shown'] == row['feedback_presented']
        result = {'variant': variant, 'assessment_failures': failures, 'presentations': len(rows),
                  'columns': len(columns), 'run_dir': str(folder), 'status': 'passed'}
        if variant == 'training-1':
            result['assessment_counts'] = {
                str(a): sum(r['assessment_attempt'] == a for r in rows) for a in range(1, failures + 2)}
            assert all(n == 6 for n in result['assessment_counts'].values())
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    summary = audit / 'audit-summary.json'
    summary.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print('AUDIT_SUMMARY', summary)


if __name__ == '__main__':
    main()
