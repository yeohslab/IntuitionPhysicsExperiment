"""Quick helper to read and print the K5 config."""
import json
import sys
from pathlib import Path

p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "runs" / "K5" / "config.json"
with open(p, "r", encoding="utf-8") as f:
    print(f.read())
