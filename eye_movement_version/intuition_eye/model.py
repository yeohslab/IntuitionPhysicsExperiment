"""Validated, offline session contract. This module never opens a display/tracker."""
from __future__ import annotations

import json
import math
from pathlib import Path
from collections import Counter
from uuid import UUID

VARIANTS = {
    'training-1': ('1.0.0', 'speedColorTrainingStimulus', 44, 0),
    'experiment-2': ('2.0.0', 'pendulumStimulus', 159, 150),
    'experiment-4-v2': ('2.0.0', 'trackingPendulumV2Stimulus', 108, 96),
    'experiment-5-v3': ('3.0.0', 'bellReachabilityV3Stimulus', 40, 36),
}
CONTROL_TYPES = {'textDisplay', 'textControl', 'training1Summary', 'protocol2PendulumDemo'}


def finite_tree(value, location='session'):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f'Non-finite number: {location}')
    if isinstance(value, dict):
        for key, child in value.items():
            finite_tree(child, f'{location}.{key}')
    elif isinstance(value, list):
        for i, child in enumerate(value):
            finite_tree(child, f'{location}[{i}]')


def iter_units(session):
    for item in session['stimulus_set']['sequence']:
        if item['kind'] == 'rest':
            for unit in item['units']:
                yield item, None, unit
        else:
            for trial in item['children']:
                for unit in trial['units']:
                    yield item, trial, unit


def physics_index(session):
    return {entry['unit_id']: entry for entry in session['physics']}


def validate_session(session):
    finite_tree(session)
    if session.get('eye_session_schema_version') != 1:
        raise ValueError('Unsupported eye_session_schema_version (expected 1)')
    variant = session.get('runtime_variant_id')
    if variant not in VARIANTS:
        raise ValueError(f'Unsupported runtime_variant_id: {variant}')
    version, expected_type, expected_count, formal_count = VARIANTS[variant]
    if session.get('protocol_version') != version:
        raise ValueError(f'{variant} requires protocol {version}')
    UUID(session['session_id'])
    if not isinstance(session['rng_seed'], int) or not 0 <= session['rng_seed'] < 2**32:
        raise ValueError('rng_seed must be uint32')
    participant = session['participant']
    if not isinstance(participant.get('subject_id'), str) or not participant['subject_id'].strip():
        raise ValueError('subject_id must be nonempty')
    if participant.get('gender_code') not in (0, 1) or not 1 <= participant['age_years'] <= 120:
        raise ValueError('Invalid participant gender/age')
    if not isinstance(session['provenance'], dict) or not session['provenance']:
        raise ValueError('Missing provenance')
    if not isinstance(session['protocol_settings'], dict):
        raise ValueError('Missing protocol_settings')
    seen_ids, task_units = set(), {}
    for item, trial, unit in iter_units(session):
        if item['kind'] not in ('rest', 'practice', 'block'):
            raise ValueError('Unknown sequence kind')
        if unit['id'] in seen_ids:
            raise ValueError(f'Duplicate unit id: {unit["id"]}')
        seen_ids.add(unit['id'])
        typ = unit['type']
        if typ not in CONTROL_TYPES | {expected_type}:
            raise ValueError(f'Unsupported unit type for {variant}: {typ}')
        if typ == 'textDisplay' and (not isinstance(unit['durationMs'], (int, float)) or unit['durationMs'] < 0):
            raise ValueError('Invalid text duration')
        if typ == expected_type:
            if trial is None:
                raise ValueError('Task unit outside a trial')
            task_units[unit['id']] = unit
            if typ == 'speedColorTrainingStimulus':
                if not 0 <= unit['targetStripPosition'] <= 1 or unit['linearSpeedMPerSec'] < 0 or unit['trackRightXM'] <= unit['trackLeftXM']:
                    raise ValueError('Invalid training geometry/speed')
            else:
                if unit['rodLengthM'] <= 0 or unit['gravity'] <= 0:
                    raise ValueError('Invalid physical parameters')
                if typ == 'pendulumStimulus':
                    if unit['show1T'] <= 0 or unit['hide1T'] < 0 or unit.get('fadeMs', 0) < 0:
                        raise ValueError('Invalid E2 timing')
                elif not 0 <= unit['blankStartSec'] < unit['queryTimeSec']:
                    raise ValueError('Invalid blank/query ordering')
    if len(task_units) != expected_count:
        raise ValueError(f'{variant}: expected {expected_count} task templates, got {len(task_units)}')
    descriptors = session['trial_descriptors']
    if len(descriptors) != expected_count or len({d['unit_id'] for d in descriptors}) != expected_count:
        raise ValueError('Missing or duplicate descriptors')
    if {d['unit_id'] for d in descriptors} != set(task_units):
        raise ValueError('Descriptor/unit ids differ')
    indices = [d['formal_trial_index'] for d in descriptors if d.get('formal_trial_index') is not None]
    if len(indices) != formal_count or len(set(indices)) != formal_count:
        raise ValueError('Formal count/indices differ from protocol')
    if formal_count and sorted(indices) != list(range(1, formal_count + 1)):
        raise ValueError('Formal indices must be continuous and one-based')
    if variant == 'training-1':
        counts = Counter(u['trainingSegment'] for u in task_units.values())
        if counts != Counter({'guided_1': 8, 'guided_2': 8, 'guided_3': 8, 'assessment_1': 6, 'remediation': 8, 'assessment_2': 6}):
            raise ValueError(f'Training segments differ from protocol: {counts}')
    entries = session['physics']
    p_index = physics_index(session)
    if len(p_index) != len(entries):
        raise ValueError('Duplicate physics id')
    required = {u['id'] for _, _, u in iter_units(session) if u['type'] not in ('textDisplay', 'textControl', 'training1Summary', 'speedColorTrainingStimulus')}
    if set(p_index) != required:
        raise ValueError('Physics/unit ids differ')
    for entry in entries:
        p, a = entry['params'], entry['analysis']
        if p['rodLengthM'] <= 0 or p['gravity'] <= 0 or a['T'] <= 0 or a['E'] < 0:
            raise ValueError('Invalid physics analysis')
        if a['regime'] not in ('oscillation', 'rotation', 'critical'):
            raise ValueError('Unknown physical regime')
        if a['regime'] != 'rotation' and not 0 <= a['kOsc'] < 1:
            raise ValueError('Unsupported oscillation modulus')
    if not isinstance(session.get('behavior_columns'), list):
        raise ValueError('Missing behavior_columns')
    return session


def load_session(path):
    with Path(path).open(encoding='utf-8') as stream:
        return validate_session(json.load(stream))


def training_motion(unit, t):
    if unit['loopMode'] == 'stationary' or unit['linearSpeedMPerSec'] <= 1e-12:
        return unit['initialXM'], 'stationary'
    left, right = unit['trackLeftXM'], unit['trackRightXM']
    span = right - left
    x = (unit['linearSpeedMPerSec'] * max(0, t)) % (2 * span)
    if abs(x - span) <= 1e-10:
        return right, 'leftward'
    if abs(x) <= 1e-10:
        return left, 'rightward'
    return (left + x, 'rightward') if x < span else (right - (x - span), 'leftward')


def mastery(errors):
    valid = [v for v in errors if isinstance(v, (int, float)) and math.isfinite(v) and v >= 0][:6]
    mean = sum(valid) / len(valid) if valid else None
    within = sum(v <= .25 for v in valid)
    return {'completed': len(valid) == 6, 'mean_absolute_error': mean, 'within_threshold': within,
            'passed': len(valid) == 6 and mean <= .15 and within >= 5}


def angular_delta(estimate_rad, truth_rad, rotation=False):
    delta = math.degrees(estimate_rad - truth_rad)
    if rotation:
        wrapped = ((delta + 180) % 360) - 180
        return 180.0 if wrapped == -180 else wrapped  # Browser range: (-180, 180].
    return delta
