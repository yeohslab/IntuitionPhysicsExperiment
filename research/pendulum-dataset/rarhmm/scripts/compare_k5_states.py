"""Compare K5 dynamics matrices to check if states are redundant."""
import sys, pickle, numpy as np
sys.path.insert(0, '.')
from rarhmm.train import load_checkpoint

ckpt = load_checkpoint('runs/K5_fixed_bias/chain.pkl')
samples = ckpt['samples']
A = np.mean([s.A for s in samples], axis=0)  # (K, M, M+1)
Q = np.mean([s.Q for s in samples], axis=0)  # (K, M, M)
K, M, _ = A.shape

print('=' * 70)
print('K5 Posterior Mean Dynamics Comparison')
print('=' * 70)

for k in range(K):
    A_dyn = A[k, :, :M]
    b_k = A[k, :, M]
    print(f'\nState {k+1}:')
    print('  A_dyn =')
    for row in A_dyn:
        vals = ', '.join(f'{v:+.6f}' for v in row)
        print(f'    [{vals}]')
    vals_b = ', '.join(f'{v:+.6f}' for v in b_k)
    print(f'  b     = [{vals_b}]')
    evals = np.linalg.eigvals(A_dyn)
    ev_str = ', '.join(f'{e:.4f}' for e in evals)
    print(f'  eigenvalues: [{ev_str}]')
    print(f'  spectral radius: {max(abs(evals)):.6f}')
    q_str = ', '.join(f'{v:.6f}' for v in np.diag(Q[k]))
    print(f'  Q_diag = [{q_str}]')

# Pairwise differences
print('\n' + '=' * 70)
print('Pairwise Frobenius distance')
print('=' * 70)
for i in range(K):
    for j in range(i + 1, K):
        d_A = np.linalg.norm(A[i, :, :M] - A[j, :, :M], 'fro')
        d_b = np.linalg.norm(A[i, :, M] - A[j, :, M])
        d_total = np.linalg.norm(A[i] - A[j], 'fro')
        print(f'  State {i+1} vs {j+1}: ||dA||_F={d_A:.6f}  ||db||={d_b:.6f}  ||d[A|b]||_F={d_total:.6f}')

# Compare to mean
A_mean = A.mean(axis=0)
print('\n' + '=' * 70)
print('Distance from each state to the overall average')
print('=' * 70)
for k in range(K):
    d = np.linalg.norm(A[k] - A_mean, 'fro')
    print(f'  State {k+1}: ||A_k - A_avg||_F = {d:.6f}')

print('\nAverage A_dyn:')
for row in A_mean[:, :M]:
    vals = ', '.join(f'{v:+.6f}' for v in row)
    print(f'  [{vals}]')
vals_b = ', '.join(f'{v:+.6f}' for v in A_mean[:, M])
print(f'Average b: [{vals_b}]')

# Max element-wise difference
print('\n' + '=' * 70)
print('Max element-wise |A_i - A_j| across all pairs')
print('=' * 70)
max_diff = 0
for i in range(K):
    for j in range(i + 1, K):
        d = np.max(np.abs(A[i] - A[j]))
        if d > max_diff:
            max_diff = d
        print(f'  State {i+1} vs {j+1}: max|diff| = {d:.6f}')
print(f'\nOverall max element-wise diff: {max_diff:.6f}')
