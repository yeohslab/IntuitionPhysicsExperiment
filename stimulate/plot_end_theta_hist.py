"""绘制两组刺激终点角直方图，输出到 stimulate/。

用法：
  uv run python stimulate/plot_end_theta_hist.py [csv] [out_dir]
默认读取同目录 end_theta_by_group.csv。
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent


def setup_fonts() -> None:
    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttf",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            font_manager.fontManager.addfont(path)
            family = font_manager.FontProperties(fname=path).get_name()
            plt.rcParams["font.sans-serif"] = [family, "DejaVu Sans"]
            break
    else:
        plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False


def plot_group_hist(
    angles_deg: np.ndarray,
    *,
    group: int,
    title: str,
    out_path: Path,
    dpi: int = 150,
) -> None:
    fig, ax = plt.subplots(figsize=(8, 5))
    bins = np.linspace(-180, 180, 37)  # 10° 宽
    ax.hist(
        angles_deg,
        bins=bins,
        color="#4C78A8" if group == 1 else "#F58518",
        edgecolor="white",
        linewidth=0.6,
    )
    ax.set_xlim(-180, 180)
    ax.set_xlabel(r"终点角 $\theta_{\mathrm{end}}$ (°)")
    ax.set_ylabel("试次数")
    ax.set_title(title)
    ax.axvline(0, color="0.35", linewidth=0.8, linestyle="--")
    n = len(angles_deg)
    mean = float(np.mean(angles_deg))
    std = float(np.std(angles_deg, ddof=1)) if n > 1 else 0.0
    ax.text(
        0.02,
        0.98,
        f"n = {n}\nmean = {mean:.1f}°\nstd = {std:.1f}°",
        transform=ax.transAxes,
        va="top",
        ha="left",
        fontsize=10,
        bbox={
            "boxstyle": "round,pad=0.3",
            "facecolor": "white",
            "alpha": 0.85,
            "edgecolor": "0.8",
        },
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=dpi)
    plt.close(fig)
    print(f"Wrote {out_path} (n={n})")


def main() -> None:
    setup_fonts()
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "end_theta_by_group.csv"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE
    df = pd.read_csv(csv_path)

    specs = [
        (1, "组1（摆动）正式试次终点角分布", "end_theta_hist_group1.png"),
        (2, "组2（旋转）正式试次终点角分布", "end_theta_hist_group2.png"),
    ]
    for group, title, filename in specs:
        angles = df.loc[df["group"] == group, "theta_end_deg"].to_numpy(dtype=float)
        if angles.size == 0:
            raise SystemExit(f"group={group} 无数据：{csv_path}")
        plot_group_hist(angles, group=group, title=title, out_path=out_dir / filename)


if __name__ == "__main__":
    main()
