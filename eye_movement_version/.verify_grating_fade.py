"""Check actual GPU pixels across grating/slit edges at several fade levels."""
from pathlib import Path
import numpy as np
from run_experiment import load_config
from intuition_eye.runtime import PsychoPyDisplay
from intuition_eye.window_geometry import selected_window_size
from intuition_eye.render import _layout

root = Path(__file__).resolve().parent
background = np.array([248, 250, 252], dtype=float)
bar_color = np.array([100, 116, 139], dtype=float)
patterns = [('g1', 3.464102, 3.014102, 0), ('g2', 1.732051, 1.282051, 0),
            ('g3', 1.154701, .704701, 0), ('dense', .08, .04, 0),
            ('offset', 1.154701, .704701, .17)]
checks = 0
for percent in (80, 100):
    config = load_config()
    config['window']['size'] = list(selected_window_size(percent))
    config['audio']['enabled'] = False
    display = PsychoPyDisplay(config, lambda event: None)
    try:
        for unit, name, period, width, offset in [('E4', *p) for p in patterns] + [('E5', 'slit', 1, 1, 0)]:
            descriptor = {'grating_period_m': period, 'bar_width_m': width,
                          'grating_offset_m': offset, 'rod_length_m': 4, 'bob_radius_m': .08,
                          'slit_left_m': -.2, 'slit_right_m': .2}
            layout = _layout(unit, descriptor)
            renderer = display.renderer
            ppm = layout['px_per_m']
            for alpha in (1, .6, .25, 0):
                display.flip({'unit': unit, 'phase': 'motion', 'alpha': alpha,
                              'theta_rad': .4, 'descriptor': descriptor}, lambda stamp: None)
                display.window.getMovieFrame(buffer='front')
                image = display.window.movieFrames.pop()
                image.save(root / f'.smoke-{unit.lower()}-{name}-fade-{alpha}-{percent}.png')
                pixels = np.asarray(image.convert('RGB'), dtype=float)
                logical_x = (np.arange(image.width) + .5 - renderer.frame_left) / renderer.scale
                inside = (logical_x >= 0) & (logical_x < 1000)
                world_x = (logical_x - 500) / ppm
                if unit == 'E4':
                    distance = np.abs((world_x - offset + period / 2) % period - period / 2)
                    occluded = distance < width / 2
                    edge_guard = 1 if name == 'dense' else 3
                    away_from_edge = np.abs(distance - width / 2) * ppm * renderer.scale > edge_guard
                else:
                    occluded = (world_x < -.2) | (world_x > .2)
                    away_from_edge = np.minimum(np.abs(world_x + .2), np.abs(world_x - .2)) * ppm * renderer.scale > 3
                away_from_canvas_edge = np.minimum(np.abs(logical_x), np.abs(logical_x - 1000)) * renderer.scale > 3
                expected = np.tile(background, (image.width, 1))
                expected[inside & occluded] = alpha * bar_color + (1 - alpha) * background
                # Sample above the trajectory so guide dashes do not affect the colors.
                row = round(renderer.frame_top + 110 * renderer.scale)
                errors = np.max(np.abs(pixels[row] - expected), axis=1)
                valid = away_from_edge & away_from_canvas_edge
                assert valid.any(), (percent, name, 'no sample pixels')
                assert np.all(errors[valid] <= 2), (percent, unit, name, alpha, float(errors[valid].max()))
                checks += 1
            print(percent, unit, name, 'passed: full, 60%, 25%, invisible')
    finally:
        display.close()
print(checks, 'native frame checks passed')
