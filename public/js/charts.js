/* BuildNova AI — Dependency-free SVG charts */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, txt) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (txt != null) e.textContent = txt;
    return e;
  };
  const COLORS = { teal: '#0891b2', tealLight: '#67e8f9', navy: '#17314d', green: '#16a34a', amber: '#d97706', red: '#dc2626', blue: '#2563eb', violet: '#7c3aed', slate: '#94a3b8' };
  const DISC_COLORS = { Civil: '#d97706', Piping: '#0891b2', Mechanical: '#2563eb', Electrical: '#7c3aed', Instrumentation: '#059669', HSE: '#dc2626' };
  const RISK_COLORS = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626', Critical: '#7f1d1d' };

  function mount(container, svg) {
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(svg);
  }

  /* Line chart: planned vs actual S-curve */
  function sCurve(container, points) {
    if (!container) return;
    const W = Math.max(container.clientWidth || 600, 320), H = 260, P = { l: 44, r: 14, t: 16, b: 34 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'max-width:100%' });
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const x = i => P.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * iw);
    const y = v => P.t + ih - (Math.min(100, v) / 100) * ih;
    // grid
    [0, 25, 50, 75, 100].forEach(v => {
      svg.appendChild(el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: '#e2e8f0', 'stroke-width': 1 }));
      const t = el('text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#94a3b8' }, v + '%');
      svg.appendChild(t);
    });
    const path = (key, color, dash) => {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': dash || 'none' }));
      points.forEach((p, i) => svg.appendChild(el('circle', { cx: x(i), cy: y(p[key]), r: 3, fill: color })));
    };
    path('planned', COLORS.slate, '6 4');
    path('actual', COLORS.teal);
    // x labels (first / mid / last)
    const lbl = [0, Math.floor(points.length / 2), points.length - 1];
    lbl.forEach(i => {
      if (!points[i]) return;
      const d = points[i].date.slice(5);
      svg.appendChild(el('text', { x: x(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 10, fill: '#64748b' }, d));
    });
    // legend
    const leg = [['Planned', COLORS.slate, '6 4'], ['Actual', COLORS.teal, 'none']];
    leg.forEach((l, i) => {
      const lx = W - P.r - 150 + i * 78;
      svg.appendChild(el('line', { x1: lx, x2: lx + 20, y1: 12, y2: 12, stroke: l[1], 'stroke-width': 2.6, 'stroke-dasharray': l[2] }));
      svg.appendChild(el('text', { x: lx + 25, y: 16, 'font-size': 11, fill: '#475569', 'font-weight': 600 }, l[0]));
    });
    mount(container, svg);
  }

  /* Horizontal progress bars by discipline */
  function hBars(container, items) {
    if (!container) return;
    const rowH = 34, W = Math.max(container.clientWidth || 500, 280);
    const H = items.length * rowH + 10;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });
    items.forEach((it, i) => {
      const yy = i * rowH + 6;
      const color = DISC_COLORS[it.discipline] || COLORS.teal;
      svg.appendChild(el('text', { x: 0, y: yy + 15, 'font-size': 12, fill: '#334155', 'font-weight': 600 }, it.discipline));
      const bx = 108, bw = W - bx - 52;
      svg.appendChild(el('rect', { x: bx, y: yy + 4, width: bw, height: 16, rx: 8, fill: '#eef2f6' }));
      svg.appendChild(el('rect', { x: bx, y: yy + 4, width: Math.max(2, (it.progress / 100) * bw), height: 16, rx: 8, fill: color }));
      svg.appendChild(el('text', { x: W - 44, y: yy + 17, 'font-size': 11.5, fill: '#334155', 'font-weight': 700 }, it.progress + '%'));
    });
    mount(container, svg);
  }

  /* Donut chart */
  function donut(container, data, opts = {}) {
    if (!container) return;
    const size = 190, cx = size / 2, cy = size / 2, r = 68, sw = 22;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size + (opts.legend === 'bottom' ? 70 : 0)}`, width: '100%', style: `max-width:${opts.legend === 'bottom' ? 240 : 200}px;margin:0 auto;display:block` });
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let angle = -90;
    const arc = (a0, a1) => {
      const rad = a => (a * Math.PI) / 180;
      const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
      const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
      const large = a1 - a0 > 180 ? 1 : 0;
      return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
    };
    data.forEach(d => {
      if (!d.value) return;
      const a1 = angle + (d.value / total) * 360;
      const path = el('path', { d: arc(angle + 0.8, a1 - 0.8), fill: 'none', stroke: d.color, 'stroke-width': sw });
      const tip = el('title', {}, `${d.label}: ${d.value}`);
      path.appendChild(tip);
      svg.appendChild(path);
      angle = a1;
    });
    svg.appendChild(el('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 750, fill: '#0f1e30' }, String(total)));
    svg.appendChild(el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#64748b', 'font-weight': 600 }, opts.centerLabel || 'total'));
    if (opts.legend !== false) {
      const lx = 14;
      data.forEach((d, i) => {
        const ly = size + 16 + i * 16;
        svg.appendChild(el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: d.color }));
        svg.appendChild(el('text', { x: lx + 16, y: ly, 'font-size': 11, fill: '#475569', 'font-weight': 600 }, `${d.label} (${d.value})`));
      });
    }
    mount(container, svg);
  }

  /* Vertical bars (delay reasons) */
  function vBars(container, data) {
    if (!container) return;
    const W = Math.max(container.clientWidth || 500, 300), H = 230, P = { l: 30, r: 8, t: 14, b: 46 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const max = Math.max(2, ...data.map(d => d.value));
    const bw = iw / data.length * 0.62;
    data.forEach((d, i) => {
      const x = P.l + (i + 0.19) * (iw / data.length);
      const h = (d.value / max) * ih;
      svg.appendChild(el('rect', { x, y: P.t + ih - h, width: bw, height: Math.max(0, h), rx: 4, fill: d.color || COLORS.teal }));
      if (d.value) svg.appendChild(el('text', { x: x + bw / 2, y: P.t + ih - h - 5, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#334155' }, d.value));
      const lbl = el('text', { x: x + bw / 2, y: H - 26, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#64748b', 'font-weight': 600 }, d.label);
      lbl.setAttribute('transform', `rotate(-28 ${x + bw / 2} ${H - 26})`);
      svg.appendChild(lbl);
    });
    [0, Math.round(max / 2), max].forEach(v => {
      const yy = P.t + ih - (v / max) * ih;
      svg.appendChild(el('line', { x1: P.l, x2: W - P.r, y1: yy, y2: yy, stroke: '#eef2f6' }));
      svg.appendChild(el('text', { x: P.l - 6, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#94a3b8' }, v));
    });
    mount(container, svg);
  }

  /* Risk score ring */
  function riskRing(container, score, level) {
    if (!container) return;
    const size = 52, c = size / 2, r = 20;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: 52, height: 52 });
    const circ = 2 * Math.PI * r;
    svg.appendChild(el('circle', { cx: c, cy: c, r, fill: 'none', stroke: '#e2e8f0', 'stroke-width': 5 }));
    svg.appendChild(el('circle', { cx: c, cy: c, r, fill: 'none', stroke: RISK_COLORS[level] || '#94a3b8', 'stroke-width': 5,
      'stroke-dasharray': `${(score / 100) * circ} ${circ}`, 'stroke-linecap': 'round', transform: `rotate(-90 ${c} ${c})` }));
    svg.appendChild(el('text', { x: c, y: c + 4, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 750, fill: '#0f1e30' }, score));
    mount(container, svg);
  }

  return { sCurve, hBars, donut, vBars, riskRing, COLORS, DISC_COLORS, RISK_COLORS };
})();
