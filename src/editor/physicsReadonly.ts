import type {
  PendulumPracticeUnit,
  PendulumStimulusUnit,
  SpringPracticeUnit,
  SpringStimulusUnit,
} from "../types/experiment";
import { analyzePendulum } from "../physics/pendulum";
import type { PendulumParams } from "../physics/pendulum";
import { springAnalysis } from "../physics/spring";
import type { SpringParams } from "../physics/spring";
import { sumSegmentMultiples } from "../physics/timePhases";

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function physicsReadonlyBlock(
  u: PendulumPracticeUnit | PendulumStimulusUnit | SpringPracticeUnit | SpringStimulusUnit,
): string {
  if (u.type === "pendulumPractice" || u.type === "pendulumStimulus") {
    const p: PendulumParams = {
      theta0Rad: degToRad(u.theta0Deg),
      omega0RadPerSec: degToRad(u.omega0DegPerSec),
      rodLengthM: u.rodLengthM,
      gravity: u.gravity,
    };
    const a = analyzePendulum(p);
    const totalT = u.type === "pendulumStimulus" ? sumSegmentMultiples(u) : null;
    const regimeLabel =
      a.regime === "oscillation" ? "往复摆动" : a.regime === "rotation" ? "绕圈旋转" : "临界附近";
    return `
      <div class="physics-readonly" id="physics-readonly">
        <p><strong>能量 E</strong>：${a.E.toFixed(4)} J（m=1 kg）</p>
        <p><strong>周期 T</strong>：${a.T.toFixed(4)} s</p>
        <p><strong>动力学</strong>：${regimeLabel}</p>
        ${
          u.type === "pendulumPractice"
            ? `<p><strong>练习时长</strong>：${(u.displayTimeT * a.T).toFixed(2)} s（${u.displayTimeT} T）</p>`
            : `<p><strong>总时历</strong>：${((totalT ?? 0) * a.T).toFixed(2)} s（${(totalT ?? 0).toFixed(2)} T，四段之和）</p>`
        }
      </div>`;
  }
  const sp: SpringParams = { massKg: u.massKg, stiffness: u.stiffness, x0M: u.x0M, v0Mps: u.v0Mps };
  const { E, T } = springAnalysis(sp);
  const totalT = u.type === "springStimulus" ? sumSegmentMultiples(u) : null;
  return `
    <div class="physics-readonly" id="physics-readonly">
      <p><strong>能量 E</strong>：${E.toFixed(4)} J</p>
      <p><strong>周期 T</strong>：${T.toFixed(4)} s</p>
      ${
        u.type === "springPractice"
          ? `<p><strong>练习时长</strong>：${(u.displayTimeT * T).toFixed(2)} s（${u.displayTimeT} T）</p>`
          : `<p><strong>总时历</strong>：${((totalT ?? 0) * T).toFixed(2)} s（${(totalT ?? 0).toFixed(2)} T，四段之和）</p>`
      }
    </div>`;
}

export type PhysicsEditableUnit =
  | PendulumPracticeUnit
  | PendulumStimulusUnit
  | SpringPracticeUnit
  | SpringStimulusUnit;

export function refreshPhysicsReadonly(container: HTMLElement, u: PhysicsEditableUnit): void {
  const el = container.querySelector("#physics-readonly");
  if (!el) return;
  el.outerHTML = physicsReadonlyBlock(u);
}

