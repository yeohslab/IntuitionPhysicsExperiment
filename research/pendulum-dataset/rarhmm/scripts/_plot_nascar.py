"""Quick plot of NASCAR ground truth trajectory."""
import numpy as np
import matplotlib.pyplot as plt

data = np.load(r"d:\intuitive physics\pendulum_dataset\rarhmm\runs\nascar\nascar_data.npz")
x, z = data["x"], data["z_true"]

colors = [(0.214,0.467,0.659), (0.890,0.102,0.110),
          (0.992,0.749,0.000), (0.506,0.694,0.341)]

fig, ax = plt.subplots(figsize=(5, 5))
zcps = np.concatenate(([0], np.where(np.diff(z))[0] + 1, [z.size]))
for start, stop in zip(zcps[:-1], zcps[1:]):
    ax.plot(x[start:stop+1, 0], x[start:stop+1, 1],
            lw=0.5, color=colors[z[start] % len(colors)], alpha=0.8)
ax.set_xlabel("$x_1$"); ax.set_ylabel("$x_2$")
ax.set_title("NASCAR ground truth trajectory")
ax.set_aspect("equal")
fig.tight_layout()
fig.savefig(r"d:\intuitive physics\pendulum_dataset\rarhmm\runs\nascar\nascar_trajectory.png", dpi=150)
print("saved")
