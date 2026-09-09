/* BuildNova AI — App shell, router, state */
const App = (() => {
  const state = { data: null, sidebarCollapsed: false, route: '#/dashboard' };
  const BUILD = '20260909e';   // visible build tag (see login footer / sidebar) — helps confirm a fresh load
  const NAV = [
    { group: 'OVERVIEW', items: [
      { id: 'dashboard', label: 'Dashboard', icon: '▦', route: '#/dashboard' },
      { id: 'schedule', label: 'Schedule Explorer', icon: '🗓', route: '#/schedule' },
    ]},
    { group: 'FIELD INTELLIGENCE', items: [
      { id: 'reports', label: 'Field Reports', icon: '📋', route: '#/reports', badge: 'reports' },
      { id: 'review', label: 'Matching Review', icon: '✅', route: '#/review', badge: 'pending' },
      { id: 'risk', label: 'Delay & Risk', icon: '⚠', route: '#/risk', badge: 'risks' },
      { id: 'simulator', label: 'What-If Simulator', icon: '🔀', route: '#/simulator' },
    ]},
    { group: 'KNOWLEDGE', items: [
      { id: 'brief', label: 'AI Progress Brief', icon: '📝', route: '#/brief' },
      { id: 'memory', label: 'Project Memory', icon: '🧠', route: '#/memory' },
      { id: 'audit', label: 'Audit Trail', icon: '📜', route: '#/audit' },
      { id: 'settings', label: 'Settings', icon: '⚙', route: '#/settings' },
    ]},
  ];

  const can = {
    submitReport: () => ['Supervisor', 'Planner'].includes(role()),
    approve: () => role() === 'Planner',
    import: () => ['Planner', 'Project Manager'].includes(role()),
    resetDemo: () => ['Planner', 'Project Manager'].includes(role()),
  };
  const role = () => API.session ? API.session.role : null;

  // Silently refresh the underlying data (sidebar counters, next page render)
  // WITHOUT rebuilding the current view — used by chat-style pages (AI Time
  // Agent) that must keep their conversation visible after an action.
  async function syncData() {
    try { state.data = await API.bootstrap(); }
    catch (e) { /* keep last good data; page actions still surface real errors */ }
  }

  async function refresh(silent) {
    try {
      state.data = await API.bootstrap();
      renderChrome();
      renderPage();
      if (!silent) updateChartsDebounced();
    } catch (e) {
      const msg = String(e.message || '');
      if (msg.includes('auth') || msg.includes('Session') || msg.includes('Not authenticated')) { location.hash = '#/login'; boot(); return; }
      UI.toast('Failed to load data: ' + msg, 'error');
      const app = document.getElementById('app');
      if (app && !state.data) {
        app.innerHTML = '';
        app.appendChild(UI.h('div', { class: 'boot-splash' },
          UI.h('div', { class: 'boot-error' },
            UI.h('h3', {}, 'Could not load project data'),
            UI.h('p', {}, msg + ' — the server may be restarting. Try again; if it persists, sign in again.'),
            UI.h('div', { style: 'display:flex;gap:8px;justify-content:center' },
              UI.h('button', { class: 'btn btn-primary', onclick: () => { refresh(false); } }, '↻ Retry'),
              UI.h('button', { class: 'btn btn-ghost', onclick: () => { location.hash = '#/login'; boot(); } }, 'Back to login')))));
      }
    }
  }

  let chartTimer = null;
  function updateChartsDebounced() {
    clearTimeout(chartTimer);
    chartTimer = setTimeout(() => document.dispatchEvent(new CustomEvent('charts:render')), 60);
  }

  /* ------------------------------- Login -------------------------------- */
  const DEMO_ACCOUNTS = {
    Supervisor: { email: 'supervisor@buildnova.ai', name: 'Ravi Kumar' },
    Planner: { email: 'planner@buildnova.ai', name: 'Anjali Sharma' },
    'Project Manager': { email: 'pm@buildnova.ai', name: 'Vikram Menon' },
  };
  function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Single demo-account selector (dropdown) drives the whole quick login.
    const demoSel = UI.h('select', { id: 'demo-role', autocomplete: 'off' },
      UI.h('option', { value: 'Supervisor' }, 'Supervisor — Field Supervisor'),
      UI.h('option', { value: 'Planner' }, 'Planner — Planning Engineer'),
      UI.h('option', { value: 'Project Manager' }, 'Project Manager — Oversight'));
    const emailInput = UI.h('input', { type: 'email', placeholder: 'planner@buildnova.ai', autocomplete: 'username' });
    const pwInput = UI.h('input', { type: 'password', value: 'demo', placeholder: 'Password (any value)', autocomplete: 'current-password' });
    const pwHint = UI.h('div', { class: 'muted', style: 'font-size:11.5px;margin-top:5px' }, 'Prototype demo auth — password is not verified.');

    const demoF = UI.h('div', { class: 'field' }, UI.fieldLabel('Select demo account'), demoSel);
    const emailF = UI.h('div', { class: 'field' }, UI.fieldLabel('Email'), emailInput, UI.h('div', { class: 'err' }, 'Valid email required'));
    const pwF = UI.h('div', { class: 'field' }, UI.fieldLabel('Password'), pwInput, pwHint);

    const fillEmail = () => {
      const acc = DEMO_ACCOUNTS[demoSel.value];
      if (!emailInput.value || Object.values(DEMO_ACCOUNTS).some(a => a.email === emailInput.value)) emailInput.value = acc.email;
    };
    demoSel.addEventListener('change', fillEmail);
    fillEmail();

    const doLogin = async () => {
      const roleVal = demoSel.value;
      const emailVal = emailInput.value.trim();
      if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        emailF.classList.add('invalid'); emailInput.focus();
        UI.toast('Enter a valid email for the demo account.', 'warning'); return;
      }
      emailF.classList.remove('invalid');
      try {
        await API.login(roleVal, emailVal);
        UI.toast(`Welcome, ${API.session.name}. Signed in as ${API.session.role}.`, 'success');
        state.route = roleVal === 'Supervisor' ? '#/reports' : '#/dashboard';
        try { location.hash = state.route; } catch (e) {}
        boot();
      } catch (e) { UI.toast(e.message, 'error'); }
    };

    const credRow = r => UI.h('div', { class: 'cred-row' },
      UI.h('span', { class: 'cred-role' }, r),
      UI.h('span', { class: 'cred-email' }, DEMO_ACCOUNTS[r].email));

    const wrap = UI.h('div', { class: 'login-wrap' },
      UI.h('div', { class: 'login-card' },
        UI.h('div', { class: 'login-left' },
          UI.h('div', { class: 'login-brand' },
            UI.h('div', { class: 'brand-mark', html: '<svg width="22" height="22" viewBox="0 0 32 32" fill="none"><path d="M7 22l5.5-7 4 3.5L26 8" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="8" r="2.6" fill="#f59e0b" stroke="white" stroke-width="1.4"/></svg>' }),
            UI.h('div', {}, UI.h('div', {}, 'BuildNova AI'), UI.h('div', { class: 'login-tag' }, 'FROM FIELD UPDATES TO SCHEDULE INTELLIGENCE'))),
          UI.h('h1', {}, 'Intelligent Infrastructure Progress Management'),
          UI.h('p', { class: 'lead' }, 'Field execution data is disconnected from project schedules. BuildNova AI converts real-world field updates into structured L5/L6 progress — matched, scored and approved before any schedule change.'),
          UI.h('div', { class: 'login-safety' }, '🛡 ', UI.h('b', {}, 'AI recommends. Planner approves.'), ' — the official schedule is never modified without human sign-off.'),
        ),
        UI.h('div', { class: 'login-right' },
          UI.h('h2', {}, 'Sign in'),
          UI.h('div', { class: 'sub' }, 'SIH 2026 · Problem Statement SIH2612 · Prototype demo auth'),
          UI.h('form', { onsubmit: e => { e.preventDefault(); doLogin(); } },
            demoF, emailF, pwF,
            UI.h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Sign In')),
          UI.h('div', { class: 'demo-logins' },
            UI.h('div', { class: 'lbl' }, 'Demo accounts · any password'),
            credRow('Supervisor'),
            credRow('Planner'),
            credRow('Project Manager')),
          UI.h('div', { class: 'login-foot' }, 'Simulated authentication for demonstration · Data resets with RESET DEMO · build ' + BUILD),
        ),
      ));
    app.appendChild(wrap);
  }

  /* ------------------------------ App chrome ----------------------------- */
  function renderChrome() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    const d = state.data;

    const sidebar = UI.h('aside', { class: 'sidebar' + (state.sidebarCollapsed ? ' collapsed' : '') + (state.mobileOpen ? ' mobile-open' : ''), id: 'sidebar' });
    sidebar.appendChild(UI.h('div', { class: 'sb-head' },
      UI.h('div', { class: 'sb-brand' },
        UI.h('div', { class: 'brand-mark', html: '<svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M7 22l5.5-7 4 3.5L26 8" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="8" r="2.6" fill="#f59e0b"/></svg>' }),
        UI.h('span', { class: 'bt' }, 'BuildNova AI')),
      UI.h('div', { class: 'sb-tag' }, !state.sidebarCollapsed ? 'From Field Updates to Schedule Intelligence' : '')));

    sidebar.appendChild(UI.h('div', { class: 'sb-project' },
      UI.h('div', { class: 'pl' }, 'Current Project'),
      UI.h('div', { class: 'pn' }, d.project.name),
      UI.h('div', { class: 'pd' }, `${d.project.status} · Data date ${UI.FMT.date(d.project.data_date)}`)));

    const nav = UI.h('nav', { class: 'sb-nav' });
    const counts = {
      pending: d.notifications.counters.pending_reviews,
      reports: d.reports.filter(r => r.processing_status === 'submitted').length,
      risks: d.notifications.counters.high_risks,
    };
    NAV.forEach(g => {
      nav.appendChild(UI.h('div', { class: 'group' }, g.group));
      g.items.forEach(it => {
        const badge = counts[it.badge] ? UI.h('span', { class: 'nbadge' + (it.id === 'risk' ? ' red' : '') }, counts[it.badge]) : null;
        // Rendered as real links: even if a JS handler ever fails, the browser's
        // native hash navigation still fires hashchange and renders the page.
        // An inline handler is attached directly to the element too, so clicks
        // navigate even inside sandboxed iframes where delegated listeners or the
        // History API may be restricted.
        nav.appendChild(UI.h('a', {
          href: it.route,
          class: 'nav-item' + (state.route === it.route ? ' active' : ''),
          title: it.label,
          'data-route': it.route,
          // Fast path: render right away. We intentionally do NOT preventDefault,
          // so the browser's own hash navigation always happens as a fallback and
          // hashchange/watchdog render the page even if this handler fails.
          onclick: () => go(it.route),
        }, UI.h('span', { class: 'nic' }, it.icon), UI.h('span', { class: 'nlabel' }, it.label), badge));
      });
    });
    sidebar.appendChild(nav);

    const initials = API.session.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    sidebar.appendChild(UI.h('div', { class: 'sb-user' },
      UI.h('div', { class: 'avatar' }, initials),
      UI.h('div', { class: 'uinfo' }, UI.h('div', { class: 'un' }, API.session.name), UI.h('div', { class: 'ur' }, API.session.role + ' · ' + BUILD)),
      UI.h('button', { class: 'logout', title: 'Logout', onclick: async () => { await API.logout(); location.hash = '#/login'; boot(); } }, '⏻')));

    const main = UI.h('main', { class: 'main' + (state.sidebarCollapsed ? ' expanded' : '') });

    // topbar
    const searchInput = UI.h('input', { type: 'search', placeholder: 'Search activities, reports, memory, audit…  (e.g. P102, Pipe Rack B, material delay)' });
    const srBox = UI.h('div', { class: 'search-results' });
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (q.length < 2) { srBox.classList.remove('open'); return; }
      searchTimer = setTimeout(async () => {
        try {
          const res = await API.search(q);
          srBox.innerHTML = '';
          if (!res.results.length) srBox.appendChild(UI.h('div', { class: 'sr-item' }, UI.h('div', {}, UI.h('div', { class: 'sr-title muted' }, 'No matches found'))));
          res.results.slice(0, 12).forEach(r => srBox.appendChild(
            UI.h('div', { class: 'sr-item', onclick: () => { go(r.link); srBox.classList.remove('open'); searchInput.value = ''; } },
              UI.h('span', { class: 'sr-type' }, r.type),
              UI.h('div', {}, UI.h('div', { class: 'sr-title' }, r.title), UI.h('div', { class: 'sr-sub' }, r.sub)))));
          srBox.classList.add('open');
        } catch (e) {}
      }, 220);
    });

    const notifBtn = UI.h('button', { class: 'icon-btn', title: 'Notifications', id: 'notif-btn' }, '🔔',
      d.notifications.counters.pending_reviews + d.notifications.counters.high_risks > 0
        ? UI.h('span', { class: 'ndot' }, d.notifications.counters.pending_reviews + d.notifications.counters.high_risks) : null);
    const notifPanel = UI.h('div', { class: 'notif-panel', id: 'notif-panel' });
    notifBtn.addEventListener('click', e => { e.stopPropagation(); renderNotifications(notifPanel); notifPanel.classList.toggle('open'); });

    const topbar = UI.h('header', { class: 'topbar' },
      UI.h('button', {
        class: 'hamburger',
        onclick: () => {
          state.mobileOpen = !state.mobileOpen;
          document.getElementById('sidebar').classList.toggle('mobile-open', state.mobileOpen);
          document.getElementById('drawer-back').classList.toggle('open', state.mobileOpen);
        },
      }, '☰'),
      UI.h('button', { class: 'icon-btn', title: 'Collapse sidebar', onclick: () => { state.sidebarCollapsed = !state.sidebarCollapsed; renderChrome(); renderPage(); } }, '⇤'),
      UI.h('div', { class: 'global-search' }, UI.h('span', { class: 'gs-ico' }, '🔎'), searchInput, srBox),
      UI.h('div', { class: 'tb-spacer' }),
      can.resetDemo() ? UI.h('button', { class: 'tb-demo', title: 'Reset and load the P102 demo scenario (3–5 min judge flow)', onclick: loadDemo }, '⚡', UI.h('span', { class: 'txt' }, 'LOAD DEMO')) : null,
      notifBtn, notifPanel);

    const content = UI.h('div', { class: 'content', id: 'content' });
    main.appendChild(topbar);
    main.appendChild(content);

    const closeMobileNav = () => {
      state.mobileOpen = false;
      sidebar.classList.remove('mobile-open');
      back.classList.remove('open');
    };
    const back = UI.h('div', {
      class: 'drawer-back' + (state.mobileOpen ? ' open' : ''),
      id: 'drawer-back',
      onclick: closeMobileNav,
    });

    app.appendChild(sidebar);
    app.appendChild(back);
    app.appendChild(main);
  }

  function renderNotifications(panel) {
    const d = state.data;
    panel.innerHTML = '';
    const c = d.notifications.counters;
    const items = [
      c.pending_reviews ? { ico: '📥', sev: 'warning', t: `${c.pending_reviews} field report(s) require planner review.`, link: '#/review' } : null,
      c.unmatched ? { ico: '❓', sev: 'warning', t: `${c.unmatched} report(s) have no reliable L5/L6 match — manual selection needed.`, link: '#/review' } : null,
      c.high_risks ? { ico: '🚨', sev: 'danger', t: `${c.high_risks} high/critical-risk activity/activities detected.`, link: '#/risk' } : null,
      c.new_delays ? { ico: '⏱', sev: 'danger', t: `${c.new_delays} delayed activity/activities on the schedule.`, link: '#/risk' } : null,
      c.failed ? { ico: '⛔', sev: 'danger', t: `${c.failed} report(s) failed processing — paste fallback available.`, link: '#/reports' } : null,
    ].filter(Boolean);
    d.notifications.feed.slice(0, 7).forEach(n => items.push({ ico: n.severity === 'danger' ? '🚨' : n.severity === 'warning' ? '⚠️' : n.severity === 'success' ? '✅' : 'ℹ️', sev: n.severity, t: n.message, time: n.at, link: n.kind.includes('review') || n.kind.includes('match') ? '#/review' : (n.kind.includes('risk') || n.kind.includes('downstream') || n.kind.includes('delay') ? '#/risk' : '#/reports') }));
    if (!items.length) { panel.appendChild(UI.empty('🔔', 'All clear', 'No notifications right now.')); return; }
    items.forEach(it => panel.appendChild(UI.h('div', { class: 'notif-item severity-' + (it.sev || 'info'), onclick: () => { if (it.link) go(it.link); panel.classList.remove('open'); } },
      UI.h('span', { class: 'ni-ico' }, it.ico),
      UI.h('div', {}, UI.h('div', {}, it.t), it.time ? UI.h('div', { class: 'ni-time' }, UI.FMT.dt(it.time)) : null))));
  }

  async function loadDemo() {
    UI.confirmBox('Load / Reset Demo Scenario',
      'This resets the environment to the P102 baseline: PIP-0453 "Erect Line 24-P-102" returns to Not Started, all approvals and audit entries from this session are cleared, and demo data is restored.',
      async () => {
        try {
          const r = await API.resetDemo();
          UI.toast(r.message || 'Demo environment loaded.', 'success');
          window.__demoFill = true;
          await refresh();
          location.hash = '#/reports';
          UI.toast('The P102 demo report is pre-filled below — click PROCESS WITH AI.', 'info', 5200);
        } catch (e) { UI.toast(e.message, 'error'); }
      }, 'LOAD DEMO');
  }

  /* ------------------------------ Routing -------------------------------- */
  function renderPage() {
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = '';
    const route = state.route;
    const page = PAGES[route] || PAGES['#/dashboard'];
    try {
      page(content, { data: state.data, refresh, sync: syncData, role: role(), can });
    } catch (err) {
      // Never leave a silently blank page: show what went wrong inline.
      content.appendChild(UI.h('div', { class: 'card' },
        UI.h('div', { class: 'card-b', style: 'text-align:center;padding:34px' },
          UI.h('div', { style: 'font-size:30px' }, '⚠️'),
          UI.h('h3', { style: 'margin:8px 0 4px' }, 'This view hit an unexpected error'),
          UI.h('p', { class: 'muted', style: 'font-size:13px' }, (err && err.message) ? err.message : String(err)),
          UI.h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:12px', onclick: () => go(route) }, '↻ Try again'))));
    }
    try { document.dispatchEvent(new CustomEvent('charts:render')); } catch (e) {}
    content.scrollTop = 0;
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  // Central navigation. Renders the page directly from state (works even where
  // hash/location changes are restricted, e.g. inside sandboxed previews), then
  // syncs the URL best-effort without depending on hashchange events.
  function go(route) {
    const r = (typeof route === 'string' && route.indexOf('#/') === 0) ? route : '#/dashboard';
    try { console.info('[BuildNova] navigate ->', r); } catch (e) {}
    if (!API.isAuthed) {
      try { location.hash = '#/login'; lastHash = '#/login'; } catch (e) {}
      renderLogin();
      return;
    }
    state.mobileOpen = false;
    if (!state.data) {            // data still bootstrapping — let refresh() render
      state.route = r;
      try { history.replaceState(null, '', r); lastHash = r; } catch (e) {}
      refresh();
      return;
    }
    if (state.route !== r) state.route = r;
    try {
      renderChrome();
      renderPage();
    } catch (err) {
      UI.toast('Could not render ' + r + ': ' + (err && err.message ? err.message : err), 'error');
    }
    lastNavTs = Date.now();
    try { history.replaceState(null, '', r); lastHash = r; } catch (e) {
      try { if (location.hash !== r) { location.hash = r; lastHash = r; } } catch (e2) {}
    }
  }

  let lastNavTs = 0;   // last time go() rendered a page (guards double render)
  function onRouteChange() {
    const r = location.hash && location.hash.indexOf('#/') === 0 ? location.hash : null;
    if (!r) return;
    if (!API.isAuthed) { if (r !== '#/login') location.hash = '#/login'; return; }
    // Same route as the current view: only re-render if go() didn't just do it
    // (clicking the already-active item) — never leave the page blank.
    if (API.isAuthed && state.route === r) {
      if (state.data && Date.now() - lastNavTs > 500) { renderChrome(); renderPage(); }
      return;
    }
    go(r);
  }

  // Fallback delegation WITHOUT preventDefault — a safety net only; inline
  // handlers already run first. Native navigation is never blocked anywhere.
  document.addEventListener('click', e => {
    const item = e.target && e.target.closest ? e.target.closest('.nav-item') : null;
    if (!item) return;
    const route = item.getAttribute('data-route');
    if (route && Date.now() - lastNavTs > 500) go(route);
  });

  // Close open search/notification popups when clicking anywhere outside them.
  // Registered once at module scope (never accumulates across re-renders).
  document.addEventListener('click', e => {
    const sr = document.querySelector('.global-search .search-results');
    if (sr && sr.classList.contains('open') && !(e.target.closest && e.target.closest('.global-search'))) sr.classList.remove('open');
    const np = document.getElementById('notif-panel');
    if (np && np.classList.contains('open') && !(e.target.closest && e.target.closest('#notif-btn, #notif-panel'))) np.classList.remove('open');
  });

  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('popstate', onRouteChange);

  // Hash watchdog: if the URL hash changes in ANY way and the page is not already
  // showing that route (back/forward, direct link, any handler that failed to
  // render), render it. Polls so it works even where hashchange is unavailable.
  let lastHash = null;
  function routeTick() {
    let h = null;
    try { h = location.hash; } catch (e) {}
    if (!h || h.indexOf('#/') !== 0) { lastHash = h; return; }
    if (h === lastHash) return;
    lastHash = h;
    if (!API.isAuthed || !state.data) return;
    if (state.route !== h) {
      state.route = h;
      try { renderChrome(); renderPage(); } catch (err) { UI.toast('Could not render ' + h + ': ' + (err && err.message), 'error'); }
    } else {
      try { renderChrome(); renderPage(); } catch (err) { UI.toast('Could not refresh view: ' + (err && err.message), 'error'); }
    }
  }
  setInterval(routeTick, 200);

  function boot() {
    if (!API.isAuthed) { try { lastHash = location.hash; } catch (e) {} renderLogin(); return; }
    state.route = location.hash && location.hash !== '#/login' ? location.hash : (API.session.role === 'Supervisor' ? '#/reports' : '#/dashboard');
    try { lastHash = location.hash; } catch (e) {}
    try { console.info('[BuildNova] boot as', API.session.role, '->', state.route); } catch (e) {}
    refresh();
  }

  return {
    state, refresh, sync: syncData, boot, role, can, loadDemo, nav: go,
    openDemoReport() { window.__demoFill = true; go('#/reports'); },
  };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
