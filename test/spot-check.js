const BASE = 'http://127.0.0.1:4730';
async function call(m, p, t, b) {
  const h = { 'Content-Type': 'application/json' }; if (t) h['x-auth-token'] = t;
  const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  let d; try { d = await r.json(); } catch (e) { d = await r.text(); }
  return { status: r.status, data: d };
}
(async () => {
  const PT = (await call('POST', '/api/auth/login', null, { role: 'Planner', email: 'planner@buildnova.ai' })).data.token;
  const ST = (await call('POST', '/api/auth/login', null, { role: 'Supervisor', email: 'supervisor@buildnova.ai' })).data.token;
  await call('POST', '/api/demo/reset', PT, {});

  let r = await call('POST', '/api/memory/ask', PT, { question: 'What is the status of P102 spool erection?' });
  console.log('MEMORY ask:', r.status, '| keys:', Object.keys(r.data).join(','));
  console.log('  ->', String(r.data.answer || r.data.reply || r.data.text || r.data.response || JSON.stringify(r.data)).slice(0, 240));

  // Field Reports pipeline (supervisor submit -> AI process -> extraction + match)
  r = await call('POST', '/api/reports', ST, { raw_text: 'P102 spool erection started at 8:45 AM on pipe rack B, four spools erected, material delay', report_date: '05-Sep-2026' });
  const rid = (r.data.report || {}).report_id;
  console.log('\nREPORT submit:', r.status, '| id:', rid);
  if (rid) {
    r = await call('POST', '/api/reports/' + rid + '/process', ST, {});
    const ex = (r.data.report || {}).extraction || {}, mt = (r.data.report || {}).match || {};
    console.log('REPORT process:', r.status, '| identifier:', ex.activity_identifier, '| event:', ex.event,
      '| match:', mt.status, '| rec:', mt.activity_id, mt.total_confidence);
  }

  r = await call('GET', '/api/search?q=' + encodeURIComponent('PIP-0453'), PT);
  console.log('\nSEARCH PIP-0453:', r.status, '| results:', Array.isArray(r.data.results) ? r.data.results.length : JSON.stringify(r.data).slice(0, 120));
  if (Array.isArray(r.data.results)) r.data.results.slice(0, 4).forEach(x => console.log('   -', x.type, '|', x.title));

  r = await call('GET', '/api/search?q=' + encodeURIComponent('material delay'), PT);
  console.log("SEARCH 'material delay':", r.status, '| results:', Array.isArray(r.data.results) ? r.data.results.length : 'n/a');

  // notifications shape
  r = await call('GET', '/api/bootstrap', PT);
  console.log('\nNOTIFICATIONS:', JSON.stringify(r.data.notifications.counters), '| feed items:', r.data.notifications.feed.length);
  console.log('ANALYTICS keys:', Object.keys(r.data.analytics).join(','));
})();
