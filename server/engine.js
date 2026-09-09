/* ============================================================================
   BuildNova AI — Core Engine
   Deterministic NLU extraction + hybrid L5/L6 activity matching + delay/risk
   + analytics + project memory. Pure functions, no external dependencies.
   ========================================================================== */

'use strict';

/* ----------------------------- Date utilities ---------------------------- */

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dstr(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (m) return new Date(+m[3], MONTHS[m[2].slice(0,3).toLowerCase()], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${MON_ABBR[d.getMonth()]}-${d.getFullYear()}`;
}
function fmtDateTime(s) {
  if (!s) return '—';
  const [date, time] = String(s).split('T');
  const d = parseDate(date);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}-${MON_ABBR[d.getMonth()]}-${d.getFullYear()}${time ? ' ' + time.slice(0,5) : ''}`;
}
function isoDate(d) { return dstr(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate()+n); return isoDate(d); }
function daysBetween(a, b) {
  const da = parseDate(a), db = parseDate(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* --------------------------- Text normalization -------------------------- */

const STOPWORDS = new Set(('the a an at in on of to for and was were is are be been being with from by as it this that we our their his her ' +
  'today yesterday tomorrow work worked working has have had will would shall can could should about into onto over under near ' +
  'pm am hrs hr hours hour mins min minutes no not but however due because since after before during all any some more most ' +
  'site area team crew men man people person one two three four five six seven eight nine ten also then than very just only ' +
  'new old got get got made make done do did took take given give came come went go see seen saw up down out off per via').split(' '));

const SYNONYMS = {
  erection:'erect', erected:'erect', erects:'erect', erecting:'erect',
  welding:'weld', welded:'weld', welds:'weld', welders:'welder',
  hydrotesting:'hydrotest', hydrotested:'hydrotest', hydro:'hydrotest', 'hydro-tested':'hydrotest', 'hydro-testing':'hydrotest',
  installation:'install', installed:'install', installs:'install', installing:'install',
  completed:'complete', completion:'complete', completes:'complete',
  finished:'finish', finishes:'finish',
  commenced:'start', begins:'begin', began:'begin', starting:'start', starts:'start', started:'start',
  spools:'spool', pipes:'pipe', pipelines:'pipeline', lines:'line', cables:'cable', pumps:'pump',
  foundations:'foundation', exchangers:'exchanger', vessels:'vessel', valves:'valve',
  trays:'tray', breakers:'breaker', transmitters:'transmitter', instruments:'instrument',
  joints:'joint', metres:'meter', meters:'meter', tonnes:'tonne', piles:'pile', points:'point',
  lights:'light', columns:'column', tanks:'tank', racks:'rack', motors:'motor',
  excavation:'excavate', excavated:'excavate', excavating:'excavate',
  concreting:'concrete', concreted:'concrete', poured:'pour', pouring:'pour',
  grading:'grade', graded:'grade', backfilling:'backfill', backfilled:'backfill',
  alignment:'align', aligned:'align', aligning:'align',
  calibration:'calibrate', calibrated:'calibrate', calibrating:'calibrate',
  pulling:'pull', pulled:'pull', laying:'lay', laid:'lay',
  setting:'set', grouting:'grout', grouted:'grout',
  delay:'delayed', delays:'delayed', delaying:'delayed', late:'delayed',
  shortage:'short', arrived:'arrive', arriving:'arrive', delivery:'deliver', delivered:'deliver',
};

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
}
function rootToken(t) { return SYNONYMS[t] || t; }
function contentTokens(text) {
  return [...new Set(tokenize(text).map(rootToken).filter(t => !STOPWORDS.has(t) && t.length > 1))];
}

/* ---------------------------- Domain lexicons ----------------------------- */

  const DISCIPLINE_LEX = {
  'Piping':        ['pipe','piping','spool','flange','weld','hydrotest','bolt','fitup','fit','line','flushing','tiein','tie','isometric','joint','erect','flange'],
  'Civil':         ['civil','foundation','concrete','rebar','formwork','shuttering','centering','grade','grading','excavate','road','drainage','pile','backfill','earthwork','pour','curing','pit','trench','rcc','cement','aggregate','sand'],
  'Mechanical':    ['mechanical','pump','compressor','vessel','column','exchanger','rotating','equipment','align','grout','coupling','set','setting','motor','turbine','fan','blower','skid','rigging','lift','lifting','erect'],
  'Electrical':    ['electrical','cable','mcc','grounding','earthing','lighting','breaker','transformer','switchgear','pull','tray','conduit','busbar','junction','panel','power','ht','lt','voltage'],
  'Instrumentation':['instrument','transmitter','dcs','calibrate','tubing','gauge','valve','signal','loop','plc','fire','alarm','thermowell','orifice','flow','level','pressure','controller'],
  'HSE':           ['hse','safety','permit','toolbox','incident','drill','inspection','ppe','stoppage','mock','audit','hazard','risk','near','miss','injury','induction'],
};

const DELAY_LEX = {
  'Material':  ['material','cement','rebar','spool','delivery','deliver','arrive','came late','steel','cable','sand','aggregate','procured','procurement','supply','supplies','stores','short','not received','yet to receive'],
  'Manpower':  ['manpower','workers','worker','labour','labor','crew','welder','electrician','fitter','staff','mason','operator','shortage of men','absence','absent','mobilise','mobilize'],
  'Equipment': ['equipment','crane','excavator','breakdown','forklift','machine','compressor','generator','hydra','trailer','transport','vehicle','tool','tools'],
  'Weather':   ['rain','rainy','weather','storm','wind','flood','cyclone','monsoon','waterlogging','heat'],
  'Safety':    ['safety','incident','injury','permit','stoppage','stopped','ppe','violation','near miss','clash with safety','barricade'],
  'Design':    ['design','drawing','drawings','rfi','clash','isometric','approval','method statement','ifc','revision','pending approval','query'],
  'Access':    ['access','blocked','clearance','obstructed','road block','area not ready','not handed','handover','interference','congested'],
};

const EVENT_LEX = {
  start: ['started','start','commenced','commence','began','begin','kicked off','kickoff','initiated','taken up','took up','mob in','mobilised for'],
  finish:['completed','complete','finished','finish','handed over','handover','closed out','closeout','achieved','finalized'],
};

const NUM_WORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20 };

const KNOWN_LOCATIONS = ['Pipe Rack A','Pipe Rack B','Pipe Rack C','Unit 100','Unit 200','Unit 300','Tank Farm','Substation-1','Offsite Area','Area 50','Firewater Loop','Boiler House'];

/* ------------------------------ Identifier ops ---------------------------- */

function normId(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

const MONTH_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function extractIds(text) {
  const t = ' ' + String(text || '').toUpperCase() + ' ';
  const found = [];
  const push = (raw, kind) => {
    const n = normId(raw);
    if (n && !found.find(f => f.raw === raw)) found.push({ raw, norm: n, kind });
  };
  // Line numbers: 24-P-102 style (exclude dates like 05-SEP-2026)
  let re = /\b(\d{1,3})[-–]([A-Z]{1,3})[-–](\d{2,4})\b/g, m;
  while ((m = re.exec(t))) {
    if (MONTH_UPPER.includes(m[2])) continue; // it's a date
    push(m[0], 'line');
    push(`${m[2]}-${m[3]}`, 'tag'); // P-102
    push(`${m[2]}${m[3]}`, 'tag');   // P102
  }
  // Schedule IDs: PIP-0453 / CIV-0102
  re = /\b([A-Z]{3})[-](\d{3,5})\b/g;
  while ((m = re.exec(t))) {
    if (MONTH_UPPER.includes(m[1])) continue;
    push(m[0], 'activity');
  }
  // Equipment / line tags: P-901, P901, V-301, TK101, M-301, E-205
  re = /\b([A-Z]{1,4})[-]?(\d{2,5})\b/g;
  while ((m = re.exec(t))) {
    const pre = m[1];
    if (['AM','PM','ID','NO','HSE','RFI','MCC','DCS','PLC','PPE','HT','LT','IFC','ISO','QA','QC','EPC','WBS','L1','L2','L3','L4','L5','L6','MT','KM','HR','RS','SI','PS','PT','FT','TE','SEP','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','OCT','NOV','DEC'].includes(pre)) continue;
    if (MONTH_UPPER.includes(pre) && m[2].length === 4) continue; // SEP2026 style year
    if (pre.length < 1 || m[2].length < 2) continue;
    push(m[0], 'tag');
  }
  return found;
}

function activityIdSet(act) {
  const ids = [normId(act.activity_id)];
  extractIds(act.activity_name + ' ' + (act.tag || '')).forEach(i => ids.push(i.norm));
  return [...new Set(ids.filter(Boolean))];
}

function idTrailingNumber(norm) { const m = String(norm).match(/(\d+)$/); return m ? m[1] : null; }
function idLetters(norm) { const m = String(norm).match(/^([A-Z]+)/); return m ? m[1] : ''; }

function identifierPairScore(reportIds, actIds) {
  let best = 0, why = '';
  for (const r of reportIds) {
    for (const a of actIds) {
      let s = 0, reason = '';
      if (r.norm === a) { s = 30; reason = `Exact tag "${r.raw}" ↔ "${a}"`; }
      else if (a.includes(r.norm) && r.norm.length >= 4) { s = 29; reason = `Tag "${r.raw}" found in schedule reference "${a}"`; }
      else if (r.norm.includes(a) && a.length >= 5) { s = 27; reason = `Schedule reference "${a}" found in tag "${r.raw}"`; }
      else {
        const rn = idTrailingNumber(r.norm), an = idTrailingNumber(a);
        const rl = idLetters(r.norm), al = idLetters(a);
        if (rn && an && rn === an && rl.length && al.includes(rl[0])) { s = 22; reason = `Number ${rn} with tag family "${r.raw}" ↔ "${a}"`; }
      }
      if (s > best) { best = s; why = reason; }
    }
  }
  return { score: best, why };
}

/* ------------------------------- Extraction ------------------------------- */

function sentences(text) {
  return String(text || '').split(/(?<=[.\n])/).map(s => s.trim()).filter(Boolean);
}

function findSentence(text, regexes) {
  for (const s of sentences(text)) {
    for (const re of regexes) if (re.test(s)) return s.length > 160 ? s.slice(0, 157) + '…' : s;
  }
  return null;
}

function inferDiscipline(text, fallback) {
  const toks = tokenize(text);
  let best = fallback ? { d: fallback, n: 1 } : null;
  for (const [disc, words] of Object.entries(DISCIPLINE_LEX)) {
    let n = 0;
    for (const w of words) if (toks.includes(w) || text.toLowerCase().includes(w)) n++;
    if (!best || n > best.n) best = { d: disc, n };
  }
  return best && best.n > 0 ? best.d : (fallback || null);
}

function inferLocation(text, fallback) {
  const up = String(text || '').toUpperCase();
  // explicit patterns
  let m = up.match(/PIPE\s*RACK\s*[A-C]/);
  if (m) return KNOWN_LOCATIONS.find(l => l.toUpperCase() === m[0].replace(/\s+/g, ' ')) || 'Pipe Rack ' + m[0].slice(-1);
  m = up.match(/UNIT\s*-?\s*\d{2,3}/);
  if (m) return 'Unit ' + m[0].match(/\d{2,3}/)[0];
  m = up.match(/AREA\s*-?\s*\d{1,3}/);
  if (m) return 'Area ' + m[0].match(/\d{1,3}/)[0];
  m = up.match(/SUBSTATION\s*-?\s*\d?/);
  if (m) return 'Substation-1';
  for (const loc of ['Tank Farm','Firewater Loop','Boiler House','Offsite']) {
    if (up.includes(loc.toUpperCase())) return loc === 'Offsite' ? 'Offsite Area' : loc;
  }
  for (const loc of KNOWN_LOCATIONS) {
    if (up.includes(loc.toUpperCase())) return loc;
  }
  return fallback || null;
}

function extractDateTime(text, reportDate) {
  const res = { date: null, time: null, dateEvidence: null, timeEvidence: null };
  let m = text.match(/\b(\d{1,2})[-/]([A-Za-z]{3})[a-z]*[-/](\d{4})\b/);
  if (m) {
    const d = parseDate(`${m[1]}-${m[2].slice(0,3)}-${m[3]}`);
    if (d) { res.date = isoDate(d); res.dateEvidence = m[0]; }
  }
  if (!res.date) {
    m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) { res.date = m[0]; res.dateEvidence = m[0]; }
  }
  if (!res.date && /\btoday\b/i.test(text)) { res.date = reportDate || null; res.dateEvidence = 'today'; }
  if (!res.date && /\byesterday\b/i.test(text)) { res.date = reportDate ? addDays(reportDate, -1) : null; res.dateEvidence = 'yesterday'; }
  if (!res.date) { res.date = reportDate || null; res.dateEvidence = reportDate ? 'Report header date' : null; }

  m = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  if (m) {
    let h = +m[1], mn = +m[2];
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    res.time = `${String(h).padStart(2,'0')}:${String(mn).padStart(2)}`;
    res.timeEvidence = m[0];
  }
  return res;
}

function extractQuantity(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(spools?|joints?|meters?|metres?|m\b|mt|tonnes?|cubic\s*meters?|m3|cu\.?m|lights?|points?|piles?|pile\s*caps?|pads?|cable\s*meters?|km|ratios?|percent|%)/);
  if (!m) return null;
  const qty = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1]];
  let unit = m[2].replace(/\s+/g, ' ').trim();
  const unitMap = { spools:'spools', spool:'spools', joints:'joints', joint:'joints', meters:'m', metres:'m', m:'m',
    mt:'MT', tonnes:'MT', tonne:'MT', lights:'lights', light:'lights', points:'points', point:'points',
    piles:'piles', pile:'piles', pads:'foundations', pad:'foundations', km:'km' };
  return { qty, unit: unitMap[unit] || unit, evidence: m[0] };
}

function extractManpower(text) {
  const m = String(text).toLowerCase().match(/(\d+)\s*(workers?|welders?|fitters?|electricians?|masons?|operators?|men|labou?rers?|crew|persons?|people|technicians?|engineers?)/);
  return m ? { count: +m[1], type: m[2].replace(/s$/, ''), evidence: m[0] } : null;
}

function extractEquipment(text) {
  const hits = [];
  const eq = ['crane','excavator','hydra','forklift','welding machine','welding machines','generator','compressor','trailer','transit mixer','concrete mixer','poke vibrator','vibrator','boom lift','scissor lift','man lift','chain pulley','ratchet lever'];
  const low = String(text).toLowerCase();
  for (const e of eq) if (low.includes(e)) hits.push(e);
  return hits.length ? { items: [...new Set(hits)], evidence: hits.join(', ') } : null;
}

function extractDelay(text) {
  let low = String(text || '').toLowerCase();
  // neutralize time-of-day phrases (e.g. "late afternoon") so they don't read as delays
  const timePhrases = /late (afternoon|morning|evening|night|shift|hours?)|early (afternoon|morning|evening|night|shift)/g;
  const delayLow = low.replace(timePhrases, '');
  const delayTriggers = /\b(delayed?|delay|hold|holdup|hold-up|waiting|waited|standby|stand-by|shortage|not available|unavailable|not delivered|late arrival|arrived late|came late|come late|late|breakdown|break down|stopped|stoppage|could not|couldn't|unable to|held up|interrupted|deferred|postponed|not ready|pending)\b/;
  if (!delayTriggers.test(delayLow)) return null;
  let best = null;
  for (const [cat, words] of Object.entries(DELAY_LEX)) {
    let n = 0, hitWord = null;
    for (const w of words) { if (delayLow.includes(w)) { n++; if (!hitWord) hitWord = w; } }
    if (!best || n > best.n) best = { category: cat, n, word: hitWord };
  }
  const ev = findSentence(low, [delayTriggers]);
  const reasonMap = {
    'Material':'Material availability','Manpower':'Manpower shortage','Equipment':'Equipment breakdown/non-availability',
    'Weather':'Weather conditions','Safety':'Safety / permit hold','Design':'Design / drawing pending','Access':'Access constraint','Other':'Operational hold'
  };
  return {
    category: best ? best.category : 'Other',
    reason: best ? reasonMap[best.category] : 'Operational hold',
    evidence: ev
  };
}

function extractEvent(text) {
  const low = String(text || '').toLowerCase();
  const finishHit = EVENT_LEX.finish.some(w => low.includes(w));
  const startHit = EVENT_LEX.start.some(w => low.includes(w));
  let event = null, evidence = null;
  if (finishHit) {
    event = 'finish';
    evidence = findSentence(text, [/completed|finished|handed over|handover|done|closed out|finalized/i]);
  } else if (startHit) {
    event = 'start';
    evidence = findSentence(text, [/started|commenced|began|kicked off|initiated|taken up/i]);
  } else if (/\b(erected|welded|laid|poured|installed|pulled|excavated|graded|calibrated|aligned|backfilled|cured|cast)\b/.test(low)) {
    event = 'progress';
    evidence = findSentence(text, [/erected|welded|laid|poured|installed|pulled|excavated|graded|calibrated|aligned|backfilled|cured|cast/i]);
  }
  return { event, evidence };
}

function extractSafety(text) {
  const low = String(text).toLowerCase();
  const m = low.match(/(near miss|incident|injury|first aid|unsafe act|unsafe condition|toolbox talk(?: conducted)?|safety drill|mock drill|permit (?:to work|ptw)|work permit|ptw|stoppage due to safety|barricad\w+)/);
  return m ? { issue: m[1], evidence: findSentence(text, [/near miss|incident|injury|first aid|unsafe|toolbox|drill|permit|ptw|stoppage|barricad/i]) } : null;
}

function extractRelations(text) {
  const out = [];
  const low = String(text).toLowerCase();
  const after = low.match(/after\s+([\w\s]{3,30}?)(?:[,.]|$)/m);
  const before = low.match(/before\s+([\w\s]{3,30}?)(?:[,.]|$)/m);
  if (after) out.push({ type: 'predecessor mention', text: after[1].trim() });
  if (before) out.push({ type: 'successor mention', text: before[1].trim() });
  return out;
}

/**
 * Main extraction: raw free text -> structured execution event.
 * Every field carries evidence (source sentence fragment) for traceability.
 */
function extractReport(rawText, meta = {}) {
  const text = String(rawText || '').trim();
  const reportDate = meta.report_date || null;
  const ids = extractIds(text);
  const { event, evidence: eventEvidence } = extractEvent(text);
  const dt = extractDateTime(text, reportDate);
  const qty = extractQuantity(text);
  const discipline = inferDiscipline(text, meta.discipline || null);
  const location = inferLocation(text, meta.location || null);
  const delay = extractDelay(text);
  const manpower = extractManpower(text);
  const equipment = extractEquipment(text);
  const safety = extractSafety(text);
  const relations = extractRelations(text);

  // activity description: pick the most informative sentence fragment
  let description = null;
  const descSentence = sentences(text).map(s => s.replace(/^\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}\.?/, '').trim())
    .find(s => /erect|weld|install|pour|excavat|cable|pull|hydro|calibrat|align|foundation|concrete|spool|pump|setting|grout|lay|grade|backfill|complete|finish|start/i.test(s));
  if (descSentence) description = descSentence.length > 140 ? descSentence.slice(0, 137) + '…' : descSentence;

  // confidence (extraction-level)
  let conf = 0;
  const confBreakdown = {};
  const add = (k, v) => { conf += v; confBreakdown[k] = v; };
  add('identifier', ids.length ? 25 : 4);
  add('event', event ? 15 : 5);
  add('date_time', (dt.date ? 8 : 0) + (dt.time ? 7 : 0) + (!dt.date && !dt.time ? 3 : 0));
  add('discipline', discipline ? 10 : 2);
  add('location', location ? 10 : 2);
  add('quantity', qty ? 10 : 3);
  add('delay', delay ? 10 : (event ? 4 : 2));
  add('entities', (manpower || equipment || safety) ? 8 : 4);
  conf = Math.min(99, Math.round(conf));

  const primaryId = ids.find(i => i.kind === 'line' || i.kind === 'tag') || ids[0] || null;

  return {
    extraction_id: 'EXT-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    raw_snippet: text.length > 400 ? text.slice(0, 397) + '…' : text,
    activity_identifier: primaryId ? primaryId.raw : null,
    all_identifiers: ids.map(i => i.raw),
    activity_description: description,
    event: event || null,
    discipline,
    location,
    actual_start: event === 'start' || event === 'progress' ? (dt.date ? (dt.time ? dt.date + 'T' + dt.time : dt.date) : null) : null,
    actual_finish: event === 'finish' ? (dt.date ? (dt.time ? dt.date + 'T' + dt.time : dt.date) : null) : null,
    event_date: dt.date,
    event_time: dt.time,
    time_known: !!dt.time,
    quantity: qty ? qty.qty : null,
    unit: qty ? qty.unit : null,
    delay_reason: delay ? delay.reason : null,
    delay_category: delay ? delay.category : null,
    delay_evidence: delay ? delay.evidence : null,
    manpower, equipment, safety,
    relations,
    important_entities: [
      ...ids.map(i => i.raw),
      ...(equipment ? equipment.items : []),
      ...(manpower ? [manpower.evidence] : []),
    ].filter(Boolean),
    confidence: conf,
    confidence_breakdown: confBreakdown,
    evidence: {
      identifier: primaryId ? findSentence(text, [new RegExp(primaryId.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')]) : null,
      event: eventEvidence,
      date: dt.dateEvidence ? findSentence(text, [new RegExp(dt.dateEvidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), /today|yesterday/i]) || dt.dateEvidence : null,
      time: dt.timeEvidence ? findSentence(text, [new RegExp(dt.timeEvidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')]) : (event ? 'No explicit time mentioned in report' : null),
      quantity: qty ? findSentence(text, [new RegExp(qty.evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')]) : null,
      discipline: discipline ? findSentence(text, DISCIPLINE_LEX[discipline].slice(0, 6).map(w => new RegExp(w, 'i'))) : null,
      location: location ? findSentence(text, [new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i')]) : null,
      delay: delay ? delay.evidence : null,
    },
  };
}

/* ------------------------------- Matching --------------------------------- */

const MATCH_WEIGHTS = { identifier: 30, semantic: 25, keyword: 20, discipline: 10, location: 10, wbs: 5 };

// Generic/delay/event tokens excluded from semantic "salient" overlap
const SEMANTIC_EXCLUDE = new Set([
  'delay','delayed','material','arrive','late','short','manpower','worker','crew','weather','rain',
  'equipment','crane','safety','permit','design','drawing','access','standby','waiting','hold',
  'complete','finish','start','begin','progress','today','yesterday','morning','afternoon','evening',
  'report','day','hrs','hour','time','number','total','area','unit','site','team','work',
]);

function matchActivities(extraction, reportText, activities, learned) {
  const reportIds = extractIds(reportText);
  const reportTokens = contentTokens(reportText);
  const rDisc = extraction.discipline;
  const rLoc = extraction.location;

  // globally unknown identifiers (strong tags present in report but in no schedule activity)
  const allActIds = new Set();
  activities.forEach(a => activityIdSet(a).forEach(i => allActIds.add(i)));
  const unknownIds = reportIds.filter(i => i.kind === 'tag' && ![...allActIds].some(a => a.includes(i.norm) || (i.norm.length >= 4 && a.includes(i.norm.slice(-4)))));

  const scored = activities.map(act => {
    const actIds = activityIdSet(act);
    const idRes = identifierPairScore(reportIds, actIds);

    // Semantic: salient content words (identifiers + activity nouns/verbs)
    const kwText = Array.isArray(act.keywords) ? act.keywords.join(' ') : (act.keywords || '');
    const actTokens = contentTokens([act.activity_name, act.search_text || '', kwText, ...actIds].join(' '));
    const reportSalient = reportTokens.filter(t => !/^\d+$/.test(t) && !SEMANTIC_EXCLUDE.has(t) && t.length > 1);
    const overlap = reportSalient.filter(t => actTokens.includes(t));
    const denom = Math.max(3, Math.min(6, reportSalient.length));
    let coverageReport = reportSalient.length ? overlap.length / denom : 0;
    // Vague single-common-word reports must not score high
    if (overlap.length < 2) coverageReport *= 0.35;
    const semanticScore = Math.round(MATCH_WEIGHTS.semantic * Math.min(1, coverageReport * 1.2));

    // Keyword: curated activity keywords hit by report
    const kws = Array.isArray(act.keywords) ? act.keywords : (act.keywords ? [act.keywords] : contentTokens(act.activity_name));
    const kwHits = kws.filter(k => {
      const rt = rootToken(k.toLowerCase());
      return reportTokens.includes(rt) || reportText.toLowerCase().includes(k);
    });
    const keywordScore = Math.round(MATCH_WEIGHTS.keyword * Math.min(1, (kwHits.length + 0.6) / Math.max(2, Math.min(kws.length, 4))));

    // Discipline
    let discScore = 0;
    if (rDisc && act.discipline === rDisc) discScore = MATCH_WEIGHTS.discipline;
    else if (rDisc) discScore = 3;

    // Location
    let locScore = 0;
    if (rLoc && act.location === rLoc) locScore = MATCH_WEIGHTS.location;
    else if (rLoc && (act.location || '').split(/\s|-/)[0] === rLoc.split(/\s|-/)[0] && /Rack|Unit|Area/.test(rLoc)) locScore = 5;

    // WBS / context
    let wbsScore = 0;
    if (new RegExp(act.wbs.replace(/\./g, '\\.?'), 'i').test(reportText)) wbsScore = 5;
    else if (rDisc && act.wbs.startsWith(rDisc.slice(0, 3).toUpperCase()) && rDisc === act.discipline) {
      wbsScore = (rLoc === act.location) ? 3 : (rDisc ? 1 : 0);
    }

    // Adaptive learning: boost activities a planner has previously mapped similar text to
    const learnedAdd = learnedBoost(learned, reportText, reportIds, act.activity_id);

    let total = idRes.score + semanticScore + keywordScore + discScore + locScore + wbsScore + learnedAdd.add;
    total = Math.min(99, total);

    return {
      activity_id: act.activity_id,
      activity_name: act.activity_name,
      discipline: act.discipline,
      location: act.location,
      wbs: act.wbs,
      level: act.level,
      scores: {
        identifier: idRes.score, semantic: semanticScore, keyword: keywordScore,
        discipline: discScore, location: locScore, wbs: wbsScore,
        learned: learnedAdd.add,
      },
      learned_signals: learnedAdd.why,
      signals: {
        identifier: idRes.why || (reportIds.length ? 'No identifier overlap' : 'No identifiers in report'),
        semantic: `Shared terms: ${[...new Set(overlap)].slice(0, 6).join(', ') || 'none'}`,
        keyword: kwHits.length ? `Activity keywords hit: ${[...new Set(kwHits)].slice(0, 6).join(', ')}` : 'No activity keywords found in report',
        discipline: rDisc ? (act.discipline === rDisc ? `Discipline match: ${rDisc}` : `Discipline mismatch (report: ${rDisc})`) : 'Discipline not identified',
        location: rLoc ? (act.location === rLoc ? `Location match: ${rLoc}` : `Location differs (report: ${rLoc})`) : 'Location not identified',
        wbs: wbsScore >= 5 ? `WBS code ${act.wbs} referenced` : (wbsScore ? `WBS context consistent (${act.wbs})` : 'No WBS context'),
      },
      total_confidence: Math.min(99, total),
      _overlap: overlap.length,
    };
  });

  scored.sort((a, b) => b.total_confidence - a.total_confidence || b._overlap - a._overlap);
  const top = scored[0] || null;
  const runner = scored[1] || null;

  let status = 'low';
  if (top) {
    if (top.total_confidence >= 90) status = 'high';
    else if (top.total_confidence >= 70) status = 'medium';
    // Tied candidates with no identifier anchor => ambiguous, planner must choose
    const tied = runner && (top.total_confidence - runner.total_confidence) < 6 && top.scores.identifier < 20;
    if ((status === 'medium' || (status === 'low' && top.total_confidence >= 45)) && tied) status = 'ambiguous';
    // Unknown strong tag with no identifier overlap on top candidate => unmatched/new activity
    if (unknownIds.length && top.scores.identifier < 20) status = 'unmatched';
    if (!top || top.total_confidence < 40) status = 'unmatched';
  }

  return {
    recommended: status === 'unmatched' ? null : top,
    candidates: scored.slice(0, 6),
    unknown_identifiers: [...new Set(unknownIds.map(i => i.raw))],
    status,
    weights: MATCH_WEIGHTS,
  };
}

function confidenceBand(c) {
  if (c >= 90) return { label: 'HIGH CONFIDENCE', cls: 'high', min: 90 };
  if (c >= 70) return { label: 'MEDIUM CONFIDENCE', cls: 'medium', min: 70 };
  return { label: 'LOW CONFIDENCE', cls: 'low', min: 0 };
}

/* --------------------------- Schedule update ------------------------------ */

function applyApproval(activity, extraction, dataDate) {
  const changes = [];
  const old = {
    actual_start: activity.actual_start, actual_finish: activity.actual_finish,
    progress: activity.progress, status: activity.status,
    delay_reason: activity.delay_reason || null, delay_flag: activity.delay_flag || false,
  };

  if (extraction.actual_start && !activity.actual_start) {
    activity.actual_start = extraction.actual_start;
    changes.push({ field: 'Actual Start', old: old.actual_start, new: extraction.actual_start });
  }
  if (extraction.actual_finish) {
    activity.actual_finish = extraction.actual_finish;
    changes.push({ field: 'Actual Finish', old: old.actual_finish || null, new: extraction.actual_finish });
  }

  // Progress: quantity-based when planned quantity exists
  let newProgress = activity.progress || 0;
  if (extraction.event === 'finish') newProgress = 100;
  else if (extraction.quantity && activity.planned_qty) {
    const est = Math.round((extraction.quantity / activity.planned_qty) * 100);
    newProgress = Math.max(newProgress, Math.min(95, est));
  } else if (extraction.event === 'start' && newProgress === 0) newProgress = 10;
  else if (extraction.event === 'progress') newProgress = Math.max(newProgress, 25);
  if (newProgress !== activity.progress) {
    changes.push({ field: 'Progress %', old: String(old.progress) + '%', new: newProgress + '%' });
    activity.progress = newProgress;
  }

  if (extraction.delay_reason && !activity.delay_flag) {
    activity.delay_reason = extraction.delay_reason;
    activity.delay_category = extraction.delay_category;
    activity.delay_flag = true;
    changes.push({ field: 'Delay Reason', old: old.delay_reason, new: extraction.delay_reason });
  } else if (extraction.delay_reason) {
    activity.delay_reason = activity.delay_reason || extraction.delay_reason;
    activity.delay_category = activity.delay_category || extraction.delay_category;
    if (!old.delay_reason) changes.push({ field: 'Delay Reason', old: null, new: activity.delay_reason });
    activity.delay_flag = true;
  }

  // Variance (planned dates NEVER modified)
  const startVar = activity.actual_start ? daysBetween(activity.planned_start, activity.actual_start.slice(0, 10)) : null;
  const finishVar = activity.actual_finish ? daysBetween(activity.planned_finish, activity.actual_finish.slice(0, 10)) : null;
  activity.start_variance = startVar;
  activity.finish_variance = finishVar;

  // Status
  let status = activity.status;
  if (activity.progress >= 100 || activity.actual_finish) status = 'Completed';
  else if (activity.actual_start || activity.progress > 0) {
    status = (activity.delay_flag || (startVar !== null && startVar > 0) || (finishVar !== null && finishVar > 0)) ? 'Delayed' : 'In Progress';
  }
  if (status !== activity.status) {
    changes.push({ field: 'Status', old: old.status, new: status });
    activity.status = status;
  }

  recomputeRisk(activity, dataDate);
  return { changes, activity };
}

/* ------------------------------ Risk engine ------------------------------- */

function recomputeRisk(act, dataDate) {
  let score = 0;
  const reasons = [];

  const startVar = act.actual_start ? daysBetween(act.planned_start, act.actual_start.slice(0, 10)) : 0;
  const finishVar = act.actual_finish ? daysBetween(act.planned_finish, act.actual_finish.slice(0, 10)) : 0;
  const varDays = Math.max(0, finishVar || startVar || 0, act.start_variance || 0, act.finish_variance || 0);

  if (varDays > 0) { score += Math.min(30, varDays * 6); reasons.push(`Late by ${varDays} day${varDays > 1 ? 's' : ''} (variance +${varDays})`); }

  // Expected progress at data date — only meaningful once work has started
  act.expected_progress = 0;
  if (!act.actual_finish && act.progress < 100 && (act.actual_start || act.progress > 0)) {
    const total = Math.max(1, daysBetween(act.planned_start, act.planned_finish));
    const elapsed = daysBetween(act.planned_start, dataDate);
    const expected = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const gap = expected - (act.progress || 0);
    act.expected_progress = expected;
    if (gap > 5 && elapsed > 0) { score += Math.min(25, gap); reasons.push(`Progress behind plan: ${act.progress || 0}% actual vs ~${expected}% expected`); }
  }

  if (act.delay_flag) { score += 12; reasons.push(`Delay reason recorded: ${act.delay_reason || act.delay_category}`); }
  if (act.repeated_delay) { score += 10; reasons.push('Repeated delays on this activity'); }

  // Criticality: downstream chain length
  const chain = (act.successors || []).length;
  if (chain > 0) { score += Math.min(15, 6 + chain * 3); reasons.push(`${chain} downstream successor${chain > 1 ? 's' : ''} may be affected`); }

  // Potential downstream risk from a delayed predecessor (advisory, not claimed CPM impact)
  if (act.downstream_watch && !act.actual_start) {
    score += 28; reasons.push('Potential downstream risk: a predecessor activity is delayed (review dependencies)');
  } else if (act.downstream_watch) {
    score += 10; reasons.push('Downstream watch: delayed predecessor may affect this activity');
  }

  score = Math.min(100, Math.round(score));
  act.risk_score = score;
  act.risk_level = score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  act.risk_reasons = reasons;
  return act;
}

function propagateDownstream(activities, sourceAct, dataDate) {
  const byId = new Map(activities.map(a => [a.activity_id, a]));
  const impacted = [];
  const seen = new Set();
  const walk = (id, depth) => {
    const a = byId.get(id);
    if (!a || seen.has(id) || a.status === 'Completed') return;
    seen.add(id);
    const prevScore = a.risk_score || 0;
    a.downstream_watch = true;
    a.downstream_from = a.downstream_from || [];
    if (!a.downstream_from.includes(sourceAct.activity_id)) a.downstream_from.push(sourceAct.activity_id);
    recomputeRisk(a, dataDate);
    if (a.risk_score > prevScore || depth === 1) {
      impacted.push({ activity_id: a.activity_id, activity_name: a.activity_name, depth, risk_level: a.risk_level, risk_score: a.risk_score });
    }
    (a.successors || []).forEach(s => walk(s, depth + 1));
  };
  (sourceAct.successors || []).forEach(s => walk(s, 1));
  return impacted;
}

/* ------------------------------- Analytics -------------------------------- */

function computeAnalytics(activities, reports, dataDate) {
  const byStatus = { 'Not Started': 0, 'In Progress': 0, 'Completed': 0, 'Delayed': 0, 'At Risk': 0 };
  activities.forEach(a => {
    const isAtRisk = !['Completed', 'Delayed'].includes(a.status) && (a.risk_score >= 50 || a.downstream_watch);
    if (a.status === 'Delayed') byStatus['Delayed']++;
    else if (isAtRisk) byStatus['At Risk']++;
    else byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });

  const overall = activities.length ? Math.round(activities.reduce((s, a) => s + (a.progress || 0), 0) / activities.length) : 0;
  const delayedActs = activities.filter(a => a.status === 'Delayed' || (a.start_variance > 0) || (a.finish_variance > 0));
  const avgVar = delayedActs.length ? Math.round(delayedActs.reduce((s, a) => s + Math.max(a.start_variance || 0, a.finish_variance || 0), 0) / delayedActs.length) : 0;

  const disciplines = ['Civil','Piping','Mechanical','Electrical','Instrumentation','HSE'];
  const disciplineProgress = disciplines.map(d => {
    const list = activities.filter(a => a.discipline === d);
    return { discipline: d, progress: list.length ? Math.round(list.reduce((s, a) => s + (a.progress || 0), 0) / list.length) : 0, count: list.length };
  });

  // S-curve: planned vs actual across timeline (weekly points)
  const pStart = activities.map(a => a.planned_start).sort()[0];
  const pEnd = activities.map(a => a.planned_finish).sort().reverse()[0];
  const points = [];
  const totalPlan = activities.reduce((s, a) => s + (100 / activities.length), 0);
  let cur = pStart;
  while (cur <= pEnd) {
    let planned = 0, actual = 0;
    activities.forEach(a => {
      const dur = Math.max(1, daysBetween(a.planned_start, a.planned_finish));
      const elPlan = Math.min(dur, Math.max(0, daysBetween(a.planned_start, cur)));
      planned += Math.min(100, (elPlan / dur) * 100);
      // Actual: earned only once the activity has started by this date
      if (a.actual_start && a.actual_start.slice(0, 10) <= cur) {
        if (a.actual_finish && a.actual_finish.slice(0, 10) <= cur) actual += 100;
        else {
          const startD = a.actual_start.slice(0, 10);
          const finD = a.actual_finish ? a.actual_finish.slice(0, 10)
            : (a.planned_finish > cur ? a.planned_finish : cur);
          const total = Math.max(1, daysBetween(startD, finD));
          const el = Math.min(total, Math.max(0, daysBetween(startD, cur)));
          const pct = a.progress || Math.round((el / total) * 100);
          actual += Math.max(0, Math.min(100, pct));
        }
      }
    });
    points.push({ date: cur, planned: Math.round(planned / activities.length), actual: Math.round(actual / activities.length) });
    cur = addDays(cur, 7);
  }

  const riskDist = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  activities.forEach(a => { if (a.risk_level) riskDist[a.risk_level]++; });

  const delayReasons = { Material: 0, Manpower: 0, Equipment: 0, Weather: 0, Safety: 0, Design: 0, Access: 0, Other: 0 };
  activities.forEach(a => { if (a.delay_category) delayReasons[a.delay_category] = (delayReasons[a.delay_category] || 0) + 1; });
  reports.forEach(r => { if (r.extraction && r.extraction.delay_category) delayReasons[r.extraction.delay_category]++; });

  const varianceTable = activities
    .filter(a => a.actual_start || a.actual_finish)
    .map(a => ({
      activity_id: a.activity_id, activity_name: a.activity_name, discipline: a.discipline,
      planned_start: a.planned_start, actual_start: a.actual_start,
      variance: Math.max(a.start_variance || 0, a.finish_variance || 0),
      status: a.status,
    })).sort((x, y) => y.variance - x.variance);

  return {
    kpis: {
      total: activities.length,
      completed: byStatus['Completed'],
      in_progress: byStatus['In Progress'],
      delayed: byStatus['Delayed'],
      at_risk: byStatus['At Risk'],
      overall_progress: overall,
      schedule_variance: avgVar,
      reports_processed: reports.filter(r => ['processed','approved','rejected'].includes(r.processing_status)).length,
      reports_total: reports.length,
      pending_reviews: reports.filter(r => r.processing_status === 'pending_review').length,
    },
    byStatus, disciplineProgress, sCurve: points, riskDist, delayReasons, varianceTable,
  };
}

/* ---------------------------- Project memory ------------------------------ */

function searchMemory(entries, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return entries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50);
  const qTokens = contentTokens(q);
  const scored = entries.map(e => {
    const hay = `${e.title} ${e.content} ${(e.tags || []).join(' ')} ${e.activity_id || ''}`.toLowerCase();
    let score = 0;
    qTokens.forEach(t => { if (hay.includes(t)) score += 2; });
    if (e.activity_id && q.toUpperCase().includes(e.activity_id.toUpperCase())) score += 5;
    (e.tags || []).forEach(t => { if (q.includes(t.toLowerCase())) score += 3; });
    if (hay.includes(q)) score += 4;
    return { e, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || (b.e.date || '').localeCompare(a.e.date || ''));
  return scored.map(x => x.e);
}

/** Rule-based answer synthesis for natural-language questions. */
function answerQuestion(query, ctx) {
  const { memory, activities, reports } = ctx;
  const q = String(query || '').toLowerCase();
  const acts = activities;

  // "Why was X delayed?"
  const idMention = (extractIds(query).map(i => i.raw)[0]) || (q.match(/\bp\s?-?\s?1\d{2}\b/) ? 'P102' : null);
  let act = null;
  if (idMention) {
    act = acts.find(a => activityIdSet(a).some(x => x.includes(normId(idMention)) || normId(idMention).length >= 4 && x.includes(normId(idMention).slice(-4))));
  }
  if (/why|delayed|delay|late|hold/.test(q) && (act || /delay|delayed|late/.test(q))) {
    if (act) {
      const evs = memory.filter(m => m.activity_id === act.activity_id && /delay|material|risk/i.test(`${m.title} ${m.content} ${m.tags}`));
      if (evs.length || act.delay_flag) {
        const reasons = [];
        if (act.delay_reason) reasons.push(act.delay_reason);
        const varDays = Math.max(act.start_variance || 0, act.finish_variance || 0);
        if (varDays) reasons.push(`started ${varDays} day(s) later than planned`);
        return {
          answer: `${act.activity_id} — "${act.activity_name}" was delayed due to ${(act.delay_reason || 'an operational hold').toLowerCase()}.` +
            (varDays ? ` Recorded variance is +${varDays} day(s) against baseline (planned start ${fmtDate(act.planned_start)}, actual start ${fmtDateTime(act.actual_start)}).` : '') +
            ` This is recorded as a ${act.risk_level || 'Medium'}-risk item${(act.successors || []).length ? ` with potential downstream impact on ${act.successors.length} successor activity/activities` : ''}. AI recommends planner review; the schedule is only changed after approval.`,
          records: evs.slice(0, 6),
        };
      }
      return { answer: `No delay records found for ${act.activity_id} ("${act.activity_name}"). Current status: ${act.status}, progress ${act.progress || 0}%.`, records: [] };
    }
    // general delay question
    const dels = memory.filter(m => /delay/i.test(`${m.tags} ${m.title}`));
    return {
      answer: `There are ${acts.filter(a => a.status === 'Delayed').length} delayed activities and ${dels.length} delay-related records in project memory. Use a tag or line number (e.g. "P102") to ask about a specific activity.`,
      records: dels.slice(0, 8),
    };
  }

  if (/material/.test(q)) {
    const recs = searchMemory(memory, 'material delay');
    return { answer: `Found ${recs.length} record(s) related to material availability/delivery delays. Material is the most common delay category in this project dataset.`, records: recs.slice(0, 8) };
  }
  if (/pipe rack b|rack b/.test(q)) {
    const recs = memory.filter(m => /pipe rack b/i.test(`${m.content} ${m.title}`));
    return { answer: `Pipe Rack B has ${recs.length} recorded event(s), including spool erection, welding and hydrotest activities for lines routed on the rack.`, records: recs.slice(0, 8) };
  }
  if (/this week|recent|latest/.test(q)) {
    const recent = memory.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
    return { answer: `Here are the most recent project events recorded in memory.`, records: recent };
  }
  if (/previous updates|history|updates for/.test(q) && act) {
    const recs = memory.filter(m => m.activity_id === act.activity_id);
    return { answer: `${recs.length} historical record(s) found for ${act.activity_id} — "${act.activity_name}".`, records: recs };
  }

  const recs = searchMemory(memory, query);
  return {
    answer: recs.length ? `Found ${recs.length} project memory record(s) matching "${query}".` : `No records matched "${query}". Try a line tag (e.g. P102), a location (e.g. Pipe Rack B), or a topic (e.g. material delay).`,
    records: recs.slice(0, 8),
  };
}

/* --------------------------------- CSV ------------------------------------ */

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, columns) {
  const head = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvEscape(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n');
  return head + '\n' + body;
}
function parseCsv(text) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  const s = String(text).replace(/\r/g, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
  }
  cur.push(field); rows.push(cur);
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

/* ===================== ADAPTIVE LEARNING (one-shot, from planner edits) ===================== */

function learnNormalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// Distinctive, non-generic content phrases of length 2-4 words that appear in the report.
function distinctivePhrases(text) {
  const t = learnNormalize(text);
  const STOP = new Set(['the','a','an','and','or','of','to','in','on','at','for','with','is','was','were','are','been','today','yesterday','work','worked','working','team','crew','site','area','unit','done','did','some','day','this','that','from','by','as','it','be','has','had','have','not','no','we','they','he','she','our','their','pm','am','hrs','hours','went','ahead','job','continued']);
  // drop date tokens like "05 sep", "sep 2026", "2026", day numbers
  const MON = new Set(['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec']);
  const words = t.split(' ').filter(Boolean).filter(w => {
    if (/^\d{1,4}$/.test(w)) return false;          // pure numbers (dates)
    if (MON.has(w)) return false;                   // month names
    return true;
  });
  const out = new Set();
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (gram.some(w => STOP.has(w))) continue;
      const content = gram.filter(w => !STOP.has(w));
      // require activity-flavoured content words
      if (content.length >= 2) out.add(gram.join(' '));
    }
  }
  return [...out];
}
// Record a planner correction: when the AI recommended one activity but the planner chose another,
// (or confirmed an unmatched/weak report to an activity) learn the report's tags & phrases -> activity.
function learnCorrection(learned, reportText, fromActivityId, toActivity) {
  if (!learned || !toActivity) return [];
  learned.mappings = learned.mappings || [];
  const ids = extractIds(reportText);
  const tags = [...new Set(ids.map(i => i.norm).filter(x => x && x.length >= 2))];
  const phrases = distinctivePhrases(reportText);
  const added = [];
  // tag aliases (e.g. shop-code "B-7" the site calls a known line)
  tags.forEach(tag => {
    const ex = learned.mappings.find(m => m.tag && m.tag === tag && m.activity_id === toActivity.activity_id);
    if (!ex) { learned.mappings.push({ tag, phrase: null, activity_id: toActivity.activity_id, activity_name: toActivity.activity_name }); added.push('tag "' + tag + '"'); }
  });
  // phrase aliases (dedupe: keep a handful of shortest distinctive phrases)
  phrases.slice(0, 3).forEach(ph => {
    const ex = learned.mappings.find(m => m.phrase === ph && m.activity_id === toActivity.activity_id);
    if (!ex) { learned.mappings.push({ tag: null, phrase: ph, activity_id: toActivity.activity_id, activity_name: toActivity.activity_name }); added.push('phrase'); }
  });
  learned.mappings = learned.mappings.slice(-400);
  return added;
}
// Boost an activity's identifier score if the report contains a learned tag/phrase that maps to it.
function learnedBoost(learned, reportText, reportIds, activityId) {
  if (!learned || !learned.mappings || !learned.mappings.length) return { add: 0, why: [] };
  const t = learnNormalize(reportText);
  const tags = new Set(reportIds.map(i => i.norm));
  let add = 0; const why = []; let hits = 0;
  learned.mappings.forEach(m => {
    if (m.activity_id !== activityId) return;
    if (m.tag && tags.has(m.tag)) { add += 30; hits++; why.push('Learned tag "' + m.tag + '" → ' + m.activity_name); }
    if (m.phrase && t.includes(m.phrase)) { add += 18; hits++; why.push('Learned phrase → ' + m.activity_name); }
  });
  // A planner correction is an explicit, strong signal: even one learned cue lifts the
  // activity into the recommendable band (medium confidence — the planner still approves).
  let total = add;
  if (hits >= 2) total = Math.max(add, 62);
  else if (hits >= 1) total = Math.max(add, 48);
  return { add: Math.min(65, total), why: [...new Set(why)] };
}

/* ===================== WHAT-IF DELAY IMPACT SIMULATOR ===================== */

function simulateDelay(activities, activityId, slipDays) {
  const act = activities.find(a => a.activity_id === activityId);
  if (!act) return { error: 'Activity not found' };
  const slip = Math.max(0, Number(slipDays) || 0);
  const byId = {}; activities.forEach(a => { byId[a.activity_id] = a; });
  const downstream = [];
  const seen = new Set();
  const plannedOf = a => a.planned_finish || a.planned_start;
  // BFS over successors (dependency chain). Each queued node carries its full
  // id-chain from the source so downstream rows show an accurate dependency path.
  const queue = [{ id: act.activity_id, depth: 0, chain: [act.activity_id] }];
  while (queue.length) {
    const { id, depth, chain } = queue.shift();
    const cur = byId[id]; if (!cur) continue;
    (cur.successors || []).forEach(sid => {
      if (seen.has(sid) || sid === act.activity_id) return;
      seen.add(sid);
      const sa = byId[sid]; if (!sa) return;
      const notStarted = !sa.actual_start && !sa.actual_finish;
      // exposure: the downstream planned window overlaps/after the slipping finish
      const plannedWindow = (sa.planned_start && act.planned_finish) ? daysBetween(act.planned_finish, sa.planned_start) : null;
      const exposed = notStarted && (plannedWindow === null || plannedWindow <= slip + depth);
      // float headroom (days) between the slipping finish and this successor's planned
      // start; negative means the slip already exceeds it. Only meaningful when a planned
      // window exists — otherwise the successor has no date to compare against.
      const exposureDays = plannedWindow === null ? null : plannedWindow - slip - depth;
      const nextChain = chain.concat(sid);
      downstream.push({
        activity_id: sid, activity_name: sa.activity_name, wbs: sa.wbs, discipline: sa.discipline,
        level: sa.level, depth: depth + 1, notStarted,
        planned_start: sa.planned_start, planned_finish: sa.planned_finish,
        location: sa.location, progress: sa.progress, status: sa.status,
        chain: nextChain,                       // full path source -> this successor
        exposure: exposed ? 'at-risk' : (notStarted ? 'watch' : 'started'),
        exposure_days: exposed ? exposureDays : null,
      });
      queue.push({ id: sid, depth: depth + 1, chain: nextChain });
    });
  }
  downstream.sort((a, b) => a.depth - b.depth || (a.exposure === 'at-risk' ? -1 : 1));
  const atRisk = downstream.filter(d => d.exposure === 'at-risk');
  return {
    source: { activity_id: act.activity_id, activity_name: act.activity_name, discipline: act.discipline,
      planned_start: act.planned_start, planned_finish: plannedOf(act), successors: (act.successors || []).length },
    slip_days: slip,
    downstream_count: downstream.length,
    at_risk_count: atRisk.length,
    at_risk: atRisk,
    watch: downstream.filter(d => d.exposure === 'watch'),
    started_or_done: downstream.filter(d => d.exposure === 'started'),
    all: downstream,
  };
}

/* ===================== AUTO DAILY / WEEKLY PROGRESS BRIEF (DPR/WPR) ===================== */

function fmtDateShort(iso) { return fmtDate(iso); }
function generateBrief(db, opts = {}) {
  const acts = db.activities || []; const reports = db.reports || [];
  const dataDate = db.project && db.project.data_date;
  const approved = reports.filter(r => r.processing_status === 'approved');
  const pending = reports.filter(r => r.processing_status === 'pending_review');
  const rejected = reports.filter(r => r.processing_status === 'rejected');
  const started = acts.filter(a => a.actual_start && a.progress > 0 && a.progress < 100);
  const done = acts.filter(a => a.progress >= 100 || a.actual_finish);
  const delayed = acts.filter(a => a.delay_flag || a.status === 'Delayed');
  const critical = acts.filter(a => (a.risk_level === 'High' || a.risk_level === 'Critical') && a.progress < 100);
  const downstream = acts.filter(a => a.downstream_watch && !a.actual_start);

  const L = [];
  L.push('DAILY PROGRESS REPORT (DPR)');
  L.push('Project: ' + (db.project && db.project.name || 'BuildNova project') + '  |  Data date: ' + fmtDate(dataDate));
  L.push('Prepared with BuildNova AI — figures derive from planner-approved field updates.');
  L.push('');
  L.push('1. PROGRESS SUMMARY');
  L.push('   • Activities in progress: ' + started.length + '  |  Completed: ' + done.length + '  |  Not started: ' + acts.filter(a => !a.actual_start).length);
  const avg = started.length ? Math.round(started.reduce((s, a) => s + (a.progress || 0), 0) / started.length) : 0;
  L.push('   • Average progress of in-progress activities: ' + avg + '%');
  started.slice(0, 8).forEach(a => L.push('     – ' + a.activity_id + ' ' + a.activity_name + ': ' + a.progress + '%' + (a.actual_start ? ' (started ' + fmtDateShort(a.actual_start) + ')' : '')));
  L.push('');
  L.push('2. DELAYS & VARIANCE');
  if (!delayed.length) L.push('   • No delays recorded as of data date.');
  delayed.slice(0, 10).forEach(a => L.push('   • ' + a.activity_id + ' ' + a.activity_name + ' — ' + (a.delay_reason || 'delay') +
    (a.start_variance ? '; start variance +' + a.start_variance + ' day(s)' : '')));
  L.push('');
  L.push('3. RISK & DOWNSTREAM WATCH');
  L.push('   • High/critical-risk open activities: ' + critical.length);
  critical.slice(0, 6).forEach(a => L.push('     – ' + a.activity_id + ' ' + a.activity_name + ' (' + a.risk_level + ')' + (a.downstream_watch ? ' — potential downstream exposure' : '')));
  downstream.slice(0, 6).forEach(a => L.push('   • Potential downstream risk on ' + a.activity_id + ' ' + a.activity_name + ' (waiting on a delayed predecessor).'));
  L.push('');
  L.push('4. PENDING PLANNER ACTIONS');
  L.push('   • Field reports awaiting approval: ' + pending.length + (pending.length ? '  (AI recommendations ready in Matching Review).' : ' — none.'));
  L.push('   • Rejected this period: ' + rejected.length + '  |  Approved to date: ' + approved.length + '.');
  L.push('');
  L.push('Note: Planned baseline dates are never overwritten; all changes are planner-approved and logged in the Audit Trail.');
  return { title: 'Daily Progress Report', generated_at: nowStamp(), text: L.join('\n'),
    stats: { in_progress: started.length, completed: done.length, delayed: delayed.length, critical: critical.length, pending: pending.length, downstream: downstream.length } };
}

module.exports = {
  parseDate, fmtDate, fmtDateTime, isoDate, addDays, daysBetween, nowStamp,
  tokenize, contentTokens, rootToken, normId, extractIds, activityIdSet,
  extractReport, matchActivities, confidenceBand,
  applyApproval, recomputeRisk, propagateDownstream,
  computeAnalytics, searchMemory, answerQuestion,
  toCsv, parseCsv, csvEscape,
  KNOWN_LOCATIONS, MON_ABBR,
  learnCorrection, learnedBoost, distinctivePhrases,
  simulateDelay, generateBrief,
};
