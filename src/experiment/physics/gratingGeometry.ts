/** Version-independent geometry for a stationary vertical grating. */
export type GratingGeometry = {
  gapM: number;
  barWidthM: number;
  periodM: number;
  offsetM: number;
};

export type BobVisibility = "fully_occluded" | "fully_visible" | "partial";

export function gratingBarIndexAtX(
  xM: number,
  geometry: GratingGeometry,
): number {
  return Math.round((xM - geometry.offsetM) / geometry.periodM);
}

export function gratingBarCentersM(
  geometry: GratingGeometry,
  xMax = 8,
): number[] {
  const kMin = Math.floor((-xMax - geometry.offsetM) / geometry.periodM) - 1;
  const kMax = Math.ceil((xMax - geometry.offsetM) / geometry.periodM) + 1;
  const centers: number[] = [];
  for (let k = kMin; k <= kMax; k += 1) {
    centers.push(geometry.offsetM + k * geometry.periodM);
  }
  return centers;
}

export function classifyBobAtX(
  xM: number,
  bobRadiusM: number,
  geometry: GratingGeometry,
): BobVisibility {
  const halfBar = geometry.barWidthM / 2;
  const n = gratingBarIndexAtX(xM, geometry);
  const d = Math.abs(xM - (geometry.offsetM + n * geometry.periodM));
  if (d <= halfBar - bobRadiusM) return "fully_occluded";
  if (
    d >= halfBar + bobRadiusM &&
    d <= geometry.periodM - halfBar - bobRadiusM
  ) {
    return "fully_visible";
  }
  return "partial";
}

export function isBobExposedAtX(
  xM: number,
  bobRadiusM: number,
  geometry: GratingGeometry,
): boolean {
  return classifyBobAtX(xM, bobRadiusM, geometry) !== "fully_occluded";
}
