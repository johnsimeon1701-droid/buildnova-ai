(() => {
/* BuildNova AI — Pages: What-If Simulator, Matching Review, Delay & Risk */
const { h } = UI;

/* ========================== WHAT-IF DELAY SIMULATOR ========================== */
PAGES['#/simulator'] = (root, ctx) => {
  const { data, role } = ctx;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'What-If Delay Simulator'),
      h('div', { class: 'ph-sub' }, 'Choose an activity and a slip to instantly trace the downstream cascade — successor activities that could be exposed. Simulation only; the official schedule is never changed.'))));

  // Activities that have successors OR are meaningfully linked are the useful sources; list all open ones first.
  const open = data.activities.filter(a => a.status !== 'done')
    .sort((a, b) => (b.successors ? b.successors.length : 0) - (a.successors ? a.successors.length : 0));

  const sel = h('select', { class: 'sim-sel' },
    h('option', { value: '' }, '— Select an activity to stress-test —'),
    ...open.map(a => h('option', { value: a.activity_id },
      `${a.activity_id} — ${a.activity_name}  (${a.status}${a.successors && a.successors.length ? ' · ' + a.successors.length + ' successor' + (a.successors.length > 1 ? 's' : '') : ''})`)));
  const slider = h('input', { type: 'range', min: 1, max: 60, value: 7, class: 'sim-slider' });
  const slipLbl = h('span', { class: 'sim-days', id: 'sim-days-lbl' }, '7 days');
  const runBtn = h('button', { class: 'btn btn-primary', onclick: run }, '🔀 Run Simulation');
  const out = h('div', { class: 'sim-out' });

  slider.addEventListener('input', () => { slipLbl.textContent = slider.value + ' day' + (slider.value === '1' ? '' : 's'); });

  const controlCard = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h3', {}, '🎚 Scenario controls')),
    h('div', { class: 'card-b' },
      h('div', { class: 'sim-row' }, h('label', { class: 'sim-lbl' }, 'Source activity'), sel),
      h('div', { class: 'sim-row' }, h('label', { class: 'sim-lbl' }, 'Hypothetical slip'),
        h('div', { class: 'sim-slider-row' }, slider, slipLbl)),
      h('div', { class: 'sim-row' }, runBtn),
      h('div', { class: 'sim-hint' }, 'ℹ️ Read-only scenario. No planned dates are modified and no approval is created.')));
  root.appendChild(controlCard);
  root.appendChild(out);

  async function run() {
    const id = sel.value;
    if (!id) {
      UI.toast('Select an activity first.', 'error');
      out.innerHTML = '';
      out.appendChild(h('div', { class: 'sim-error' }, '⚠️ No activity selected — choose one from the dropdown, then click Run Simulation.'));
      return;
    }
    runBtn.disabled = true; const old = runBtn.textContent; runBtn.textContent = 'Simulating…';
    out.innerHTML = '<div class="sim-loading">Running scenario…</div>';
    try {
      const r = await API.simulate(id, Number(slider.value));
      out.innerHTML = '';
      renderResult(r);
      UI.toast('Simulation complete — official schedule unchanged.', 'success', 2000);
    } catch (e) {
      out.innerHTML = '';
      out.appendChild(h('div', { class: 'sim-error' },
        h('div', { style: 'font-size:18px;margin-bottom:6px' }, '⚠️ Simulation could not run'),
        h('div', { class: 'muted', style: 'font-size:13px' }, String(e && e.message || e))));
      UI.toast('Simulation failed: ' + (e && e.message), 'error');
    }
    runBtn.disabled = false; runBtn.textContent = old;
  }

  function chainPill(chain) {
    return h('span', { class: 'sim-chain mono' }, (chain || []).join(' → '));
  }

  function groupCard(title, ico, items, cls, empty, renderItem) {
    const card = h('div', { class: 'card sim-group ' + cls });
    card.appendChild(h('div', { class: 'card-h' }, h('h3', {}, ico + ' ' + title, ' ' , h('span', { class: 'sim-count' }, items.length))));
    const body = h('div', { class: 'card-b' });
    if (!items.length) body.appendChild(h('div', { class: 'sim-empty' }, empty));
    else items.forEach(it => body.appendChild(renderItem(it)));
    card.appendChild(body);
    return card;
  }

  function renderResult(r) {
    const s = r.source;
    // Summary banner
    const banner = h('div', { class: 'sim-banner ' + (r.at_risk_count ? 'sim-banner-risk' : 'sim-banner-ok') },
      h('div', { class: 'sim-banner-ico' }, r.at_risk_count ? '⚠️' : '✅'),
      h('div', {},
        h('div', { class: 'sim-banner-title' },
          r.at_risk_count
            ? `Potential downstream risk to ${r.at_risk_count} open successor${r.at_risk_count > 1 ? 's' : ''} from a ${r.slip_days}-day slip`
            : `No open downstream activity is exposed by a ${r.slip_days}-day slip`),
        h('div', { class: 'sim-banner-sub' },
          `Source: ${s.activity_id} — ${s.activity_name} (planned finish ${UI.FMT.date(s.planned_finish)}). ${r.downstream_count} downstream activit${r.downstream_count === 1 ? 'y' : 'ies'} traced.`)));
    out.appendChild(banner);

    // At-risk
    out.appendChild(groupCard('Potentially exposed (not started)', '🚧', r.at_risk, 'sim-risk',
      'Every not-started successor has enough float to absorb this slip.',
      d => h('div', { class: 'sim-item' },
        h('div', { class: 'sim-item-top' },
          h('span', { class: 'mono sim-item-id' }, d.activity_id),
          h('span', { class: 'sim-item-name' }, d.activity_name),
          (function () {
            const ed = d.exposure_days;
            const badge = h('span', { class: 'badge ' + (ed !== null && ed < 0 ? 'b-red' : 'b-amber') });
            if (ed === null || ed === undefined) { badge.appendChild(document.createTextNode('Exposed — no date window')); }
            else if (ed < 0) { badge.appendChild(document.createTextNode('Exceeds float by ' + Math.abs(ed) + 'd')); }
            else { badge.appendChild(document.createTextNode('Only ' + ed + 'd float left')); }
            return badge;
          })()),
        h('div', { class: 'sim-item-meta' },
          'Depth ' + d.depth + ' · planned start ' + UI.FMT.date(d.planned_start) + ' · ' + d.discipline + ' · ' + d.location,
          h('div', { class: 'sim-chain-wrap' }, 'Chain: ', chainPill(d.chain))))));

    // Watch (in progress)
    out.appendChild(groupCard('Watch (already in progress)', '👀', r.watch, 'sim-watch',
      'No in-progress activities sit downstream.',
      d => h('div', { class: 'sim-item' },
        h('div', { class: 'sim-item-top' },
          h('span', { class: 'mono sim-item-id' }, d.activity_id),
          h('span', { class: 'sim-item-name' }, d.activity_name + '  (' + (d.progress || 0) + '% complete)'),
          h('span', { class: 'badge b-blue' }, 'In progress')),
        h('div', { class: 'sim-item-meta' }, 'Depth ' + d.depth + ' · ' + d.discipline + ' · ' + d.location,
          h('div', { class: 'sim-chain-wrap' }, 'Chain: ', chainPill(d.chain))))));

    // Started/done (protected)
    if (r.started_or_done && r.started_or_done.length) {
      out.appendChild(groupCard('Not affected (already started / complete)', '🟢', r.started_or_done, 'sim-safe',
        '', d => h('div', { class: 'sim-item sim-item-muted' },
          h('span', { class: 'mono sim-item-id' }, d.activity_id),
          h('span', { class: 'sim-item-name' }, d.activity_name),
          h('span', { class: 'badge b-green' }, d.status)))) ;
    }

    out.appendChild(h('div', { class: 'sim-footnote' }, '⚠️ This is a predictive what-if based on logical successors and planned dates — phrased as potential downstream risk. It does not assert a fixed project delay and never edits the baseline.'));
  }
};

/* ============================ MATCHING REVIEW ============================ */
PAGES['#/review'] = (root, ctx) => {
  const { data, refresh, role } = ctx;
  const isPlanner = role === 'Planner';
  const pending = data.reports.filter(r => r.processing_status === 'pending_review')
    .sort((a, b) => (a.match.total_confidence - b.match.total_confidence));

  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Matching Review'),
      h('div', { class: 'ph-sub' }, 'Planner workspace: verify AI extraction, inspect match signals, and approve — the official schedule changes only after your sign-off.'))));

  const banner = h('div', { class: 'safety-banner' },
    h('span', { class: 'sicon' }, '🛡'),
    h('div', {}, h('b', {}, 'AI recommends. Planner approves. '), h('span', { class: 'muted' }, 'The AI engine never modifies the official schedule on its own. High confidence (90–100%) enables quick approval; 70–89% requires verification; below 70% requires manual activity selection.')));
  root.appendChild(banner);

  if (!isPlanner) root.appendChild(h('div', { class: 'ai-note mb16' }, 'You are signed in as ', h('b', {}, role), '. Review is read-only for your role — only the Planner can approve, edit or reject matches. ', h('a', { href: '#/settings' }, 'Switch roles in Settings / demo login →')));

  if (!pending.length) {
    root.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-b' },
      UI.empty('✅', 'No pending approvals', 'All processed reports have been reviewed. Submit a new field report and process it with AI to see it here.',
        h('div', { class: 'flex', style: 'justify-content:center' },
          h('button', { class: 'btn btn-primary', onclick: () => location.hash = '#/reports' }, '📋 Go to Field Reports'),
          isPlanner ? h('button', { class: 'btn btn-ghost', onclick: () => App.loadDemo() }, '⚡ Reset & Load Demo') : null)))));
    return;
  }

  pending.forEach(r => root.appendChild(reviewCard(r, ctx)));
};

function reviewCard(r, ctx) {
  const { data, refresh, role } = ctx;
  const isPlanner = role === 'Planner';
  const ext = r.extraction;
  const match = r.match;
  const unmatched = match.status === 'unmatched';
  const band = E_band(match.total_confidence);

  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'card-h' },
    h('h3', {}, h('span', { class: 'mono' }, r.report_id), ' ', UI.confBadge(match.total_confidence, match.status)),
    h('span', { class: 'ch-sub' }, 'Submitted ', UI.FMT.date(r.report_date), ' by ', r.submitted_by),
    r.duplicate_of || match.duplicate_of ? h('span', { class: 'badge b-amber' }, 'Possible duplicate of ' + (r.duplicate_of || match.duplicate_of)) : null));

  const body = h('div', { class: 'card-b' });

  // split: report | extraction
  const split = h('div', { class: 'split' });
  split.appendChild(h('div', { class: 'review-panel' },
    h('div', { class: 'rp-h' }, '📄 Original Field Report'),
    h('div', { class: 'rp-b' }, h('div', { class: 'raw-report' }, r.raw_text))));

  const extPanel = h('div', { class: 'review-panel' }, h('div', { class: 'rp-h' }, '🤖 AI Extraction'), h('div', { class: 'rp-b' }));
  const extGrid = h('div', { class: 'ext-grid' },
    window.extCard('Activity ID', ext.activity_identifier, ext.evidence.identifier, '🏷'),
    window.extCard('Activity', ext.activity_description, ext.evidence.event, '🛠'),
    window.extCard('Discipline', ext.discipline, ext.evidence.discipline, '🏗'),
    window.extCard('Location', ext.location, ext.evidence.location, '📍'),
    window.extCard('Actual Start', ext.actual_start ? UI.FMT.dt(ext.actual_start) : null, ext.evidence.time, '🚦'),
    window.extCard('Actual Finish', ext.actual_finish ? UI.FMT.dt(ext.actual_finish) : null, null, '🏁'),
    window.extCard('Quantity', ext.quantity ? `${ext.quantity} ${ext.unit || ''}` : null, ext.evidence.quantity, '🔢'),
    window.extCard('Delay', ext.delay_reason, ext.delay_evidence, '⚠'));
  extPanel.children[1].appendChild(extGrid);
  split.appendChild(extPanel);
  body.appendChild(split);

  // recommendation
  const recBox = h('div', { class: 'recommend-box' + (unmatched ? ' unmatched' : '') + ' mt16' });
  recBox.appendChild(h('div', { class: 'flex', style: 'justify-content:space-between;flex-wrap:wrap' },
    h('div', { style: 'font-weight:700;font-size:14px' }, unmatched ? '❓ No reliable L5/L6 match found' : '⭐ Recommended Schedule Activity'),
    UI.confBadge(match.total_confidence, match.status)));

  if (!unmatched) {
    recBox.appendChild(h('div', { class: 'mt8', style: 'font-size:14px' },
      h('span', { class: 'mono', style: 'font-weight:800' }, match.activity_id), ' — ', h('b', {}, match.activity_name),
      h('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px' }, `WBS ${match.wbs} · L${match.level} · ${match.discipline} · ${match.location}`)));
    const weights = match.weights || { identifier: 30, semantic: 25, keyword: 20, discipline: 10, location: 10, wbs: 5 };
    const sigMount = h('div', { class: 'mt8' });
    Object.entries(match.scores || {}).forEach(([k, v]) => {
      const max = weights[k] || 10;
      sigMount.appendChild(h('div', { class: 'signal-row' },
        h('span', { class: 'sn', 'data-tip': signalTip(k), style: 'text-transform:capitalize;cursor:help' }, k.replace('_', ' ') + ' ⓘ'),
        h('div', { class: 'signal-track' }, h('div', { class: 'signal-fill' + (v === 0 ? ' miss' : ''), style: `width:${(v / max) * 100}%` })),
        h('span', { class: 'sv' }, `${v}/${max}`)));
    });
    recBox.appendChild(sigMount);
    recBox.appendChild(h('div', { class: 'muted mt8', style: 'font-size:12px;line-height:1.6' },
      h('b', {}, 'AI reasoning: '), Object.entries(match.signals || {}).map(([k, v]) => h('span', { style: 'display:block' }, '• ', v))));
  } else {
    recBox.appendChild(h('p', { class: 'mt8', style: 'font-size:13.5px;line-height:1.6' },
      (match.unknown_identifiers || []).length
        ? h('span', {}, 'Tag(s) ', h('b', { class: 'mono' }, match.unknown_identifiers.join(', ')), ' were found in the report but do not exist in the schedule. This may be a ', h('b', {}, 'new activity not yet in the baseline'), ' — it will NOT be created automatically.')
        : 'The report text is too vague to confidently link to any L5/L6 activity. Select the correct activity manually.'));
  }
  body.appendChild(recBox);

  // actions
  const actions = h('div', { class: 'review-actions mt16' });
  if (!isPlanner) {
    actions.appendChild(h('span', { class: 'badge b-gray' }, '🔒 Planner role required to decide'));
  } else {
    if (!unmatched) {
      actions.appendChild(h('button', {
        class: 'btn btn-approve',
        onclick: async e => {
          const btn = e.target;
          UI.confirmBox('Approve & Update Schedule',
            `Approve match ${match.activity_id} ("${match.activity_name}") for report ${r.report_id}?\n\nThis will set actual dates/progress (planned dates are never changed), record variance & delay, write the audit trail and update risk intelligence.`,
            async () => {
              btn.disabled = true;
              try {
                const res = await API.approve(r.report_id, {});
                UI.toast(`Approved — ${res.changes.length} field(s) updated on ${res.activity.activity_id}. Status: ${res.activity.status}.`, 'success', 5500);
                if (res.impacted.length) UI.toast(`Potential downstream risk flagged on ${res.impacted.length} successor activity/activities.`, 'warning', 5500);
                await refresh(true);
              } catch (err) { UI.toast(err.message, 'error'); btn.disabled = false; }
            }, 'APPROVE & UPDATE');
        }
      }, '✅ APPROVE & UPDATE'));
    }
    actions.appendChild(h('button', { class: 'btn btn-amber', onclick: () => editMatchModal(r, ctx) }, '✎ EDIT MATCH / SELECT ACTIVITY'));
    actions.appendChild(h('button', {
      class: 'btn btn-ghost', onclick: async () => {
        try { await API.recalculate(r.report_id); UI.toast('Match recalculated.', 'info'); await refresh(true); }
        catch (e) { UI.toast(e.message, 'error'); }
      }
    }, '↻ RECALCULATE'));
    actions.appendChild(h('button', {
      class: 'btn btn-danger', onclick: () => {
        UI.modal({
          title: 'Reject Match',
          body: h('div', {}, h('p', { style: 'margin-bottom:10px;font-size:13.5px' }, 'Rejecting discards the AI recommendation. No schedule changes will be made.'),
            (() => { const ta = h('textarea', { rows: 3, style: 'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px', placeholder: 'Reason (optional) — e.g. wrong discipline, duplicate report' }); card.__reason = ta; return ta; })()),
          footer: [h('button', { class: 'btn btn-ghost', onclick: () => document.getElementById('modal-root').innerHTML = '' }, 'Cancel'),
            h('button', { class: 'btn btn-danger', onclick: async () => {
              try { await API.reject(r.report_id, card.__reason.value); document.getElementById('modal-root').innerHTML = ''; UI.toast('Match rejected — schedule untouched.', 'warning'); await refresh(true); }
              catch (e) { UI.toast(e.message, 'error'); }
            } }, 'REJECT')],
        });
      }
    }, '✕ REJECT'));
  }
  if (band === 'medium') actions.appendChild(h('span', { class: 'badge b-amber' }, 'Planner verification required'));
  if (band === 'low' || unmatched) actions.appendChild(h('span', { class: 'badge b-red' }, 'Manual selection required — no auto-update'));
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

function E_band(c) { return c >= 90 ? 'high' : c >= 70 ? 'medium' : 'low'; }
function signalTip(k) {
  return {
    identifier: 'Identifier (30%): tag/line/equipment ID overlap, e.g. P102 ↔ Line 24-P-102.',
    semantic: 'Semantic (25%): meaning overlap between the field language and the activity description after synonym normalization.',
    keyword: 'Keyword (20%): work-type terms like erect, spool, weld, hydrotest, cable, foundation.',
    discipline: 'Discipline (10%): Civil / Piping / Mechanical / Electrical / Instrumentation / HSE agreement.',
    location: 'Location (10%): site location agreement, e.g. Pipe Rack B.',
    wbs: 'WBS/context (5%): WBS reference or consistent discipline/location context.',
  }[k] || k;
}

function editMatchModal(r, ctx) {
  const { data, refresh } = ctx;
  let picked = r.match.activity_id || null;
  const search = h('input', { type: 'search', placeholder: 'Search activities (ID, name, tag, location)…', style: 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:10px' });
  const list = h('div', { style: 'max-height:340px;overflow-y:auto' });

  function renderList() {
    const q = search.value.toLowerCase();
    const rows = data.activities.filter(a => a.status !== 'Completed' &&
      (!q || `${a.activity_id} ${a.activity_name} ${a.tag || ''} ${a.location} ${a.discipline}`.toLowerCase().includes(q)))
      .slice(0, 60);
    list.innerHTML = '';
    rows.forEach(a => {
      const cand = (r.match.candidates || []).find(c => c.activity_id === a.activity_id);
      list.appendChild(h('div', { class: 'rcand' + (picked === a.activity_id ? ' picked' : ''), onclick: () => { picked = a.activity_id; renderList(); } },
        h('span', { class: 'radio' }),
        h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:700;font-size:13px' }, h('span', { class: 'mono' }, a.activity_id), ' — ', a.activity_name),
          h('div', { class: 'muted', style: 'font-size:11.5px' }, `${a.discipline} · ${a.location} · ${a.status}`)),
        cand ? h('b', { style: 'font-size:12.5px' }, cand.total_confidence + '%') : null));
    });
    if (!rows.length) list.appendChild(UI.empty('🔍', 'No activities found', 'Try a different search.'));
  }
  search.addEventListener('input', renderList);
  renderList();

  UI.modal({
    title: `✎ Select Schedule Activity — ${r.report_id}`,
    wide: true,
    body: h('div', {},
      h('p', { class: 'muted', style: 'font-size:12.5px;margin-bottom:10px' }, 'Manual planner selection overrides the AI recommendation. Confidence is recorded as planner-verified in the audit trail.'),
      search, list),
    footer: [
      h('button', { class: 'btn btn-ghost', onclick: () => document.getElementById('modal-root').innerHTML = '' }, 'Cancel'),
      h('button', { class: 'btn btn-approve', onclick: async () => {
        if (!picked) { UI.toast('Select an activity first.', 'warning'); return; }
        try {
          const res = await API.approve(r.report_id, { activity_id: picked });
          document.getElementById('modal-root').innerHTML = '';
          UI.toast(`Approved with manual selection — ${res.activity.activity_id} updated (${res.changes.length} field(s)).`, 'success', 5500);
          await refresh(true);
        } catch (e) { UI.toast(e.message, 'error'); }
      } }, 'APPROVE SELECTED ACTIVITY'),
    ],
  });
}

/* ============================= DELAY & RISK ============================= */
PAGES['#/risk'] = (root, ctx) => {
  const { data } = ctx;
  root.appendChild(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Delay & Risk Intelligence'),
      h('div', { class: 'ph-sub' }, 'Automatically derived from actuals vs baseline, delay reasons, criticality and dependency chains. Downstream wording is deliberately advisory — critical-path impact is claimed only where schedule links support it.'))));

  const delayed = data.activities.filter(a => a.status === 'Delayed').sort((a, b) => Math.max(b.start_variance || 0, b.finish_variance || 0) - Math.max(a.start_variance || 0, a.finish_variance || 0));
  const atRisk = data.activities.filter(a => a.status !== 'Completed' && a.status !== 'Delayed' && (a.risk_score >= 25))
    .sort((a, b) => b.risk_score - a.risk_score);

  const ACTIONS = {
    Material: 'Expedite material / follow up procurement & delivery schedule',
    Manpower: 'Reallocate manpower / mobilise additional crew',
    Equipment: 'Arrange replacement equipment / crane re-slot',
    Weather: 'Re-sequence work to covered/indoor activities; monitor forecast',
    Safety: 'Resolve permit / safety hold with HSE; toolbox reinforcement',
    Design: 'Escalate design issue / close pending RFI with engineering',
    Access: 'Review access constraints; coordinate area handover',
    Other: 'Review operational hold with construction manager',
  };

  // Delayed section
  const dCard = h('div', { class: 'card' });
  dCard.appendChild(h('div', { class: 'card-h' }, h('h3', {}, '⏱ Delayed Activities'), h('span', { class: 'ch-sub' }, delayed.length + ' activities'),
    h('div', { class: 'ch-actions' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => API.exportCsv('delays.csv').catch(e => UI.toast(e.message, 'error')) }, '⬇ Delay report CSV'))));
  if (!delayed.length) dCard.appendChild(h('div', { class: 'card-b' }, UI.empty('🎉', 'No delayed activities', 'Nothing is currently behind baseline.')));
  else {
    const tbl = h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, ['Activity', 'Variance', 'Delay Reason', 'Discipline', 'Location', 'Risk', ''].map(x => h('th', { class: 'no-sort' }, x)))),
      h('tbody', {}, delayed.map(a => h('tr', { onclick: () => openActivity(a.activity_id, ctx) },
        h('td', { style: 'min-width:220px' }, h('div', { class: 'mono', style: 'font-weight:700' }, a.activity_id), h('div', {}, a.activity_name)),
        h('td', {}, h('span', { class: 'badge b-red' }, '+' + Math.max(a.start_variance || 0, a.finish_variance || 0) + ' days')),
        h('td', {}, a.delay_reason ? h('span', {}, a.delay_reason, h('div', { class: 'muted', style: 'font-size:11px' }, a.delay_category)) : h('span', { class: 'muted' }, 'Late dates')),
        h('td', {}, h('span', { class: 'badge b-teal' }, a.discipline)),
        h('td', {}, a.location),
        h('td', {}, UI.riskBadge(a.risk_level)),
        h('td', {}, '→')))));
    dCard.appendChild(h('div', { class: 'table-wrap' }, tbl));
  }
  root.appendChild(dCard);

  // At risk
  const rCard = h('div', { class: 'card' });
  rCard.appendChild(h('div', { class: 'card-h' }, h('h3', {}, '⚠ At-Risk Activities & Downstream Watch'), h('span', { class: 'ch-sub' }, atRisk.length + ' activities')));
  const rb = h('div', { class: 'card-b' });
  if (!atRisk.length) rb.appendChild(UI.empty('✅', 'No high-risk activities', 'Risk scores are low across the schedule.'));
  atRisk.slice(0, 14).forEach(a => {
    const ring = h('div', {});
    const downstream = (a.successors || []).map(id => data.activities.find(x => x.activity_id === id)).filter(Boolean);
    const actionText = ACTIONS[a.delay_category] || 'Review with planning team; monitor progress & re-sequence if slip continues';
    const info = h('div', { style: 'flex:1;min-width:260px' },
      h('div', { style: 'font-weight:700' }, h('span', { class: 'mono' }, a.activity_id), ' — ', a.activity_name),
      h('div', { class: 'muted', style: 'font-size:12.5px;margin:3px 0' }, a.discipline + ' · ' + a.location + ' · ' + a.status + ' · progress ' + (a.progress || 0) + '%' + (a.expected_progress ? ' (expected ~' + a.expected_progress + '%)' : '')),
      h('div', { style: 'font-size:12.5px;margin-top:5px' }, (a.risk_reasons || []).map(x => h('div', {}, '• ', x))),
      (a.downstream_watch && a.downstream_from && a.downstream_from.length)
        ? h('div', { class: 'badge b-amber', style: 'margin-top:7px' }, '🔗 Potential downstream risk from ' + a.downstream_from.join(', ')) : null,
      downstream.length
        ? h('div', { class: 'muted', style: 'font-size:12px;margin-top:5px' }, 'Successors that may be affected: ', downstream.map(d => h('span', { class: 'mono' }, d.activity_id, ' '))) : null,
      h('div', { style: 'margin-top:9px' }, h('span', { class: 'badge b-blue' }, '→ ' + actionText)));
    const rc = h('div', { class: 'risk-card rl-' + a.risk_level, onclick: () => openActivity(a.activity_id, ctx), style: 'cursor:pointer' },
      h('div', { class: 'flex', style: 'align-items:flex-start;gap:14px;flex-wrap:wrap' }, ring, info));
    rb.appendChild(rc);
    Charts.riskRing(ring, a.risk_score, a.risk_level);
  });
  rCard.appendChild(rb);
  root.appendChild(rCard);
};
})();
