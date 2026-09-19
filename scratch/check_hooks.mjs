import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        results = results.concat(walk(fullPath));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('./app');

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('useMemo') && !content.includes('useState') && !content.includes('useEffect') && !content.includes('useCallback')) {
    continue;
  }

  const lines = content.split('\n');
  let inComponent = false;
  let componentName = '';
  let earlyReturnLines = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Function declaration or arrow function component
    const funcMatch = line.match(/(?:export\s+default\s+function|export\s+function|function|const)\s+([A-Z]\w+)\s*(?:=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>|[(])/);
    if (funcMatch) {
      inComponent = true;
      componentName = funcMatch[1];
      earlyReturnLines = [];
      braceDepth = 0;
    }

    if (inComponent) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      braceDepth += opens - closes;

      if (braceDepth <= 0 && (opens > 0 || closes > 0)) {
        inComponent = false;
        continue;
      }

      // Detect top-level conditional returns in component:
      // braceDepth is 1 (direct component body) or 2 (inside top-level if statement)
      if (braceDepth <= 2) {
        if (/^\s*if\s*\(.*?\)\s*(?:\{\s*)?return\b/.test(line) || /^\s*return\s*\(/.test(line) || /^\s*return\s+null;/.test(line)) {
          // Avoid matching inside callbacks:
          if (!line.includes('=>') && !line.includes('function')) {
            earlyReturnLines.push(i + 1);
          }
        }
      }

      // Check if any hook is called after an early return
      if (earlyReturnLines.length > 0) {
        const hookMatch = line.match(/\b(useMemo|useState|useEffect|useCallback|useRef)\s*\(/);
        if (hookMatch) {
          // Verify this hook is in component body (braceDepth <= 2)
          if (braceDepth <= 2) {
            console.log(`POTENTIAL HOOK ORDER VIOLATION:`);
            console.log(`  File: ${file}`);
            console.log(`  Component: ${componentName}`);
            console.log(`  Early return line(s): ${earlyReturnLines.join(', ')}`);
            console.log(`  Hook "${hookMatch[1]}" at line: ${i + 1}`);
            console.log(`  Content: ${line.trim()}\n`);
          }
        }
      }
    }
  }
}
