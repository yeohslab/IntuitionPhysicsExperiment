# Pendulum rAR-HMM Dataset

Implements `InstitutionPhysics-main/docs/pendulum-dataset-spec.md` (v2.0) and
produces data directly loadable by `rarhmm.data.load_split` in
`InstitutionPhysics-main/rarhmm/`.

## Layout produced

```
data/pendulum/
    manifest.json
    train.npz                 (2960 trajectories, 1,186,480 time-points)
    val.npz                   ( 370 trajectories,   148,310 time-points)
    test_in_dist.npz          ( 370 trajectories,   148,310 time-points)
    test_energy_oos.npz       ( 300 trajectories,   120,000 time-points)
    [json/<split>/traj_NNNNNN.json]    # only with --json
```

Each `<split>.npz` is an `np.savez` archive of object arrays
(`id`, `regime`, `E_bar`, `theta`, `omega`, `energy_drift_max`, `seed`),
which is exactly the layout consumed by
`rarhmm/rarhmm/data.py::_load_npz`.

## Generate

```powershell
& "C:\Users\tonyj\anaconda3\python.exe" generate_dataset.py --out data
# also dump per-trajectory JSON (4000 files):
& "C:\Users\tonyj\anaconda3\python.exe" generate_dataset.py --out data --json
```

## Train rAR-HMM on it

```powershell
cd ..\InstitutionPhysics-main\rarhmm
& "C:\Users\tonyj\anaconda3\python.exe" -m scripts.train_pendulum `
    --data-root ..\..\pendulum_dataset\data\pendulum `
    --K 5 --obs-repr sincos_omega --mode ro `
    --out runs\K5
```

## Reproducibility

Every trajectory uses a deterministic seed
`seed = base_seed * 1_000_000 + k * 1_000 + i`
(`base_seed = 20260518` by default), so the whole 4000-trajectory dataset is
byte-reproducible.
