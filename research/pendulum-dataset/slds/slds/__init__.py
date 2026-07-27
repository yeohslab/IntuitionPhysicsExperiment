"""rSLDS package — recurrent Switching Linear Dynamical System.

Extends the rAR-HMM by adding an observation layer below x:
  y_t = C x_t + noise,  C = [1, 0]  (observe theta only, omega is latent)
"""

from .config import Config
from .model import RecurrentSLDS, ModelParams
from .train import fit
from .train_vi import fit_vi
from .predict import rollout

__all__ = ["Config", "RecurrentSLDS", "ModelParams", "fit", "fit_vi", "rollout"]
