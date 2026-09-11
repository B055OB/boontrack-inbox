const fs = require('fs');
const path = require('path');

function walk(dir) {
  let res = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (['node_modules', '.git', '.next', '.venv', '__pycache__'].includes(f)) continue;
      const p = path.join(dir, f);
      try {
        if (fs.statSync(p).isDirectory()) res.push(...walk(p));
        else res.push(p);
      } catch {}
    }
  } catch {}
  return res;
}

const files = [...walk('C:/boontrack-inbox'), ...walk('C:/boontrack-core')];
const matches = new Set();
for (const f of files) {
  try {
    const txt = fs.readFileSync(f, 'utf8');
    const m = txt.match(/https?:\/\/[^\s"\'<>]*r2[^\s"\'<>]*/gi);
    if (m) {
      m.forEach(url => matches.add(`${f} -> ${url}`));
    }
    const m2 = txt.match(/https?:\/\/assets\.[^\s"\'<>]*/gi);
    if (m2) {
      m2.forEach(url => matches.add(`${f} -> ${url}`));
    }
  } catch {}
}

console.log('Total matches:', matches.size);
for (const item of matches) {
  console.log(item);
}
