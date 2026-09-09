// Full audit against the REAL API contract: x-auth-token header, role+email login,
// report_id ids, bootstrap returns {activities,reports,audit,memory,analytics,...},
// match nested at report.match with total_confidence/status/decision.
const BASE = process.env.BASE || 'http://127.0.0.1:4730';
let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-auth-token'] = token;
  try {
    const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) { try { data = await r.json(); } catch (e) {} } else data = await r.text();
    return { status: r.status, data };
  } catch (e) { return { status: 0, data: String(e) }; }
}
const login = (role, email) => call('POST', '/api/auth/login', null, { role, email, password: 'demo' });
const P102 = '05-Sep-2026. Piping - Pipe Rack B. P102 spool erection started at 8:45 AM. Four spools erected today. Work delayed because material arrived late.';

(async () => {
  console.log('--- FULL AUDIT: ' + BASE + ' ---');

  // 1. Health
  let r = await call('GET', '/api/health');
  ok(r.status === 200 && r.data.ok === true, 'health 200');

  // 2. Auth failures
  r = await call('POST', '/api/auth/login', null, { email: 'nobody@x.com', role: 'Planner' });
  ok(r.status === 400, 'unknown email rejected');
  r = await call('GET', '/api/bootstrap');
  ok(r.status === 401, 'bootstrap without token -> 401');

  // 3. Login all roles
  const sup = await login('Supervisor', 'supervisor@buildnova.ai');
  const pla = await login('Planner', 'planner@buildnova.ai');
  const pm  = await login('Project Manager', 'pm@buildnova.ai');
  ok(sup.status === 200 && sup.data.token && sup.data.user.role === 'Supervisor', 'supervisor login');
  ok(pla.status === 200 && pla.data.token && pla.data.user.role === 'Planner', 'planner login');
  ok(pm.status === 200 && pm.data.token && pm.data.user.role === 'Project Manager', 'pm login');
  const ST = sup.data.token, PT = pla.data.token, MT = pm.data.token;

  // 4. Demo reset role gating
  r = await call('POST', '/api/demo/reset', ST, {});
  ok(r.status === 403, 'supervisor cannot reset demo');
  r = await call('POST', '/api/demo/reset', PT, {});
  ok(r.status === 200, 'planner resets demo');

  // 5. Bootstrap shape + seed data
  r = await call('GET', '/api/bootstrap', PT);
  ok(r.status === 200, 'planner bootstrap 200');
  const b = r.data;
  ok(Array.isArray(b.activities) && b.activities.length > 50, 'bootstrap has activities (' + (b.activities && b.activities.length) + ')');
  ok(Array.isArray(b.reports), 'bootstrap has reports');
  ok(Array.isArray(b.audit), 'bootstrap has audit trail');
  ok(b.analytics, 'bootstrap has analytics');
  ok(b.notifications, 'bootstrap has notifications');
  const pip = b.activities.find(a => a.activity_id === 'PIP-0453');
  ok(!!pip, 'PIP-0453 exists');
  ok(pip && pip.planned_start === '2026-09-01', 'PIP-0453 planned_start 2026-09-01 (got ' + (pip && pip.planned_start) + ')');
  ok(pip && pip.planned_finish === '2026-09-04', 'PIP-0453 planned_finish 2026-09-04');

  // 6. Validation
  r = await call('POST', '/api/reports', ST, { raw_text: 'short', report_date: '05-Sep-2026' });
  ok(r.status === 400, 'short raw_text rejected 400');
  r = await call('POST', '/api/reports', ST, { raw_text: 'This is a long enough field report text for validation.', report_date: '2026/09/05' });
  ok(r.status === 400, 'bad date format rejected 400');

  // helper: submit + process
  async function flow(text, token = ST) {
    const s = await call('POST', '/api/reports', token, { raw_text: text, report_date: '05-Sep-2026' });
    const id = s.data.report && s.data.report.report_id;
    const p = await call('POST', '/api/reports/' + id + '/process', PT, {});
    return { sub: s, proc: p, rep: p.data.report, id };
  }

  // 7. HIGH
  let f = await flow(P102);
  ok(f.rep && f.rep.match, 'P102 produced match');
  ok(f.rep.match.activity_id === 'PIP-0453', 'P102 -> PIP-0453 (got ' + (f.rep && f.rep.match && f.rep.match.activity_id) + ')');
  ok(f.rep.match.total_confidence >= 90, 'P102 confidence >=90 (got ' + (f.rep && f.rep.match && f.rep.match.total_confidence) + ')');
  ok(f.rep.match.status === 'high', 'P102 status high (got ' + (f.rep && f.rep.match && f.rep.match.status) + ')');
  ok(f.rep.match.decision === 'pending', 'P102 not auto-approved');
  ok(f.rep.extraction.event_time === '08:45' && f.rep.extraction.actual_start === '2026-09-05T08:45', 'P102 time extracted 08:45');
  ok(f.rep.extraction.delay_category === 'Material', 'P102 material delay detected');
  ok(Array.isArray(f.rep.match.candidates) && f.rep.match.candidates.length >= 2, 'L5/L6 candidates present');

  // 8. Missing time stays unknown
  f = await flow('05-Sep-2026. Mechanical equipment alignment in the pump area was carried out today by the crew on shift.');
  ok(f.rep && f.rep.extraction, 'no-time report extracted');
  if (f.rep) ok(f.rep.extraction.time_known === false || f.rep.extraction.event_time == null, 'missing time remains unknown (time_known=' + (f.rep.extraction.time_known) + ', time=' + f.rep.extraction.event_time + ')');

  // 9. MEDIUM
  f = await flow('05-Sep-2026. Some pipe rack line erection work continued in the unit. Crew progressed erection activities in the area.');
  ok(f.rep && f.rep.match.total_confidence < 90, 'vague pipe-rack report not HIGH (got ' + (f.rep && f.rep.match && f.rep.match.total_confidence) + ')');

  // 10. LOW
  f = await flow('05-Sep-2026. Did some installation work in the plant today with the team on site doing general tasks.');
  ok(f.rep && (f.rep.match.status === 'unmatched' || f.rep.match.total_confidence < 70), 'some-installation -> unmatched/low (status=' + (f.rep && f.rep.match && f.rep.match.status) + ', conf=' + (f.rep && f.rep.match && f.rep.match.total_confidence) + ')');
  const lowId = f.id;
  r = await call('POST', '/api/matches/' + lowId + '/approve', PT, {});
  ok(r.status === 400, 'LOW/unmatched cannot be approved without manual selection');

  // 11. UNKNOWN P-901
  f = await flow('05-Sep-2026. P-901 pump installation started in the new terminal area. Foundation bolts torqued and aligned.');
  ok(f.rep && f.rep.match.status === 'unmatched', 'P-901 -> unmatched (got ' + (f.rep && f.rep.match && f.rep.match.status) + ')');
  ok(f.rep && f.rep.match.activity_id == null, 'P-901 no recommended activity');
  ok(f.rep && f.rep.match.unknown_identifiers && f.rep.match.unknown_identifiers.indexOf('P-901') >= 0, 'P-901 flagged unknown identifier');
  r = await call('GET', '/api/bootstrap', PT);
  ok(!r.data.activities.some(a => /P-?901/.test(a.activity_id)), 'P-901 NOT auto-created in schedule');

  // 12. Duplicate
  await call('POST', '/api/reports', ST, { raw_text: P102, report_date: '05-Sep-2026' });
  const d2 = await call('POST', '/api/reports', ST, { raw_text: P102, report_date: '05-Sep-2026' });
  const d2id = d2.data.report && d2.data.report.report_id;
  const d2proc = await call('POST', '/api/reports/' + d2id + '/process', PT, {});
  const d2rep = d2proc.data.report || {};
  ok(!!d2rep.duplicate_of, 'duplicate report flagged via duplicate_of (-> ' + d2rep.duplicate_of + ')');

  // 13. Role gating on approval
  f = await flow(P102);
  const mid = f.id;
  r = await call('POST', '/api/matches/' + mid + '/approve', ST, {});
  ok(r.status === 403, 'supervisor cannot approve');
  r = await call('POST', '/api/matches/' + mid + '/approve', MT, {});
  ok(r.status === 403, 'PM cannot approve');
  r = await call('POST', '/api/matches/' + mid + '/approve', PT, {});
  ok(r.status === 200 && r.data.ok, 'planner approves HIGH match');
  if (r.status === 200) {
    ok(r.data.changes && r.data.changes.some(c => c.field === 'Actual Start'), 'approval records Actual Start change');
    r = await call('GET', '/api/bootstrap', PT);
    const a = r.data.activities.find(x => x.activity_id === 'PIP-0453');
    ok(a.actual_start === '2026-09-05T08:45', 'actual_start written (' + a.actual_start + ')');
    ok(a.actual_finish == null, 'actual_finish NOT set by start report');
    ok(a.planned_start === '2026-09-01', 'planned_start NOT overwritten');
    ok((a.delay_reason || '').length > 0, 'delay reason recorded');
  }

  // 14. Reject
  f = await flow('05-Sep-2026. P102 spool weld inspection and NDT completed on pipe rack B erected section.');
  r = await call('POST', '/api/matches/' + f.id + '/reject', PT, { reason: 'wrong activity' });
  ok(r.status === 200, 'planner rejects match');
  r = await call('POST', '/api/matches/' + f.id + '/reject', ST, { reason: 'x' });
  ok(r.status === 403, 'supervisor cannot reject');

  // 15. Recalculate
  f = await flow('05-Sep-2026. P102 line hydrotest preparation underway at pipe rack B for erection closeout checks.');
  r = await call('POST', '/api/matches/' + f.id + '/recalculate', PT, {});
  ok(r.status === 200, 'recalculate 200');

  // 16. Search
  r = await call('GET', '/api/search?q=' + encodeURIComponent('P102'), PT);
  ok(r.status === 200, 'search 200');
  r = await call('GET', '/api/search?q=' + encodeURIComponent('zzznotaterm'), PT);
  ok(r.status === 200, 'search empty 200');

  // 17. Memory
  r = await call('GET', '/api/memory', MT);
  ok(r.status === 200, 'memory GET 200');
  r = await call('POST', '/api/memory/ask', MT, { question: 'What is the status of P102?' });
  ok(r.status === 200 && r.data && (r.data.answer || r.data.reply || r.data.text || r.data.response), 'memory ask returns answer');

  // 18. Export
  for (const kind of ['schedule.csv', 'progress.csv', 'audit.csv', 'delays.csv']) {
    r = await call('GET', '/api/export/' + kind, PT);
    ok(r.status === 200 && typeof r.data === 'string' && r.data.length > 20, 'export ' + kind + ' 200 (csv)');
  }

  // 19. Import
  const csv = 'Activity ID,Activity Name,WBS,Level,Discipline,Location,Planned Start,Planned Finish\nPIP-TEST-1,Test Erection Activity,IMP.T,5,Piping,Pipe Rack C,2026-09-10,2026-09-15\n';
  r = await call('POST', '/api/import/schedule', PT, { content: csv });
  ok(r.status === 200 && r.data.added === 1, 'import schedule 200, added=1 (got ' + r.status + ' ' + JSON.stringify(r.data).slice(0,80) + ')');
  r = await call('POST', '/api/import/schedule', ST, { content: csv });
  ok(r.status === 403, 'supervisor cannot import');

  // 20. Static assets
  for (const path of ['/', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/charts.js', '/js/pages-1.js', '/js/pages-2.js', '/js/pages-3.js', '/css/app.css']) {
    r = await call('GET', path);
    ok(r.status === 200, 'asset ' + path + ' 200');
  }
  r = await call('GET', '/nope-xyz.js');
  ok(r.status === 404, 'missing asset 404');

  // 21. Reset to clean demo
  r = await call('POST', '/api/demo/reset', PT, {});
  ok(r.status === 200, 'final reset 200');

  console.log('\n==============================');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { failures.forEach(x => console.log(' - ' + x)); process.exit(1); }
  else console.log('ALL CHECKS PASSED');
})();
