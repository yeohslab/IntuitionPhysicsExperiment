let audioCtx: AudioContext | null = null;

const MASKED_HUM_URL = "/audio/masked-hum.wav";
/** 运行时 GainNode；WAV 峰值 0.25，×12 ≈ 主观音量（较上一档 ×4） */
const MASKED_PLAYBACK_GAIN = 12.0;
/** 估计阶段 ping 峰值（Web Audio 上限 1.0） */
const PING_PEAK_GAIN = 1.0;

let maskedBuffer: AudioBuffer | null = null;
let maskedBufferLoad: Promise<AudioBuffer | null> | null = null;
let maskedSource: AudioBufferSourceNode | null = null;
let maskedGain: GainNode | null = null;
let maskedPlaying = false;
let maskedStartedThisTrial = false;

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/** 仅返回已创建的 context；不在非手势栈内 new AudioContext（Chrome/Edge 自动播放策略） */
function getAudioContext(): AudioContext | null {
  return audioCtx;
}

function playSilentUnlockPulse(ctx: AudioContext): void {
  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime;
  source.start(t0);
  source.stop(t0 + 0.01);
}

function clearMaskedPlaybackNodes(): void {
  maskedSource = null;
  maskedGain = null;
  maskedPlaying = false;
}

function disconnectMaskedPlayback(
  source: AudioBufferSourceNode,
  gain: GainNode,
): void {
  try {
    source.disconnect();
    gain.disconnect();
  } catch {
    /* already disconnected */
  }
  clearMaskedPlaybackNodes();
}

function playEstimateCueAt(ctx: AudioContext, t0: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(PING_PEAK_GAIN, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.08);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** 加载并解码 masked-hum.wav（结果缓存） */
export async function loadMaskedHumBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (maskedBuffer) return maskedBuffer;
  if (maskedBufferLoad) return maskedBufferLoad;

  maskedBufferLoad = (async () => {
    try {
      const res = await fetch(MASKED_HUM_URL);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      maskedBuffer = await ctx.decodeAudioData(data.slice(0));
      return maskedBuffer;
    } catch {
      maskedBufferLoad = null;
      return null;
    }
  })();

  return maskedBufferLoad;
}

function startMaskedHumPlayback(ctx: AudioContext): boolean {
  if (maskedPlaying || !maskedBuffer) return maskedPlaying;
  try {
    const source = ctx.createBufferSource();
    source.buffer = maskedBuffer;
    source.loop = false;

    const gain = ctx.createGain();
    gain.gain.value = MASKED_PLAYBACK_GAIN;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);

    source.onended = () => {
      if (maskedSource === source) {
        disconnectMaskedPlayback(source, gain);
        maskedStartedThisTrial = false;
      }
    };

    maskedSource = source;
    maskedGain = gain;
    maskedPlaying = true;
    return true;
  } catch {
    clearMaskedPlaybackNodes();
    return false;
  }
}

/** 实验音频是否已解锁（Web Audio running） */
export function isExperimentAudioReady(): boolean {
  return audioCtx?.state === "running";
}

/**
 * 在 Chrome / Edge 用户手势栈内调用：创建 AudioContext、await resume、预加载 WAV。
 */
export async function primeExperimentAudioInUserGesture(): Promise<boolean> {
  try {
    const Ctx = audioContextCtor();
    if (!Ctx) return false;
    if (!audioCtx) {
      audioCtx = new Ctx({ latencyHint: "interactive" });
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (audioCtx.state !== "running") return false;
    playSilentUnlockPulse(audioCtx);
    await loadMaskedHumBuffer(audioCtx);
    return maskedBuffer !== null;
  } catch {
    return false;
  }
}

/** 同步入口：在用户 keydown / click 回调中调用（内部 await resume） */
export function primeEstimateCueAudio(): void {
  void primeExperimentAudioInUserGesture();
}

/** @deprecated 使用 primeExperimentAudioInUserGesture */
export async function primeEstimateCueAudioAsync(): Promise<void> {
  await primeExperimentAudioInUserGesture();
}

/** 进入汇报阶段短促 ping（失败静默） */
export function playEstimateCue(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;
    playEstimateCueAt(ctx, ctx.currentTime);
  } catch {
    /* autoplay policy or missing API */
  }
}

/** hide 结束或试次清理：瞬间停止持续低音（不播 ping） */
export function stopMaskedAmbientSound(): void {
  if (!maskedPlaying || !maskedSource || !maskedGain) return;
  try {
    const ctx = getAudioContext();
    const source = maskedSource;
    const gain = maskedGain;
    clearMaskedPlaybackNodes();
    maskedStartedThisTrial = false;

    if (!ctx) {
      try {
        source.stop();
      } catch {
        /* */
      }
      disconnectMaskedPlayback(source, gain);
      return;
    }

    try {
      source.stop(ctx.currentTime + 0.001);
    } catch {
      /* already stopped */
    }
    disconnectMaskedPlayback(source, gain);
  } catch {
    clearMaskedPlaybackNodes();
    maskedStartedThisTrial = false;
  }
}

/**
 * 按试次可见性驱动遮挡音：show 不播；fadeOut 起点播 WAV（含 150ms 渐入）；hide 继续；show 回退则停。
 */
export function syncMaskedAmbientFromVisibility(
  vis: { kind: "show" | "fadeOut" | "hide"; alpha: number },
): boolean {
  const ctx = getAudioContext();

  if (vis.kind === "show") {
    if (maskedPlaying) stopMaskedAmbientSound();
    maskedStartedThisTrial = false;
    return false;
  }

  if (vis.kind === "fadeOut" || vis.kind === "hide") {
    if (!maskedBuffer && ctx?.state === "running") {
      void loadMaskedHumBuffer(ctx);
    }
    if (!maskedStartedThisTrial && ctx?.state === "running" && maskedBuffer) {
      if (startMaskedHumPlayback(ctx)) {
        maskedStartedThisTrial = true;
      }
    }
    return maskedPlaying;
  }

  return false;
}

/** 新试次开始前：重置状态并确保 buffer 已加载 */
export function prepareMaskedAmbientForTrial(): void {
  maskedStartedThisTrial = false;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  void loadMaskedHumBuffer(ctx);
}
