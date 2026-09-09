/* parse-globals.js — pure static sanity check, no server needed.
 * Concatenates the browser JS in the SAME order index.html loads it, then parses
 * the whole bundle. This reproduces real-browser global-scope behaviour and would
 * have caught the classic "Identifier 'h' has already been declared" error that a
 * file-by-file check cannot see.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ORDER = ['js/api.js', 'js/charts.js', 'js/ui.js', 'js/pages-1.js', 'js/pages-2.js', 'js/pages-3.js', 'js/app.js'];
const bundle = ORDER.map(f => {
  const p = path.join(ROOT, 'public', f);
  if (!fs.existsSync(p)) throw new Error('Missing public file: ' + f);
  return fs.readFileSync(p, 'utf8');
}).join('\n;\n');

const tmp = path.join(ROOT, 'test', '.bundle.tmp.js');
fs.writeFileSync(tmp, bundle);
const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
fs.unlinkSync(tmp);

if (r.status !== 0) {
  console.error('❌ Browser bundle parse FAILED (this is a real-browser global-scope error):');
  console.error(r.stderr);
  process.exit(1);
}

// Each page file must be IIFE-wrapped (file-local scope) so top-level consts
// like `const { h } = UI` never collide in the browser's shared global scope.
for (const f of ORDER.slice(3, 6)) {  // pages-1/2/3; app.js keeps its top-level const App
  const src = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  if (!/^\(\s*\(\s*\)\s*=>/.test(src.trimStart())) {
    console.error(`❌ ${f} is not IIFE-wrapped — top-level declarations could collide in the browser global scope.`);
    process.exit(1);
  }
}

console.log('✅ Browser bundle parses cleanly in shared global scope (all ' + ORDER.length + ' files, merged).');
console.log('✅ All page files are IIFE-wrapped (no global redeclaration risk).');
process.exit(0);
