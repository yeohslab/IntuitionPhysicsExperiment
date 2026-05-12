(function () {
  'use strict';

  var CONFIG_VERSION = 1;

  function defaultTrial() {
    return {
      startAngleDeg: 15,
      initialAngularVelocityDegPerS: 0,
      lengthPx: 180,
      visibleMs: 1500,
      invisibleMs: 800,
    };
  }

  function defaultConfig() {
    return {
      version: CONFIG_VERSION,
      blocks: [{ trials: [defaultTrial(), defaultTrial()] }],
    };
  }

  var state = defaultConfig();
  var rootEl = document.getElementById('blocks-root');
  var errorEl = document.getElementById('error-banner');

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('visible', !!msg);
  }

  function validateTrial(t, bi, ti) {
    var p = 'Block ' + (bi + 1) + ' 试次 ' + (ti + 1) + ': ';
    function num(x, key) {
      var n = Number(x);
      if (!isFinite(n)) throw new Error(p + key + ' 必须为数字');
      return n;
    }
    var startAngleDeg = num(t.startAngleDeg, '启动角度(°)');
    var initialAngularVelocityDegPerS = num(t.initialAngularVelocityDegPerS, '初始角速度(°/s)');
    var lengthPx = num(t.lengthPx, '摆长(px)');
    var visibleMs = num(t.visibleMs, '可视阶段(ms)');
    var invisibleMs = num(t.invisibleMs, '不可视阶段(ms)');
    if (lengthPx <= 0 || lengthPx > 2000) throw new Error(p + '摆长须在 (0, 2000] px');
    if (visibleMs < 0 || invisibleMs < 0) throw new Error(p + '阶段时长不能为负');
    if (Math.abs(startAngleDeg) > 180)
      throw new Error(p + '启动角度建议在 ±180° 内');
    return {
      startAngleDeg: startAngleDeg,
      initialAngularVelocityDegPerS: initialAngularVelocityDegPerS,
      lengthPx: lengthPx,
      visibleMs: visibleMs,
      invisibleMs: invisibleMs,
    };
  }

  function validateConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.blocks) || cfg.blocks.length === 0) {
      throw new Error('配置须包含至少一个 block');
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
        var inputs = tr.querySelectorAll('input[type="number"]');
        if (inputs.length < 5 || !state.blocks[bi] || !state.blocks[bi].trials[ti]) return;
        state.blocks[bi].trials[ti].startAngleDeg = inputs[0].value;
        state.blocks[bi].trials[ti].initialAngularVelocityDegPerS = inputs[1].value;
        state.blocks[bi].trials[ti].lengthPx = inputs[2].value;
        state.blocks[bi].trials[ti].visibleMs = inputs[3].value;
        state.blocks[bi].trials[ti].invisibleMs = inputs[4].value;
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
        '<th>启动角度(°)</th>' +
        '<th>初始角速度(°/s)</th>' +
        '<th>摆长(px)</th>' +
        '<th>可视(ms)</th>' +
        '<th>不可视(ms)</th>' +
        '<th></th>' +
        '</tr>';
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      block.trials.forEach(function (trial, ti) {
        var tr = document.createElement('tr');

        function cellInput(val, field) {
          var td = document.createElement('td');
          var inp = document.createElement('input');
          inp.type = 'number';
          inp.step = 'any';
          inp.value = val;
          inp.addEventListener('change', function () {
            state.blocks[bi].trials[ti][field] = inp.value;
          });
          td.appendChild(inp);
          return td;
        }

        var idxTd = document.createElement('td');
        idxTd.textContent = String(ti + 1);
        tr.appendChild(idxTd);
        tr.appendChild(cellInput(trial.startAngleDeg, 'startAngleDeg'));
        tr.appendChild(cellInput(trial.initialAngularVelocityDegPerS, 'initialAngularVelocityDegPerS'));
        tr.appendChild(cellInput(trial.lengthPx, 'lengthPx'));
        tr.appendChild(cellInput(trial.visibleMs, 'visibleMs'));
        tr.appendChild(cellInput(trial.invisibleMs, 'invisibleMs'));

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

      var addTrial = document.createElement('button');
      addTrial.type = 'button';
      addTrial.textContent = '在本 Block 添加试次';
      addTrial.onclick = function () {
        state.blocks[bi].trials.push(defaultTrial());
        render();
      };

      card.appendChild(header);
      card.appendChild(tableWrap);
      card.appendChild(addTrial);
      rootEl.appendChild(card);
    });
  }

  document.getElementById('btn-add-block').onclick = function () {
    state.blocks.push({ trials: [defaultTrial()] });
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
