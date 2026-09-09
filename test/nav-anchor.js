/* Verifies sidebar items are real links AND that navigation works two ways:
   1) via the delegated click handler (preventDefault + go)
   2) via native hash fallback (simulating a broken/blocked click handler)
*/
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

const BASE = 'http://127.0.0.1:4730';
const EXPECT_H1 = {
  '#/dashboard': 'Project Command Center', '#/schedule': 'Schedule Explorer', '#/reports': 'Field Reports',
  '#/review': 'Matching Review', '#/risk': 'Delay & Risk', '#/simulator': 'What-If Delay Simulator',
  '#/brief': 'AI Progress Brief', '#/memory': 'Project Memory',
  '#/audit': 'Audit Trail', '#/settings': 'Settings',
};

(async () => {
  const token = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'Planner' }) })).json()).token;
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'http://localhost/#/dashboard', pretendToBeVisual: true });
  const w = dom.window;
  global.window = w; global.document = w.document; global.Node = w.Node; global.location = w.location;
  global.navigator = w.navigator; global.CustomEvent = w.CustomEvent; global.localStorage = w.localStorage; global.history = w.history;
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {}; w.document.execCommand = () => true;
  w.localStorage.setItem('buildnova_token', token);
  w.localStorage.setItem('buildnova_user', JSON.stringify({ name: 'Test Planner', role: 'Planner' }));
  const orig = global.fetch.bind(global);
  global.fetch = (u, o) => { const p = (typeof u === 'string') ? (u[0] === '/' ? BASE + u : u.replace(/^https?:\/\/[^/]+/, BASE)) : u; return orig(p, o); };
  for (const f of ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js']) {
    let c = fs.readFileSync(path.join('/home/user/buildnova/public', f), 'utf8');
    c += "\n;if(typeof API!=='undefined')globalThis.API=API;if(typeof UI!=='undefined')globalThis.UI=UI;if(typeof window!=='undefined'&&window.PAGES)globalThis.PAGES=window.PAGES;if(typeof Charts!=='undefined')globalThis.Charts=Charts;";
    w.eval(c);
  }
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.eval(fs.readFileSync('/home/user/buildnova/public/js/app.js', 'utf8') + "\n;globalThis.App=App;globalThis.PAGES=(typeof window!=='undefined'&&window.PAGES)?window.PAGES:undefined;");
  await App.boot();
  await new Promise(r => { const t = setInterval(() => { if (App.state.data) { clearInterval(t); r(); } }, 40); });
  await new Promise(r => setTimeout(r, 300));

  const items = [...document.querySelectorAll('.nav-item')];
  assert.ok(items.length === Object.keys(EXPECT_H1).length, 'all nav items rendered (' + items.length + ')');
  // 1) anchor integrity
  for (const it of items) {
    const route = it.getAttribute('data-route');
    assert.strictEqual(it.tagName, 'A', route + ' should be an <a>');
    assert.strictEqual(it.getAttribute('href'), route, route + ' href mismatch');
  }
  console.log('✅ all ' + items.length + ' sidebar items are <a href> links with correct routes');
  // 2) delegated-click navigation
  for (const route of Object.keys(EXPECT_H1)) {
    const it = [...document.querySelectorAll('.nav-item')].find(n => n.getAttribute('data-route') === route);
    it.click(); await new Promise(r => setTimeout(r, 160));
    const text = document.getElementById('content').textContent || '';
    assert.ok(text.includes(EXPECT_H1[route]), 'click nav to ' + route + ' should show "' + EXPECT_H1[route] + '"');
  }
  console.log('✅ delegated-click navigation works for every page');
  // 3) native hash fallback (pretend click handler is blocked: navigate via location only)
  w.location.hash = '#/risk';
  await new Promise(r => setTimeout(r, 260));
  assert.ok((document.getElementById('content').textContent || '').includes('Delay & Risk Intelligence'), 'native hash nav should render');
  console.log('✅ native hash fallback renders page when JS click handler is bypassed');
  console.log('runtime errors:', errs.length ? errs.join(' ;; ') : 'none');
  assert.strictEqual(errs.length, 0, 'unexpected runtime errors');
  console.log('\n🎉 Sidebar navigation verified (anchors + delegation + native fallback).');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
