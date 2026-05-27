import type { SpringParams } from "./spring";
import { springMotion } from "./spring";

export const SCORE_MAX = 100;

export function springWMaxM(params: SpringParams): number {
  return springMotion(params).amplitudeM;
}

export function springPositionErrorM(estimatedM: number, actualM: number): number {
  return Math.abs(estimatedM - actualM);
}

export function springIntervalHit(eM: number, wM: number): boolean {
  return eM <= wM + 1e-12;
}

export function springTrialScore(wM: number, wMaxM: number, hit: boolean): number {
  if (!hit) return 0;
  if (wMaxM <= 0) return wM <= 0 ? SCORE_MAX : 0;
  const ratio = Math.max(0, Math.min(1, wM / wMaxM));
  return SCORE_MAX * (1 - ratio) ** 2;
}
