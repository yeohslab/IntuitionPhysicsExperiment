type AfcSlot = 1 | 2 | 3 | 4 | 5;
import { PENDULUM_MASS_KG, pendulumEnergy, type PendulumParams } from "./pendulum";

const N = 5;
const MIN_SEPARATION_DEG = 8;
const MIN_SEPARATION_RAD = (MIN_SEPARATION_DEG * Math.PI) / 180;
const ROTATION_JITTER_RAD = (3 * Math.PI) / 180;
const MAX_GENERATION_ATTEMPTS = 80;

function wrapAngle(theta: number): number {
  let t = theta;
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  return t;
}

function angularDistance(a: number, b: number, canRotate: boolean): number {
  const d = Math.abs(a - b);
  return canRotate ? Math.min(d, 2 * Math.PI - d) : d;
}

function effectiveMinSeparationRad(maxAngle: number, canRotate: boolean): number {
  if (canRotate) return MIN_SEPARATION_RAD;
  const segment = (2 * maxAngle) / 5;
  return Math.min(MIN_SEPARATION_RAD, segment * 0.85);
}

function pushAwayFromActual(
  theta: number,
  actualTheta: number,
  maxAngle: number,
  canRotate: boolean,
  minSep: number,
): number {
  if (angularDistance(theta, actualTheta, canRotate) >= minSep) {
    return canRotate ? wrapAngle(theta) : Math.max(-maxAngle, Math.min(maxAngle, theta));
  }
  const sign = theta >= actualTheta ? 1 : -1;
  let next = actualTheta + sign * (minSep + 0.02);
  if (!canRotate) next = Math.max(-maxAngle, Math.min(maxAngle, next));
  else next = wrapAngle(next);
  return next;
}

function minPairwiseSeparation(angles: number[], canRotate: boolean): number {
  let min = Infinity;
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      min = Math.min(min, angularDistance(angles[i]!, angles[j]!, canRotate));
    }
  }
  return min;
}

function oscillationAnchors(maxAngle: number): number[] {
  const segment = (2 * maxAngle) / 5;
  return [1, 2, 3, 4, 5].map((k) => -maxAngle + (k - 0.5) * segment);
}

/** 整圈：相对真实角 +72°/+144°/+216°/+288°（4AFC 为 +90°/+180°/+270°，5AFC 用五等分圆） */
function rotationDistractorAngles(actualTheta: number, rng: () => number): number[] {
  const steps = [1, 2, 3, 4].map((k) => (k * 2 * Math.PI) / 5);
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [steps[i], steps[j]] = [steps[j]!, steps[i]!];
  }
  return steps.map((step) =>
    wrapAngle(actualTheta + step + (rng() - 0.5) * ROTATION_JITTER_RAD),
  );
}

/** 往复：五档锚点去掉离真实角最近的一档，其余四档作干扰 */
function oscillationDistractorAngles(
  actualTheta: number,
  maxAngle: number,
  rng: () => number,
): number[] {
  const anchors = oscillationAnchors(maxAngle);
  let closestIdx = 0;
  let closestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = angularDistance(anchors[i]!, actualTheta, false);
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
  return pool.map((a) => Math.max(-maxAngle, Math.min(maxAngle, a)));
}

function repairOscillationAngles(
  allAngles: number[],
  correctOption: AfcSlot,
  actualTheta: number,
  maxAngle: number,
  minSep: number,
): void {
  for (let pass = 0; pass < 8; pass++) {
    let ok = true;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (angularDistance(allAngles[i]!, allAngles[j]!, false) >= minSep) continue;
        ok = false;
        const fixIdx = i + 1 === correctOption || j + 1 === correctOption ? (i + 1 === correctOption ? j : i) : j;
        let theta = allAngles[fixIdx]!;
        const avoid = allAngles[i === fixIdx ? j : i]!;
        const sign = theta >= avoid ? 1 : -1;
        theta = Math.max(-maxAngle, Math.min(maxAngle, theta + sign * (minSep + 0.01)));
        theta = Math.max(-maxAngle, Math.min(maxAngle, theta));
        if (angularDistance(theta, actualTheta, false) < minSep) {
          theta = Math.max(-maxAngle, Math.min(maxAngle, actualTheta + sign * (minSep + 0.01)));
        }
        allAngles[fixIdx] = theta;
      }
    }
    if (ok) break;
  }
}

function toChoiceThetaDeg(allAngles: number[]): [number, number, number, number, number] {
  return allAngles.map(
    (rad) => Math.round(((rad * 180) / Math.PI) * 1e4) / 1e4,
  ) as [number, number, number, number, number];
}

export type PendulumPositionOptions5 = {
  choiceThetaDeg: [number, number, number, number, number];
  correctOption: AfcSlot;
};

export function generatePendulumPositionOptions5(
  actualThetaRad: number,
  params: PendulumParams,
  rng: () => number,
): PendulumPositionOptions5 {
  const m = PENDULUM_MASS_KG;
  const { rodLengthM: L, gravity: g } = params;
  const E = pendulumEnergy(params);
  const rotationThreshold = 2 * m * g * L;
  const canRotate = E >= rotationThreshold;
  const maxAngle = canRotate
    ? Math.PI
    : Math.acos(Math.max(-1, Math.min(1, 1 - E / (m * g * L))));

  const minSep = effectiveMinSeparationRad(maxAngle, canRotate);
  const actualTheta = canRotate
    ? wrapAngle(actualThetaRad)
    : Math.max(-maxAngle, Math.min(maxAngle, actualThetaRad));

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const correctOption = (Math.floor(rng() * N) + 1) as AfcSlot;
    const allAngles: number[] = new Array(N).fill(NaN);
    allAngles[correctOption - 1] = actualTheta;

    const distractors = canRotate
      ? rotationDistractorAngles(actualTheta, rng)
      : oscillationDistractorAngles(actualTheta, maxAngle, rng);

    let di = 0;
    for (let i = 0; i < N; i++) {
      if (i + 1 === correctOption) continue;
      let theta = distractors[di]!;
      di += 1;
      if (!canRotate) {
        theta = pushAwayFromActual(theta, actualTheta, maxAngle, false, minSep);
      }
      allAngles[i] = theta;
    }

    if (!canRotate) {
      repairOscillationAngles(allAngles, correctOption, actualTheta, maxAngle, minSep);
    }

    if (minPairwiseSeparation(allAngles, canRotate) >= minSep - 1e-9) {
      return { choiceThetaDeg: toChoiceThetaDeg(allAngles), correctOption };
    }
  }

  throw new Error(
    `无法在 ${MAX_GENERATION_ATTEMPTS} 次内生成 5 个满足最小间隔的摆角（minSep≈${((minSep * 180) / Math.PI).toFixed(1)}°，maxAngle≈${((maxAngle * 180) / Math.PI).toFixed(1)}°）`,
  );
}
