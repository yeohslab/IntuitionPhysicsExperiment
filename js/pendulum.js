/**
 * 单摆模拟：预计算轨迹 → 拖动时间轴预览（可视/不可视对应显示）→ 汇报时间末端摆角。
 * 约定：竖直向下为 0°，向右为正，向左为负。
 */
(function (global) {
  'use strict';

  var G_EFF_PX = 2000;

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function deg2rad(d) {
    return (d * Math.PI) / 180;
  }

  function rad2deg(r) {
    return (r * 180) / Math.PI;
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
    var startAngleDeg = Number(params.startAngleDeg);
    var w0Deg = Number(params.initialAngularVelocityDegPerS);
    var L = Number(params.lengthPx);
    var visibleMs = Number(params.visibleMs);
    var invisibleMs = Number(params.invisibleMs);
    var totalMs = visibleMs + invisibleMs;

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
      '<span class="pendulum-timeline-title">试次时间轴</span>' +
      '<span class="pendulum-timeline-readout" aria-live="polite"></span>' +
      '</div>' +
      '<div class="pendulum-timeline-track-wrap">' +
      '<div class="pendulum-timeline-track" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="' +
      Math.round(totalMs) +
      '" aria-label="拖动查看不同时刻">' +
      '<div class="pendulum-timeline-segments">' +
      '<div class="pendulum-timeline-seg pendulum-timeline-visible"></div>' +
      '<div class="pendulum-timeline-seg pendulum-timeline-invisible"></div>' +
      '</div>' +
      '<div class="pendulum-timeline-thumb" aria-hidden="true"></div>' +
      '</div>' +
      '</div>' +
      '<div class="pendulum-timeline-legend">' +
      '<span class="pendulum-legend-vis"><i></i>可视阶段</span>' +
      '<span class="pendulum-legend-inv"><i></i>不可视阶段</span>' +
      '</div>';

    var segVis = timelineEl.querySelector('.pendulum-timeline-visible');
    var segInv = timelineEl.querySelector('.pendulum-timeline-invisible');
    var track = timelineEl.querySelector('.pendulum-timeline-track');
    var thumb = timelineEl.querySelector('.pendulum-timeline-thumb');
    var readout = timelineEl.querySelector('.pendulum-timeline-readout');

    segVis.style.flexGrow = visibleMs;
    segVis.style.flexShrink = 1;
    segVis.style.flexBasis = '0';
    segInv.style.flexGrow = invisibleMs;
    segInv.style.flexShrink = 1;
    segInv.style.flexBasis = '0';

    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'pendulum-canvas-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'pendulum-canvas';
    canvas.width = 560;
    canvas.height = 420;
    var ctx = canvas.getContext('2d');

    var overlay = document.createElement('div');
    overlay.className = 'pendulum-occlusion-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(overlay);

    var exploreActions = document.createElement('div');
    exploreActions.className = 'pendulum-explore-actions';
    var btnToReport = document.createElement('button');
    btnToReport.type = 'button';
    btnToReport.className = 'pendulum-next-btn primary';
    btnToReport.textContent = '汇报试次结束时刻的摆球位置';
    exploreActions.appendChild(btnToReport);

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

    wrap.appendChild(hud);
    wrap.appendChild(timelineEl);
    wrap.appendChild(canvasWrap);
    wrap.appendChild(exploreActions);
    wrap.appendChild(responsePanel);
    container.appendChild(wrap);

    var cx = canvas.width / 2;
    var cy = 56;
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
      ctx.arc(cx, cy, L, -Math.PI * 0.98, Math.PI * 0.98);
      ctx.stroke();
      ctx.restore();
    };

    var currentTMs = 0;
    var draggingTimeline = false;
    var phaseExploreStart = performance.now();

    function phaseLabel(tMs) {
      if (tMs < visibleMs - 1e-6) return '可视';
      return '不可视';
    }

    function drawExplorationFrame(tMs) {
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
      var pct = totalMs > 0 ? (tMs / totalMs) * 100 : 0;
      thumb.style.left = pct + '%';
      track.setAttribute('aria-valuenow', String(Math.round(tMs)));
      readout.textContent =
        phaseLabel(tMs) +
        ' · ' +
        tMs.toFixed(0) +
        ' ms / ' +
        totalMs.toFixed(0) +
        ' ms';
    }

    function setHudExplore() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">拖动下方时间轴，预览任意时刻的单摆状态。</span>' +
        '<span class="pendulum-hud-sub">右端为试次结束时刻（不可视阶段终点）。</span>';
    }

    function setHudResponse() {
      hud.innerHTML =
        '<span class="pendulum-hud-main">请汇报<strong>时间轴最右端</strong>（试次结束）时摆球应在的角度。</span>' +
        '<span class="pendulum-hud-sub">拖动蓝色摆球，完成后点击确认。</span>';
    }

    function updateTimelineFromClientX(clientX) {
      var rect = track.getBoundingClientRect();
      var x = clamp(clientX - rect.left, 0, rect.width);
      currentTMs = rect.width > 0 ? (x / rect.width) * totalMs : 0;
      drawExplorationFrame(currentTMs);
    }

    function onTrackPointerDown(ev) {
      ev.preventDefault();
      draggingTimeline = true;
      track.setPointerCapture(ev.pointerId);
      var cxp = ev.clientX != null ? ev.clientX : ev.pageX;
      updateTimelineFromClientX(cxp);
    }

    function onTrackPointerMove(ev) {
      if (!draggingTimeline) return;
      ev.preventDefault();
      updateTimelineFromClientX(ev.clientX);
    }

    function onTrackPointerUp(ev) {
      if (!draggingTimeline) return;
      draggingTimeline = false;
      try {
        track.releasePointerCapture(ev.pointerId);
      } catch (e) {}
    }

    track.addEventListener('pointerdown', onTrackPointerDown);
    track.addEventListener('pointermove', onTrackPointerMove);
    track.addEventListener('pointerup', onTrackPointerUp);
    track.addEventListener('pointercancel', onTrackPointerUp);

    track.addEventListener('keydown', function (ev) {
      var step = totalMs > 0 ? Math.max(8, totalMs / 200) : 0;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        currentTMs =
          ev.key === 'ArrowLeft' ? Math.max(0, currentTMs - step) : Math.min(totalMs, currentTMs + step);
        drawExplorationFrame(currentTMs);
      }
      if (ev.key === 'Home') {
        ev.preventDefault();
        currentTMs = 0;
        drawExplorationFrame(0);
      }
      if (ev.key === 'End') {
        ev.preventDefault();
        currentTMs = totalMs;
        drawExplorationFrame(totalMs);
      }
    });

    setHudExplore();
    drawExplorationFrame(0);

    btnToReport.onclick = function () {
      timelineEl.style.display = 'none';
      exploreActions.style.display = 'none';
      track.removeEventListener('pointerdown', onTrackPointerDown);
      track.removeEventListener('pointermove', onTrackPointerMove);
      track.removeEventListener('pointerup', onTrackPointerUp);
      track.removeEventListener('pointercancel', onTrackPointerUp);

      responsePanel.style.display = 'flex';
      var responseStart = performance.now();
      var explorationMs = responseStart - phaseExploreStart;

      var reportedTheta = clamp(finalTheta, -Math.PI * 0.98, Math.PI * 0.98);
      overlay.style.display = 'none';
      setHudResponse();

      function drawResponseFrame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFaintArc();
        pivotDraw();
        var bx = cx + L * Math.sin(reportedTheta);
        var by = cy + L * Math.cos(reportedTheta);
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
        reportedTheta = angleFromPointer(cx, cy, p.x, p.y);
        reportedTheta = clamp(reportedTheta, -Math.PI * 0.98, Math.PI * 0.98);
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
        var data = {
          startAngleDeg: startAngleDeg,
          initialAngularVelocityDegPerS: w0Deg,
          lengthPx: L,
          visibleMs: visibleMs,
          invisibleMs: invisibleMs,
          thetaVisibleEndDeg: rad2deg(thetaVisibleEnd),
          thetaInvisibleEndDeg: rad2deg(thetaInvisibleEnd),
          trueAngleAtTimelineEndDeg: rad2deg(finalTheta),
          trueAngleAtReportCueDeg: rad2deg(finalTheta),
          reportedAngleDeg: rad2deg(reportedTheta),
          angularErrorDeg: rad2deg(reportedTheta - finalTheta),
          explorationPhaseMs: explorationMs,
          responseRtMs: rt,
        };
        container.removeChild(wrap);
        onComplete(data);
      };
    };
  }

  global.PendulumLab = {
    runTrial: runTrial,
    deg2rad: deg2rad,
    rad2deg: rad2deg,
  };
})(typeof window !== 'undefined' ? window : globalThis);
