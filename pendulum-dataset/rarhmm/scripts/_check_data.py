import numpy as np
from collections import Counter

z = np.load(r'd:\intuitive physics\pendulum_dataset\data\pendulum\train.npz', allow_pickle=True)
regimes = z['regime']
Ebars = z['E_bar'].astype(float)

print('Regime counts:')
print(Counter(regimes))
print()
print('E_bar stats per regime:')
for r in sorted(set(regimes)):
    mask = np.array([x == r for x in regimes])
    es = Ebars[mask]
    print(f'  {r}: n={mask.sum()}, E_bar=[{es.min():.3f}, {es.max():.3f}], mean={es.mean():.3f}')
    print(f'    T per traj: {z["theta"][mask][0].shape[0]}')
