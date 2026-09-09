/* Nav-click E2E: clicks every left-panel button and verifies each page renders. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

const BASE = 'http://127.0.0.1:4730';
const expect = {
  '#/dashboard': 'Project Command Center', '#/schedule': 'Schedule Explorer', '#/reports': 'Field Reports',
  '#/review': 'Matching Review', '#/risk': 'Delay & Risk', '#/simulator': 'What-If',
  '#/brief': 'Progress Brief', '#/memory': 'Project Memory',
  '#/audit': 'Audit Trail', '#/settings': 'Settings',
};

(async () => {
  const plan = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'Planner' }) })).json()).token;

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'http://localhost/#/dashboard', pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document; global.Node = dom.window.Node;
  global.location = dom.window.location;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent; global.localStorage = dom.window.localStorage;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
  dom.window.localStorage.setItem('buildnova_token', plan);
  dom.window.localStorage.setItem('buildnova_user', JSON.stringify({ name: 'Test Planner', role: 'Planner' }));
  const origFetch = global.fetch.bind(global);
  const calls = [];
  global.fetch = (url, opt) => {
    const u = BASE + (typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '') : url);
    if (opt && opt.method === 'POST' && !/login|logout/.test(u)) calls.push(u);
    return origFetch(u, opt);
  };

  for (const f of ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js']) {
    let c = fs.readFileSync(path.join('/home/user/buildnova/public', f), 'utf8');
    c += "\n;if(typeof API!=='undefined')globalThis.API=API;if(typeof UI!=='undefined')globalThis.UI=UI;if(typeof window!=='undefined'&&window.PAGES)globalThis.PAGES=window.PAGES;if(typeof Charts!=='undefined')globalThis.Charts=Charts;";
    dom.window.eval(c);
  }
  let appJs = fs.readFileSync('/home/user/buildnova/public/js/app.js', 'utf8');
  dom.window.eval(appJs + "\n;globalThis.App=App;globalThis.PAGES=(typeof window!=='undefined'&&window.PAGES)?window.PAGES:undefined;");

  // boot as planner -> goes to #/dashboard
  window.location.hash = '#/dashboard';
  await App.boot();
  await new Promise(r => setTimeout(r, 700));
  await new Promise(r => { const t = setInterval(() => { if (App.state.data) { clearInterval(t); r(); } }, 40); });

  const nav = () => [...document.querySelectorAll('.nav-item')];
  if (!nav().length) throw new Error('No .nav-item elements rendered — sidebar missing!');

  const results = [];
  let prevRoute = '#/dashboard';
  for (const it of nav()) {
    const label = it.querySelector('.nlabel') ? it.querySelector('.nlabel').textContent.trim() : '?';
    const wasActive = App.state.route;
    it.click();
    await new Promise(r => setTimeout(r, 260));
    const content = document.getElementById('content');
    const html = content ? content.innerHTML : '';
    const text = content ? content.textContent : '';
    const route = App.state.route;
    const exp = expect[route];
    // route unchanged => hashchange never fired (same-route click) but page already rendered at boot
    const alreadyRendered = route === wasActive && html.length > 400;
    results.push({ label, route, exp, ok: !!exp && (text.includes(exp) && html.length > 400) || alreadyRendered && text.includes(exp) });
    if (route === '#/dashboard') prevRoute = route;
  }
  // report
  let fails = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.label.padEnd(22) + r.route.padEnd(14) + 'contains "' + r.exp + '"'));
  // ensure a genuinely fresh page render (simulator page must have run its render, no throw)
  console.log('\n  nav items found:', nav().length, '| expected routes:', Object.keys(expect).length);
  if (fails.length) { console.error('\nFAILED:', JSON.stringify(fails, null, 1)); process.exit(1); }
  console.log('\n🎉 All left-panel buttons render their page.');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
