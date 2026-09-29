import { scheduleSynchronizedEstimateBoundary } from "../../src/shared/playEstimateCue.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type AudioEvent = {
  kind: "set" | "ramp" | "start" | "stop";
  value?: number;
  time: number;
};

class RecordingAudioParam {
  value = 0;
  readonly events: AudioEvent[] = [];

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: "set", value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: "ramp", value, time });
    return this;
  }
}

class RecordingOscillator {
  type: OscillatorType = "sine";
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  readonly events: AudioEvent[] = [];

  connect(): void {}
  disconnect(): void {}

  start(time: number): void {
    this.events.push({ kind: "start", time });
  }

  stop(time: number): void {
    this.events.push({ kind: "stop", time });
  }
}

class RecordingGain {
  readonly gain = new RecordingAudioParam();
  connect(): void {}
  disconnect(): void {}
}

class RecordingAudioContext {
  readonly currentTime = 12.345;
  readonly destination = {};
  readonly oscillator = new RecordingOscillator();
  readonly gain = new RecordingGain();

  createOscillator(): OscillatorNode {
    return this.oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return this.gain as unknown as GainNode;
  }
}

const recording = new RecordingAudioContext();
const maskedStopTimes: number[] = [];
const boundary = scheduleSynchronizedEstimateBoundary(
  recording as unknown as AudioContext,
  (time) => maskedStopTimes.push(time),
);

assert(boundary === recording.currentTime, "应使用调用瞬间的 AudioContext 时钟");
assert(
  maskedStopTimes.length === 1 && maskedStopTimes[0] === boundary,
  "掩蔽音应在唯一边界时刻停止",
);

const cueStart = recording.oscillator.events.find((event) => event.kind === "start");
const cueStop = recording.oscillator.events.find((event) => event.kind === "stop");
const cueAttack = recording.gain.gain.events[0];
const cueDecay = recording.gain.gain.events[1];
assert(cueStart?.time === boundary, "木鱼提示音应与掩蔽音停止同刻起音");
assert(
  cueAttack?.kind === "set" &&
    cueAttack.time === boundary &&
    cueAttack.value === 1,
  "提示音峰值应从边界时刻直接开始",
);
assert(
  cueDecay?.kind === "ramp" && cueDecay.time === boundary + 0.07,
  "提示音应在70 ms内衰减",
);
assert(cueStop?.time === boundary + 0.08, "提示音应在80 ms时停止");

console.log(
  "verify-audio-boundary: OK（掩蔽音停止、瞬态起音与作答边界使用同一时间锚点）",
);
