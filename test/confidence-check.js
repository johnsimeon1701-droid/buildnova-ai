const BASE = 'http://127.0.0.1:4730';
async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-auth-token'] = token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await r.json(); } catch (e) { data = await r.text(); }
  return { status: r.status, data };
}
(async () => {
  let r = await call('POST', '/api/auth/login', null, { role: 'Planner', email: 'planner@buildnova.ai' });
  const PT = r.data.token;
  r = await call('POST', '/api/auth/login', null, { role: 'Supervisor', email: 'supervisor@buildnova.ai' });
  const ST = r.data.token;
  await call('POST', '/api/demo/reset', PT, {});

  const scenarios = [
    ['HIGH P102', '05-Sep-2026. Piping - Pipe Rack B. P102 spool erection started at 8:45 AM. Four spools erected today. Work delayed because material arrived late.'],
    ['MEDIUM pipe rack line erection', '05-Sep-2026. Some pipe rack line erection work continued in the unit. Crew progressed erection activities in the area.'],
    ['LOW some installation work', '05-Sep-2026. Did some installation work in the plant today with the team on site doing general tasks.'],
    ['UNKNOWN P-901', '05-Sep-2026. P-901 pump installation started in the new terminal area. Foundation bolts torqued and aligned.'],
    ['NO-TIME report', '05-Sep-2026. Mechanical equipment alignment in the pump area was carried out today by the crew on shift.'],
    ['MATERIAL DELAY', '06-Sep-2026. Structural steel erection on Pipe Rack A could not proceed; structural steel material delivery is delayed. Crew demobilized.'],
  ];
  for (const [label, text] of scenarios) {
    const sub = await call('POST', '/api/reports', ST, { raw_text: text, report_date: '05-Sep-2026' });
    const id = (sub.data.report && (sub.data.report.report_id || sub.data.report.id)) || sub.data.report_id || sub.data.id;
    const pr = await call('POST', '/api/reports/' + id + '/process', PT, {});
    const rep = pr.data.report || pr.data;
    const m = rep.match || {};
    const ex = rep.extraction || {};
    console.log('=== ' + label + ' ===');
    console.log('  status        :', rep.processing_status);
    console.log('  activity_code :', m.activity_code ?? m.activity_id ?? (m.activity && m.activity.code));
    console.log('  activity_name :', m.activity_name ?? (m.activity && m.activity.name));
    console.log('  confidence    :', m.total_confidence ?? m.confidence);
    console.log('  band          :', m.band ?? m.confidence_band);
    console.log('  needs_review  :', m.needs_review);
    console.log('  unmatched     :', m.unmatched);
    console.log('  decision      :', m.decision);
    console.log('  extracted time:', JSON.stringify(ex.start_time ?? ex.time ?? null));
    console.log('  extracted date:', JSON.stringify(ex.report_date ?? ex.date ?? null));
    const sig = m.signals || m.score_breakdown || m.reasons || m.components;
    if (sig) console.log('  breakdown     :', JSON.stringify(sig).slice(0, 300));
    console.log();
  }
  // Check schedule after processing (no auto-create, planned intact)
  const boot = await call('GET', '/api/bootstrap', PT);
  const bd = boot.data;
  const acts = bd.activities || (bd.schedule && bd.schedule.activities) || [];
  console.log('=== Schedule integrity ===');
  console.log('  bootstrap keys :', Object.keys(bd).join(','));
  console.log('  total activities:', acts.length);
  console.log('  P-901 auto-created?:', acts.some(a => /P-?901/i.test(a.activity_id || a.code || a.activity_code || '')));
  const pip = acts.find(a => (a.activity_id || a.code || a.activity_code) === 'PIP-0453');
  if (pip) console.log('  PIP-0453:', JSON.stringify({ id: pip.activity_id || pip.code, planned_start: pip.planned_start, planned_finish: pip.planned_finish, actual_start: pip.actual_start, actual_finish: pip.actual_finish }));
})();
