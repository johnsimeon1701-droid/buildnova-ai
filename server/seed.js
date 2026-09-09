/* ============================================================================
   BuildNova AI — Synthetic seed data (fictional project, no real data)
   ~104 L5/L6 activities, 31 field reports, audit history, project memory.
   ========================================================================== */

'use strict';
const E = require('./engine');

const DATA_DATE = '2026-09-02';

function mkActivity(a) {
  return Object.assign({
    level: 5, predecessors: [], successors: [], actual_start: null, actual_finish: null,
    progress: 0, status: 'Not Started', planned_qty: null, unit: null, tag: null,
    start_variance: 0, finish_variance: 0, risk_score: 0, risk_level: 'Low', risk_reasons: [],
    delay_flag: false, delay_reason: null, delay_category: null, downstream_watch: false,
    downstream_from: [], expected_progress: 0, evidence_reports: [],
  }, a);
}

function buildActivities() {
  const acts = [];

  /* ---------------- Piping — one chain per line (Erect→Weld→Hydro→Handover) ---------------- */
  const lines = [
    { line: '24-P-102', rack: 'Pipe Rack B', start: '2026-09-01', demo: true },
    { line: '08-P-205', rack: 'Pipe Rack A', start: '2026-07-06' },
    { line: '16-P-210', rack: 'Pipe Rack C', start: '2026-07-20' },
    { line: '06-P-310', rack: 'Tank Farm',   start: '2026-08-03' },
    { line: '10-P-415', rack: 'Pipe Rack B', start: '2026-08-17' },
    { line: '12-P-502', rack: 'Pipe Rack C', start: '2026-09-07' },
    { line: '04-P-610', rack: 'Offsite Area', start: '2026-08-24' },
    { line: '20-P-118', rack: 'Tank Farm',   start: '2026-08-10' },
  ];
  const stages = [
    { suf: 'Erect',   name: l => `Erect Line ${l.line}`, dur: 3, qty: l => l.line === '24-P-102' ? 24 : (l.line === '20-P-118' ? 20 : 18), unit: 'spools',
      keywords: ['erect','spool','line','pipe','fitup','flange','bolt'],
      search: 'spool erection erect line pipe rack fit-up flange bolt-up piping structure' },
    { suf: 'Weld',    name: l => `Weld Line ${l.line}`,  dur: 3, qty: () => 48, unit: 'joints',
      keywords: ['weld','joint','rt','tack','root','spool'],
      search: 'welding weld joints spool line tack root pass rt radiography piping' },
    { suf: 'Hydro',   name: l => `Hydrotest Line ${l.line}`, dur: 2, qty: null, unit: null,
      keywords: ['hydrotest','test','pressure','flushing','leak'],
      search: 'hydrotest hydro testing pressure test line leak flushing pneumatic' },
    { suf: 'Hand',    name: l => `Reinstate & Handover Line ${l.line}`, dur: 2, qty: null, unit: null,
      keywords: ['handover','reinstate','insulate','paint','box'],
      search: 'handover reinstate insulation painting box up line completion punch commissioning' },
  ];

  // demo chain first with fixed IDs PIP-0453..0456
  let counter = 400;
  const nextPipingId = () => {
    counter++;
    if ([453, 454, 455, 456].includes(counter)) counter = 457;
    return `PIP-${String(counter).padStart(4, '0')}`;
  };
  const lineChainIds = {};
  lines.forEach((l, li) => {
    let s = l.start;
    const chain = [];
    stages.forEach((st, si) => {
      const id = l.demo ? `PIP-04${53 + si}` : nextPipingId();
      const f = E.addDays(s, st.dur);
      chain.push(id);
      acts.push(mkActivity({
        activity_id: id,
        activity_name: st.name(l),
        wbs: `PIP.PR-${l.rack.includes('Rack') ? l.rack.slice(-1) : 'TF'}.${st.suf.toUpperCase()}`,
        level: si === 0 || si === 3 ? 5 : 6,
        discipline: 'Piping', location: l.rack,
        planned_start: s, planned_finish: f,
        planned_qty: typeof st.qty === 'function' ? st.qty(l) : st.qty,
        unit: st.unit, tag: l.line,
        keywords: st.keywords, search_text: st.search + ' ' + l.line + ' ' + l.rack.toLowerCase(),
      }));
      s = E.addDays(f, 1);
    });
    lineChainIds[l.line] = chain;
    for (let i = 0; i < chain.length - 1; i++) {
      acts.find(a => a.activity_id === chain[i]).successors.push(chain[i + 1]);
      acts.find(a => a.activity_id === chain[i + 1]).predecessors.push(chain[i]);
    }
  });

  /* ------------------------------ Civil (20) ------------------------------ */
  const civil = [
    ['Site grading & levelling – Unit 100', 'CIV.GRADE.01', 'Unit 100', '2026-06-03', 8, 12000, 'm2', ['grade','level','earthwork','excavate'], 'rough grading levelling earthwork site preparation level area'],
    ['Site grading & levelling – Tank Farm', 'CIV.GRADE.02', 'Tank Farm', '2026-06-10', 8, 9000, 'm2', ['grade','level','earthwork'], 'grading levelling tank farm earthwork site preparation'],
    ['Excavation for equipment foundations – Unit 200', 'CIV.EXC.01', 'Unit 200', '2026-06-15', 7, 450, 'm3', ['excavate','pit','foundation','earthwork'], 'excavation pit equipment foundation earthwork digging'],
    ['Excavation for pipe rack foundations – Rack A', 'CIV.EXC.02', 'Pipe Rack A', '2026-06-18', 6, 320, 'm3', ['excavate','foundation','rack'], 'excavation pipe rack foundation pit trench earthwork'],
    ['Excavation for pipe rack foundations – Rack B', 'CIV.EXC.03', 'Pipe Rack B', '2026-06-22', 6, 320, 'm3', ['excavate','foundation','rack'], 'excavation pipe rack foundation pit trench earthwork'],
    ['Driven pile foundations – Unit 100', 'CIV.PILE.01', 'Unit 100', '2026-06-20', 10, 48, 'piles', ['pile','foundation','drive'], 'pile driven foundation piling rig unit 100'],
    ['Pile cap & pedestal concreting – Unit 100', 'CIV.PILE.02', 'Unit 100', '2026-07-04', 8, 85, 'm3', ['concrete','pile','foundation','pour','rebar'], 'pile cap pedestal concrete pour rcc rebar shuttering curing'],
    ['Equipment foundation concrete – Unit 200 pump pit', 'CIV.FND.01', 'Unit 200', '2026-07-08', 9, 120, 'm3', ['concrete','foundation','pour','pump'], 'equipment foundation concrete pour pump pit rcc pedestal'],
    ['Rebar & shuttering – foundation F-101', 'CIV.FND.02', 'Unit 100', '2026-07-01', 6, null, null, ['rebar','shuttering','foundation','concrete'], 'rebar shuttering formwork foundation f101 steel centering'],
    ['Cable trench excavation & casting – Rack A', 'CIV.TRN.01', 'Pipe Rack A', '2026-07-12', 10, 180, 'm', ['trench','excavate','concrete','cable'], 'cable trench excavation casting rcc trench rack'],
    ['Cable trench excavation & casting – Rack B', 'CIV.TRN.02', 'Pipe Rack B', '2026-07-20', 10, 180, 'm', ['trench','excavate','concrete','cable'], 'cable trench excavation casting rcc trench rack'],
    ['Underground drainage network – Offsite', 'CIV.DRN.01', 'Offsite Area', '2026-07-15', 12, 320, 'm', ['drainage','pipe','excavate','backfill'], 'underground drainage network sewer pipe excavation offsite'],
    ['Firewater loop pipe bedding', 'CIV.FW.01', 'Firewater Loop', '2026-07-22', 8, 260, 'm', ['firewater','bedding','pipe','sand'], 'firewater loop pipe bedding sand cushioning trench'],
    ['Road sub-grade & WMM – Tank Farm access', 'CIV.ROD.01', 'Tank Farm', '2026-08-01', 10, 240, 'm', ['road','wmm','grade','paving'], 'road sub grade wmm water bound macadam tank farm access'],
    ['RCC road paving – Unit 100 to Unit 200', 'CIV.ROD.02', 'Unit 100', '2026-08-15', 12, 300, 'm', ['road','concrete','paving','pour'], 'rcc road paving concrete carriageway unit 100 unit 200'],
    ['Concrete hardstanding – Substation-1', 'CIV.HRD.01', 'Substation-1', '2026-08-05', 7, 600, 'm2', ['concrete','hardstanding','pour'], 'concrete hardstanding paving substation yard'],
    ['Cable tray support foundations – Rack C', 'CIV.FND.03', 'Pipe Rack C', '2026-08-10', 6, 40, 'm3', ['foundation','concrete','tray','support'], 'cable tray support foundation pedestal rack c'],
    ['Rainwater harvesting pit – Offsite', 'CIV.RWH.01', 'Offsite Area', '2026-08-08', 5, null, null, ['pit','rainwater','harvesting','excavate'], 'rainwater harvesting pit rwh recharge pit offsite'],
    ['Transformer plinth & pedestals – Substation-1', 'CIV.PLN.01', 'Substation-1', '2026-08-18', 8, null, null, ['plinth','pedestal','concrete','transformer'], 'transformer plinth pedestal concrete foundation substation'],
    ['Backfilling & compaction – Unit 300', 'CIV.BFL.01', 'Unit 300', '2026-08-24', 7, 800, 'm3', ['backfill','compact','earthwork'], 'backfilling compaction earthwork unit 300 layer'],
  ];
  civil.forEach((c, i) => {
    acts.push(mkActivity({
      activity_id: `CIV-10${String(i + 1).padStart(2, '0')}`,
      activity_name: c[0], wbs: c[1], level: i % 3 === 2 ? 6 : 5, discipline: 'Civil',
      location: c[2], planned_start: c[3], planned_finish: E.addDays(c[3], c[4]),
      planned_qty: c[5], unit: c[6], keywords: c[7], search_text: c[8],
    }));
  });

  /* ---------------------------- Mechanical (16) ---------------------------- */
  const mech = [
    ['Pump P-201A setting & alignment', 'MEC.PMP.01', 'Unit 200', '2026-07-20', 5, 1, 'pump', 'P-201A', ['pump','set','align','grout','coupling'], 'pump setting alignment base plate grout coupling motor p201a'],
    ['Pump P-201B setting & alignment', 'MEC.PMP.02', 'Unit 200', '2026-07-25', 5, 1, 'pump', 'P-201B', ['pump','set','align','grout','coupling'], 'pump setting alignment base plate grout coupling motor p201b'],
    ['Vessel V-301 erection & setting', 'MEC.VSL.01', 'Unit 100', '2026-07-28', 6, 1, 'vessel', 'V-301', ['vessel','erect','set','lift','rigging'], 'vessel erection setting lift crane rigging v301 foundation'],
    ['Vessel V-302 erection & setting', 'MEC.VSL.02', 'Unit 100', '2026-08-03', 6, 1, 'vessel', 'V-302', ['vessel','erect','set','lift','rigging'], 'vessel erection setting lift crane rigging v302 foundation'],
    ['Heat exchanger E-205 setting', 'MEC.EXC.01', 'Unit 200', '2026-08-06', 4, 1, 'exchanger', 'E-205', ['exchanger','set','install','lift'], 'heat exchanger setting installation e205 bundle lift'],
    ['Compressor C-401 installation', 'MEC.CMP.01', 'Unit 300', '2026-08-18', 8, 1, 'compressor', 'C-401', ['compressor','install','set','skid','rotating'], 'compressor installation skid rotating equipment c401 unit 300'],
    ['Compressor C-401 laser alignment', 'MEC.CMP.02', 'Unit 300', '2026-08-28', 4, null, null, 'C-401', ['align','laser','compressor','coupling'], 'laser alignment compressor coupling train c401'],
    ['Grouting of rotating equipment – Unit 200', 'MEC.GRT.01', 'Unit 200', '2026-08-01', 5, 6, 'pumps', null, ['grout','pump','motor','foundation'], 'grouting rotating equipment pump motor base plate foundation'],
    ['Motor M-118 coupling & alignment', 'MEC.MTR.01', 'Unit 200', '2026-08-10', 4, 1, 'motor', 'M-118', ['motor','coupling','align','set'], 'motor coupling alignment m118 pump drive'],
    ['Tank TK-101 shell erection', 'MEC.TNK.01', 'Tank Farm', '2026-07-10', 14, 7, 'courses', 'TK-101', ['tank','shell','erect','weld','plate'], 'tank shell erection plate welding courses tk101 storage'],
    ['Tank TK-102 bottom plate laying', 'MEC.TNK.02', 'Tank Farm', '2026-07-24', 10, 1, 'tank', 'TK-102', ['tank','bottom','plate','lay','weld'], 'tank bottom plate laying welding tk102 floor'],
    ['Flare tip & boom installation', 'MEC.FLR.01', 'Offsite Area', '2026-09-10', 6, null, null, null, ['flare','install','boom','tip','lift'], 'flare tip boom installation stack lift offsite'],
    ['Cooling tower fan assembly', 'MEC.CT.01', 'Unit 300', '2026-09-01', 7, 2, 'fans', null, ['cooling','tower','fan','assembly','install'], 'cooling tower fan assembly blade gearbox installation'],
    ['Boiler feed pump setting', 'MEC.PMP.03', 'Boiler House', '2026-09-05', 6, 2, 'pumps', null, ['pump','set','boiler','feed','align'], 'boiler feed pump setting bfp boiler house alignment'],
    ['Equipment strip, inspect & lubricate – Unit 100', 'MEC.MNT.01', 'Unit 100', '2026-08-20', 6, 12, 'equipment', null, ['strip','inspect','lubricate','equipment','maintenance'], 'equipment strip inspect lubricate maintenance preservation'],
    ['Pressure safety valve testing – Tank Farm', 'MEC.PSV.01', 'Tank Farm', '2026-08-26', 4, 8, 'valves', null, ['valve','safety','psv','test','pressure'], 'pressure safety valve psv testing calibration pop test'],
  ];
  mech.forEach((m, i) => {
    acts.push(mkActivity({
      activity_id: `MEC-20${String(i + 1).padStart(2, '0')}`,
      activity_name: m[0], wbs: m[1], level: 6, discipline: 'Mechanical',
      location: m[2], planned_start: m[3], planned_finish: E.addDays(m[3], m[4]),
      planned_qty: m[5], unit: m[6], tag: m[7], keywords: m[8], search_text: m[9],
    }));
  });

  /* ---------------------------- Electrical (16) ---------------------------- */
  const elec = [
    ['Cable tray erection – Substation-1', 'ELE.TRY.01', 'Substation-1', '2026-07-08', 8, 120, 'm', ['cable','tray','erect','support'], 'cable tray erection supports ladder rack substation'],
    ['Cable tray erection – Pipe Rack A', 'ELE.TRY.02', 'Pipe Rack A', '2026-07-18', 8, 200, 'm', ['cable','tray','erect','support'], 'cable tray erection rack supports ladder'],
    ['Cable tray erection – Pipe Rack B', 'ELE.TRY.03', 'Pipe Rack B', '2026-08-01', 8, 200, 'm', ['cable','tray','erect','support'], 'cable tray erection rack b supports'],
    ['HV cable pulling (3.3kV) – Unit 100', 'ELE.CBL.01', 'Unit 100', '2026-08-10', 8, 320, 'm', ['cable','pull','hv','power'], 'hv cable pulling 3.3kv power cable drum unit 100'],
    ['LV cable pulling & termination – Unit 200', 'ELE.CBL.02', 'Unit 200', '2026-08-20', 8, 450, 'm', ['cable','pull','lv','terminate'], 'lv cable pulling termination power unit 200'],
    ['MCC installation & busbar – Substation-1', 'ELE.MCC.01', 'Substation-1', '2026-08-12', 6, 2, 'panels', ['mcc','busbar','install','panel'], 'mcc motor control centre busbar panel installation substation'],
    ['Transformer TR-01 setting – Substation-1', 'ELE.TRF.01', 'Substation-1', '2026-08-24', 6, 1, 'transformer', ['transformer','set','install','lift'], 'transformer tr01 setting installation radiator substation'],
    ['Grounding grid installation – Tank Farm', 'ELE.GND.01', 'Tank Farm', '2026-07-28', 7, 80, 'm', ['grounding','earthing','grid','earth'], 'grounding grid earthing earth strip electrode tank farm'],
    ['Grounding pit electrodes – Unit 100', 'ELE.GND.02', 'Unit 100', '2026-08-05', 5, 16, 'pits', ['grounding','earthing','pit','electrode'], 'grounding pit electrode earth rod unit 100'],
    ['Lighting poles & LED fixtures – Offsite', 'ELE.LGT.01', 'Offsite Area', '2026-08-22', 7, 24, 'lights', ['lighting','light','pole','fixture','flood'], 'lighting poles led flood light fixtures illumination offsite'],
    ['Junction boxes & local panels – Unit 200', 'ELE.JB.01', 'Unit 200', '2026-08-28', 5, 18, 'points', ['junction','panel','jb','mount'], 'junction box local panel mounting jb unit 200'],
    ['Cable glanding & termination – Rack B', 'ELE.TRM.01', 'Pipe Rack B', '2026-09-08', 6, 60, 'points', ['cable','gland','terminate','tray'], 'cable glanding termination rack b lug crimping'],
    ['HT cable termination – Substation-1', 'ELE.TRM.02', 'Substation-1', '2026-09-02', 5, 12, 'points', ['ht','cable','terminate','breaker'], 'ht cable termination heat shrink substation breaker'],
    ['Emergency lighting circuit – Unit 300', 'ELE.LGT.02', 'Unit 300', '2026-09-12', 5, 16, 'lights', ['lighting','emergency','circuit','light'], 'emergency lighting circuit battery unit 300'],
    ['Bus duct installation – Substation to Unit 100', 'ELE.BUS.01', 'Substation-1', '2026-09-01', 8, 48, 'm', ['bus','duct','busbar','install'], 'bus duct busbar installation substation unit 100'],
    ['Lightning protection air terminals – Tank Farm', 'ELE.LPS.01', 'Tank Farm', '2026-09-05', 4, 22, 'points', ['lightning','protection','air','terminal','earth'], 'lightning protection air terminal spike earth tank farm'],
  ];
  elec.forEach((el, i) => {
    acts.push(mkActivity({
      activity_id: `ELE-30${String(i + 1).padStart(2, '0')}`,
      activity_name: el[0], wbs: el[1], level: i % 4 === 0 ? 5 : 6, discipline: 'Electrical',
      location: el[2], planned_start: el[3], planned_finish: E.addDays(el[3], el[4]),
      planned_qty: el[5], unit: el[6], keywords: el[7], search_text: el[8],
    }));
  });

  /* -------------------------- Instrumentation (12) ------------------------- */
  const inst = [
    ['Instrument air header tubing – Rack B', 'INS.IA.01', 'Pipe Rack B', '2026-08-12', 6, 90, 'm', ['tubing','air','header','instrument'], 'instrument air header tubing ss tube rack b'],
    ['Pressure transmitter installation – Unit 200', 'INS.PT.01', 'Unit 200', '2026-08-16', 6, 12, 'transmitters', ['transmitter','pressure','install','mount','instrument'], 'pressure transmitter installation mounting stand unit 200'],
    ['Control valve CV-115 mounting – Rack B', 'INS.CV.01', 'Pipe Rack B', '2026-08-20', 4, 1, 'valve', 'CV-115', ['valve','control','mount','install'], 'control valve cv115 mounting line rack b'],
    ['Temperature loop TE-204 – Unit 200', 'INS.TE.01', 'Unit 200', '2026-08-24', 4, 1, 'loop', 'TE-204', ['temperature','loop','thermowell','transmitter'], 'temperature loop te204 thermowell rtd unit 200'],
    ['Orifice plate flow element – Unit 100', 'INS.FE.01', 'Unit 100', '2026-08-28', 3, 4, 'elements', ['orifice','flow','element','plate','install'], 'orifice plate flow element installation fe unit 100'],
    ['DCS cabinet installation – Substation-1', 'INS.DCS.01', 'Substation-1', '2026-09-01', 5, 2, 'cabinets', ['dcs','cabinet','install','panel'], 'dcs cabinet installation marshalling panel substation'],
    ['Field instrument calibration – Unit 200', 'INS.CAL.01', 'Unit 200', '2026-09-06', 6, 30, 'instruments', ['calibrate','instrument','transmitter','gauge'], 'field instrument calibration transmitter gauge unit 200'],
    ['Fire & gas detector mounting – Tank Farm', 'INS.FG.01', 'Tank Farm', '2026-09-08', 5, 14, 'detectors', ['fire','gas','detector','mount','alarm'], 'fire gas detector mounting f&g flame detector tank farm'],
    ['Instrument signal cable laying – Rack C', 'INS.SIG.01', 'Pipe Rack C', '2026-09-10', 6, 220, 'm', ['cable','signal','lay','instrument'], 'instrument signal cable laying pair tray rack c'],
    ['Level instruments & gauge glass – Tank Farm', 'INS.LT.01', 'Tank Farm', '2026-09-14', 4, 6, 'instruments', ['level','gauge','glass','transmitter'], 'level instrument gauge glass sight tank farm'],
    ['Control valve calibration – Rack B', 'INS.CAL.02', 'Pipe Rack B', '2026-09-16', 4, 8, 'valves', ['calibrate','valve','control','positioner'], 'control valve calibration positioner stroke rack b'],
    ['Loop check & SAT – Unit 200', 'INS.SAT.01', 'Unit 200', '2026-09-20', 6, 40, 'loops', ['loop','check','sat','test','dcs'], 'loop check sat site acceptance test dcs unit 200'],
  ];
  inst.forEach((ins, i) => {
    // rows may omit the tag column: detect by type of element at index 7
    const hasTag = !Array.isArray(ins[7]);
    const tag = hasTag ? ins[7] : null;
    const keywords = hasTag ? ins[8] : ins[7];
    const search = hasTag ? ins[9] : ins[8];
    acts.push(mkActivity({
      activity_id: `INS-40${String(i + 1).padStart(2, '0')}`,
      activity_name: ins[0], wbs: ins[1], level: 6, discipline: 'Instrumentation',
      location: ins[2], planned_start: ins[3], planned_finish: E.addDays(ins[3], ins[4]),
      planned_qty: ins[5], unit: ins[6], tag, keywords, search_text: search,
    }));
  });

  /* -------------------------------- HSE (8) -------------------------------- */
  const hse = [
    ['PTW system & permit board setup', 'HSE.PTW.01', 'Unit 100', '2026-06-03', 3, ['permit','ptw','setup','board'], 'permit to work ptw system permit board setup hot work'],
    ['Toolbox talks & site induction', 'HSE.TBT.01', 'Unit 100', '2026-06-05', 5, ['toolbox','induction','safety','talk'], 'toolbox talk induction safety briefing onboarding'],
    ['Safety netting & edge barricading – Unit 100', 'HSE.NET.01', 'Unit 100', '2026-07-15', 6, ['safety','netting','barricade','edge'], 'safety netting edge protection barricading elevated'],
    ['Fire watch & hot work permits – Tank Farm', 'HSE.FW.01', 'Tank Farm', '2026-07-24', 10, ['fire','watch','hot','work','permit'], 'fire watch hot work permit spark tank farm'],
    ['Mock drill – emergency evacuation', 'HSE.DRL.01', 'Tank Farm', '2026-08-25', 2, ['drill','mock','evacuation','emergency'], 'mock drill emergency evacuation assembly tank farm'],
    ['Scaffold inspection & tagging – Rack B', 'HSE.SCF.01', 'Pipe Rack B', '2026-08-28', 4, ['scaffold','inspect','tag','ladder'], 'scaffold inspection tagging ladder access rack b'],
    ['HSE internal audit', 'HSE.AUD.01', 'Unit 100', '2026-09-10', 3, ['audit','hse','inspection','compliance'], 'hse internal audit inspection compliance review'],
    ['PPE compliance drive', 'HSE.PPE.01', 'Unit 200', '2026-09-01', 4, ['ppe','compliance','safety','drive'], 'ppe compliance drive helmet harness safety'],
  ];
  hse.forEach((h, i) => {
    acts.push(mkActivity({
      activity_id: `HSE-50${String(i + 1).padStart(2, '0')}`,
      activity_name: h[0], wbs: h[1], level: 5, discipline: 'HSE',
      location: h[2], planned_start: h[3], planned_finish: E.addDays(h[3], h[4]),
      keywords: h[5], search_text: h[6],
    }));
  });

  /* ------------------------- Cross-discipline links ------------------------ */
  const link = (pred, succ) => {
    const p = acts.find(a => a.activity_id === pred), s = acts.find(a => a.activity_id === succ);
    if (p && s) { p.successors.push(succ); s.predecessors.push(pred); }
  };
  link('CIV-1008', 'MEC-2001'); // pump pit foundation -> pump setting
  link('CIV-1007', 'MEC-2003'); // pile cap unit100 -> vessel
  link('CIV-1019', 'ELE-3007'); // transformer plinth -> transformer
  link('ELE-3001', 'ELE-3006'); // tray substation -> MCC
  link('ELE-3003', 'ELE-3012'); // tray rack b -> glanding
  link('CIV-1011', 'ELE-3003'); // trench rack b -> tray rack b
  link('MEC-2006', 'MEC-2007'); // compressor install -> alignment
  link('INS-4003', 'INS-4011'); // CV mount -> CV calibration
  link('INS-4001', 'INS-4003'); // air header -> control valve
  link('MEC-2010', 'HSE-5004'); // tank erection -> fire watch

  /* ------------------- Status / actuals seeding (deterministic) ------------------- */
  const delayCycle = ['Material', 'Manpower', 'Weather', 'Equipment', 'Access'];
  const delayReason = {
    'Material': 'Material availability', 'Manpower': 'Manpower shortage', 'Weather': 'Weather conditions',
    'Equipment': 'Equipment breakdown/non-availability', 'Access': 'Access constraint',
  };
  acts.forEach((a, idx) => {
    if (['PIP-0453', 'PIP-0454', 'PIP-0455', 'PIP-0456'].includes(a.activity_id)) return; // demo chain untouched
    if (a.planned_finish <= DATA_DATE) {
      if (idx % 6 === 2) {
        // delayed but worked
        const late = 3 + (idx % 5);
        a.actual_start = E.addDays(a.planned_start, late);
        a.actual_finish = E.addDays(a.planned_finish, late + 1);
        a.progress = 100; a.status = 'Delayed';
        a.start_variance = late; a.finish_variance = late + 1;
        a.delay_flag = true; a.delay_category = delayCycle[idx % delayCycle.length];
        a.delay_reason = delayReason[a.delay_category];
      } else {
        const jitter = (idx % 3) - 1;
        a.actual_start = E.addDays(a.planned_start, jitter);
        a.actual_finish = E.addDays(a.planned_finish, (idx % 4) - 1);
        a.progress = 100; a.status = 'Completed';
        a.start_variance = Math.max(0, jitter); a.finish_variance = Math.max(0, (idx % 4) - 1);
      }
    } else if (a.planned_start <= DATA_DATE) {
      if (idx % 4 === 0) { a.status = 'Not Started'; }
      else {
        const late = idx % 5 === 0 ? 2 : 0;
        a.actual_start = E.addDays(a.planned_start, late);
        a.progress = 25 + (idx % 45);
        a.status = late ? 'Delayed' : 'In Progress';
        a.start_variance = late;
        if (late) { a.delay_flag = true; a.delay_category = delayCycle[idx % delayCycle.length]; a.delay_reason = delayReason[a.delay_category]; }
      }
    }
  });

  // Explicit scenario alignment with seeded approved reports
  const setByName = (namePart, patch) => {
    const a = acts.find(x => x.activity_name.includes(namePart));
    if (a) Object.assign(a, patch);
  };
  setByName('Erect Line 20-P-118', { status: 'Delayed', progress: 20, actual_start: '2026-08-12', start_variance: 2, delay_flag: true, delay_category: 'Material', delay_reason: 'Material availability' });
  setByName('Cable trench excavation & casting – Rack A', { status: 'Completed', actual_finish: '2026-07-26', finish_variance: 4, delay_flag: true, delay_category: 'Weather', delay_reason: 'Weather conditions' });
  setByName('HV cable pulling', { status: 'Delayed', progress: 45, actual_start: '2026-08-12', start_variance: 2, delay_flag: true, delay_category: 'Material', delay_reason: 'Material availability' });
  setByName('RCC road paving', { status: 'Delayed', progress: 55, actual_start: '2026-08-17', start_variance: 2, delay_flag: true, delay_category: 'Access', delay_reason: 'Access constraint' });
  setByName('Weld Line 16-P-210', { status: 'In Progress', progress: 60, actual_start: '2026-07-22', start_variance: 1 });
  setByName('Tank TK-101 shell erection', { status: 'In Progress', progress: 65, actual_start: '2026-07-11', start_variance: 1 });

  // risks + downstream
  acts.forEach(a => E.recomputeRisk(a, DATA_DATE));
  acts.filter(a => a.status === 'Delayed').forEach(a => E.propagateDownstream(acts, a, DATA_DATE));
  acts.forEach(a => E.recomputeRisk(a, DATA_DATE));

  return acts;
}

/* ------------------------------ Field reports ----------------------------- */

function buildReports() {
  const R = (id, date, by, discipline, location, text, state) =>
    ({ report_id: id, report_date: date, submitted_by: by, submitter_role: 'Supervisor',
       discipline, location, raw_text: text, processing_status: state,
       extraction: null, match: null, linked_activity: null, created_at: date + 'T09:00',
       duplicate_of: null, file_name: null });

  return [
    R('FR-001', '2026-06-18', 'Ravi Kumar', 'Civil', 'Unit 100',
      '18-Jun-2026\nCivil – Unit 100\nRough grading and levelling of the main process area at Unit 100 was completed today. The graded area has been handed over to the excavation team. Total 12000 sqm graded. No safety incidents.', 'approved'),
    R('FR-002', '2026-07-10', 'M. Suresh', 'Civil', 'Unit 100',
      'Pile cap and pedestal concreting completed in Unit 100. 85 cubic meters of concrete poured on 10-Jul-2026; cube samples sent for testing. Curing started.', 'approved'),
    R('FR-003', '2026-07-22', 'K. Ganesh', 'Piping', 'Pipe Rack A',
      'Line 08-P-205 spool erection completed at Pipe Rack A on 22-Jul-2026. All 18 spools erected, fit-up and bolt-up completed. Welding crew to take over from tomorrow.', 'approved'),
    R('FR-004', '2026-07-28', 'K. Ganesh', 'Piping', 'Pipe Rack C',
      '28-Jul-2026\nPiping – Pipe Rack C\nWelding of line 16-P-210 in progress. 24 joints welded today including 6 root passes. RT cleared for all joints done so far. Welder shortage in the morning slowed start by 2 hrs (manpower).', 'approved'),
    R('FR-005', '2026-08-22', 'A. Farooq', 'Piping', 'Tank Farm',
      'Hydrotesting of line 06-P-310 at Tank Farm completed successfully on 22-Aug-2026. Test pressure held for 2 hours, no leaks observed. Line drained and handed over for flushing.', 'approved'),
    R('FR-006', '2026-07-28', 'M. Suresh', 'Mechanical', 'Unit 200',
      'Pump P-201A setting and alignment completed at Unit 200. Base plate checked, pump aligned with motor and grouted on 28-Jul-2026. 1 pump boxed up.', 'approved'),
    R('FR-007', '2026-07-30', 'Ravi Kumar', 'Mechanical', 'Unit 100',
      'Vessel V-301 erected and set on its foundation at Unit 100 on 30-Jul-2026 using 250T crane. Grouting will be taken up after final inspection.', 'approved'),
    R('FR-008', '2026-07-15', 'A. Farooq', 'Electrical', 'Substation-1',
      '15-Jul-2026\nElectrical – Substation-1\nCable tray installation in Substation-1 completed. 120 meters of tray and supports erected, earth continuity verified.', 'approved'),
    R('FR-009', '2026-08-12', 'A. Farooq', 'Electrical', 'Unit 100',
      'HV cable pulling commenced at Unit 100 on 12-Aug-2026 at 11:00 AM. 320 meters of 3.3kV cable pulled. Work started late as cable drum arrived late from stores (material delay); half day lost.', 'approved'),
    R('FR-010', '2026-08-18', 'M. Suresh', 'Instrumentation', 'Unit 200',
      'Instrumentation – Unit 200\nPressure transmitter installation in progress. 12 transmitters mounted on stands as of 18-Aug-2026; impulse tubing and air header connection pending.', 'approved'),
    R('FR-011', '2026-08-25', 'Ravi Kumar', 'HSE', 'Tank Farm',
      'Mock drill conducted at Tank Farm on 25-Aug-2026. Emergency evacuation drill carried out with 40 personnel; assembly time 6 minutes. Observations noted for improvement.', 'approved'),
    R('FR-012', '2026-07-08', 'K. Ganesh', 'Civil', 'Pipe Rack A',
      '08-Jul-2026\nCivil – Pipe Rack A\nCable trench excavation work was delayed due to heavy rain in the afternoon. Site waterlogged and work stopped for the day. Excavation will resume tomorrow morning.', 'approved'),
    R('FR-013', '2026-07-06', 'M. Suresh', 'Civil', 'Unit 100',
      'Rebar placement and shuttering for equipment foundation F-101 at Unit 100 completed on 06-Jul-2026. Foundry inspection requested before concreting.', 'approved'),
    R('FR-014', '2026-08-10', 'Ravi Kumar', 'Civil', 'Tank Farm',
      'Road works along Tank Farm access road: WMM layer laying completed for 240 meters on 10-Aug-2026. RCC paving to start next week.', 'approved'),
    R('FR-015', '2026-08-30', 'M. Suresh', 'Mechanical', 'Unit 300',
      'Compressor C-401 laser alignment in progress at Unit 300. Train A alignment completed on 30-Aug; train B alignment scheduled tomorrow. Grouting after sign-off.', 'approved'),
    R('FR-016', '2026-08-05', 'A. Farooq', 'Electrical', 'Tank Farm',
      'Grounding grid installation at Tank Farm completed on 05-Aug-2026. 80 meters of earth strip laid and 16 pit electrodes driven. Earth resistance test pending.', 'approved'),
    R('FR-017', '2026-08-27', 'A. Farooq', 'Electrical', 'Offsite Area',
      'Lighting fixture erection at Offsite Area: 24 LED flood lights installed on poles as of 27-Aug-2026. Cable termination and circuiting pending.', 'approved'),
    R('FR-018', '2026-08-24', 'M. Suresh', 'Instrumentation', 'Pipe Rack B',
      'Control valve CV-115 mounted on line 10-P-415 at Pipe Rack B on 24-Aug-2026. Calibration and loop check to follow after air header readiness.', 'approved'),
    R('FR-019', '2026-08-29', 'M. Suresh', 'Instrumentation', 'Unit 200',
      'DCS loop check for temperature loop TE-204 at Unit 200 completed on 29-Aug-2026. Loop signed off by QC.', 'approved'),
    R('FR-020', '2026-08-30', 'K. Ganesh', 'Piping', 'Offsite Area',
      'Flushing of line 04-P-610 at Offsite Area completed on 30-Aug-2026. Line boxed up after QC inspection and reinstatement.', 'approved'),
    R('FR-021', '2026-08-19', 'K. Ganesh', 'Piping', 'Tank Farm',
      '19-Aug-2026\nPiping – Tank Farm\nLine 20-P-118 erection is held up: spools not delivered. Only 4 of 20 spools available at site; balance expected by 24-Aug. Material shortage impacting progress.', 'approved'),
    R('FR-022', '2026-07-20', 'Ravi Kumar', 'HSE', 'Unit 100',
      'Safety netting and barricading completed at Unit 100 elevated structures on 20-Jul-2026. All open edges protected; tags fixed.', 'approved'),
    R('FR-023', '2026-08-27', 'Ravi Kumar', 'Civil', 'Tank Farm',
      '27-Aug-2026\nAccess to Tank Farm was blocked today due to ongoing road paving work. Material movement to tank area affected; crane mobilised via alternate route. Access constraint noted.', 'approved'),
    R('FR-024', '2026-07-18', 'M. Suresh', 'Mechanical', 'Tank Farm',
      'Tank TK-101 shell erection in progress at Tank Farm. 4 shell courses erected as of 18-Jul-2026 out of 7. Welding of vertical seams ongoing.', 'approved'),
    R('FR-025', '2026-09-02', 'K. Ganesh', 'Piping', 'Pipe Rack C',
      '02-Sep-2026\nPiping – Pipe Rack C\nErection of line 12-P-502 started at 09:30 AM. 6 spools erected today. Fit-up inspection cleared. Material and manpower adequate.', 'pending_review'),
    R('FR-026', '2026-09-02', 'Ravi Kumar', 'Piping', 'Pipe Rack A',
      'Pipe rack line erection started today at Rack A. Spools are going up, about 3 erected. Welding after fit-up.', 'pending_review'),
    R('FR-027', '2026-09-01', 'M. Suresh', 'Mechanical', 'Unit 300',
      '01-Sep-2026\nMechanical – Unit 300\nStarted installation of new pump P-901 at Unit 300. Foundation is ready and pump placed on base plate. Alignment pending vendor.', 'pending_review'),
    R('FR-028', '2026-09-02', 'A. Farooq', null, null,
      'Some installation work started in the unit area today. Few items fixed by the team. Will report more tomorrow.', 'pending_review'),
    R('FR-029', '2026-09-02', 'K. Ganesh', 'Piping', 'Pipe Rack C',
      '02-Sep-2026\nPiping – Pipe Rack C\nWelding machine breakdown in the afternoon — line 16-P-210 welding was held up for 3 hours. 6 joints completed before breakdown. Machine replaced by evening.', 'submitted'),
    R('FR-030', '2026-09-02', 'K. Ganesh', 'Piping', 'Pipe Rack C',
      '02-Sep-2026\nPiping – Pipe Rack C\nLine 12-P-502 erection started today at 09:30 hrs. Six spools erected and fit-up done. All material available.', 'submitted'),
    R('FR-031', '2026-09-02', 'Ravi Kumar', 'HSE', 'Substation-1',
      '02-Sep-2026\nHSE – Substation-1\nToolbox talk conducted at Substation-1 this morning. Hot work permit to work issued for cable termination. No incidents or near misses reported.', 'submitted'),
  ];
}

/* ------------------------------- Seed builder ----------------------------- */

function buildSeed() {
  const activities = buildActivities();
  const reports = buildReports();
  const audit = [];
  const memory = [];
  let auditSeq = 100, memSeq = 100;

  const addAudit = (a) => { audit.push(Object.assign({ audit_id: `AUD-${auditSeq++}`, timestamp: E.nowStamp() }, a)); };
  const addMem = (m) => { memory.push(Object.assign({ memory_id: `MEM-${memSeq++}`, date: E.nowStamp().slice(0, 10) }, m)); };

  // Process approved historical reports: run real engine, store results, write history
  reports.forEach((r, i) => {
    const extraction = E.extractReport(r.raw_text, { report_date: r.report_date, discipline: r.discipline, location: r.location });
    const match = E.matchActivities(extraction, r.raw_text, activities);
    r.extraction = extraction;

    if (r.processing_status === 'approved') {
      const rec = match.recommended || match.candidates[0];
      if (rec && rec.total_confidence >= 55) {
        r.match = Object.assign({}, rec, { match_id: `M-${r.report_id}`, report_id: r.report_id, decision: 'approved', decided_by: 'Anjali Sharma', decided_at: r.report_date + 'T10:00' });
        r.linked_activity = rec.activity_id;
        const act = activities.find(a => a.activity_id === rec.activity_id);
        if (act) {
          act.evidence_reports.push(r.report_id);
          addAudit({ user: 'Anjali Sharma', role: 'Planner', source_report: r.report_id, activity_id: rec.activity_id,
            field_changed: extraction.event === 'finish' ? 'Actual Finish' : 'Actual Start',
            old_value: 'NULL', new_value: extraction.actual_finish || extraction.actual_start || r.report_date,
            confidence: rec.total_confidence, action: 'Approved', approval_status: 'Approved' });
          addAudit({ user: 'Anjali Sharma', role: 'Planner', source_report: r.report_id, activity_id: rec.activity_id,
            field_changed: 'Progress %', old_value: '0%', new_value: (act.progress || 100) + '%',
            confidence: rec.total_confidence, action: 'Approved', approval_status: 'Approved' });
          if (extraction.delay_reason) {
            addAudit({ user: 'Anjali Sharma', role: 'Planner', source_report: r.report_id, activity_id: rec.activity_id,
              field_changed: 'Delay Reason', old_value: 'NULL', new_value: extraction.delay_reason,
              confidence: rec.total_confidence, action: 'Approved', approval_status: 'Approved' });
          }
          addMem({ source_type: 'approval', source_id: r.report_id, activity_id: rec.activity_id,
            title: `Planner approved field update — ${rec.activity_id}`,
            content: `Field report ${r.report_id} (${r.submitted_by}) was matched to "${rec.activity_name}" with ${rec.total_confidence}% confidence and approved by Planner. Event: ${extraction.event || 'progress update'}${extraction.quantity ? ', quantity ' + extraction.quantity + ' ' + extraction.unit : ''}${extraction.delay_reason ? ', delay: ' + extraction.delay_reason : ''}.`,
            tags: ['approval', 'schedule-update', rec.discipline.toLowerCase(), extraction.delay_category ? 'delay' : 'progress'].filter(Boolean) });
        }
      }
    } else if (r.processing_status === 'pending_review') {
      r.match = recOrPending(match, r);
    }

    // memory for every report
    addMem({ source_type: 'report', source_id: r.report_id, activity_id: r.linked_activity,
      title: `Field report ${r.report_id} — ${r.discipline || 'General'}${r.location ? ' @ ' + r.location : ''}`,
      content: r.raw_text.replace(/\n/g, ' ').slice(0, 300),
      tags: ['field-report', (r.discipline || 'general').toLowerCase(), ...(extraction.delay_category ? ['delay', extraction.delay_category.toLowerCase()] : [])],
      date: r.report_date });
    if (extraction.delay_reason) {
      addMem({ source_type: 'delay', source_id: r.report_id, activity_id: r.linked_activity,
        title: `Delay recorded — ${extraction.delay_category} (${r.report_id})`,
        content: `${extraction.delay_reason} reported in ${r.location || 'site'} on ${E.fmtDate(r.report_date)}. Evidence: "${extraction.delay_evidence || ''}"`,
        tags: ['delay', extraction.delay_category.toLowerCase(), r.discipline ? r.discipline.toLowerCase() : 'general'],
        date: r.report_date });
    }
  });

  // risk memory
  activities.filter(a => a.risk_level === 'High' || a.risk_level === 'Critical').forEach(a => {
    addMem({ source_type: 'risk', source_id: a.activity_id, activity_id: a.activity_id,
      title: `${a.risk_level} risk — ${a.activity_id}`,
      content: `${a.activity_name} (${a.discipline}, ${a.location}) scored ${a.risk_score}/100. Reasons: ${(a.risk_reasons || []).join('; ')}.`,
      tags: ['risk', a.risk_level.toLowerCase(), a.discipline.toLowerCase()],
      date: DATA_DATE });
  });

  return {
    project: {
      project_id: 'PRJ-001',
      name: 'Cauvery Refinery Expansion — Package 3 (Offsites & Utilities)',
      description: 'Fictional EPC project for BuildNova AI prototype. Mechanical completion of offsites, tank farm and utility units.',
      start_date: '2026-06-01', end_date: '2027-03-31',
      status: 'In Execution', data_date: DATA_DATE,
      client: 'Cauvery Petroleum Ltd. (fictional)', contractor: 'BuildNova EPC JV (fictional)',
    },
    users: [
      { email: 'supervisor@buildnova.ai', name: 'Ravi Kumar', role: 'Supervisor', title: 'Field Supervisor' },
      { email: 'planner@buildnova.ai', name: 'Anjali Sharma', role: 'Planner', title: 'Planning Engineer' },
      { email: 'pm@buildnova.ai', name: 'Vikram Menon', role: 'Project Manager', title: 'Project Manager' },
    ],
    activities, reports, audit, memory,
    learned: { mappings: [] },
    notifications: [],
    seq: { report: 32, audit: auditSeq, memory: memSeq, match: 500 },
  };
}

function recOrPending(match, r) {
  const base = {
    match_id: `M-PEND-${r.report_id}`, report_id: r.report_id,
    decision: 'pending', decided_by: null, decided_at: null,
    unknown_identifiers: match.unknown_identifiers,
    candidates: match.candidates,
    weights: match.weights,
  };
  if (match.recommended) {
    return Object.assign(base, match.recommended, { status: match.status });
  }
  return Object.assign(base, { status: match.status, recommended: null,
    activity_id: null, activity_name: null, discipline: null, location: null, wbs: null,
    scores: { identifier: 0, semantic: 0, keyword: 0, discipline: 0, location: 0, wbs: 0 },
    signals: {}, total_confidence: match.candidates[0] ? match.candidates[0].total_confidence : 0 });
}

module.exports = { buildSeed, DATA_DATE };
