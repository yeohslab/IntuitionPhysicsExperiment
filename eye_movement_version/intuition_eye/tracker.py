"""EyeLink / dummy tracker adapters for the IntuitionPhysics experiment.

The dummy adapter deliberately imports no EyeLink or PsychoPy SDK.  Its event
records use ``time.perf_counter()`` seconds (monotonic, process-local), so they
are useful for ordering and interval measurements but are not wall-clock times
and do not represent gaze samples or an EDF file.
"""
from __future__ import annotations

import logging
import math
import re
import secrets
import string
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

_LOG = logging.getLogger(__name__)
EventSink = Callable[[dict[str, Any]], None]
TRIAL_RESULT_ERROR = 1

# Order and locations copied from the original MATLAB HV13 target table.
# Coordinates are normalized fractions of the display extent.
HV13_TARGETS: tuple[tuple[float, float], ...] = (
    (0.5, 0.5),
    (0.5, 0.25),
    (0.5, 0.75),
    (0.25, 0.5),
    (0.75, 0.5),
    (0.375, 0.375),
    (0.625, 0.375),
    (0.375, 0.625),
    (0.625, 0.625),
    (0.25, 0.25),
    (0.25, 0.75),
    (0.75, 0.25),
    (0.75, 0.75),
)


class TrackerError(RuntimeError):
    """Raised when tracker setup, recording, or cleanup fails."""


def _emit(sink: EventSink, event: str, **fields: Any) -> None:
    record = {"event": event, "monotonic_time": time.perf_counter(), **fields}
    try:
        sink(record)
    except Exception:
        _LOG.exception("Tracker event sink failed while recording %s", event)


def _default_config(config: Mapping[str, Any] | None) -> dict[str, Any]:
    cfg = dict(config or {})
    cfg.setdefault("ip", "100.1.1.1")
    cfg.setdefault("sample_rate", None)  # None means retain the host setting.
    cfg.setdefault("calibration_type", "HV13")
    cfg.setdefault("targets", HV13_TARGETS)
    cfg.setdefault("sequence", None)
    cfg.setdefault("background", (0, 0, 0))
    cfg.setdefault("drift_check", True)
    cfg.setdefault("dummy", None)
    cfg["targets"] = tuple(tuple(float(v) for v in point) for point in cfg["targets"])
    if not cfg["targets"] or any(len(p) != 2 for p in cfg["targets"]):
        raise ValueError("targets must contain at least one normalized (x, y) pair")
    if any(not all(math.isfinite(v) and 0.0 <= v <= 1.0 for v in p) for p in cfg["targets"]):
        raise ValueError("target coordinates must be finite normalized values in [0, 1]")
    seq = cfg["sequence"]
    cfg["sequence"] = tuple(range(len(cfg["targets"]))) if seq is None else tuple(int(v) for v in seq)
    if sorted(cfg["sequence"]) != list(range(len(cfg["targets"]))):
        raise ValueError("sequence must contain every target index exactly once")
    if str(cfg["calibration_type"]).upper() == "HV13" and len(cfg["targets"]) != 13:
        raise ValueError("HV13 requires exactly 13 explicitly defined targets")
    if cfg["sample_rate"] is not None and int(cfg["sample_rate"]) <= 0:
        raise ValueError("sample_rate must be a positive integer or None")
    return cfg


def _status_failed(value: Any) -> bool:
    """Interpret EyeLink C-style status returns (zero means success)."""
    return value is not None and value is not True and value != 0


def _host_edf_name() -> str:
    # EDF host names are restricted to eight ASCII characters by EyeLink.
    return "E" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def make_tracker(mode: str, config: dict, event_sink: EventSink):
    """Construct a ``dummy`` or ``real`` adapter.

    Real mode imports PyLink only when explicitly requested and never falls
    back to dummy mode if the SDK, connection, or tracker setup fails.
    """
    if not callable(event_sink):
        raise TypeError("event_sink must be callable")
    cfg = _default_config(config)
    normalized_mode = str(mode).lower()
    if normalized_mode == "dummy":
        return DummyTracker(cfg, event_sink)
    if normalized_mode not in ("real", "eyelink"):
        raise ValueError("mode must be 'dummy', 'real', or 'eyelink'")
    try:
        import pylink  # type: ignore[import-not-found]
    except ImportError as exc:
        raise TrackerError("Real EyeLink mode requires the SR Research PyLink SDK") from exc
    try:
        tracker = pylink.EyeLink(str(cfg["ip"]))
    except Exception as exc:
        raise TrackerError(f"Could not connect to EyeLink at {cfg['ip']}: {exc}") from exc
    return EyeLinkTracker(cfg, event_sink, pylink, tracker)


class DummyTracker:
    """No-device adapter that emits monotonic lifecycle records only."""

    def __init__(self, config: dict[str, Any], event_sink: EventSink):
        self.config, self._sink = config, event_sink
        self._setup = False
        self._recording = False
        self._trial_id: str | None = None
        self._closed = False
        self._metadata: dict[str, Any] = {
            "mode": "dummy",
            "device_version": None,
            "sample_rate": config["sample_rate"],
            "host_edf": None,
            "edf_created": False,
            "clock": "time.perf_counter seconds (monotonic, process-local)",
        }

    def setup(self, window: Any, display_size: tuple[int, int]) -> dict[str, Any]:
        self._assert_open()
        width, height = _validate_display_size(display_size)
        self._setup = True
        self._metadata.update({"display_size": (width, height), "screen_pixel_coords": (0, 0, width - 1, height - 1)})
        _emit(self._sink, "setup", mode="dummy", display_size=(width, height), metadata=dict(self._metadata))
        return dict(self._metadata)

    def calibrate(self) -> None:
        self._require_setup()
        _emit(self._sink, "calibrate", mode="dummy", calibration_type=self.config["calibration_type"], target_count=len(self.config["targets"]))

    def drift_check(self) -> None:
        self._require_setup()
        if self.config["drift_check"]:
            _emit(self._sink, "drift_check", mode="dummy")

    def start_trial(self, trial_id: str, variables: dict) -> None:
        self._require_setup()
        if self._recording:
            raise TrackerError("Cannot start a trial while another trial is recording")
        self._recording, self._trial_id = True, str(trial_id)
        _emit(self._sink, "start_trial", mode="dummy", trial_id=str(trial_id), variables=dict(variables))
        _emit(self._sink, "message", mode="dummy", text=f"TRIALID {trial_id}")
        for key, value in variables.items():
            _emit(self._sink, "message", mode="dummy", text=f"!V TRIAL_VAR {key} {value}")

    def message(self, text: str) -> None:
        self._assert_open()
        _emit(self._sink, "message", mode="dummy", text=str(text))

    def check_recording(self) -> None:
        self._assert_open()
        if not self._recording:
            raise TrackerError("EyeLink dummy adapter is not recording")

    def stop_trial(self, result: int = 0) -> None:
        if not self._recording:
            return
        _emit(self._sink, "message", mode="dummy", text=f"TRIAL_RESULT {int(result)}")
        _emit(self._sink, "stop_trial", mode="dummy", trial_id=self._trial_id, result=int(result))
        self._recording, self._trial_id = False, None

    def close(self, local_edf: Path) -> dict[str, Any]:
        if self._closed:
            return {**self._metadata, "status": "closed", "downloaded": False, "local_edf": str(local_edf)}
        if self._recording:
            self.stop_trial(result=0)
        self._closed = True
        result = {**self._metadata, "status": "closed", "downloaded": False, "local_edf": str(local_edf)}
        _emit(self._sink, "close", mode="dummy", local_edf=str(local_edf), edf_created=False)
        return result

    def _assert_open(self) -> None:
        if self._closed:
            raise TrackerError("Tracker adapter is closed")

    def _require_setup(self) -> None:
        self._assert_open()
        if not self._setup:
            raise TrackerError("Tracker setup must complete before this operation")


def _validate_display_size(size: Sequence[int]) -> tuple[int, int]:
    if len(size) != 2:
        raise ValueError("display_size must be (width, height)")
    width, height = int(size[0]), int(size[1])
    if width <= 0 or height <= 0:
        raise ValueError("display dimensions must be positive")
    return width, height


class EyeLinkTracker:
    """PyLink-backed adapter; SDK and PsychoPy graphics are injected/lazy."""

    def __init__(self, config: dict[str, Any], event_sink: EventSink, pylink: Any, tracker: Any):
        self.config, self._sink = config, event_sink
        self._pylink, self._tracker = pylink, tracker
        self._width = self._height = 0
        self._setup_complete = False
        self._recording = False
        self._trial_id: str | None = None
        self._closed = False
        self._edf_open = False
        self._connected = True
        self._targets_configured = False
        self.host_edf = _host_edf_name()
        self._metadata: dict[str, Any] = {
            "mode": "real", "ip": config["ip"], "host_edf": self.host_edf,
            "sample_rate": config["sample_rate"], "device_version": None,
            "screen_pixel_coords": None, "display_size": None,
        }

    def setup(self, window: Any, display_size: tuple[int, int]) -> dict[str, Any]:
        self._assert_open()
        self._width, self._height = _validate_display_size(display_size)
        if not hasattr(window, "callOnFlip"):
            # Actual PsychoPy windows expose callOnFlip; requiring it here
            # prevents silently accepting a non-PsychoPy calibration surface.
            raise TrackerError("setup requires a PsychoPy Window with callOnFlip")
        try:
            version = self._tracker.getTrackerVersion()
            self._metadata["device_version"] = version[1] if isinstance(version, tuple) and len(version) > 1 else version
            self._send_command("link_event_data = GAZE,GAZERES,HREF,AREA,VELOCITY")
            self._send_command("link_event_filter = LEFT,RIGHT,FIXATION,BLINK,SACCADE,BUTTON")
            if self.config["sample_rate"] is not None:
                self._send_command(f"sample_rate = {int(self.config['sample_rate'])}")
                self._metadata["sample_rate"] = int(self.config["sample_rate"])
            self._open_edf()
            right, bottom = self._width - 1, self._height - 1
            self._send_command(f"screen_pixel_coords = 0 0 {right} {bottom}")
            self._send_message(f"DISPLAY_COORDS 0 0 {right} {bottom}")
            self._send_command(f"calibration_type = {self.config['calibration_type']}")
            self._send_command("generate_default_targets = NO")
            self._targets_configured = True
            self._configure_targets()
            self._install_graphics(window)
            self._setup_complete = True
            self._metadata.update({"display_size": (self._width, self._height), "screen_pixel_coords": (0, 0, right, bottom)})
            _emit(self._sink, "setup", mode="real", metadata=dict(self._metadata))
            return dict(self._metadata)
        except Exception as exc:
            _emit(self._sink, "error", mode="real", stage="setup", error=str(exc), host_edf=self.host_edf)
            if isinstance(exc, TrackerError):
                raise
            raise TrackerError(f"EyeLink setup failed (host EDF {self.host_edf}): {exc}") from exc

    def calibrate(self) -> None:
        self._require_setup()
        try:
            result = self._tracker.doTrackerSetup()
            if _status_failed(result):
                raise TrackerError(f"Tracker calibration failed with status {result}")
            _emit(self._sink, "calibrate", mode="real", calibration_type=self.config["calibration_type"])
        except Exception as exc:
            _emit(self._sink, "error", mode="real", stage="calibrate", error=str(exc), host_edf=self.host_edf)
            if isinstance(exc, TrackerError):
                raise
            raise TrackerError(f"EyeLink calibration failed: {exc}") from exc

    def drift_check(self) -> None:
        self._require_setup()
        if not self.config["drift_check"]:
            return
        x, y = self._width // 2, self._height // 2
        try:
            result = self._tracker.doDriftCorrect(x, y, 1, 1)
            if _status_failed(result):
                raise TrackerError(f"Tracker drift check failed with status {result}")
            _emit(self._sink, "drift_check", mode="real", x=x, y=y)
        except Exception as exc:
            _emit(self._sink, "error", mode="real", stage="drift_check", error=str(exc), host_edf=self.host_edf)
            if isinstance(exc, TrackerError):
                raise
            raise TrackerError(f"EyeLink drift check failed: {exc}") from exc

    def start_trial(self, trial_id: str, variables: dict) -> None:
        self._require_setup()
        if self._recording:
            raise TrackerError("Cannot start a trial while another trial is recording")
        trial_id = _safe_message_token(str(trial_id))
        start_attempted = False
        try:
            start_attempted = True
            result = self._tracker.startRecording(1, 1, 1, 1)
            if _status_failed(result):
                raise TrackerError(f"startRecording failed with status {result}")
            self._recording = True
            wait = getattr(self._tracker, "waitForBlockStart", None)
            if callable(wait):
                status = wait(1000, 1, 1)
                # Unlike startRecording's C-style status, this is a data-ready
                # predicate: PyLink returns 0 on timeout and a positive value
                # when a recording block arrives. Never accept a timed-out link.
                if status is None or status <= 0:
                    raise TrackerError(f"waitForBlockStart timed out or failed with status {status}")
            else:
                # SDK's normal pump is bounded and only used once per trial.
                self._pylink.pumpDelay(100)
            self._send_message(f"TRIALID {trial_id}")
            for key, value in variables.items():
                safe_key = _safe_message_token(str(key))
                safe_value = str(value).replace("\r", " ").replace("\n", " ")
                self._send_message(f"!V TRIAL_VAR {safe_key} {safe_value}")
            self._trial_id = trial_id
            _emit(self._sink, "start_trial", mode="real", trial_id=trial_id, variables=dict(variables), host_edf=self.host_edf)
        except Exception as exc:
            # If startRecording succeeded but a later stage failed, ensure the
            # recording is stopped before propagating the error.
            if self._recording:
                try:
                    self.stop_trial(result=TRIAL_RESULT_ERROR)
                except Exception:
                    _LOG.exception("Failed to stop recording after trial-start error")
            elif start_attempted:
                # A nonzero return or exception can occur after the tracker
                # accepted the request. Make a best-effort stop regardless.
                try:
                    self._tracker.stopRecording()
                    pump = getattr(self._pylink, "pumpDelay", None)
                    if callable(pump):
                        pump(100)
                except Exception:
                    _LOG.exception("Failed to stop EyeLink after startRecording error")
            _emit(self._sink, "error", mode="real", stage="start_trial", error=str(exc), host_edf=self.host_edf)
            if isinstance(exc, TrackerError):
                raise
            raise TrackerError(f"Could not start EyeLink trial: {exc}") from exc

    def message(self, text: str) -> None:
        self._assert_open()
        self._send_message(str(text))
        _emit(self._sink, "message", mode="real", text=str(text))

    def check_recording(self) -> None:
        self._assert_open()
        if not self._recording:
            raise TrackerError("EyeLink is not recording a trial")
        try:
            is_recording = getattr(self._tracker, "isRecording", None)
            if not callable(is_recording):
                raise TrackerError("PyLink tracker does not expose isRecording()")
            status = is_recording()
            # PyLink releases commonly return TRIAL_OK (often integer 0) while
            # recording, whereas wrappers may return a boolean. Prefer the
            # installed SDK constant to avoid confusing success with False.
            trial_ok = getattr(self._pylink, "TRIAL_OK", None)
            if isinstance(status, bool):
                active = status
            elif trial_ok is not None:
                active = status == trial_ok
            else:
                active = bool(status)
            if not active:
                self._recording = False
                raise TrackerError("EyeLink recording has stopped unexpectedly")
        except Exception as exc:
            _emit(self._sink, "error", mode="real", stage="check_recording", error=str(exc), host_edf=self.host_edf)
            if isinstance(exc, TrackerError):
                raise
            raise TrackerError(f"EyeLink recording status check failed: {exc}") from exc

    def stop_trial(self, result: int = 0) -> None:
        if not self._recording:
            return
        errors: list[str] = []
        try:
            self._send_message(f"TRIAL_RESULT {int(result)}")
        except Exception as exc:
            errors.append(f"TRIAL_RESULT message: {exc}")
        try:
            stop_result = self._tracker.stopRecording()
            if _status_failed(stop_result):
                errors.append(f"stopRecording status {stop_result}")
        except Exception as exc:
            errors.append(f"stopRecording: {exc}")
        finally:
            self._recording = False
            trial_id = self._trial_id
            self._trial_id = None
        # Ensure delayed samples/events are flushed; this happens once at trial
        # end, never from per-frame code.
        try:
            pump = getattr(self._pylink, "pumpDelay", None)
            if callable(pump):
                pump(100)
        except Exception as exc:
            errors.append(f"100 ms event tail: {exc}")
        _emit(self._sink, "stop_trial", mode="real", trial_id=trial_id, result=int(result), errors=list(errors))
        if errors:
            raise TrackerError("; ".join(errors))

    def close(self, local_edf: Path) -> dict[str, Any]:
        if self._closed:
            warnings = list(self._metadata.get("cleanup_warnings", []))
            return {**self._metadata, "status": "closed_with_warnings" if warnings else "closed", "downloaded": bool(self._metadata.get("downloaded")), "local_edf": str(local_edf), "warnings": warnings}
        warnings: list[str] = []
        if self._recording:
            try:
                self.stop_trial(result=0)
            except Exception as exc:
                warnings.append(f"stop recording: {exc}")
        # Restore EyeLink's standard target generator even after partial setup.
        if self._connected:
            try:
                self._send_command("generate_default_targets = YES")
            except Exception as exc:
                warnings.append(f"restore generate_default_targets: {exc}")
        if self._edf_open:
            try:
                close_result = self._tracker.closeDataFile()
                if _status_failed(close_result):
                    warnings.append(f"closeDataFile status {close_result}")
                else:
                    self._edf_open = False
            except Exception as exc:
                warnings.append(f"close EDF: {exc}")
            # Attempt transfer even if closeDataFile reported an error: the
            # host may still have a recoverable EDF and receiveDataFile gives
            # us the final status.
            try:
                receive_result = self._tracker.receiveDataFile(self.host_edf, str(local_edf))
                if _status_failed(receive_result):
                    warning = f"receiveDataFile status {receive_result}; host EDF {self.host_edf} is available for manual recovery"
                    warnings.append(warning)
                    _LOG.error("EDF download failed with status %s; host file %s is available for manual recovery", receive_result, self.host_edf)
                    _emit(self._sink, "download_failed", mode="real", host_edf=self.host_edf, local_edf=str(local_edf), error=warning)
                else:
                    self._metadata["downloaded"] = True
            except Exception as exc:
                warning = f"download EDF: {exc}; host EDF {self.host_edf} is available for manual recovery"
                warnings.append(warning)
                _LOG.exception("EDF download failed; host file %s is available for manual recovery", self.host_edf)
                _emit(self._sink, "download_failed", mode="real", host_edf=self.host_edf, local_edf=str(local_edf), error=str(exc))
        try:
            close = getattr(self._tracker, "close", None)
            if callable(close):
                close()
            self._connected = False
        except Exception as exc:
            warnings.append(f"disconnect tracker: {exc}")
        self._closed = True
        self._metadata["cleanup_warnings"] = warnings
        status = "closed" if not warnings else "closed_with_warnings"
        result = {**self._metadata, "status": status, "downloaded": bool(self._metadata.get("downloaded", False)), "local_edf": str(local_edf), "warnings": warnings}
        _emit(self._sink, "close", **result)
        return result

    def _configure_targets(self) -> None:
        targets = self.config["targets"]
        seq = self.config["sequence"]
        self._send_command(f"calibration_samples = {len(targets)}")
        self._send_command("calibration_sequence = " + ",".join(str(i) for i in seq))
        self._send_command("calibration_targets = " + _format_targets(targets, self._width, self._height))
        self._send_command(f"validation_samples = {len(targets)}")
        self._send_command("validation_sequence = " + ",".join(str(i) for i in seq))
        self._send_command("validation_targets = " + _format_targets(targets, self._width, self._height))

    def _install_graphics(self, window: Any) -> None:
        # SR Research's PsychoPy bridge is distributed with the EyeLink
        # Developer Kit as EyeLinkCoreGraphicsPsychoPy.py.
        try:
            from EyeLinkCoreGraphicsPsychoPy import EyeLinkCoreGraphicsPsychoPy  # type: ignore[import-not-found]
        except ImportError as exc:
            raise TrackerError("EyeLink Developer Kit module EyeLinkCoreGraphicsPsychoPy is required for real calibration") from exc
        graphics = EyeLinkCoreGraphicsPsychoPy(self._tracker, window)
        color = self.config["background"]
        set_colors = getattr(graphics, "setCalibrationColors", None)
        if callable(set_colors):
            set_colors("white", color)
        set_target = getattr(graphics, "setTargetType", None)
        if callable(set_target):
            set_target("circle")
        self._pylink.openGraphicsEx(graphics)

    def _open_edf(self) -> None:
        result = self._tracker.openDataFile(self.host_edf)
        if _status_failed(result):
            raise TrackerError(f"openDataFile({self.host_edf}) failed with status {result}")
        self._edf_open = True

    def _send_command(self, command: str) -> None:
        result = self._tracker.sendCommand(command)
        if _status_failed(result):
            raise TrackerError(f"EyeLink command failed ({result}): {command}")

    def _send_message(self, text: str) -> None:
        result = self._tracker.sendMessage(text)
        if _status_failed(result):
            raise TrackerError(f"EyeLink message failed ({result}): {text}")

    def _assert_open(self) -> None:
        if self._closed:
            raise TrackerError("Tracker adapter is closed")

    def _require_setup(self) -> None:
        self._assert_open()
        if not self._setup_complete:
            raise TrackerError("Tracker setup must complete before this operation")


def _format_targets(targets: Sequence[Sequence[float]], width: int, height: int) -> str:
    coords: list[str] = []
    for x, y in targets:
        # Match the reference MATLAB coordinates (fractions of width/height),
        # while bounding edge values to the actual framebuffer dimensions.
        px = min(width - 1, max(0, int(round(x * width))))
        py = min(height - 1, max(0, int(round(y * height))))
        coords.append(f"{px},{py}")
    return " ".join(coords)


def _safe_message_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]", "_", value)
    return token or "unknown"
