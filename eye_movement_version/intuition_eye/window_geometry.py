"""Measured desktop geometry for the launcher's bordered PsychoPy window.

Window sizes are in pyglet/PsychoPy *client* coordinates, never framebuffer
pixels. The selected window follows the requested 2560:1600 (16:10) ratio;
logical scene geometry remains the renderer's responsibility.
No DPI multiplier is inferred from Tk scaling, OS settings, or screen names.
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass

WINDOW_PERCENTAGES = (50, 60, 70, 80, 90, 100)
DEFAULT_WINDOW_PERCENT = 80
WINDOW_ASPECT = (16, 10)


@dataclass(frozen=True)
class WindowArea:
    """Target screen, work area and decorations in client-coordinate units.

    Rectangles use (left, top, right, bottom); decorations use the same edge
    order. Keep edge insets separate: a title bar is taller than a bottom edge.
    """

    screen: tuple[float, float, float, float]
    work: tuple[float, float, float, float]
    decorations: tuple[float, float, float, float]


def window_size_for_percent(percent, area):
    """Fit a 16:10 client area and its borders at PsychoPy's default center.

    100% is the largest centered client area that leaves the entire decorated
    window in the measured work area. Other percentages scale that area's
    width and height before fitting the fixed frame aspect ratio.
    """
    if isinstance(percent, bool) or percent not in WINDOW_PERCENTAGES:
        raise ValueError('窗口大小须为 50%、60%、70%、80%、90% 或 100%。')
    values = (*area.screen, *area.work, *area.decorations)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
        raise ValueError('屏幕工作区域包含无效坐标。')
    sl, st, sr, sb = area.screen
    wl, wt, wr, wb = area.work
    dl, dt, dr, db = area.decorations
    if not (sl <= wl < wr <= sr and st <= wt < wb <= sb) or min(dl, dt, dr, db) < 0:
        raise ValueError('无法确定屏幕可用工作区域或窗口边框。')
    cx, cy = (sl + sr) / 2, (st + sb) / 2
    # PsychoPy centers the client area, rather than the outer window. Account
    # for each edge and one coordinate unit of integer positioning rounding.
    width = 2 * min(cx - wl - dl, wr - cx - dr) - 2
    height = 2 * min(cy - wt - dt, wb - cy - db) - 2
    scale = min(width / WINDOW_ASPECT[0], height / WINDOW_ASPECT[1]) * percent / 100
    size = [math.floor(WINDOW_ASPECT[0] * scale), math.floor(WINDOW_ASPECT[1] * scale)]
    if min(size) < 100:
        raise ValueError('屏幕可用区域太小，无法容纳实验窗口。')
    return size


def area_in_client_coordinates(screen, work, outer, client, client_origin, requested_size):
    """Convert native measurements using the probe's measured client ratio.

    This works whether the native APIs expose logical coordinates or physical
    pixels. It does not assume a Retina/HiDPI scale such as 1, 1.25 or 2.
    All native rectangles must come from the same API/DPI context.
    """
    cw, ch = client[2] - client[0], client[3] - client[1]
    if cw <= 0 or ch <= 0:
        raise ValueError('无法读取实际窗口客户区。')
    sx, sy = requested_size[0] / cw, requested_size[1] / ch
    if not all(math.isfinite(s) and s > 0 for s in (sx, sy)):
        raise ValueError('无法转换窗口坐标。')

    def rect(value):
        return (value[0] * sx, value[1] * sy, value[2] * sx, value[3] * sy)

    x, y = client_origin
    decorations = ((x - outer[0]) * sx, (y - outer[1]) * sy,
                   (outer[2] - x - cw) * sx, (outer[3] - y - ch) * sy)
    return WindowArea(rect(screen), rect(work), decorations)


def _windows_area(screen, probe):
    """Read work area and the actual pyglet window frame in one Win32 context."""
    import ctypes
    from ctypes import wintypes

    class MonitorInfo(ctypes.Structure):
        _fields_ = [('cbSize', wintypes.DWORD), ('rcMonitor', wintypes.RECT),
                    ('rcWork', wintypes.RECT), ('dwFlags', wintypes.DWORD)]

    user32 = ctypes.WinDLL('user32', use_last_error=True)
    user32.GetMonitorInfoW.argtypes = (wintypes.HANDLE, ctypes.POINTER(MonitorInfo))
    user32.GetMonitorInfoW.restype = wintypes.BOOL
    user32.GetWindowRect.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.RECT))
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.GetClientRect.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.RECT))
    user32.GetClientRect.restype = wintypes.BOOL
    user32.ClientToScreen.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.POINT))
    user32.ClientToScreen.restype = wintypes.BOOL
    info = MonitorInfo()
    info.cbSize = ctypes.sizeof(info)
    outer, client, origin = wintypes.RECT(), wintypes.RECT(), wintypes.POINT()
    hwnd = probe._hwnd
    calls = ((user32.GetMonitorInfoW, (screen._handle, ctypes.byref(info))),
             (user32.GetWindowRect, (hwnd, ctypes.byref(outer))),
             (user32.GetClientRect, (hwnd, ctypes.byref(client))),
             (user32.ClientToScreen, (hwnd, ctypes.byref(origin))))
    for function, arguments in calls:
        if not function(*arguments):
            raise ctypes.WinError(ctypes.get_last_error())

    def rect(value):
        return (value.left, value.top, value.right, value.bottom)

    area = area_in_client_coordinates(rect(info.rcMonitor), rect(info.rcWork),
                                      rect(outer), rect(client), (origin.x, origin.y),
                                      probe.get_size())
    # Pyglet's screen rectangle must agree with its measured client units. If
    # toolkits use incompatible DPI contexts, fail visibly rather than guess.
    expected = (screen.width, screen.height)
    actual = (area.screen[2] - area.screen[0], area.screen[3] - area.screen[1])
    if any(abs(a - b) > 1 for a, b in zip(actual, expected)):
        raise RuntimeError('屏幕与 PsychoPy 客户区坐标单位不一致；请检查显示缩放配置。')
    return area


def measure_window_area(screen_index=0):
    """Measure the same screen/style used by PsychoPy's pyglet backend.

    The temporary window is hidden and always closed, including on failure.
    Windows is the supported acquisition platform. On other platforms we do
    not substitute total screen resolution for an unknown usable work area.
    """
    if sys.platform != 'win32':
        raise RuntimeError('此平台尚不能读取可靠的屏幕工作区；请通过命令行 --config 指定窗口尺寸。')
    from pyglet import canvas
    from pyglet.window import Window

    screens = canvas.get_display().get_screens()
    if isinstance(screen_index, bool) or not isinstance(screen_index, int) or not 0 <= screen_index < len(screens):
        raise ValueError('配置的实验屏幕不可用。')
    screen = screens[screen_index]
    probe = Window(width=250, height=190, screen=screen, visible=False,
                   style=Window.WINDOW_STYLE_DEFAULT, resizable=False)
    try:
        # A screen argument selects pyglet's GL configuration; on Windows it
        # does not necessarily place a window there. Move before measuring so
        # decorations and client coordinates belong to the target monitor.
        probe.set_location(screen.x + (screen.width - 250) // 2,
                           screen.y + (screen.height - 190) // 2)
        probe.dispatch_events()
        return _windows_area(screen, probe)
    finally:
        probe.close()


def selected_window_size(percent=DEFAULT_WINDOW_PERCENT, screen_index=0):
    return window_size_for_percent(percent, measure_window_area(screen_index))
