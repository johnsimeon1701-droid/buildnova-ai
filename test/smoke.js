/* Headless render smoke test — every page renders without exceptions */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

(async () => {
  const BASE = 'http://127.0.0.1:4730';
  // fetch bootstrap data from live server
  async function api(method, url, body) {
    const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }
  const login = await api('POST', '/api/auth/login', { role: 'Planner' });
  const token = login.token;
  const data = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': token } })).json();

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toast-root"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window; global.document = window.document; global.localStorage = {
    _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; },
  };
  global.CustomEvent = window.CustomEvent;
  const __origFetch = global.fetch.bind(global);
  global.fetch = (url, opt) => __origFetch(BASE + url.replace(/^https?:\/\/[^/]+/, ''), opt);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  global.SVGElement = window.SVGElement;

  // load scripts in order
  const files = ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js', 'js/app.js'];
  for (const f of files) {
    let code = fs.readFileSync(path.join('/home/user/buildnova/public', f), 'utf8');
    // expose script-scope consts to the harness
    code += `\n;if (typeof API!=='undefined') globalThis.API=API; if (typeof Charts!=='undefined') globalThis.Charts=Charts; if (typeof UI!=='undefined') globalThis.UI=UI; if (typeof window!=='undefined'&&window.PAGES) globalThis.PAGES=window.PAGES; if (typeof App!=='undefined') globalThis.App=App;`;
    try { window.eval(code); } catch (e) { console.error('LOAD ERROR in', f, ':', e.message); process.exit(1); }
  }

  // auth: inject session
  window.localStorage.setItem('buildnova_token', token);
  window.localStorage.setItem('buildnova_user', JSON.stringify(data.user));

  // monkey-patch App to use our fetched data directly
  const App = window.App;
  // patch bootstrap to return live data
  const origBoot = App;
  const UI = window.UI, PAGES = window.PAGES, Charts = window.Charts;

  const ctx = { data, refresh: async () => { const nd = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': token } })).json(); Object.assign(data, nd); }, role: () => 'Planner', can: {} };

  let pass = 0, fail = 0;
  const routes = ['#/dashboard', '#/schedule', '#/reports', '#/review', '#/risk', '#/simulator', '#/brief', '#/memory', '#/audit', '#/settings'];
  for (const route of routes) {
    const root = document.createElement('div');
    document.getElementById('app').innerHTML = '';
    document.getElementById('app').appendChild(root);
    try {
      PAGES[route](root, ctx);
      // count DOM nodes produced
      const nodes = root.querySelectorAll('*').length;
      console.log(`OK  ${route.padEnd(14)} rendered ${String(nodes).padStart(5)} nodes`);
      pass++;
    } catch (e) {
      console.error(`FAIL ${route}:`, e.message, '\n', e.stack.split('\n')[2]);
      fail++;
    }
  }

  // test activity drawer
  try {
    window.openActivity('PIP-0453', ctx);
    const d = document.querySelectorAll('.drawer').length;
    console.log(`OK  activity drawer rendered (${d})`);
    pass++;
  } catch (e) { console.error('FAIL drawer:', e.message, e.stack.split('\n')[2]); fail++; }

  // test report drawer
  try {
    window.openReportDrawer('FR-025', ctx);
    console.log('OK  report drawer rendered'); pass++;
  } catch (e) { console.error('FAIL report drawer:', e.message, e.stack.split('\n')[2]); fail++; }

  // test processing result modal
  try {
    const r = data.reports.find(x => x.report_id === 'FR-025');
    window.showProcessingResult(r, ctx);
    console.log('OK  extraction result modal rendered'); pass++;
    document.getElementById('modal-root').innerHTML = '';
  } catch (e) { console.error('FAIL result modal:', e.message, e.stack.split('\n')[2]); fail++; }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
