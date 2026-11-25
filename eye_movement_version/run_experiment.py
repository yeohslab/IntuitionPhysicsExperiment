#!/usr/bin/env python3
"""Launch an exported eye-tracking session, validate it, or rehearse headlessly."""
from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from pathlib import Path

from intuition_eye.model import VARIANTS, load_session

ROOT = Path(__file__).resolve().parent


def merged(base, update):
    result = copy.deepcopy(base)
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merged(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def load_config(path=None):
    with (ROOT / 'config' / 'default.json').open(encoding='utf-8-sig') as stream:
        config = json.load(stream)
    source = None
    if path is not None:
        source = Path(path).resolve()
        with source.open(encoding='utf-8-sig') as stream:
            custom = json.load(stream)
        if not isinstance(custom, dict):
            raise ValueError('Configuration must be a JSON object')
        config = merged(config, custom)
    # Relative custom output and audio paths resolve beside that custom config;
    # inherited default paths always resolve beside this launcher.
    for group, field in ((None, 'output_dir'), ('audio', 'mask_file')):
        value = config[field] if group is None else config[group][field]
        base = ROOT
        if source is not None and (field in custom if group is None else field in custom.get(group, {})):
            base = source.parent
        resolved = str((base / value).resolve())
        if group is None:
            config[field] = resolved
        else:
            config[group][field] = resolved
    for group, name in (('timing', 'expected_refresh_hz'), ('timing', 'max_frame_gap_ms'),
                        ('timing', 'drop_frame_multiplier'), ('headless', 'refresh_hz')):
        value = config[group][name]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f'{group}.{name} must be a finite positive number')
    for name in ('response_delay_sec', 'e5_rt_sec'):
        value = config['headless'][name]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f'headless.{name} must be finite and nonnegative')
    if config['keyboard_backend'] not in ('event', 'ptb'):
        raise ValueError('keyboard_backend must be event or ptb')
    if not isinstance(config['flush_every_frames'], int) or config['flush_every_frames'] < 1:
        raise ValueError('flush_every_frames must be a positive integer')
    size = config['window']['size']
    if not isinstance(size, list) or len(size) != 2 or any(not isinstance(v, int) or v < 100 for v in size):
        raise ValueError('window.size must be [width, height] in pixels, both at least 100')
    return config


def select_gui():
    from intuition_eye.launcher_gui import select_gui as show_launcher
    from intuition_eye.session_generator import generate_session
    config = load_config()
    return show_launcher(config['output_dir'], on_start=generate_session,
                         screen_index=config['window']['screen'])


def parser():
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument('--session', type=Path, help='Exported session JSON')
    value.add_argument('--experiment', choices=tuple(VARIANTS), help='Generate a new participant session')
    value.add_argument('--subject', help='Participant sequence or prefixed ID')
    value.add_argument('--gender', choices=('0', '1'))
    value.add_argument('--age')
    value.add_argument('--seed', type=int)
    value.add_argument('--tracker', choices=('dummy', 'eyelink'), default='dummy')
    value.add_argument('--config', type=Path, help='JSON overrides; unspecified values inherit config/default.json')
    value.add_argument('--validate', action='store_true', help='Validate only; does not import PsychoPy or PyLink or create run data')
    value.add_argument('--headless', action='store_true', help='Virtual-clock, synthetic-response protocol rehearsal; dummy only')
    value.add_argument('--smoke-seconds', type=float, help='Display a timed graphical rehearsal with automatic responses; dummy only')
    return value


def main(argv=None):
    args_list = sys.argv[1:] if argv is None else argv
    arguments = parser()
    args = arguments.parse_args(args_list)
    selection = None
    gui_window_size = None
    gui_window_percent = None
    if not args_list:
        try:
            selection = select_gui()
        except Exception as exc:
            print(f'Cannot open experiment selection GUI: {exc}', file=sys.stderr)
            return 2
        if selection is None:
            return 0
        args.tracker = selection['tracker']
        args.session = selection['session']
        gui_window_size = selection['window_size']
        gui_window_percent = selection['window_percent']
        selection = None
    elif args.experiment is not None:
        if args.session is not None:
            arguments.error('--experiment and --session cannot be combined')
        if args.subject is None or args.gender is None or args.age is None:
            arguments.error('--experiment requires --subject, --gender and --age')
        from intuition_eye.launcher_gui import validate_selection
        try:
            selection = validate_selection(args.experiment, args.subject, args.gender, args.age, args.tracker)
        except ValueError as exc:
            arguments.error(str(exc))
    elif args.session is None:
        arguments.error('--session or --experiment is required unless launching with no arguments')
    if args.smoke_seconds is not None and (not math.isfinite(args.smoke_seconds) or args.smoke_seconds <= 0):
        arguments.error('--smoke-seconds must be finite and positive')
    if args.headless and args.smoke_seconds is not None:
        arguments.error('--headless and --smoke-seconds cannot be combined')
    if (args.headless or args.smoke_seconds is not None) and args.tracker != 'dummy':
        arguments.error('--headless and --smoke-seconds require --tracker dummy')
    try:
        config = load_config(args.config)
        if gui_window_size is not None:
            config['window']['size'] = list(gui_window_size)
            config['window']['fullscreen'] = False
            config['window']['launcher_percent'] = gui_window_percent
        if selection is not None:
            from intuition_eye.session_generator import generate_session
            args.session = generate_session(selection, seed=args.seed)
        session = load_session(args.session)
        if args.validate:
            summary = {'state': 'valid', 'variant': session['runtime_variant_id'], 'session_id': session['session_id'],
                       'protocol_version': session['protocol_version'],
                       'task_trials': len(session['trial_descriptors']),
                       'formal_trials': sum(d.get('formal_trial_index') is not None for d in session['trial_descriptors'])}
            print(json.dumps(summary, ensure_ascii=False))
            return 0
        from intuition_eye.runtime import ExperimentRuntime
        result = ExperimentRuntime(session, config, args.tracker, args.headless, args.smoke_seconds).run()
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['state'] in ('completed', 'headless_completed', 'smoke_completed') else (130 if result['state'] == 'interrupted' else 1)
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
