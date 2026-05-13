(function () {
  'use strict';

  function validateConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.blocks) || cfg.blocks.length === 0) {
      throw new Error('配置须包含至少一个 block');
    }
    cfg.blocks.forEach(function (block, bi) {
      if (!block.trials || !Array.isArray(block.trials) || block.trials.length === 0) {
        throw new Error('Block ' + (bi + 1) + ' 须包含至少一个试次');
      }
      block.trials.forEach(function (t, ti) {
        var prefix = 'Block ' + (bi + 1) + ' 试次 ' + (ti + 1) + ': ';
        function num(x, label) {
          var n = Number(x);
          if (!isFinite(n)) throw new Error(prefix + label + ' 无效');
          return n;
        }
        num(t.startAngleDeg, '启动角度');
        num(t.initialAngularVelocityDegPerS, '初始角速度');
        var L = num(t.lengthPx, '摆长');
        num(t.visibleMs, '可视阶段');
        num(t.invisibleMs, '不可视阶段');
        if (L <= 0 || L > 2000) throw new Error(prefix + '摆长须在 (0,2000]');
        if (Number(t.visibleMs) < 0 || Number(t.invisibleMs) < 0) {
          throw new Error(prefix + '阶段时长不能为负');
        }
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

  function buildTimeline(jsPsych, cfg) {
    var timeline = [];

    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus:
        '<div style="max-width:640px;margin:0 auto;text-align:left;line-height:1.6">' +
        '<p>实验即将开始。</p>' +
        '<ul>' +
        '<li>每个试次会<strong>自动播放</strong>一段单摆运动：前半为<strong>可视</strong>、后半为<strong>不可视</strong>（与配置一致）；不可视阶段摆结与摆球会隐藏并叠加浅灰遮罩。</li>' +
        '<li><strong>第一步（点估计）</strong>：拖动蓝色摆球汇报<strong>试次结束时刻</strong>您认为摆球应在的角度，点击“确认汇报”。</li>' +
        '<li><strong>第二步（确信范围）</strong>：在蓝色点两侧拖出一条<strong>弧带</strong>，表示您对该估计的不确定范围（弧越宽表示您越不确定）。</li>' +
        '<li>角度约定：竖直向下为 0°，向右为正，向左为负。</li>' +
        '</ul>' +
        '<p>按任意键继续。</p>' +
        '</div>',
    });

    cfg.blocks.forEach(function (block, blockIndex) {
      block.trials.forEach(function (trialParams, trialIndex) {
        var mountId =
          'pend-' + blockIndex + '-' + trialIndex + '-' + Math.random().toString(36).slice(2, 9);

        timeline.push({
          type: jsPsychHtmlKeyboardResponse,
          stimulus:
            '<div style="text-align:center;width:100%">' +
            '<p style="margin:0 0 8px">Block ' +
            (blockIndex + 1) +
            ' / 试次 ' +
            (trialIndex + 1) +
            '</p>' +
            '<div id="' +
            mountId +
            '"></div></div>',
          choices: 'NO_KEYS',
          trial_duration: null,
          response_ends_trial: false,
          data: {
            block_index: blockIndex,
            trial_index: trialIndex,
            config_startAngleDeg: trialParams.startAngleDeg,
            config_initialAngularVelocityDegPerS: trialParams.initialAngularVelocityDegPerS,
            config_lengthPx: trialParams.lengthPx,
            config_visibleMs: trialParams.visibleMs,
            config_invisibleMs: trialParams.invisibleMs,
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
        downloadCsv(jsPsych);
      },
    });

    return timeline;
  }

  function runExperiment(cfg) {
    document.getElementById('setup').style.display = 'none';
    var target = document.getElementById('jspsych-target');
    target.style.display = 'block';

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
