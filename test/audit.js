/* Deep runtime audit: render every page, exercise interactions, capture errors */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

(async () => {
  const BASE = 'http://127.0.0.1:4730';
  const errors = [];
  async function api(method, url, body, token) {
    const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }

  function makeDom(role) {
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div><div id="root2"></div><div id="modal-root"></div><div id="toast-root"></div>', { url: 'http://x/', pretendToBeVisual: true });
    const w = dom.window;
    global.window = w; global.document = w.document; global.Node = w.Node;
    global.CustomEvent = w.CustomEvent; global.location = w.location;
    global.localStorage = w.localStorage;
    global.navigator = w.navigator;
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.scrollTo = () => {};
    w.document.execCommand = () => true; // jsdom lacks the clipboard execCommand fallback
    w.addEventListener('error', e => errors.push('window.error: ' + e.message));
    w.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
    process.on('unhandledRejection', r => errors.push('node unhandledRejection: ' + (r && r.message || r)));
    const origFetch = global.fetch.bind(global);
    global.fetch = (url, opt) => origFetch(BASE + (typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '') : url), opt);
    return dom;
  }

  async function loadScripts(dom) {
    for (const f of ['js/api.js','js/charts.js','js/ui.js','js/pages-1.js','js/pages-2.js','js/pages-3.js','js/app.js']) {
      let c = fs.readFileSync(path.join('/home/user/buildnova/public', f), 'utf8');
      c += "\n;if(typeof API!=='undefined')globalThis.API=API;if(typeof Charts!=='undefined')globalThis.Charts=Charts;if(typeof UI!=='undefined')globalThis.UI=UI;if(typeof window!=='undefined'&&window.PAGES)globalThis.PAGES=window.PAGES;if(typeof App!=='undefined')globalThis.App=App;";
      dom.window.eval(c);
    }
  }

  for (const role of ['Supervisor', 'Planner', 'Project Manager']) {
    const token = (await api('POST', '/api/auth/login', { role })).token;
    const dom = makeDom(role);
    dom.window.localStorage.setItem('buildnova_token', token);
    dom.window.localStorage.setItem('buildnova_user', JSON.stringify({ name: 'Test ' + role, role, email: 't@b.ai', title: role }));
    await loadScripts(dom);
    const data = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': token } })).json();
    const ctx = {
      data,
      refresh: async () => { ctx.data = await (await fetch(BASE + '/api/bootstrap', { headers: { 'x-auth-token': token } })).json(); },
      role, can: {},
    };
    const mount = document.getElementById('root2');

    const routes = ['#/dashboard','#/schedule','#/reports','#/review','#/risk','#/simulator','#/brief','#/memory','#/audit','#/settings'];
    for (const route of routes) {
      mount.innerHTML = ''; document.getElementById('modal-root').innerHTML = '';
      try {
        window.PAGES[route](mount, ctx);
        // exercise: click every button/clickable once (best effort) to surface handler errors
        const clickables = mount.querySelectorAll('button, th[onclick], .rcand, .memory-rec, tbody tr, .sr-item');
        let clicked = 0;
        for (const el of clickables) {
          if (clicked > 40) break;
          try {
            // only click buttons to avoid opening drawers repeatedly; click modal-close afterwards
            if (el.tagName === 'BUTTON') { el.click(); clicked++; await new Promise(r => setTimeout(r, 5)); }
          } catch (e) { errors.push(`[${role} ${route}] click handler: ${e.message}`); }
        }
        // close any modal that opened
        document.getElementById('modal-root').innerHTML = '';
      } catch (e) {
        errors.push(`[${role} ${route}] render: ${e.message}\n  ${(e.stack||'').split('\n')[1]}`);
      }
    }

    // open activity drawer & report drawer for each role
    try { window.openActivity('PIP-0453', ctx); document.querySelectorAll('.drawer .dx').forEach(b => b.click()); }
    catch (e) { errors.push(`[${role} drawer] ${e.message}`); }
    try { const fr = data.reports.find(r => r.extraction); window.openReportDrawer(fr.report_id, ctx); }
    catch (e) { errors.push(`[${role} report-drawer] ${e.message}`); }
  }

  // clear toasts
  if (errors.length) { console.log('ERRORS FOUND:'); errors.forEach(e => console.log(' ✗ ' + e)); process.exit(1); }
  console.log('✅ No runtime errors across all 3 roles × 10 pages + interactions + drawers.');
  process.exit(0);
})().catch(e => { console.error('HARNESS FATAL:', e); process.exit(1); });
