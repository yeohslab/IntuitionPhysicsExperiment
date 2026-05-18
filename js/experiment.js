(function () {
  'use strict';

  function validateTrial(t, prefix) {
    if (window.PendulumLab && PendulumLab.normalizeTrial) {
      try {
        return PendulumLab.normalizeTrial(t);
      } catch (e) {
        throw new Error(prefix + (e.message || String(e)));
      }
    }
    var kind = t.kind || 'response';
    if (kind !== 'practice' && kind !== 'response') {
      throw new Error(prefix + '类型无效');
    }
    function num(x, label) {
      var n = Number(x);
      if (!isFinite(n)) throw new Error(prefix + label + ' 无效');
      return n;
    }
    if (window.PendulumLab && PendulumLab.migrateRawTrial) {
      t = PendulumLab.migrateRawTrial(t);
    }
    num(t.startAngleDeg, '启动角度(°)');
    num(t.initialAngularVelocityDegPerS, '初始角速度(°/s)');
    var L = num(t.lengthM, '摆长(m)');
    if (L <= 0 || L > 20) throw new Error(prefix + '摆长须在 (0,20] m');
    if (!t.phaseDivisors || t.phaseDivisors.length !== 4) {
      throw new Error(prefix + '须提供 4 个 phaseDivisors');
    }
    t.phaseDivisors.forEach(function (x, i) {
      var d = num(x, '阶段' + (i + 1) + ' 除数');
      if (d <= 0) throw new Error(prefix + '周期除数须为正');
    });
    return t;
  }

  function validateConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.blocks) || cfg.blocks.length === 0) {
      throw new Error('配置须包含至少一个 block');
    }
    var ver = Number(cfg.version);
    if (ver !== 2 && ver !== 3) {
      throw new Error('配置文件 version 须为 2 或 3（建议用配置导出页导出 v3）');
    }
    cfg.blocks.forEach(function (block, bi) {
      if (!block.trials || !Array.isArray(block.trials) || block.trials.length === 0) {
        throw new Error('Block ' + (bi + 1) + ' 须包含至少一个试次');
      }
      block.trials.forEach(function (t, ti) {
        var prefix = 'Block ' + (bi + 1) + ' 试次 ' + (ti + 1) + ': ';
        block.trials[ti] = validateTrial(t, prefix);
      });
    });
    return cfg;
  }

  function downloadCsv(jsPsych) {
    var csv = '\uFEFF' + jsPsych.data.get().csv();
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    var name = 'pendulum-data-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function trialLabel(trialParams) {
    return trialParams.kind === 'practice' ? '练习' : '正式';
  }

  function buildTimeline(jsPsych, cfg) {
    var timeline = [];

    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div style="max-width:640px;margin:0 auto;text-align:left;line-height:1.6">' +
        '<p>实验即将开始。</p>' +
        '<ul>' +
        '<li><strong>练习试次</strong>：仅观看单摆运动，无需作答，用于熟悉任务。</li>' +
        '<li><strong>正式试次</strong>：按配置自动播放<strong>四段</strong>（可视 → 不可视 → 可视 → 不可视），段长为 <code>T/x</code>（<code>T</code> 为根据该试次物理参数估计的周期）。</li>' +
        '<li>实验在全屏下进行，播放阶段鼠标隐藏；作答阶段鼠标重新显示。</li>' +
        '<li><strong>第一步（点估计）</strong>：在圆轨迹上<strong>点击</strong>放置摆球并拖动调整，汇报<strong>全部播放结束</strong>时的角度，点击“确认汇报”。</li>' +
        '<li><strong>第二步（确信范围）</strong>：拖出弧带表示不确定范围，点击“确认范围”。</li>' +
        '<li>每试次开始先看注视点「+」，再播放单摆。</li>' +
        '<li>角度与角速度：竖直向下 0°，向右为正、向左为负。</li>' +
        '</ul>' +
        '<p>按任意键继续。</p>' +
        '</div>',
    });

    cfg.blocks.forEach(function (block, blockIndex) {
      block.trials.forEach(function (trialParams, trialIndex) {
        var mountId =
          'pend-' + blockIndex + '-' + trialIndex + '-' + Math.random().toString(36).slice(2, 9);
        var kindLabel = trialLabel(trialParams);

        timeline.push({
          type: jsPsychHtmlKeyboardResponse,
          stimulus:
            '<div style="text-align:center;width:100%">' +
            '<p style="margin:0 0 8px">Block ' +
            (blockIndex + 1) +
            ' / 试次 ' +
            (trialIndex + 1) +
            '（' +
            kindLabel +
            '）</p>' +
            '<div id="' +
            mountId +
            '"></div></div>',
          choices: 'NO_KEYS',
          trial_duration: null,
          response_ends_trial: false,
          data: {
            block_index: blockIndex,
            trial_index: trialIndex,
            trial_kind: trialParams.kind,
            config_startAngleDeg: trialParams.startAngleDeg,
            config_initialAngularVelocityDegPerS: trialParams.initialAngularVelocityDegPerS,
            config_lengthM: trialParams.lengthM,
            config_phaseDivisors: trialParams.phaseDivisors
              ? JSON.stringify(trialParams.phaseDivisors)
              : null,
          },
          on_load: function () {
            var el = document.getElementById(mountId);
            if (!el || !window.PendulumLab) {
              jsPsych.finishTrial({
                error: 'PendulumLab 未加载或挂载点缺失',
              });
              return;
            }
            PendulumLab.runTrial(el, trialParams, function (data) {
              jsPsych.finishTrial(
                Object.assign({}, data, {
                  block_index: blockIndex,
                  trial_index: trialIndex,
                })
              );
            });
          },
        });
      });
    });

    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div style="max-width:560px;margin:0 auto;text-align:left">' +
        '<p>实验结束，感谢您的参与。</p>' +
        '<p>即将尝试下载 CSV 数据文件（若浏览器拦截弹窗，请允许下载）。</p>' +
        '<p>然后按<strong>空格键</strong>关闭本页提示。</p>' +
        '</div>',
      choices: [' '],
      prompt: '<p class="hint" style="text-align:center">提示：Excel 打开 CSV 时请确认编码为 UTF-8。</p>',
      on_load: function () {
        var target = document.getElementById('jspsych-target');
        if (target) {
          target.classList.remove('experiment-cursor-hidden');
          target.classList.add('experiment-cursor-response');
        }
        downloadCsv(jsPsych);
      },
    });

    return timeline;
  }

  function enterExperimentDisplay(target) {
    target.classList.add('experiment-active');
    var el = document.documentElement;
    var req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).catch(function () {});
    }
  }

  function runExperiment(cfg) {
    document.getElementById('setup').style.display = 'none';
    var target = document.getElementById('jspsych-target');
    target.style.display = 'block';
    enterExperimentDisplay(target);

    var jsPsych = initJsPsych({
      display_element: 'jspsych-target',
      show_progress_bar: true,
    });

    var timeline = buildTimeline(jsPsych, cfg);
    jsPsych.run(timeline);
  }

  document.getElementById('start-btn').addEventListener('click', function () {
    var errEl = document.getElementById('setup-error');
    errEl.textContent = '';
    errEl.classList.remove('visible');

    var input = document.getElementById('cfg-file');
    var file = input.files && input.files[0];
    if (!file) {
      errEl.textContent = '请先选择配置文件（JSON）。';
      errEl.classList.add('visible');
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var cfg = validateConfig(JSON.parse(String(reader.result)));
        runExperiment(cfg);
      } catch (e) {
        errEl.textContent = e.message || String(e);
        errEl.classList.add('visible');
      }
    };
    reader.onerror = function () {
      errEl.textContent = '读取文件失败。';
      errEl.classList.add('visible');
    };
    reader.readAsText(file, 'utf-8');
  });
})();
