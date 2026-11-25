import { analyzePendulum, pendulumThetaOmegaAt } from "../../src/experiment/physics/pendulum";
import { writeFileSync } from "node:fs";

// Run with: npx tsx eye_movement_version/tools/physicsParityFixtures.ts output.json
// Exclusive creation protects any existing fixture.
const cases = [
  { name: "oscillation", params: { theta0Rad: 0.8, omega0RadPerSec: -0.3, rodLengthM: 4, gravity: 9.8 }, query_sec: 1.37 },
  { name: "oscillation_rest", params: { theta0Rad: Math.PI / 3, omega0RadPerSec: 0, rodLengthM: 4, gravity: 9.8 }, query_sec: 2.1 },
  { name: "rotation", params: { theta0Rad: 0, omega0RadPerSec: 3.5, rodLengthM: 4, gravity: 9.8 }, query_sec: 1.37 },
];
const fixtures = cases.map(({ name, params, query_sec }) => {
  const analysis = analyzePendulum(params);
  return { name, params, analysis, samples: [0, 0.1, query_sec].map(t_sec => ({ t_sec, ...pendulumThetaOmegaAt(t_sec, params, analysis) })) };
});
const output = process.argv[2];
if (!output) throw new Error("Provide output JSON path");
writeFileSync(output, JSON.stringify({ fixtures }, null, 2) + "\n", { flag: "wx" });
