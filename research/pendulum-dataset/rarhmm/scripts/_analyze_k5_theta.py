"""Analyze K5_theta A matrices."""
import sys, pickle, numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collections import Counter

ckpt = pickle.load(open(r'd:\intuitive physics\pendulum_dataset\rarhmm\runs\K5_theta\chain.pkl','rb'))
samples = ckpt['samples']
A = np.mean([s.A for s in samples], axis=0)
K = A.shape[0]

z = ckpt['z_last']
all_z = np.concatenate(z)
print(f"State distribution: {Counter(all_z.tolist())}")
for k in range(K):
    pct = (all_z == k).sum() / len(all_z) * 100
    print(f"  State {k+1}: {pct:.1f}%")
print()

for k in range(K):
    A_k = A[k, :, :2]  # 2x2 for theta_omega
    b_k = A[k, :, 2]
    evals = np.linalg.eigvals(A_k)
    sr = max(abs(evals))
    print(f'=== State {k+1} ===')
    print(f'A = [{A_k[0,0]:+.4f}, {A_k[0,1]:+.4f}]')
    print(f'    [{A_k[1,0]:+.4f}, {A_k[1,1]:+.4f}]')
    print(f'b = [{b_k[0]:+.4f}, {b_k[1]:+.4f}]')
    print(f'Spectral radius = {sr:.6f}')
    for v in evals:
        if np.isreal(v):
            print(f'  eigenvalue: {v.real:.6f}')
        else:
            print(f'  eigenvalue: {v.real:.6f} +/- {abs(v.imag):.6f}j  (|λ|={abs(v):.6f})')
    print()

print("=== Frobenius distances between A matrices ===")
for i in range(K):
    for j in range(i+1, K):
        d = np.linalg.norm(A[i] - A[j])
        print(f"  State {i+1} vs {j+1}: {d:.4f}")
