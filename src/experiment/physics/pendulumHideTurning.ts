import {
  analyzePendulum,
  pendulumThetaOmegaAt,
  type PendulumAnalysis,
  type PendulumParams,
} from "./pendulum";
import {
  fadeDurationSec,
  type StimulusTimingMultiples,
} from "./timePhases";

const OMEGA_ZERO_EPS = 1e-10;
const ROOT_TIME_TOL_SEC = 1e-10;
const BOUNDARY_TIME_EPS_SEC = 1e-8;

export interface PendulumHideTurningAnalysis {
  hide_has_turning: boolean;
  hide_turn_count: number;
  /** 相对隐藏阶段起点的秒数；无转向时为 null。 */
  hide_first_turn_sec: number | null;
  /** 首次转向在隐藏阶段中的相对位置；无转向时为 null。 */
  hide_first_turn_fraction: number | null;
}

function zeroTurningAnalysis(): PendulumHideTurningAnalysis {
  return {
    hide_has_turning: false,
    hide_turn_count: 0,
    hide_first_turn_sec: null,
    hide_first_turn_fraction: null,
  };
}

function omegaAt(
  tSec: number,
  p: PendulumParams,
  analysis: PendulumAnalysis,
): number {
  return pendulumThetaOmegaAt(tSec, p, analysis).omega;
}

function bisectOmegaRoot(
  p: PendulumParams,
  analysis: PendulumAnalysis,
  leftSec: number,
  rightSec: number,
): number {
  let left = leftSec;
  let right = rightSec;
  let leftOmega = omegaAt(left, p, analysis);
  for (let i = 0; i < 80 && right - left > ROOT_TIME_TOL_SEC; i++) {
    const middle = 0.5 * (left + right);
    const middleOmega = omegaAt(middle, p, analysis);
    if (Math.abs(middleOmega) <= OMEGA_ZERO_EPS) return middle;
    if (leftOmega * middleOmega <= 0) {
      right = middle;
    } else {
      left = middle;
      leftOmega = middleOmega;
    }
  }
  return 0.5 * (left + right);
}

/**
 * 分析隐藏开区间内的摆动转向。淡出不计入隐藏；恰落在隐藏起止边界的零角速度不计数。
 * 旋转与临界状态不会在有限隐藏时间内反向，因此固定返回无转向。
 */
export function analyzePendulumHideTurning(
  p: PendulumParams,
  timing: Pick<StimulusTimingMultiples, "show1T" | "hide1T" | "fadeMs">,
  precomputedAnalysis?: PendulumAnalysis,
): PendulumHideTurningAnalysis {
  const analysis = precomputedAnalysis ?? analyzePendulum(p);
  if (analysis.regime !== "oscillation" || timing.hide1T <= 0) {
    return zeroTurningAnalysis();
  }

  const hideStartSec = timing.show1T * analysis.T + fadeDurationSec(timing);
  const hideEndSec = hideStartSec + timing.hide1T;
  const interiorStartSec = hideStartSec + BOUNDARY_TIME_EPS_SEC;
  const interiorEndSec = hideEndSec - BOUNDARY_TIME_EPS_SEC;
  if (interiorEndSec <= interiorStartSec) return zeroTurningAnalysis();

  // 当前实验 hide < T/2，因此最多一个转向；端点符号即可无遗漏判定。
  if (timing.hide1T < 0.5 * analysis.T - 2 * BOUNDARY_TIME_EPS_SEC) {
    const startOmega = omegaAt(interiorStartSec, p, analysis);
    const endOmega = omegaAt(interiorEndSec, p, analysis);
    if (startOmega * endOmega >= 0) return zeroTurningAnalysis();
    const root = bisectOmegaRoot(
      p,
      analysis,
      interiorStartSec,
      interiorEndSec,
    );
    const firstRelativeSec = root - hideStartSec;
    return {
      hide_has_turning: true,
      hide_turn_count: 1,
      hide_first_turn_sec: firstRelativeSec,
      hide_first_turn_fraction: firstRelativeSec / timing.hide1T,
    };
  }

  const sampleSteps = Math.max(64, Math.ceil((timing.hide1T / analysis.T) * 256));
  const roots: number[] = [];
  let previousTime = hideStartSec;
  let previousOmega = omegaAt(previousTime, p, analysis);

  const addInteriorRoot = (absoluteTimeSec: number) => {
    if (
      absoluteTimeSec <= hideStartSec + BOUNDARY_TIME_EPS_SEC ||
      absoluteTimeSec >= hideEndSec - BOUNDARY_TIME_EPS_SEC
    ) {
      return;
    }
    if (roots.some((root) => Math.abs(root - absoluteTimeSec) <= BOUNDARY_TIME_EPS_SEC)) {
      return;
    }
    roots.push(absoluteTimeSec);
  };

  for (let step = 1; step <= sampleSteps; step++) {
    const currentTime = hideStartSec + (step / sampleSteps) * timing.hide1T;
    const currentOmega = omegaAt(currentTime, p, analysis);
    if (Math.abs(previousOmega) <= OMEGA_ZERO_EPS) {
      addInteriorRoot(previousTime);
    }
    if (previousOmega * currentOmega < 0) {
      addInteriorRoot(
        bisectOmegaRoot(p, analysis, previousTime, currentTime),
      );
    }
    if (step === sampleSteps && Math.abs(currentOmega) <= OMEGA_ZERO_EPS) {
      addInteriorRoot(currentTime);
    }
    previousTime = currentTime;
    previousOmega = currentOmega;
  }

  roots.sort((a, b) => a - b);
  if (roots.length === 0) return zeroTurningAnalysis();
  const firstRelativeSec = roots[0]! - hideStartSec;
  return {
    hide_has_turning: true,
    hide_turn_count: roots.length,
    hide_first_turn_sec: firstRelativeSec,
    hide_first_turn_fraction: firstRelativeSec / timing.hide1T,
  };
}
