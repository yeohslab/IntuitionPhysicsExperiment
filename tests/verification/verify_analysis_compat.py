"""Verify that the analysis loader accepts legacy and schema-v2 CSV files."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pandas as pd

PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR / "analysis"))

from preprocess import formal_block_trials, load_all_csv  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        common = {
            "subject_id": ["0001"],
            "unit_type": ["pendulumStimulus"],
            "segment_kind": ["block"],
            "pendulum_E_J": [50.0],
            "delta_theta_deg": [1.0],
            "abs_delta_theta_deg": [1.0],
            "rt_estimate_sec": [0.5],
        }
        pd.DataFrame(
            {
                **common,
                "physicsKind": ["pendulum"],
                "theta_actual_deg": [10.0],
                "theta_actual_rad": [0.174532925],
                "omega_actual_deg_per_sec": [20.0],
                "omega_actual_rad_per_sec": [0.34906585],
            }
        ).to_csv(data_dir / "experiment_data_subject0001.csv", index=False)
        pd.DataFrame(
            {
                **{**common, "subject_id": ["0002"]},
                "data_schema_version": [2],
                "experiment_status": ["f"],
                "physics_kind": ["pendulum"],
                "theta_x_t_deg": [11.0],
                "theta_x_t_rad": [0.191986218],
                "omega_x_t_deg_per_sec": [21.0],
                "omega_x_t_rad_per_sec": [0.366519143],
            }
        ).to_csv(data_dir / "experiment_data_subject0002_f.csv", index=False)

        loaded = load_all_csv(data_dir)
        formal = formal_block_trials(loaded)
        assert len(formal) == 2
        assert set(formal["data_schema_version"].astype(int)) == {1, 2}
        assert formal["physics_kind"].notna().all()
        assert formal["theta_x_t_deg"].notna().all()
        assert formal["omega_x_t_rad_per_sec"].notna().all()

    print("verify_analysis_compat: OK")


if __name__ == "__main__":
    main()
