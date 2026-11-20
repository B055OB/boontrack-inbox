const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const scanDirs = ['app', 'components', 'lib', 'services', 'hooks', 'utils'];

// 1. Collect all target source files
const allFiles = [];
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        collectFiles(full);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      allFiles.push(full);
    }
  }
}
for (const d of scanDirs) {
  collectFiles(path.join(rootDir, d));
}

// 2. Resolve module imports
function resolveModulePath(importingFile, importSpecifier) {
  let target = null;
  if (importSpecifier.startsWith('@/')) {
    target = path.join(rootDir, importSpecifier.slice(2));
  } else if (importSpecifier.startsWith('.')) {
    target = path.resolve(path.dirname(importingFile), importSpecifier);
  } else {
    return null; // External package
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return target;
  }
  for (const ext of extensions) {
    if (fs.existsSync(target + ext)) {
      return target + ext;
    }
  }
  // Check index files
  for (const ext of extensions) {
    const idx = path.join(target, 'index' + ext);
    if (fs.existsSync(idx)) {
      return idx;
    }
  }
  return null;
}

// 3. Parse AST for each file and build dependency graph
const fileAstMap = new Map();
const importGraph = new Map(); // file -> Set of imported files
const directClientFiles = new Set();

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  fileAstMap.set(filePath, { sourceFile, content });

  const imports = new Set();
  let hasUseClient = false;

  // Check top-level statements for 'use client'
  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === 'use client') {
        hasUseClient = true;
      }
    }
  }
  // Fallback head comment/text check
  if (!hasUseClient) {
    const head = content.slice(0, 500);
    if (head.includes("'use client'") || head.includes('"use client"')) {
      hasUseClient = true;
    }
  }

  if (hasUseClient) {
    directClientFiles.add(filePath);
  }

  // Find all runtime import declarations and require calls (ignore type-only imports)
  function visitImports(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause) {
        if (node.importClause.isTypeOnly) return;
        if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const nonTypeElements = node.importClause.namedBindings.elements.filter(e => !e.isTypeOnly);
          if (nonTypeElements.length === 0 && !node.importClause.name) return;
        }
      }
      const resolved = resolveModulePath(filePath, node.moduleSpecifier.text);
      if (resolved) imports.add(resolved);
    } else if (
      ts.isCallExpression(node) &&
      node.expression &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const resolved = resolveModulePath(filePath, node.arguments[0].text);
      if (resolved) imports.add(resolved);
    }
    ts.forEachChild(node, visitImports);
  }
  visitImports(sourceFile);
  importGraph.set(filePath, imports);
}

// 4. Compute transitive browser-reachable graph
const browserReachableFiles = new Set(directClientFiles);
const queue = [...directClientFiles];
while (queue.length > 0) {
  const curr = queue.shift();
  const imported = importGraph.get(curr) || [];
  for (const imp of imported) {
    if (!browserReachableFiles.has(imp)) {
      browserReachableFiles.add(imp);
      queue.push(imp);
    }
  }
}

// 5. AST Visitor for .from('tenants') mutations
const findings = [];
const directClientMutations = [];
const transitiveBrowserMutations = [];

let occCasCallCount = 0;
const occCasFiles = new Set();

function isFromTenantsCall(node) {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'from') return false;
  if (node.arguments.length === 0) return false;
  const arg0 = node.arguments[0];
  if (!ts.isStringLiteral(arg0)) return false;
  return arg0.text === 'tenants';
}

function getChainedMutationOp(node) {
  // Check if current node is a CallExpression whose method is update/upsert/insert/delete
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const methodName = node.expression.name.text;
  if (['update', 'upsert', 'insert', 'delete'].includes(methodName)) {
    // Check if receiver chain has .from('tenants')
    let curr = node.expression.expression;
    while (curr) {
      if (isFromTenantsCall(curr)) {
        return methodName.toUpperCase();
      }
      if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
        curr = curr.expression.expression;
      } else {
        break;
      }
    }
  }
  return null;
}

for (const [filePath, { sourceFile }] of fileAstMap.entries()) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const isDirectClient = directClientFiles.has(filePath);
  const isBrowserReachable = browserReachableFiles.has(filePath);

  function visit(node) {
    // Count updateTenantWithOccCas calls
    if (ts.isCallExpression(node)) {
      let callName = null;
      if (ts.isIdentifier(node.expression)) {
        callName = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        callName = node.expression.name.text;
      }
      if (callName === 'updateTenantWithOccCas') {
        occCasCallCount++;
        occCasFiles.add(relPath);
      }
    }

    const op = getChainedMutationOp(node);
    if (op) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const finding = {
        file: relPath,
        line: pos.line + 1,
        column: pos.character + 1,
        op,
        isDirectClient,
        isBrowserReachable,
      };
      findings.push(finding);

      if (isDirectClient) {
        directClientMutations.push(finding);
      } else if (isBrowserReachable) {
        transitiveBrowserMutations.push(finding);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

// 6. Report findings
console.log('================================================================');
console.log('TYPESCRIPT COMPILER API AST AUDIT: TENANT WRITERS & BROWSER SAFETY');
console.log('================================================================');
console.log(`Total Source Files Scanned: ${allFiles.length}`);
console.log(`Direct 'use client' Files:   ${directClientFiles.size}`);
console.log(`Browser-Reachable Modules:  ${browserReachableFiles.size}`);

console.log('\n--- BROWSER MUTATION SAFETY ---');
console.log(`Direct Client Mutations:             ${directClientMutations.length}`);
console.log(`Transitive Browser Mutations:        ${transitiveBrowserMutations.length}`);

if (directClientMutations.length > 0 || transitiveBrowserMutations.length > 0) {
  console.error('\n[FATAL AUDIT FAILURE] Found browser-reachable .from("tenants") mutations:');
  for (const m of directClientMutations) {
    console.error(`  DIRECT CLIENT: ${m.file}:${m.line}:${m.column} [${m.op}]`);
  }
  for (const m of transitiveBrowserMutations) {
    console.error(`  TRANSITIVE BROWSER: ${m.file}:${m.line}:${m.column} [${m.op}]`);
  }
} else {
  console.log('SUCCESS: ZERO (0) browser-reachable .from("tenants") mutations verified via AST!');
}

console.log('\n--- SERVER-SIDE .from("tenants") WRITERS (AST VERIFIED) ---');
console.log(`Total Mutations: ${findings.length}`);
const opCounts = findings.reduce((acc, f) => {
  acc[f.op] = (acc[f.op] || 0) + 1;
  return acc;
}, {});
console.log(`Breakdown: ${JSON.stringify(opCounts)}`);
findings.forEach(f => {
  console.log(`  [${f.op}] ${f.file}:${f.line}`);
});

console.log('\n--- ATOMIC OCC CAS WRITER ADOPTION ---');
console.log(`Total updateTenantWithOccCas calls: ${occCasCallCount} across ${occCasFiles.size} files`);
console.log('Files:');
Array.from(occCasFiles).sort().forEach(f => console.log(`  - ${f}`));

if (directClientMutations.length > 0 || transitiveBrowserMutations.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
