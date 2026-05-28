import type {
  PendulumDisplayUnit,
  PendulumStimulusUnit,
  SpringPracticeUnit,
  SpringStimulusUnit,
} from "../types/experiment";
import { analyzePendulum } from "../physics/pendulum";
import type { PendulumParams } from "../physics/pendulum";
import { pendulumAngleDegFromRad, pendulumWMaxDeg } from "../physics/pendulumArcScore";
import { springAnalysis } from "../physics/spring";
import type { SpringParams } from "../physics/spring";
import { springWMaxM } from "../physics/springArcScore";
import { pendulumThetaAtSimEnd, springDisplacementAtSimEnd } from "../physics/simEndState";
import { stimulusTotalSec, stimulusTotalTimeT } from "../physics/timePhases";

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function physicsReadonlyBlock(
  u: PendulumDisplayUnit | PendulumStimulusUnit | SpringPracticeUnit | SpringStimulusUnit,
): string {
  if (u.type === "pendulumDisplay" || u.type === "pendulumStimulus") {
    const p: PendulumParams = {
      theta0Rad: degToRad(u.theta0Deg),
      omega0RadPerSec: degToRad(u.omega0DegPerSec),
      rodLengthM: u.rodLengthM,
      gravity: u.gravity,
    };
    const a = analyzePendulum(p);
    const totalT = u.type === "pendulumStimulus" ? stimulusTotalTimeT(u, a.T) : null;
    const totalSec = u.type === "pendulumStimulus" ? stimulusTotalSec(u, a.T) : null;
    const regimeLabel =
      a.regime === "oscillation" ? "往复摆动" : a.regime === "rotation" ? "绕圈旋转" : "临界附近";
    return `
      <div class="physics-readonly" id="physics-readonly">
        <p><strong>能量 E</strong>：${a.E.toFixed(4)} J（m=1 kg）</p>
        <p><strong>周期 T</strong>：${a.T.toFixed(4)} s</p>
        <p><strong>动力学</strong>：${regimeLabel}</p>
        ${
          u.type === "pendulumDisplay"
            ? `<p><strong>显示时长</strong>：${(u.displayTimeT * a.T).toFixed(2)} s（${u.displayTimeT} T）</p>`
            : `<p><strong>总时历</strong>：${(totalSec ?? 0).toFixed(2)} s（${(totalT ?? 0).toFixed(2)} T；隐藏段为秒）</p>
        <p><strong>不确定度上限 w<sub>max</sub></strong>：${pendulumWMaxDeg(a.E, a.regime, u.rodLengthM, u.gravity).toFixed(2)}°</p>
        <p class="muted">仿真终态 θ≈${pendulumAngleDegFromRad(pendulumThetaAtSimEnd(p, u)).toFixed(2)}°</p>`
        }
      </div>`;
  }
  const sp: SpringParams = { massKg: u.massKg, stiffness: u.stiffness, x0M: u.x0M, v0Mps: u.v0Mps };
  const { E, T } = springAnalysis(sp);
  const totalT = u.type === "springStimulus" ? stimulusTotalTimeT(u, T) : null;
  const totalSec = u.type === "springStimulus" ? stimulusTotalSec(u, T) : null;
  return `
    <div class="physics-readonly" id="physics-readonly">
      <p><strong>能量 E</strong>：${E.toFixed(4)} J</p>
      <p><strong>周期 T</strong>：${T.toFixed(4)} s</p>
      ${
        u.type === "springPractice"
          ? `<p><strong>显示时长</strong>：${(u.displayTimeT * T).toFixed(2)} s（${u.displayTimeT} T）</p>`
          : `<p><strong>总时历</strong>：${(totalSec ?? 0).toFixed(2)} s（${(totalT ?? 0).toFixed(2)} T；隐藏段为秒）</p>
        <p><strong>不确定度上限 w<sub>max</sub></strong>：${springWMaxM(sp).toFixed(4)} m</p>
        <p class="muted">仿真终态 x≈${springDisplacementAtSimEnd(sp, u).toFixed(4)} m</p>`
      }
    </div>`;
}

export type PhysicsEditableUnit =
  | PendulumDisplayUnit
  | PendulumStimulusUnit
  | SpringPracticeUnit
  | SpringStimulusUnit;

export function refreshPhysicsReadonly(container: HTMLElement, u: PhysicsEditableUnit): void {
  const el = container.querySelector("#physics-readonly");
  if (!el) return;
  el.outerHTML = physicsReadonlyBlock(u);
}
