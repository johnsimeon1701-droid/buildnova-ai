(() => {
/* BuildNova AI — Pages: Dashboard, Schedule Explorer, Activity Drawer, Field Reports */
const PAGES = window.PAGES || {};
window.PAGES = PAGES;

const { h } = UI;

/* ============================ ACTIVITY DRAWER ============================ */
function openActivityDrawer(activityId, ctx) {
  const data = ctx.data;
  const act = data.activities.find(a => a.activity_id === activityId);
  if (!act) return;
  const byId = id => data.activities.find(a => a.activity_id === id);

  const back = h('div', { class: 'drawer-back open', id: 'drawer-back-x' });
  const drawer = h('div', { class: 'drawer open' });

  function close() { back.remove(); drawer.remove(); }
  back.addEventListener('click', close);

  const kv = (k, v) => h('div', { class: 'kv' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v == null || v === '' || v === '—' ? h('span', { class: 'muted' }, '—') : v));

  const depNode = (a, cls, tag) => h('div', { style: 'display:flex;flex-direction:column;align-items:flex-start;gap:2px' },
    tag ? h('div', { style: 'font-size:10px;color:#94a3b8;font-weight:700;margin-left:14px;text-transform:uppercase;letter-spacing:.06px' }, tag) : null,
    h('div', { class: 'dep-node ' + cls, style: 'cursor:pointer', onclick: () => { close(); setTimeout(() => openActivityDrawer(a.activity_id, ctx), 120); } },
      h('span', { class: 'mono', style: 'font-size:11.5px' }, a.activity_id),
      h('span', {}, a.activity_name.length > 34 ? a.activity_name.slice(0, 32) + '…' : a.activity_name),
      a.downstream_watch ? h('span', { class: 'badge b-amber', style: 'font-size:10px' }, 'watch') : null));

  const chain = h('div', { class: 'dep-chain' });
  (act.predecessors || []).slice(0, 4).forEach(pid => {
    const a = byId(pid);
    if (!a) return;
    chain.appendChild(depNode(a, '', 'predecessor ↑'));
    chain.appendChild(h('div', { class: 'dep-arrow' }, '↓'));
  });
  chain.appendChild(depNode(act, 'current', '★ THIS ACTIVITY'));
  (act.successors || []).slice(0, 4).forEach(sid => {
    const a = byId(sid);
    if (!a) return;
    chain.appendChild(h('div', { class: 'dep-arrow' }, '↓'));
    chain.appendChild(depNode(a, a.downstream_watch ? 'watch' : '', 'successor ↓'));
  });

  // evidence
  const evReports = data.reports.filter(r => (act.evidence_reports || []).includes(r.report_id) || r.linked_activity === act.activity_id);
  const evidence = evReports.length ? evReports.map(r => h('div', { class: 'evidence-item' },
    h('div', { class: 'ei-meta' }, `${r.report_id} · ${UI.FMT.date(r.report_date)} · ${r.submitted_by}`),
    h('div', { style: 'font-style:italic' }, '"' + (r.extraction && r.extraction.event === 'start' && r.extraction.evidence && r.extraction.evidence.event ? r.extraction.evidence.event : r.raw_text.replace(/\n/g, ' ').slice(0, 130)) + '"')))
    : [UI.empty('📄', 'No field evidence yet', 'No approved field reports are linked to this activity. Evidence appears once a supervisor report is processed and approved.')];

  // AI block
  const linkedMatch = evReports.map(r => r.match).find(m => m);
  const aiBlock = h('div', {},
    h('div', { class: 'kv-grid' },
      kv('Match Confidence', act.match_confidence ? UI.confBadge(act.match_confidence) : h('span', { class: 'muted' }, 'No AI match yet')),
      kv('Extraction', linkedMatch ? h('span', {}, 'via ', h('span', { class: 'mono' }, linkedMatch.report_id || '')) : h('span', { class: 'muted' }, '—'))),
    linkedMatch && linkedMatch.scores ? h('div', { class: 'mt8' }, ...Object.entries(linkedMatch.scores).map(([k, v]) => {
      const max = { identifier: 30, semantic: 25, keyword: 20, discipline: 10, location: 10, wbs: 5 }[k] || 10;
      return h('div', { class: 'signal-row' },
        h('span', { class: 'sn', style: 'text-transform:capitalize' }, k),
        h('div', { class: 'signal-track' }, h('div', { class: 'signal-fill' + (v === 0 ? ' miss' : ''), style: `width:${(v / max) * 100}%` })),
        h('span', { class: 'sv' }, `${v}/${max}`));
    })) : null,
    h('div', { class: 'ai-note mt8' }, linkedMatch
      ? h('span', {}, 'AI linked this activity because: ', h('b', {}, Object.values(linkedMatch.signals || {}).filter(Boolean).slice(0, 3).join(' · ')))
      : h('span', {}, 'No AI matching has linked a field event to this schedule activity yet. Once a supervisor report is processed and approved by the planner, the evidence trail appears here.')));

  drawer.appendChild(h('div', { class: 'drawer-h' },
    h('div', { class: 'brand-mark', style: 'width:34px;height:34px' }, '🗓'),
    h('div', {}, h('div', { class: 'mono', style: 'font-size:11.5px;color:#7dd3fc;font-weight:700' }, act.activity_id),
      h('h3', {}, act.activity_name)),
    UI.statusBadge(act.status),
    h('button', { class: 'dx', onclick: close }, '✕')));

  const body = h('div', { class: 'drawer-b' });
  body.appendChild(h('div', { class: 'detail-section' },
    h('h4', {}, '📋 Basic Information'),
    h('div', { class: 'kv-grid' },
      kv('Activity ID', h('span', { class: 'mono' }, act.activity_id)),
      kv('Schedule Level', h('span', {}, 'L' + act.level, ' ', h('span', { class: 'muted', 'data-tip': 'L5/L6 activities are executable schedule-level activities used to represent detailed project work.' }, 'ⓘ'))),
      kv('Discipline', act.discipline), kv('WBS', h('span', { class: 'mono' }, act.wbs)),
      kv('Location', act.location), act.tag ? kv('Equipment / Line Tag', h('span', { class: 'mono' }, act.tag)) : null,
      act.planned_qty ? kv('Planned Quantity', `${act.planned_qty} ${act.unit || ''}`) : null)));

  const startVar = act.start_variance || 0, finVar = act.finish_variance || 0;
  body.appendChild(h('div', { class: 'detail-section' },
    h('h4', {}, '📅 Schedule & Progress'),
    h('div', { class: 'kv-grid' },
      kv('Planned Start', UI.FMT.date(act.planned_start)), kv('Planned Finish', UI.FMT.date(act.planned_finish)),
      kv('Actual Start', UI.FMT.dt(act.actual_start)), kv('Actual Finish', UI.FMT.dt(act.actual_finish)),
      kv('Progress', h('div', { class: 'flex' }, UI.progressBar(act.progress, act.status), h('b', {}, act.progress + '%'))),
      kv('Start Variance', h('span', { class: 'badge ' + (startVar > 0 ? 'b-red' : 'b-gray'), 'data-tip': 'Schedule Variance is the difference between actual and planned dates. Positive (+) means late.' }, startVar > 0 ? `+${startVar} days late` : 'On baseline')),
      kv('Finish Variance', finVar > 0 ? h('span', { class: 'badge b-red' }, `+${finVar} days late`) : h('span', { class: 'badge b-gray' }, 'On baseline')),
      kv('Risk', UI.riskBadge(act.risk_level)))));

  body.appendChild(h('div', { class: 'detail-section' }, h('h4', {}, '🔗 Dependency Chain'), chain));
  body.appendChild(h('div', { class: 'detail-section' }, h('h4', {}, '📎 Field Evidence & Traceability'), ...evidence));
  body.appendChild(h('div', { class: 'detail-section' }, h('h4', {}, '🤖 AI Match Information'), aiBlock));

  drawer.appendChild(body);
  document.getElementById('app').appendChild(back);
  document.getElementById('app').appendChild(drawer);
}
window.openActivity = openActivityDrawer;

/* ============================== DASHBOARD ============================== */
PAGES['#/dashboard'] = (root, ctx) => {
  const { data } = ctx;
  const a = data.analytics;

  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Project Command Center'),
      h('div', { class: 'ph-sub' }, 'Real-time visibility from field execution to schedule intelligence · ', h('b', {}, data.project.name))),
    h('div', { class: 'ph-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { App.refresh(); UI.toast('Dashboard refreshed from live data.', 'success', 1600); } }, '↻ Refresh'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => API.exportCsv('progress.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Progress Report'))));

  root.appendChild(h('div', { class: 'problem-strip' },
    h('div', {}, h('div', { class: 'tagline' }, 'The problem'), h('div', {}, 'Field reports, diaries and supervisor updates arrive as ', h('b', {}, 'free text — disconnected '), 'from L1–L6 schedules in P6 / MSP / Excel.')),
    h('div', { class: 'arrow-hr' }, '➜'),
    h('div', {}, h('div', { class: 'tagline' }, 'BuildNova AI'), h('div', {}, 'Every field update is ', h('b', {}, 'extracted, matched to L5/L6 activities, confidence-scored and approved '), 'before touching the baseline. One connected source of truth.'))));

  const kpiDefs = [
    { l: 'Total Activities', v: a.kpis.total, icon: '🗂', cls: '' },
    { l: 'Completed', v: a.kpis.completed, icon: '✅', cls: 'k-green' },
    { l: 'In Progress', v: a.kpis.in_progress, icon: '🔧', cls: 'k-blue' },
    { l: 'Delayed', v: a.kpis.delayed, icon: '⏱', icon2: '', cls: 'k-red' },
    { l: 'At Risk', v: a.kpis.at_risk, icon: '⚠', cls: 'k-amber' },
    { l: 'Overall Progress', v: a.kpis.overall_progress + '%', icon: '📈', cls: 'k-accent' },
    { l: 'Schedule Variance', v: '+' + a.kpis.schedule_variance + 'd', icon: '📉', cls: a.kpis.schedule_variance > 2 ? 'k-red' : 'k-amber', tip: 'Average variance across late activities. Positive = behind baseline.' },
    { l: 'Reports Processed', v: a.kpis.reports_processed + '/' + a.kpis.reports_total, icon: '📋', cls: 'k-violet' },
  ];
  const kpiGrid = h('div', { class: 'kpi-grid' });
  kpiDefs.forEach((k, i) => kpiGrid.appendChild(h('div', { class: 'kpi ' + k.cls + ' kpi-animate', style: `animation-delay:${i * 45}ms`, 'data-tip': k.tip || '' },
    h('div', { class: 'kl' }, h('span', {}, k.icon), k.l),
    h('div', { class: 'kv' }, k.v),
    h('div', { class: 'kbar', style: `width:${Math.min(100, 20 + i * 9)}%;background:${k.cls === 'k-accent' ? '#f59e0b' : ''}` }))));
  root.appendChild(kpiGrid);

  // Charts row 1
  const r1 = h('div', { class: 'grid-21' });
  const curveCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, 'Planned vs Actual Progress'), h('span', { class: 'ch-sub' }, 'Cumulative % across project timeline')),
    h('div', { class: 'card-b' }, h('div', { id: 'chart-scurve' })));
  const statusCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, 'Activity Status')),
    h('div', { class: 'card-b' }, h('div', { id: 'chart-status' })));
  r1.appendChild(curveCard); r1.appendChild(statusCard);
  root.appendChild(r1);

  const r2 = h('div', { class: 'grid-3' });
  r2.appendChild(h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, 'Discipline Progress')),
    h('div', { class: 'card-b' }, h('div', { id: 'chart-disc' }))));
  r2.appendChild(h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, 'Risk Distribution'), h('span', { class: 'ch-sub' }, 'Risk Score 0–100')),
    h('div', { class: 'card-b' }, h('div', { id: 'chart-risk' }))));
  r2.appendChild(h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, 'Delay Reasons'), h('span', { class: 'ch-sub' }, 'From field reports & schedule flags')),
    h('div', { class: 'card-b' }, h('div', { id: 'chart-delay' }))));
  root.appendChild(r2);

  // Variance table
  const vCard = h('div', { class: 'card' });
  vCard.appendChild(h('div', { class: 'card-h' }, h('h3', {}, 'Schedule Variance — Activities with Actuals'),
    h('div', { class: 'ch-actions' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { location.hash = '#/schedule'; } }, 'Open Schedule Explorer →'))));
  const vt = h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, h('th', { class: 'no-sort' }, 'Activity ID'), h('th', { class: 'no-sort' }, 'Activity'), h('th', { class: 'no-sort' }, 'Planned Start'), h('th', { class: 'no-sort' }, 'Actual Start'), h('th', { class: 'no-sort' }, 'Variance'), h('th', { class: 'no-sort' }, 'Status'))),
    h('tbody', {}, a.varianceTable.slice(0, 8).map(v => h('tr', { onclick: () => openActivityDrawer(v.activity_id, ctx) },
      h('td', { class: 'mono' }, v.activity_id), h('td', {}, v.activity_name),
      h('td', {}, UI.FMT.date(v.planned_start)), h('td', {}, UI.FMT.dt(v.actual_start)),
      h('td', {}, h('span', { class: 'badge ' + (v.variance > 0 ? 'b-red' : 'b-green') }, v.variance > 0 ? `+${v.variance}d` : 'on time')),
      h('td', {}, UI.statusBadge(v.status))))));
  vCard.appendChild(h('div', { class: 'table-wrap' }, vt));
  root.appendChild(vCard);

  // AI pipeline
  const steps = ['Field Report', 'AI Extraction', 'L5/L6 Matching', 'Confidence', 'Planner Approval', 'Schedule Update', 'Risk Intelligence'];
  const pipeKids = [];
  steps.forEach((s, i) => {
    pipeKids.push(h('div', { class: 'arch-node core', style: 'flex:1;min-width:120px' }, s));
    if (i < steps.length - 1) pipeKids.push(h('span', { style: 'color:#0891b2;font-weight:700' }, '→'));
  });
  const pipe = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '🤖 BuildNova AI Pipeline'), h('span', { class: 'ch-sub' }, 'AI recommends. Planner approves.')),
    h('div', { class: 'card-b' }, h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' }, pipeKids)));
  root.appendChild(pipe);

  setTimeout(() => {
    Charts.sCurve(document.getElementById('chart-scurve'), a.sCurve);
    Charts.donut(document.getElementById('chart-status'), [
      { label: 'Not Started', value: a.byStatus['Not Started'], color: '#94a3b8' },
      { label: 'In Progress', value: a.byStatus['In Progress'], color: '#2563eb' },
      { label: 'Completed', value: a.byStatus['Completed'], color: '#16a34a' },
      { label: 'Delayed', value: a.byStatus['Delayed'], color: '#dc2626' },
      { label: 'At Risk', value: a.byStatus['At Risk'], color: '#d97706' },
    ], { centerLabel: 'activities' });
    Charts.hBars(document.getElementById('chart-disc'), a.disciplineProgress);
    Charts.donut(document.getElementById('chart-risk'), [
      { label: 'Low', value: a.riskDist.Low, color: '#16a34a' },
      { label: 'Medium', value: a.riskDist.Medium, color: '#d97706' },
      { label: 'High', value: a.riskDist.High, color: '#dc2626' },
      { label: 'Critical', value: a.riskDist.Critical, color: '#7f1d1d' },
    ], { centerLabel: 'scored' });
    const dc = { Material: '#0891b2', Manpower: '#7c3aed', Equipment: '#2563eb', Weather: '#0d9488', Safety: '#dc2626', Design: '#d97706', Access: '#64748b', Other: '#94a3b8' };
    Charts.vBars(document.getElementById('chart-delay'), Object.entries(a.delayReasons).map(([k, v]) => ({ label: k, value: v, color: dc[k] })));
  }, 30);
};

/* =========================== SCHEDULE EXPLORER =========================== */
PAGES['#/schedule'] = (root, ctx) => {
  const { data, role } = ctx;
  const ui = { q: '', disc: '', status: '', loc: '', wbs: '', delayedOnly: false, riskOnly: false, sort: 'activity_id', dir: 1, page: 0, per: 12 };

  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Schedule Explorer'), h('div', { class: 'ph-sub' }, data.activities.length + ' L5/L6 activities · baseline dates are never overwritten · click any row for details, dependencies & AI evidence'))));

  const filterBar = h('div', { class: 'filter-bar' });
  const search = h('input', { type: 'search', placeholder: 'Search ID, name, tag, WBS…' });
  const discSel = h('select', {}, h('option', { value: '' }, 'All disciplines'), ...['Civil', 'Piping', 'Mechanical', 'Electrical', 'Instrumentation', 'HSE'].map(d => h('option', { value: d }, d)));
  const statSel = h('select', {}, h('option', { value: '' }, 'All statuses'), ...['Not Started', 'In Progress', 'Completed', 'Delayed', 'At Risk'].map(s => h('option', { value: s }, s)));
  const locSel = h('select', {}, h('option', { value: '' }, 'All locations'), ...[...new Set(data.activities.map(a => a.location))].sort().map(l => h('option', { value: l }, l)));
  const wbsSel = h('select', {}, h('option', { value: '' }, 'All WBS'), ...[...new Set(data.activities.map(a => a.wbs.split('.')[0]))].sort().map(w => h('option', { value: w }, w)));
  const delChk = h('label', { class: 'chk' }, h('input', { type: 'checkbox' }), 'Delayed only');
  const riskChk = h('label', { class: 'chk' }, h('input', { type: 'checkbox' }), 'At risk only');
  const resetBtn = h('button', { class: 'btn btn-ghost btn-sm' }, 'Reset');
  filterBar.append(search, discSel, statSel, locSel, wbsSel, delChk, riskChk, resetBtn);
  root.appendChild(filterBar);

  const card = h('div', { class: 'card' });
  const tableWrap = h('div', { class: 'table-wrap' });
  const pagerMount = h('div', {});
  card.appendChild(tableWrap); card.appendChild(pagerMount);
  root.appendChild(card);

  function atRisk(a) { return a.status !== 'Completed' && a.status !== 'Delayed' && (a.risk_score >= 50 || a.downstream_watch); }

  function render() {
    let rows = data.activities.slice();
    if (ui.q) { const q = ui.q.toLowerCase(); rows = rows.filter(a => `${a.activity_id} ${a.activity_name} ${a.wbs} ${a.tag || ''} ${a.location}`.toLowerCase().includes(q)); }
    if (ui.disc) rows = rows.filter(a => a.discipline === ui.disc);
    if (ui.loc) rows = rows.filter(a => a.location === ui.loc);
    if (ui.wbs) rows = rows.filter(a => a.wbs.startsWith(ui.wbs));
    if (ui.status) rows = rows.filter(a => (ui.status === 'At Risk' ? atRisk(a) : (ui.status === 'Delayed' ? a.status === 'Delayed' : a.status === ui.status)));
    if (ui.delayedOnly) rows = rows.filter(a => a.status === 'Delayed');
    if (ui.riskOnly) rows = rows.filter(a => atRisk(a));
    rows.sort((x, y) => {
      let vx = x[ui.sort], vy = y[ui.sort];
      if (typeof vx === 'string') return ui.dir * vx.localeCompare(vy);
      return ui.dir * ((vx || 0) - (vy || 0));
    });

    const cols = [
      ['activity_id', 'Activity ID'], ['activity_name', 'Activity'], ['wbs', 'WBS'], ['level', 'Lvl'],
      ['discipline', 'Disc'], ['location', 'Location'], ['planned_start', 'Plan Start'], ['planned_finish', 'Plan Finish'],
      ['actual_start', 'Actual Start'], ['actual_finish', 'Actual Finish'], ['progress', 'Progress'], ['status', 'Status'],
      ['variance', 'Variance'], ['risk_level', 'Risk'], ['conf', 'AI Conf'],
    ];
    const table = h('table', { class: 'data' });
    const headRow = h('tr', {});
    cols.forEach(([k, l]) => {
      headRow.appendChild(h('th', { onclick: () => { if (ui.sort === k) ui.dir *= -1; else { ui.sort = k; ui.dir = 1; } render(); } },
        l, ' ', h('span', { class: 'sort-ico' }, ui.sort === k ? (ui.dir === 1 ? '▲' : '▼') : '↕')));
    });
    table.appendChild(h('thead', {}, headRow));
    const start = ui.page * ui.per;
    const pageRows = rows.slice(start, start + ui.per);
    const tbody = h('tbody', {});
    pageRows.forEach(a => {
      const varMax = Math.max(a.start_variance || 0, a.finish_variance || 0);
      tbody.appendChild(h('tr', { onclick: () => openActivityDrawer(a.activity_id, ctx) },
        h('td', { class: 'mono' }, a.activity_id),
        h('td', { style: 'min-width:200px;font-weight:600' }, a.activity_name, a.tag ? h('div', { class: 'mono muted', style: 'font-size:11px' }, a.tag) : null),
        h('td', { class: 'mono', style: 'font-size:11.5px' }, a.wbs), h('td', {}, 'L' + a.level),
        h('td', {}, h('span', { class: 'badge b-teal' }, a.discipline)),
        h('td', { style: 'font-size:12px' }, a.location),
        h('td', {}, UI.FMT.date(a.planned_start)), h('td', {}, UI.FMT.date(a.planned_finish)),
        h('td', {}, UI.FMT.dt(a.actual_start)), h('td', {}, UI.FMT.dt(a.actual_finish)),
        h('td', { style: 'white-space:nowrap' }, UI.progressBar(a.progress, a.status), h('span', { style: 'margin-left:7px;font-weight:700;font-size:12px' }, a.progress + '%')),
        h('td', {}, atRisk(a) ? UI.statusBadge('At Risk') : UI.statusBadge(a.status)),
        h('td', {}, varMax > 0 ? h('span', { class: 'badge b-red' }, '+' + varMax + 'd') : h('span', { class: 'muted' }, '0d')),
        h('td', {}, UI.riskBadge(a.risk_level)),
        h('td', {}, a.match_confidence ? UI.confBadge(a.match_confidence) : h('span', { class: 'muted' }, '—'))));
    });
    table.appendChild(tbody);
    tableWrap.innerHTML = '';
    if (!pageRows.length) tableWrap.appendChild(UI.empty('🔍', 'No activities match', 'Try clearing filters or adjusting the search.'));
    else tableWrap.appendChild(table);
    pagerMount.innerHTML = '';
    pagerMount.appendChild(UI.pager(rows.length, ui.page, ui.per, p => { ui.page = p; render(); }));
  }

  search.addEventListener('input', () => { ui.q = search.value; ui.page = 0; render(); });
  discSel.addEventListener('change', () => { ui.disc = discSel.value; render(); });
  statSel.addEventListener('change', () => { ui.status = statSel.value; render(); });
  locSel.addEventListener('change', () => { ui.loc = locSel.value; render(); });
  wbsSel.addEventListener('change', () => { ui.wbs = wbsSel.value; render(); });
  delChk.querySelector('input').addEventListener('change', e => { ui.delayedOnly = e.target.checked; render(); });
  riskChk.querySelector('input').addEventListener('change', e => { ui.riskOnly = e.target.checked; render(); });
  resetBtn.addEventListener('click', () => { search.value = ''; discSel.value = ''; statSel.value = ''; locSel.value = ''; wbsSel.value = ''; delChk.querySelector('input').checked = false; riskChk.querySelector('input').checked = false; Object.assign(ui, { q: '', disc: '', status: '', loc: '', wbs: '', delayedOnly: false, riskOnly: false, page: 0 }); render(); });
  render();
};

/* ============================= FIELD REPORTS ============================= */
const DEMO_REPORT_TEXT = '05-Sep-2026\nPiping – Pipe Rack B\nP102 spool erection started at 8:45 AM. Four spools were erected today. Work was delayed because material arrived late.';

PAGES['#/reports'] = (root, ctx) => {
  const { data, refresh, role } = ctx;
  const canSubmit = ['Supervisor', 'Planner'].includes(role);

  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Field Reports'), h('div', { class: 'ph-sub' }, 'Submit site updates as free text or upload. Processing extracts events and matches them to L5/L6 activities.'))));

  /* ---- Form ---- */
  const formCard = h('div', { class: 'card' });
  const dateInp = h('input', { type: 'text', value: '05-Sep-2026', placeholder: 'DD-Mon-YYYY' });
  const byInp = h('input', { type: 'text', value: (API.session && API.session.name) || 'Supervisor', placeholder: 'Submitted by' });
  const discInp = h('select', {}, h('option', { value: '' }, '— select discipline —'), ...['Civil', 'Piping', 'Mechanical', 'Electrical', 'Instrumentation', 'HSE'].map(d => h('option', { value: d }, d)));
  const locInp = h('input', { type: 'text', placeholder: 'e.g. Pipe Rack B' });
  const txtInp = h('textarea', { rows: 7, placeholder: 'Paste or type the site report / diary entry here…', style: 'width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-family:inherit;font-size:13.5px;resize:vertical' });
  const fileInp = h('input', { type: 'file', accept: '.txt,.csv,.xlsx,.pdf', style: 'font-size:12.5px' });
  const statusLine = h('div', { class: 'muted', style: 'font-size:12.5px' });

  formCard.appendChild(h('div', { class: 'card-h' }, h('h3', {}, '📝 New Field Report'),
    h('div', { class: 'ch-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { txtInp.value = DEMO_REPORT_TEXT; dateInp.value = '05-Sep-2026'; discInp.value = 'Piping'; locInp.value = 'Pipe Rack B'; UI.toast('P102 demo report loaded — click PROCESS WITH AI.', 'info'); } }, '⚡ Fill P102 demo report'))));
  formCard.appendChild(h('div', { class: 'card-b' },
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, UI.fieldLabel('Report Date'), dateInp),
      h('div', { class: 'field' }, UI.fieldLabel('Submitted By'), byInp),
      h('div', { class: 'field' }, UI.fieldLabel('Discipline'), discInp),
      h('div', { class: 'field' }, UI.fieldLabel('Location'), locInp)),
    h('div', { class: 'field' }, UI.fieldLabel('Free-text Report', 'Daily progress report, site diary entry, discipline update or supervisor note — write naturally.'), txtInp),
    h('div', { class: 'field' }, UI.fieldLabel('Attachment (optional)', 'TXT and CSV are parsed directly. XLSX/PDF: use paste-text fallback.'), fileInp, statusLine),
    h('div', { class: 'flex', style: 'justify-content:space-between;flex-wrap:wrap' },
      h('div', { class: 'muted', style: 'font-size:12px' }, 'Supported: TXT, CSV (columns: Date, Submitted By, Discipline, Location, Text). XLSX/PDF → paste text.'),
      h('button', {
        class: 'btn btn-primary', id: 'process-btn',
        onclick: async e => {
          const text = txtInp.value.trim();
          if (text.length < 10) { UI.toast('Please enter the report text (minimum 10 characters).', 'warning'); txtInp.focus(); return; }
          if (!dateInp.value.trim()) { UI.toast('Report date is required (DD-Mon-YYYY).', 'warning'); return; }
          const btn = e.target; btn.disabled = true;
          try {
            const sub = await API.submitReport({ raw_text: text, report_date: dateInp.value.trim(), submitted_by: byInp.value || API.session.name, discipline: discInp.value || null, location: locInp.value || null });
            if (sub.duplicate_warning) UI.toast(sub.duplicate_warning, 'warning');
            UI.toast('Report ' + sub.report.report_id + ' submitted. Running AI extraction…', 'success');
            txtInp.value = ''; fileInp.value = '';
            await runProcessing(sub.report.report_id, ctx);
          } catch (err) { UI.toast(err.message, 'error'); btn.disabled = false; }
        }
      }, '🤖 PROCESS WITH AI'))));
  root.appendChild(formCard);

  fileInp.addEventListener('change', async () => {
    const f = fileInp.files[0]; if (!f) return;
    if (/\.(xlsx|pdf)$/i.test(f.name)) {
      statusLine.textContent = '⚠ ' + f.name + ': XLSX/PDF parsing is not available in this prototype — please paste the text below.';
      UI.toast('XLSX/PDF not parsed in prototype — paste the report text instead.', 'warning');
      return;
    }
    try {
      const content = await f.text();
      if (/\.csv$/i.test(f.name)) {
        const r = await API.uploadFile({ filename: f.name, content });
        UI.toast(r.message || 'CSV imported', 'success'); await refresh();
      } else {
        txtInp.value = content; statusLine.textContent = 'Loaded ' + f.name + ' — review and click PROCESS WITH AI.';
      }
    } catch (e) { statusLine.textContent = '⚠ ' + e.message; UI.toast(e.message, 'error'); }
  });

  /* ---- Reports list ---- */
  const listCard = h('div', { class: 'card' });
  const listFilter = h('input', { type: 'search', placeholder: 'Search reports…', style: 'padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;min-width:240px' });
  const statFilter = h('select', {}, ['All statuses', 'submitted', 'pending_review', 'approved', 'rejected'].map(s => h('option', { value: s === 'All statuses' ? '' : s }, s)));
  listCard.appendChild(h('div', { class: 'card-h' }, h('h3', {}, '📚 Report Queue'), h('div', { class: 'ch-actions' }, listFilter, statFilter)));
  const listMount = h('div', { class: 'card-b', style: 'padding-top:8px' });
  listCard.appendChild(listMount);
  root.appendChild(listCard);

  const STATUS_LABEL = { submitted: ['Submitted — awaiting AI', 'b-gray'], pending_review: ['AI processed — awaiting planner', 'b-amber'], approved: ['Approved — schedule updated', 'b-green'], rejected: ['Rejected', 'b-red'] };
  function renderList() {
    const q = listFilter.value.toLowerCase(); const sf = statFilter.value;
    const rows = data.reports.filter(r => (!sf || r.processing_status === sf) &&
      (!q || `${r.report_id} ${r.raw_text} ${r.submitted_by} ${r.discipline || ''}`.toLowerCase().includes(q)));
    listMount.innerHTML = '';
    if (!rows.length) { listMount.appendChild(UI.empty('📭', 'No field reports yet', 'Submit the P102 demo report in the form above to start the pipeline.')); return; }
    const tbl = h('table', { class: 'data' });
    const thRow = h('tr', {});
    ['Report', 'Date', 'By', 'Discipline', 'Location', 'Status', 'Match', ''].forEach(x => thRow.appendChild(h('th', { class: 'no-sort' }, x)));
    tbl.appendChild(h('thead', {}, thRow));
    const tbody = h('tbody', {});
    rows.forEach(r => {
      const lastCell = r.processing_status === 'submitted'
        ? h('button', { class: 'btn btn-primary btn-sm', onclick: e => { e.stopPropagation(); runProcessing(r.report_id, ctx); } }, 'Process')
        : r.processing_status === 'pending_review'
          ? h('span', { class: 'badge b-teal' }, 'In Review →')
          : h('span', { class: 'muted' }, r.linked_activity || '');
      const stLbl = STATUS_LABEL[r.processing_status] || [r.processing_status, 'b-gray'];
      const tr = h('tr', { onclick: () => openReportDrawer(r.report_id, ctx) },
        h('td', { class: 'mono' }, r.report_id, r.duplicate_of ? h('span', { class: 'badge b-amber', style: 'margin-left:6px;font-size:10px' }, 'dup?') : null),
        h('td', {}, UI.FMT.date(r.report_date)),
        h('td', {}, r.submitted_by),
        h('td', {}, r.discipline || '—'),
        h('td', {}, r.location || '—'),
        h('td', {}, h('span', { class: 'badge ' + stLbl[1] }, stLbl[0])),
        h('td', {}, r.match && r.match.total_confidence ? UI.confBadge(r.match.total_confidence, r.match.status) : h('span', { class: 'muted' }, '—')),
        h('td', {}, lastCell));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    listMount.appendChild(h('div', { class: 'table-wrap' }, tbl));
  }
  listFilter.addEventListener('input', renderList);
  statFilter.addEventListener('change', renderList);
  renderList();

  // demo autofill
  if (window.__demoFill) { window.__demoFill = false; txtInp.value = DEMO_REPORT_TEXT; dateInp.value = '05-Sep-2026'; discInp.value = 'Piping'; locInp.value = 'Pipe Rack B'; txtInp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
};

/* -------------------- Processing stepper + results -------------------- */
async function runProcessing(reportId, ctx) {
  const steps = ['Reading field report', 'Extracting execution events', 'Identifying activity', 'Searching schedule (L5/L6)', 'Calculating match confidence', 'Detecting delay & risk', 'Preparing planner review'];
  let closed = false;
  const stepList = h('div', { class: 'stepper' }, steps.map((s, i) => h('div', { class: 'st', 'data-i': i }, h('div', { class: 'sd' }, i + 1), h('span', {}, s))));
  const m = UI.modal({
    title: '🤖 AI Processing Pipeline',
    body: h('div', {}, h('p', { class: 'muted mb8', style: 'font-size:13px' }, 'Deterministic extraction + hybrid matching engine — every value keeps its source evidence.'), stepList),
  });
  const setStep = i => [...stepList.children].forEach((el, j) => { el.classList.remove('active', 'done'); if (j < i) el.classList.add('done'); else if (j === i) el.classList.add('active'); });
  for (let i = 0; i < steps.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 340)); }
  try {
    const res = await API.processReport(reportId);
    setStep(steps.length);
    await new Promise(r => setTimeout(r, 350));
    if (!closed) m.close();
    await ctx.refresh(true);
    showProcessingResult(res.report, ctx);
  } catch (e) {
    if (!closed) m.close();
    const msg = String(e.message || '');
    const network = /interrupted|530|502|503|504|52[0-4]|network|failed to fetch|connection/i.test(msg);
    if (network) {
      UI.toast('Connection briefly interrupted while processing (' + msg + '). Please click PROCESS WITH AI again — your report is saved.', 'error', 8000);
    } else {
      UI.toast('AI extraction could not confidently identify the activity. Please review manually. (' + msg + ')', 'error', 6000);
    }
  }
}

function extCard(label, value, evidence, icon) {
  const miss = value == null || value === '' || value === false;
  return h('div', { class: 'ext-card' + (miss ? ' miss' : '') },
    h('div', { class: 'el' }, icon || '•', label),
    h('div', { class: 'ev' + (miss ? ' unknown' : '') }, miss ? 'Not identified' : value),
    evidence ? h('div', { class: 'ee' }, '“' + evidence + '”') : (miss ? h('div', { class: 'ee' }, 'No evidence for this field in the report') : null));
}

function showProcessingResult(report, ctx) {
  const ext = report.extraction;
  const match = report.match;
  const band = UI.confBadge(match.total_confidence, match.status);
  const body = h('div', {},
    h('div', { class: 'ai-note mb16' },
      match.status === 'unmatched'
        ? h('span', {}, h('b', {}, 'No reliable L5/L6 match found. '), 'Unidentified tag(s): ', h('b', {}, (match.unknown_identifiers || []).join(', ') || '—'), '. This will not modify the schedule — the planner must select an activity manually or mark it as a potential new activity.')
        : match.status === 'ambiguous'
          ? h('span', {}, h('b', {}, 'Multiple plausible activities found. '), 'Planner verification required before any schedule change.')
          : h('span', {}, h('b', {}, 'Recommended: '), match.activity_id, ' — ', match.activity_name, ' with ', h('b', {}, match.total_confidence + '% match confidence.'))),
    h('div', { class: 'ext-grid' },
      extCard('Activity Identifier', ext.activity_identifier, ext.evidence.identifier, '🏷'),
      extCard('Activity / Event', ext.activity_description, ext.evidence.event, '🛠'),
      extCard('Discipline', ext.discipline, ext.evidence.discipline, '🏗'),
      extCard('Location', ext.location, ext.evidence.location, '📍'),
      extCard('Actual Start', ext.actual_start ? UI.FMT.dt(ext.actual_start) : null, ext.evidence.date, '🚦'),
      extCard('Actual Finish', ext.actual_finish ? UI.FMT.dt(ext.actual_finish) : null, null, '🏁'),
      extCard('Time', ext.event_time ? ext.event_time : (ext.event ? 'Not mentioned — left unknown' : null), ext.event_time ? null : (ext.event ? 'No explicit time in report' : null), '🕐'),
      extCard('Quantity', ext.quantity ? `${ext.quantity} ${ext.unit || ''}` : null, ext.evidence.quantity, '🔢'),
      extCard('Delay Reason', ext.delay_reason, ext.delay_evidence, '⚠'),
      extCard('Manpower', ext.manpower ? `${ext.manpower.count} ${ext.manpower.type}s` : null, ext.manpower ? ext.manpower.evidence : null, '👷'),
      extCard('Equipment', ext.equipment ? ext.equipment.items.join(', ') : null, ext.equipment ? ext.equipment.evidence : null, '🚜'),
      extCard('Safety', ext.safety ? ext.safety.issue : null, ext.safety ? ext.safety.evidence : null, '🦺')),
    h('div', { class: 'mt16' }, h('div', { class: 'flex mb8' }, h('b', {}, 'Match Confidence: '), band, h('span', { class: 'muted', style: 'font-size:11.5px' }, 'ⓘ combines identifier, semantic, keyword, discipline, location & WBS signals'))));

  if (match.status !== 'unmatched' && match.candidates) {
    body.appendChild(h('div', { class: 'mt16' }, h('b', { style: 'font-size:13px' }, 'Top schedule candidates:'),
      h('div', { class: 'mt8' }, match.candidates.slice(0, 4).map(c => h('div', { class: 'rcand' + (c.activity_id === match.activity_id ? ' picked' : '') },
        h('span', { class: 'radio' }),
        h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:700;font-size:13px' }, h('span', { class: 'mono' }, c.activity_id), ' — ', c.activity_name),
          h('div', { class: 'muted', style: 'font-size:11.5px' }, `${c.discipline} · ${c.location} · ${c.wbs}`)),
        h('b', { style: 'font-size:13px' }, c.total_confidence + '%'))))));
  }

  UI.modal({
    title: `✅ Extraction Complete — ${report.report_id}`,
    wide: true,
    body,
      footer: [
        h('button', { class: 'btn btn-ghost', onclick: () => UI.closeModal() }, 'Close'),
        h('button', { class: 'btn btn-primary', onclick: () => { UI.closeModal(); location.hash = '#/review'; } },
          match.status === 'unmatched' ? 'Open Manual Selection in Review →' : 'Send to Matching Review →'),
      ],
  });
}
window.runProcessing = runProcessing;
window.showProcessingResult = showProcessingResult;
window.extCard = extCard;

/* ----------------------------- Report drawer ----------------------------- */
function openReportDrawer(reportId, ctx) {
  const r = ctx.data.reports.find(x => x.report_id === reportId);
  if (!r) return;
  const back = h('div', { class: 'drawer-back open' });
  const drawer = h('div', { class: 'drawer open' });
  const close = () => { back.remove(); drawer.remove(); };
  back.addEventListener('click', close);

  drawer.appendChild(h('div', { class: 'drawer-h' },
    h('div', { class: 'brand-mark', style: 'width:34px;height:34px' }, '📋'),
    h('div', {}, h('div', { class: 'mono', style: 'font-size:11.5px;color:#7dd3fc;font-weight:700' }, r.report_id),
      h('h3', { style: 'font-size:15px' }, r.discipline || 'General report', r.location ? ' @ ' + r.location : '')),
    h('button', { class: 'dx', onclick: close }, '✕')));
  const body = h('div', { class: 'drawer-b' });
  body.appendChild(h('div', { class: 'detail-section' },
    h('h4', {}, '📝 Original Report'),
    h('div', { class: 'raw-report' }, r.raw_text),
    h('div', { class: 'muted mt8', style: 'font-size:12px' }, `Submitted ${UI.FMT.date(r.report_date)} by ${r.submitted_by}${r.file_name ? ' · source: ' + r.file_name : ''} · status: ${r.processing_status}`)));

  if (r.extraction) {
    const ext = r.extraction;
    body.appendChild(h('div', { class: 'detail-section' }, h('h4', {}, '🤖 AI Extraction'),
      h('div', { class: 'ext-grid', style: 'grid-template-columns:1fr 1fr' },
        extCard('Identifier', ext.activity_identifier, ext.evidence.identifier, '🏷'),
        extCard('Event', ext.event, ext.evidence.event, '🛠'),
        extCard('Actual Start', ext.actual_start ? UI.FMT.dt(ext.actual_start) : null, ext.evidence.date, '🚦'),
        extCard('Actual Finish', ext.actual_finish ? UI.FMT.dt(ext.actual_finish) : null, null, '🏁'),
        extCard('Quantity', ext.quantity ? `${ext.quantity} ${ext.unit || ''}` : null, ext.evidence.quantity, '🔢'),
        extCard('Delay', ext.delay_reason, ext.delay_evidence, '⚠')),
      h('div', { class: 'mt8 muted', style: 'font-size:12.5px' }, 'Extraction confidence: ', UI.confBadge(ext.confidence))));
  }
  if (r.match && r.match.status) {
    body.appendChild(h('div', { class: 'detail-section' }, h('h4', {}, '🎯 Match'),
      r.match.activity_id ? h('div', {}, h('span', { class: 'mono' }, r.match.activity_id), ' — ', h('b', {}, r.match.activity_name || ''), ' ', UI.confBadge(r.match.total_confidence, r.match.status))
        : h('div', { class: 'ai-note' }, 'No reliable L5/L6 match — planner manual selection required.'),
      r.linked_activity ? h('div', { class: 'mt8' }, 'Linked to schedule: ', h('a', { href: '#/schedule', onclick: () => { close(); setTimeout(() => openActivity(r.linked_activity, ctx), 150); } }, r.linked_activity)) : null));
  }

  const actions = h('div', { class: 'review-actions mt16' });
  if (r.processing_status === 'submitted') actions.appendChild(h('button', { class: 'btn btn-primary', onclick: async () => { close(); await runProcessing(r.report_id, ctx); } }, '🤖 Process with AI'));
  if (r.processing_status === 'pending_review') actions.appendChild(h('button', { class: 'btn btn-amber', onclick: () => { close(); location.hash = '#/review'; } }, '✅ Go to Matching Review'));
  if (actions.children.length) body.appendChild(actions);

  drawer.appendChild(body);
  document.getElementById('app').appendChild(back, drawer);
}
window.openReportDrawer = openReportDrawer;
})();
