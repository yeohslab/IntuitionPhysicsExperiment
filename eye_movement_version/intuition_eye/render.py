"""Native PsychoPy rendering and headless geometry for the eye-movement task.

The geometry helpers deliberately have no PsychoPy dependency. Coordinates accepted
by the public pointer helpers are window-local pixels with a top-left origin and
positive y downward; ``frame_geometry`` uses the same convention for event logs.
"""
from __future__ import annotations

import html
import math
import re
import unicodedata
from typing import Any, Mapping

CANVAS_W = 1000.0
CANVAS_H = 560.0
FRAME_H = 760.0
CONTENT_TOP = 100.0
BACKGROUND = "#f8fafc"
BLUE = "#2563eb"
BLUE_STROKE = "#1d4ed8"
GREY = "#94a3b8"
DARK = "#0f172a"
ORANGE = "#f97316"
BOB_RADIUS = 12.0
BAR_FILL = "#64748b"
TEXT_MAX_WIDTH = 880.0
TEXT_MARGIN = 48.0
TEXT_TOP_MARGIN = 48.0
TEXT_FOOTER_MARGIN = 28.0


def instruction_text_layout(window_size: tuple[float, float]) -> dict[str, float]:
    """Return a safe PsychoPy-pix layout for a full-window instruction page.

    ``window_size`` must be the actual ``Window.size`` used by PsychoPy, rather
    than the configured request.  The text uses a left anchor at the left edge
    of a centered wrap box; this is important because a left-aligned TextStim
    with a centered anchor starts at the center of the window and overflows.
    """
    width = max(1.0, float(window_size[0]))
    height = max(1.0, float(window_size[1]))
    scale = min(width / CANVAS_W, height / FRAME_H)
    margin = max(24.0, TEXT_MARGIN * scale)
    wrap_width = min(TEXT_MAX_WIDTH * scale, max(1.0, width - 2.0 * margin))
    return {
        "scale": scale,
        "wrap_width": wrap_width,
        "left": -wrap_width / 2.0,
        "top": height / 2.0 - max(24.0, TEXT_TOP_MARGIN * scale),
        "footer_y": -height / 2.0 + max(20.0, TEXT_FOOTER_MARGIN * scale),
    }


def _first(obj: Any, *names: str, default: Any = None) -> Any:
    """Get the first present field from either a mapping or an object."""
    for name in names:
        if isinstance(obj, Mapping) and name in obj:
            return obj[name]
        if hasattr(obj, name):
            return getattr(obj, name)
    return default


def _float(obj: Any, names: tuple[str, ...], default: float) -> float:
    try:
        value = float(_first(obj, *names, default=default))
    except (TypeError, ValueError):
        return default
    return value if math.isfinite(value) else default


def _classification(unit: Any, descriptor: Any = None) -> str:
    raw = str(_first(descriptor, "unit_type", "type", "physics_kind", default="") or "")
    raw += " " + str(_first(unit, "unit_type", "type", "experiment", default=unit) or "")
    low = raw.lower()
    if any(k in low for k in ("training", "linear", "speedcolor")):
        return "training"
    if any(k in low for k in ("bell", "reachability", "experiment-5", "experiment5", "e5")):
        return "e5"
    if any(k in low for k in ("grating", "experiment-4", "experiment4", "protocol2", "e4")):
        return "e4"
    return "e2"


def _pick_descriptor(unit: Any, descriptor: Any) -> Any:
    return descriptor if descriptor is not None else unit


def _frame_size(unit: Any, descriptor: Any = None) -> tuple[float, float]:
    d = _pick_descriptor(unit, descriptor)
    size = _first(d, "window_size", default=None)
    if isinstance(size, (tuple, list)) and len(size) == 2:
        return max(1.0, float(size[0])), max(1.0, float(size[1]))
    w = _float(d, ("screen_width", "window_width", "frame_width", "width"), 1920.0)
    h = _float(d, ("screen_height", "window_height", "frame_height", "height"), 1080.0)
    return max(1.0, w), max(1.0, h)


def _layout(unit: Any, descriptor: Any = None) -> dict[str, float]:
    """Logical E4/E5 world layout, equivalent to gratingWorldLayout."""
    d = _pick_descriptor(unit, descriptor)
    rod = _float(d, ("rod_length_m", "rodLengthM", "rod_length"), 4.0)
    radius = _float(d, ("bob_radius_m", "bobRadiusM", "bob_radius"), 0.12)
    reach = max(0.01, rod + radius)
    ppm = min((CANVAS_W - 48.0) / (2.0 * reach), (CANVAS_H - 48.0) / reach)
    reach_px = reach * ppm
    return {"px_per_m": ppm, "origin_x": CANVAS_W / 2,
            "origin_y": (CANVAS_H - reach_px) / 2, "rod_px": rod * ppm,
            "bob_radius_px": radius * ppm}


def frame_geometry(state: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Return screen-pixel geometry for an experiment frame and its pendulum.

    ``state`` may contain ``unit``, ``descriptor``, ``window_size`` (width,
    height), and the current ``theta_rad``. The returned bob and pivot positions
    are useful as screen-coordinate event-log values.
    """
    state = state or {}
    unit = state.get("unit", "E2")
    desc = state.get("descriptor", {})
    w, h = (state.get("window_size") or _frame_size(unit, desc))
    w, h = max(1.0, float(w)), max(1.0, float(h))
    scale = min(w / CANVAS_W, h / FRAME_H)
    frame_left = (w - CANVAS_W * scale) / 2.0
    frame_top = (h - FRAME_H * scale) / 2.0
    canvas_left = frame_left
    scene = _classification(unit, desc)
    canvas_top = frame_top + (20.0 if scene == "e2" else CONTENT_TOP) * scale
    theta = float(state.get("theta_rad", 0.0) or 0.0)
    if scene == "e2":
        rod_px = min(CANVAS_W, 650.0) * 0.36
        has_strips = (_first(desc, "speed_cue_type", default="") == "color-strips" or
                      bool(_first(desc, "speed_color_strips", "use_color_strips", default=False)))
        clearance = 44.0 if has_strips else 32.0
        rod_px = min(rod_px, max(1.0, (650.0 - 2 * clearance) / 2.0))
        anchor_x, anchor_y = CANVAS_W / 2.0, rod_px + clearance
        radius = BOB_RADIUS
    else:
        layout = _layout(unit, desc)
        rod_px = layout["rod_px"]
        anchor_x, anchor_y = layout["origin_x"], layout["origin_y"]
        radius = layout["bob_radius_px"]
    bx = anchor_x + rod_px * math.sin(theta)
    by = anchor_y + rod_px * math.cos(theta)
    return {
        "window_width": w, "window_height": h, "scale": scale,
        "frame_left": frame_left, "frame_top": frame_top,
        "canvas_left": canvas_left, "canvas_top": canvas_top,
        "canvas_width": CANVAS_W * scale, "canvas_height": (650.0 if scene == "e2" else CANVAS_H) * scale,
        "logical_width": CANVAS_W, "logical_height": 650.0 if scene == "e2" else CANVAS_H,
        "anchor_x": anchor_x, "anchor_y": anchor_y,
        "rod_px": rod_px, "bob_radius_px": radius,
        "pivot_screen_x": canvas_left + anchor_x * scale,
        "pivot_screen_y": canvas_top + anchor_y * scale,
        "bob_screen_x": canvas_left + bx * scale,
        "bob_screen_y": canvas_top + by * scale,
    }


def _pointer_logical(unit: Any, descriptor: Any, x: float, y: float) -> tuple[float, float, dict[str, Any]]:
    geom = frame_geometry({"unit": unit, "descriptor": descriptor})
    s = geom["scale"]
    if s <= 0:
        return CANVAS_W / 2, CANVAS_H / 2, geom
    # Pointer coordinates are top-left window pixels, as returned by PsychoPy
    # Window.mouseVisible-compatible event adapters.
    return (float(x) - geom["canvas_left"]) / s, (float(y) - geom["canvas_top"]) / s, geom


def angle_from_pointer(unit: Any, descriptor: Any, x: float, y: float) -> float:
    """Map a top-left-origin screen pointer to a clamped pendulum angle in radians."""
    lx, ly, geom = _pointer_logical(unit, descriptor, x, y)
    dx, dy = lx - geom["anchor_x"], ly - geom["anchor_y"]
    theta = math.atan2(dx, dy)
    d = _pick_descriptor(unit, descriptor)
    regime = str(_first(d, "pendulum_regime", "regime", default="oscillation")).lower()
    if regime == "oscillation":
        limit = (90.0 if _classification(unit, descriptor) in ("e4", "e5") else
                 _float(d, ("w_max_deg", "amplitude_deg", "amplitudeDeg", "max_angle_deg"), 90.0))
        theta = max(-math.radians(abs(limit)), min(math.radians(abs(limit)), theta))
    return theta


def _strip_rect(unit: Any, descriptor: Any) -> tuple[float, float, float, float] | None:
    if _classification(unit, descriptor) != "e2":
        return None
    d = _pick_descriptor(unit, descriptor)
    # Match the web strip geometry (28px high, 4px gap, 12px bob).
    geom = frame_geometry({"unit": unit, "descriptor": descriptor})
    ax, ay, rod = geom["anchor_x"], geom["anchor_y"], geom["rod_px"]
    y1 = ay - rod - BOB_RADIUS - 4.0 - 28.0
    y2 = ay + rod + BOB_RADIUS + 4.0
    return ax - rod, y1, ax + rod, y2 + 28.0


def strip_value(x: float, y: float, unit: Any = "E2", descriptor: Any = None) -> float | None:
    """Return normalized horizontal position within either E2 speed color strip."""
    lx, ly, geom = _pointer_logical(unit, descriptor, x, y)
    if _classification(unit, descriptor) in ("training", "e4"):
        if 150.0 <= lx <= 850.0 and 500.0 <= ly <= 540.0:
            return (lx - 150.0) / 700.0
        return None
    rect = _strip_rect(unit, descriptor)
    if rect is None:
        return None
    left, top, right, bottom = rect
    geom = frame_geometry({"unit": unit, "descriptor": descriptor})
    ay, rod = geom["anchor_y"], geom["rod_px"]
    rows = (ay - rod - BOB_RADIUS - 4.0 - 28.0,
            ay + rod + BOB_RADIUS + 4.0)
    if not (left <= lx <= right and any(row <= ly <= row + 28.0 for row in rows)):
        return None
    return max(0.0, min(1.0, (lx - left) / max(1e-9, right - left)))


def hit_canvas(x: float, y: float, unit: Any = "E2", descriptor: Any = None) -> bool:
    lx, ly, geom = _pointer_logical(unit, descriptor, x, y)
    return 0 <= lx <= geom["logical_width"] and 0 <= ly <= geom["logical_height"]


def hit_confirm(x: float, y: float, unit: Any = "E2", descriptor: Any = None) -> bool:
    """Hit test the lower-right confirm control reserved beneath the canvas."""
    g = frame_geometry({"unit": unit, "descriptor": descriptor})
    lx, ly = (x - g["frame_left"]) / g["scale"], (y - g["frame_top"]) / g["scale"]
    return 760.0 <= lx <= 980.0 and 675.0 <= ly <= 735.0


def hit_skip(x: float, y: float, unit: Any = "E2", descriptor: Any = None) -> bool:
    """Hit test the lower-left skip control reserved beneath the canvas."""
    g = frame_geometry({"unit": unit, "descriptor": descriptor})
    lx, ly = (x - g["frame_left"]) / g["scale"], (y - g["frame_top"]) / g["scale"]
    return 20.0 <= lx <= 240.0 and 675.0 <= ly <= 735.0


def _plain_text(source: str) -> str:
    source = re.sub(r"(?is)<(script|style)\b[^>]*>.*?</\1\s*>", "", source)
    source = re.sub(r"(?i)<br\s*/?>", "\n", source)
    source = re.sub(r"(?i)</(p|div|h[1-6]|li|ul|ol|section|article)\s*>", "\n", source)
    source = re.sub(r"(?i)<li\b[^>]*>", "• ", source)
    source = re.sub(r"(?s)<[^>]+>", "", source)
    return html.unescape(source).replace("\xa0", " ")


def _wrap_text_for_width(text: str, wrap_width: float, font_height: float) -> str:
    """Insert hard line breaks so CJK text cannot exceed a TextStim box.

    PsychoPy's underlying text layout does not reliably break whitespace-free
    Chinese sentences.  A conservative glyph-width estimate keeps every line
    inside the measured ``wrap_width`` before PsychoPy performs its own layout.
    """
    width = max(1.0, float(wrap_width))
    height = max(1.0, float(font_height))
    lines: list[str] = []
    for source_line in str(text or "").splitlines() or [""]:
        current: list[str] = []
        used = 0.0
        for char in source_line:
            east_width = unicodedata.east_asian_width(char)
            glyph_width = height if east_width in ("W", "F") else height * 0.62
            if current and used + glyph_width > width:
                lines.append("".join(current).rstrip())
                current, used = [], 0.0
            current.append(char)
            used += glyph_width
        lines.append("".join(current).rstrip())
    return "\n".join(lines)


def text_pages(html_text: str, *, max_chars: int = 500, max_lines: int = 12) -> list[str]:
    """Convert simple HTML instructional content to readable Chinese text pages."""
    text = _plain_text(html_text or "")
    paragraphs = [re.sub(r"[ \t]+", " ", p).strip() for p in re.split(r"\n\s*\n+|\n", text)]
    paragraphs = [p for p in paragraphs if p]
    if not paragraphs:
        return [""]
    pages: list[str] = []
    current: list[str] = []
    count = 0
    for paragraph in paragraphs:
        # Chinese is character-dense; split long paragraphs at sentence/word boundaries.
        chunks: list[str] = []
        remaining = paragraph
        while len(remaining) > max_chars:
            cut = max(remaining.rfind("。", 0, max_chars + 1), remaining.rfind("！", 0, max_chars + 1),
                      remaining.rfind("？", 0, max_chars + 1), remaining.rfind(" ", 0, max_chars + 1))
            if cut < max_chars // 2:
                cut = max_chars
            else:
                cut += 1
            chunks.append(remaining[:cut].strip())
            remaining = remaining[cut:].strip()
        if remaining:
            chunks.append(remaining)
        for chunk in chunks:
            # At the renderer's supported 16:10 layout, a 30px CJK glyph
            # occupies roughly one column in the 880px text box.  Keep page
            # pagination conservative; the renderer still applies exact hard
            # breaks from the actual Window.size.
            lines = max(1, math.ceil(len(chunk) / 28))
            if current and (count + len(chunk) > max_chars or sum(math.ceil(len(p) / 28) for p in current) + lines > max_lines):
                pages.append("\n\n".join(current))
                current, count = [], 0
            current.append(chunk)
            count += len(chunk)
    if current:
        pages.append("\n\n".join(current))
    return pages


def _turbo(level: float) -> tuple[float, float, float]:
    coeffs = ((.13572138, 4.6153926, -42.66032258, 132.13108234, -152.94239396, 59.28637943),
              (.09140261, 2.19418839, 4.84296658, -14.18503333, 4.27729857, 2.82956604),
              (.1066733, 12.64194608, -60.58204836, 110.36276771, -89.90310912, 27.34824973))
    t = max(0.0, min(1.0, level))
    out = []
    for c in coeffs:
        v = c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * (c[4] + t * c[5]))))
        # Browser rounds each channel to an 8-bit sRGB value. PsychoPy's
        # default rgb space instead spans -1..1; passing 0..1 makes it pastel.
        channel = math.floor(max(0.0, min(1.0, v)) * 255 + .5)
        out.append(channel / 127.5 - 1)
    return tuple(out)


class SceneRenderer:
    """Draw experiment states to a PsychoPy Window without input, time, or flips.

    Supported descriptors are dict-like. The class caches PsychoPy primitives
    at construction, and lazily imports PsychoPy so headless geometry use works.
    """
    def __init__(self, win: Any, config: dict[str, Any] | None = None):
        from psychopy import visual  # lazy: geometry tests do not require PsychoPy

        self.win = win
        self.config = dict(config or {})
        self.visual = visual
        # Window.size is PsychoPy's actual drawable coordinate space.  Do not
        # use the configured size here: fullscreen and HiDPI can change it.
        self.width, self.height = map(float, win.size)
        self.scale = min(self.width / CANVAS_W, self.height / FRAME_H)
        self.frame_left = (self.width - CANVAS_W * self.scale) / 2.0
        self.frame_top = (self.height - FRAME_H * self.scale) / 2.0
        self.content_top = CONTENT_TOP
        self.canvas_top = self.frame_top + CONTENT_TOP * self.scale
        self.text_layout = instruction_text_layout((self.width, self.height))
        self.font = self.config.get("font", "Microsoft YaHei")
        self._make_stims()

    def _make_stims(self) -> None:
        v = self.visual
        # PsychoPy pix coordinates are centered with positive y upward.
        self.bg = v.Rect(self.win, width=self.width, height=self.height, fillColor=BACKGROUND,
                         lineColor=BACKGROUND, units="pix", pos=(0, 0), autoLog=False)
        self.bob = v.Circle(self.win, radius=1, fillColor=BLUE, lineColor=BLUE_STROKE,
                            lineWidth=1.5, units="pix", autoLog=False)
        self.rod = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=False,
                               lineColor=BLUE, lineWidth=3, fillColor=None,
                               units="pix", autoLog=False)
        self.estimate = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=False,
                                    lineColor=ORANGE, lineWidth=3, fillColor=None,
                                    units="pix", autoLog=False)
        self.truth = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=False,
                                 lineColor=BLUE, lineWidth=3, fillColor=None,
                                 units="pix", autoLog=False)
        self.direction_arrow = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1), (0, 0)],
                                           closeShape=False, lineColor=BLUE, lineWidth=3,
                                           fillColor=None, units="pix", autoLog=False)
        self.anchor = v.Circle(self.win, radius=5, fillColor=DARK, lineColor=DARK,
                               units="pix", autoLog=False)
        self.guide = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=False,
                                 lineColor=GREY, lineWidth=2,
                                 fillColor=None, units="pix", autoLog=False)
        self.range_fill = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=True,
                                      lineColor=GREY, lineWidth=2,
                                      fillColor=None, units="pix", autoLog=False)
        # One GPU batch for all 8px / 6px trajectory dashes.
        self.guide_dashes = v.ElementArrayStim(
            self.win, nElements=512, elementTex=None, elementMask=None,
            sizes=0, colors=GREY, units="pix", autoLog=False)
        self._guide_cache = None
        self.bars = [v.Rect(self.win, width=1, height=CANVAS_H, fillColor=BAR_FILL,
                            lineColor=BAR_FILL, units="pix", autoLog=False) for _ in range(80)]
        self.slit_masks = [v.Rect(self.win, width=1, height=CANVAS_H, fillColor=BAR_FILL,
                                  lineColor=BAR_FILL, units="pix", autoLog=False) for _ in range(2)]
        self.bell = v.ShapeStim(self.win, vertices=[(-1, -1), (1, -1), (1, 1), (-1, 1)],
                                closeShape=True, fillColor="#f59e0b", lineColor="#92400e",
                                lineWidth=2 * self.scale, units="pix", autoLog=False)
        self.bell_clapper = v.Circle(self.win, radius=1, fillColor="#f59e0b",
                                     lineColor="#92400e", lineWidth=2 * self.scale,
                                     units="pix", autoLog=False)
        self.footer_top = v.Rect(self.win, width=1, height=1, fillColor=(0, 0, 0), lineColor=None,
                                 units="pix", autoLog=False)
        self.footer_bottom = v.Rect(self.win, width=1, height=1, fillColor=(0, 0, 0), lineColor=None,
                                    units="pix", autoLog=False)
        self.fade_overlay = v.Rect(self.win, width=CANVAS_W * self.scale,
                                    height=CANVAS_H * self.scale, fillColor=BACKGROUND,
                                    lineColor=BACKGROUND, units="pix",
                                    pos=(0, 0), autoLog=False)
        self.text = v.TextStim(self.win, text="", font=self.font, color="#0f172a",
                               height=30 * self.scale,
                               wrapWidth=self.text_layout["wrap_width"],
                               alignText="left", anchorHoriz="left", anchorVert="top",
                               units="pix", autoLog=False)
        # Keep control labels independent of the wide instruction text box.
        self.control_text = v.TextStim(
            self.win, text="", font=self.font, color=DARK,
            height=24 * self.scale, wrapWidth=220 * self.scale,
            alignText="center", anchorHoriz="center", anchorVert="center",
            units="pix", autoLog=False)
        self.fixation_h = v.ShapeStim(
            self.win, vertices=[(-12 * self.scale, 0), (12 * self.scale, 0)],
            closeShape=False, lineColor=DARK, lineWidth=3 * self.scale,
            fillColor=None, pos=(0, 0), units="pix", autoLog=False)
        self.fixation_v = v.ShapeStim(
            self.win, vertices=[(0, -12 * self.scale), (0, 12 * self.scale)],
            closeShape=False, lineColor=DARK, lineWidth=3 * self.scale,
            fillColor=None, pos=(0, 0), units="pix", autoLog=False)
        self.button = v.Rect(self.win, width=220 * self.scale, height=60 * self.scale,
                             fillColor="#2563eb", lineColor=None, units="pix", autoLog=False)
        self.marker = v.ShapeStim(self.win, vertices=[(0, 0), (1, 1)], closeShape=False,
                                  lineColor=ORANGE, lineWidth=4, fillColor=None,
                                  units="pix", autoLog=False)
        self._drawn = [self.bg, self.range_fill, self.guide, self.anchor, self.rod,
                       self.truth, self.estimate, self.direction_arrow, self.bob,
                       *self.bars, *self.slit_masks, self.bell, self.footer_top,
                       self.footer_bottom, self.fade_overlay, self.text]

    def _pix(self, x: float, y: float) -> tuple[float, float]:
        return ((x - CANVAS_W / 2.0) * self.scale,
                (FRAME_H / 2.0 - self.content_top - y) * self.scale)

    def _set_line(self, stim: Any, p0: tuple[float, float], p1: tuple[float, float]) -> None:
        stim.vertices = [self._pix(*p0), self._pix(*p1)]

    def _set_vertices(self, stim: Any, points: list[tuple[float, float]]) -> None:
        stim.vertices = [self._pix(x, y) for x, y in points]

    def _text_frame(self, value: str, footer: str = "") -> None:
        self.bg.draw()
        layout = self.text_layout
        # Instruction pages are left aligned inside a centered box.  Keeping
        # the anchor at the box's left edge prevents text from starting at x=0.
        self.text.alignText = "left"
        self.text.anchorHoriz = "left"
        self.text.anchorVert = "top"
        self.text.wrapWidth = layout["wrap_width"]
        self.text.height = 30 * layout["scale"]
        self.text.text = _wrap_text_for_width(
            value, layout["wrap_width"], self.text.height)
        self.text.pos = (layout["left"], layout["top"])
        self.text.draw()
        if footer:
            self.text.alignText = "center"
            self.text.anchorHoriz = "center"
            self.text.anchorVert = "bottom"
            self.text.text = footer
            self.text.pos = (0, layout["footer_y"])
            self.text.height = 24 * layout["scale"]
            self.text.draw()
        self.text.alignText = "left"
        self.text.anchorHoriz = "left"
        self.text.anchorVert = "top"
        self.text.height = 30 * layout["scale"]

    def draw_text(self, text: str, footer: str = "按空格继续") -> None:
        """Draw one full-screen text page, without flipping."""
        self._text_frame(_plain_text(text), footer)

    def draw_fixation(self, text: str = "+") -> None:
        """Center the cross in the drawable window, independent of text layout."""
        if _plain_text(text).strip() != "+":
            # Timed rest messages also use the fixation phase in the runtime.
            self._text_frame(_plain_text(text))
            return
        self.bg.draw()
        self.fixation_h.draw()
        self.fixation_v.draw()

    def draw(self, state: dict[str, Any]) -> None:
        """Draw one state frame; caller controls input, timing, and win.flip()."""
        d = state.get("descriptor", {}) or {}
        unit = state.get("unit", "E2")
        scene = _classification(unit, d)
        phase = str(state.get("phase", "motion")).lower()
        theta = _float(state, ("theta_rad",), 0.0)
        alpha = max(0.0, min(1.0, _float(state, ("alpha",), 1.0)))
        layout = _layout(unit, d)
        self.content_top = 20.0 if scene == "e2" else CONTENT_TOP
        self.canvas_top = self.frame_top + self.content_top * self.scale
        if phase == "blank" and scene != "e2":
            self.bg.draw()
            self._draw_footer(state.get("footer"))
            return
        self.bg.draw()
        if scene == "training":
            self._draw_training(state, d, layout)
        elif scene == "e2":
            self._draw_e2(state, d, layout, theta, alpha, phase)
        else:
            self._draw_e4e5(state, d, layout, theta, alpha, phase, scene == "e5")
        speed_replay = scene == "e4" and phase == "feedback" and state.get("replay") and state.get("response_mode") == "speed"
        if (phase in ("estimate", "feedback") and not state.get("replay") and scene != "e5") or speed_replay:
            if state.get("response_mode") == "speed":
                self._draw_speed_report(state, phase)
            if phase == "estimate":
                self._draw_controls(bool(state.get("show_skip")), training=scene == "training")
        if scene == "training" and phase in ("motion", "feedback") and state.get("show_skip"):
            self._draw_controls(True, show_confirm=False, training=True)
        self._draw_footer(state.get("footer"))

    def _draw_footer(self, text: Any) -> None:
        if not text:
            return
        self.text.alignText = "center"
        self.text.anchorHoriz = "center"
        self.text.anchorVert = "bottom"
        self.text.height = 22 * self.scale
        self.text.wrapWidth = 940 * self.scale
        self.text.text = _wrap_text_for_width(str(text), self.text.wrapWidth, self.text.height)
        self.text.pos = (0, self.text_layout["footer_y"])
        self.text.color = DARK
        self.text.draw()
        self.text.alignText = "left"
        self.text.anchorHoriz = "left"
        self.text.anchorVert = "top"
        self.text.height = 30 * self.text_layout["scale"]

    def _draw_controls(self, show_skip: bool, show_confirm: bool = True, *,
                       training: bool = False) -> None:
        for x, label, color in ((870, "确认速度" if training else "确认", BLUE),
                                (130, "跳过反馈阶段" if training else "跳过", "#64748b")):
            if (x == 130 and not show_skip) or (x == 870 and not show_confirm):
                continue
            # Match hit_confirm/hit_skip's frame-local centers and bounds.
            pos = ((x - CANVAS_W / 2) * self.scale, (FRAME_H / 2 - 705) * self.scale)
            self.button.pos = pos
            self.button.fillColor = None if training else color
            self.button.lineColor = GREY if training else None
            self.button.lineWidth = 1.5 * self.scale
            self.button.draw()
            self.control_text.pos = pos
            self.control_text.text = label
            self.control_text.color = DARK if training else "#ffffff"
            self.control_text.draw()

    def _draw_speed_report(self, state: dict[str, Any], phase: str) -> None:
        # Cache the bars and change only their colours and positions per frame.
        for i, stim in enumerate(self.bars[:50]):
            stim.width, stim.height = 14 * self.scale, 40 * self.scale
            stim.pos = self._pix(150 + (i + .5) * 14, 520)
            stim.fillColor = _turbo((i + .5) / 50)
            stim.lineColor = stim.fillColor
            stim.opacity = 1
            stim.draw()
        for key, color in (("selected", ORANGE), ("truth", BLUE)):
            value = state.get(key)
            if value is None or (key == "truth" and phase != "feedback"):
                continue
            if key == "selected" and state.get("hide_choice"):
                continue
            x = 150 + 700 * max(0.0, min(1.0, float(value)))
            self.marker.lineColor = color
            self._set_line(self.marker, (x, 490), (x, 548))
            self.marker.draw()

    def _draw_e2(self, state: dict[str, Any], d: Any, layout: dict[str, float], theta: float,
                 alpha: float, phase: str) -> None:
        g = frame_geometry({"unit": "E2", "descriptor": d, "window_size": (self.width, self.height)})
        cx, cy, r = g["anchor_x"], g["anchor_y"], g["rod_px"]
        regime = str(_first(d, "pendulum_regime", "regime", default="oscillation")).lower()
        maximum = _float(d, ("w_max_deg", "amplitude_deg", "amplitudeDeg"), 90.0)
        if phase == "estimate":
            guide_color = ORANGE
        elif phase == "feedback":
            guide_color = GREY
        else:
            # The browser fades only the rod/bob, retaining a blue→black guide.
            guide_color = tuple(((1 - alpha) * dark + alpha * blue) / 127.5 - 1
                                for blue, dark in zip((37, 99, 235), (15, 23, 42)))
        self._draw_guide(cx, cy, r, regime, maximum, guide_color)
        self.anchor.pos = self._pix(cx, cy)
        self.anchor.draw()
        if phase in ("motion", "cue") and alpha > 0:
            bx, by = cx + r * math.sin(theta), cy + r * math.cos(theta)
            self._set_line(self.rod, (cx, cy), (bx, by))
            self.rod.opacity = alpha
            self.bob.pos = self._pix(bx, by)
            self.bob.radius = BOB_RADIUS * self.scale
            self.bob.opacity = alpha
            self.rod.draw(); self.bob.draw()
            if phase == "cue":
                self._draw_direction_arrow(cx, cy, r, theta, state, d)
        if phase in ("estimate", "feedback"):
            if state.get("selected") is not None:
                selected = float(state["selected"])
                self._set_line(self.estimate, (cx, cy), (cx + r * math.sin(selected), cy + r * math.cos(selected)))
                self.estimate.draw()
            if phase == "feedback":
                truth = _float(state, ("truth", "feedback_target"), theta)
                self._set_line(self.truth, (cx, cy), (cx + r * math.sin(truth), cy + r * math.cos(truth)))
                self.truth.draw()
        if phase in ("motion", "blank") and bool(_first(d, "speed_color_strips", "use_color_strips", default=False)):
            omega = _float(state, ("omega_rad_sec", "omega_rad_per_sec", "omega"), 0.0)
            rod_length = _float(d, ("rod_length_m", "rodLengthM", "rod_length"), 4.0)
            self._draw_strips(g, abs(omega) * rod_length, d)

    def _draw_guide(self, cx: float, cy: float, r: float, regime: str, maximum: float,
                    color: Any, *, protocol: bool = False) -> None:
        """Browser-equivalent 8/6 dashed path, batched to avoid per-dash draws."""
        key = (cx, cy, r, regime, maximum, protocol, self.content_top)
        if key != self._guide_cache:
            half = math.radians(max(0.01, abs(maximum)))
            if regime == "rotation":
                pts = [(cx + r * math.cos(2 * math.pi * i / 180),
                        cy + r * math.sin(2 * math.pi * i / 180)) for i in range(181)]
            else:
                n = max(8, math.ceil(abs(maximum) / 90 * 24)) if not protocol else 96
                pts = [(cx + r * math.sin(-half + 2 * half * i / n),
                        cy + r * math.cos(-half + 2 * half * i / n)) for i in range(n + 1)]
                if protocol:
                    if abs(half - math.pi / 2) < 1e-6:
                        pts.append(pts[0])  # Protocol 2's diameter; no radial edges.
                else:
                    pts = [(cx, cy), *pts, (cx, cy)]
            centers, sizes, orientations = [], [], []
            distance = 0.0
            for p0, p1 in zip(pts, pts[1:]):
                dx, dy = p1[0] - p0[0], p1[1] - p0[1]
                length = math.hypot(dx, dy)
                used = 0.0
                while used < length - 1e-9:
                    cycle = distance % 14.0
                    ink = cycle < 8.0
                    step = min(length - used, (8.0 if ink else 14.0) - cycle)
                    if step < 1e-9:
                        distance += 1e-8
                        continue
                    if ink:
                        t = (used + step / 2) / length
                        centers.append(self._pix(p0[0] + t * dx, p0[1] + t * dy))
                        sizes.append((step * self.scale, 2 * self.scale))
                        orientations.append(math.degrees(math.atan2(dy, dx)))
                    used += step
                    distance += step
            count = len(centers)
            if count > 512:
                raise ValueError("Trajectory guide exceeds dash capacity")
            self.guide_dashes.xys = centers + [(0, 0)] * (512 - count)
            self.guide_dashes.sizes = sizes + [(0, 0)] * (512 - count)
            self.guide_dashes.oris = orientations + [0] * (512 - count)
            self._guide_cache = key
        self.guide_dashes.colors = color
        self.guide_dashes.draw()

    def _draw_direction_arrow(self, cx: float, cy: float, r: float, theta: float,
                              state: Mapping[str, Any], d: Any) -> None:
        omega = _float(state, ("omega_rad_sec", "omega_rad_per_sec", "omega"),
                       _float(d, ("omega_x_0_rad_per_sec", "omega0_rad_per_sec"), 1.0))
        direction = str(_first(state, "direction", default=_first(d, "initial_direction", "direction", default=""))).lower()
        if direction in ("left", "leftward", "counterclockwise"):
            sign = -1.0
        elif direction in ("right", "rightward", "clockwise"):
            sign = 1.0
        else:
            sign = -1.0 if omega < 0 else 1.0
        x, y = cx + r * 0.78 * math.sin(theta), cy + r * 0.78 * math.cos(theta)
        tangent = (math.cos(theta) * sign, -math.sin(theta) * sign)
        tip = (x + tangent[0] * 28, y + tangent[1] * 28)
        normal = (-tangent[1], tangent[0])
        head_a = (tip[0] - tangent[0] * 10 + normal[0] * 6,
                  tip[1] - tangent[1] * 10 + normal[1] * 6)
        head_b = (tip[0] - tangent[0] * 10 - normal[0] * 6,
                  tip[1] - tangent[1] * 10 - normal[1] * 6)
        self._set_vertices(self.direction_arrow, [(x, y), tip, head_a, tip, head_b])
        self.direction_arrow.draw()

    def _draw_strips(self, layout: dict[str, float], speed: float, d: Any) -> None:
        level = max(0.0, min(1.0, abs(speed) / max(1e-9, _float(d, ("speed_bar_v_max_m_per_sec", "v_max_m_per_sec"), 1.0))))
        rgb = _turbo(level)
        left, width = layout["anchor_x"] - layout["rod_px"], 2 * layout["rod_px"]
        top = layout["anchor_y"] - layout["rod_px"] - BOB_RADIUS - 4 - 28
        bottom = layout["anchor_y"] + layout["rod_px"] + BOB_RADIUS + 4
        for stim, y in ((self.footer_top, top), (self.footer_bottom, bottom)):
            stim.width, stim.height = width * self.scale, 28 * self.scale
            stim.pos = self._pix(left + width / 2, y + 14)
            stim.fillColor = rgb; stim.lineColor = rgb
            stim.draw()

    def _draw_training(self, state: dict[str, Any], d: Any, layout: dict[str, float]) -> None:
        y = CANVAS_H / 2
        span = _float(d, ("track_half_span_m",), 4.0)
        pxpm = layout["px_per_m"]
        left, right = CANVAS_W / 2 - span * pxpm, CANVAS_W / 2 + span * pxpm
        self._set_line(self.guide, (left, y), (right, y)); self.guide.lineColor = "#cbd5e1"; self.guide.lineWidth = 2; self.guide.draw()
        x_m = state.get("linear_x_m")
        if x_m is not None:
            self.bob.pos = self._pix(CANVAS_W / 2 + float(x_m) * pxpm, y)
            self.bob.radius = layout["bob_radius_px"] * self.scale
            self.bob.draw()

    def _draw_bell(self, cx: float, cy: float, rod_px: float, px_per_m: float,
                   theta: float) -> None:
        size = 0.18 * px_per_m
        # Sample the same two quadratic curves as protocol2Canvas.drawBell.
        outline = [(-.55, .35)]
        for start, control, end in (((-.55, .35), (-.5, -.55), (0, -.65)),
                                    ((0, -.65), (.5, -.55), (.55, .35))):
            for i in range(1, 17):
                t = i / 16
                outline.append(tuple((1 - t) ** 2 * start[j] +
                                     2 * (1 - t) * t * control[j] + t ** 2 * end[j]
                                     for j in (0, 1)))
        outline.extend([(.7, .55), (-.7, .55)])
        sin_t, cos_t = math.sin(theta), math.cos(theta)
        bx, by = cx + rod_px * sin_t, cy + rod_px * cos_t

        def rotated(x: float, y: float) -> tuple[float, float]:
            # Canvas rotates -theta before conversion to PsychoPy's y-up pixels.
            return bx + size * (cos_t * x + sin_t * y), by + size * (-sin_t * x + cos_t * y)

        self._set_vertices(self.bell, [rotated(x, y) for x, y in outline])
        self.bell.draw()
        self.bell_clapper.pos = self._pix(*rotated(0, .72))
        self.bell_clapper.radius = .13 * size * self.scale
        self.bell_clapper.draw()

    def _draw_e4e5(self, state: dict[str, Any], d: Any, layout: dict[str, float], theta: float,
                   alpha: float, phase: str, is_e5: bool) -> None:
        if phase == "cue":
            self._draw_guide(layout["origin_x"], layout["origin_y"], layout["rod_px"], "oscillation",
                             _float(d, ("amplitude_deg", "w_max_deg"), 90), GREY)
            self._draw_direction_arrow(layout["origin_x"], layout["origin_y"], layout["rod_px"], theta, state, d)
            return
        if is_e5 and phase == "estimate":
            return  # The keyboard judgment page has a blank canvas.
        replay = bool(state.get("replay", False)) or phase == "replay"
        speed_replay = replay and not is_e5 and state.get("response_mode") == "speed"
        if phase in ("estimate", "feedback") and not (is_e5 and replay) and not speed_replay:
            if state.get("response_mode") == "speed":
                return
            self._draw_guide(layout["origin_x"], layout["origin_y"], layout["rod_px"], "oscillation",
                             90, GREY if phase == "feedback" else ORANGE)
            cx, cy, r = layout["origin_x"], layout["origin_y"], layout["rod_px"]
            self.anchor.pos = self._pix(cx, cy)
            self.anchor.draw()
            if state.get("selected") is not None:
                selected = float(state["selected"])
                self._set_line(self.estimate, (cx, cy), (cx + r * math.sin(selected), cy + r * math.cos(selected)))
                self.estimate.draw()
            if phase == "feedback":
                truth = _float(state, ("truth", "feedback_target"), theta)
                self._set_line(self.truth, (cx, cy), (cx + r * math.sin(truth), cy + r * math.cos(truth)))
                self.truth.draw()
            return
        if alpha <= 0 and not speed_replay:
            return
        cx, cy, r, ppm = layout["origin_x"], layout["origin_y"], layout["rod_px"], layout["px_per_m"]
        bx, by = cx + r * math.sin(theta), cy + r * math.cos(theta)
        self.bob.pos = self._pix(bx, by); self.bob.radius = layout["bob_radius_px"] * self.scale
        self.bob.opacity = 1.0; self.bob.draw()
        self.anchor.pos = self._pix(cx, cy); self.anchor.draw()
        if is_e5:
            slit_l = _float(d, ("slit_left_m", "slitLeftM"), -0.1)
            slit_r = _float(d, ("slit_right_m", "slitRightM"), 0.1)
            fill = _first(d, "bar_fill", "occlusion_fill", default=BAR_FILL)
            for stim, left, width in ((self.slit_masks[0], 0, cx + slit_l * ppm),
                                      (self.slit_masks[1], cx + slit_r * ppm, CANVAS_W - cx - slit_r * ppm)):
                stim.width, stim.height = max(0, width) * self.scale, CANVAS_H * self.scale
                stim.pos = self._pix(left + width / 2, CANVAS_H / 2)
                stim.fillColor = BAR_FILL
                stim.lineColor = None
                stim.opacity = 0.42 if replay or "rgba" in str(fill) else 1.0
                stim.draw()
        elif not is_e5:
            period = _float(d, ("grating_period_m", "period_m", "gratingPeriodM"), 0.5)
            width_m = _float(d, ("bar_width_m", "barWidthM"), 0.15)
            offset = _float(d, ("grating_offset_m", "offset_m", "gratingOffsetM"), 0.0)
            if period > 0:
                # Match the browser's inclusive range on both sides. A total
                # count rounded down from the left can omit the rightmost bar.
                k0 = math.floor((-cx / ppm - offset) / period) - 1
                k1 = math.ceil(((CANVAS_W - cx) / ppm - offset) / period) + 1
                count = k1 - k0 + 1
                while len(self.bars) < count:
                    self.bars.append(self.visual.Rect(
                        self.win, width=1, height=CANVAS_H, fillColor=BAR_FILL,
                        lineColor=None, units="pix", autoLog=False))
                for i, k in enumerate(range(k0, k1 + 1)):
                    stim = self.bars[i]
                    center = cx + (offset + k * period) * ppm
                    half_width = width_m * ppm / 2
                    # Browser Canvas clips bars at its edges. PsychoPy draws
                    # into the whole window, so clip explicitly; otherwise bars
                    # in the side margins remain outside the scene fade layer.
                    left = max(0.0, center - half_width)
                    right = min(CANVAS_W, center + half_width)
                    if right <= left:
                        continue
                    stim.width, stim.height = (right - left) * self.scale, CANVAS_H * self.scale
                    stim.pos = self._pix((left + right) / 2, CANVAS_H / 2)
                    # These Rects also draw the speed-report gradient between trials.
                    stim.fillColor = BAR_FILL
                    stim.lineColor = None
                    stim.opacity = 0.42 if speed_replay else 1.0
                    stim.draw()
        if not is_e5:
            self._draw_guide(cx, cy, r, "oscillation", 90, GREY, protocol=True)
        self.anchor.draw()
        if is_e5 and (_first(state, "bell_theta_rad", "bell_theta_deg", default=None) is not None
                      or _first(d, "bell_theta_deg", "bellThetaDeg", default=None) is not None):
            bell_rad = _float(state, ("bell_theta_rad",), math.radians(
                _float(state, ("bell_theta_deg",), _float(d, ("bell_theta_deg",), 0.0))))
            self._draw_bell(cx, cy, r, ppm, bell_rad)
        if speed_replay:
            # Match the browser: disappearance becomes a translucent veil, not a blank.
            veil = (1.0 - alpha) * 0.45
            if veil > 0:
                self.fade_overlay.opacity = veil
                self.fade_overlay.draw()
                self.fade_overlay.opacity = 1.0
        elif alpha < 1.0:
            # Fade the composed canvas after the occluder so all scene layers fade together.
            self.fade_overlay.opacity = 1.0 - alpha
            self.fade_overlay.draw()
            self.fade_overlay.opacity = 1.0
