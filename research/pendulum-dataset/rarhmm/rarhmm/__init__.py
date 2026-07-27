"""rAR-HMM package — see rarhmm/README.md and docs/model_spec.md."""

from .config import Config
from .model import RecurrentARHMM, ModelParams
from .train import fit
from .predict import rollout

__all__ = ["Config", "RecurrentARHMM", "ModelParams", "fit", "rollout"]
