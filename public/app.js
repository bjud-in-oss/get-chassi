/* ── State ─────────────────────────────────────── */
let currentFile    = null;
let parsedHeaders  = [];
let parsedRows     = 0;
let columnTypes    = [];
let resultCSV      = '';
let cancelFlag     = false;

/* ── Single lookup ─────────────────────────────── */
async function singleLookup() {
  const input = document.getElementById('single-input').value.trim();
  if (!input) return;

  const btn    = document.getElementById('single-btn');
  const result = document.getElementById('single-result');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Söker…';
  result.classList.add('hidden');

  try {
    const res  = await fetch(`/api/lookup/${encodeURIComponent(input)}`);
    const data = await res.json();

    if (!data.ok) {
      result.className = 'single-result error';
      result.innerHTML = `<div class="result-row"><span class="result-label">Fel:</span><span class="result-value" style="color:var(--error)">${data.error}</span></div>`;
    } else {
      const rows = [];
      if (data.reg)     rows.push(row('Regnummer',     data.reg));
      if (data.chassis) rows.push(row('Chassinummer',  data.chassis));
      if (!data.reg && !data.chassis && data.result)
                        rows.push(row('Resultat',       data.result));
      rows.push(row('Källa', `<a href="${data.url}" target="_blank" style="color:var(--accent)">${data.url}</a>`));

      result.className = 'single-result';
      result.innerHTML = rows.join('') || '<em style="color:var(--text-muted)">Ingen data hittades för detta fordon.</em>';
    }
    result.classList.remove('hidden');
  } catch (e) {
    result.className = 'single-result error';
    result.innerHTML = row('Nätverksfel', e.message);
    result.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sök <span class="btn-arrow">→</span>';
  }
}

function row(label, value) {
  return `<div class="result-row"><span class="result-label">${label}:</span><span class="result-value">${value}</span></div>`;
}

/* ── Enter key on single input ─────────────────── */
document.getElementById('single-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') singleLookup();
});

/* ── Drag & drop ───────────────────────────────── */
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

/* ── Upload & parse CSV ────────────────────────── */
async function processFile(file) {
  currentFile = file;
  const form  = new FormData();
  form.append('csv', file);

  dropzone.innerHTML = '<div class="drop-icon"><span class="spinner"></span></div><p class="drop-text">Analyserar fil…</p>';

  try {
    const res  = await fetch('/api/parse-csv', { method: 'POST', body: form });
    const data = await res.json();

    if (!data.ok) {
      alert('Fel vid inläsning: ' + data.error);
      resetDropzone();
      return;
    }

    parsedHeaders = data.headers;
    parsedRows    = data.totalRows;
    columnTypes   = data.columnTypes;

    // Populate select
    const select = document.getElementById('source-col');
    select.innerHTML = data.headers.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');

    // Auto-select best column
    const best = data.columnTypes.find(c => c.type !== 'other') || data.columnTypes[0];
    if (best) select.value = best.header;

    updateColTypeBadge();
    select.addEventListener('change', updateColTypeBadge);

    // Default target column name
    document.getElementById('target-col').value =
      (best?.type === 'regnr' ? 'Chassinummer' : best?.type === 'chassis' ? 'Regnummer' : 'Konverterat');

    // Preview
    renderPreview(data.preview, data.headers);

    // Update row badge
    document.getElementById('row-count').textContent = `${data.totalRows} rader`;

    // Show picker
    document.getElementById('column-picker').classList.remove('hidden');
    dropzone.innerHTML = `
      <div class="drop-icon">✅</div>
      <p class="drop-text"><strong>${esc(file.name)}</strong><br/><span class="drop-sub">Klicka för att byta fil</span></p>`;

  } catch (e) {
    alert('Nätverksfel: ' + e.message);
    resetDropzone();
  }
}

function updateColTypeBadge() {
  const col   = document.getElementById('source-col').value;
  const badge = document.getElementById('col-type-badge');
  const info  = columnTypes.find(c => c.header === col);
  if (!info) { badge.textContent = ''; return; }
  const labels = { regnr: '🔵 Regnummer', chassis: '🟣 Chassinummer', other: '⚪ Okänd typ' };
  const classes = { regnr: 'type-regnr', chassis: 'type-chassis', other: 'type-other' };
  badge.textContent  = labels[info.type] || '';
  badge.className    = `type-badge ${classes[info.type] || ''}`;
}

function renderPreview(rows, headers) {
  const wrap = document.getElementById('preview-table');
  wrap.innerHTML = buildTable(headers, rows, null, []);
}

/* ── Start processing ──────────────────────────── */
async function startProcess() {
  const col    = document.getElementById('source-col').value;
  const target = document.getElementById('target-col').value.trim() || 'Konverterat';

  if (!currentFile || !col) return;

  cancelFlag = false;

  // Switch to progress section
  document.getElementById('csv-section').classList.add('hidden');
  document.getElementById('progress-section').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');

  const log      = document.getElementById('live-log');
  const bar      = document.getElementById('progress-bar');
  const progText = document.getElementById('progress-text');
  const progPct  = document.getElementById('progress-pct');
  log.innerHTML  = '';
  resultCSV      = '';

  const allRows = [];
  let okCount   = 0;
  let errCount  = 0;

  const form = new FormData();
  form.append('csv', currentFile);
  form.append('column', col);
  form.append('targetColumn', target);

  try {
    const res    = await fetch('/api/process', { method: 'POST', body: form });
    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let   buf    = '';

    while (true) {
      if (cancelFlag) { reader.cancel(); break; }

      const { done, value } = await reader.read();
      if (done) break;

      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const evt = JSON.parse(line.slice(6));

        if (evt.type === 'start') {
          progText.textContent = `0 / ${evt.total}`;
        }

        if (evt.type === 'progress') {
          const pct = Math.round((evt.completed / evt.total) * 100);
          bar.style.width       = pct + '%';
          progText.textContent  = `${evt.completed} / ${evt.total}`;
          progPct.textContent   = pct + '%';

          const val = evt.row[target] || '';
          const isErr = val.startsWith('FEL:') || val === 'Ej hittad';
          if (isErr) errCount++; else okCount++;

          allRows.push(evt.row);

          // Log entry
          const entry = document.createElement('div');
          entry.className = 'log-entry';
          entry.innerHTML = `<span class="log-id">${esc(evt.row[col] || '–')}</span>
            <span class="${isErr ? 'log-err' : 'log-val'}">${esc(val || '–')}</span>`;
          log.appendChild(entry);
          log.scrollTop = log.scrollHeight;
        }

        if (evt.type === 'done') {
          resultCSV = evt.csv;
          bar.style.width = '100%';
          progPct.textContent = '100%';
          showResults(allRows, target, col, okCount, errCount);
        }

        if (evt.type === 'error') {
          alert('Serverfel: ' + evt.message);
          showSection('csv-section');
        }
      }
    }
  } catch (e) {
    if (!cancelFlag) alert('Anslutningsfel: ' + e.message);
    showSection('csv-section');
  }
}

function cancelProcess() {
  cancelFlag = true;
  showSection('csv-section');
}

/* ── Show results ──────────────────────────────── */
function showResults(rows, targetCol, sourceCol, okCount, errCount) {
  document.getElementById('progress-section').classList.add('hidden');
  document.getElementById('result-section').classList.remove('hidden');

  // Stats
  document.getElementById('result-stats').innerHTML = `
    <div class="stat-box"><div class="stat-num all">${rows.length}</div><div class="stat-label">Totalt</div></div>
    <div class="stat-box"><div class="stat-num ok">${okCount}</div><div class="stat-label">Lyckade</div></div>
    <div class="stat-box"><div class="stat-num err">${errCount}</div><div class="stat-label">Misslyckade</div></div>`;

  // Table – highlight source & target columns
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const highlight = [sourceCol, targetCol];
  document.getElementById('result-table').innerHTML = buildTable(headers, rows, targetCol, highlight);
}

/* ── Download CSV ──────────────────────────────── */
function downloadCSV() {
  if (!resultCSV) return;
  const blob = new Blob([resultCSV], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'get-chassi-resultat.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Reset ─────────────────────────────────────── */
function resetAll() {
  currentFile   = null;
  parsedHeaders = [];
  parsedRows    = 0;
  columnTypes   = [];
  resultCSV     = '';
  cancelFlag    = false;
  document.getElementById('column-picker').classList.add('hidden');
  resetDropzone();
  showSection('csv-section');
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('file-input').value = '';
}

function resetDropzone() {
  dropzone.innerHTML = `
    <div class="drop-icon">📄</div>
    <p class="drop-text">Dra och släpp en CSV-fil här<br/><span class="drop-sub">eller klicka för att välja</span></p>
    <input id="file-input" type="file" accept=".csv,text/csv" style="display:none" onchange="handleFileSelect(event)" />`;
}

/* ── Helpers ───────────────────────────────────── */
function showSection(id) {
  ['csv-section','progress-section','result-section'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function buildTable(headers, rows, targetCol, highlightCols) {
  const ths = headers.map(h =>
    `<th class="${highlightCols.includes(h) ? 'highlight' : ''}">${esc(h)}</th>`).join('');

  const trs = rows.map(r => {
    const tds = headers.map(h => {
      const val = (r[h] || '').toString();
      let cls   = '';
      if (h === targetCol) {
        if (val.startsWith('FEL:') || val === 'Ej hittad') cls = 'result-err';
        else if (val === '') cls = 'result-wait';
        else cls = 'result-ok';
      } else if (highlightCols.includes(h)) {
        cls = 'highlight';
      }
      return `<td class="${cls}" title="${esc(val)}">${esc(val)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
