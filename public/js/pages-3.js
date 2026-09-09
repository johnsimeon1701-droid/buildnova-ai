(() => {
/* BuildNova AI — Pages: Project Memory, Audit Trail, Settings, AI Progress Brief */
const { h } = UI;

/* ============================= PROJECT MEMORY ============================= */
PAGES['#/memory'] = (root, ctx) => {
  const { data } = ctx;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Project Memory'),
      h('div', { class: 'ph-sub' }, 'Searchable history of field reports, progress events, delays, decisions, approvals and schedule updates — every record links back to its source.'))));

  const card = h('div', { class: 'card' });
  const input = h('input', { type: 'search', placeholder: 'Ask project memory… e.g. "Why was P102 delayed?"', style: 'flex:1;padding:12px 15px;border:1px solid #cbd5e1;border-radius:24px;font-size:14px' });
  const answerMount = h('div', { class: 'card-b' });
  card.appendChild(h('div', { class: 'card-h' },
    h('div', { style: 'display:flex;gap:10px;width:100%;align-items:center' }, '🧠 ', input,
      h('button', { class: 'btn btn-primary', onclick: ask }, 'Search'))));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
  card.appendChild(answerMount);
  root.appendChild(card);

  const presets = ['Why was P102 delayed?', 'Show all material-related delays', 'What happened at Pipe Rack B?', 'Which activities were delayed this week?', 'Show previous updates for P102'];
  root.appendChild(h('div', { class: 'flex flex-wrap mb8', style: 'gap:8px' },
    h('span', { class: 'muted', style: 'font-size:12.5px;font-weight:600' }, 'Try:'),
    ...presets.map(p => h('button', { class: 'quick-chip', onclick: () => { input.value = p; ask(); } }, p))));

  const recCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, '📚 Recent Project Memory')));
  const recMount = h('div', { class: 'card-b' });
  recCard.appendChild(recMount);
  root.appendChild(recCard);

  async function ask() {
    const q = input.value.trim();
    if (!q) return;
    answerMount.innerHTML = '<div class="muted" style="padding:6px 4px">Searching project memory…</div>';
    try {
      const res = await API.askMemory(q);
      answerMount.innerHTML = '';
      answerMount.appendChild(h('div', { class: 'memory-answer' }, res.answer));
      if (res.records && res.records.length) {
        answerMount.appendChild(h('div', { class: 'muted', style: 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 8px' }, 'Supporting records (' + res.records.length + ')'));
        res.records.forEach(m => answerMount.appendChild(memoryRec(m, ctx)));
      }
    } catch (e) { answerMount.innerHTML = ''; answerMount.appendChild(h('div', { class: 'memory-answer', style: 'border-left-color:#dc2626' }, '⚠ ' + e.message)); }
  }

  function memoryRec(m) {
    return h('div', { class: 'memory-rec' },
      h('div', { class: 'flex', style: 'justify-content:space-between;flex-wrap:wrap' },
        h('b', { style: 'font-size:13px' }, m.title),
        h('span', { class: 'muted', style: 'font-size:11.5px' }, UI.FMT.date(m.date), ' · ', h('span', { class: 'mono' }, m.memory_id), m.activity_id ? ' · ' + m.activity_id : '')),
      h('div', { style: 'font-size:13px;margin-top:4px;line-height:1.55' }, m.content),
      h('div', { class: 'mr-tags' }, (m.tags || []).map(t => h('span', { class: 'mem-tag' }, t)),
        h('span', { class: 'mem-tag', style: 'background:#0f1e30;color:#fff' }, 'source: ' + m.source_type + (m.source_id ? ' ' + m.source_id : ''))));
  }

  data.memory.slice(0, 25).forEach(m => recMount.appendChild(memoryRec(m)));
  // auto-ask the demo question on first visit
  if (window.__memoryAsk) { window.__memoryAsk = false; input.value = 'Why was P102 delayed?'; ask(); }
};

/* ============================== AUDIT TRAIL ============================== */
PAGES['#/audit'] = (root, ctx) => {
  const { data } = ctx;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Audit Trail'),
      h('div', { class: 'ph-sub' }, 'Every schedule modification is recorded: who, what changed, old → new values, AI match confidence and approval status. Baseline planned dates are never overwritten.')),
    h('div', { class: 'ph-actions' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => API.exportCsv('audit.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Export audit CSV'))));

  const search = h('input', { type: 'search', placeholder: 'Search by activity, user, report, field…', style: 'padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;min-width:260px' });
  const actionSel = h('select', {}, h('option', { value: '' }, 'All actions'), ...['Approved', 'Rejected', 'Import'].map(a => h('option', { value: a }, a)));
  const card = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, '📜 Change History'), h('div', { class: 'ch-actions' }, search, actionSel)));
  const mount = h('div', { style: 'padding:14px 18px' });
  card.appendChild(h('div', { class: 'table-wrap' }, mount));
  root.appendChild(card);

  function render() {
    const q = search.value.toLowerCase(); const af = actionSel.value;
    const rows = data.audit.filter(a => (!af || (a.action || '').includes(af)) &&
      (!q || `${a.activity_id} ${a.user} ${a.source_report} ${a.field_changed} ${a.new_value} ${a.old_value}`.toLowerCase().includes(q)));
    mount.innerHTML = '';
    if (!rows.length) { mount.appendChild(UI.empty('📜', 'No audit records', 'Approve a matched field report to generate audit history.')); return; }
    const list = h('div', {});
    rows.slice(0, 80).forEach(a => list.appendChild(h('div', { class: 'timeline-item' },
      h('div', { class: 'tl-time' }, UI.FMT.dt(a.timestamp), ' · ', h('b', {}, a.user), ' (', a.role, ')'),
      h('div', { class: 'tl-body' },
        h('span', { class: 'badge ' + (a.action && a.action.startsWith('Rejected') ? 'b-red' : a.action === 'Import' ? 'b-violet' : 'b-green') }, a.action),
        ' ', h('span', { class: 'mono', style: 'font-weight:700' }, a.activity_id), ' · ', a.field_changed, ': ',
        h('span', { class: 'mono muted' }, String(a.old_value || 'NULL')), ' → ', h('b', { class: 'mono' }, String(a.new_value || '')),
        a.confidence ? h('span', {}, ' · AI match ', UI.confBadge(a.confidence, a.confidence >= 90 ? 'high' : a.confidence >= 70 ? 'medium' : 'low')) : null,
        a.source_report ? h('div', { class: 'muted', style: 'font-size:11.5px;margin-top:2px' }, 'Source: ', h('span', { class: 'mono' }, a.source_report)) : null))));
    mount.appendChild(list);
  }
  search.addEventListener('input', render); actionSel.addEventListener('change', render);
  render();
};


/* ================================ SETTINGS ================================ */
PAGES['#/settings'] = (root, ctx) => {
  const { data, refresh } = ctx;
  const p = data.project;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Settings & About'),
      h('div', { class: 'ph-sub' }, 'Project configuration, demo controls, data import/export, security model and system architecture.'))));

  /* ---- Profile / roles ---- */
  const u = API.session || { name: 'Demo User', title: '', email: '', role: ctx.role() };
  const roleRows = [
    ['Supervisor', 'Submit field reports, upload files, review extractions & matches. Cannot modify the official schedule.'],
    ['Planner', 'Review extraction/matches, approve, reject, edit match, update schedule, view delays/risks/analytics, audit & imports.'],
    ['Project Manager', 'Dashboards, project health, delays/risks, project memory search, reports & audit trail (read-only on schedule changes).'],
  ].map(([r, d]) => h('tr', {}, h('td', {}, h('b', {}, r)), h('td', { class: 'muted' }, d)));
  const profCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '👤 Session & Roles')),
    h('div', { class: 'card-b' },
      h('div', { class: 'flex', style: 'gap:16px;align-items:center;flex-wrap:wrap' },
        h('div', { class: 'avatar', style: 'width:52px;height:52px;font-size:20px' }, u.name.split(' ').map(x => x[0]).join('')),
        h('div', {}, h('div', { style: 'font-weight:700;font-size:16px' }, u.name),
          h('div', { class: 'muted' }, u.title + ' · ' + u.email),
          h('div', { style: 'margin-top:6px' }, h('span', { class: 'badge b-dark' }, 'Role: ' + u.role)))),
      h('div', { style: 'margin-top:16px' }, h('table', { class: 'data', style: 'min-width:auto' },
        h('thead', {}, h('tr', {}, h('th', { class: 'no-sort' }, 'Role'), h('th', { class: 'no-sort' }, 'Can do'))),
        h('tbody', {}, roleRows))),
      h('div', { class: 'flex', style: 'gap:8px;flex-wrap:wrap;margin-top:16px' },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await API.logout(); location.hash = '#/login'; App.boot(); } }, '⏻ Log out'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { location.hash = '#/login'; } }, '🔁 Switch role (demo login)'))));
  root.appendChild(profCard);

  /* ---- Project ---- */
  const kv = (k, v) => h('div', { class: 'kv' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
  const pCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '🏗 Project')),
    h('div', { class: 'card-b' }, h('div', { class: 'kv-grid' },
      kv('Project ID', p.project_id), kv('Name', p.name),
      kv('Client (fictional)', p.client), kv('Contractor (fictional)', p.contractor),
      kv('Planned start', UI.FMT.date(p.start_date)), kv('Planned finish', UI.FMT.date(p.end_date)),
      kv('Status', p.status), kv('Data date', UI.FMT.date(p.data_date)))));
  root.appendChild(pCard);

  /* ---- Demo & data ---- */
  const ta = h('textarea', { rows: '4', style: 'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:monospace;font-size:12px;margin-top:6px',
    placeholder: 'Activity ID,Activity Name,WBS,Level,Discipline,Location,Planned Start,Planned Finish\nX-9001,Erect temporary scaffold Rack C,SCAF.01,5,HSE,Pipe Rack C,2026-09-10,2026-09-14' });
  const ctxRole = typeof ctx.role === 'function' ? ctx.role() : ctx.role;
  const canImport = (ctx.can && typeof ctx.can.import === 'function') ? ctx.can.import() : ['Planner', 'Project Manager'].includes(ctxRole);
  const canResetDemo = (ctx.can && typeof ctx.can.resetDemo === 'function') ? ctx.can.resetDemo() : ['Planner', 'Project Manager'].includes(ctxRole);
  const importBlock = canImport
    ? h('div', { style: 'margin-top:16px' },
        h('div', { style: 'font-weight:600;font-size:12.5px' }, 'Import schedule (CSV — columns: Activity ID, Activity Name, WBS, Level, Discipline, Location, Planned Start, Planned Finish)'),
        ta,
        h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px', onclick: async () => {
          const csvText = ta.value.trim();
          if (!csvText) { UI.toast('Paste schedule CSV first (header row + at least one activity).', 'warning'); ta.focus(); return; }
          if (!/Activity\s*ID/i.test(csvText.split('\n')[0]) && csvText.split('\n').length < 2) { UI.toast('CSV needs a header row and at least one activity line.', 'warning'); return; }
          try { const r = await API.importSchedule(csvText); UI.toast(r.message, 'success'); ta.value = ''; await refresh(true); }
          catch (e) { UI.toast(e.message, 'warning'); }
        } }, '⬆ Import CSV'))
    : h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:14px' }, 'Schedule import and demo reset are restricted to the Planner and Project Manager roles.');
  const demoCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '⚡ Demo & Data Controls')),
    h('div', { class: 'card-b' },
      h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:14px;line-height:1.6' },
        'The P102 scenario: report "P102 spool erection started at 8:45 AM… material arrived late" → extraction → 96% match to ',
        h('span', { class: 'mono' }, 'PIP-0453 Erect Line 24-P-102'), ' → planner approval → +4 day variance → delay/downstream risk → dashboard, memory and audit update.'),
      h('div', { class: 'flex', style: 'gap:9px;flex-wrap:wrap' },
        canResetDemo ? h('button', { class: 'btn btn-primary', onclick: () => App.loadDemo() }, '⚡ LOAD / RESET DEMO') : null,
        h('button', { class: 'btn btn-ghost', onclick: () => API.exportCsv('schedule.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Export schedule CSV'),
        h('button', { class: 'btn btn-ghost', onclick: () => API.exportCsv('progress.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Export progress CSV'),
        h('button', { class: 'btn btn-ghost', onclick: () => API.exportCsv('delays.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Export delay report'),
        h('button', { class: 'btn btn-ghost', onclick: () => API.exportCsv('audit.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Export audit trail')),
      importBlock));
  root.appendChild(demoCard);

  /* ---- Architecture ---- */
  const arch = (txt, cls) => h('div', { class: 'arch-node ' + (cls || '') }, txt);
  const arrow = h('div', { class: 'arch-arrow' }, '↓');
  const archCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '🧩 Technical Architecture — BuildNova AI Agents')),
    h('div', { class: 'card-b' },
      h('div', { class: 'arch-grid' }, arch('📄 Field Reports (free text / Excel / CSV / TXT)')),
      arrow, arch('Agent 1 · Data Normalization + Field Report Extraction Agent', 'core'), arrow,
      arch('Agent 2 · L5/L6 Activity Matching Engine (6 weighted signals)', 'core'), arrow,
      arch('Confidence Layer (High ≥90 / Medium 70–89 / Low <70) + duplicate & unknown-tag checks', 'core'), arrow,
      arch('🛡 Human Planner Approval — AI recommends. Planner approves.', 'warn'), arrow,
      arch('Agent 3 · Schedule Update Agent (actuals only — baseline never overwritten)', 'core'), arrow,
      arch('Agent 4 · Delay & Risk Engine (variance, progress gap, criticality, downstream)', 'core'), arrow,
      h('div', { class: 'arch-grid' }, arch('Analytics + Dashboard'), arch('Agent 5 · Project Memory (searchable history)')),
      arrow, arch('📜 Audit Trail (every change, with evidence & confidence)'),
      h('div', { class: 'ai-note', style: 'margin-top:16px' },
        'Prototype note: AI agents are implemented as modular deterministic services (identifier/keyword/fuzzy matching, synonym NLU, rule-based risk scoring) with a clean seam for swapping in an LLM extraction API — no external keys required for the demo.')));
  root.appendChild(archCard);

  /* ---- Glossary ---- */
  const glossary = [
    ['Match Confidence', 'How strongly the extracted field event corresponds to a schedule activity (0–100). Combines identifier (30%), semantic (25%), keyword (20%), discipline (10%), location (10%) and WBS/context (5%) signals. It is NOT accuracy.'],
    ['Schedule Variance', 'Difference between actual and planned dates (or progress). Positive values mean late/behind.'],
    ['Risk Score', '0–100 score from variance, progress gap, delay reason, activity criticality and downstream impact. Low <25 · Medium 25–49 · High 50–74 · Critical ≥75.'],
    ['L5/L6', 'Executable schedule-level activities used to represent detailed project work (vs high-level L1/L2 milestones).'],
    ['AI Extraction', 'Structuring free-text reports into identifiers, dates, times, quantities, discipline, location, delay reasons and entities — each with source evidence.'],
    ['Planner Approval', 'The human gate: AI never writes to the official schedule; a planner approves, edits or rejects every match.'],
  ].map(([k, v]) => h('tr', {}, h('td', { style: 'font-weight:700;white-space:nowrap' }, k), h('td', { class: 'muted' }, v)));
  const glCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '❓ Glossary & Tooltips')),
    h('div', { class: 'card-b' }, h('table', { class: 'data', style: 'min-width:auto' }, h('tbody', {}, glossary))));
  root.appendChild(glCard);
};

/* ============================ AI PROGRESS BRIEF ============================ */
PAGES['#/brief'] = (root, ctx) => {
  const { data } = ctx;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'AI Progress Brief'),
      h('div', { class: 'ph-sub' }, 'One-click DPR / WPR drafted automatically from planner-approved field updates — progress, delays, downstream watch and pending approvals. Every figure traces to approved evidence; no numbers are invented.'))));

  const kindSel = h('select', {},
    h('option', { value: 'daily' }, 'Daily Progress Report (DPR)'),
    h('option', { value: 'weekly' }, 'Weekly Progress Report (WPR)'));
  const genBtn = h('button', { class: 'btn btn-primary', onclick: load }, '✨ Generate Brief');
  const copyBtn = h('button', { class: 'btn', onclick: copyText, disabled: true }, '📋 Copy text');
  const dlBtn = h('button', { class: 'btn', onclick: download, disabled: true }, '⬇ Download .txt');
  const body = h('div', { class: 'card-b brief-body' },
    h('div', { class: 'brief-placeholder' }, 'Choose a report type and press “Generate Brief”. The AI compiles it from approved updates only.'));

  const card = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '📝 Auto-drafted report'),
      h('div', { class: 'ch-actions' }, kindSel, genBtn, copyBtn, dlBtn)),
    body);
  root.appendChild(card);

  // Provenance strip
  const st = data.stats || {};
  root.appendChild(h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '🔗 What feeds this brief')),
    h('div', { class: 'card-b' },
      h('div', { class: 'brief-source-grid' },
        srcStat('✅', 'Approved updates', data.reports.filter(r => r.processing_status === 'approved').length),
        srcStat('🚧', 'In progress', (data.activities.filter(a => a.status === 'in_progress')).length),
        srcStat('⏱', 'Delayed activities', (data.activities.filter(a => a.delay_days > 0)).length),
        srcStat('🧭', 'Downstream watch', (data.activities.filter(a => a.downstream_watch && a.downstream_watch.length)).length),
        srcStat('🟡', 'Pending approvals', data.reports.filter(r => r.processing_status === 'pending_review').length)))));

  let currentText = '';
  function srcStat(ico, lbl, val) {
    return h('div', { class: 'brief-src' }, h('div', { class: 'brief-src-ico' }, ico),
      h('div', { class: 'brief-src-val' }, String(val)), h('div', { class: 'brief-src-lbl' }, lbl));
  }

  async function load() {
    genBtn.disabled = true; const old = genBtn.textContent; genBtn.textContent = 'Drafting…';
    body.innerHTML = '<div class="brief-placeholder">Compiling approved field data…</div>';
    try {
      const r = await API.brief(kindSel.value);
      currentText = r.text;
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'brief-meta' }, r.title + ' · generated ' + new Date(r.generated_at).toLocaleString()));
      r.text.split('\n').forEach(line => {
        if (!line.trim()) { body.appendChild(h('div', { class: 'brief-gap' })); return; }
        const isHead = /^\d\.\s|REPORT|Project:|Prepared/.test(line);
        const isBullet = /^\s*[•–]/.test(line);
        body.appendChild(h('div', { class: isHead ? 'brief-line brief-head' : isBullet ? 'brief-line brief-bullet' : 'brief-line' }, line.trim()));
      });
      copyBtn.disabled = false; dlBtn.disabled = false;
      UI.toast('Brief drafted from ' + (r.stats ? r.stats.approved : 0) + ' approved update(s).', 'success');
    } catch (e) { body.innerHTML = ''; body.appendChild(h('div', { class: 'brief-placeholder' }, 'Could not generate brief: ' + e.message)); }
    genBtn.disabled = false; genBtn.textContent = old;
  }

  function copyText() {
    if (!currentText) return;
    (navigator.clipboard ? navigator.clipboard.writeText(currentText) : Promise.reject())
      .then(() => UI.toast('Brief copied to clipboard.', 'success'))
      .catch(() => { const ta = document.createElement('textarea'); ta.value = currentText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); UI.toast('Brief copied.', 'success'); });
  }
  function download() {
    if (!currentText) return;
    const blob = new Blob([currentText], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'BuildNova-' + (kindSel.value === 'daily' ? 'DPR' : 'WPR') + '-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
  }
};
})();
