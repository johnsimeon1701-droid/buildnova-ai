// Verify the 3 new innovative features end-to-end.
const BASE = 'http://127.0.0.1:4730';
async function call(m, p, t, b) {
  const h = { 'Content-Type': 'application/json' }; if (t) h['x-auth-token'] = t;
  const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  let d; try { d = await r.json(); } catch (e) { d = await r.text(); }
  return { status: r.status, data: d };
}
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); };
(async () => {
  const PT = (await call('POST', '/api/auth/login', null, { role: 'Planner', email: 'planner@buildnova.ai' })).data.token;
  const ST = (await call('POST', '/api/auth/login', null, { role: 'Supervisor', email: 'supervisor@buildnova.ai' })).data.token;
  await call('POST', '/api/demo/reset', PT, {});

  // ---- FEATURE 1: What-if simulator ----
  let r = await call('POST', '/api/simulate', PT, { activity_id: 'PIP-0453', slip_days: 4 });
  ok(r.status === 200, 'simulate 200');
  ok(r.data.source && r.data.source.activity_id === 'PIP-0453', 'simulate source activity');
  console.log('  SIMULATE:', r.data.source.activity_name, '| slip', r.data.slip_days, 'd | downstream', r.data.downstream_count, '| at-risk', r.data.at_risk_count);
  (r.data.at_risk || []).slice(0, 3).forEach(d => console.log('     at-risk:', d.activity_id, d.activity_name, '(depth', d.depth + ')' + (d.exposure_days !== null && d.exposure_days !== undefined ? ', float ' + d.exposure_days + 'd' : '')));
  ok(r.data.note && /not changed/i.test(r.data.note), 'simulate is read-only (note present)');
  // at-risk rows must carry the fields the UI renders (exposure_days, chain, location) — no "undefined"
  (r.data.at_risk || []).forEach(d => {
    ok(typeof d.exposure_days === 'number' || d.exposure_days === null, 'at-risk has numeric exposure_days for ' + d.activity_id);
    ok(Array.isArray(d.chain) && d.chain.length >= 2 && d.chain[0] === 'PIP-0453' && d.chain[d.chain.length - 1] === d.activity_id, 'chain is a full PIP-0453 path for ' + d.activity_id);
    ok(d.location && d.location !== 'undefined' && d.planned_start, 'location + planned_start populated for ' + d.activity_id);
  });
  // simulate does NOT mutate schedule
  const b1 = await call('GET', '/api/bootstrap', PT);
  const a0 = b1.data.activities.find(a => a.activity_id === 'PIP-0453');
  await call('POST', '/api/simulate', PT, { activity_id: 'PIP-0453', slip_days: 30 });
  const b2 = await call('GET', '/api/bootstrap', PT);
  const a1 = b2.data.activities.find(a => a.activity_id === 'PIP-0453');
  ok(a0.planned_finish === a1.planned_finish && a0.actual_start === a1.actual_start, 'simulate did not mutate schedule');

  // ---- FEATURE 2: Auto progress brief ----
  // approve P102 first so brief has data
  const sub = await call('POST', '/api/reports', ST, { raw_text: '05-Sep-2026. Piping - Pipe Rack B. P102 spool erection started at 8:45 AM. Four spools erected today. Work delayed because material arrived late.', report_date: '05-Sep-2026' });
  const rid = sub.data.report.report_id;
  await call('POST', "/api/reports/"+rid+"/process", PT, {});
  await call('POST', "/api/matches/"+rid+"/approve", PT, {});
  r = await call('GET', '/api/brief', PT);
  ok(r.status === 200 && r.data.text && r.data.text.includes('DAILY PROGRESS REPORT'), 'brief generated');
  console.log('\n  ---- DPR PREVIEW (first 12 lines) ----');
  r.data.text.split('\n').slice(0, 12).forEach(l => console.log('  ', l));
  ok(r.data.stats && typeof r.data.stats.delayed === 'number', 'brief stats present');

  // ---- FEATURE 3: Adaptive learning ----
  // submit a vague/unmatched report, process, manually map it to a DIFFERENT activity, then repeat similar text
  const vague = '05-Sep-2026. The pump-area alignment job on the motor skid went ahead with the rigging crew today.';
  let s = await call('POST', '/api/reports', ST, { raw_text: vague, report_date: '05-Sep-2026' });
  const vid = s.data.report.report_id;
  let pr = await call('POST', "/api/reports/"+vid+"/process", PT, {});
  const beforeId = pr.data.report.match.recommended ? pr.data.report.match.recommended.activity_id : '(unmatched)';
  const beforeStatus = pr.data.report.match.status;
  // manually approve to a chosen activity (e.g. MEC-0210 alignment)
  const target = pr.data.report.match.candidates.find(c => /align/i.test(c.activity_name)) || pr.data.report.match.candidates[0];
  const apr = await call('POST', '/api/matches/' + vid + '/approve', PT, { activity_id: target.activity_id });
  ok(apr.status === 200, 'manual override approved');
  console.log('\n  LEARN: before =', beforeStatus, beforeId, '| planner mapped to', target.activity_id, target.activity_name);
  const learned = await call('GET', '/api/learned', PT);
  ok(learned.data.count > 0, 'learned mappings stored (count=' + learned.data.count + ')');
  console.log('  learned mappings:', JSON.stringify(learned.data.mappings.slice(0, 4)));
  // now a similar report should get a learned boost toward target
  const similar = '05-Sep-2026. Pump-area motor skid alignment continued with the rigging crew on site.';
  s = await call('POST', '/api/reports', ST, { raw_text: similar, report_date: '05-Sep-2026' });
  const sid2 = s.data.report.report_id;
  pr = await call('POST', "/api/reports/"+sid2+"/process", PT, {});
  const mtc = pr.data.report.match;
  const rec2 = mtc.activity_id; // server flattens recommended into match.activity_id
  const top = mtc.candidates[0];
  const learnedSignal = top.learned_signals && top.learned_signals.length;
  console.log('  similar report -> mapped:', rec2 || '(unmatched)', '| status:', mtc.status, '| total:', mtc.total_confidence, '| top learned score:', top.scores.learned, '| signals:', JSON.stringify(top.learned_signals || []));
  ok(rec2 === target.activity_id, 'learned boost steered similar report to taught activity (' + rec2 + ' vs ' + target.activity_id + ')');
  ok(mtc.status === 'medium' || mtc.status === 'low' || mtc.status === 'ambiguous', 'learned match is recommendable but still needs planner approval (status=' + mtc.status + ')');
  ok(learnedSignal > 0, 'learned signal surfaced on match');

  console.log('\n==== NEW FEATURES:', pass, 'passed,', fail, 'failed ====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
