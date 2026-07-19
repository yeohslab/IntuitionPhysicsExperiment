import sys, pickle, numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ckpt = pickle.load(open(r'd:\intuitive physics\pendulum_dataset\rarhmm\runs\K5\chain.pkl','rb'))
samples = ckpt['samples']
A = np.mean([s.A for s in samples], axis=0)  # (K, 3, 4)
K = A.shape[0]

for k in range(K):
    A_k = A[k, :, :3]
    b_k = A[k, :, 3]
    evals = np.linalg.eigvals(A_k)
    sr = max(abs(evals))
    print(f'=== State {k+1} ===')
    print(f'A =')
    for row in A_k:
        print(f'  [{row[0]:+.4f}, {row[1]:+.4f}, {row[2]:+.4f}]')
    print(f'b = [{b_k[0]:+.4f}, {b_k[1]:+.4f}, {b_k[2]:+.4f}]')
    print(f'Spectral radius = {sr:.6f}')
    for v in evals:
        if np.isreal(v):
            print(f'  eigenvalue: {v.real:.6f}')
        else:
            print(f'  eigenvalue: {v.real:.6f} +/- {abs(v.imag):.6f}j')
    print()
