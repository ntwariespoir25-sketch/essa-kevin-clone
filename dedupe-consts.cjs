const fs = require('fs');
const f = process.argv[2];
const src = fs.readFileSync(f, 'utf8');
const lines = src.split(/\r?\n/);
const seen = new Set();
let out = [];
for (const line of lines) {
  const m = line.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*async\s*\(/);
  if (m && seen.has(m[1])) { console.log('DROP dup:', m[1], 'line', out.length + 1); continue; }
  out.push(line);
  if (m) seen.add(m[1]);
}
fs.writeFileSync(f, out.join('\n'), 'utf8');
console.log('dedup done, wrote', f);
