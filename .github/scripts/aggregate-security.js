#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function findSummaries(dir) {
  dir = dir || '.';
  const out = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const s = fs.statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/summary-.*\.json$/.test(name) || /security-summary.*\.json$/.test(name) || name === 'summary.json') out.push(p);
    }
  }
  try { walk(dir); } catch (e) { /* ignore */ }
  return out;
}

const basedir = process.argv[2] || '.';
const files = findSummaries(basedir);
if (files.length === 0) {
  console.log('No summary files found under', basedir);
  process.exit(0);
}

let totals = { critical: 0, high: 0, total: 0 };
for (const f of files) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const c = j.counts || {};
    totals.critical += Number(c.critical || 0);
    totals.high += Number(c.high || 0);
    totals.total += Number(c.total || 0);
  } catch (e) {
    console.warn('Skipping file', f, 'parse error:', e.message);
  }
}

console.log('Aggregate security counts:', totals);
if (totals.critical > 0 || totals.high > 0) {
  console.error('Blocking: high/critical vulnerabilities found');
  process.exit(1);
}
process.exit(0);
