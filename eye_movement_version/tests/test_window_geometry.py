import copy
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import run_experiment
from intuition_eye.window_geometry import (
    DEFAULT_WINDOW_PERCENT, WINDOW_ASPECT, WINDOW_PERCENTAGES, WindowArea,
    area_in_client_coordinates, window_size_for_percent,
)


class WindowGeometryTests(unittest.TestCase):
    def test_all_percentages_preserve_frame_and_fit_decorated_work_area(self):
        # Includes non-primary screens, taskbars on every edge, and portrait.
        for screen, work in (
            ((0, 0, 1920, 1080), (0, 0, 1920, 1040)),
            ((-2560, 0, 0, 1440), (-2500, 0, 0, 1440)),
            ((1920, -400, 3000, 1520), (1920, -360, 2960, 1520)),
            ((0, 0, 1366, 768), (0, 32, 1366, 768)),
        ):
            area = WindowArea(screen, work, (8, 31, 8, 8))
            previous = [0, 0]
            full_size = window_size_for_percent(100, area)
            for percent in WINDOW_PERCENTAGES:
                with self.subTest(screen=screen, percent=percent):
                    width, height = window_size_for_percent(percent, area)
                    self.assertGreater(width, previous[0])
                    self.assertGreater(height, previous[1])
                    previous = [width, height]
                    # Independently rounded client dimensions deviate by <1px.
                    self.assertLess(abs(height - width * WINDOW_ASPECT[1] / WINDOW_ASPECT[0]), 1)
                    # PsychoPy integer-truncates its centered location.
                    x = int(screen[0] + (screen[2] - screen[0] - width) / 2)
                    y = int(screen[1] + (screen[3] - screen[1] - height) / 2)
                    self.assertGreaterEqual(x - 8, work[0])
                    self.assertGreaterEqual(y - 31, work[1])
                    self.assertLessEqual(x + width + 8, work[2])
                    self.assertLessEqual(y + height + 8, work[3])
                    self.assertLessEqual(abs(width - full_size[0] * percent / 100), 1)
                    self.assertLessEqual(abs(height - full_size[1] * percent / 100), 1)

    def test_measured_native_coordinates_do_not_assume_hidpi_multiplier(self):
        logical = WindowArea((0, 0, 1920, 1080), (0, 0, 1920, 1040), (8, 31, 8, 8))
        for native_per_client in (1, 1.25, 1.5, 2):
            def native(values):
                return tuple(v * native_per_client for v in values)
            area = area_in_client_coordinates(
                native(logical.screen), native(logical.work),
                native((92, 69, 358, 298)), native((0, 0, 250, 190)),
                native((100, 100)), (250, 190))
            self.assertEqual(area, logical)
            self.assertEqual(window_size_for_percent(80, area),
                             window_size_for_percent(80, logical))

    def test_invalid_or_tiny_area_is_rejected(self):
        area = WindowArea((0, 0, 1920, 1080), (0, 0, 1920, 1040), (8, 31, 8, 8))
        for percent in (0, 49, 55, 110, True, '80%'):
            with self.assertRaises(ValueError):
                window_size_for_percent(percent, area)
        for invalid in (
            WindowArea((0, 0, 100, 100), (0, 0, 100, 100), (8, 31, 8, 8)),
            WindowArea((0, 0, 1000, 760), (0, 0, 2000, 760), (8, 31, 8, 8)),
            WindowArea((0, 0, float('nan'), 760), (0, 0, 1000, 760), (8, 31, 8, 8)),
        ):
            with self.assertRaises(ValueError):
                window_size_for_percent(100, invalid)
        self.assertEqual(DEFAULT_WINDOW_PERCENT, 80)


class LauncherConfigTests(unittest.TestCase):
    def run_mock_runtime(self, args, gui_selection=None):
        runtime = Mock()
        runtime.return_value.run.return_value = {'state': 'completed'}
        module = types.ModuleType('intuition_eye.runtime')
        module.ExperimentRuntime = runtime
        session = {'runtime_variant_id': 'training-1'}
        with patch.dict(sys.modules, {'intuition_eye.runtime': module}), \
                patch.object(run_experiment, 'load_session', return_value=session), \
                patch.object(run_experiment, 'select_gui', return_value=gui_selection), \
                patch('builtins.print'):
            self.assertEqual(run_experiment.main(args), 0)
        return runtime.call_args.args[1]

    def test_gui_passes_size_and_preserves_bordered_window_mode(self):
        base = run_experiment.load_config()
        base['window']['fullscreen'] = True
        untouched = copy.deepcopy(base)
        with patch.object(run_experiment, 'load_config', side_effect=lambda _: copy.deepcopy(base)):
            actual = self.run_mock_runtime([], {
                'tracker': 'dummy', 'session': Path('generated.json'),
                'window_size': [1003, 762], 'window_percent': 80,
            })
        self.assertEqual(actual['window']['size'], [1003, 762])
        self.assertFalse(actual['window']['fullscreen'])
        self.assertEqual(actual['window']['launcher_percent'], 80)
        self.assertEqual(base, untouched)

    def test_cli_explicit_window_configuration_remains_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            custom = Path(temp) / 'custom.json'
            custom.write_text(json.dumps({'window': {'size': [1280, 900], 'fullscreen': True}}), encoding='utf-8')
            actual = self.run_mock_runtime(['--session', 'existing.json', '--config', str(custom)])
        self.assertEqual(actual['window']['size'], [1280, 900])
        self.assertTrue(actual['window']['fullscreen'])
        self.assertNotIn('launcher_percent', actual['window'])

    def test_cli_generated_session_keeps_default_window_configuration(self):
        with patch('intuition_eye.session_generator.generate_session', return_value=Path('generated.json')) as generator:
            actual = self.run_mock_runtime(['--experiment', 'training-1', '--subject', '1',
                                           '--gender', '0', '--age', '25'])
        self.assertEqual(actual['window'], run_experiment.load_config()['window'])
        self.assertNotIn('window_size', generator.call_args.args[0])


class LauncherDropdownTests(unittest.TestCase):
    def setUp(self):
        try:
            import tkinter as tk
            self.root = tk.Tk()
            self.root.withdraw()
        except Exception as exc:
            self.skipTest(f'Tk display unavailable: {exc}')

    def tearDown(self):
        try:
            self.root.destroy()
        except Exception:
            pass

    def widgets(self, parent):
        for child in parent.winfo_children():
            yield child
            yield from self.widgets(child)

    def prepare_start(self):
        widgets = list(self.widgets(self.root))
        entries = [w for w in widgets if w.winfo_class() == 'TEntry']
        entries[0].insert(0, '1')
        entries[1].insert(0, '25')
        gender = next(w for w in widgets if w.winfo_class() == 'TCombobox' and '0 · 男' in w['values'])
        gender.current(0)
        gender.event_generate('<<ComboboxSelected>>')
        percentage = next(w for w in widgets if w.winfo_class() == 'TCombobox' and '80%' in w['values'])
        self.assertEqual(str(percentage['state']), 'readonly')
        self.assertEqual(percentage['values'], ('50%', '60%', '70%', '80%', '90%', '100%'))
        self.assertEqual(percentage.get(), '80%')
        return percentage, next(w for w in widgets if w.winfo_class() == 'Button' and w['text'] == '开始实验  →')

    def test_readonly_dropdown_default_and_selection_are_passed_to_start(self):
        from intuition_eye.launcher_gui import select_gui
        generated = Mock(return_value=Path('new-session.json'))

        def interact():
            percentage, start = self.prepare_start()
            percentage.set('100%')
            start.invoke()

        with patch('tkinter.Tk', return_value=self.root), \
                patch.object(self.root, 'mainloop', side_effect=interact), \
                patch('intuition_eye.launcher_gui.selected_window_size', return_value=[1200, 912]) as measure, \
                patch('tkinter.messagebox.showerror') as showerror:
            selection = select_gui(data_root='missing-history', on_start=generated, screen_index=1)
        showerror.assert_not_called()
        measure.assert_called_once_with(100, 1)
        self.assertEqual(selection['window_size'], [1200, 912])
        self.assertEqual(selection['session'], Path('new-session.json'))
        self.assertEqual(generated.call_args.args[0]['window_percent'], 100)

    def test_measurement_failure_keeps_launcher_open_without_generating_session(self):
        from intuition_eye.launcher_gui import select_gui
        generated = Mock()

        def interact():
            _, start = self.prepare_start()
            start.invoke()
            self.assertEqual(self.root.winfo_exists(), 1)
            self.assertEqual(str(start['state']), 'normal')
            self.root.destroy()

        with patch('tkinter.Tk', return_value=self.root), \
                patch.object(self.root, 'mainloop', side_effect=interact), \
                patch('intuition_eye.launcher_gui.selected_window_size', side_effect=RuntimeError('no work area')), \
                patch('tkinter.messagebox.showerror') as showerror:
            self.assertIsNone(select_gui(data_root='missing-history', on_start=generated))
        generated.assert_not_called()
        showerror.assert_called_once()


if __name__ == '__main__':
    unittest.main()
