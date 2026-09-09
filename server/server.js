/* ============================================================================
   BuildNova AI — Zero-dependency Node HTTP server
   REST API + static hosting + JSON persistence + RBAC.
   ========================================================================== */

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const E = require('./engine');
const { buildSeed, DATA_DATE } = require('./seed');

const PORT = process.env.PORT || 4730;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* --------------------------------- State ---------------------------------- */

let db = null;
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch (e) { console.error('save failed', e.message); }
}
function load() {
  try {
    if (fs.existsSync(DATA_FILE)) { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); return; }
  } catch (e) { console.error('load failed, reseeding', e.message); }
  db = buildSeed(); save();
}
load();

const sessions = new Map();

/* ------------------------------- HTTP utils ------------------------------- */

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Invalid JSON body')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json' };
function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0' };
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA client-side routing: only fall back to index.html for extensionless
      // navigation paths. Requests for asset files (.js/.css/images/etc.) that
      // don't exist must get a real 404, not a 200 HTML page mis-typed as JS.
      const isAssetRequest = path.extname(rel).length > 0;
      if (isAssetRequest) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, b2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); } else { res.writeHead(200, Object.assign({ 'Content-Type': 'text/html' }, noCache)); res.end(b2); }
      }); return;
    }
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }, noCache));
    res.end(buf);
  });
}

/* ---------------------------------- Auth ---------------------------------- */

function makeToken(user) {
  const token = Buffer.from(`${user.email}:${user.role}:${Date.now()}`).toString('base64');
  sessions.set(token, { email: user.email, role: user.role, name: user.name, title: user.title, ts: Date.now() });
  return token;
}
function authUser(req) {
  const tok = (req.headers['x-auth-token'] || '');
  return sessions.get(tok) || null;
}
function requireRole(user, ...roles) {
  return user && roles.includes(user.role);
}

/* ------------------------------- Domain ops ------------------------------- */

function findReport(id) { return db.reports.find(r => r.report_id === id); }
function findActivity(id) { return db.activities.find(a => a.activity_id === id); }

function newReportId() { return 'FR-' + String(db.seq.report++).padStart(3, '0'); }
function newAuditId() { return 'AUD-' + db.seq.audit++; }
function newMemId() { return 'MEM-' + db.seq.memory++; }

function addAudit(a) { db.audit.unshift(Object.assign({ audit_id: newAuditId(), timestamp: E.nowStamp() }, a)); }
function addMem(m) { db.memory.unshift(Object.assign({ memory_id: newMemId(), date: E.nowStamp().slice(0, 10) }, m)); }
function notify(kind, message, severity = 'info') {
  db.notifications.unshift({ id: 'N-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), kind, message, severity, read: false, at: E.nowStamp() });
  db.notifications = db.notifications.slice(0, 40);
}

function normText(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function textSimilarity(a, b) {
  const ta = normText(a).split(' '), tb = new Set(normText(b).split(' '));
  const hit = ta.filter(t => tb.has(t)).length;
  return hit / Math.max(10, ta.length);
}

function processReport(report) {
  const extraction = E.extractReport(report.raw_text, { report_date: report.report_date, discipline: report.discipline, location: report.location });
  report.extraction = extraction;
  const match = E.matchActivities(extraction, report.raw_text, db.activities, db.learned);

  // duplicate detection
  const dup = db.reports.find(r => r.report_id !== report.report_id && ['submitted','pending_review','approved','processed'].includes(r.processing_status) && textSimilarity(r.raw_text, report.raw_text) > 0.8);
  if (dup) report.duplicate_of = dup.report_id;

  const base = {
    match_id: 'M-' + (db.seq.match++), report_id: report.report_id,
    decision: 'pending', decided_by: null, decided_at: null,
    unknown_identifiers: match.unknown_identifiers,
    candidates: match.candidates, weights: match.weights,
    duplicate_of: report.duplicate_of || null,
  };
  if (match.recommended) {
    report.match = Object.assign(base, match.recommended, { status: match.status });
  } else {
    const top = match.candidates[0];
    report.match = Object.assign(base, {
      status: match.status, activity_id: null, activity_name: null, discipline: null, location: null, wbs: null, level: null,
      scores: { identifier: 0, semantic: 0, keyword: 0, discipline: 0, location: 0, wbs: 0 },
      signals: {}, total_confidence: top ? top.total_confidence : 0,
    });
  }
  report.processing_status = 'pending_review';

  addMem({ source_type: 'extraction', source_id: report.report_id, activity_id: report.match.activity_id || null,
    title: `AI extraction processed — ${report.report_id}`,
    content: `Extracted identifier ${extraction.activity_identifier || 'none'}, event "${extraction.event || 'unknown'}", discipline ${extraction.discipline || 'unknown'}, location ${extraction.location || 'unknown'}${extraction.delay_reason ? ', delay: ' + extraction.delay_reason : ''}. Extraction confidence ${extraction.confidence}%; match ${report.match.status} (${report.match.total_confidence}%).`,
    tags: ['extraction', 'ai', report.discipline ? report.discipline.toLowerCase() : 'general', extraction.delay_category ? 'delay' : 'review'].filter(Boolean),
    date: report.report_date });

  if (report.match.status === 'unmatched') notify('unmatched', `Report ${report.report_id}: no reliable L5/L6 match${match.unknown_identifiers.length ? ' (unknown tag ' + match.unknown_identifiers.join(', ') + ')' : ''} — manual selection required.`, 'warning');
  else if (report.match.status === 'ambiguous' || report.match.status === 'low') notify('low_confidence', `Report ${report.report_id}: ${report.match.status} match confidence (${report.match.total_confidence}%) — planner verification required.`, 'warning');
  else notify('pending_review', `${report.report_id} processed by AI — match confidence ${report.match.total_confidence}% (${report.match.activity_id}). Awaiting planner approval.`, 'info');
  if (report.duplicate_of) notify('duplicate', `Possible duplicate: ${report.report_id} resembles ${report.duplicate_of}.`, 'warning');

  save();
  return report;
}

function approveMatch(reportId, body, user) {
  const report = findReport(reportId);
  if (!report) return { error: 'Report not found' };
  if (report.processing_status !== 'pending_review') return { error: `Report is ${report.processing_status}; only pending reviews can be approved` };
  if (!report.extraction) return { error: 'Report has not been processed by AI yet' };

  const activityId = body.activity_id || report.match.activity_id;
  const activity = findActivity(activityId);
  if (!activity) return { error: 'No schedule activity selected. Please select an L5/L6 activity manually.' };

  // Planner edits to extracted values
  const ext = JSON.parse(JSON.stringify(report.extraction));
  if (body.edits) {
    if (body.edits.actual_start) ext.actual_start = body.edits.actual_start;
    if (body.edits.actual_finish) ext.actual_finish = body.edits.actual_finish;
    if (body.edits.quantity) ext.quantity = Number(body.edits.quantity);
    if (body.edits.delay_reason === '') { ext.delay_reason = null; ext.delay_category = null; }
    else if (body.edits.delay_reason) ext.delay_reason = body.edits.delay_reason;
  }

  const confForAudit = body.activity_id && body.activity_id !== report.match.activity_id
    ? (report.match.candidates.find(c => c.activity_id === activityId) || {}).total_confidence || report.match.total_confidence
    : report.match.total_confidence;
  const manualPick = body.activity_id && body.activity_id !== report.match.activity_id;

  const { changes } = E.applyApproval(activity, ext, db.project.data_date);
  const impacted = E.propagateDownstream(db.activities, activity, db.project.data_date);
  db.activities.forEach(a => E.recomputeRisk(a, db.project.data_date));

  report.processing_status = 'approved';
  report.linked_activity = activity.activity_id;
  report.match.decision = 'approved';
  report.match.decided_by = user.name;
  report.match.decided_at = E.nowStamp();
  if (manualPick) { report.match.activity_id = activity.activity_id; report.match.activity_name = activity.activity_name; report.match.manual_selection = true; }
  if (!activity.evidence_reports.includes(report.report_id)) activity.evidence_reports.push(report.report_id);

  // Adaptive learning: whenever the planner's final activity differs from the AI's original
  // recommendation (a correction/override OR an unmatched report manually mapped), teach the engine.
  let learnedNotes = [];
  const aiOriginal = report.match && report.match.candidates && report.match.recommended
    ? report.match.recommended.activity_id : null;
  const shouldLearn = manualPick || !aiOriginal || aiOriginal === null || report.match.manual_selection;
  if (manualPick) {
    if (!db.learned) db.learned = { mappings: [] };
    learnedNotes = E.learnCorrection(db.learned, report.raw_text, aiOriginal, activity);
    report.match.learned = learnedNotes.length;
    addAudit({ user: user.name, role: user.role, source_report: report.report_id, activity_id: activity.activity_id,
      field_changed: 'Adaptive Learning', old_value: aiOriginal || 'unmatched', new_value: 'Taught mapping → ' + activity.activity_id + (learnedNotes.length ? ' (' + learnedNotes.length + ' cue(s))' : ''),
      confidence: null, action: 'AI Learned', approval_status: 'System' });
    addMem({ source_type: 'learning', source_id: report.report_id, activity_id: activity.activity_id,
      title: `AI learned from planner correction — ${activity.activity_id}`,
      content: `Planner mapped report ${report.report_id} to "${activity.activity_name}". BuildNova learned ${learnedNotes.length} cue(s); similar future reports will recommend this activity.`,
      tags: ['adaptive-learning', 'ai', activity.discipline ? activity.discipline.toLowerCase() : 'general'] });
  }

  const fmtVal = (v) => {
    if (v === null || v === undefined || v === '') return 'NULL';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return E.fmtDateTime(s);
    return s;
  };
  changes.forEach(ch => addAudit({
    user: user.name, role: user.role, source_report: report.report_id, activity_id: activity.activity_id,
    field_changed: ch.field, old_value: fmtVal(ch.old), new_value: fmtVal(ch.new), confidence: confForAudit,
    action: manualPick ? 'Approved (manual match)' : 'Approved', approval_status: 'Approved',
  }));
  addAudit({ user: user.name, role: user.role, source_report: report.report_id, activity_id: activity.activity_id,
    field_changed: 'AI Match', old_value: 'Pending review', new_value: `${activity.activity_id} — ${activity.activity_name}`,
    confidence: confForAudit, action: 'Planner Approval', approval_status: 'Approved' });

  addMem({ source_type: 'approval', source_id: report.report_id, activity_id: activity.activity_id,
    title: `Schedule updated — ${activity.activity_id} approved by planner`,
    content: `Planner ${user.name} approved report ${report.report_id} → "${activity.activity_name}". Changes: ${changes.map(c => c.field).join(', ') || 'reviewed'}. Variance now +${Math.max(activity.start_variance || 0, activity.finish_variance || 0)} day(s); risk ${activity.risk_level}.${impacted.length ? ' Potential downstream impact flagged for: ' + impacted.map(i => i.activity_id).join(', ') + '.' : ''}`,
    tags: ['approval', 'schedule-update', activity.discipline.toLowerCase(), activity.delay_flag ? 'delay' : 'progress'] });
  if (activity.delay_flag) addMem({ source_type: 'delay', source_id: report.report_id, activity_id: activity.activity_id,
    title: `Delay confirmed — ${activity.activity_id} (${activity.delay_category})`,
    content: `${activity.delay_reason}. Planned start ${E.fmtDate(activity.planned_start)} vs actual ${E.fmtDateTime(activity.actual_start)}. Variance +${Math.max(activity.start_variance || 0, activity.finish_variance || 0)} day(s).`,
    tags: ['delay', activity.delay_category.toLowerCase(), activity.discipline.toLowerCase()], date: report.report_date });

  notify('schedule_update', `${activity.activity_id} updated: ${changes.length} field(s) changed${activity.delay_flag ? ' — delay recorded' : ''}.`, activity.risk_level === 'High' || activity.risk_level === 'Critical' ? 'danger' : 'success');
  if (impacted.length) notify('downstream', `Potential downstream risk: ${impacted.length} successor activity/activities may be affected by ${activity.activity_id}.`, 'warning');

  save();
  return { ok: true, changes, impacted, activity };
}

function rejectMatch(reportId, reason, user) {
  const report = findReport(reportId);
  if (!report) return { error: 'Report not found' };
  if (report.processing_status !== 'pending_review') return { error: 'Only pending reviews can be rejected' };
  report.processing_status = 'rejected';
  report.match.decision = 'rejected';
  report.match.decided_by = user.name;
  report.match.decided_at = E.nowStamp();
  addAudit({ user: user.name, role: user.role, source_report: report.report_id,
    activity_id: report.match.activity_id || '—', field_changed: 'AI Match',
    old_value: `Recommendation ${report.match.total_confidence}%`, new_value: reason ? `Rejected: ${reason}` : 'Rejected by planner',
    confidence: report.match.total_confidence, action: 'Rejected', approval_status: 'Rejected' });
  addMem({ source_type: 'decision', source_id: report.report_id, activity_id: report.match.activity_id,
    title: `Match rejected — ${report.report_id}`,
    content: `Planner ${user.name} rejected the AI recommendation for report ${report.report_id}${reason ? ': ' + reason : ''}. No schedule changes made.`,
    tags: ['rejection', 'review'] });
  save();
  return { ok: true };
}

function buildNotifications() {
  const pending = db.reports.filter(r => r.processing_status === 'pending_review');
  const highRisks = db.activities.filter(a => (a.risk_level === 'High' || a.risk_level === 'Critical') && a.status !== 'Completed');
  const delayed = db.activities.filter(a => a.status === 'Delayed');
  const unmatched = pending.filter(r => r.match && r.match.status === 'unmatched');
  const failed = db.reports.filter(r => r.processing_status === 'failed');
  const feed = db.notifications.slice(0, 15).map(n => n);
  return {
    counters: {
      pending_reviews: pending.length,
      high_risks: highRisks.length,
      new_delays: delayed.length,
      unmatched: unmatched.length,
      failed: failed.length,
    },
    high_risk_activities: highRisks.slice(0, 8).map(a => ({ activity_id: a.activity_id, activity_name: a.activity_name, risk_level: a.risk_level, risk_score: a.risk_score })),
    pending_list: pending.slice(0, 8).map(r => ({ report_id: r.report_id, confidence: r.match ? r.match.total_confidence : 0, status: r.match ? r.match.status : '?', activity_id: r.match ? r.match.activity_id : null })),
    delayed_list: delayed.slice(0, 8).map(a => ({ activity_id: a.activity_id, activity_name: a.activity_name, variance: Math.max(a.start_variance || 0, a.finish_variance || 0), delay_reason: a.delay_reason })),
    feed,
  };
}

/* --------------------------------- Router --------------------------------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;

  try {
    /* ---- Auth ---- */
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const role = body.role;
      const email = body.email ? String(body.email).trim().toLowerCase() : '';
      // Demo auth: password is not verified; role+email must match a seeded demo account.
      const user = email
        ? db.users.find(x => x.role === role && x.email === email)
        : db.users.find(x => x.role === role);
      if (!user) return send(res, 400, { error: 'No demo account matches that role and email. Use a quick demo-login button or the credentials shown on the login screen.' });
      const token = makeToken(user);
      return send(res, 200, { token, user: { name: user.name, email: user.email, role: user.role, title: user.title } });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const tok = req.headers['x-auth-token'];
      if (tok) sessions.delete(tok);
      return send(res, 200, { ok: true });
    }

    const user = authUser(req);
    if (p.startsWith('/api/') && p !== '/api/health') {
      if (!user) return send(res, 401, { error: 'Not authenticated. Please log in.' });
    }

    /* ---- Bootstrap (one fetch, tiny dataset) ---- */
    if (p === '/api/bootstrap' && req.method === 'GET') {
      // annotate activities with latest approved match confidence (display only)
      db.activities.forEach(a => { a.match_confidence = null; });
      db.reports.forEach(r => {
        if (r.linked_activity && r.match && r.match.decision === 'approved' && r.match.total_confidence) {
          const act = db.activities.find(x => x.activity_id === r.linked_activity);
          if (act) act.match_confidence = Math.max(act.match_confidence || 0, r.match.total_confidence);
        }
      });
      const analytics = E.computeAnalytics(db.activities, db.reports, db.project.data_date);
      return send(res, 200, {
        project: db.project, user,
        activities: db.activities, reports: db.reports,
        audit: db.audit.slice(0, 200), memory: db.memory.slice(0, 300),
        analytics, notifications: buildNotifications(),
      });
    }

    /* ---- Reports ---- */
    if (p === '/api/reports' && req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.raw_text || '').trim();
      if (text.length < 10) return send(res, 400, { error: 'Report text is too short (minimum 10 characters).' });
      if (!body.report_date || !E.parseDate(body.report_date)) return send(res, 400, { error: 'Valid report date is required (DD-Mon-YYYY).' });
      const dup = db.reports.find(r => textSimilarity(r.raw_text, text) > 0.85);
      const report = {
        report_id: newReportId(), report_date: body.report_date,
        submitted_by: body.submitted_by || user.name, submitter_role: user.role,
        discipline: body.discipline || null, location: body.location || null,
        raw_text: text, processing_status: 'submitted',
        extraction: null, match: null, linked_activity: null,
        created_at: E.nowStamp(), duplicate_of: dup ? dup.report_id : null, file_name: body.file_name || null,
      };
      db.reports.unshift(report);
      addMem({ source_type: 'report', source_id: report.report_id,
        title: `Field report submitted — ${report.report_id}`,
        content: text.replace(/\n/g, ' ').slice(0, 300),
        tags: ['field-report', (report.discipline || 'general').toLowerCase()], date: report.report_date });
      if (dup) notify('duplicate', `Possible duplicate: ${report.report_id} resembles ${dup.report_id}.`, 'warning');
      notify('report_submitted', `New field report ${report.report_id} submitted by ${report.submitted_by}.`, 'info');
      save();
      return send(res, 200, { ok: true, report, duplicate_warning: dup ? `This report closely resembles ${dup.report_id}.` : null });
    }

    if (p === '/api/reports/upload' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.filename || '').toLowerCase();
      const content = String(body.content || '');
      if (name.endsWith('.csv')) {
        const rows = E.parseCsv(content);
        if (rows.length < 2) return send(res, 400, { error: 'CSV appears empty. Use columns: Date,Submitted By,Discipline,Location,Text' });
        const head = rows[0].map(h => h.trim().toLowerCase());
        const created = [];
        rows.slice(1).forEach(r => {
          const get = col => { const i = head.findIndex(h => h.includes(col)); return i >= 0 ? r[i] : ''; };
          const txt = (get('text') || get('report') || '').trim();
          if (txt.length < 10) return;
          const report = {
            report_id: newReportId(), report_date: get('date') || db.project.data_date,
            submitted_by: get('by') || get('submitted') || user.name, submitter_role: user.role,
            discipline: get('discipline') || null, location: get('location') || null,
            raw_text: txt, processing_status: 'submitted', extraction: null, match: null,
            linked_activity: null, created_at: E.nowStamp(), duplicate_of: null, file_name: body.filename,
          };
          db.reports.unshift(report); created.push(report.report_id);
        });
        save();
        return send(res, 200, { ok: true, created: created.length, message: `${created.length} report(s) imported from ${body.filename}.` });
      }
      if (name.endsWith('.txt')) {
        return send(res, 200, { ok: true, text: content, message: 'Text file loaded — review and submit.' });
      }
      return send(res, 400, { error: 'XLSX/PDF parsing is not available in this prototype. Please paste the report text into the text area (TXT/CSV supported).' });
    }

    const procMatch = p.match(/^\/api\/reports\/([\w-]+)\/process$/);
    if (procMatch && req.method === 'POST') {
      const report = findReport(procMatch[1]);
      if (!report) return send(res, 404, { error: 'Report not found' });
      if (report.processing_status === 'approved') return send(res, 400, { error: 'This report is already approved and linked to the schedule.' });
      const processed = processReport(report);
      return send(res, 200, { ok: true, report: processed });
    }

    /* ---- Matching review ---- */
    const apprMatch = p.match(/^\/api\/matches\/([\w-]+)\/approve$/);
    if (apprMatch && req.method === 'POST') {
      if (!requireRole(user, 'Planner')) return send(res, 403, { error: 'Only the Planner can approve schedule updates. AI recommends. Planner approves.' });
      const body = await readBody(req);
      const result = approveMatch(apprMatch[1], body, user);
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }
    const rejMatch = p.match(/^\/api\/matches\/([\w-]+)\/reject$/);
    if (rejMatch && req.method === 'POST') {
      if (!requireRole(user, 'Planner')) return send(res, 403, { error: 'Only the Planner can reject matches.' });
      const body = await readBody(req);
      const result = rejectMatch(rejMatch[1], body.reason, user);
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }
    const recalcMatch = p.match(/^\/api\/matches\/([\w-]+)\/recalculate$/);
    if (recalcMatch && req.method === 'POST') {
      const report = findReport(recalcMatch[1]);
      if (!report) return send(res, 404, { error: 'Report not found' });
      report.processing_status = 'submitted'; report.match = null; report.extraction = null;
      const processed = processReport(report);
      return send(res, 200, { ok: true, report: processed });
    }

    /* ---- Project memory ---- */
    if (p === '/api/memory/ask' && req.method === 'POST') {
      const body = await readBody(req);
      const ans = E.answerQuestion(body.q || '', { memory: db.memory, activities: db.activities, reports: db.reports });
      return send(res, 200, ans);
    }
    if (p === '/api/memory' && req.method === 'GET') {
      const q = u.searchParams.get('q') || '';
      return send(res, 200, { entries: E.searchMemory(db.memory, q) });
    }

    /* ---- What-if delay impact simulator (read-only, no schedule change) ---- */
    if (p === '/api/simulate' && req.method === 'POST') {
      const body = await readBody(req);
      const actId = body.activity_id;
      const slip = Number(body.slip_days);
      if (!actId) return send(res, 400, { error: 'activity_id required' });
      if (!(slip >= 1 && slip <= 365)) return send(res, 400, { error: 'slip_days must be between 1 and 365' });
      const result = E.simulateDelay(db.activities, actId, slip);
      if (result.error) return send(res, 404, result);
      return send(res, 200, { ok: true, ...result, note: 'Simulation only — the official schedule is not changed.' });
    }

    /* ---- Auto daily/weekly progress brief (DPR/WPR) ---- */
    if (p === '/api/brief' && req.method === 'GET') {
      const brief = E.generateBrief(db, { kind: u.searchParams.get('kind') || 'daily' });
      return send(res, 200, brief);
    }

    /* ---- Adaptive-learning mapping count (for UI badge) ---- */
    if (p === '/api/learned' && req.method === 'GET') {
      return send(res, 200, { mappings: (db.learned && db.learned.mappings) || [], count: ((db.learned && db.learned.mappings) || []).length });
    }

    /* ---- Global search ---- */
    if (p === '/api/search' && req.method === 'GET') {
      const q = (u.searchParams.get('q') || '').trim();
      if (!q) return send(res, 200, { results: [] });
      const qu = q.toUpperCase();
      const qNorm = qu.replace(/[^A-Z0-9]/g, '');
      const results = [];
      db.activities.forEach(a => {
        const idSet = E.activityIdSet(a);
        const tagHit = idSet.some(i => i.includes(qNorm) || (qNorm.length >= 3 && i.includes(qNorm.slice(-4))));
        if (a.activity_id.includes(qu) || tagHit || a.activity_name.toLowerCase().includes(q.toLowerCase()) || (a.location || '').toLowerCase().includes(q.toLowerCase()) || a.wbs.toUpperCase().includes(qu) || (a.tag || '').toUpperCase().includes(qu))
          results.push({ type: 'Activity', id: a.activity_id, title: `${a.activity_id} — ${a.activity_name}`, sub: `${a.discipline} · ${a.location} · ${a.status}`, link: '#/schedule' });
      });
      db.reports.forEach(r => {
        if (r.report_id.includes(qu) || r.raw_text.toLowerCase().includes(q.toLowerCase()) || (r.submitted_by || '').toLowerCase().includes(q.toLowerCase()))
          results.push({ type: 'Report', id: r.report_id, title: `${r.report_id} — ${r.discipline || 'General'} @ ${r.location || 'site'}`, sub: r.raw_text.replace(/\n/g, ' ').slice(0, 90), link: '#/reports' });
      });
      E.searchMemory(db.memory, q).slice(0, 8).forEach(m =>
        results.push({ type: 'Memory', id: m.memory_id, title: m.title, sub: m.content.slice(0, 90), link: '#/memory' }));
      db.audit.filter(a => a.activity_id && a.activity_id.includes(qu)).slice(0, 6).forEach(a =>
        results.push({ type: 'Audit', id: a.audit_id, title: `${a.audit_id} — ${a.activity_id} ${a.field_changed}`, sub: `${a.user} · ${a.action}`, link: '#/audit' }));
      return send(res, 200, { results: results.slice(0, 30) });
    }

    /* ---- Demo controls ---- */
    if (p === '/api/demo/reset' && req.method === 'POST') {
      if (!requireRole(user, 'Planner', 'Project Manager')) return send(res, 403, { error: 'Resetting the demo dataset rebuilds the official schedule and requires Planner or Project Manager role.' });
      db = buildSeed(); save();
      addAudit({ user: user.name, role: user.role, source_report: 'Demo reset', activity_id: '—',
        field_changed: 'Dataset', old_value: 'current state', new_value: 'Demo baseline rebuilt', confidence: null, action: 'Demo Reset', approval_status: 'System' });
      save();
      return send(res, 200, { ok: true, message: 'Demo environment reset to baseline. PIP-0453 is Not Started; all approvals cleared.' });
    }

    /* ---- Export (CSV) ---- */
    if (p.startsWith('/api/export/') && req.method === 'GET') {
      const kind = p.split('/')[3];
      let csv = '', name = '';
      if (kind === 'schedule.csv') {
        name = 'buildnova_schedule.csv';
        csv = E.toCsv(db.activities, [
          { key: 'activity_id', label: 'Activity ID' }, { key: 'activity_name', label: 'Activity Name' },
          { key: 'wbs', label: 'WBS' }, { key: 'level', label: 'Level' }, { key: 'discipline', label: 'Discipline' },
          { key: 'location', label: 'Location' }, { key: 'planned_start', label: 'Planned Start' }, { key: 'planned_finish', label: 'Planned Finish' },
          { label: 'Actual Start', get: a => a.actual_start || '' }, { label: 'Actual Finish', get: a => a.actual_finish || '' },
          { key: 'progress', label: 'Progress %' }, { key: 'status', label: 'Status' },
          { label: 'Start Variance', get: a => a.start_variance || 0 }, { label: 'Finish Variance', get: a => a.finish_variance || 0 },
          { key: 'risk_level', label: 'Risk' },
        ]);
      } else if (kind === 'progress.csv') {
        name = 'buildnova_progress.csv';
        csv = E.toCsv(db.activities.filter(a => a.progress > 0), [
          { key: 'activity_id', label: 'Activity ID' }, { key: 'activity_name', label: 'Activity Name' },
          { key: 'discipline', label: 'Discipline' }, { key: 'location', label: 'Location' },
          { key: 'progress', label: 'Progress %' }, { key: 'status', label: 'Status' },
          { label: 'Planned Start', get: a => a.planned_start }, { label: 'Actual Start', get: a => a.actual_start || '' },
          { label: 'Actual Finish', get: a => a.actual_finish || '' }, { key: 'expected_progress', label: 'Expected %' },
        ]);
      } else if (kind === 'audit.csv') {
        name = 'buildnova_audit_trail.csv';
        csv = E.toCsv(db.audit, [
          { key: 'timestamp', label: 'Timestamp' }, { key: 'user', label: 'User' }, { key: 'role', label: 'Role' },
          { key: 'source_report', label: 'Source Report' }, { key: 'activity_id', label: 'Activity ID' },
          { key: 'field_changed', label: 'Field Changed' }, { key: 'old_value', label: 'Old Value' },
          { key: 'new_value', label: 'New Value' }, { key: 'confidence', label: 'AI Match %' },
          { key: 'action', label: 'Action' }, { key: 'approval_status', label: 'Approval Status' },
        ]);
      } else if (kind === 'delays.csv') {
        name = 'buildnova_delay_report.csv';
        csv = E.toCsv(db.activities.filter(a => a.delay_flag || a.status === 'Delayed'), [
          { key: 'activity_id', label: 'Activity ID' }, { key: 'activity_name', label: 'Activity Name' },
          { key: 'discipline', label: 'Discipline' }, { key: 'location', label: 'Location' },
          { key: 'delay_category', label: 'Delay Category' }, { key: 'delay_reason', label: 'Delay Reason' },
          { label: 'Variance (days)', get: a => Math.max(a.start_variance || 0, a.finish_variance || 0) },
          { key: 'status', label: 'Status' }, { key: 'risk_level', label: 'Risk Level' },
        ]);
      } else return send(res, 404, { error: 'Unknown export' });
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename=${name}` });
      return res.end(csv);
    }

    /* ---- Import (CSV schedule) ---- */
    if (p === '/api/import/schedule' && req.method === 'POST') {
      if (!requireRole(user, 'Planner', 'Project Manager')) return send(res, 403, { error: 'Import requires Planner or Project Manager role.' });
      const body = await readBody(req);
      const rows = E.parseCsv(body.content || '');
      if (rows.length < 2) return send(res, 400, { error: 'Empty or invalid CSV.' });
      const head = rows[0].map(h => h.trim().toLowerCase());
      let added = 0;
      rows.slice(1).forEach(r => {
        const get = (...cols) => { for (const c of cols) { const i = head.findIndex(h => h.includes(c)); if (i >= 0 && r[i]) return r[i].trim(); } return null; };
        const id = get('activity id', 'activity_id', 'id');
        if (!id || findActivity(id)) return;
        const ps = get('planned start', 'planned_start'); const pf = get('planned finish', 'planned_finish');
        if (!ps || !pf) return;
        db.activities.push({
          activity_id: id, activity_name: get('activity name', 'name') || id,
          wbs: get('wbs') || 'IMP.X', level: Number(get('level')) || 5,
          discipline: get('discipline') || 'Civil', location: get('location') || 'Site',
          planned_start: ps, planned_finish: pf, actual_start: null, actual_finish: null,
          progress: 0, status: 'Not Started', predecessors: [], successors: [],
          planned_qty: Number(get('qty', 'quantity')) || null, unit: get('unit'), tag: null,
          start_variance: 0, finish_variance: 0, risk_score: 0, risk_level: 'Low', risk_reasons: [],
          delay_flag: false, delay_reason: null, delay_category: null, downstream_watch: false,
          downstream_from: [], expected_progress: 0, evidence_reports: [],
          keywords: [], search_text: (get('activity name', 'name') || '').toLowerCase(),
        });
        added++;
      });
      db.activities.forEach(a => E.recomputeRisk(a, db.project.data_date));
      addAudit({ user: user.name, role: user.role, source_report: 'CSV import', activity_id: '—',
        field_changed: 'Schedule import', old_value: '—', new_value: `${added} activity/activities imported`, confidence: null, action: 'Import', approval_status: 'System' });
      save();
      return send(res, 200, { ok: true, added, message: `${added} activity/activities imported into schedule.` });
    }

    if (p === '/api/health') return send(res, 200, { ok: true });

    /* ---- Static ---- */
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BuildNova AI server running on http://0.0.0.0:${PORT}`);
});
