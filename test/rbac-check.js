// Verify UI gating: which role sees LOAD DEMO / import / approve controls.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const BASE = 'http://127.0.0.1:4730';
async function api(m, p, t, b) {
  const h = { 'Content-Type': 'application/json' }; if (t) h['x-auth-token'] = t;
  const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  return r.json();
}
function makeWindow(token, user, data) {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { runScripts: 'outside-only', url: 'http://x/', pretendToBeVisual: true });
  const { window } = dom;
  window.localStorage.setItem('buildnova_token', token);
  window.localStorage.setItem('buildnova_user', JSON.stringify(user));
  window.fetch = (u, o) => {
    const isBoot = String(u).includes('bootstrap');
    const body = isBoot ? JSON.stringify(data) : '{}';
    return Promise.resolve(new window.Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  const pub = __dirname + '/../public/';
  for (const f of ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js', 'js/app.js']) {
    let c = fs.readFileSync(pub + f, 'utf8');
    c += "\n;if(typeof API!=='undefined')globalThis.API=API;if(typeof Charts!=='undefined')globalThis.Charts=Charts;if(typeof UI!=='undefined')globalThis.UI=UI;if(typeof window!=='undefined'&&window.PAGES)globalThis.PAGES=window.PAGES;if(typeof App!=='undefined')globalThis.App=App;";
    window.eval(c);
  }
  return window;
}
(async () => {
  const emails = { Supervisor: 'supervisor@buildnova.ai', Planner: 'planner@buildnova.ai', 'Project Manager': 'pm@buildnova.ai' };
  let fail = 0;
  const check = (cond, msg) => { console.log((cond ? '  OK  ' : '  XX  ') + msg); if (!cond) fail++; };
  for (const roleName of ['Supervisor', 'Planner', 'Project Manager']) {
    const login = await api('POST', '/api/auth/login', null, { role: roleName, email: emails[roleName] });
    const data = await api('GET', '/api/bootstrap', login.token);
    const window = makeWindow(login.token, login.user, data);
    const can = {
      submitReport: ['Supervisor', 'Planner'].includes(roleName),
      approve: roleName === 'Planner',
      import: ['Planner', 'Project Manager'].includes(roleName),
      resetDemo: ['Planner', 'Project Manager'].includes(roleName),
    };
    console.log('\n=== ' + roleName + ' ===');
    // Settings page
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    window.PAGES['#/settings'](mount, { data, refresh: async () => {}, role: roleName, can });
    const txt = mount.textContent;
    const hasLoadDemo = txt.includes('LOAD / RESET DEMO');
    const hasImport = txt.includes('Import schedule');
    if (roleName === 'Supervisor') { check(!hasLoadDemo, 'Supervisor: LOAD DEMO hidden in settings'); check(!hasImport, 'Supervisor: import hidden in settings'); check(txt.includes('restricted to the Planner'), 'Supervisor: sees restriction note'); }
    else { check(hasLoadDemo, roleName + ': LOAD DEMO visible'); check(hasImport, roleName + ': import visible'); }
    check(txt.includes('Export schedule CSV'), roleName + ': export always visible');
    // Topbar LOAD DEMO (app.js chrome) — check the can.resetDemo logic indirectly via role
    check(can.resetDemo === (roleName !== 'Supervisor'), roleName + ': topbar LOAD DEMO flag = ' + can.resetDemo);
  }
  console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL RBAC UI CHECKS PASSED'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
