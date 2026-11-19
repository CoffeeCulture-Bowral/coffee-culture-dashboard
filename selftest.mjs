#!/usr/bin/env node
/* ============================================================================
   selftest.mjs - run this after writing or editing ANY scaffold file, before
   every push. Catches a truncated or null-padded file (a write that got cut
   off still often "parses" individually, but deploys to a blank page or a
   worker that silently does nothing). Exit code 0 = green, push away.
   Exit code 1 = something's wrong - read the message, fix it, rerun.
============================================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let failed = false;
function fail(msg) { console.error('FAIL: ' + msg); failed = true; }
function ok(msg) { console.log('ok: ' + msg); }

function checkNoNulls(path, text) {
  if (text.indexOf('\u0000') !== -1) fail(path + ' contains null bytes - truncated/corrupted write. Rebuild it cleanly and rerun.');
}
function checkEof(path, text, marker) {
  const tail = text.slice(-400);
  if (!tail.includes(marker)) fail(path + ' is missing its "' + marker + '" end marker - the file may have been cut off mid-write.');
}

/* ---- package.json: must be valid JSON ---- */
if (!existsSync('package.json')) {
  fail('package.json is missing.');
} else {
  const raw = readFileSync('package.json', 'utf8');
  checkNoNulls('package.json', raw);
  try {
    const pkg = JSON.parse(raw);
    if (!pkg.scripts || !pkg.scripts.deploy) fail('package.json has no "deploy" script.');
    else ok('package.json parses and has a deploy script');
  } catch (e) {
    fail('package.json is not valid JSON: ' + e.message);
  }
}

/* ---- wrangler.toml: has name/main set, KV binding present, ends cleanly ---- */
if (!existsSync('wrangler.toml')) {
  fail('wrangler.toml is missing.');
} else {
  const raw = readFileSync('wrangler.toml', 'utf8');
  checkNoNulls('wrangler.toml', raw);
  checkEof('wrangler.toml', raw, '# EOF wrangler.toml');
  const nameMatch = /^\s*name\s*=\s*"([^"]+)"/m.exec(raw);
  if (!nameMatch || !nameMatch[1] || nameMatch[1] === 'venue-dashboard') {
    fail('wrangler.toml "name" is missing or still the placeholder "venue-dashboard" - set it to the GitHub repo name.');
  } else {
    ok('wrangler.toml name = "' + nameMatch[1] + '"');
  }
  if (!/main\s*=\s*"worker\.js"/.test(raw)) fail('wrangler.toml "main" does not point at worker.js.');
  if (!/binding\s*=\s*"TOKENS"/.test(raw)) fail('wrangler.toml is missing the TOKENS KV binding.');
  if (!failed) ok('wrangler.toml structure looks complete');
}

/* ---- worker.js: no null bytes, ends cleanly, and is valid JS (node --check) ---- */
if (!existsSync('worker.js')) {
  fail('worker.js is missing.');
} else {
  const raw = readFileSync('worker.js', 'utf8');
  checkNoNulls('worker.js', raw);
  checkEof('worker.js', raw, '// EOF worker.js');
  if (raw.length < 5000) fail('worker.js is suspiciously short (' + raw.length + ' bytes) - likely truncated.');
  try {
    execFileSync(process.execPath, ['--check', 'worker.js'], { stdio: 'pipe' });
    ok('worker.js is syntactically valid JavaScript (' + raw.length + ' bytes)');
  } catch (e) {
    fail('worker.js failed a syntax check: ' + (e.stderr ? e.stderr.toString() : e.message));
  }
}

/* ---- dashboard.html: no null bytes, ends cleanly, has the expected structure ---- */
if (!existsSync('dashboard.html')) {
  fail('dashboard.html is missing.');
} else {
  const raw = readFileSync('dashboard.html', 'utf8');
  checkNoNulls('dashboard.html', raw);
  checkEof('dashboard.html', raw, '<!-- EOF dashboard.html -->');
  if (raw.length < 10000) fail('dashboard.html is suspiciously short (' + raw.length + ' bytes) - likely truncated.');
  if (!raw.includes('</html>')) fail('dashboard.html has no closing </html> tag - truncated.');
  if (!raw.includes('KIT_CONFIG_START') || !raw.includes('KIT_CONFIG_END')) fail('dashboard.html is missing its KIT_CONFIG markers.');
  if (!failed) ok('dashboard.html structure looks complete (' + raw.length + ' bytes)');
}

if (failed) {
  console.error('\nSELFTEST FAILED - do not push. If a file was flagged as truncated or null-padded,\nthat is the known mounted-folder sync hazard, not a content bug: rebuild the\nflagged file cleanly (write it fresh) and rerun this script.');
  process.exit(1);
} else {
  console.log('\nSELFTEST PASSED - safe to push.');
  process.exit(0);
}
