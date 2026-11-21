const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const scanDirs = ['app', 'components', 'lib', 'services', 'hooks', 'utils'];

// Authorized callers strictly permitted to import or invoke canonical product projection
const AUTHORIZED_PROJECTION_ALLOWLIST = new Set([
  'lib/products/canonical-product-writer.ts',
  'lib/services/onlineboost-seed.service.ts',
  'lib/products/internal-tenant-product-projector.ts',
]);

// 1. Exact allowlist for .update() / .upsert()
const AUTHORIZED_TENANT_UPDATE_UPSERT_WRITERS = new Set([
  'lib/tenants/atomic-tenant-metadata-writer.ts',
  'lib/products/canonical-product-writer.ts',
  'lib/products/internal-tenant-product-projector.ts',
  'app/api/v1/admin/tenants/[slug]/config/route.ts',
  'app/api/v1/domains/route.ts',
  'lib/services/studio-credit.service.ts',
  'app/api/auth/register-init/route.ts',
]);

// 2. Exact allowlist for .insert()
const AUTHORIZED_TENANT_INSERT_INITIALIZERS = new Set([
  'app/api/auth/register-init/route.ts',
  'app/api/creator/profile/route.ts',
  'app/api/v1/boonpilot/publish-proposal/route.ts',
  'app/api/v1/tenants/onboard/route.ts',
  'lib/studio/auth.ts',
]);

// 3. Exact allowlist for .delete() (ZERO permitted anywhere in repo)
const AUTHORIZED_TENANT_DELETE_WRITERS = new Set([]);

// Helper: check if a node is .from('tenants')
function isFromTenantsCall(node) {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'from') return false;
  if (node.arguments.length === 0) return false;
  const arg0 = node.arguments[0];
  return ts.isStringLiteral(arg0) && arg0.text === 'tenants';
}

function isFromTenantsChain(expr, knownVars = new Set()) {
  let curr = expr;
  while (curr) {
    if (isFromTenantsCall(curr)) return true;
    if (ts.isIdentifier(curr) && knownVars.has(curr.text)) return true;
    if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
      curr = curr.expression.expression;
    } else if (ts.isAsExpression(curr) || ts.isNonNullExpression?.(curr) || ts.isParenthesizedExpression(curr)) {
      curr = curr.expression;
    } else {
      break;
    }
  }
  return false;
}

// AST Payload Inspection: inspects arguments to .insert, .update, .upsert for metadata.products
function inspectPayloadForMetadataProducts(callNode, sf) {
  if (!callNode.arguments || callNode.arguments.length === 0) return false;
  const arg = callNode.arguments[0];

  function objHasMetadataProducts(objLit) {
    if (!ts.isObjectLiteralExpression(objLit)) return false;
    for (const prop of objLit.properties) {
      let propName = null;
      if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
        propName = prop.name.text;
      }
      if (propName === 'metadata' && ts.isPropertyAssignment(prop) && prop.initializer) {
        let metaVal = prop.initializer;
        while (ts.isAsExpression(metaVal) || ts.isParenthesizedExpression(metaVal) || ts.isNonNullExpression?.(metaVal)) {
          metaVal = metaVal.expression;
        }
        if (ts.isObjectLiteralExpression(metaVal)) {
          for (const mProp of metaVal.properties) {
            let mPropName = null;
            if (mProp.name && (ts.isIdentifier(mProp.name) || ts.isStringLiteral(mProp.name))) {
              mPropName = mProp.name.text;
            }
            if (mPropName === 'products') {
              return true;
            }
          }
        } else if (ts.isIdentifier(metaVal)) {
          if (findVarWithProductsProperty(metaVal.text, sf)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function findVarWithProductsProperty(varName, rootNode) {
    let hasProd = false;
    function scan(n) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === varName && n.initializer) {
        let init = n.initializer;
        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || ts.isNonNullExpression?.(init)) {
          init = init.expression;
        }
        if (ts.isObjectLiteralExpression(init)) {
          for (const p of init.properties) {
            let pName = null;
            if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
              pName = p.name.text;
            }
            if (pName === 'products') hasProd = true;
          }
        }
      }
      ts.forEachChild(n, scan);
    }
    scan(rootNode);
    return hasProd;
  }

  if (ts.isObjectLiteralExpression(arg)) {
    return objHasMetadataProducts(arg);
  } else if (ts.isIdentifier(arg)) {
    let hasProd = false;
    function scanVar(n) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === arg.text && n.initializer) {
        let init = n.initializer;
        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || ts.isNonNullExpression?.(init)) {
          init = init.expression;
        }
        if (ts.isObjectLiteralExpression(init)) {
          if (objHasMetadataProducts(init)) hasProd = true;
        }
      }
      ts.forEachChild(n, scanVar);
    }
    scanVar(sf);
    return hasProd;
  }
  return false;
}

// ── SELF TEST MODE ────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  console.log('Running AST Scanner self-test across all negative vectors...');

  // Test 1: Multi-hop builder variable alias detection + chained mutation
  const multiHopSnippet = `
    const first = supabase.from('tenants');
    const second = first;
    const third = second.select('*');
    await third.update({ name: 'test' });
  `;
  const multiHopSf = ts.createSourceFile('test-multihop.tsx', multiHopSnippet, ts.ScriptTarget.Latest, true);
  const multiHopVars = new Set();

  let changed = true;
  while (changed) {
    const prevSize = multiHopVars.size;
    function scanAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isFromTenantsChain(node.initializer, multiHopVars)) {
          multiHopVars.add(node.name.text);
        }
      }
      ts.forEachChild(node, scanAliases);
    }
    scanAliases(multiHopSf);
    changed = multiHopVars.size > prevSize;
  }

  let multiHopDetected = false;
  function visitMultiHop(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const m = node.expression.name.text;
      if (m === 'update') {
        let receiver = node.expression.expression;
        while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
          receiver = receiver.expression.expression;
        }
        if (ts.isIdentifier(receiver) && multiHopVars.has(receiver.text)) {
          multiHopDetected = true;
        }
      }
    }
    ts.forEachChild(node, visitMultiHop);
  }
  visitMultiHop(multiHopSf);

  if (!multiHopDetected || !multiHopVars.has('third')) {
    console.error('[SELF-TEST FAILED] Vector 1: Multi-hop builder variable alias detection failed:', Array.from(multiHopVars));
    process.exit(1);
  }

  // Test 2: Aliased import of internal-tenant-product-projector in an unauthorized route
  const aliasImportSnippet = `
    import { projectCanonicalProductsToTenantMetadata as sneakyAlias } from '@/lib/products/internal-tenant-product-projector';
    async function test() {
      await sneakyAlias(supabase, 't1', () => ({}));
    }
  `;
  const aliasSf = ts.createSourceFile('test-alias.ts', aliasImportSnippet, ts.ScriptTarget.Latest, true);
  let detectedImportAlias = null;
  let detectedAliasCall = false;

  function visitAlias(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text.includes('internal-tenant-product-projector')) {
        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            if ((el.propertyName?.text || el.name.text) === 'projectCanonicalProductsToTenantMetadata') {
              detectedImportAlias = el.name.text;
            }
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (detectedImportAlias && node.expression.text === detectedImportAlias) {
        detectedAliasCall = true;
      }
    }
    ts.forEachChild(node, visitAlias);
  }
  visitAlias(aliasSf);

  const unauthorizedCallerFile = 'app/api/v1/store/sneaky/route.ts';
  const isAllowlisted = AUTHORIZED_PROJECTION_ALLOWLIST.has(unauthorizedCallerFile);
  if (detectedImportAlias !== 'sneakyAlias' || !detectedAliasCall || isAllowlisted) {
    console.error('[SELF-TEST FAILED] Vector 2: Aliased projection import and call detection failed:', { detectedImportAlias, detectedAliasCall, isAllowlisted });
    process.exit(1);
  }

  // Test 3: Unauthorized .from('tenants').insert({ metadata: { products: [] } }) payload inspection
  const unauthInsertSnippet = `
    await supabase.from('tenants').insert({
      slug: 'test',
      metadata: {
        theme: 'dark',
        products: [],
      }
    });
  `;
  const unauthInsertSf = ts.createSourceFile('test-insert.ts', unauthInsertSnippet, ts.ScriptTarget.Latest, true);
  let payloadProductsDetected = false;
  function visitInsert(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'insert') {
        if (inspectPayloadForMetadataProducts(node, unauthInsertSf)) {
          payloadProductsDetected = true;
        }
      }
    }
    ts.forEachChild(node, visitInsert);
  }
  visitInsert(unauthInsertSf);

  if (!payloadProductsDetected) {
    console.error('[SELF-TEST FAILED] Vector 3: Unauthorized metadata.products payload inspection failed');
    process.exit(1);
  }

  // Test 4: Unauthorized .from('tenants').delete()
  const deleteSnippet = `
    await supabase.from('tenants').delete().eq('id', '1');
  `;
  const deleteSf = ts.createSourceFile('test-delete.ts', deleteSnippet, ts.ScriptTarget.Latest, true);
  let deleteOpDetected = false;
  function visitDelete(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'delete') {
        let curr = node.expression.expression;
        if (isFromTenantsCall(curr)) {
          deleteOpDetected = true;
        }
      }
    }
    ts.forEachChild(node, visitDelete);
  }
  visitDelete(deleteSf);

  const isDeleteAllowed = AUTHORIZED_TENANT_DELETE_WRITERS.size > 0;
  if (!deleteOpDetected || isDeleteAllowed) {
    console.error('[SELF-TEST FAILED] Vector 4: Unauthorized .from("tenants").delete() detection failed');
    process.exit(1);
  }

  // Test 5: Re-export chain reaching a browser 'use client' file
  const reExportSnippet = `
    export * from './re-exported-target';
  `;
  const reExportSf = ts.createSourceFile('test-reexport.ts', reExportSnippet, ts.ScriptTarget.Latest, true);
  let hasReExport = false;
  function visitReExport(node) {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === './re-exported-target') {
        hasReExport = true;
      }
    }
    ts.forEachChild(node, visitReExport);
  }
  visitReExport(reExportSf);

  if (!hasReExport) {
    console.error('[SELF-TEST FAILED] Vector 5: Re-export detection failed');
    process.exit(1);
  }

  console.log('[SELF-TEST PASSED] AST scanner correctly verifies all 5 negative vectors (multi-hop alias, aliased projection import, metadata.products payload inspection, delete prohibition, and re-export chains).');
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
  for (const ext of extensions) {
    const idx = path.join(target, 'index' + ext);
    if (fs.existsSync(idx)) {
      return idx;
    }
  }
  return null;
}

// ── 3. PARSE AST & BUILD GRAPH & TRACK PROJECTION IMPORTS ─────────────────────
const fileAstMap = new Map();
const importGraph = new Map(); // file -> Set of imported files
const directClientFiles = new Set();
const unauthorizedProjectionCallers = [];

for (const filePath of allFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  fileAstMap.set(filePath, { sourceFile, content, relPath });

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
      const spec = node.moduleSpecifier.text;
      const isProjectorImport = spec.includes('internal-tenant-product-projector');
      if (isProjectorImport) {
        if (!AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
          unauthorizedProjectionCallers.push({
            file: relPath,
            specifier: spec,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            type: 'IMPORT',
          });
        }
      }

      if (node.importClause) {
        if (node.importClause.isTypeOnly) return;
        if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          const nonTypeElements = node.importClause.namedBindings.elements.filter(e => !e.isTypeOnly);
          if (nonTypeElements.length === 0 && !node.importClause.name) return;
        }
      }
      const resolved = resolveModulePath(filePath, spec);
      if (resolved) imports.add(resolved);
    }
    // 2. Re-export Declaration (export ... from '...')
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const isProjectorImport = spec.includes('internal-tenant-product-projector');
      if (isProjectorImport) {
        if (!AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
          unauthorizedProjectionCallers.push({
            file: relPath,
            specifier: spec,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            type: 'RE_EXPORT',
          });
        }
      }

      if (node.isTypeOnly) return;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const nonTypeElements = node.exportClause.elements.filter(e => !e.isTypeOnly);
        if (nonTypeElements.length === 0) return;
      }
      const resolved = resolveModulePath(filePath, spec);
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
      const spec = node.arguments[0].text;
      if (spec.includes('internal-tenant-product-projector') && !AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
        unauthorizedProjectionCallers.push({
          file: relPath,
          specifier: spec,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          type: 'REQUIRE',
        });
      }
      const resolved = resolveModulePath(filePath, spec);
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
      const spec = node.arguments[0].text;
      if (spec.includes('internal-tenant-product-projector') && !AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
        unauthorizedProjectionCallers.push({
          file: relPath,
          specifier: spec,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          type: 'DYNAMIC_IMPORT',
        });
      }
      const resolved = resolveModulePath(filePath, spec);
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

// ── 5. AST VISITOR FOR TENANT MUTATIONS & MULTI-HOP VARIABLE ALIASES ──────────
const findings = [];
const directClientMutations = [];
const transitiveBrowserMutations = [];
const browserOccHelperLeaks = [];
const unauthorizedServerWriters = [];
const unauthorizedMetadataProductsWrites = [];

let occCasCallCount = 0;
const occCasFiles = new Set();

for (const [filePath, { sourceFile, relPath }] of fileAstMap.entries()) {
  const isDirectClient = directClientFiles.has(filePath);
  const isBrowserReachable = browserReachableFiles.has(filePath);

  // Multi-hop builder variable alias propagation (fixed-point loop)
  const tenantBuilderVars = new Set();
  let changed = true;
  while (changed) {
    const prevSize = tenantBuilderVars.size;
    function scanAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isFromTenantsChain(node.initializer, tenantBuilderVars)) {
          tenantBuilderVars.add(node.name.text);
        }
      }
      ts.forEachChild(node, scanAliases);
    }
    scanAliases(sourceFile);
    changed = tenantBuilderVars.size > prevSize;
  }

  // Track projection aliases in this file
  const projectionAliases = new Set();
  function scanProjectionAliases(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const el of node.importClause.namedBindings.elements) {
        const originalName = el.propertyName?.text || el.name.text;
        if (originalName === 'projectCanonicalProductsToTenantMetadata') {
          projectionAliases.add(el.name.text);
        }
      }
    }
    ts.forEachChild(node, scanProjectionAliases);
  }
  scanProjectionAliases(sourceFile);

  function getChainedMutationOp(node) {
    if (!ts.isCallExpression(node)) return null;
    if (!ts.isPropertyAccessExpression(node.expression)) return null;
    const methodName = node.expression.name.text;
    if (['update', 'upsert', 'insert', 'delete'].includes(methodName)) {
      let curr = node.expression.expression;

      while (curr) {
        if (isFromTenantsCall(curr)) {
          return methodName.toUpperCase();
        }
        if (ts.isIdentifier(curr) && tenantBuilderVars.has(curr.text)) {
          return methodName.toUpperCase();
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
          curr = curr.expression.expression;
        } else if (ts.isAsExpression(curr) || ts.isNonNullExpression?.(curr) || ts.isParenthesizedExpression(curr)) {
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

      const isOccCall = callName === 'updateTenantWithOccCas';
      const isProjectorCall =
        callName === 'projectCanonicalProductsToTenantMetadata' ||
        projectionAliases.has(callName) ||
        callName === '_internalProjectProductsForProjector';

      if (isOccCall || isProjectorCall) {
        occCasCallCount++;
        occCasFiles.add(relPath);

        // Security Invariant: Projection capability restricted strictly to allowlist
        if (isProjectorCall && !AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          unauthorizedProjectionCallers.push({
            file: relPath,
            line: pos.line + 1,
            column: pos.character + 1,
            helper: callName,
            type: 'CALL',
          });
        }

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
      } else {
        // Full Server Operation Allowlist Enforcement
        if ((op === 'UPDATE' || op === 'UPSERT') && !AUTHORIZED_TENANT_UPDATE_UPSERT_WRITERS.has(relPath)) {
          unauthorizedServerWriters.push({ ...finding, reason: 'UNAUTHORIZED_UPDATE_UPSERT' });
        } else if (op === 'INSERT' && !AUTHORIZED_TENANT_INSERT_INITIALIZERS.has(relPath)) {
          unauthorizedServerWriters.push({ ...finding, reason: 'UNAUTHORIZED_INSERT' });
        } else if (op === 'DELETE' && !AUTHORIZED_TENANT_DELETE_WRITERS.has(relPath)) {
          unauthorizedServerWriters.push({ ...finding, reason: 'UNAUTHORIZED_DELETE' });
        }

        // AST Payload Inspection: Check for metadata.products outside authorized projector modules
        if (!AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath)) {
          if (inspectPayloadForMetadataProducts(node, sourceFile)) {
            unauthorizedMetadataProductsWrites.push({
              file: relPath,
              line: pos.line + 1,
              column: pos.character + 1,
              op,
              reason: 'UNAUTHORIZED_METADATA_PRODUCTS_WRITE',
            });
          }
        }
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

console.log('\n--- PROJECTION CAPABILITY ALLOWLIST ---');
console.log(`Unauthorized Projection Callers:     ${unauthorizedProjectionCallers.length}`);

console.log('\n--- SERVER WRITER & OPERATION COMPLIANCE ---');
console.log(`Unauthorized Server Writers:         ${unauthorizedServerWriters.length}`);
console.log(`Unauthorized Metadata.Products:      ${unauthorizedMetadataProductsWrites.length}`);

const hasFatalViolations =
  directClientMutations.length > 0 ||
  transitiveBrowserMutations.length > 0 ||
  browserOccHelperLeaks.length > 0 ||
  unauthorizedProjectionCallers.length > 0 ||
  unauthorizedServerWriters.length > 0 ||
  unauthorizedMetadataProductsWrites.length > 0;

if (hasFatalViolations) {
  console.error('\n[FATAL AUDIT FAILURE] Security & Single-Writer Invariant Violations:');
  for (const m of directClientMutations) {
    console.error(`  DIRECT CLIENT: ${m.file}:${m.line}:${m.column} [${m.op}]`);
  }
  for (const m of transitiveBrowserMutations) {
    console.error(`  TRANSITIVE BROWSER: ${m.file}:${m.line}:${m.column} [${m.op}]\n    Trace: ${m.trace}`);
  }
  for (const m of browserOccHelperLeaks) {
    console.error(`  BROWSER OCC HELPER LEAK: ${m.file}:${m.line}:${m.column} [${m.helper}]\n    Trace: ${m.trace}`);
  }
  for (const p of unauthorizedProjectionCallers) {
    console.error(`  UNAUTHORIZED PROJECTION CALLER: ${p.file}:${p.line} [${p.type}]`);
  }
  for (const w of unauthorizedServerWriters) {
    console.error(`  UNAUTHORIZED SERVER WRITER: ${w.file}:${w.line}:${w.column} [${w.op}] (${w.reason})`);
  }
  for (const prod of unauthorizedMetadataProductsWrites) {
    console.error(`  UNAUTHORIZED METADATA.PRODUCTS WRITE: ${prod.file}:${prod.line}:${prod.column} [${prod.op}]`);
  }
} else {
  console.log('SUCCESS: ZERO (0) browser mutations, ZERO unauthorized projection callers, ZERO unguarded server writers, and ZERO unauthorized metadata.products writes verified via AST!');
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

if (hasFatalViolations) {
  process.exit(1);
} else {
  process.exit(0);
}
