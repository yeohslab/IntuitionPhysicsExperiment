"""Exclusive run folders, durable trial records and recoverable incremental streams."""
from __future__ import annotations
import csv
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

EXTRA_COLUMNS = [
    'experiment_id', 'protocol_version', 'data_schema_version',
    'session_id', 'presentation_id', 'presentation_index', 'template_trial_id', 'loop_index',
    'window_size', 'speed_color_strips', 'speed_bar_v_max_m_per_sec',
    'tracker_mode', 'runtime_variant_id', 'trial_status', 'interruption_reason', 'timing_valid',
    'psychopy_trial_start_sec', 'psychopy_motion_onset_sec', 'psychopy_cue_onset_sec',
    'psychopy_cue_offset_sec', 'psychopy_blank_onset_sec', 'psychopy_response_onset_sec',
    'psychopy_response_event_sec', 'psychopy_confirmation_sec', 'psychopy_trial_end_sec',
    'psychopy_clock', 'keyboard_backend', 'sim_frame_count', 'sim_max_frame_gap_ms',
    'dropped_frame_count', 'actual_last_visible_frame_sec', 'actual_visible_segment_frame_counts',
    'visibility_pause_count', 'visibility_pause_sec', 'rt_total_sec', 'rt_angle_sec', 'rt_speed_sec',
    'report_available_at_sec', 'first_traversal_duration_sec', 'feedback_shown', 'feedback_available', 'feedback_presented',
    'assessment_attempt', 'feedback_phase_skipped', 'speed_strip_position', 'speed_strip_truth_position',
    'delta_strip_position', 'abs_delta_strip_position', 'speed_reported_m_per_sec',
    'theta_reported_deg', 'theta_reported_rad', 'linear_speed_reported_m_per_sec',
    'linear_speed_q_m_per_sec', 'delta_linear_speed_m_per_sec', 'abs_delta_linear_speed_m_per_sec',
    'response_judgment', 'response_key', 'correct', 'rt_sec', 'timed_out',
    'theta_estimated_deg', 'theta_estimated_rad', 'delta_theta_deg', 'abs_delta_theta_deg',
    'delta_theta_rad', 'abs_delta_theta_rad', 'rt_estimate_sec', 'sim_end_overshoot_ms',
    'sim_elapsed_actual_sec', 'motion_elapsed_at_confirmation_sec',
]


def safe_name(value):
    return re.sub(r'[^A-Za-z0-9_-]', '_', str(value))[:48] or 'subject'


def archive_name(value):
    """Return a filesystem-safe archive component without aliasing IDs.

    Normal GUI IDs stay readable (for example ``E2-0001``). Values that need
    sanitizing or truncation receive a short digest so two distinct raw IDs
    cannot silently share a subject or experiment directory.
    """
    raw = str(value)
    clean = safe_name(raw)
    if raw == clean and len(raw) <= 48:
        return clean
    digest = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:10]
    base = re.sub(r'[^A-Za-z0-9_-]', '_', raw)[:37].rstrip('_-') or 'value'
    return f'{base}_{digest}'


def json_text(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def atomic_json(path, value):
    path = Path(path)
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def software_versions():
    packages = {}
    for name in ('PsychoPy', 'numpy', 'scipy', 'sr-research-pylink', 'psychopy-eyelink-coregraphics', 'psychtoolbox'):
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    return {'python': sys.version, 'platform': platform.platform(), 'packages': packages}


class RunStore:
    def __init__(self, root, session, config, tracker_mode):
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
        subject_id = session['participant']['subject_id']
        # runtime_variant_id is the archival experiment key: different
        # protocol/runtime variants must remain isolated even if they share a
        # human-facing experiment_id.
        experiment_id = session['runtime_variant_id']
        archive_root = Path(root).resolve()
        # New runs are grouped by participant and experiment. The final run
        # directory retains the legacy readable name and remains exclusive.
        archive_dir = archive_root / archive_name(subject_id) / archive_name(experiment_id)
        archive_dir.mkdir(parents=True, exist_ok=True)
        self.path = archive_dir / f'{session["runtime_variant_id"]}_{safe_name(subject_id)}_{stamp}_{uuid4().hex[:10]}'
        self.path.mkdir(parents=False, exist_ok=False)
        self.session, self.mode, self.count = session, tracker_mode, 0
        self._streams = {}
        self._closed = False
        self._status = {'state': 'starting', 'completed_trials': 0, 'session_id': session['session_id'], 'tracker_mode': tracker_mode,
                        'created_at': datetime.now(timezone.utc).isoformat(), 'run_folder': str(self.path)}
        atomic_json(self.path / 'session.json', session)
        atomic_json(self.path / 'config.json', config)
        atomic_json(self.path / 'software.json', software_versions())
        # Preserve the browser's column order, then all descriptor/participant
        # fields and native response metadata, including sessions exported earlier.
        descriptor_columns = [key for row in session.get('trial_descriptors', []) for key in row]
        self.columns = list(dict.fromkeys(session.get('behavior_columns', []) +
                                         list(session['participant']) + descriptor_columns + EXTRA_COLUMNS))
        self._csv = (self.path / 'behavior.csv').open('x', encoding='utf-8-sig', newline='')
        self._writer = csv.DictWriter(self._csv, fieldnames=self.columns, extrasaction='raise')
        self._writer.writeheader()
        self._csv.flush()
        self.status('starting')
        self.event({'event': 'run_created', 'manifest_sha256': hashlib.sha256(json_text(session).encode('utf-8')).hexdigest()})

    def _append(self, name, record):
        if name not in self._streams:
            self._streams[name] = (self.path / name).open('x', encoding='utf-8', newline='\n', buffering=1)
        self._streams[name].write(json_text(record) + '\n')

    def event(self, record):
        self._append('events.jsonl', {'local_perf_counter_sec': time.perf_counter(), **record})

    def frame(self, record):
        self._append('frames.jsonl', record)

    def trial(self, row):
        self._append('trials.jsonl', row)
        formatted = {k: json_text(v) if isinstance(v, (list, dict)) else ('' if v is None else v) for k, v in row.items()}
        self._writer.writerow(formatted)
        self.count += 1
        self.flush()
        self.status('running', completed_trials=self.count, last_presentation_id=row.get('presentation_id'), last_trial_status=row.get('trial_status'))

    def status(self, state, **fields):
        self._status.update(state=state, updated_at=datetime.now(timezone.utc).isoformat(), **fields)
        atomic_json(self.path / 'status.json', self._status)

    def flush(self):
        for stream in [self._csv, *self._streams.values()]:
            stream.flush()
            os.fsync(stream.fileno())

    def close(self):
        if self._closed:
            return
        self.flush()
        for stream in [self._csv, *self._streams.values()]:
            stream.close()
        self._closed = True
