# Eye movement session schema, version 1

Create a session from the repository root:

```sh
npx tsx eye_movement_version/tools/exportSession.ts --experiment experiment-4-v2 --subject E4-0001 --gender 0 --age 25 --seed 123
```

Supported runtime variants are `training-1`, `experiment-2`, `experiment-4-v2`, and `experiment-5-v3`. Subject IDs require the matching `T1`, `E2`, `E4`, or `E5` prefix and a four-digit nonzero number. Gender is 0 or 1; age is an integer from 1 to 120. The seed is an unsigned 32-bit integer, randomly selected when omitted. `--output path.json` selects an explicit output file; otherwise the exporter creates a unique file under `eye_movement_version/sessions/`. Files are created exclusively and are never overwritten. The module also exports `buildSession({ experiment, participant, seed })`.

Top-level fields:

- `eye_session_schema_version`: schema version 1.
- `session_id`, `created_at`: UUID and creation time.
- `runtime_variant_id`, `experiment_id`, `protocol_version`: exact runtime variant, logical experiment and protocol version.
- `participant`: `subject_id`, `gender_code`, `age_years`.
- `rng_seed`: unsigned seed for Mulberry32 stimulus random choices. Generated identifiers and creation metadata are independently generated and are not reproducible from the seed.
- `provenance`: Git revision and dirty status when available, SHA-256 fingerprints of TypeScript, TSX and CSS source files and the exporter tools, RNG algorithm and seed scope.
- `stimulus_set`: full generated runtime set, including its schema version and complete `sequence`, containing rest, practice and block units and their original instruction HTML.
- `trial_descriptors`: the source runtime's per-trial descriptors, preserving identifiers and its variant-specific fields.
- `physics`: one entry per pendulum unit, keyed by `unit_id` with `unit_type`, `params` and `analysis`. Parameters are radians, radians/second, meters, and m/s²; analysis is the original `analyzePendulum` result (energy in joules and period in seconds). Demo amplitude is converted from degrees with zero initial angular velocity. Rotation analysis has no oscillation-only fields. Straight-line training has no pendulum analysis.
- `protocol_settings`: exported protocol constants and protocol-2 shared constants. Training additionally describes the Python-controlled mastery retry loop; its sequence contains finite templates, not an unbounded expansion.
- `behavior_columns`: original runtime behavioral CSV columns in order, followed by missing response fields. The helper `behaviorCsv` uses this order and leaves unknown values empty.
- `assets.masked_hum`: `assets/masked-hum.wav`, relative to `eye_movement_version`.

Generation calls the runtime generator assertions and runnable-set validator; it rejects invalid participants, seeds, physics parameters and non-finite numerical values. To generate source-model parity samples, run `npx tsx eye_movement_version/tools/physicsParityFixtures.ts path/to/new-fixtures.json`; it writes oscillation and rotation states at zero, 0.1 seconds, and a query time without overwriting an existing file.
