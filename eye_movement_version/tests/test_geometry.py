"""Headless tests for the PsychoPy renderer's pure geometry helpers."""
import math
import sys
import types
import unicodedata
import unittest
from unittest.mock import patch

from eye_movement_version.intuition_eye.render import (
    angle_from_pointer,
    frame_geometry,
    instruction_text_layout,
    _wrap_text_for_width,
    hit_confirm,
    hit_skip,
    speed_strip_bounds,
    strip_value,
    text_pages,
)


class FrameGeometryTests(unittest.TestCase):
    def test_frame_is_centered_and_bob_tracks_angle(self):
        state = {
            "unit": "E4",
            "descriptor": {"rod_length_m": 4.0, "bob_radius_m": 0.12},
            "window_size": (1600, 900),
            "theta_rad": math.pi / 2,
        }
        g = frame_geometry(state)
        self.assertAlmostEqual(g["scale"], 900 / 760)
        self.assertAlmostEqual(g["frame_left"], (1600 - 1000 * g["scale"]) / 2)
        self.assertAlmostEqual(g["bob_screen_x"] - g["pivot_screen_x"], g["rod_px"] * g["scale"])
        self.assertAlmostEqual(g["bob_screen_y"], g["pivot_screen_y"], places=8)
        self.assertGreater(g["bob_radius_px"], 0)

    def test_angle_pointer_uses_screen_coordinates_and_clamps_oscillation(self):
        descriptor = {
            "screen_width": 1000,
            "screen_height": 760,
            "rod_length_m": 4,
            "pendulum_regime": "oscillation",
            "w_max_deg": 35,
        }
        g = frame_geometry({"unit": "E2", "descriptor": descriptor, "window_size": (1000, 760)})
        # At theta=0, the bob is directly below the pivot in top-left coordinates.
        pivot_x, pivot_y = g["pivot_screen_x"], g["pivot_screen_y"]
        self.assertAlmostEqual(angle_from_pointer("E2", descriptor, pivot_x, pivot_y + 50), 0.0)
        # Move right of the pivot; the unclamped angle exceeds the 35 degree range.
        theta = angle_from_pointer("E2", descriptor, pivot_x + 100, pivot_y + 1)
        self.assertAlmostEqual(theta, math.radians(35))

    def test_rotation_angle_is_not_clamped(self):
        descriptor = {
            "screen_width": 1000,
            "screen_height": 760,
            "pendulum_regime": "rotation",
        }
        g = frame_geometry({"unit": "E2", "descriptor": descriptor, "window_size": (1000, 760)})
        theta = angle_from_pointer("E2", descriptor, g["pivot_screen_x"] + 100,
                                   g["pivot_screen_y"] + 1)
        self.assertGreater(theta, math.radians(80))

    def test_speed_strip_returns_value_only_inside_rows(self):
        descriptor = {"screen_width": 1000, "screen_height": 760}
        g = frame_geometry({"unit": "E2", "descriptor": descriptor, "window_size": (1000, 760)})
        x = g["canvas_left"] + g["anchor_x"] * g["scale"]
        first_row_y = g["canvas_top"] + (g["anchor_y"] - g["rod_px"] - 12 - 4 - 14) * g["scale"]
        self.assertAlmostEqual(strip_value(x, first_row_y, "E2", descriptor), 0.5)
        self.assertIsNone(strip_value(x, first_row_y + 30, "E2", descriptor))
        self.assertIsNone(strip_value(x, first_row_y - 20, "E2", descriptor))
        self.assertIsNone(strip_value(x, first_row_y, "E4", descriptor))
        e4 = frame_geometry({"unit": "E4", "descriptor": descriptor})
        left, right, top, bottom = speed_strip_bounds("E4", descriptor)
        sx = e4["canvas_left"] + (left + right) / 2 * e4["scale"]
        sy = e4["canvas_top"] + (top + bottom) / 2 * e4["scale"]
        self.assertAlmostEqual(strip_value(sx, sy, "E4", descriptor), 0.5)
        self.assertGreater(top, 560)
        self.assertIsNone(strip_value(sx, e4["canvas_top"] + 520 * e4["scale"], "E4", descriptor))
        training = frame_geometry({"unit": "training", "descriptor": descriptor, "window_size": (1000, 760)})
        tx = training["canvas_left"] + 500 * training["scale"]
        ty = training["canvas_top"] + 520 * training["scale"]
        self.assertAlmostEqual(strip_value(tx, ty, "training", descriptor), 0.5)
        self.assertIsNone(strip_value(sx, sy + 40 * e4["scale"], "E4", descriptor))

    def test_footer_hit_regions_use_reserved_frame_area(self):
        descriptor = {"screen_width": 1000, "screen_height": 760}
        # The frame is 1000x760 at scale 1 when the window has that size.
        self.assertTrue(hit_confirm(870, 705, "E2", descriptor))
        self.assertFalse(hit_confirm(500, 705, "E2", descriptor))
        self.assertTrue(hit_skip(130, 705, "E2", descriptor))
        self.assertFalse(hit_skip(500, 705, "E2", descriptor))


class TrainingRenderTests(unittest.TestCase):
    def renderer(self, size):
        class Stim:
            def __init__(self, *args, **kwargs):
                self.__dict__.update(kwargs)
                self.drawn = []

            def draw(self):
                self.drawn.append(self.__dict__.copy())

        visual = types.SimpleNamespace(**{
            name: Stim for name in ("Rect", "Circle", "ShapeStim", "TextStim", "ElementArrayStim")
        })
        psychopy = types.ModuleType("psychopy")
        psychopy.visual = visual
        with patch.dict(sys.modules, {"psychopy": psychopy}):
            from eye_movement_version.intuition_eye.render import SceneRenderer
            return SceneRenderer(types.SimpleNamespace(size=size))

    def test_fixation_stays_at_drawable_center_after_instruction_page(self):
        for size in ((1219, 762), (1524, 953), (2560, 1600)):
            with self.subTest(size=size):
                renderer = self.renderer(size)
                renderer.draw_text("说明文字", "按空格继续")
                text_count = len(renderer.text.drawn)
                renderer.draw_fixation("+")
                self.assertEqual(len(renderer.text.drawn), text_count)
                for cross in (renderer.fixation_h, renderer.fixation_v):
                    self.assertEqual(cross.drawn[-1]["pos"], (0, 0))
                    vertices = cross.drawn[-1]["vertices"]
                    self.assertAlmostEqual(sum(p[0] for p in vertices), 0)
                    self.assertAlmostEqual(sum(p[1] for p in vertices), 0)

    def test_training_has_unfilled_button_frames_and_labels_match_hit_regions(self):
        for size in ((1219, 762), (1524, 953)):
            for phase in ("motion", "estimate", "feedback"):
                with self.subTest(size=size, phase=phase):
                    renderer = self.renderer(size)
                    renderer.draw_text("说明文字", "按空格继续")
                    renderer.draw({"unit": "training", "phase": phase,
                                   "response_mode": "speed", "show_skip": True,
                                   "linear_x_m": 0, "selected": .4, "truth": .5})
                    self.assertEqual(len(renderer.button.drawn), 2 if phase == "estimate" else 1)
                    for button in renderer.button.drawn:
                        self.assertIsNone(button["fillColor"])
                        self.assertEqual(button["lineColor"], "#94a3b8")
                    labels = {s["text"]: s for s in renderer.control_text.drawn}
                    self.assertIn("跳过反馈阶段", labels)
                    self.assertEqual("确认速度" in labels, phase == "estimate")
                    for text, label in labels.items():
                        x, y = label["pos"]
                        hit = hit_confirm if text == "确认速度" else hit_skip
                        self.assertTrue(hit(size[0] / 2 + x, size[1] / 2 - y,
                                            "training", {"window_size": size}))
                        self.assertEqual(label["alignText"], "center")
                        self.assertEqual(label["anchorHoriz"], "center")
                        self.assertEqual(label["anchorVert"], "center")


class TextPaginationTests(unittest.TestCase):
    def test_instruction_layout_fits_16_by_10_drawable_window(self):
        # Verify the actual 1600×1000 Window coordinate space, independent of
        # configured logical dimensions or monitor scaling.
        layout = instruction_text_layout((1600, 1000))
        self.assertGreater(layout["left"], -800)
        self.assertLessEqual(layout["left"] + layout["wrap_width"], 800)
        self.assertLessEqual(layout["wrap_width"], 1600 - 2 * 48)
        self.assertAlmostEqual(layout["left"] + layout["wrap_width"] / 2, 0.0)
        self.assertLess(layout["top"], 500)
        self.assertGreater(layout["footer_y"], -500)

    def test_cjk_lines_are_hard_wrapped_to_the_available_width(self):
        layout = instruction_text_layout((1600, 1000))
        height = 30 * layout["scale"]
        text = "请观察摆球运动并判断速度方向，然后按空格继续。" * 5
        wrapped = _wrap_text_for_width(text, layout["wrap_width"], height)
        lines = wrapped.splitlines()
        self.assertGreater(len(lines), 1)
        for line in lines:
            estimated_width = sum(
                height if unicodedata.east_asian_width(c) in ("W", "F") else height * 0.62
                for c in line
            )
            self.assertLessEqual(estimated_width, layout["wrap_width"] + 1e-9)
        self.assertEqual("".join(lines), text)

    def test_renderer_passes_safe_position_and_hard_wrapped_text_to_stim(self):
        class Stim:
            def __init__(self, *args, **kwargs):
                self.__dict__.update(kwargs)
                self.drawn = []

            def draw(self):
                self.drawn.append({
                    key: getattr(self, key, None)
                    for key in ("text", "pos", "wrapWidth", "height", "alignText",
                                "anchorHoriz", "anchorVert")
                })

        visual = types.SimpleNamespace(**{
            name: Stim for name in ("Rect", "Circle", "ShapeStim", "TextStim", "ElementArrayStim")
        })
        psychopy = types.ModuleType("psychopy")
        psychopy.visual = visual
        with patch.dict(sys.modules, {"psychopy": psychopy}):
            from eye_movement_version.intuition_eye.render import SceneRenderer
            renderer = SceneRenderer(types.SimpleNamespace(size=(1600, 1000)))
            source = "请观察摆球运动并判断速度方向，然后按空格继续。" * 8
            renderer.draw_text(source, "按空格继续")

        instruction, footer = renderer.text.drawn
        self.assertEqual(instruction["anchorHoriz"], "left")
        self.assertEqual(instruction["anchorVert"], "top")
        self.assertEqual(instruction["alignText"], "left")
        self.assertLessEqual(instruction["pos"][0], 0)
        self.assertLessEqual(instruction["pos"][0] + instruction["wrapWidth"], 800)
        self.assertIn("\n", instruction["text"])
        self.assertEqual("".join(instruction["text"].splitlines()), source)
        self.assertEqual(footer["anchorHoriz"], "center")
        self.assertEqual(footer["anchorVert"], "bottom")
        self.assertEqual(footer["pos"][0], 0)

    def test_html_is_removed_and_chinese_paragraphs_are_preserved(self):
        pages = text_pages("<h2>第一步</h2><p>观察摆球运动。</p><ul><li>记录方向</li><li>判断速度</li></ul>")
        self.assertEqual(len(pages), 1)
        self.assertIn("第一步", pages[0])
        self.assertIn("观察摆球运动。", pages[0])
        self.assertIn("• 记录方向", pages[0])
        self.assertNotIn("<", pages[0])

    def test_long_content_is_paginated_without_losing_text(self):
        text = "观察运动并判断速度。" * 80
        pages = text_pages(f"<p>{text}</p>", max_chars=150, max_lines=8)
        self.assertGreater(len(pages), 1)
        self.assertEqual("".join(pages).replace("\n", "").replace(" ", ""), text)


if __name__ == "__main__":
    unittest.main()
