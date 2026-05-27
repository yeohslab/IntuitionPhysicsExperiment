type AfcSlot = 1 | 2 | 3 | 4 | 5;
import { springMotion, type SpringParams } from "./spring";

const N = 5;
const MAX_GENERATION_ATTEMPTS = 80;

function linearDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

function minPairwiseSeparationM(values: number[]): number {
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      min = Math.min(min, linearDistance(values[i]!, values[j]!));
    }
  }
  return min;
}

function oscillationAnchors(amplitudeM: number): number[] {
  const A = amplitudeM;
  const segment = (2 * A) / 5;
  return [1, 2, 3, 4, 5].map((k) => -A + (k - 0.5) * segment);
}

function effectiveMinSeparationM(amplitudeM: number): number {
  const segment = (2 * amplitudeM) / 5;
  return Math.max(0.02, Math.min(0.1 * amplitudeM, segment * 0.85));
}

function pushAwayFromActualX(
  x: number,
  actualX: number,
  amplitudeM: number,
  minSep: number,
): number {
  const A = amplitudeM;
  if (linearDistance(x, actualX) >= minSep) return Math.max(-A, Math.min(A, x));
  const sign = x >= actualX ? 1 : -1;
  return Math.max(-A, Math.min(A, actualX + sign * (minSep + 0.002)));
}

function springDistractorPositions(
  actualX: number,
  amplitudeM: number,
  rng: () => number,
): number[] {
  const A = amplitudeM;
  const anchors = oscillationAnchors(A);
  let closestIdx = 0;
  let closestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = linearDistance(anchors[i]!, actualX);
    if (d < closestD) {
      closestD = d;
      closestIdx = i;
    }
  }
  const pool = anchors.filter((_, i) => i !== closestIdx);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.map((x) => Math.max(-A, Math.min(A, x)));
}

function repairSpringPositions(
  allX: number[],
  correctOption: AfcSlot,
  actualX: number,
  amplitudeM: number,
  minSep: number,
): void {
  const A = amplitudeM;
  for (let pass = 0; pass < 8; pass++) {
    let ok = true;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (linearDistance(allX[i]!, allX[j]!) >= minSep) continue;
        ok = false;
        const fixIdx = i + 1 === correctOption || j + 1 === correctOption ? (i + 1 === correctOption ? j : i) : j;
        let x = allX[fixIdx]!;
        const avoid = allX[i === fixIdx ? j : i]!;
        const sign = x >= avoid ? 1 : -1;
        x = Math.max(-A, Math.min(A, x + sign * (minSep + 0.002)));
        if (linearDistance(x, actualX) < minSep) {
          x = Math.max(-A, Math.min(A, actualX + sign * (minSep + 0.002)));
        }
        allX[fixIdx] = x;
      }
    }
    if (ok) break;
  }
}

export type SpringPositionOptions5 = {
  choiceXM: [number, number, number, number, number];
  correctOption: AfcSlot;
};

export function generateSpringPositionOptions5(
  actualXM: number,
  params: SpringParams,
  rng: () => number,
): SpringPositionOptions5 {
  const { amplitudeM } = springMotion(params);
  const A = Math.max(amplitudeM, 1e-9);
  const minSep = effectiveMinSeparationM(A);
  const actualX = Math.max(-A, Math.min(A, actualXM));

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const correctOption = (Math.floor(rng() * N) + 1) as AfcSlot;
    const allX: number[] = new Array(N).fill(NaN);
    allX[correctOption - 1] = actualX;

    const distractors = springDistractorPositions(actualX, A, rng);
    let di = 0;
    for (let i = 0; i < N; i++) {
      if (i + 1 === correctOption) continue;
      let x = pushAwayFromActualX(distractors[di]!, actualX, A, minSep);
      di += 1;
      allX[i] = x;
    }

    repairSpringPositions(allX, correctOption, actualX, A, minSep);

    if (minPairwiseSeparationM(allX) >= minSep - 1e-9) {
      const choiceXM = allX.map((x) => Math.round(x * 1e4) / 1e4) as [
        number,
        number,
        number,
        number,
        number,
      ];
      return { choiceXM, correctOption };
    }
  }

  throw new Error(`无法在 ${MAX_GENERATION_ATTEMPTS} 次内生成 5 个满足最小间隔的弹簧位移选项`);
}
