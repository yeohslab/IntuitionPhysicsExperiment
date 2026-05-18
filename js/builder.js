(function () {
  'use strict';

  var CONFIG_VERSION = 3;
  var DEFAULT_PHASE_DIVISORS = [2, 2, 2, 2];
  var DEFAULT_START_ANGLE_DEG = 45;

  function defaultTrial(kind) {
    return {
      kind: kind || 'response',
      startAngleDeg: DEFAULT_START_ANGLE_DEG,
      initialAngularVelocityDegPerS: 0,
      lengthM: 1,
      phaseDivisors: DEFAULT_PHASE_DIVISORS.slice(),
    };
  }

  function defaultConfig() {
    return {
      version: CONFIG_VERSION,
      blocks: [
        {
          trials: [defaultTrial('practice'), defaultTrial('response')],
        },
      ],
    };
  }

  var state = defaultConfig();
  var rootEl = document.getElementById('blocks-root');
  var errorEl = document.getElementById('error-banner');

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('visible', !!msg);
  }

  function migrateTrialInPlace(t) {
    if (window.PendulumLab && PendulumLab.migrateRawTrial) {
      var m = PendulumLab.migrateRawTrial(t);
      Object.keys(m).forEach(function (k) {
        t[k] = m[k];
      });
    }
    delete t.startAngleRad;
    delete t.initialAngularVelocityRadPerS;
    delete t.lengthPx;
  }

  function previewPeriodMs(trial) {
    if (!window.PendulumLab || !trial.phaseDivisors || !trial.phaseDivisors.length) {
      return null;
    }
    try {
      migrateTrialInPlace(trial);
      return PendulumLab.estimatePeriodMs(
        PendulumLab.deg2rad(trial.startAngleDeg),
        PendulumLab.deg2rad(trial.initialAngularVelocityDegPerS),
        trial.lengthM
      );
    } catch (e) {
      return null;
    }
  }

  function formatMs(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    return Math.round(ms) + ' ms';
  }

  function validateTrial(t, bi, ti) {
    var p = 'Block ' + (bi + 1) + ' 试次 ' + (ti + 1) + ': ';
    migrateTrialInPlace(t);
    function num(x, key) {
      var n = Number(x);
      if (!isFinite(n)) throw new Error(p + key + ' 必须为数字');
      return n;
    }
    var kind = t.kind || 'response';
    if (kind !== 'practice' && kind !== 'response') {
      throw new Error(p + '类型须为 practice 或 response');
    }
    var startAngleDeg = num(t.startAngleDeg, '启动角度(°)');
    var initialAngularVelocityDegPerS = num(
      t.initialAngularVelocityDegPerS,
      '初始角速度(°/s)'
    );
    var lengthM = num(t.lengthM, '摆长(m)');
    if (lengthM <= 0 || lengthM > 20) throw new Error(p + '摆长须在 (0, 20] m');
    if (Math.abs(startAngleDeg) > 720) throw new Error(p + '启动角度建议在 ±720° 内');

    var out = {
      kind: kind,
      startAngleDeg: startAngleDeg,
      initialAngularVelocityDegPerS: initialAngularVelocityDegPerS,
      lengthM: lengthM,
    };

    if (!t.phaseDivisors || t.phaseDivisors.length !== 4) {
      throw new Error(p + '须提供 4 个阶段除数 (T/x)');
    }
    out.phaseDivisors = t.phaseDivisors.map(function (x, i) {
      var d = num(x, '阶段' + (i + 1) + ' 除数 (T/x)');
      if (d <= 0) throw new Error(p + '周期除数须为正数');
      return d;
    });
    return out;
  }

  function validateConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.blocks) || cfg.blocks.length === 0) {
      throw new Error('配置须包含至少一个 block');
    }
    var ver = Number(cfg.version);
    if (ver !== 2 && ver !== 3) {
      throw new Error('配置文件 version 须为 2 或 3（建议用配置页重新导出）');
    }
    var out = { version: CONFIG_VERSION, blocks: [] };
    cfg.blocks.forEach(function (block, bi) {
      if (!block.trials || !Array.isArray(block.trials) || block.trials.length === 0) {
        throw new Error('Block ' + (bi + 1) + ' 须包含至少一个试次');
      }
      var trials = block.trials.map(function (tr, ti) {
        return validateTrial(tr, bi, ti);
      });
      out.blocks.push({ trials: trials });
    });
    return out;
  }

  function syncFromDom() {
    var cards = rootEl.querySelectorAll('.card');
    cards.forEach(function (card, bi) {
      var rows = card.querySelectorAll('tbody tr');
      rows.forEach(function (tr, ti) {
        if (!state.blocks[bi] || !state.blocks[bi].trials[ti]) return;
        var trial = state.blocks[bi].trials[ti];
        var sel = tr.querySelector('select.trial-kind');
        if (sel) trial.kind = sel.value;
        var inputs = tr.querySelectorAll('input[type="number"]');
        if (inputs.length >= 7) {
          trial.startAngleDeg = inputs[0].value;
          trial.initialAngularVelocityDegPerS = inputs[1].value;
          trial.lengthM = inputs[2].value;
          trial.phaseDivisors = [
            inputs[3].value,
            inputs[4].value,
            inputs[5].value,
            inputs[6].value,
          ];
        }
      });
    });
  }

  function render() {
    rootEl.innerHTML = '';
    state.blocks.forEach(function (block, bi) {
      var card = document.createElement('div');
      card.className = 'card';

      var header = document.createElement('div');
      header.className = 'block-header';
      var title = document.createElement('strong');
      title.textContent = 'Block ' + (bi + 1);
      var delBlock = document.createElement('button');
      delBlock.type = 'button';
      delBlock.className = 'danger';
      delBlock.textContent = '删除此 Block';
      delBlock.disabled = state.blocks.length <= 1;
      delBlock.onclick = function () {
        state.blocks.splice(bi, 1);
        render();
      };
      header.appendChild(title);
      header.appendChild(delBlock);

      var tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      var table = document.createElement('table');
      table.className = 'trials';

      var thead = document.createElement('thead');
      thead.innerHTML =
        '<tr>' +
        '<th>#</th>' +
        '<th>类型</th>' +
        '<th>启动角度(°)<br><small>右正左负，默认 45°</small></th>' +
        '<th>初始角速度(°/s)<br><small>右摆为正</small></th>' +
        '<th>摆长(m)</th>' +
        '<th>可视₁<br><small>T/x，默认 T/2</small></th>' +
        '<th>不可视₁<br><small>T/x</small></th>' +
        '<th>可视₂<br><small>T/x</small></th>' +
        '<th>不可视₂<br><small>T/x</small></th>' +
        '<th>预估 T</th>' +
        '<th></th>' +
        '</tr>';
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      block.trials.forEach(function (trial, ti) {
        migrateTrialInPlace(trial);
        var tr = document.createElement('tr');
        var t = trial;
        if (!t.phaseDivisors || t.phaseDivisors.length !== 4) {
          t.phaseDivisors = DEFAULT_PHASE_DIVISORS.slice();
        }
        if (t.startAngleDeg == null || !isFinite(Number(t.startAngleDeg))) {
          t.startAngleDeg = DEFAULT_START_ANGLE_DEG;
        }
        if (t.lengthM == null || !isFinite(Number(t.lengthM))) {
          t.lengthM = 1;
        }
        if (
          t.initialAngularVelocityDegPerS == null ||
          !isFinite(Number(t.initialAngularVelocityDegPerS))
        ) {
          t.initialAngularVelocityDegPerS = 0;
        }

        var idxTd = document.createElement('td');
        idxTd.textContent = String(ti + 1);
        tr.appendChild(idxTd);

        var kindTd = document.createElement('td');
        var kindSel = document.createElement('select');
        kindSel.className = 'trial-kind';
        ['practice', 'response'].forEach(function (k) {
          var opt = document.createElement('option');
          opt.value = k;
          opt.textContent = k === 'practice' ? '练习' : '正式';
          if (t.kind === k) opt.selected = true;
          kindSel.appendChild(opt);
        });
        kindSel.addEventListener('change', function () {
          state.blocks[bi].trials[ti].kind = kindSel.value;
        });
        kindTd.appendChild(kindSel);
        tr.appendChild(kindTd);

        function cellInput(val, step, onChange) {
          var td = document.createElement('td');
          var inp = document.createElement('input');
          inp.type = 'number';
          inp.step = step || 'any';
          inp.value = val;
          inp.addEventListener('change', onChange);
          td.appendChild(inp);
          return td;
        }

        tr.appendChild(
          cellInput(t.startAngleDeg, 'any', function (e) {
            state.blocks[bi].trials[ti].startAngleDeg = e.target.value;
            render();
          })
        );
        tr.appendChild(
          cellInput(t.initialAngularVelocityDegPerS, 'any', function (e) {
            state.blocks[bi].trials[ti].initialAngularVelocityDegPerS = e.target.value;
            render();
          })
        );
        tr.appendChild(
          cellInput(t.lengthM, 'any', function (e) {
            state.blocks[bi].trials[ti].lengthM = e.target.value;
            render();
          })
        );

        for (var pi = 0; pi < 4; pi++) {
          (function (phaseIndex) {
            tr.appendChild(
              cellInput(t.phaseDivisors[phaseIndex], 'any', function (e) {
                if (!state.blocks[bi].trials[ti].phaseDivisors) {
                  state.blocks[bi].trials[ti].phaseDivisors = DEFAULT_PHASE_DIVISORS.slice();
                }
                state.blocks[bi].trials[ti].phaseDivisors[phaseIndex] = e.target.value;
                render();
              })
            );
          })(pi);
        }

        var periodTd = document.createElement('td');
        periodTd.className = 'trial-period-preview';
        var periodMs = previewPeriodMs(t);
        if (periodMs != null) {
          var durs = t.phaseDivisors.map(function (x) {
            return periodMs / Number(x);
          });
          periodTd.innerHTML =
            '<span class="period-t">' +
            formatMs(periodMs) +
            '</span><br><small>θ₀=' +
            Number(t.startAngleDeg) +
            '° · L=' +
            Number(t.lengthM) +
            ' m</small><br><small>' +
            durs
              .map(function (ms, i) {
                var labels = ['可视₁', '不可视₁', '可视₂', '不可视₂'];
                return labels[i] + ' ' + formatMs(ms);
              })
              .join(' · ') +
            '</small>';
        } else {
          periodTd.textContent = '—';
        }
        tr.appendChild(periodTd);

        var actTd = document.createElement('td');
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '删';
        rm.disabled = block.trials.length <= 1;
        rm.onclick = function () {
          state.blocks[bi].trials.splice(ti, 1);
          render();
        };
        actTd.appendChild(rm);
        tr.appendChild(actTd);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      var addRow = document.createElement('div');
      addRow.className = 'toolbar';
      addRow.style.marginTop = '0.65rem';
      var addPractice = document.createElement('button');
      addPractice.type = 'button';
      addPractice.textContent = '添加练习试次';
      addPractice.onclick = function () {
        state.blocks[bi].trials.push(defaultTrial('practice'));
        render();
      };
      var addResponse = document.createElement('button');
      addResponse.type = 'button';
      addResponse.className = 'primary';
      addResponse.textContent = '添加正式试次';
      addResponse.onclick = function () {
        state.blocks[bi].trials.push(defaultTrial('response'));
        render();
      };
      addRow.appendChild(addPractice);
      addRow.appendChild(addResponse);

      card.appendChild(header);
      card.appendChild(tableWrap);
      card.appendChild(addRow);
      rootEl.appendChild(card);
    });
  }

  document.getElementById('btn-add-block').onclick = function () {
    state.blocks.push({ trials: [defaultTrial('response')] });
    render();
  };

  document.getElementById('btn-export').onclick = function () {
    showError('');
    try {
      syncFromDom();
      var cfg = JSON.parse(JSON.stringify(state));
      validateConfig(cfg);
      var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'experiment-config.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showError(e.message || String(e));
    }
  };

  document.getElementById('btn-import').onclick = function () {
    document.getElementById('import-file').click();
  };

  document.getElementById('import-file').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    showError('');
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        state = validateConfig(parsed);
        render();
      } catch (e) {
        showError(e.message || String(e));
      }
      ev.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  });

  render();
})();
