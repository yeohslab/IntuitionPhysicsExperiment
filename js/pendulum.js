/**
 * 单摆模拟：预计算轨迹 → 自动播放时间轴（可视/不可视对应显示）→ 汇报时间末端摆角。
 * 约定：竖直向下为 0°，向右为正，向左为负。
 * 系统能量：E\u0304 = E/(mgL) = ω²L/(2g) + (1 − cosθ)
 *   低能：E\u0304 = 0.4（小幅 libration）
 *   中能：E\u0304 = 1.4（大幅 libration）
 *   高能：E\u0304 = 2.5（rotation，越过 separatrix E\u0304 = 2）
 */
(function (global) {
  'use strict';

  var G_EFF_PX = 2000;

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
  function deriveInitialFromEnergy(level, lengthPx) {
    if (!Object.prototype.hasOwnProperty.call(ENERGY_LEVELS, level)) return null;
    var Ebar = ENERGY_LEVELS[level];
    var L = Number(lengthPx);
    if (!isFinite(L) || L <= 0) return null;
    if (Ebar < 2) {
      var theta0 = Math.acos(1 - Ebar);
      return {
        startAngleDeg: rad2deg(theta0),
        initialAngularVelocityDegPerS: 0,
        energyBar: Ebar,
      };
    }
    var omega = Math.sqrt((2 * G_EFF_PX * Ebar) / L);
    return {
      startAngleDeg: 0,
      initialAngularVelocityDegPerS: rad2deg(omega),
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

  function computeEnergyBar(thetaDeg, omegaDegPerS, lengthPx) {
    var L = Number(lengthPx);
    if (!isFinite(L) || L <= 0) return NaN;
    var th = deg2rad(Number(thetaDeg) || 0);
    var om = deg2rad(Number(omegaDegPerS) || 0);
    return (om * om * L) / (2 * G_EFF_PX) + (1 - Math.cos(th));
  }

  function rk4Step(theta, omega, L, dt) {
    function f(th, om) {
      return {
        dth: om,
        dom: (-G_EFF_PX / L) * Math.sin(th),
      };
    }

    var k1 = f(theta, omega);
    var k2 = f(theta + 0.5 * dt * k1.dth, omega + 0.5 * dt * k1.dom);
    var k3 = f(theta + 0.5 * dt * k2.dth, omega + 0.5 * dt * k2.dom);
    var k4 = f(theta + dt * k3.dth, omega + dt * k3.dom);

    var dth = (dt / 6) * (k1.dth + 2 * k2.dth + 2 * k3.dth + k4.dth);
    var dom = (dt / 6) * (k1.dom + 2 * k2.dom + 2 * k3.dom + k4.dom);
    return { theta: theta + dth, omega: omega + dom };
  }

  function integrate(state, L, advanceBy, maxDt) {
    var t = 0;
    var dt = maxDt;
    while (t + dt <= advanceBy + 1e-9) {
      var s = rk4Step(state.theta, state.omega, L, dt);
      state.theta = s.theta;
      state.omega = s.omega;
      t += dt;
    }
    var rem = advanceBy - t;
    if (rem > 1e-8) {
      var s2 = rk4Step(state.theta, state.omega, L, rem);
      state.theta = s2.theta;
      state.omega = s2.omega;
    }
  }

  function buildTrajectory(startAngleDeg, w0Deg, L, visibleMs, invisibleMs) {
    var SIM_DT = 1 / 240;
    var totalMs = visibleMs + invisibleMs;
    if (totalMs <= 0) {
      return [{ tMs: 0, theta: deg2rad(startAngleDeg) }];
    }
    var totalSec = totalMs / 1000;
    var state = {
      theta: deg2rad(startAngleDeg),
      omega: deg2rad(w0Deg),
    };
    var samples = [{ tMs: 0, theta: state.theta }];
    var tSec = 0;
    while (tSec < totalSec - 1e-12) {
      var step = Math.min(SIM_DT, totalSec - tSec);
      integrate(state, L, step, SIM_DT);
      tSec += step;
      samples.push({ tMs: Math.min(totalMs, tSec * 1000), theta: state.theta });
    }
    var last = samples[samples.length - 1];
    if (last.tMs < totalMs - 0.05) {
      integrate(state, L, (totalMs - last.tMs) / 1000, SIM_DT);
      samples.push({ tMs: totalMs, theta: state.theta });
    } else {
      last.tMs = totalMs;
      last.theta = state.theta;
    }
    return samples;
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

  function angleFromPointer(cx, cy, px, py) {
    var dx = px - cx;
    var dy = py - cy;
    return Math.atan2(dx, dy);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} params
   * @param {function(object): void} onComplete
   */
  function runTrial(container, params, onComplete) {
    var L = Number(params.lengthPx);
    var visibleMs = Number(params.visibleMs);
    var invisibleMs = Number(params.invisibleMs);
    var totalMs = visibleMs + invisibleMs;

    var startAngleDeg = Number(params.startAngleDeg);
    var w0Deg = Number(params.initialAngularVelocityDegPerS);
    var energyBar = computeEnergyBar(startAngleDeg, w0Deg, L);

    var samples = buildTrajectory(startAngleDeg, w0Deg, L, visibleMs, invisibleMs);
    var thetaVisibleEnd = thetaAtTime(samples, visibleMs);
    var thetaInvisibleEnd = thetaAtTime(samples, totalMs);
    var finalTheta = thetaInvisibleEnd;

    var wrap = document.createElement('div');
    wrap.className = 'pendulum-trial';

    var hud = document.createElement('div');
    hud.className = 'pendulum-hud';

    var timelineEl = document.createElement('div');
    timelineEl.className = 'pendulum-timeline';
    timelineEl.innerHTML =
      '<div class="pendulum-timeline-head">' +
      '<span class="pendulum-timeline-title">试次时间轴（自动播放）</span>' +
      '<span class="pendulum-timeline-phase" aria-live="polite"></span>' +
      '</div>' +
      '<div class="pendulum-timer-grid" aria-label="试次播放计时器">' +
      '<div class="pendulum-timer-card">' +
      '<span class="pendulum-timer-label">已播放</span>' +
      '<span class="pendulum-timer-value pendulum-timer-elapsed">00:00.000</span>' +
      '</div>' +
      '</div>' +
      '<div class="pendulum-timeline-readout">' +
      '<span class="pendulum-timeline-total"></span>' +
      '<span class="pendulum-timeline-divider" aria-hidden="true">/</span>' +
      '<span class="pendulum-timeline-note">前段可视，后段不可视</span>' +
      '</div>';

    var phaseReadout = timelineEl.querySelector('.pendulum-timeline-phase');
    var readout = timelineEl.querySelector('.pendulum-timeline-readout');
    var elapsedReadout = timelineEl.querySelector('.pendulum-timer-elapsed');
    var totalReadout = timelineEl.querySelector('.pendulum-timeline-total');

    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'pendulum-canvas-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'pendulum-canvas';
    // 方形画布，足以容纳以摆长 L 为半径的完整圆周（边距起码 32 px）
    var canvasSize = Math.max(560, Math.ceil(2 * L + 80));
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    var ctx = canvas.getContext('2d');

    var overlay = document.createElement('div');
    overlay.className = 'pendulum-occlusion-overlay';
    overlay.setAttribute('aria-hidden', 'true');

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
    wrap.appendChild(timelineEl);
    wrap.appendChild(canvasWrap);
    wrap.appendChild(exploreActions);
    wrap.appendChild(responsePanel);
    wrap.appendChild(feedbackPanel);
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

    var drawBobAndRod = function (theta) {
      var bx = cx + L * Math.sin(theta);
      var by = cy + L * Math.cos(theta);
      ctx.save();
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.arc(bx, by, R_BOB, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

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

    function phaseLabel(tMs) {
      if (tMs < visibleMs - 1e-6) return '可视';
      return '不可视';
    }

    function formatTimer(ms) {
      var safeMs = Math.max(0, Math.round(ms));
      var minutes = Math.floor(safeMs / 60000);
      var seconds = Math.floor((safeMs % 60000) / 1000);
      var millis = safeMs % 1000;
      return (
        String(minutes).padStart(2, '0') +
        ':' +
        String(seconds).padStart(2, '0') +
        '.' +
        String(millis).padStart(3, '0')
      );
    }

    function drawFrame(tMs) {
      var th = thetaAtTime(samples, tMs);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawFaintArc();
      pivotDraw();
      var vis = tMs < visibleMs - 1e-6;
      if (vis) {
        drawBobAndRod(th);
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'block';
      }
      phaseReadout.textContent = phaseLabel(tMs) + '阶段';
      elapsedReadout.textContent = formatTimer(tMs);
      totalReadout.textContent = '总时长 ' + formatTimer(totalMs);
      readout.setAttribute(
        'aria-label',
        '当前为' + phaseLabel(tMs) + '阶段，已播放' + Math.round(tMs) + '毫秒，总时长' + Math.round(totalMs) + '毫秒'
      );
    }

    function setHudPlaying() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请观察单摆运动，时间轴会自动播放。</span>' +
        '<span class="pendulum-hud-sub">不可视阶段摆球会被遮挡。播放结束后请汇报试次结束时刻的摆球位置。</span>';
    }

    function setHudResponse() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请汇报<strong>试次结束时刻</strong>摆球应在的角度。</span>' +
        '<span class="pendulum-hud-sub">拖动画布上的蓝色摆球（默认在最低点），完成后点击确认。</span>';
    }

    function setHudFeedback() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请汇报您对该点位的<strong>确信范围</strong>。</span>' +
        '<span class="pendulum-hud-sub">拖动画布以在蓝色点两侧开合扭弧（越宽 = 越不确定）。完成后点击“确认范围”。</span>';
    }

    setHudPlaying();
    drawFrame(0);

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
    rafId = requestAnimationFrame(tick);

    function onPlaybackEnd() {
      timelineEl.classList.add('finished');
      exploreActions.style.display = 'none';

      responsePanel.style.display = 'flex';
      var responseStart = performance.now();
      var playbackMs = responseStart - trialStartTs;

      // 默认从最低点（0°）开始，避免泄露真实答案
      var reportedTheta = 0;
      overlay.style.display = 'none';
      setHudResponse();

      function drawResponseFrame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFaintArc();
        pivotDraw();
        var bx = cx + L * Math.sin(reportedTheta);
        var by = cy + L * Math.cos(reportedTheta);
        // 拖动中的摆球（蓝色）与连接的虚线
        ctx.save();
        ctx.strokeStyle = 'rgba(21, 101, 192, 0.45)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#1565c0';
        ctx.beginPath();
        ctx.arc(bx, by, R_BOB, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        angleReadout.textContent =
          '汇报角度：' +
          rad2deg(reportedTheta).toFixed(1) +
          '°（竖直向下为 0°，右正左负）';
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
      function onDown(ev) {
        ev.preventDefault();
        dragging = true;
      }
      function onUp(ev) {
        ev.preventDefault();
        dragging = false;
      }
      function onMove(ev) {
        if (!dragging) return;
        ev.preventDefault();
        var p = pointerToCanvas(ev);
        // 全 360° 范围：不再 clamp，使用 [-π, π]
        reportedTheta = angleFromPointer(cx, cy, p.x, p.y);
        drawResponseFrame();
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
        cleanupListeners();
        var rt = performance.now() - responseStart;
        function wrapAngle(a) {
          var x = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          return x;
        }
        var trueWrapped = wrapAngle(finalTheta);
        var rawDiff = wrapAngle(reportedTheta - trueWrapped);
        var errDeg = rad2deg(rawDiff);

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

          // 范围弧带：以摆长 L 为中心半径，画定宽环带
          var bandHalf = Math.max(8, R_BOB * 0.6);
          var rIn = L - bandHalf;
          var rOut = L + bandHalf;
          function canvasAngleFromTheta(theta) {
            return Math.atan2(Math.cos(theta), Math.sin(theta));
          }
          var thetaLow = reportedTheta - halfWidth;
          var thetaHigh = reportedTheta + halfWidth;
          var aLow = canvasAngleFromTheta(thetaLow);
          var aHigh = canvasAngleFromTheta(thetaHigh);
          // 填充从 aLow 顺时针到 aHigh（调整方向使侍后与范围匹配）
          ctx.save();
          ctx.fillStyle = 'rgba(21, 101, 192, 0.20)';
          ctx.beginPath();
          ctx.arc(cx, cy, rOut, aLow, aHigh, true);
          ctx.arc(cx, cy, rIn, aHigh, aLow, false);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // 范围边界线（两根径向虚线）
          ctx.save();
          ctx.strokeStyle = 'rgba(21, 101, 192, 0.55)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.5;
          [thetaLow, thetaHigh].forEach(function (th) {
            var bx = cx + rOut * Math.sin(th);
            var by = cy + rOut * Math.cos(th);
            var ix = cx + rIn * Math.sin(th);
            var iy = cy + rIn * Math.cos(th);
            ctx.beginPath();
            ctx.moveTo(ix, iy);
            ctx.lineTo(bx, by);
            ctx.stroke();
          });
          ctx.restore();

          // 已确认的点估计（蓝色摆球与实线摆结）
          var bx = cx + L * Math.sin(reportedTheta);
          var by = cy + L * Math.cos(reportedTheta);
          ctx.save();
          ctx.strokeStyle = 'rgba(21, 101, 192, 0.85)';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.fillStyle = '#1565c0';
          ctx.beginPath();
          ctx.arc(bx, by, R_BOB, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          var halfDeg = rad2deg(halfWidth);
          var lowDeg = rad2deg(thetaLow);
          var highDeg = rad2deg(thetaHigh);
          feedbackReadout.innerHTML =
            '<span class="fb-rep">中心：' + rad2deg(reportedTheta).toFixed(1) + '°</span>' +
            '　<span class="fb-half">±' + halfDeg.toFixed(1) + '°</span>' +
            '　<span class="fb-range">[' + lowDeg.toFixed(1) + '°, ' + highDeg.toFixed(1) + '°]</span>';
        }

        function updateHalfWidthFromPointer(ev) {
          var p = pointerToCanvas(ev);
          var pointerTheta = angleFromPointer(cx, cy, p.x, p.y);
          var d = pointerTheta - reportedTheta;
          // 包裹到 (-π, π]
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
          var lowerDeg = rad2deg(reportedTheta - halfWidth);
          var upperDeg = rad2deg(reportedTheta + halfWidth);
          // 检验误差是否在报告范围内（以包裹后的误差判断）
          var hitRange = Math.abs(rawDiff) <= halfWidth + 1e-9;
          var data = {
            energyBar: energyBar,
            startAngleDeg: startAngleDeg,
            initialAngularVelocityDegPerS: w0Deg,
            lengthPx: L,
            visibleMs: visibleMs,
            invisibleMs: invisibleMs,
            thetaVisibleEndDeg: rad2deg(thetaVisibleEnd),
            thetaInvisibleEndDeg: rad2deg(thetaInvisibleEnd),
            trueAngleAtTimelineEndDeg: rad2deg(finalTheta),
            trueAngleWrappedDeg: rad2deg(trueWrapped),
            trueAngleAtReportCueDeg: rad2deg(finalTheta),
            reportedAngleDeg: rad2deg(reportedTheta),
            angularErrorDeg: errDeg,
            absAngularErrorDeg: Math.abs(errDeg),
            confidenceHalfWidthDeg: halfWidthDeg,
            confidenceLowerDeg: lowerDeg,
            confidenceUpperDeg: upperDeg,
            trueWithinConfidence: hitRange,
            playbackPhaseMs: playbackMs,
            responseRtMs: rt,
            confidenceRtMs: confidenceMs,
          };
          container.removeChild(wrap);
          onComplete(data);
        };
      };
    }
  }

  global.PendulumLab = {
    runTrial: runTrial,
    deg2rad: deg2rad,
    rad2deg: rad2deg,
    deriveInitialFromEnergy: deriveInitialFromEnergy,
    computeEnergyBar: computeEnergyBar,
    ENERGY_LEVELS: ENERGY_LEVELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
