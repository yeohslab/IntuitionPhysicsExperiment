"""Regressions for scene composition and state carried between native trials."""
import math
import unittest

import test_geometry
from eye_movement_version.intuition_eye.render import BAR_FILL, ORANGE, _turbo, frame_geometry


class BrowserParityTests(unittest.TestCase):
    def renderer(self, size=(1219, 762)):
        return test_geometry.TrainingRenderTests().renderer(size)

    def test_speed_colors_match_browser_srgb_in_psychopy_rgb_space(self):
        # Browser Turbo endpoints are rgb(35 23 27) and rgb(144 13 0).
        for level, expected in ((0, (35, 23, 27)), (1, (144, 13, 0))):
            actual = tuple(round((channel + 1) * 127.5) for channel in _turbo(level))
            self.assertEqual(actual, expected)
        self.assertEqual(_turbo(-1), _turbo(0))
        self.assertEqual(_turbo(2), _turbo(1))

    def test_e2_initial_report_has_guide_but_no_selection_or_speed_cue(self):
        renderer = self.renderer()
        renderer.draw({'unit': 'E2', 'phase': 'estimate', 'selected': None,
                       'descriptor': {'w_max_deg': 60, 'speed_color_strips': True}})
        self.assertEqual(renderer.guide_dashes.drawn[-1]['colors'], ORANGE)
        self.assertFalse(renderer.estimate.drawn)
        self.assertFalse(renderer.bob.drawn)
        self.assertFalse(renderer.footer_top.drawn)
        self.assertFalse(renderer.footer_bottom.drawn)
        self.assertEqual(frame_geometry({'descriptor': {'speed_color_strips': True}})['anchor_y'],
                         frame_geometry({'descriptor': {'speed_cue_type': 'color-strips'}})['anchor_y'])

    def test_e4_initial_angle_report_hides_selected_rod(self):
        renderer = self.renderer()
        state = {'unit': 'E4', 'phase': 'estimate', 'response_mode': 'angle'}
        renderer.draw(state)
        self.assertTrue(renderer.guide_dashes.drawn)
        self.assertFalse(renderer.estimate.drawn)
        self.assertFalse(renderer.bob.drawn)
        renderer.draw({**state, 'selected': .4})
        self.assertEqual(len(renderer.estimate.drawn), 1)

    def test_e4_motion_uses_fixed_semicircle_including_diameter(self):
        renderer = self.renderer()
        renderer.draw({'unit': 'E4', 'phase': 'motion', 'descriptor': {'amplitude_deg': 45}})
        self.assertEqual(renderer._guide_cache[4:6], (90, True))
        # The horizontal dashed diameter is above the arc at the pivot's y.
        pivot_y = renderer.anchor.pos[1]
        self.assertTrue(any(abs(y - pivot_y) < 1e-8 and width > 0
                            for (x, y), (width, height) in
                            zip(renderer.guide_dashes.xys, renderer.guide_dashes.sizes)))

    def test_e4_speed_replay_keeps_bob_behind_translucent_grating(self):
        renderer = self.renderer()
        renderer.draw({'unit': 'E4', 'phase': 'feedback', 'replay': True, 'hide_choice': True,
                       'response_mode': 'speed', 'alpha': 0, 'theta_rad': .2,
                       'selected': .4, 'truth': .8,
                       'descriptor': {'grating_period_m': .4, 'bar_width_m': .1, 'bob_radius_m': .08}})
        self.assertTrue(renderer.bob.drawn)
        grating = [bar.drawn[0] for bar in renderer.bars if bar.drawn and bar.drawn[0]['opacity'] == 0.42]
        self.assertTrue(grating)
        self.assertEqual(grating[0]['fillColor'], BAR_FILL)
        self.assertAlmostEqual(renderer.fade_overlay.drawn[-1]['opacity'], 0.45)
        self.assertFalse(any(draw['lineColor'] == ORANGE for draw in renderer.marker.drawn))
        self.assertTrue(renderer.marker.drawn)

    def test_e4_grating_recovers_after_speed_report(self):
        renderer = self.renderer()
        renderer.draw({'unit': 'E4', 'phase': 'feedback', 'response_mode': 'speed',
                       'selected': .3, 'truth': .5})
        self.assertNotEqual(renderer.bars[0].fillColor, BAR_FILL)
        previous_counts = [len(bar.drawn) for bar in renderer.bars]
        renderer.draw({'unit': 'E4', 'phase': 'motion', 'descriptor': {'grating_period_m': .1}})
        drawn_bars = [bar for bar, count in zip(renderer.bars, previous_counts) if len(bar.drawn) > count]
        self.assertTrue(drawn_bars)
        for bar in drawn_bars:
            self.assertEqual(bar.drawn[-1]['fillColor'], BAR_FILL)
            self.assertIsNone(bar.drawn[-1]['lineColor'])
            self.assertEqual(bar.drawn[-1]['opacity'], 1)

    def test_grating_stays_symmetric_and_inside_fade_at_all_scales(self):
        # Include actual G1/G2/G3 conditions, a boundary centered on each
        # canvas edge, and a dense pattern exceeding the old 80-Rect cap.
        from eye_movement_version.intuition_eye.render import _layout
        ppm = _layout('E4', {'bob_radius_m': .08})['px_per_m']
        patterns = ((3.464102, 3.014102), (1.732051, 1.282051),
                    (1.154701, .704701), (1000 / ppm / 6, .7), (.05, .02))
        for size in ((1219, 762), (1524, 953), (2560, 1600)):
            for period, width in patterns:
                with self.subTest(size=size, period=period):
                    renderer = self.renderer(size)
                    renderer.draw({'unit': 'E4', 'phase': 'motion', 'alpha': .4,
                                   'descriptor': {'grating_period_m': period, 'bar_width_m': width,
                                                  'bob_radius_m': .08}})
                    overlay = renderer.fade_overlay.drawn[-1]
                    self.assertAlmostEqual(overlay['opacity'], .6)
                    left_bound = overlay['pos'][0] - overlay['width'] / 2
                    right_bound = overlay['pos'][0] + overlay['width'] / 2
                    spans = sorted((bar.pos[0] - bar.width / 2, bar.pos[0] + bar.width / 2)
                                   for bar in renderer.bars if bar.drawn)
                    self.assertTrue(spans)
                    for (left, right), (mirror_left, mirror_right) in zip(spans, reversed(spans)):
                        self.assertGreaterEqual(left, left_bound - 1e-8)
                        self.assertLessEqual(right, right_bound + 1e-8)
                        self.assertAlmostEqual(left, -mirror_right)
                        self.assertAlmostEqual(right, -mirror_left)
                    # Every bar intersecting the browser canvas must appear.
                    expected_count = sum(
                        500 + k * period * ppm + width * ppm / 2 > 0 and
                        500 + k * period * ppm - width * ppm / 2 < 1000
                        for k in range(-1000, 1001))
                    self.assertEqual(len(spans), expected_count)

    def test_e5_masks_are_transparent_only_during_replay(self):
        renderer = self.renderer()
        state = {'unit': 'E5', 'phase': 'motion', 'theta_rad': .5,
                 'descriptor': {'slit_left_m': -.2, 'slit_right_m': .2, 'bell_theta_deg': -30}}
        renderer.draw(state)
        self.assertTrue(all(mask.opacity == 1 for mask in renderer.slit_masks))
        self.assertFalse(renderer.guide_dashes.drawn)
        self.assertFalse(renderer.button.drawn)
        self.assertTrue(renderer.bell.drawn)
        self.assertTrue(renderer.bell_clapper.drawn)
        renderer.draw({**state, 'phase': 'feedback', 'replay': True})
        self.assertTrue(all(mask.opacity == .42 for mask in renderer.slit_masks))
        self.assertFalse(renderer.guide_dashes.drawn)
        self.assertFalse(renderer.button.drawn)
        renderer.draw(state)
        self.assertTrue(all(mask.opacity == 1 for mask in renderer.slit_masks))

    def test_e5_blank_and_judgment_keep_key_hint_without_canvas_content(self):
        for phase in ('blank', 'estimate'):
            renderer = self.renderer()
            renderer.draw({'unit': 'E5', 'phase': phase, 'footer': 'F：可以；J：不可以',
                           'selected': .2, 'truth': .3})
            self.assertEqual(renderer.text.drawn[-1]['text'], 'F：可以；J：不可以')
            for stim in (renderer.bob, renderer.anchor, renderer.estimate, renderer.truth,
                         renderer.bell, renderer.button, renderer.guide_dashes):
                self.assertFalse(stim.drawn)

    def test_bell_uses_browser_curve_and_rotated_clapper_at_every_scale(self):
        for size in ((1000, 760), (1524, 953)):
            renderer = self.renderer(size)
            renderer._draw_bell(500, 48, 400, 100, math.pi / 6)
            self.assertEqual(len(renderer.bell.vertices), 35)
            # Browser's top-center quadratic endpoint is (0, -.65 * size).
            bx, by = 500 + 400 * .5, 48 + 400 * math.cos(math.pi / 6)
            top = renderer._pix(bx - .65 * 18 * .5, by - .65 * 18 * math.cos(math.pi / 6))
            for actual, expected in zip(renderer.bell.vertices[16], top):
                self.assertAlmostEqual(actual, expected)
            clapper = renderer._pix(bx + .72 * 18 * .5, by + .72 * 18 * math.cos(math.pi / 6))
            for actual, expected in zip(renderer.bell_clapper.pos, clapper):
                self.assertAlmostEqual(actual, expected)
            self.assertAlmostEqual(renderer.bell_clapper.radius, .13 * 18 * renderer.scale)


if __name__ == '__main__':
    unittest.main()
