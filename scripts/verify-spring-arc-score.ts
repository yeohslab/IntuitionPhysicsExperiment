import type { SpringParams } from "../src/physics/spring.ts";
import {
  springIntervalHit,
  springPositionErrorM,
  springTrialScore,
  springWMaxM,
  SCORE_MAX,
} from "../src/physics/springArcScore.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const sp: SpringParams = { massKg: 1, stiffness: 4, x0M: 0.5, v0Mps: 0 };
const A = springWMaxM(sp);
assert(A > 0, "amplitude > 0");

const actual = 0.1;
assert(springPositionErrorM(actual, actual) < 1e-12, "e=0");
assert(springIntervalHit(0, 0), "hit w=0");
assert(springTrialScore(0, A, true) === SCORE_MAX, "full score");

assert(springTrialScore(A, A, true) === 0, "w=A => 0");
assert(springTrialScore(0.1, A, false) === 0, "miss => 0");

console.log("verify-spring-arc-score: OK");
