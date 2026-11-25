from __future__ import annotations

import re
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

# The assigned tracker package is intentionally independent of PsychoPy.
PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from intuition_eye import tracker as tracker_module  # noqa: E402


class FakeWindow:
    def callOnFlip(self, *args, **kwargs):
        pass


class FakeGraphics:
    def __init__(self, tracker, window):
        self.tracker = tracker
        self.window = window
        self.colors = None
        self.target_type = None

    def setCalibrationColors(self, foreground, background):
        self.colors = foreground, background

    def setTargetType(self, target_type):
        self.target_type = target_type


class FakeTracker:
    def __init__(self, fail_open=False, fail_start=False, fail_download=False, fail_command=None):
        self.calls = []
        self.fail_open = fail_open
        self.fail_start = fail_start
        self.fail_download = fail_download
        self.fail_command = fail_command
        self.recording = False

    def getTrackerVersion(self):
        self.calls.append(("getTrackerVersion",))
        return (3, "EYELINK CL 5.0")

    def sendCommand(self, command):
        self.calls.append(("sendCommand", command))
        return 7 if self.fail_command and self.fail_command in command else 0

    def sendMessage(self, text):
        self.calls.append(("sendMessage", text))
        return 0

    def openDataFile(self, name):
        self.calls.append(("openDataFile", name))
        return 5 if self.fail_open else 0

    def closeDataFile(self):
        self.calls.append(("closeDataFile",))
        return 0

    def receiveDataFile(self, host, local):
        self.calls.append(("receiveDataFile", host, local))
        if self.fail_download:
            raise OSError("network copy failed")
        return 0

    def doTrackerSetup(self):
        self.calls.append(("doTrackerSetup",))
        return 0

    def doDriftCorrect(self, *args):
        self.calls.append(("doDriftCorrect", *args))
        return 0

    def startRecording(self, *args):
        self.calls.append(("startRecording", *args))
        if self.fail_start:
            return 9
        self.recording = True
        return 0

    def waitForBlockStart(self, *args):
        self.calls.append(("waitForBlockStart", *args))
        return 1  # PyLink returns zero on timeout; positive means a block arrived.

    def isRecording(self):
        return self.recording

    def stopRecording(self):
        self.calls.append(("stopRecording",))
        self.recording = False
        return 0

    def close(self):
        self.calls.append(("close",))


class FakePyLink(types.ModuleType):
    def __init__(self, tracker):
        super().__init__("pylink")
        self.fake_tracker = tracker
        self.graphics = None
        self.delays = []

    def EyeLink(self, ip):
        self.ip = ip
        if isinstance(self.fake_tracker, Exception):
            raise self.fake_tracker
        return self.fake_tracker

    def openGraphicsEx(self, graphics):
        self.graphics = graphics

    def pumpDelay(self, milliseconds):
        self.delays.append(milliseconds)


class TrackerTests(unittest.TestCase):
    def build_real(self, fake_tracker=None, config=None, events=None):
        fake_tracker = fake_tracker or FakeTracker()
        pylink = FakePyLink(fake_tracker)
        cg = types.ModuleType("EyeLinkCoreGraphicsPsychoPy")
        cg.EyeLinkCoreGraphicsPsychoPy = FakeGraphics
        patches = mock.patch.dict(sys.modules, {"pylink": pylink, "EyeLinkCoreGraphicsPsychoPy": cg})
        patches.start()
        self.addCleanup(patches.stop)
        adapter = tracker_module.make_tracker("real", config or {}, (events if events is not None else lambda event: None))
        return adapter, fake_tracker, pylink

    def test_hv13_count_sequence_coordinates_and_framebuffer_commands(self):
        adapter, fake, pylink = self.build_real()
        window = FakeWindow()
        metadata = adapter.setup(window, (1280, 1024))
        adapter.calibrate()
        adapter.drift_check()
        commands = [c[1] for c in fake.calls if c[0] == "sendCommand"]
        self.assertIn("screen_pixel_coords = 0 0 1279 1023", commands)
        self.assertIn("calibration_samples = 13", commands)
        self.assertIn("validation_samples = 13", commands)
        self.assertIn("calibration_sequence = 0,1,2,3,4,5,6,7,8,9,10,11,12", commands)
        target_line = next(c.split(" = ", 1)[1] for c in commands if c.startswith("calibration_targets ="))
        expected = "640,512 640,256 640,768 320,512 960,512 480,384 800,384 480,640 800,640 320,256 320,768 960,256 960,768"
        self.assertEqual(target_line, expected)
        self.assertEqual(len(target_line.split()), 13)
        self.assertEqual(metadata["display_size"], (1280, 1024))
        self.assertEqual(metadata["screen_pixel_coords"], (0, 0, 1279, 1023))
        self.assertRegex(adapter.host_edf, r"^[A-Z0-9]{1,8}$")
        self.assertIn(("doTrackerSetup",), fake.calls)
        self.assertIn(("doDriftCorrect", 640, 512, 1, 1), fake.calls)
        self.assertEqual(pylink.graphics.colors, ("white", (0, 0, 0)))
        self.assertEqual(pylink.graphics.target_type, "circle")
        self.assertIs(pylink.graphics.window, window)
        adapter.close(Path("result.edf"))

    def test_start_trial_order_and_result_messages(self):
        adapter, fake, pylink = self.build_real()
        adapter.setup(FakeWindow(), (640, 480))
        adapter.start_trial("trial-1", {"condition": "A", "n": 3})
        calls = fake.calls
        start = next(i for i, call in enumerate(calls) if call[0] == "startRecording")
        wait = next(i for i, call in enumerate(calls) if call[0] == "waitForBlockStart")
        trialid = next(i for i, call in enumerate(calls) if call[:2] == ("sendMessage", "TRIALID trial-1"))
        var = next(i for i, call in enumerate(calls) if call[:2] == ("sendMessage", "!V TRIAL_VAR condition A"))
        self.assertLess(start, wait)
        self.assertLess(wait, trialid)
        self.assertLess(trialid, var)
        adapter.check_recording()
        adapter.message("STATE stimulus_on")
        adapter.stop_trial(result=0)
        self.assertIn(("sendMessage", "TRIAL_RESULT 0"), fake.calls)
        self.assertEqual(pylink.delays, [100])  # one bounded event-tail flush after stop
        adapter.close(Path("result.edf"))

    def test_wait_for_block_start_uses_data_ready_predicate(self):
        # PyLink documents zero as timeout here, unlike startRecording status.
        for status in (1, True, 2, 0, False, -1, None):
            with self.subTest(status=status):
                adapter, fake, _ = self.build_real()
                adapter.setup(FakeWindow(), (640, 480))
                with mock.patch.object(fake, "waitForBlockStart", return_value=status):
                    if status is not None and status > 0:
                        adapter.start_trial("t", {})
                        adapter.check_recording()
                        adapter.stop_trial()
                    else:
                        with self.assertRaisesRegex(tracker_module.TrackerError, "waitForBlockStart"):
                            adapter.start_trial("t", {})
                        self.assertFalse(fake.recording)
                        self.assertIn(("stopRecording",), fake.calls)
                        self.assertNotIn(("sendMessage", "TRIALID t"), fake.calls)
                adapter.close(Path("result.edf"))
                self.assertIn(("closeDataFile",), fake.calls)
                self.assertTrue(any(c[0] == "receiveDataFile" for c in fake.calls))
                self.assertIn(("close",), fake.calls)

    def test_recording_status_accepts_sdk_trial_ok_and_rejects_abort(self):
        adapter, fake, pylink = self.build_real()
        pylink.TRIAL_OK = 0
        adapter.setup(FakeWindow(), (640, 480))
        adapter.start_trial("t", {})
        with mock.patch.object(fake, "isRecording", return_value=0):
            adapter.check_recording()
        with mock.patch.object(fake, "isRecording", return_value=3):
            with self.assertRaisesRegex(tracker_module.TrackerError, "stopped unexpectedly"):
                adapter.check_recording()
        adapter.close(Path("result.edf"))

    def test_start_recording_failure_raises_and_cleanup_still_runs(self):
        adapter, fake, _ = self.build_real(FakeTracker(fail_start=True))
        adapter.setup(FakeWindow(), (100, 80))
        with self.assertRaises(tracker_module.TrackerError):
            adapter.start_trial("t", {})
        self.assertIn(("stopRecording",), fake.calls)  # best effort after a failed start request
        adapter.close(Path("result.edf"))
        self.assertIn(("sendCommand", "generate_default_targets = YES"), fake.calls)
        self.assertIn(("closeDataFile",), fake.calls)
        self.assertIn(("close",), fake.calls)

    def test_open_edf_failure_raises_and_close_restores_and_disconnects(self):
        adapter, fake, _ = self.build_real(FakeTracker(fail_open=True))
        with self.assertRaises(tracker_module.TrackerError):
            adapter.setup(FakeWindow(), (100, 80))
        result = adapter.close(Path("result.edf"))
        self.assertEqual(result["status"], "closed")
        self.assertIn(("sendCommand", "generate_default_targets = YES"), fake.calls)
        self.assertIn(("close",), fake.calls)
        self.assertFalse(any(c[0] == "receiveDataFile" for c in fake.calls))

    def test_edf_download_failure_reports_host_filename(self):
        events = []
        adapter, fake, _ = self.build_real(FakeTracker(fail_download=True), events=events.append)
        adapter.setup(FakeWindow(), (100, 80))
        with self.assertLogs(tracker_module._LOG, level="ERROR"):
            result = adapter.close(Path("result.edf"))
        self.assertEqual(adapter.close(Path("result.edf"))["status"], "closed_with_warnings")
        self.assertEqual(result["status"], "closed_with_warnings")
        self.assertFalse(result["downloaded"])
        self.assertIn(adapter.host_edf, " ".join(result["warnings"]))
        failed = next(event for event in events if event["event"] == "download_failed")
        self.assertEqual(failed["host_edf"], adapter.host_edf)
        self.assertTrue(any(c[0] == "receiveDataFile" for c in fake.calls))

    def test_connection_failure_is_not_silently_changed_to_dummy(self):
        pylink = FakePyLink(ConnectionError("no tracker"))
        with mock.patch.dict(sys.modules, {"pylink": pylink}):
            with self.assertRaises(tracker_module.TrackerError):
                tracker_module.make_tracker("real", {}, lambda event: None)

    def test_dummy_does_not_import_pylink_and_emits_monotonic_events(self):
        events = []
        # An import sentinel proves dummy mode never imports the real SDK.
        with mock.patch.dict(sys.modules, {"pylink": None}):
            adapter = tracker_module.make_tracker("dummy", {}, events.append)
            metadata = adapter.setup(None, (800, 600))
            adapter.calibrate()
            adapter.start_trial("D1", {"x": 2})
            adapter.message("STATE start")
            adapter.check_recording()
            adapter.stop_trial(0)
            result = adapter.close(Path("ignored.edf"))
        self.assertEqual(metadata["screen_pixel_coords"], (0, 0, 799, 599))
        self.assertEqual(result["edf_created"], False)
        self.assertEqual(result["status"], "closed")
        self.assertTrue(all("monotonic_time" in e for e in events))
        self.assertEqual([e["event"] for e in events[:3]], ["setup", "calibrate", "start_trial"])

    def test_default_targets_count_and_invalid_hv13_rejected(self):
        self.assertEqual(len(tracker_module.HV13_TARGETS), 13)
        with self.assertRaises(ValueError):
            tracker_module.make_tracker("dummy", {"targets": tracker_module.HV13_TARGETS[:12]}, lambda e: None)


if __name__ == "__main__":
    unittest.main()
