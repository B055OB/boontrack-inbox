const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dirs = ['app', 'components', 'lib', 'services', 'hooks', 'utils'];

const findings = [];
const browserMutations = [];

function isClientFile(content) {
  const head = content.slice(0, 1000);
  return head.includes("'use client'") || head.includes('"use client"');
}

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        scan(full);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      const rel = path.relative(rootDir, full);
      const isClient = isClientFile(content);

      if (content.includes(".from('tenants')") || content.includes('.from("tenants")')) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(".from('tenants')") || line.includes('.from("tenants")')) {
            const windowStr = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
            const op = windowStr.includes('.update(') ? 'UPDATE' :
                       windowStr.includes('.upsert(') ? 'UPSERT' :
                       windowStr.includes('.insert(') ? 'INSERT' :
                       windowStr.includes('.delete(') ? 'DELETE' : null;

            if (op) {
              const finding = {
                file: rel.replace(/\\/g, '/'),
                line: i + 1,
                op,
                isClient,
                windowSnippet: windowStr.slice(0, 300).replace(/\s+/g, ' ')
              };
              findings.push(finding);
              if (isClient) {
                browserMutations.push(finding);
              }
            }
          }
        }
      }
    }
  }
}

for (const d of dirs) {
  scan(path.join(rootDir, d));
}

console.log('=== AUDIT RESULTS ===');
console.log('Browser mutations found:', browserMutations.length);
if (browserMutations.length > 0) {
  browserMutations.forEach(b => console.error('  [CLIENT MUTATION VIOLATION]', b.file + ':' + b.line));
}

console.log('\nTotal server-side .from("tenants") mutations:', findings.length);
findings.forEach(f => {
  console.log(`[${f.op}] ${f.file}:${f.line}`);
});

// Also count usage of updateTenantWithOccCas
let occCasCallCount = 0;
const occCasFiles = new Set();
function scanOccCas(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') scanOccCas(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      const rel = path.relative(rootDir, full);
      const matches = content.match(/updateTenantWithOccCas\s*\(/g);
      if (matches) {
        occCasCallCount += matches.length;
        occCasFiles.add(rel.replace(/\\/g, '/'));
      }
    }
  }
}
for (const d of dirs) scanOccCas(path.join(rootDir, d));
console.log(`\nTotal updateTenantWithOccCas calls: ${occCasCallCount} across ${occCasFiles.size} files`);
