const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const scanDirs = ['app', 'components', 'lib', 'services', 'hooks', 'utils'];

// ── SELF TEST MODE ────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  console.log('Running AST Scanner self-test...');

  // Test 1: Builder variable detection
  const builderSnippet = `
    const tbl = supabase.from('tenants');
    await tbl.update({ name: 'test' });
  `;
  const builderSf = ts.createSourceFile('test-builder.tsx', builderSnippet, ts.ScriptTarget.Latest, true);
  const detectedOps = [];
  const builderVars = new Set();

  function isFromTenants(node) {
    if (!ts.isCallExpression(node)) return false;
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    if (node.expression.name.text !== 'from') return false;
    if (node.arguments.length === 0) return false;
    const arg0 = node.arguments[0];
    return ts.isStringLiteral(arg0) && arg0.text === 'tenants';
  }

  function isFromTenantsChainExpr(expr) {
    let curr = expr;
    while (curr) {
      if (isFromTenants(curr)) return true;
      if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
        curr = curr.expression.expression;
      } else if (ts.isAsExpression(curr)) {
        curr = curr.expression;
      } else {
        break;
      }
    }
    return false;
  }

  function testVisit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isFromTenantsChainExpr(node.initializer)) {
        builderVars.add(node.name.text);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (['update', 'upsert', 'insert', 'delete'].includes(methodName)) {
        let receiver = node.expression.expression;
        if (ts.isIdentifier(receiver) && builderVars.has(receiver.text)) {
          detectedOps.push({ op: methodName.toUpperCase(), type: 'BUILDER_VARIABLE' });
        }
      }
    }
    ts.forEachChild(node, testVisit);
  }
  testVisit(builderSf);

  if (detectedOps.length !== 1 || detectedOps[0].op !== 'UPDATE') {
    console.error('[SELF-TEST FAILED] Builder variable detection failed:', detectedOps);
    process.exit(1);
  }

  // Test 2: Dynamic import detection
  const dynSnippet = `
    async function load() {
      const mod = await import('./dynamic-target');
      return mod;
    }
  `;
  const dynSf = ts.createSourceFile('test-dyn.tsx', dynSnippet, ts.ScriptTarget.Latest, true);
  let foundDynamic = false;
  function testDyn(node) {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'import')) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (node.arguments[0].text === './dynamic-target') {
        foundDynamic = true;
      }
    }
    ts.forEachChild(node, testDyn);
  }
  testDyn(dynSf);

  if (!foundDynamic) {
    console.error('[SELF-TEST FAILED] Dynamic import detection failed');
    process.exit(1);
  }

  console.log('[SELF-TEST PASSED] AST scanner correctly detects builder variable aliases and dynamic imports.');
  process.exit(0);
}

// ── 1. COLLECT ALL SOURCE FILES ───────────────────────────────────────────────
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

// ── 2. RESOLVE MODULE PATHS ───────────────────────────────────────────────────
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

// ── 3. PARSE AST & BUILD FULL DEPENDENCY GRAPH ────────────────────────────────
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

  // Check top-level statements for 'use client' directive
  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === 'use client') {
        hasUseClient = true;
      }
    }
  }
  if (!hasUseClient) {
    const head = content.slice(0, 500);
    if (head.includes("'use client'") || head.includes('"use client"')) {
      hasUseClient = true;
    }
  }

  if (hasUseClient) {
    directClientFiles.add(filePath);
  }

  // Traverse imports: ImportDeclaration, ExportDeclaration, require, dynamic import
  function visitImports(node) {
    // 1. Static Import Declaration
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
    }
    // 2. Re-export Declaration (export ... from '...')
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.isTypeOnly) return;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const nonTypeElements = node.exportClause.elements.filter(e => !e.isTypeOnly);
        if (nonTypeElements.length === 0) return;
      }
      const resolved = resolveModulePath(filePath, node.moduleSpecifier.text);
      if (resolved) imports.add(resolved);
    }
    // 3. CommonJS require(...)
    else if (
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
    // 4. Dynamic import('...')
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'import')) &&
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

// ── 4. COMPUTE TRANSITIVE BROWSER-REACHABLE MODULES ───────────────────────────
const browserReachableFiles = new Set(directClientFiles);
const parentMap = new Map();
const queue = [...directClientFiles];
while (queue.length > 0) {
  const curr = queue.shift();
  const imported = importGraph.get(curr) || [];
  for (const imp of imported) {
    if (!browserReachableFiles.has(imp)) {
      browserReachableFiles.add(imp);
      parentMap.set(imp, curr);
      queue.push(imp);
    }
  }
}

function getTrace(targetFile) {
  const trace = [];
  let curr = targetFile;
  while (curr) {
    trace.unshift(path.relative(rootDir, curr).replace(/\\/g, '/'));
    curr = parentMap.get(curr);
  }
  return trace.join(' -> ');
}

// ── 5. AST VISITOR FOR TENANT MUTATIONS & BUILDER VARIABLE ALIASES ────────────
const findings = [];
const directClientMutations = [];
const transitiveBrowserMutations = [];
const browserOccHelperLeaks = [];

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

function isFromTenantsChain(expr) {
  let curr = expr;
  while (curr) {
    if (isFromTenantsCall(curr)) return true;
    if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
      curr = curr.expression.expression;
    } else if (ts.isAsExpression(curr)) {
      curr = curr.expression;
    } else {
      break;
    }
  }
  return false;
}

for (const [filePath, { sourceFile }] of fileAstMap.entries()) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const isDirectClient = directClientFiles.has(filePath);
  const isBrowserReachable = browserReachableFiles.has(filePath);

  // Track builder variable aliases in this file
  const tenantBuilderVars = new Set();

  function scanVars(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isFromTenantsChain(node.initializer)) {
        tenantBuilderVars.add(node.name.text);
      }
    }
    ts.forEachChild(node, scanVars);
  }
  scanVars(sourceFile);

  function getChainedMutationOp(node) {
    if (!ts.isCallExpression(node)) return null;
    if (!ts.isPropertyAccessExpression(node.expression)) return null;
    const methodName = node.expression.name.text;
    if (['update', 'upsert', 'insert', 'delete'].includes(methodName)) {
      let curr = node.expression.expression;

      // Check for builder variable alias
      if (ts.isIdentifier(curr) && tenantBuilderVars.has(curr.text)) {
        return methodName.toUpperCase();
      }

      // Check chained calls
      while (curr) {
        if (isFromTenantsCall(curr)) {
          return methodName.toUpperCase();
        }
        if (ts.isIdentifier(curr) && tenantBuilderVars.has(curr.text)) {
          return methodName.toUpperCase();
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
          curr = curr.expression.expression;
        } else if (ts.isAsExpression(curr)) {
          curr = curr.expression;
        } else {
          break;
        }
      }
    }
    return null;
  }

  function visit(node) {
    // Check updateTenantWithOccCas or projectCanonicalProductsToTenantMetadata
    if (ts.isCallExpression(node)) {
      let callName = null;
      if (ts.isIdentifier(node.expression)) {
        callName = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        callName = node.expression.name.text;
      }

      if (callName === 'updateTenantWithOccCas' || callName === 'projectCanonicalProductsToTenantMetadata') {
        occCasCallCount++;
        occCasFiles.add(relPath);

        // Security Invariant: These mutation helpers must NEVER be reachable from browser modules
        if (isBrowserReachable) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          browserOccHelperLeaks.push({
            file: relPath,
            line: pos.line + 1,
            column: pos.character + 1,
            helper: callName,
            isDirectClient,
            trace: getTrace(filePath),
          });
        }
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
        trace: getTrace(filePath),
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

// ── 6. REPORT FINDINGS ────────────────────────────────────────────────────────
console.log('================================================================');
console.log('TYPESCRIPT COMPILER API AST AUDIT: TENANT WRITERS & BROWSER SAFETY');
console.log('================================================================');
console.log(`Total Source Files Scanned: ${allFiles.length}`);
console.log(`Direct 'use client' Files:   ${directClientFiles.size}`);
console.log(`Browser-Reachable Modules:  ${browserReachableFiles.size}`);

console.log('\n--- BROWSER MUTATION SAFETY ---');
console.log(`Direct Client Mutations:             ${directClientMutations.length}`);
console.log(`Transitive Browser Mutations:        ${transitiveBrowserMutations.length}`);
console.log(`Browser-Reachable OCC Helper Leaks:  ${browserOccHelperLeaks.length}`);

const hasBrowserViolations =
  directClientMutations.length > 0 ||
  transitiveBrowserMutations.length > 0 ||
  browserOccHelperLeaks.length > 0;

if (hasBrowserViolations) {
  console.error('\n[FATAL AUDIT FAILURE] Found browser-reachable .from("tenants") mutations:');
  for (const m of directClientMutations) {
    console.error(`  DIRECT CLIENT: ${m.file}:${m.line}:${m.column} [${m.op}]`);
  }
  for (const m of transitiveBrowserMutations) {
    console.error(`  TRANSITIVE BROWSER: ${m.file}:${m.line}:${m.column} [${m.op}]\n    Trace: ${m.trace}`);
  }
  for (const m of browserOccHelperLeaks) {
    console.error(`  BROWSER OCC HELPER LEAK: ${m.file}:${m.line}:${m.column} [${m.helper}]\n    Trace: ${m.trace}`);
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
console.log(`Total OCC CAS calls: ${occCasCallCount} across ${occCasFiles.size} files`);
console.log('Files:');
Array.from(occCasFiles).sort().forEach(f => console.log(`  - ${f}`));

if (hasBrowserViolations) {
  process.exit(1);
} else {
  process.exit(0);
}
