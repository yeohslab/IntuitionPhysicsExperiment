// 该 wav 放在 public/audio 下，运行时以绝对路径访问
const maskedHumUrl = "/audio/masked-hum.wav";

let audioCtx: AudioContext | null = null;
/** 运行时 GainNode；WAV 峰值 0.25 */
const MASKED_PLAYBACK_GAIN = 1.5;
/** 估计阶段 ping 峰值（Web Audio 上限 1.0） */
const PING_PEAK_GAIN = 1.0;

let maskedBuffer: AudioBuffer | null = null;
let maskedBufferLoad: Promise<AudioBuffer | null> | null = null;
let maskedSource: AudioBufferSourceNode | null = null;
let maskedGain: GainNode | null = null;
let maskedPlaying = false;
let maskedStartedThisTrial = false;
let maskedStartInFlight = false;
let maskedWantsPlay = false;
let maskedHtmlAudio: HTMLAudioElement | null = null;
let maskedHtmlPlaying = false;

function getMaskedHtmlAudio(): HTMLAudioElement {
  if (!maskedHtmlAudio) {
    maskedHtmlAudio = new Audio(maskedHumUrl);
    maskedHtmlAudio.preload = "auto";
  }
  return maskedHtmlAudio;
}

/** 手势栈内解锁 HTMLAudio，供 Chrome/Edge 在 Web Audio suspend 时回退 */
async function primeMaskedHtmlAudioInGesture(): Promise<void> {
  try {
    const el = getMaskedHtmlAudio();
    el.volume = 0.0001;
    el.currentTime = 0;
    await el.play();
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function startMaskedHtmlPlayback(): boolean {
  try {
    const el = getMaskedHtmlAudio();
    el.currentTime = 0;
    el.volume = 1;
    void el.play().then(() => {
      maskedHtmlPlaying = true;
    }).catch(() => {
      maskedHtmlPlaying = false;
      if (maskedStartedThisTrial && !maskedPlaying) {
        maskedStartedThisTrial = false;
      }
    });
    return true;
  } catch {
    maskedHtmlPlaying = false;
    return false;
  }
}

function stopMaskedHtmlPlayback(): void {
  if (!maskedHtmlAudio) return;
  try {
    maskedHtmlAudio.pause();
    maskedHtmlAudio.currentTime = 0;
  } catch {
    /* */
  }
  maskedHtmlPlaying = false;
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function getAudioContext(): AudioContext | null {
  return audioCtx;
}

async function ensureAudioContextRunning(): Promise<AudioContext | null> {
  if (!audioCtx) return null;
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      return null;
    }
  }
  return audioCtx.state === "running" ? audioCtx : null;
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

function resetMaskedBufferLoad(): void {
  maskedBufferLoad = null;
  maskedBuffer = null;
}

/** 加载并解码 masked-hum.wav（结果缓存；失败可重试） */
export async function loadMaskedHumBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (maskedBuffer) return maskedBuffer;
  if (maskedBufferLoad) return maskedBufferLoad;

  maskedBufferLoad = (async () => {
    try {
      const res = await fetch(maskedHumUrl);
      if (!res.ok) {
        resetMaskedBufferLoad();
        return null;
      }
      const data = await res.arrayBuffer();
      maskedBuffer = await ctx.decodeAudioData(data);
      return maskedBuffer;
    } catch {
      resetMaskedBufferLoad();
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
    source.start(ctx.currentTime);

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

/** Chrome/Edge：show 段 idle 后 context 可能被 suspend，fade 前需 resume + 确保 buffer 已解码 */
function requestMaskedHumStart(): void {
  if (maskedStartedThisTrial || maskedPlaying || maskedHtmlPlaying || maskedStartInFlight) return;
  maskedWantsPlay = true;
  maskedStartInFlight = true;
  void (async () => {
    try {
      const ctx = await ensureAudioContextRunning();
      if (ctx && maskedWantsPlay && !maskedStartedThisTrial && !maskedPlaying) {
        const buf = await loadMaskedHumBuffer(ctx);
        if (buf && maskedWantsPlay && !maskedStartedThisTrial && startMaskedHumPlayback(ctx)) {
          maskedStartedThisTrial = true;
          return;
        }
      }
      if (maskedWantsPlay && !maskedStartedThisTrial && !maskedHtmlPlaying) {
        if (startMaskedHtmlPlayback()) {
          maskedStartedThisTrial = true;
        }
      }
    } finally {
      maskedStartInFlight = false;
    }
  })();
}

export function isExperimentAudioReady(): boolean {
  return audioCtx?.state === "running";
}

export async function primeExperimentAudioInUserGesture(): Promise<boolean> {
  try {
    const Ctx = audioContextCtor();
    if (!Ctx) return false;
    if (!audioCtx) {
      audioCtx = new Ctx({ latencyHint: "interactive" });
    }
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return false;
    playSilentUnlockPulse(ctx);
    await primeMaskedHtmlAudioInGesture();
    await loadMaskedHumBuffer(ctx);
    return maskedBuffer !== null;
  } catch {
    return false;
  }
}

export function primeEstimateCueAudio(): void {
  void primeExperimentAudioInUserGesture();
}

/** @deprecated 使用 primeExperimentAudioInUserGesture */
export async function primeEstimateCueAudioAsync(): Promise<void> {
  await primeExperimentAudioInUserGesture();
}

export function playEstimateCue(): void {
  void (async () => {
    try {
      const ctx = await ensureAudioContextRunning();
      if (!ctx) return;
      playEstimateCueAt(ctx, ctx.currentTime);
    } catch {
      /* autoplay policy or missing API */
    }
  })();
}

export function stopMaskedAmbientSound(): void {
  maskedWantsPlay = false;
  stopMaskedHtmlPlayback();
  maskedStartedThisTrial = false;
  if (!maskedPlaying || !maskedSource || !maskedGain) return;
  try {
    const ctx = getAudioContext();
    const source = maskedSource;
    const gain = maskedGain;
    clearMaskedPlaybackNodes();

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
  }
}

export function syncMaskedAmbientFromVisibility(
  vis: { kind: "show" | "fadeOut" | "hide"; alpha: number },
): boolean {
  if (vis.kind === "show") {
    maskedWantsPlay = false;
    stopMaskedAmbientSound();
    maskedStartedThisTrial = false;
    return false;
  }

  if (vis.kind === "fadeOut" || vis.kind === "hide") {
    requestMaskedHumStart();
    return maskedPlaying || maskedHtmlPlaying;
  }

  return false;
}

export function prepareMaskedAmbientForTrial(): void {
  maskedStartedThisTrial = false;
  maskedWantsPlay = false;
  void (async () => {
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return;
    await loadMaskedHumBuffer(ctx);
  })();
}
