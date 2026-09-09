/* Interactive E2E: planner clicks APPROVE & UPDATE on the P102 card -> schedule updates */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
(async () => {
  const BASE = 'http://127.0.0.1:4730';
  async function api(m, u, b, t) { const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { 'x-auth-token': t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json(); }
  const plan0 = (await api('POST', '/api/auth/login', { role: 'Planner' })).token;
  await api('POST', '/api/demo/reset', {}, plan0);
  const sup = (await api('POST', '/api/auth/login', { role: 'Supervisor' })).token;
  const sub = await api('POST', '/api/reports', { raw_text: '05-Sep-2026\nPiping – Pipe Rack B\nP102 spool erection started at 8:45 AM. Four spools were erected today. Work was delayed because material arrived late.', report_date: '2026-09-05', submitted_by: 'Ravi Kumar', discipline: 'Piping', location: 'Pipe Rack B' }, sup);
  await api('POST', `/api/reports/${sub.report.report_id}/process`, {}, sup);
  const plan = (await api('POST', '/api/auth/login', { role: 'Planner' })).token;

  const dom = new JSDOM('<!DOCTYPE html><div id=root2></div><div id=modal-root></div><div id=toast-root></div>', { url: 'http://localhost/x', pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document; global.Node = dom.window.Node;
  global.CustomEvent = dom.window.CustomEvent;
  global.localStorage = dom.window.localStorage;
  dom.window.localStorage.setItem('buildnova_token', plan);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const origFetch = global.fetch.bind(global); const posts = [];
  global.fetch = (url, opt) => { const u = BASE + (typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '') : url); if (opt && opt.method === 'POST') posts.push(u); return origFetch(u, opt); };

  for (const f of ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js']) {
    let c = fs.readFileSync(path.join('/home/user/buildnova/public', f), 'utf8');
    c += "\n;if(typeof API!=='undefined')globalThis.API=API;if(typeof UI!=='undefined')globalThis.UI=UI;if(typeof window!=='undefined'&&window.PAGES)globalThis.PAGES=window.PAGES;";
    dom.window.eval(c);
  }

  const data = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': plan } })).json();
  const ctx = { data, refresh: async () => { ctx.data = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': plan } })).json(); }, role: 'Planner', can: {} };
  const mount = document.getElementById('root2');
  window.PAGES['#/review'](mount, ctx);

  const card = [...mount.querySelectorAll('.card')].find(c => c.textContent.includes('PIP-0453') && c.textContent.includes(sub.report.report_id));
  if (!card) throw new Error('P102 review card not found');
  const ab = [...card.querySelectorAll('button')].find(b => /APPROVE & UPDATE/i.test(b.textContent));
  if (!ab) throw new Error('Approve button not found');
  ab.click();
  await new Promise(r => setTimeout(r, 150));
  const cb = [...document.querySelectorAll('#modal-root button')].find(b => /^APPROVE/.test(b.textContent.trim()));
  if (!cb) throw new Error('Confirm dialog button not found');
  cb.click();
  await new Promise(r => setTimeout(r, 1000));

  const approvePost = posts.find(p => /approve/.test(p));
  if (!approvePost) throw new Error('Approve API never called');
  console.log('✅ Approval POST fired:', approvePost);
  await ctx.refresh();
  const act = ctx.data.activities.find(a => a.activity_id === 'PIP-0453');
  const rpt = ctx.data.reports.find(r => r.report_id === sub.report.report_id);
  console.log('PIP-0453 ->', act.status, '| actual:', act.actual_start, '| planned(baseline):', act.planned_start, '| variance: +' + act.start_variance + 'd', '| progress:', act.progress + '%', '| risk:', act.risk_level, '| delay:', act.delay_category);
  console.log('Report ->', rpt.processing_status, '| decision:', rpt.match.decision, '| by:', rpt.match.decided_by, '| audit rows:', ctx.data.audit.filter(a => a.source_report === sub.report.report_id).length);
  const ok = act.status === 'Delayed' && act.actual_start === '2026-09-05T08:45' && act.planned_start === '2026-09-01' && act.start_variance === 4 && rpt.processing_status === 'approved';
  await api('POST', '/api/demo/reset', {}, plan);
  if (!ok) throw new Error('End state incorrect');
  console.log('\n🎉 Full click-to-approval E2E verified.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
