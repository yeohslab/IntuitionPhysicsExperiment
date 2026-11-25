"""Native-window smoke checks for E2, E4 V2 and E5 V3 scenes."""
from pathlib import Path
from run_experiment import load_config
from intuition_eye.runtime import PsychoPyDisplay
from intuition_eye.window_geometry import selected_window_size

root = Path(__file__).resolve().parent
config = load_config()
config['window']['size'] = list(selected_window_size(80))
config['audio']['enabled'] = False
display = PsychoPyDisplay(config, lambda event: None)
try:
    cases = [
        ('e2-motion', {'unit':'E2', 'phase':'motion', 'theta_rad':.35, 'alpha':1, 'omega_rad_sec':1.1,
                       'descriptor':{'speed_cue_type':'color-strips', 'speed_color_strips':True, 'w_max_deg':60}}),
        ('e2-blank', {'unit':'E2', 'phase':'blank', 'theta_rad':.35, 'alpha':0, 'omega_rad_sec':1.1,
                      'descriptor':{'speed_cue_type':'color-strips', 'speed_color_strips':True, 'w_max_deg':60}}),
        ('e2-estimate', {'unit':'E2', 'phase':'estimate', 'selected':None, 'response_mode':'angle', 'descriptor':{'w_max_deg':60}}),
        ('e4-motion', {'unit':'E4', 'phase':'motion', 'theta_rad':.35, 'alpha':1, 'descriptor':{'amplitude_deg':45}}),
        ('e4-estimate', {'unit':'E4', 'phase':'estimate', 'selected':None, 'response_mode':'angle', 'descriptor':{}}),
        ('e4-feedback', {'unit':'E4', 'phase':'feedback', 'selected':.4, 'truth':.2, 'response_mode':'angle', 'descriptor':{}}),
        ('e5-motion', {'unit':'E5', 'phase':'motion', 'theta_rad':.35, 'alpha':1, 'footer':'可以到达：按 F；不可以到达：按 J。运动开始后即可作答。', 'descriptor':{'slit_left_m':-.2, 'slit_right_m':.2, 'amplitude_deg':45, 'bell_theta_deg':-30}}),
        ('e5-replay', {'unit':'E5', 'phase':'feedback', 'replay':True, 'theta_rad':.35, 'alpha':1, 'footer':'正确。铃铛可以到达；重看完整运动，按空格继续。', 'descriptor':{'slit_left_m':-.2, 'slit_right_m':.2, 'amplitude_deg':45, 'bell_theta_deg':-30}}),
        ('e5-judgment', {'unit':'E5', 'phase':'blank', 'alpha':0, 'footer':'可以到达：按 F；不可以到达：按 J。运动开始后即可作答。'}),
        ('e4-speed-feedback', {'unit':'E4', 'phase':'feedback', 'selected':.4, 'truth':.2, 'response_mode':'speed', 'footer':'练习反馈：橙色为您的选择，蓝色为真实速度。按空格继续。'}),
        ('e4-after-speed', {'unit':'E4', 'phase':'motion', 'theta_rad':.35, 'alpha':1, 'descriptor':{'amplitude_deg':45}}),
    ]
    for name, state in cases:
        display.flip(state, lambda stamp: None)
        display.window.getMovieFrame(buffer='front')
        image = display.window.movieFrames.pop()
        image.save(root / ('.smoke-' + name + '.png'))
        print(name, image.size)
finally:
    display.close()
