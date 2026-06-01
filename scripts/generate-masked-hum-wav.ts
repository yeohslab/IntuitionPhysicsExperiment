/**
 * 生成遮挡期持续低音：10s、200Hz、前 STIMULUS_FADE_MS 线性渐入，之后稳态。
 * 输出 public/audio/masked-hum.wav
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STIMULUS_FADE_MS } from "../src/physics/timePhases.ts";

const SAMPLE_RATE = 44100;
const DURATION_SEC = 10;
const FREQ_HZ = 200;
const FADE_IN_SEC = STIMULUS_FADE_MS / 1000;
const PEAK_AMPLITUDE = 0.25;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "audio", "masked-hum.wav");

function envelopeAt(tSec: number): number {
  if (tSec <= 0) return 0;
  if (tSec >= FADE_IN_SEC) return 1;
  return tSec / FADE_IN_SEC;
}

function writeWavMono16(pcm: Float32Array, sampleRate: number, path: string): void {
  const numSamples = pcm.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

const numSamples = Math.floor(SAMPLE_RATE * DURATION_SEC);
const pcm = new Float32Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  const env = envelopeAt(t);
  pcm[i] = Math.sin(2 * Math.PI * FREQ_HZ * t) * PEAK_AMPLITUDE * env;
}

writeWavMono16(pcm, SAMPLE_RATE, outPath);
console.log(`Wrote ${outPath} (${DURATION_SEC}s, ${FREQ_HZ}Hz, ${FADE_IN_SEC * 1000}ms fade-in)`);
