/* BuildNova AI — UI helpers */
const UI = (() => {
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids.flat(Infinity).forEach(k => {
      if (k == null || k === false || k === true) return;
      if (typeof k === 'string' || typeof k === 'number') { e.appendChild(document.createTextNode(k)); return; }
      if (k instanceof Node) e.appendChild(k);
    });
    return e;
  }

  function toast(msg, type = 'info', ms = 4200) {
    const root = document.getElementById('toast-root');
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '⛔' };
    const t = h('div', { class: `toast ${type}` },
      h('span', { style: 'font-size:16px' }, icons[type] || 'ℹ️'),
      h('div', {}, msg),
      h('button', { class: 'tclose', onclick: () => close(t) }, '✕'));
    root.appendChild(t);
    const close = el => { el.classList.add('going'); setTimeout(() => el.remove(), 300); };
    setTimeout(() => close(t), ms);
  }

  function modal({ title, body, footer, wide }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } });
    const m = h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-h' }, h('h3', {}, title), h('button', { class: 'icon-btn', style: 'margin-left:auto', onclick: close }, '✕')),
      h('div', { class: 'modal-b' }, body),
      footer ? h('div', { class: 'modal-f' }, footer) : null);
    back.appendChild(m);
    root.appendChild(back);
    function close() { root.innerHTML = ''; document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', esc);
    return { close, modalEl: m };
  }

  function confirmBox(title, message, onOk, okLabel = 'Confirm', danger = false) {
    const root = document.getElementById('modal-root');
    const doClose = () => { root.innerHTML = ''; };
    const okBtn = h('button', {
      class: 'btn ' + (danger ? 'btn-danger' : 'btn-approve'),
      onclick: () => { doClose(); try { onOk(); } catch (e) { toast(e.message || 'Action failed', 'error'); } },
    }, okLabel);
    modal({
      title,
      body: h('p', { style: 'font-size:14px;line-height:1.6' }, message),
      footer: [
        h('button', { class: 'btn btn-ghost', onclick: doClose }, 'Cancel'),
        okBtn,
      ],
    });
  }

  const STATUS_BADGE = {
    'Completed': 'b-green', 'In Progress': 'b-blue', 'Not Started': 'b-gray', 'Delayed': 'b-red', 'At Risk': 'b-amber',
  };
  function statusBadge(s) { return h('span', { class: 'badge ' + (STATUS_BADGE[s] || 'b-gray') }, s || '—'); }

  function riskBadge(level) {
    const cls = { Critical: 'b-red', High: 'b-red', Medium: 'b-amber', Low: 'b-green' }[level] || 'b-gray';
    return h('span', { class: 'badge ' + cls }, level || 'Low');
  }

  function confBadge(c, status) {
    const band = c >= 90 ? ['high', 'HIGH'] : c >= 70 ? ['medium', 'MED'] : ['low', 'LOW'];
    return h('span', { class: `conf-pill conf-${band[0]}`, 'data-tip': c >= 90
      ? 'Match Confidence 90–100%: strong signals — quick planner approval recommended.'
      : c >= 70 ? 'Match Confidence 70–89%: plausible match — planner verification required.'
      : 'Match Confidence below 70%: weak signals — manual activity selection required.' },
      h('span', { class: 'conf-dot' }), `${c}% ${band[1]}${status === 'ambiguous' ? ' · AMBIGUOUS' : ''}${status === 'unmatched' ? ' · NO MATCH' : ''}`);
  }

  function progressBar(pct, status) {
    const cls = status === 'Delayed' ? 'delayed' : (pct >= 100 || status === 'Completed' ? 'done' : (status === 'At Risk' ? 'risk' : ''));
    return h('span', { class: 'progress-bar' },
      h('span', { class: 'fill ' + cls, style: `width:${Math.max(0, Math.min(100, pct))}%` }));
  }

  function pager(total, page, perPage, onGo) {
    const pages = Math.max(1, Math.ceil(total / perPage));
    return h('div', { class: 'pager' },
      h('button', { onclick: () => onGo(0), disabled: page === 0 }, '« First'),
      h('button', { onclick: () => onGo(page - 1), disabled: page === 0 }, '‹ Prev'),
      h('span', {}, `Page ${page + 1} of ${pages} — ${total} records`),
      h('button', { onclick: () => onGo(page + 1), disabled: page >= pages - 1 }, 'Next ›'),
      h('button', { onclick: () => onGo(pages - 1), disabled: page >= pages - 1 }, 'Last »'));
  }

  function empty(icon, title, text, action) {
    return h('div', { class: 'empty' },
      h('div', { class: 'eicon' }, icon),
      h('h4', {}, title),
      h('p', {}, text),
      action || null);
  }

  function fieldLabel(text, tip) {
    return h('label', {}, text, tip ? h('span', { class: 'muted', 'data-tip': tip, style: 'margin-left:5px;cursor:help;font-size:11px' }, 'ⓘ') : null);
  }

  const FMT = {
    date: s => s ? String(s).split('T')[0].split('-').reverse().join('-').replace(/^(\d{2})-(\d{2})-(\d{4})$/, (m, d, mo, y) => `${d}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo - 1]}-${y}`) : '—',
    dt: s => { if (!s) return '—'; const [d, t] = String(s).split('T'); return FMT.date(d) + (t ? ' ' + t.slice(0, 5) : ''); },
    varDays: v => v > 0 ? `+${v}d` : (v < 0 ? `${v}d` : '0d'),
  };

  function closeModal() { const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; }

  return { h, toast, modal, confirmBox, closeModal, statusBadge, riskBadge, confBadge, progressBar, pager, empty, fieldLabel, FMT };
})();
window.UIcloseModal = () => { const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; };
