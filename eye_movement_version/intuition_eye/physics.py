"""Original analytic pendulum and fixed-substep velocity Verlet in SI units."""
from __future__ import annotations
import math


class Pendulum:
    def __init__(self, entry):
        self.params = entry['params']
        self.analysis = entry['analysis']
        self._theta = self.params['theta0Rad']
        self._omega = self.params['omega0RadPerSec']
        self._time = 0.
        self._ellipj = None
        if self.analysis['regime'] != 'rotation':
            from scipy.special import ellipj
            self._ellipj = ellipj

    def at(self, t):
        t = max(0., float(t))
        p, a = self.params, self.analysis
        if a['regime'] != 'rotation':
            k = a['kOsc']
            # scipy accepts parameter m=k²; the TypeScript implementation accepts k.
            sn, cn, dn, _ = self._ellipj(a['alpha'] * t + a['psiOsc'], k * k)
            arg = max(-1., min(1., k * sn))
            theta = 2 * math.asin(arg)
            omega = 2 * k * a['alpha'] * cn * dn / math.sqrt(max(1e-20, 1 - arg * arg))
            return float(theta), float(omega)
        if t < self._time:
            self._theta, self._omega, self._time = p['theta0Rad'], p['omega0RadPerSec'], 0.
        remaining = t - self._time
        g_l = p['gravity'] / p['rodLengthM']
        while remaining > 1e-12:
            h = min(remaining, 1 / 4000)
            half = self._omega - .5 * h * g_l * math.sin(self._theta)
            self._theta += h * half
            self._omega = half - .5 * h * g_l * math.sin(self._theta)
            remaining -= h
        self._time = t
        return self._theta, self._omega


def scene_alpha(t, blank_start, fade_sec=.3):
    # Like protocol2SceneAlpha, fit the fade inside the available pre-blank time.
    # A blank starting before 300 ms still begins with a fully visible scene.
    fade_start = max(0., blank_start - fade_sec)
    if t <= fade_start:
        return 1.0
    if t >= blank_start:
        return 0.0
    span = blank_start - fade_start
    return max(0., min(1., 1 - (t - fade_start) / span)) if span > 1e-12 else 0.0
