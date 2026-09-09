/* BuildNova AI — API client + session */
const API = (() => {
  const TOKEN_KEY = 'buildnova_token';
  let token = localStorage.getItem(TOKEN_KEY) || null;
  let session = JSON.parse(localStorage.getItem('buildnova_user') || 'null');

  // Transient tunnel/gateway/network conditions worth retrying — these never
  // reached (or were answered by) the app, so re-sending is safe.
  const RETRY_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 530]);
  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function call(method, url, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opt.headers['x-auth-token'] = token;
    if (body !== undefined) opt.body = JSON.stringify(body);

    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      let res = null;
      try {
        res = await fetch(url, opt);
      } catch (netErr) {
        lastErr = netErr;
        if (attempt < 3) { await delay([600, 1400, 2600][attempt]); continue; }
        throw new Error('Network connection interrupted. Please check the link and try again.');
      }
      let data = {};
      try { data = await res.json(); } catch (e) { /* non-json */ }
      if (res.status === 401) {
        token = null; session = null;
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('buildnova_user');
        if (location.hash !== '#/login') location.hash = '#/login';
        throw new Error(data.error || 'Session expired. Please log in again.');
      }
      if (RETRY_STATUS.has(res.status)) {
        lastErr = new Error(`Request failed (${res.status})`);
        if (attempt < 3) { await delay([600, 1400, 2600][attempt]); continue; }
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    }
    throw lastErr || new Error('Request failed — the connection was briefly unavailable.');
  }

  return {
    get session() { return session; },
    get isAuthed() { return !!token; },
    async login(role, email) {
      const data = await call('POST', '/api/auth/login', { role, email: email || `${role.toLowerCase().replace(' ', '')}@buildnova.ai`, password: 'demo' });
      token = data.token; session = data.user;
      localStorage.setItem(TOKEN_KEY, token); localStorage.setItem('buildnova_user', JSON.stringify(session));
      return data.user;
    },
    async logout() { try { await call('POST', '/api/auth/logout'); } catch (e) {} token = null; session = null;
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('buildnova_user'); },
    bootstrap: () => call('GET', '/api/bootstrap'),
    submitReport: b => call('POST', '/api/reports', b),
    uploadFile: b => call('POST', '/api/reports/upload', b),
    processReport: id => call('POST', `/api/reports/${id}/process`),
    approve: (id, body) => call('POST', `/api/matches/${id}/approve`, body),
    reject: (id, reason) => call('POST', `/api/matches/${id}/reject`, { reason }),
    recalculate: id => call('POST', `/api/matches/${id}/recalculate`),
    askMemory: q => call('POST', '/api/memory/ask', { q }),
    memory: q => call('GET', `/api/memory?q=${encodeURIComponent(q || '')}`),
    search: q => call('GET', `/api/search?q=${encodeURIComponent(q)}`),
    resetDemo: () => call('POST', '/api/demo/reset'),
    simulate: (activity_id, slip_days) => call('POST', '/api/simulate', { activity_id, slip_days }),
    brief: kind => call('GET', '/api/brief' + (kind ? '?kind=' + encodeURIComponent(kind) : '')),
    learned: () => call('GET', '/api/learned'),
    importSchedule: content => call('POST', '/api/import/schedule', { content }),
    async exportCsv(kind) {
      const res = await fetch(`/api/export/${kind}`, { headers: { 'x-auth-token': token } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = kind.replace('.csv', '') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    },
  };
})();
