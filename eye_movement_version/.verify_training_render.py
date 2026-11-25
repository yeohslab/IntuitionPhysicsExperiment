"""One-off native-render acceptance checks; run with the project venv."""
import json
from pathlib import Path
import numpy as np
from run_experiment import load_config
from intuition_eye.runtime import PsychoPyDisplay
from intuition_eye.window_geometry import selected_window_size
from intuition_eye.render import hit_confirm, hit_skip

root = Path(__file__).resolve().parent
results = []
for percent in (80, 100):
    cfg = load_config()
    cfg['window']['size'] = list(selected_window_size(percent))
    cfg['audio']['enabled'] = False
    display = PsychoPyDisplay(cfg, lambda event: None)
    try:
        window = display.window
        display.flip({'text': '说明文字测试', 'phase': 'instructions'}, lambda stamp: None)
        display.flip({'text': '+', 'phase': 'fixation'}, lambda stamp: None)
        window.getMovieFrame(buffer='front')
        image = window.movieFrames.pop()
        path = root / f'.smoke-fixation-{percent}.png'
        image.save(path)
        pixels = np.asarray(image.convert('RGB'))
        yy, xx = np.where(np.all(pixels < 80, axis=2))
        assert len(xx), 'Fixation cross is missing'
        bbox = [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
        center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
        expected = [image.width / 2, image.height / 2]
        assert all(abs(a - b) <= 1.5 for a, b in zip(center, expected)), (center, expected)
        state = {'unit': 'training', 'phase': 'estimate', 'response_mode': 'speed',
                 'show_skip': True, 'linear_x_m': .8, 'selected': .4, 'truth': .5}
        display.flip(state, lambda stamp: None)
        window.getMovieFrame(buffer='front')
        estimate = window.movieFrames.pop()
        estimate.save(root / f'.smoke-training-estimate-{percent}.png')
        r = display.renderer
        pixels = np.asarray(estimate.convert('RGB'))
        lower = pixels[int(r.frame_top + 675 * r.scale):int(r.frame_top + 735 * r.scale)]
        for color in ((37, 99, 235), (100, 116, 139)):
            count = int(np.all(lower == color, axis=2).sum())
            assert count == 0, (percent, color, count)
        controls = []
        for lx, hit in ((130, hit_skip), (870, hit_confirm)):
            x = (lx - 500) * r.scale
            y = (380 - 705) * r.scale
            left, top = round(r.frame_left + (lx - 110) * r.scale), round(r.frame_top + 675 * r.scale)
            right, bottom = round(r.frame_left + (lx + 110) * r.scale), round(r.frame_top + 735 * r.scale)
            crop = pixels[top:bottom, left:right]
            cy, cx = np.where(np.all(crop < 80, axis=2))
            assert len(cx), 'Control text is missing'
            ink_center = [left + (cx.min() + cx.max() + 1) / 2, top + (cy.min() + cy.max() + 1) / 2]
            assert hit(*ink_center, 'training', {'window_size': display.size}), ink_center
            display.mouse.setPos((x, y))
            window.winHandle.dispatch_events()
            px, py, _ = display.pointer()
            assert hit(px, py, 'training', {'window_size': display.size}), (px, py)
            controls.append({'ink_center': [float(v) for v in ink_center], 'pointer': [float(px), float(py)]})
        display.flip({**state, 'phase': 'feedback'}, lambda stamp: None)
        window.getMovieFrame(buffer='front')
        window.movieFrames.pop().save(root / f'.smoke-training-feedback-{percent}.png')
        results.append({'percent': percent, 'size': list(display.size), 'fixation_bbox': bbox,
                        'fixation_center': center, 'expected_center': expected, 'controls': controls})
    finally:
        display.close()
print(json.dumps(results, ensure_ascii=False, indent=2))
