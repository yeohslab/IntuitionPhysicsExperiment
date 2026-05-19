(function () {

  'use strict';



  var CONFIG_VERSION = 4;

  var DEFAULT_PHASE_FACTORS = [1, 0.4, 1, 0.4];

  var DEFAULT_START_ANGLE_DEG = 45;

  var DEFAULT_DISPLAY_TEXT = '请阅读以下内容。';



  function isPendulumKind(kind) {

    return kind === 'practice' || kind === 'response';

  }



  function defaultTrial(kind) {

    return {

      kind: kind || 'response',

      startAngleDeg: DEFAULT_START_ANGLE_DEG,

      initialAngularVelocityDegPerS: 0,

      lengthM: 1,

      phaseFactors: DEFAULT_PHASE_FACTORS.slice(),

    };

  }



  function defaultTextUnit() {

    return {

      kind: 'text',

      displayText: DEFAULT_DISPLAY_TEXT,

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

    delete t.phaseDivisors;

  }



  function previewPeriodMs(trial) {

    if (!isPendulumKind(trial.kind || 'response')) return null;

    if (!window.PendulumLab || !trial.phaseFactors || !trial.phaseFactors.length) {

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



  function validateUnit(t, bi, ti) {

    var p = 'Block ' + (bi + 1) + ' 单元 ' + (ti + 1) + ': ';

    migrateTrialInPlace(t);

    var kind = t.kind || 'response';



    if (kind === 'text') {

      var displayText = t.displayText != null ? String(t.displayText) : '';

      if (!displayText.trim()) throw new Error(p + '显示文字不能为空');

      return { kind: 'text', displayText: displayText };

    }



    if (!isPendulumKind(kind)) {

      throw new Error(p + '类型须为 practice、response 或 text');

    }



    function num(x, key) {

      var n = Number(x);

      if (!isFinite(n)) throw new Error(p + key + ' 必须为数字');

      return n;

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



    if (!t.phaseFactors || t.phaseFactors.length !== 4) {

      throw new Error(p + '须提供 4 个阶段系数 (x·T)');

    }

    out.phaseFactors = t.phaseFactors.map(function (x, i) {

      var f = num(x, '阶段' + (i + 1) + ' 系数 x');

      if (f <= 0) throw new Error(p + '阶段系数须为正数');

      return f;

    });

    return out;

  }



  function validateConfig(cfg) {

    if (!cfg || !Array.isArray(cfg.blocks) || cfg.blocks.length === 0) {

      throw new Error('配置须包含至少一个 block');

    }

    var ver = Number(cfg.version);

    if (ver !== 2 && ver !== 3 && ver !== 4) {

      throw new Error('配置文件 version 须为 2、3 或 4（建议用配置页重新导出）');

    }

    var out = { version: CONFIG_VERSION, blocks: [] };

    cfg.blocks.forEach(function (block, bi) {

      if (!block.trials || !Array.isArray(block.trials) || block.trials.length === 0) {

        throw new Error('Block ' + (bi + 1) + ' 须包含至少一个单元');

      }

      var trials = block.trials.map(function (tr, ti) {

        return validateUnit(tr, bi, ti);

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



        if (trial.kind === 'text') {

          var ta = tr.querySelector('textarea.trial-display-text');

          if (ta) trial.displayText = ta.value;

          return;

        }



        var inputs = tr.querySelectorAll('input[type="number"]');

        if (inputs.length >= 7) {

          trial.startAngleDeg = inputs[0].value;

          trial.initialAngularVelocityDegPerS = inputs[1].value;

          trial.lengthM = inputs[2].value;

          trial.phaseFactors = [

            inputs[3].value,

            inputs[4].value,

            inputs[5].value,

            inputs[6].value,

          ];

        }

      });

    });

  }



  function formatPeriodCellHtml(trial) {

    var periodMs = previewPeriodMs(trial);

    if (periodMs == null) return '—';

    var durs = trial.phaseFactors.map(function (x) {

      return periodMs * Number(x);

    });

    return (

      '<span class="period-t">' +

      formatMs(periodMs) +

      '</span><br><small>θ₀=' +

      Number(trial.startAngleDeg) +

      '° · L=' +

      Number(trial.lengthM) +

      ' m</small><br><small>' +

      durs

        .map(function (ms, i) {

          var labels = ['可视₁', '不可视₁', '可视₂', '不可视₂'];

          return labels[i] + ' ' + formatMs(ms);

        })

        .join(' · ') +

      '</small>'

    );

  }



  function updatePeriodPreview(bi, ti) {

    var card = rootEl.querySelectorAll('.card')[bi];

    if (!card) return;

    var row = card.querySelectorAll('tbody tr')[ti];

    if (!row) return;

    var cell = row.querySelector('.trial-period-preview');

    if (!cell) return;

    cell.innerHTML = formatPeriodCellHtml(state.blocks[bi].trials[ti]);

  }



  function ensureTrialDefaults(t) {

    var kind = t.kind || 'response';

    if (kind === 'text') {

      if (t.displayText == null || String(t.displayText).trim() === '') {

        t.displayText = DEFAULT_DISPLAY_TEXT;

      }

      return;

    }

    if (!t.phaseFactors || t.phaseFactors.length !== 4) {

      t.phaseFactors = DEFAULT_PHASE_FACTORS.slice();

    }

    var fields = [

      ['startAngleDeg', DEFAULT_START_ANGLE_DEG],

      ['initialAngularVelocityDegPerS', 0],

      ['lengthM', 1],

    ];

    fields.forEach(function (pair) {

      var key = pair[0];

      var def = pair[1];

      var v = t[key];

      if (v === '' || v == null || v === undefined || !isFinite(Number(v))) {

        t[key] = def;

      }

    });

  }



  function render() {

    syncFromDom();

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

        '<th>显示文字</th>' +

        '<th>启动角度(°)<br><small>右正左负，默认 45°</small></th>' +

        '<th>初始角速度(°/s)<br><small>右摆为正</small></th>' +

        '<th>摆长(m)</th>' +

        '<th>可视₁<br><small>x·T，默认 1T</small></th>' +

        '<th>不可视₁<br><small>默认 0.4T</small></th>' +

        '<th>可视₂<br><small>x·T</small></th>' +

        '<th>不可视₂<br><small>x·T</small></th>' +

        '<th>预估 T</th>' +

        '<th></th>' +

        '</tr>';

      table.appendChild(thead);



      var tbody = document.createElement('tbody');

      block.trials.forEach(function (trial, ti) {

        migrateTrialInPlace(trial);

        var tr = document.createElement('tr');

        var t = trial;

        ensureTrialDefaults(t);

        var isText = t.kind === 'text';



        var idxTd = document.createElement('td');

        idxTd.textContent = String(ti + 1);

        tr.appendChild(idxTd);



        var kindTd = document.createElement('td');

        var kindSel = document.createElement('select');

        kindSel.className = 'trial-kind';

        [

          { v: 'practice', label: '练习' },

          { v: 'response', label: '正式' },

          { v: 'text', label: '文字' },

        ].forEach(function (item) {

          var opt = document.createElement('option');

          opt.value = item.v;

          opt.textContent = item.label;

          if (t.kind === item.v) opt.selected = true;

          kindSel.appendChild(opt);

        });

        kindSel.addEventListener('change', function () {

          var nextKind = kindSel.value;

          var cur = state.blocks[bi].trials[ti];

          if (nextKind === 'text') {

            state.blocks[bi].trials[ti] = defaultTextUnit();

            state.blocks[bi].trials[ti].displayText =

              cur.displayText != null ? String(cur.displayText) : DEFAULT_DISPLAY_TEXT;

          } else if (cur.kind === 'text') {

            state.blocks[bi].trials[ti] = defaultTrial(nextKind);

          } else {

            cur.kind = nextKind;

          }

          render();

        });

        kindTd.appendChild(kindSel);

        tr.appendChild(kindTd);



        var textTd = document.createElement('td');

        if (isText) {

          var ta = document.createElement('textarea');

          ta.className = 'trial-display-text';

          ta.rows = 3;

          ta.value = t.displayText || '';

          ta.addEventListener('input', function () {

            state.blocks[bi].trials[ti].displayText = ta.value;

          });

          ta.addEventListener('change', function () {

            state.blocks[bi].trials[ti].displayText = ta.value;

          });

          textTd.appendChild(ta);

        } else {

          textTd.className = 'cell-muted';

          textTd.textContent = '—';

        }

        tr.appendChild(textTd);



        if (isText) {

          for (var skip = 0; skip < 7; skip++) {

            var skipTd = document.createElement('td');

            skipTd.className = 'cell-muted';

            skipTd.textContent = '—';

            tr.appendChild(skipTd);

          }

          var periodTdText = document.createElement('td');

          periodTdText.className = 'trial-period-preview cell-muted';

          periodTdText.textContent = '—';

          tr.appendChild(periodTdText);

        } else {

          function bindTrialInput(inp, field, phaseIndex) {

            function commit() {

              var trialRef = state.blocks[bi].trials[ti];

              if (phaseIndex != null) {

                if (!trialRef.phaseFactors) {

                  trialRef.phaseFactors = DEFAULT_PHASE_FACTORS.slice();

                }

                trialRef.phaseFactors[phaseIndex] = inp.value;

              } else {

                trialRef[field] = inp.value;

              }

              updatePeriodPreview(bi, ti);

            }

            inp.addEventListener('input', commit);

            inp.addEventListener('change', commit);

          }



          function cellInput(val) {

            var td = document.createElement('td');

            var inp = document.createElement('input');

            inp.type = 'number';

            inp.step = 'any';

            inp.value = val;

            td.appendChild(inp);

            return { td: td, inp: inp };

          }



          var a0 = cellInput(t.startAngleDeg);

          bindTrialInput(a0.inp, 'startAngleDeg', null);

          tr.appendChild(a0.td);



          var a1 = cellInput(t.initialAngularVelocityDegPerS);

          bindTrialInput(a1.inp, 'initialAngularVelocityDegPerS', null);

          tr.appendChild(a1.td);



          var a2 = cellInput(t.lengthM);

          bindTrialInput(a2.inp, 'lengthM', null);

          tr.appendChild(a2.td);



          for (var pi = 0; pi < 4; pi++) {

            var ap = cellInput(t.phaseFactors[pi]);

            bindTrialInput(ap.inp, null, pi);

            tr.appendChild(ap.td);

          }



          var periodTd = document.createElement('td');

          periodTd.className = 'trial-period-preview';

          periodTd.innerHTML = formatPeriodCellHtml(t);

          tr.appendChild(periodTd);

        }



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

      var addText = document.createElement('button');

      addText.type = 'button';

      addText.textContent = '添加文字显示单元';

      addText.onclick = function () {

        state.blocks[bi].trials.push(defaultTextUnit());

        render();

      };

      addRow.appendChild(addPractice);

      addRow.appendChild(addResponse);

      addRow.appendChild(addText);



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

