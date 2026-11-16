import type { Experiment5V3ApproachSide } from "./approachPlan";
import {
  EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG,
  EXPERIMENT_5_V3_ROD_LENGTH_M,
  EXPERIMENT_5_V3_SLIT_WIDTH_M,
} from "./protocol";

export type Experiment5V3Slit = {
  slitWidthM: number;
  slitCenterM: number;
  slitLeftM: number;
  slitRightM: number;
  slitCenterDeg: number;
  slitLeftDeg: number;
  slitRightDeg: number;
};

/** 铃铛在左时摆球从右侧出发，缝放在正横坐标。 */
export function experiment5V3SlitSign(bellSide: Experiment5V3ApproachSide): 1 | -1 {
  return bellSide === "left" ? 1 : -1;
}

/** 出发侧外沿的横坐标绝对值：摆长乘以 sin(振幅 − 9°)。 */
export function experiment5V3SlitEdgeLimitM(
  amplitudeDeg: number,
  rodLengthM = EXPERIMENT_5_V3_ROD_LENGTH_M,
): number {
  const phiDeg = amplitudeDeg + EXPERIMENT_5_V3_LOWEST_BELL_OFFSET_DEG;
  return rodLengthM * Math.sin((phiDeg * Math.PI) / 180);
}

function angleDeg(xM: number, rodLengthM: number): number {
  return (Math.asin(xM / rodLengthM) * 180) / Math.PI;
}

/**
 * 出发侧单缝网格。把 [0, L sin φ] 分成 count 等份，缝中心放在每一份的中点，不取两端。
 * 左右边因此落在该区间或其左侧镜像内部。正式为 6，练习为 2。
 */
export function experiment5V3SlitGrid(
  amplitudeDeg: number,
  bellSide: Experiment5V3ApproachSide,
  count: number,
  rodLengthM = EXPERIMENT_5_V3_ROD_LENGTH_M,
): Experiment5V3Slit[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new Error("单缝网格至少需要两个位置");
  }
  const half = EXPERIMENT_5_V3_SLIT_WIDTH_M / 2;
  const limit = experiment5V3SlitEdgeLimitM(amplitudeDeg, rodLengthM);
  if (!(limit / (2 * count) > half)) {
    throw new Error(`振幅 ${amplitudeDeg}° 的出发侧区间放不下 ${count} 条缝`);
  }
  const sign = experiment5V3SlitSign(bellSide);
  const slits: Experiment5V3Slit[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = sign * ((index + 0.5) / count) * limit;
    const left = center - half;
    const right = center + half;
    slits.push({
      slitWidthM: EXPERIMENT_5_V3_SLIT_WIDTH_M,
      slitCenterM: center,
      slitLeftM: left,
      slitRightM: right,
      slitCenterDeg: angleDeg(center, rodLengthM),
      slitLeftDeg: angleDeg(left, rodLengthM),
      slitRightDeg: angleDeg(right, rodLengthM),
    });
  }
  return slits;
}

/** 左右边都在该试次的出发侧区间内，且缝宽与记录一致。 */
export function experiment5V3SlitFitsDepartureSide(
  amplitudeDeg: number,
  bellSide: Experiment5V3ApproachSide,
  slit: Pick<Experiment5V3Slit, "slitWidthM" | "slitLeftM" | "slitRightM" | "slitCenterM">,
  rodLengthM = EXPERIMENT_5_V3_ROD_LENGTH_M,
): boolean {
  const limit = experiment5V3SlitEdgeLimitM(amplitudeDeg, rodLengthM);
  const tolerance = 1e-8;
  const widthMatches = Math.abs(slit.slitRightM - slit.slitLeftM - slit.slitWidthM) <= tolerance;
  const centerMatches = Math.abs(
    slit.slitCenterM - (slit.slitLeftM + slit.slitRightM) / 2,
  ) <= tolerance;
  const onDepartureSide = bellSide === "left"
    ? slit.slitLeftM >= -tolerance && slit.slitRightM <= limit + tolerance
    : slit.slitRightM <= tolerance && slit.slitLeftM >= -limit - tolerance;
  return widthMatches && centerMatches && onDepartureSide && slit.slitWidthM > 0;
}
