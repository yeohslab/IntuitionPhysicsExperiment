import numpy as np

for split in ['val', 'test_in_dist', 'test_energy_oos']:
    z = np.load(rf'd:\intuitive physics\pendulum_dataset\data\pendulum\{split}.npz', allow_pickle=True)
    ids_to_find = ['traj_002973', 'traj_003073', 'traj_003247']
    traj_ids = z['id']
    for tid in ids_to_find:
        for i in range(len(traj_ids)):
            if traj_ids[i] == tid:
                print(f'{split}/{tid}: regime={z["regime"][i]}, E_bar={float(z["E_bar"][i]):.3f}')
