/* run-all.js — one-command test battery.
 * Boots the app server (if not already running), then runs every suite in order.
 * Usage: node test/run-all.js   (or `npm test`)
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 4730;
const SUITES = [
  'parse-globals.js', 'smoke.js', 'audit.js', 'nav-click.js', 'nav-anchor.js',
  'rbac-check.js', 'interact.js', 'confidence-check.js', 'new-features.js',
  'full-audit.js', 'spot-check.js',
];

function health() {
  try { return spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', `http://127.0.0.1:${PORT}/api/health`], { encoding: 'utf8' }).stdout === '200'; }
  catch (e) { return false; }
}

function resetDemo() {
  try {
    const login = spawnSync('curl', ['-s', '-X', 'POST', `http://127.0.0.1:${PORT}/api/auth/login`,
      '-H', 'Content-Type: application/json', '-d', '{"role":"Planner"}'], { encoding: 'utf8' }).stdout;
    const token = (JSON.parse(login).token) || '';
    if (token) spawnSync('curl', ['-s', '-X', 'POST', `http://127.0.0.1:${PORT}/api/demo/reset`, '-H', `x-auth-token: ${token}`], { stdio: 'ignore' });
  } catch (e) {}
}

(async () => {
  let server = null;
  if (!health()) {
    console.log(`Starting server on :${PORT} for tests...`);
    server = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { stdio: 'ignore' });
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 250)); if (health()) break; }
  }
  if (!health()) { console.error('❌ Server did not become healthy — cannot run suites.'); server && server.kill(); process.exit(1); }

  let failed = 0;
  for (const suite of SUITES) {
    const file = path.join(ROOT, 'test', suite);
    if (!fs.existsSync(file)) { console.log(`\n— ${suite} (skipped, not present)`); continue; }
    process.stdout.write(`\n▶ ${suite}\n`);
    const res = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) { failed++; console.log(`✗ ${suite} FAILED (exit ${res.status})`); }
    else console.log(`✓ ${suite} passed`);
    // restore clean baseline between suites
    resetDemo();
  }

  if (server) server.kill();
  console.log(`\n${failed === 0 ? '🎉 ALL SUITES PASSED' : '❌ ' + failed + ' suite(s) FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
})();
