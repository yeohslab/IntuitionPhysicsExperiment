"""End-to-end runtime checks with the real EyeLink adapter and fake PyLink SDK."""
from __future__ import annotations

import csv
import json
import math
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from intuition_eye import runtime as runtime_module
from intuition_eye.render import frame_geometry
from intuition_eye.runtime import Audio, ExperimentRuntime
from intuition_eye.tracker import TrackerError


class FakeWindow:
    def callOnFlip(self, callback, *args, **kwargs):
        callback(*args, **kwargs)

    def close(self):
        pass


class FakeGraphics:
    def __init__(self, tracker, window):
        self.tracker, self.window = tracker, window

    def setCalibrationColors(self, foreground, background):
        self.colors = (foreground, background)

    def setTargetType(self, target_type):
        self.target_type = target_type


class FakePyLinkTracker:
    """Enough of the SDK for setup, calibration, recording, and cleanup."""

    def __init__(self, *, fail_start=False, wait_status=1):
        self.calls = []
        self.recording = False
        self.fail_start = fail_start
        self.wait_status = wait_status

    def getTrackerVersion(self):
        self.calls.append(("getTrackerVersion",))
        return (3, "EYELINK CL 5.0")

    def sendCommand(self, command):
        self.calls.append(("sendCommand", command))
        return 0

    def sendMessage(self, text):
        self.calls.append(("sendMessage", text))
        return 0

    def openDataFile(self, name):
        self.calls.append(("openDataFile", name))
        return 0

    def closeDataFile(self):
        self.calls.append(("closeDataFile",))
        return 0

    def receiveDataFile(self, host, local):
        self.calls.append(("receiveDataFile", host, local))
        # Deliberately do not create a file: this fake SDK has no EDF data.
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
        return self.wait_status

    def isRecording(self):
        # Real PyLink commonly uses TRIAL_OK=0 for a healthy recording.
        return 0 if self.recording else 9

    def stopRecording(self):
        self.calls.append(("stopRecording",))
        self.recording = False
        return 0

    def close(self):
        self.calls.append(("close",))


class FakePyLink(types.ModuleType):
    TRIAL_OK = 0

    def __init__(self, tracker):
        super().__init__("pylink")
        self.tracker = tracker
        self.graphics = None
        self.delays = []

    def EyeLink(self, ip):
        self.ip = ip
        return self.tracker

    def openGraphicsEx(self, graphics):
        self.graphics = graphics

    def pumpDelay(self, milliseconds):
        self.delays.append(milliseconds)


class FakeAudio:
    def __init__(self, config, event_sink, simulated=False):
        self.sink = event_sink

    def set(self, masking, response=False):
        self.sink({"event": "audio_mask_on" if masking else "audio_mask_off"})
        if response:
            self.sink({"event": "audio_response_cue"})

    def close(self):
        pass


class FakePendulum:
    def __init__(self, physics):
        self.params = physics
        self.analysis = {"T": 1.0, "regime": physics.get("regime", "oscillation")}

    def at(self, t):
        return self.params.get("angle", math.radians(-179.0)), self.params.get("omega", 1.0)


class ScriptedDisplay:
    """Deterministic PsychoPyDisplay substitute with a real FakeWindow."""

    def __init__(self, config, event_sink, *, scene, descriptor, response, key=None):
        self.config, self.event_sink = config, event_sink
        self.scene, self.descriptor = scene, descriptor
        self.response, self.key = response, key
        self.size = tuple(config["window"]["size"])
        self.window = FakeWindow()
        self.geometry = {"size": list(self.size), "backend": "fake-psychopy"}
        self.interval = 1.0 / 60.0
        self.time = 100.0
        self.response_at = None
        self.motion_at = None
        self.feedback_at = None
        self.sent_response = False
        self.response_started = False
        self.pointer_calls = 0
        self.sent_feedback = False
        self.previous_phase = None
        self.feedback_states = []
        self.focus_armed = False
        self.focused = True
        self.focus_loss_reason = None
        self.simulated = False
        self.keyboard_backend = "fake"

    def now(self):
        return self.time

    def next_flip(self):
        return self.time + self.interval

    def flip(self, state, callback=None, audio=None):
        self.time += self.interval
        if self.time - 100.0 > 60.0:
            raise RuntimeError("scripted display virtual-time safety limit")
        phase = state.get("phase")
        if phase == "fixation" and self.previous_phase != "fixation":
            self.response_at = self.motion_at = self.feedback_at = None
            self.sent_response = self.response_started = self.sent_feedback = False
            self.pointer_calls = 0
        if phase == "motion" and self.motion_at is None:
            self.motion_at = self.time
        if phase == "estimate" and self.response_at is None:
            self.response_at = self.time
        if phase == "feedback":
            self.feedback_states.append(dict(state))
            if self.feedback_at is None:
                self.feedback_at = self.time
        self.previous_phase = phase
        if callback is not None:
            callback(self.time)
        return self.time

    def clear(self):
        self.response_at = self.motion_at = self.feedback_at = None
        self.sent_response = self.response_started = self.sent_feedback = False
        self.pointer_calls = 0

    def cursor(self, visible):
        pass

    def poll_events(self):
        return []

    def keys(self):
        if self.key is not None and self.motion_at is not None and not self.sent_response:
            if self.time >= self.motion_at + 0.10:
                self.sent_response = True
                return [(self.key, self.time)]
        feedback_delay = 0.40 if self.scene == "E2" else 0.10
        # Speed replay ignores Space until the motion finishes, so keep offering it.
        if self.feedback_at is not None and self.time >= self.feedback_at + feedback_delay:
            self.sent_feedback = True
            return [("space", self.time)]
        return []

    def pointer(self):
        if self.response_at is None or self.sent_response:
            return (0.0, 0.0, False)
        self.pointer_calls += 1
        if self.pointer_calls == 1:
            return (0.0, 0.0, False)
        if not self.response_started:
            if self.time < self.response_at + self.interval:
                return (0.0, 0.0, False)
            self.response_started = True
            geometry = frame_geometry({"unit": self.scene, "descriptor": self.descriptor})
            if self.response[0] == "speed":
                x, y = 150 + 700 * self.response[1], 520
            else:
                angle = self.response[1]
                x = geometry["anchor_x"] + 100 * math.sin(angle)
                y = geometry["anchor_y"] + 100 * math.cos(angle)
            self._response_position = (geometry["canvas_left"] + x * geometry["scale"],
                                       geometry["canvas_top"] + y * geometry["scale"])
            return (*self._response_position, True)
        # Release, then click the confirmation control on the following poll.
        if self.pointer_calls % 2:
            return (*self._response_position, False)
        geometry = frame_geometry({"unit": self.scene, "descriptor": self.descriptor})
        x = geometry["frame_left"] + 870 * geometry["scale"]
        y = geometry["frame_top"] + 700 * geometry["scale"]
        self.sent_response = True
        return (x, y, True)

    def close(self):
        self.window.close()


class EyeLinkRuntimeTests(unittest.TestCase):
    def make_session(self, scene):
        variants = {"training": "training-1", "E2": "experiment-2",
                    "E4": "experiment-4-v2", "E5": "experiment-5-v3"}
        variant = variants[scene]
        unit_type = {"training": "speedColorTrainingStimulus", "E2": "pendulumStimulus",
                     "E4": "trackingPendulumV2Stimulus", "E5": "bellReachabilityV3Stimulus"}[scene]
        unit = {"id": "task", "type": unit_type, "show1T": .1, "hide1T": .1,
                "fadeMs": 0, "queryTimeSec": .2, "blankStartSec": .1,
                "reportDelaySec": .1, "firstTraversalDurationSec": 1.0,
                "targetStripPosition": .4, "loopMode": "ping_pong",
                "linearSpeedMPerSec": 2., "trackLeftXM": -4., "trackRightXM": 4.,
                "initialXM": -4., "mode": "assessment", "feedbackShown": scene == "E5",
                "yesKey": "f", "noKey": "j", "correctResponse": "reachable"}
        descriptor = {"unit_id": "task", "trial_id": "trial", "segment_kind": "practice",
                      "report_target": "speed" if scene in ("training", "E4") else "angle",
                      "window_size": [1000, 700], "speed_scale_linear_m_per_sec": 2.0,
                      "pendulum_regime": "rotation" if scene == "E2" else "oscillation",
                      "w_max_deg": 179.0}
        trial = {"id": "trial", "units": [unit]}
        session = {"eye_session_schema_version": 1, "session_id": f"session-{scene}",
                   "runtime_variant_id": variant, "experiment_id": variant,
                   "protocol_version": "2.0.0", "participant": {"subject_id": f"{scene}-test",
                   "gender_code": 0, "age_years": 25}, "rng_seed": 1,
                   "provenance": {"test": True}, "protocol_settings": {},
                   "behavior_columns": [], "trial_descriptors": [descriptor],
                   "physics": [{"unit_id": "task", "rodLengthM": 4., "angle": math.radians(-179.),
                                "omega": 1.0, "regime": "rotation"}],
                   "stimulus_set": {"sequence": [{"id": "block", "kind": "block",
                   "children": [trial]}]}}
        if scene == "training":
            session["protocol_version"] = "1.0.0"
            session["physics"] = []
            unit["feedbackShown"] = False
            session["stimulus_set"]["sequence"][0]["id"] = "training-1-assessment-1"
            assessment_trials = []
            assessment_descriptors = []
            for index in range(6):
                unit_id = f"task-{index + 1}"
                trial_id = f"trial-{index + 1}"
                assessment_unit = {**unit, "id": unit_id}
                assessment_trials.append({"id": trial_id, "units": [assessment_unit]})
                assessment_descriptors.append({**descriptor, "unit_id": unit_id, "trial_id": trial_id})
            session["trial_descriptors"] = assessment_descriptors
            session["stimulus_set"]["sequence"][0]["children"] = assessment_trials
            session["stimulus_set"]["sequence"].extend([
                {"id": "training-1-remediation-intro", "kind": "block", "children": []},
                {"id": "training-1-assessment-2", "kind": "block", "children": []},
            ])
        elif scene == "E5":
            session["protocol_version"] = "3.0.0"
        return session, descriptor

    def config(self, root):
        return {"output_dir": root, "window": {"size": [1000, 700]},
                "audio": {"enabled": False}, "tracker": {"ip": "100.1.1.1",
                "sample_rate": None, "calibration_type": "HV13", "drift_check": True},
                "timing": {"expected_refresh_hz": 60, "drop_frame_multiplier": 1.5,
                "max_frame_gap_ms": 100}, "headless": {"refresh_hz": 60,
                "response_delay_sec": .1, "e5_rt_sec": .1}}

    def run_scene(self, scene, tracker=None, *, fail_start=False, wait_status=1):
        session, descriptor = self.make_session(scene)
        tracker = tracker or FakePyLinkTracker(fail_start=fail_start, wait_status=wait_status)
        fake_pylink = FakePyLink(tracker)
        graphics_module = types.ModuleType("EyeLinkCoreGraphicsPsychoPy")
        graphics_module.EyeLinkCoreGraphicsPsychoPy = FakeGraphics
        def display_factory(config, sink):
            self.last_display = ScriptedDisplay(
                config, sink, scene=scene, descriptor=descriptor,
                response=("speed", .4 if scene == "training" else .25) if scene in ("training", "E4") else ("angle", math.radians(179.)),
                key="f" if scene == "E5" else None)
            return self.last_display
        with tempfile.TemporaryDirectory() as root, mock.patch.dict(
                sys.modules, {"pylink": fake_pylink, "EyeLinkCoreGraphicsPsychoPy": graphics_module}), \
                mock.patch.object(runtime_module, "PsychoPyDisplay", display_factory), \
                mock.patch.object(runtime_module, "Audio", FakeAudio), \
                mock.patch.object(runtime_module, "Pendulum", FakePendulum):
            result = ExperimentRuntime(self.make_session(scene)[0], self.config(root),
                                       tracker_mode="eyelink", headless=False).run()
            folder = Path(result["run_folder"])
            with (folder / "behavior.csv").open(encoding="utf-8-sig", newline="") as stream:
                csv_rows = list(csv.DictReader(stream))
            trial_path = folder / "trials.jsonl"
            trial_rows = []
            if trial_path.exists():
                with trial_path.open(encoding="utf-8") as stream:
                    trial_rows = [json.loads(line) for line in stream if line.strip()]
            self.assertEqual(len(csv_rows), len(trial_rows))
            self.assertEqual(len(trial_rows), result["trials"])
            for csv_item, json_item in zip(csv_rows, trial_rows):
                self.assertEqual(csv_item["trial_id"], json_item["trial_id"])
                self.assertEqual(csv_item["trial_status"], json_item["trial_status"])
            self.assertFalse(list(folder.glob("*.edf")), "the fake SDK must not fabricate an EDF")
            csv_row = csv_rows[0] if csv_rows else None
            trial_row = trial_rows[0] if trial_rows else None
            with (folder / "events.jsonl").open(encoding="utf-8") as stream:
                events = [json.loads(line) for line in stream if line.strip()]
            return result, csv_row, trial_row, events, tracker

    def test_real_eyelink_runtime_persists_csv_jsonl_and_markers_for_all_variants(self):
        for scene in ("training", "E2", "E4", "E5"):
            with self.subTest(scene=scene):
                result, csv_row, trial_row, events, tracker = self.run_scene(scene)
                self.assertEqual(result["state"], "completed")
                expected_trials = 6 if scene == "training" else 1
                self.assertEqual(result["trials"], expected_trials)
                self.assertEqual(csv_row["trial_status"], "completed")
                self.assertEqual(trial_row["trial_status"], "completed")
                self.assertIsNotNone(csv_row)
                names = {event["event"] for event in events}
                self.assertTrue({"setup", "calibrate", "start_trial", "message", "tracker_cleanup", "run_end"} <= names)
                messages = [call[1] for call in tracker.calls if call[0] == "sendMessage"]
                self.assertTrue(any("TRIALID" in message for message in messages))
                self.assertTrue(any("MOTION_ONSET" in message for message in messages))
                self.assertIn(("doDriftCorrect", 500, 350, 1, 1), tracker.calls)
                self.assertIn(("stopRecording",), tracker.calls)
                self.assertIn("receiveDataFile", {call[0] for call in tracker.calls})

    def test_confirmation_rt_is_separate_from_total_trial_duration_and_e4_raw_speed_is_preserved(self):
        result, row, _, _, _ = self.run_scene("E4")
        self.assertEqual(result["state"], "completed")
        self.assertGreater(float(row["rt_total_sec"]), 0)
        self.assertGreater(float(row["psychopy_trial_end_sec"]) - float(row["psychopy_trial_start_sec"]),
                           float(row["rt_total_sec"]))
        self.assertAlmostEqual(float(row["linear_speed_q_m_per_sec"]), 4.0)

    def test_e2_angle_wrap_and_e5_response_rt_and_practice_replay(self):
        _, e2, _, _, _ = self.run_scene("E2")
        self.assertAlmostEqual(float(e2["abs_delta_theta_deg"]), 2.0, delta=.2)
        _, e5, _, events, _ = self.run_scene("E5")
        self.assertEqual(e5["response_key"], "f")
        self.assertGreater(float(e5["rt_sec"]), 0)
        self.assertEqual(e5["feedback_presented"], "True")
        self.assertIn("FEEDBACK_ONSET", {event["event"] for event in events})
        self.assertTrue(self.last_display.feedback_states)
        for state in self.last_display.feedback_states:
            self.assertTrue(state["replay"])
            self.assertEqual(state["footer"],
                             "正确。这个铃铛可以到达。下面再看一次遮挡后面的运动。按空格继续。")

    def test_start_and_wait_failures_return_error_and_attempt_cleanup(self):
        for kwargs in ({"fail_start": True}, {"wait_status": 0}):
            with self.subTest(kwargs=kwargs):
                result, _, _, events, tracker = self.run_scene("E4", **kwargs)
                self.assertEqual(result["state"], "error")
                self.assertIn("TrackerError", result["error"])
                self.assertIn(("stopRecording",), tracker.calls)
                self.assertIn(("closeDataFile",), tracker.calls)
                self.assertIn("receiveDataFile", {call[0] for call in tracker.calls})
                self.assertEqual([event["event"] for event in events][-1], "run_end")


if __name__ == "__main__":
    unittest.main()
