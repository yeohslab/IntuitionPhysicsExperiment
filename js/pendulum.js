/**
 * 单摆模拟：预计算轨迹 → 自动播放（可视/不可视）→ 汇报时间末端摆角。
 * 动力学：θ̈ = −(g/L) sin θ。周期 T 由守恒 Ē 解析/积分求得；轨迹用 RK4 积分（与 T 一致）。
 * 角度与角速度约定：竖直向下为 0°，向右为正、向左为负；角速度正值表示摆角增大（向右摆）。
 * 系统能量：E\u0304 = E/(mgL) = ω²L/(2g) + (1 − cosθ)
 *   低能：E\u0304 = 0.4（小幅 libration）
 *   中能：E\u0304 = 1.4（大幅 libration）
 *   高能：E\u0304 = 2.5（rotation，越过 separatrix E\u0304 = 2）
 */
(function (global) {
  'use strict';

  /** 重力加速度 (m/s²)，杆-球转动模型 θ̈ = −(g/L) sin θ */
  var G_MPS2 = 9.80665;
  /** 画布显示：1 m 对应像素数（越大摆球活动区越大） */
  var PX_PER_M = 280;
  /** 每试次开始注视点「+」最短呈现时间 (ms) */
  var FIXATION_MS = 2000;
  var DEFAULT_PHASE_FACTORS = [1, 0.4, 1, 0.4];
  /** 能量轨迹推进、转圈周期积分步长 (s) */
  var DT_ENERGY = 1 / 8192;
  var THETA_INTEGRAL_STEPS = 65536;

  var ENERGY_LEVELS = {
    low: 0.4,
    medium: 1.4,
    high: 2.5,
  };

  /**
   * 根据能量等级和摆长，推导初始 (θ₀, ω₀)。
   * libration（E\u0304 < 2）：起点放在转折点，θ₀ = arccos(1 − E\u0304)，ω₀ = 0。
   * rotation（E\u0304 > 2）：起点放在最低点 θ₀ = 0，ω₀ = √(2gE\u0304/L)。
   */
  function lengthMToPx(Lm) {
    return Number(Lm) * PX_PER_M;
  }

  function deriveInitialFromEnergy(level, lengthM) {
    if (!Object.prototype.hasOwnProperty.call(ENERGY_LEVELS, level)) return null;
    var Ebar = ENERGY_LEVELS[level];
    var L = Number(lengthM);
    if (!isFinite(L) || L <= 0) return null;
    if (Ebar < 2) {
      var theta0 = Math.acos(1 - Ebar);
      return {
        startAngleDeg: rad2deg(theta0),
        initialAngularVelocityDegPerS: 0,
        startAngleRad: theta0,
        initialAngularVelocityRadPerS: 0,
        energyBar: Ebar,
      };
    }
    var omega = Math.sqrt((2 * G_MPS2 * Ebar) / L);
    return {
      startAngleDeg: 0,
      initialAngularVelocityDegPerS: rad2deg(omega),
      startAngleRad: 0,
      initialAngularVelocityRadPerS: omega,
      energyBar: Ebar,
    };
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function deg2rad(d) {
    return (d * Math.PI) / 180;
  }

  function rad2deg(r) {
    return (r * 180) / Math.PI;
  }

  /** 仿真弧度 θ → 被试汇报角度（°，竖直向下 0°，右正左负） */
  function thetaToUserDeg(theta) {
    return rad2deg(theta);
  }

  function computeEnergyBar(thetaRad, omegaRadPerS, lengthM) {
    var L = Number(lengthM);
    if (!isFinite(L) || L <= 0) return NaN;
    var th = Number(thetaRad) || 0;
    var om = Number(omegaRadPerS) || 0;
    return (om * om * L) / (2 * G_MPS2) + (1 - Math.cos(th));
  }

  /** 由 Ē 得角速度大小 |ω|(θ) = √(2g/L · (Ē − 1 + cosθ)) */
  function omegaMagnitudeFromEnergy(theta, Ebar, lengthM) {
    var u = ((2 * G_MPS2) / lengthM) * (Ebar - 1 + Math.cos(theta));
    return u > 0 ? Math.sqrt(u) : 0;
  }

  /** 第一类完全椭圆积分 K(m)，m = sin²(θ_max/2)，AGM */
  function completeEllipticK(m) {
    if (m >= 1) return Infinity;
    if (m <= 0) return Math.PI / 2;
    var a = 1;
    var b = Math.sqrt(1 - m);
    while (Math.abs(a - b) > 1e-15 * a) {
      var t = 0.5 * (a + b);
      b = Math.sqrt(a * b);
      a = t;
    }
    return Math.PI / (2 * a);
  }

  /** ∫_{θ_a}^{θ_b} dθ / |ω(θ)|，ω 仅由能量决定 */
  function integrateTimeOverTheta(thetaA, thetaB, lengthM, Ebar) {
    var lo = Math.min(thetaA, thetaB);
    var hi = Math.max(thetaA, thetaB);
    if (hi - lo < 1e-14) return 0;
    var n = THETA_INTEGRAL_STEPS;
    var h = (hi - lo) / n;
    function invOmega(th) {
      var om = omegaMagnitudeFromEnergy(th, Ebar, lengthM);
      return om > 1e-12 ? 1 / om : Infinity;
    }
    var sum = invOmega(lo) + invOmega(h);
    for (var i = 1; i < n; i += 2) {
      sum += 4 * invOmega(lo + i * h);
    }
    for (var j = 2; j < n; j += 2) {
      sum += 2 * invOmega(lo + j * h);
    }
    return (h / 3) * sum;
  }

  /** 摆动（Ē < 2）：T = 4√(L/g) K(sin²(θ_max/2))，θ_max = arccos(1−Ē) */
  function periodLibrationFromEnergy(lengthM, Ebar) {
    if (Ebar >= 2) return NaN;
    var cosTurn = clamp(1 - Ebar, -1, 1);
    var thetaMax = Math.acos(cosTurn);
    var m = Math.sin(thetaMax * 0.5) * Math.sin(thetaMax * 0.5);
    return 4 * Math.sqrt(lengthM / G_MPS2) * completeEllipticK(m);
  }

  /**
   * 转圈（Ē ≥ 2）：T = ∫ dθ/ω(θ)，从 θ₀ 沿初角速度方向转过 2π（ω 由 Ē 决定）。
   */
  function periodRotationFromEnergy(theta0, omega0, lengthM, Ebar) {
    var spinSign = Math.sign(omega0) || 1;
    var thetaEnd = theta0 + spinSign * 2 * Math.PI;
    return integrateTimeOverTheta(theta0, thetaEnd, lengthM, Ebar);
  }

  function estimatePeriodSec(theta0, omega0, lengthM, Ebar) {
    if (Ebar >= 2 - 1e-10) {
      var tRot = periodRotationFromEnergy(theta0, omega0, lengthM, Ebar);
      if (!isFinite(tRot) || tRot <= 0) {
        throw new Error('无法由能量积分估计转圈周期 T（Ē≥2）');
      }
      return tRot;
    }
    var tLib = periodLibrationFromEnergy(lengthM, Ebar);
    if (!isFinite(tLib) || tLib <= 0) {
      throw new Error('无法由能量估计摆动周期 T');
    }
    return tLib;
  }

  function estimatePeriodMs(startAngleRad, w0RadPerS, lengthM) {
    var L = Number(lengthM);
    if (!isFinite(L) || L <= 0) return NaN;
    var th0 = Number(startAngleRad) || 0;
    var om0 = Number(w0RadPerS) || 0;
    var Ebar = computeEnergyBar(th0, om0, L);
    return estimatePeriodSec(th0, om0, L, Ebar) * 1000;
  }

  function rk4Step(theta, omega, lengthM, dt) {
    function f(th, om) {
      return {
        dth: om,
        dom: (-G_MPS2 / lengthM) * Math.sin(th),
      };
    }
    var k1 = f(theta, omega);
    var k2 = f(theta + 0.5 * dt * k1.dth, omega + 0.5 * dt * k1.dom);
    var k3 = f(theta + 0.5 * dt * k2.dth, omega + 0.5 * dt * k2.dom);
    var k4 = f(theta + dt * k3.dth, omega + dt * k3.dom);
    return {
      theta: theta + (dt / 6) * (k1.dth + 2 * k2.dth + 2 * k3.dth + k4.dth),
      omega: omega + (dt / 6) * (k1.dom + 2 * k2.dom + 2 * k3.dom + k4.dom),
    };
  }

  function integrateRk4(state, lengthM, advanceBy, maxDt) {
    var t = 0;
    var dt = maxDt;
    while (t + dt <= advanceBy + 1e-12) {
      var s = rk4Step(state.theta, state.omega, lengthM, dt);
      state.theta = s.theta;
      state.omega = s.omega;
      t += dt;
    }
    var rem = advanceBy - t;
    if (rem > 1e-14) {
      var s2 = rk4Step(state.theta, state.omega, lengthM, rem);
      state.theta = s2.theta;
      state.omega = s2.omega;
    }
  }

  /** 轨迹：RK4 解 θ̈=−(g/L)sinθ；周期 T 仍仅由 Ē 的解析/积分公式给出 */
  function stateAtTimeRk4(theta0, omega0, lengthM, tSec) {
    var state = { theta: theta0, omega: omega0 };
    if (tSec > 0) integrateRk4(state, lengthM, tSec, DT_ENERGY);
    return state;
  }

  /**
   * 将试次参数解析为播放阶段（可视/不可视交替）。
   * phaseFactors[i]：第 i 段时长 = x·T；偶数段可视，奇数段不可视。
   */
  function resolvePhaseFactors(raw) {
    if (raw.phaseFactors && raw.phaseFactors.length === 4) {
      return raw.phaseFactors.map(Number);
    }
    if (raw.phaseDivisors && raw.phaseDivisors.length === 4) {
      return raw.phaseDivisors.map(function (d) {
        return 1 / Number(d);
      });
    }
    return DEFAULT_PHASE_FACTORS.slice();
  }

  function resolvePhases(params) {
    var startAngleRad = Number(params.startAngleRad);
    var w0Rad = Number(params.initialAngularVelocityRadPerS);
    var Lm = Number(params.lengthM);
    var factors = params.phaseFactors;
    if (!Array.isArray(factors) || factors.length !== 4) {
      throw new Error('phaseFactors 须为 4 个正数（四段 x·T）');
    }
    var periodMs = estimatePeriodMs(startAngleRad, w0Rad, Lm);
    var phases = factors.map(function (x, i) {
      var f = Number(x);
      if (!isFinite(f) || f <= 0) throw new Error('阶段系数 x 须为正数');
      return {
        visible: i % 2 === 0,
        durationMs: periodMs * f,
        periodFactor: f,
      };
    });
    return { phases: phases, periodMs: periodMs };
  }

  function totalPhaseMs(phases) {
    var sum = 0;
    for (var i = 0; i < phases.length; i++) sum += phases[i].durationMs;
    return sum;
  }

  function phaseBoundaries(phases) {
    var bounds = [0];
    var acc = 0;
    for (var i = 0; i < phases.length; i++) {
      acc += phases[i].durationMs;
      bounds.push(acc);
    }
    return bounds;
  }

  function isVisibleAtTime(tMs, phases) {
    var acc = 0;
    for (var i = 0; i < phases.length; i++) {
      if (tMs < acc + phases[i].durationMs - 1e-6) return phases[i].visible;
      acc += phases[i].durationMs;
    }
    return phases.length ? phases[phases.length - 1].visible : true;
  }

  function buildTrajectory(startAngleRad, w0Rad, lengthM, phases) {
    var totalMs = totalPhaseMs(phases);
    var th0 = Number(startAngleRad) || 0;
    var om0 = Number(w0Rad) || 0;
    if (totalMs <= 0) {
      return [{ tMs: 0, theta: th0 }];
    }
    var totalSec = totalMs / 1000;
    var state = { theta: th0, omega: om0 };
    var dt = DT_ENERGY;
    var samples = [{ tMs: 0, theta: state.theta }];
    var tSec = 0;
    while (tSec < totalSec - 1e-14) {
      var step = Math.min(dt, totalSec - tSec);
      integrateRk4(state, lengthM, step, dt);
      tSec += step;
      samples.push({ tMs: Math.min(totalMs, tSec * 1000), theta: state.theta });
    }
    var last = samples[samples.length - 1];
    last.tMs = totalMs;
    last.theta = state.theta;
    return samples;
  }

  function migrateRawTrial(raw) {
    var t = Object.assign({}, raw);
    if (t.lengthM == null && t.lengthPx != null) {
      t.lengthM = Number(t.lengthPx) / PX_PER_M;
    }
    if (t.startAngleDeg == null && t.startAngleRad != null) {
      t.startAngleDeg = rad2deg(Number(t.startAngleRad));
    }
    if (t.initialAngularVelocityDegPerS == null && t.initialAngularVelocityRadPerS != null) {
      t.initialAngularVelocityDegPerS = rad2deg(Number(t.initialAngularVelocityRadPerS));
    }
    if (!t.phaseFactors || t.phaseFactors.length !== 4) {
      t.phaseFactors = resolvePhaseFactors(t);
    }
    delete t.phaseDivisors;
    return t;
  }

  function normalizeTextUnit(raw) {
    raw = migrateRawTrial(raw);
    var kind = raw.kind || raw.trialKind || 'text';
    if (kind !== 'text') throw new Error('文字单元类型须为 text');
    var displayText = raw.displayText != null ? String(raw.displayText) : '';
    if (!displayText.trim()) throw new Error('文字显示单元须提供 displayText');
    return { kind: 'text', displayText: displayText };
  }

  function normalizeTrial(raw) {
    raw = migrateRawTrial(raw);
    var kind = raw.kind || raw.trialKind || 'response';
    if (kind !== 'practice' && kind !== 'response') {
      throw new Error('试次类型须为 practice（练习）、response（正式）或 text（文字）');
    }
    var startAngleDeg = Number(raw.startAngleDeg);
    var initialAngularVelocityDegPerS = Number(raw.initialAngularVelocityDegPerS);
    if (!isFinite(startAngleDeg)) throw new Error('启动角度 (°) 无效');
    if (!isFinite(initialAngularVelocityDegPerS)) {
      throw new Error('初始角速度 (°/s) 无效');
    }
    var base = {
      kind: kind,
      startAngleDeg: startAngleDeg,
      initialAngularVelocityDegPerS: initialAngularVelocityDegPerS,
      startAngleRad: deg2rad(startAngleDeg),
      initialAngularVelocityRadPerS: deg2rad(initialAngularVelocityDegPerS),
      lengthM: Number(raw.lengthM),
    };
    if (!isFinite(base.lengthM) || base.lengthM <= 0) throw new Error('摆长 (m) 须为正数');
    if (!raw.phaseFactors || raw.phaseFactors.length !== 4) {
      throw new Error('须提供 4 个 phaseFactors（可视₁/不可视₁/可视₂/不可视₂ 的 x·T）');
    }
    base.phaseFactors = raw.phaseFactors.map(Number);
    return base;
  }

  function normalizeUnit(raw) {
    var kind = (raw && (raw.kind || raw.trialKind)) || 'response';
    if (kind === 'text') return normalizeTextUnit(raw);
    return normalizeTrial(raw);
  }

  function setExperimentCursor(mode) {
    var stage = document.getElementById('jspsych-target');
    if (!stage) return;
    stage.classList.remove('experiment-cursor-hidden', 'experiment-cursor-response');
    if (mode === 'hidden') stage.classList.add('experiment-cursor-hidden');
    else if (mode === 'response') stage.classList.add('experiment-cursor-response');
  }

  function thetaAtTime(samples, tMs) {
    var total = samples[samples.length - 1].tMs;
    tMs = clamp(tMs, 0, total);
    var lo = 0;
    var hi = samples.length - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (samples[mid].tMs <= tMs) lo = mid;
      else hi = mid;
    }
    var a = samples[lo];
    var b = samples[lo + 1];
    if (!b || b.tMs <= a.tMs) return a.theta;
    var u = (tMs - a.tMs) / (b.tMs - a.tMs);
    return a.theta + u * (b.theta - a.theta);
  }

  /** 指针位置 → 摆角 θ（竖直向下 0，右正；与 drawRodAndBob 一致） */
  function angleFromPointer(cx, cy, px, py) {
    var dx = px - cx;
    var dy = py - cy;
    return Math.atan2(dx, dy);
  }

  function bobXY(cx, cy, L, theta) {
    return { x: cx + L * Math.sin(theta), y: cy + L * Math.cos(theta) };
  }

  function drawFixationCross(ctx, cx, cy, armPx) {
    var size = armPx || 22;
    ctx.save();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy + size);
    ctx.stroke();
    ctx.restore();
  }

  /** 在轨迹圆上绘制确信范围扇形（与摆球同一 θ 坐标系） */
  function fillConfidenceWedge(ctx, cx, cy, rIn, rOut, thetaLow, thetaHigh) {
    var steps = Math.max(8, Math.ceil((Math.abs(thetaHigh - thetaLow) / (Math.PI / 36))));
    ctx.beginPath();
    var p0 = bobXY(cx, cy, rIn, thetaLow);
    ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i <= steps; i++) {
      var th = thetaLow + ((thetaHigh - thetaLow) * i) / steps;
      var p = bobXY(cx, cy, rIn, th);
      ctx.lineTo(p.x, p.y);
    }
    for (var j = steps; j >= 0; j--) {
      var th2 = thetaLow + ((thetaHigh - thetaLow) * j) / steps;
      var p2 = bobXY(cx, cy, rOut, th2);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 文字显示单元：注视点后于屏幕中央显示文字，按空格进入下一单元。
   * @param {HTMLElement} container
   * @param {object} params
   * @param {function(object): void} onComplete
   */
  function runTextUnit(container, params, onComplete) {
    params = normalizeTextUnit(params);
    var unitStartTs = performance.now();

    var wrap = document.createElement('div');
    wrap.className = 'pendulum-trial pendulum-text-unit';

    var hud = document.createElement('div');
    hud.className = 'pendulum-hud';

    var textStage = document.createElement('div');
    textStage.className = 'pendulum-text-stage';
    var textInner = document.createElement('div');
    textInner.className = 'pendulum-text-inner';
    textInner.textContent = params.displayText;
    textStage.appendChild(textInner);

    var fixationOverlay = document.createElement('div');
    fixationOverlay.className = 'pendulum-fixation-overlay';
    fixationOverlay.setAttribute('role', 'img');
    fixationOverlay.setAttribute('aria-label', '注视点');
    fixationOverlay.innerHTML =
      '<div class="pendulum-fixation-inner">' +
      '<span class="pendulum-fixation-plus">+</span>' +
      '<span class="pendulum-fixation-hint">注视点 · 点击或按空格继续</span>' +
      '</div>';

    wrap.appendChild(hud);
    wrap.appendChild(textStage);
    wrap.appendChild(fixationOverlay);
    container.appendChild(wrap);

    textStage.style.display = 'none';

    function setHudFixation() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请看屏幕中央的注视点（<strong>+</strong>）。</span>' +
        '<span class="pendulum-hud-sub">约 ' +
        Math.round(FIXATION_MS / 1000) +
        ' 秒后自动开始；也可<strong>点击画面</strong>或按<strong>空格</strong>提前继续。</span>';
    }

    function setHudText() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请阅读屏幕中央的文字。</span>' +
        '<span class="pendulum-hud-sub">阅读完毕后按<strong>空格键</strong>继续。</span>';
    }

    function showFixationOverlay(visible) {
      var stage = document.getElementById('jspsych-target');
      if (visible) {
        fixationOverlay.classList.add('is-active');
        fixationOverlay.style.display = 'flex';
        wrap.classList.add('is-fixating');
        if (stage) stage.classList.add('showing-fixation');
      } else {
        fixationOverlay.classList.remove('is-active');
        fixationOverlay.style.display = 'none';
        wrap.classList.remove('is-fixating');
        if (stage) stage.classList.remove('showing-fixation');
      }
    }

    var fixationEnded = false;
    var fixationReady = false;
    var fixationStartTs = performance.now();
    var fixationMs = 0;
    var fixationTimerId = null;
    var textShownTs = null;

    function startTextPhase() {
      setHudText();
      setExperimentCursor('hidden');
      textStage.style.display = 'flex';
      textShownTs = performance.now();
      window.addEventListener('keydown', onTextKey, true);
    }

    function endFixation() {
      if (fixationEnded || !fixationReady) return;
      fixationEnded = true;
      fixationMs = performance.now() - fixationStartTs;
      if (fixationTimerId != null) clearTimeout(fixationTimerId);
      window.removeEventListener('keydown', onFixationKey, true);
      fixationOverlay.removeEventListener('click', onFixationClick);
      textStage.removeEventListener('click', onFixationClick);
      showFixationOverlay(false);
      startTextPhase();
    }

    function onFixationKey(ev) {
      if (!fixationReady || fixationEnded) return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        endFixation();
      }
    }

    function onFixationClick(ev) {
      if (!fixationReady || fixationEnded) return;
      ev.preventDefault();
      ev.stopPropagation();
      endFixation();
    }

    function onTextKey(ev) {
      if (ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener('keydown', onTextKey, true);
      var textDisplayMs = textShownTs != null ? performance.now() - textShownTs : 0;
      container.removeChild(wrap);
      onComplete({
        trialKind: 'text',
        displayText: params.displayText,
        fixationMs: fixationMs,
        textDisplayMs: textDisplayMs,
        unitDurationMs: performance.now() - unitStartTs,
      });
    }

    setHudFixation();
    setExperimentCursor('hidden');
    showFixationOverlay(true);
    window.addEventListener('keydown', onFixationKey, true);
    fixationOverlay.addEventListener('click', onFixationClick);
    textStage.addEventListener('click', onFixationClick);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fixationReady = true;
        fixationStartTs = performance.now();
        fixationTimerId = setTimeout(endFixation, FIXATION_MS);
      });
    });
  }

  /**
   * @param {HTMLElement} container
   * @param {object} params
   * @param {function(object): void} onComplete
   */
  function runTrial(container, params, onComplete) {
    params = normalizeTrial(params);
    var trialKind = params.kind;
    var isPractice = trialKind === 'practice';
    var resolved = resolvePhases(params);
    var phases = resolved.phases;
    var periodMs = resolved.periodMs;
    var bounds = phaseBoundaries(phases);
    var totalMs = bounds[bounds.length - 1];

    var Lm = Number(params.lengthM);
    var L = lengthMToPx(Lm);
    var startAngleRad = Number(params.startAngleRad);
    var w0Rad = Number(params.initialAngularVelocityRadPerS);
    var energyBar = computeEnergyBar(startAngleRad, w0Rad, Lm);

    var samples = buildTrajectory(startAngleRad, w0Rad, Lm, phases);
    var finalTheta = thetaAtTime(samples, totalMs);
    var phaseEndThetasDeg = bounds.slice(1).map(function (tMs) {
      return thetaToUserDeg(thetaAtTime(samples, tMs));
    });

    var wrap = document.createElement('div');
    wrap.className = 'pendulum-trial';

    var hud = document.createElement('div');
    hud.className = 'pendulum-hud';

    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'pendulum-canvas-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'pendulum-canvas';
    var canvasSize = Math.max(720, Math.ceil(2 * L + 140));
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    var ctx = canvas.getContext('2d');

    var overlay = document.createElement('div');
    overlay.className = 'pendulum-occlusion-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var fixationOverlay = document.createElement('div');
    fixationOverlay.className = 'pendulum-fixation-overlay';
    fixationOverlay.setAttribute('role', 'img');
    fixationOverlay.setAttribute('aria-label', '注视点');
    fixationOverlay.innerHTML =
      '<div class="pendulum-fixation-inner">' +
      '<span class="pendulum-fixation-plus">+</span>' +
      '<span class="pendulum-fixation-hint">注视点 · 点击或按空格继续</span>' +
      '</div>';

    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(overlay);

    var exploreActions = document.createElement('div');
    exploreActions.className = 'pendulum-explore-actions';
    var playStatus = document.createElement('span');
    playStatus.className = 'pendulum-play-status';
    playStatus.textContent = '正在播放…';
    exploreActions.appendChild(playStatus);

    var responsePanel = document.createElement('div');
    responsePanel.className = 'pendulum-response-panel';
    responsePanel.style.display = 'none';

    var angleReadout = document.createElement('div');
    angleReadout.className = 'pendulum-angle-readout';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pendulum-confirm-btn';
    btn.textContent = '确认汇报';

    responsePanel.appendChild(angleReadout);
    responsePanel.appendChild(btn);

    var feedbackPanel = document.createElement('div');
    feedbackPanel.className = 'pendulum-feedback-panel';
    feedbackPanel.style.display = 'none';
    var feedbackReadout = document.createElement('div');
    feedbackReadout.className = 'pendulum-feedback-readout';
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'pendulum-confirm-btn';
    nextBtn.textContent = '确认范围';
    feedbackPanel.appendChild(feedbackReadout);
    feedbackPanel.appendChild(nextBtn);

    wrap.appendChild(hud);
    wrap.appendChild(canvasWrap);
    wrap.appendChild(exploreActions);
    wrap.appendChild(responsePanel);
    wrap.appendChild(feedbackPanel);
    wrap.appendChild(fixationOverlay);
    container.appendChild(wrap);

    // 支点放在画布中央，确保以 L 为半径的完整圆都可见
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var R_BOB = Math.max(10, Math.min(18, L * 0.06));

    var pivotDraw = function () {
      ctx.save();
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    var ROD_WIDTH = Math.max(7, Math.min(14, L * 0.04));

    function drawRodAndBob(theta, style) {
      style = style || {};
      var rodColor = style.rodColor || '#455a64';
      var bobColor = style.bobColor || '#c62828';
      var showBob = style.showBob !== false;
      var showRod = style.showRod !== false;
      var bob = bobXY(cx, cy, L, theta);
      ctx.save();
      if (showRod) {
        ctx.strokeStyle = rodColor;
        ctx.lineWidth = ROD_WIDTH;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bob.x, bob.y);
        ctx.stroke();
      }
      if (showBob) {
        ctx.fillStyle = bobColor;
        ctx.beginPath();
        ctx.arc(bob.x, bob.y, R_BOB, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    var drawFaintArc = function () {
      ctx.save();
      ctx.strokeStyle = 'rgba(55, 71, 79, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // 画完整圆周（供被试看到可能的全部 rotation 轨迹）
      ctx.arc(cx, cy, L, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    var currentTMs = 0;
    var trialStartTs = performance.now();
    var playbackStartTs = null;
    var rafId = null;

    function drawFrame(tMs) {
      var th = thetaAtTime(samples, tMs);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawFaintArc();
      pivotDraw();
      if (isVisibleAtTime(tMs, phases)) {
        drawRodAndBob(th);
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'block';
      }
    }

    function setHudPlaying() {
      if (isPractice) {
        hud.innerHTML =
          '<span class="pendulum-hud-main">练习试次：请观察单摆运动。</span>' +
          '<span class="pendulum-hud-sub">本试次仅呈现、无需作答。可视与不可视阶段将交替播放。</span>';
      } else {
        hud.innerHTML =
          '<span class="pendulum-hud-main">请观察单摆运动。</span>' +
          '<span class="pendulum-hud-sub">不可视阶段摆球会被遮挡。全部阶段播放结束后请汇报试次结束时刻的摆球位置。</span>';
      }
    }

    function setHudResponse() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请汇报<strong>试次结束时刻</strong>摆球应在的角度。</span>' +
        '<span class="pendulum-hud-sub">先在圆轨迹上<strong>点击</strong>放置摆球，可拖动调整，再点击「确认汇报」。</span>';
    }

    function setHudFeedback() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请汇报您对该点位的<strong>确信范围</strong>。</span>' +
        '<span class="pendulum-hud-sub">拖动画布以在蓝色点两侧开合扭弧（越宽 = 越不确定）。完成后点击“确认范围”。</span>';
    }

    function setHudFixation() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请看屏幕中央的注视点（<strong>+</strong>）。</span>' +
        '<span class="pendulum-hud-sub">约 ' +
        Math.round(FIXATION_MS / 1000) +
        ' 秒后自动开始；也可<strong>点击画面</strong>或按<strong>空格</strong>提前继续。</span>';
    }

    function drawFixationFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawFixationCross(ctx, cx, cy, Math.max(22, canvasSize * 0.028));
    }

    function showFixationOverlay(visible) {
      var stage = document.getElementById('jspsych-target');
      if (visible) {
        fixationOverlay.classList.add('is-active');
        fixationOverlay.style.display = 'flex';
        wrap.classList.add('is-fixating');
        if (stage) stage.classList.add('showing-fixation');
      } else {
        fixationOverlay.classList.remove('is-active');
        fixationOverlay.style.display = 'none';
        wrap.classList.remove('is-fixating');
        if (stage) stage.classList.remove('showing-fixation');
      }
    }

    function tick(ts) {
      if (playbackStartTs == null) playbackStartTs = ts;
      var t = ts - playbackStartTs;
      if (t >= totalMs) {
        currentTMs = totalMs;
        drawFrame(totalMs);
        rafId = null;
        onPlaybackEnd();
        return;
      }
      currentTMs = t;
      drawFrame(t);
      rafId = requestAnimationFrame(tick);
    }

    function startPlayback() {
      setHudPlaying();
      exploreActions.style.display = '';
      playStatus.textContent = '正在播放…';
      drawFrame(0);
      playbackStartTs = null;
      rafId = requestAnimationFrame(tick);
    }

    var fixationEnded = false;
    var fixationReady = false;
    var fixationStartTs = performance.now();
    var fixationMs = 0;
    var fixationTimerId = null;

    function endFixation() {
      if (fixationEnded || !fixationReady) return;
      fixationEnded = true;
      fixationMs = performance.now() - fixationStartTs;
      if (fixationTimerId != null) clearTimeout(fixationTimerId);
      window.removeEventListener('keydown', onFixationKey, true);
      fixationOverlay.removeEventListener('click', onFixationClick);
      canvas.removeEventListener('click', onFixationClick);
      showFixationOverlay(false);
      overlay.style.display = 'none';
      startPlayback();
    }

    function onFixationKey(ev) {
      if (!fixationReady || fixationEnded) return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        endFixation();
      }
    }

    function onFixationClick(ev) {
      if (!fixationReady || fixationEnded) return;
      ev.preventDefault();
      ev.stopPropagation();
      endFixation();
    }

    function startFixationPhase() {
      setHudFixation();
      setExperimentCursor('hidden');
      exploreActions.style.display = 'none';
      overlay.style.display = 'none';
      drawFixationFrame();
      showFixationOverlay(true);
      window.addEventListener('keydown', onFixationKey, true);
      fixationOverlay.addEventListener('click', onFixationClick);
      canvas.addEventListener('click', onFixationClick);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fixationReady = true;
          fixationStartTs = performance.now();
          fixationTimerId = setTimeout(endFixation, FIXATION_MS);
        });
      });
    }

    startFixationPhase();

    function buildBaseData() {
      var out = {
        trialKind: trialKind,
        energyBar: energyBar,
        startAngleDeg: Number(params.startAngleDeg),
        initialAngularVelocityDegPerS: Number(params.initialAngularVelocityDegPerS),
        startAngleRad: startAngleRad,
        initialAngularVelocityRadPerS: w0Rad,
        lengthM: Lm,
        lengthPx: L,
        periodMs: periodMs,
        phaseFactors: phases.map(function (p) {
          return p.periodFactor;
        }),
        phaseDurationsMs: phases.map(function (p) {
          return p.durationMs;
        }),
        phaseVisible: phases.map(function (p) {
          return p.visible;
        }),
        phaseEndThetaDeg: phaseEndThetasDeg,
        totalPlaybackMs: totalMs,
        trueAngleAtEndDeg: thetaToUserDeg(finalTheta),
        fixationMs: fixationMs,
      };
      return out;
    }

    function onPlaybackEnd() {
      exploreActions.style.display = 'none';

      if (isPractice) {
        var practiceData = buildBaseData();
        practiceData.playbackMs = performance.now() - trialStartTs;
        container.removeChild(wrap);
        onComplete(practiceData);
        return;
      }

      responsePanel.style.display = 'flex';
      setExperimentCursor('response');
      var responseStart = performance.now();
      var playbackMs = responseStart - trialStartTs;

      var reportedTheta = null;
      var hasPlacedMarker = false;
      overlay.style.display = 'none';
      setHudResponse();
      btn.disabled = true;

      function drawResponseFrame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFaintArc();
        pivotDraw();
        if (hasPlacedMarker && reportedTheta != null) {
          drawRodAndBob(reportedTheta, {
            rodColor: '#1565c0',
            bobColor: '#1565c0',
          });
          angleReadout.textContent =
            '汇报角度：' +
            thetaToUserDeg(reportedTheta).toFixed(1) +
            '°（竖直向下为 0°，右正左负）';
        } else {
          angleReadout.textContent = '请在圆轨迹上点击以放置摆球';
        }
      }

      drawResponseFrame();

      function pointerToCanvas(ev) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var clientX = ev.clientX != null ? ev.clientX : ev.touches[0].clientX;
        var clientY = ev.clientY != null ? ev.clientY : ev.touches[0].clientY;
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY,
        };
      }

      var dragging = false;
      function placeFromPointer(ev) {
        var p = pointerToCanvas(ev);
        var dx = p.x - cx;
        var dy = p.y - cy;
        if (Math.hypot(dx, dy) < 8) return;
        reportedTheta = Math.atan2(dx, dy);
        hasPlacedMarker = true;
        btn.disabled = false;
        drawResponseFrame();
      }
      function onDown(ev) {
        ev.preventDefault();
        dragging = true;
        placeFromPointer(ev);
      }
      function onUp(ev) {
        ev.preventDefault();
        dragging = false;
      }
      function onMove(ev) {
        if (!dragging || !hasPlacedMarker) return;
        ev.preventDefault();
        placeFromPointer(ev);
      }

      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('mouseup', onUp);
      canvas.addEventListener('mouseleave', onUp);
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('touchstart', onDown, { passive: false });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchmove', onMove, { passive: false });

      function cleanupListeners() {
        canvas.removeEventListener('mousedown', onDown);
        canvas.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('mouseleave', onUp);
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchmove', onMove);
      }

      btn.onclick = function () {
        if (!hasPlacedMarker || reportedTheta == null) return;
        cleanupListeners();
        var rt = performance.now() - responseStart;
        function wrapAngle(a) {
          var x = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          return x;
        }
        var trueWrapped = wrapAngle(finalTheta);
        var rawDiff = wrapAngle(reportedTheta - trueWrapped);
        var errDeg = thetaToUserDeg(rawDiff);

        // 进入“确信范围”阶段：被试拖动表达对点估计的不确定性
        responsePanel.style.display = 'none';
        feedbackPanel.style.display = 'flex';
        setHudFeedback();

        var halfWidth = deg2rad(5); // 初始±5°
        var confidenceStart = performance.now();
        var draggingConf = false;

        function drawConfidenceFrame() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawFaintArc();
          pivotDraw();

          var bandHalf = Math.max(8, R_BOB * 0.6);
          var rIn = L - bandHalf;
          var rOut = L + bandHalf;
          var thetaLow = reportedTheta - halfWidth;
          var thetaHigh = reportedTheta + halfWidth;

          ctx.save();
          ctx.fillStyle = 'rgba(21, 101, 192, 0.20)';
          fillConfidenceWedge(ctx, cx, cy, rIn, rOut, thetaLow, thetaHigh);
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = 'rgba(21, 101, 192, 0.55)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.5;
          [thetaLow, thetaHigh].forEach(function (th) {
            var inner = bobXY(cx, cy, rIn, th);
            var outer = bobXY(cx, cy, rOut, th);
            ctx.beginPath();
            ctx.moveTo(inner.x, inner.y);
            ctx.lineTo(outer.x, outer.y);
            ctx.stroke();
          });
          ctx.restore();

          drawRodAndBob(reportedTheta, {
            rodColor: '#1565c0',
            bobColor: '#1565c0',
          });

          var halfDeg = rad2deg(halfWidth);
          var lowDeg = thetaToUserDeg(thetaLow);
          var highDeg = thetaToUserDeg(thetaHigh);
          feedbackReadout.innerHTML =
            '<span class="fb-rep">中心：' + thetaToUserDeg(reportedTheta).toFixed(1) + '°</span>' +
            '　<span class="fb-half">±' + halfDeg.toFixed(1) + '°</span>' +
            '　<span class="fb-range">[' + lowDeg.toFixed(1) + '°, ' + highDeg.toFixed(1) + '°]</span>';
        }

        function updateHalfWidthFromPointer(ev) {
          var p = pointerToCanvas(ev);
          var dx = p.x - cx;
          var dy = p.y - cy;
          if (Math.hypot(dx, dy) < 8) return;
          var pointerTheta = Math.atan2(dx, dy);
          var d = pointerTheta - reportedTheta;
          d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          halfWidth = Math.min(Math.PI, Math.max(deg2rad(0.5), Math.abs(d)));
          drawConfidenceFrame();
        }

        function onConfDown(ev) {
          ev.preventDefault();
          draggingConf = true;
          updateHalfWidthFromPointer(ev);
        }
        function onConfUp(ev) {
          ev.preventDefault();
          draggingConf = false;
        }
        function onConfMove(ev) {
          if (!draggingConf) return;
          ev.preventDefault();
          updateHalfWidthFromPointer(ev);
        }
        canvas.addEventListener('mousedown', onConfDown);
        canvas.addEventListener('mouseup', onConfUp);
        canvas.addEventListener('mouseleave', onConfUp);
        canvas.addEventListener('mousemove', onConfMove);
        canvas.addEventListener('touchstart', onConfDown, { passive: false });
        canvas.addEventListener('touchend', onConfUp);
        canvas.addEventListener('touchmove', onConfMove, { passive: false });

        function cleanupConfListeners() {
          canvas.removeEventListener('mousedown', onConfDown);
          canvas.removeEventListener('mouseup', onConfUp);
          canvas.removeEventListener('mouseleave', onConfUp);
          canvas.removeEventListener('mousemove', onConfMove);
          canvas.removeEventListener('touchstart', onConfDown);
          canvas.removeEventListener('touchend', onConfUp);
          canvas.removeEventListener('touchmove', onConfMove);
        }

        drawConfidenceFrame();

        nextBtn.onclick = function () {
          cleanupConfListeners();
          var confidenceMs = performance.now() - confidenceStart;
          var halfWidthDeg = rad2deg(halfWidth);
          var lowerDeg = thetaToUserDeg(reportedTheta - halfWidth);
          var upperDeg = thetaToUserDeg(reportedTheta + halfWidth);
          // 检验误差是否在报告范围内（以包裹后的误差判断）
          var hitRange = Math.abs(rawDiff) <= halfWidth + 1e-9;
          var data = Object.assign(buildBaseData(), {
            trueAngleWrappedDeg: thetaToUserDeg(trueWrapped),
            trueAngleAtReportCueDeg: thetaToUserDeg(finalTheta),
            reportedAngleDeg: thetaToUserDeg(reportedTheta),
            angularErrorDeg: errDeg,
            absAngularErrorDeg: Math.abs(errDeg),
            confidenceHalfWidthDeg: halfWidthDeg,
            confidenceLowerDeg: lowerDeg,
            confidenceUpperDeg: upperDeg,
            trueWithinConfidence: hitRange,
            playbackPhaseMs: playbackMs,
            responseRtMs: rt,
            confidenceRtMs: confidenceMs,
          });
          container.removeChild(wrap);
          onComplete(data);
        };
      };
    }
  }

  global.PendulumLab = {
    runTrial: runTrial,
    runTextUnit: runTextUnit,
    runUnit: function (container, params, onComplete) {
      params = migrateRawTrial(params);
      var kind = params.kind || params.trialKind || 'response';
      if (kind === 'text') return runTextUnit(container, params, onComplete);
      return runTrial(container, params, onComplete);
    },
    deg2rad: deg2rad,
    rad2deg: rad2deg,
    thetaToUserDeg: thetaToUserDeg,
    lengthMToPx: lengthMToPx,
    estimatePeriodMs: estimatePeriodMs,
    resolvePhases: resolvePhases,
    normalizeTrial: normalizeTrial,
    normalizeTextUnit: normalizeTextUnit,
    normalizeUnit: normalizeUnit,
    migrateRawTrial: migrateRawTrial,
    resolvePhaseFactors: resolvePhaseFactors,
    DEFAULT_PHASE_FACTORS: DEFAULT_PHASE_FACTORS,
    FIXATION_MS: FIXATION_MS,
    setExperimentCursor: setExperimentCursor,
    deriveInitialFromEnergy: deriveInitialFromEnergy,
    computeEnergyBar: computeEnergyBar,
    G_MPS2: G_MPS2,
    PX_PER_M: PX_PER_M,
    DT_ENERGY: DT_ENERGY,
    omegaMagnitudeFromEnergy: omegaMagnitudeFromEnergy,
    periodLibrationFromEnergy: periodLibrationFromEnergy,
    periodRotationFromEnergy: periodRotationFromEnergy,
    integrateTimeOverTheta: integrateTimeOverTheta,
    stateAtTimeRk4: stateAtTimeRk4,
    completeEllipticK: completeEllipticK,
    ENERGY_LEVELS: ENERGY_LEVELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
