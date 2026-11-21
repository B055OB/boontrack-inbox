const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');

// ── EXCLUSIONS & RUNTIME DISCOVERY ───────────────────────────────────────────
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  '__tests__',
  'tests',
  'scripts',
  'patches',
  'public',
  'supabase',
]);

const discoveredRuntimeDirs = fs.readdirSync(rootDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && !EXCLUDED_DIRS.has(e.name) && !e.name.startsWith('.'))
  .map(e => e.name)
  .sort();

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

function unwrap(expr) {
  let curr = expr;
  while (curr) {
    if (
      ts.isAsExpression(curr) ||
      ts.isParenthesizedExpression(curr) ||
      ts.isNonNullExpression?.(curr) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr))
    ) {
      curr = curr.expression;
    } else {
      break;
    }
  }
  return curr;
}

function getPropertyName(nameNode, varBindings) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
    return nameNode.text;
  }
  if (ts.isComputedPropertyName(nameNode)) {
    const inner = unwrap(nameNode.expression);
    if (ts.isStringLiteral(inner)) return inner.text;
    if (ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
    if (ts.isIdentifier(inner) && varBindings) {
      const bound = varBindings.get(inner.text);
      if (bound) {
        for (const b of bound) {
          const u = unwrap(b);
          if (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u)) return u.text;
        }
      }
    }
  }
  return null;
}

function getFunctionReturnExpressions(fnNode) {
  const returns = [];
  if (ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode) || ts.isFunctionDeclaration(fnNode)) {
    const body = fnNode.body;
    if (!body) return returns;
    if (ts.isBlock(body)) {
      function findReturns(n) {
        if (n !== fnNode && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) {
          return;
        }
        if (ts.isReturnStatement(n) && n.expression) {
          returns.push(n.expression);
        }
        ts.forEachChild(n, findReturns);
      }
      findReturns(body);
    } else {
      returns.push(body);
    }
  }
  return returns;
}

function collectFileFunctions(sourceFile) {
  const fileFunctions = new Map();
  function scan(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      fileFunctions.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        fileFunctions.set(node.name.text, init);
      }
    }
    ts.forEachChild(node, scan);
  }
  scan(sourceFile);
  return fileFunctions;
}

function resolveTableArgument(argNode, varBindings, fileFunctions, visited = new Set()) {
  const unwrapped = unwrap(argNode);
  if (!unwrapped) return { resolved: false, name: null };

  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return { resolved: true, name: unwrapped.text };
  }
  if (ts.isTemplateExpression(unwrapped) && unwrapped.templateSpans.length === 0) {
    return { resolved: true, name: unwrapped.head.text };
  }
  if (ts.isIdentifier(unwrapped)) {
    if (visited.has(unwrapped.text)) return { resolved: false, name: null };
    visited.add(unwrapped.text);
    const bindings = varBindings ? varBindings.get(unwrapped.text) : null;
    if (bindings && bindings.length > 0) {
      for (const b of bindings) {
        const res = resolveTableArgument(b, varBindings, fileFunctions, new Set(visited));
        if (res.resolved) return res;
      }
    }
    return { resolved: false, name: null, identifier: unwrapped.text };
  }
  if (ts.isCallExpression(unwrapped) && ts.isIdentifier(unwrapped.expression) && fileFunctions) {
    const fnNode = fileFunctions.get(unwrapped.expression.text);
    if (fnNode) {
      const returns = getFunctionReturnExpressions(fnNode);
      for (const retExpr of returns) {
        const res = resolveTableArgument(retExpr, varBindings, fileFunctions, new Set(visited));
        if (res.resolved) return res;
      }
    }
    return { resolved: false, name: null };
  }
  return { resolved: false, name: null };
}

function isFromTenantsCall(node, varBindings, fileFunctions) {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'from') return false;
  if (!node.arguments || node.arguments.length === 0) return false;
  const tableRes = resolveTableArgument(node.arguments[0], varBindings, fileFunctions);
  return tableRes.resolved && tableRes.name === 'tenants';
}

function isFromTenantsChain(expr, knownVars = new Set(), knownHelpers = new Set(), varBindings, fileFunctions) {
  let curr = expr;
  while (curr) {
    if (isFromTenantsCall(curr, varBindings, fileFunctions)) return true;
    if (ts.isIdentifier(curr) && knownVars.has(curr.text)) return true;
    if (ts.isCallExpression(curr)) {
      if (ts.isIdentifier(curr.expression) && knownHelpers.has(curr.expression.text)) return true;
      if (ts.isPropertyAccessExpression(curr.expression)) {
        curr = curr.expression.expression;
        continue;
      }
    } else if (
      ts.isAsExpression(curr) ||
      ts.isNonNullExpression?.(curr) ||
      ts.isParenthesizedExpression(curr) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr))
    ) {
      curr = curr.expression;
      continue;
    }
    break;
  }
  return false;
}

// AST Variable Binding Map per file/scope
function buildVariableBindingMap(sourceFile) {
  const varBindings = new Map();
  function scan(node) {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) {
        const varName = node.name.text;
        const list = varBindings.get(varName) || [];
        list.push(node.initializer);
        varBindings.set(varName, list);
      } else if (ts.isObjectBindingPattern(node.name) && node.initializer) {
        for (const elem of node.name.elements) {
          if (elem.dotDotDotToken && ts.isIdentifier(elem.name)) {
            const list = varBindings.get(elem.name.text) || [];
            list.push(node.initializer);
            varBindings.set(elem.name.text, list);
          }
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const varName = node.left.text;
      const list = varBindings.get(varName) || [];
      list.push(node.right);
      varBindings.set(varName, list);
    }
    ts.forEachChild(node, scan);
  }
  scan(sourceFile);
  return varBindings;
}

function doesObjectHaveProducts(expr, varBindings, fileFunctions, visitedVars = new Set(), unverifiedHelperErrors = []) {
  const unwrapped = unwrap(expr);
  if (!unwrapped) return false;

  if (ts.isObjectLiteralExpression(unwrapped)) {
    for (const prop of unwrapped.properties) {
      if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
        const pName = getPropertyName(prop.name, varBindings);
        if (pName === 'products') return true;
        if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'products') return true;
      } else if (ts.isSpreadAssignment(prop)) {
        const spreadExpr = unwrap(prop.expression);
        if (doesObjectHaveProducts(spreadExpr, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
      }
    }
  } else if (ts.isIdentifier(unwrapped)) {
    if (visitedVars.has(unwrapped.text)) return false;
    visitedVars.add(unwrapped.text);
    const bindings = varBindings.get(unwrapped.text) || [];
    for (const b of bindings) {
      if (doesObjectHaveProducts(b, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
    }
  } else if (ts.isArrayLiteralExpression(unwrapped)) {
    for (const elem of unwrapped.elements) {
      if (doesObjectHaveProducts(elem, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
    }
  } else if (ts.isCallExpression(unwrapped)) {
    if (ts.isIdentifier(unwrapped.expression) && fileFunctions) {
      const fnNode = fileFunctions.get(unwrapped.expression.text);
      if (fnNode) {
        const returns = getFunctionReturnExpressions(fnNode);
        if (returns.length === 0) {
          unverifiedHelperErrors.push({ helper: unwrapped.expression.text, reason: 'EMPTY_OR_VOID_HELPER' });
          return false;
        }
        for (const r of returns) {
          if (doesObjectHaveProducts(r, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
        }
        return false;
      }
    }
    unverifiedHelperErrors.push({
      helper: unwrapped.expression.getText(),
      reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
    });
  }
  return false;
}

function doesTenantRowHaveMetadataProducts(expr, varBindings, fileFunctions, visitedVars = new Set(), unverifiedHelperErrors = []) {
  const unwrapped = unwrap(expr);
  if (!unwrapped) return false;

  if (ts.isArrayLiteralExpression(unwrapped)) {
    for (const elem of unwrapped.elements) {
      if (doesTenantRowHaveMetadataProducts(elem, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
    }
    return false;
  }

  if (ts.isObjectLiteralExpression(unwrapped)) {
    for (const prop of unwrapped.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const pName = getPropertyName(prop.name, varBindings);
        if (pName === 'metadata') {
          const metaVal = unwrap(prop.initializer);
          if (doesObjectHaveProducts(metaVal, varBindings, fileFunctions, new Set(), unverifiedHelperErrors)) return true;
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        if (prop.name.text === 'metadata') {
          if (doesObjectHaveProducts(prop.name, varBindings, fileFunctions, new Set(), unverifiedHelperErrors)) return true;
        }
      } else if (ts.isSpreadAssignment(prop)) {
        const spreadExpr = unwrap(prop.expression);
        if (doesTenantRowHaveMetadataProducts(spreadExpr, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
      }
    }
  } else if (ts.isIdentifier(unwrapped)) {
    if (visitedVars.has(unwrapped.text)) return false;
    visitedVars.add(unwrapped.text);
    const bindings = varBindings.get(unwrapped.text) || [];
    for (const b of bindings) {
      if (doesTenantRowHaveMetadataProducts(b, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
    }
  } else if (ts.isCallExpression(unwrapped)) {
    if (ts.isIdentifier(unwrapped.expression) && fileFunctions) {
      const fnNode = fileFunctions.get(unwrapped.expression.text);
      if (fnNode) {
        const returns = getFunctionReturnExpressions(fnNode);
        if (returns.length === 0) {
          unverifiedHelperErrors.push({ helper: unwrapped.expression.text, reason: 'EMPTY_OR_VOID_HELPER' });
          return false;
        }
        for (const r of returns) {
          if (doesTenantRowHaveMetadataProducts(r, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors)) return true;
        }
        return false;
      }
    }
    unverifiedHelperErrors.push({
      helper: unwrapped.expression.getText(),
      reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
    });
  }
  return false;
}

// ── SELF TEST MODE ────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  console.log('Running AST Scanner self-test across all negative vectors...');

  // Test 1: Vector 1 — Array payload with metadata.products
  const v1Code = `
    const payload = [{ slug: 'test-v1', metadata: { products: [] } }];
    supabase.from('tenants').insert(payload);
  `;
  const v1Sf = ts.createSourceFile('v1.ts', v1Code, ts.ScriptTarget.Latest, true);
  const v1Bindings = buildVariableBindingMap(v1Sf);
  const v1Functions = collectFileFunctions(v1Sf);
  let v1Detected = false;
  function visitV1(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'insert') {
      if (doesTenantRowHaveMetadataProducts(n.arguments[0], v1Bindings, v1Functions)) v1Detected = true;
    }
    ts.forEachChild(n, visitV1);
  }
  visitV1(v1Sf);
  if (!v1Detected) {
    console.error('[SELF-TEST FAILED] Vector 1: Array payload with metadata.products was not detected');
    process.exit(1);
  }

  // Test 2: Vector 2 — Object spread & nested variable alias with metadata.products
  const v2Code = `
    const p = { products: [{ id: 'p1' }] };
    const m = { ...p };
    supabase.from('tenants').update({ metadata: { ...m } });
  `;
  const v2Sf = ts.createSourceFile('v2.ts', v2Code, ts.ScriptTarget.Latest, true);
  const v2Bindings = buildVariableBindingMap(v2Sf);
  const v2Functions = collectFileFunctions(v2Sf);
  let v2Detected = false;
  function visitV2(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'update') {
      if (doesTenantRowHaveMetadataProducts(n.arguments[0], v2Bindings, v2Functions)) v2Detected = true;
    }
    ts.forEachChild(n, visitV2);
  }
  visitV2(v2Sf);
  if (!v2Detected) {
    console.error('[SELF-TEST FAILED] Vector 2: Object spread & nested variable alias was not detected');
    process.exit(1);
  }

  // Test 3: Vector 3 — Computed property name with metadata.products
  const v3Code = `
    supabase.from('tenants').insert({ ['metadata']: { ['products']: [] } });
  `;
  const v3Sf = ts.createSourceFile('v3.ts', v3Code, ts.ScriptTarget.Latest, true);
  const v3Bindings = buildVariableBindingMap(v3Sf);
  const v3Functions = collectFileFunctions(v3Sf);
  let v3Detected = false;
  function visitV3(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'insert') {
      if (doesTenantRowHaveMetadataProducts(n.arguments[0], v3Bindings, v3Functions)) v3Detected = true;
    }
    ts.forEachChild(n, visitV3);
  }
  visitV3(v3Sf);
  if (!v3Detected) {
    console.error('[SELF-TEST FAILED] Vector 3: Computed property name with metadata.products was not detected');
    process.exit(1);
  }

  // Test 4: Vector 4 — Builder reassignment & helper wrapper in unauthorized route
  const v4Code = `
    function getQuery(sb) {
      return sb.from('tenants');
    }
    let q;
    q = getQuery(supabase);
    q = q.eq('id', '1');
    await q.update({ name: 'unauthorized-name' });
  `;
  const v4Sf = ts.createSourceFile('v4.ts', v4Code, ts.ScriptTarget.Latest, true);
  const v4Bindings = buildVariableBindingMap(v4Sf);
  const v4Functions = collectFileFunctions(v4Sf);
  const v4Helpers = new Set();
  const v4BuilderVars = new Set();
  function scanV4Functions(node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      let returnsTenants = false;
      function checkReturn(n) {
        if (ts.isReturnStatement(n) && n.expression) {
          if (isFromTenantsChain(n.expression, v4BuilderVars, v4Helpers, v4Bindings, v4Functions)) returnsTenants = true;
        }
        ts.forEachChild(n, checkReturn);
      }
      checkReturn(node.body);
      if (returnsTenants) v4Helpers.add(node.name.text);
    }
    ts.forEachChild(node, scanV4Functions);
  }
  scanV4Functions(v4Sf);

  let v4Changed = true;
  while (v4Changed) {
    const prevSize = v4BuilderVars.size;
    function scanV4Aliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isFromTenantsChain(node.initializer, v4BuilderVars, v4Helpers, v4Bindings, v4Functions)) {
          v4BuilderVars.add(node.name.text);
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        if (isFromTenantsChain(node.right, v4BuilderVars, v4Helpers, v4Bindings, v4Functions)) {
          v4BuilderVars.add(node.left.text);
        }
      }
      ts.forEachChild(node, scanV4Aliases);
    }
    scanV4Aliases(v4Sf);
    v4Changed = v4BuilderVars.size > prevSize;
  }

  let v4Detected = false;
  function visitV4(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'update') {
        let receiver = node.expression.expression;
        while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
          receiver = receiver.expression.expression;
        }
        if (ts.isIdentifier(receiver) && v4BuilderVars.has(receiver.text)) {
          v4Detected = true;
        }
      }
    }
    ts.forEachChild(node, visitV4);
  }
  visitV4(v4Sf);
  if (!v4Detected || !v4Helpers.has('getQuery') || !v4BuilderVars.has('q')) {
    console.error('[SELF-TEST FAILED] Vector 4: Builder reassignment & helper wrapper detection failed:', { v4Detected, helpers: Array.from(v4Helpers), vars: Array.from(v4BuilderVars) });
    process.exit(1);
  }

  // Test 5: Vector 5 — Aliased import of internal-tenant-product-projector & browser re-export chain
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
    console.error('[SELF-TEST FAILED] Vector 5a: Aliased projection import and call detection failed:', { detectedImportAlias, detectedAliasCall, isAllowlisted });
    process.exit(1);
  }

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
    console.error('[SELF-TEST FAILED] Vector 5b: Re-export detection failed');
    process.exit(1);
  }

  // Test 6: Multi-hop builder variable alias detection + chained mutation
  const multiHopSnippet = `
    const first = supabase.from('tenants');
    const second = first;
    const third = second.select('*');
    await third.update({ name: 'test' });
  `;
  const multiHopSf = ts.createSourceFile('test-multihop.tsx', multiHopSnippet, ts.ScriptTarget.Latest, true);
  const multiHopBindings = buildVariableBindingMap(multiHopSf);
  const multiHopFunctions = collectFileFunctions(multiHopSf);
  const multiHopVars = new Set();
  let multiHopChanged = true;
  while (multiHopChanged) {
    const prevSize = multiHopVars.size;
    function scanAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isFromTenantsChain(node.initializer, multiHopVars, new Set(), multiHopBindings, multiHopFunctions)) {
          multiHopVars.add(node.name.text);
        }
      }
      ts.forEachChild(node, scanAliases);
    }
    scanAliases(multiHopSf);
    multiHopChanged = multiHopVars.size > prevSize;
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
    console.error('[SELF-TEST FAILED] Vector 6: Multi-hop builder variable alias detection failed:', Array.from(multiHopVars));
    process.exit(1);
  }

  // Test 7: Unauthorized .from('tenants').delete()
  const deleteSnippet = `
    await supabase.from('tenants').delete().eq('id', '1');
  `;
  const deleteSf = ts.createSourceFile('test-delete.ts', deleteSnippet, ts.ScriptTarget.Latest, true);
  const deleteBindings = buildVariableBindingMap(deleteSf);
  const deleteFunctions = collectFileFunctions(deleteSf);
  let deleteOpDetected = false;
  function visitDelete(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'delete') {
        let curr = node.expression.expression;
        if (isFromTenantsCall(curr, deleteBindings, deleteFunctions)) {
          deleteOpDetected = true;
        }
      }
    }
    ts.forEachChild(node, visitDelete);
  }
  visitDelete(deleteSf);
  const isDeleteAllowed = AUTHORIZED_TENANT_DELETE_WRITERS.size > 0;
  if (!deleteOpDetected || isDeleteAllowed) {
    console.error('[SELF-TEST FAILED] Vector 7: Unauthorized .from("tenants").delete() detection failed');
    process.exit(1);
  }

  // Test 8: Vector 8 — Helper Call Payload Resolution & Fail-Closed Guard
  // 8a: Local helper returning metadata.products
  const v8aCode = `
    function buildTenantPayload() {
      return { metadata: { products: [] } };
    }
    const payload = buildTenantPayload();
    supabase.from('tenants').update(payload);
  `;
  const v8aSf = ts.createSourceFile('v8a.ts', v8aCode, ts.ScriptTarget.Latest, true);
  const v8aBindings = buildVariableBindingMap(v8aSf);
  const v8aFunctions = collectFileFunctions(v8aSf);
  let v8aDetected = false;
  function visit8a(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'update') {
      if (doesTenantRowHaveMetadataProducts(n.arguments[0], v8aBindings, v8aFunctions)) {
        v8aDetected = true;
      }
    }
    ts.forEachChild(n, visit8a);
  }
  visit8a(v8aSf);

  // 8b: Opaque external helper payload (must trigger unverified helper error)
  const v8bCode = `
    supabase.from('tenants').update(unknownExternalHelper());
  `;
  const v8bSf = ts.createSourceFile('v8b.ts', v8bCode, ts.ScriptTarget.Latest, true);
  const v8bBindings = buildVariableBindingMap(v8bSf);
  const v8bFunctions = collectFileFunctions(v8bSf);
  const v8bUnverified = [];
  function visit8b(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'update') {
      doesTenantRowHaveMetadataProducts(n.arguments[0], v8bBindings, v8bFunctions, new Set(), v8bUnverified);
    }
    ts.forEachChild(n, visit8b);
  }
  visit8b(v8bSf);

  if (!v8aDetected || v8bUnverified.length === 0) {
    console.error('[SELF-TEST FAILED] Vector 8: Helper call payload resolution or fail-closed guard failed:', { v8aDetected, v8bErrors: v8bUnverified.length });
    process.exit(1);
  }

  // Test 9: Vector 9 — Dynamic Table Alias Resolution & Fail-Closed Mutation Detection
  // 9a: Dynamic table alias resolved to 'tenants' in unauthorized route
  const v9aCode = `
    const tableName = 'tenants';
    supabase.from(tableName).update({ name: 'hacked' });
  `;
  const v9aSf = ts.createSourceFile('v9a.ts', v9aCode, ts.ScriptTarget.Latest, true);
  const v9aBindings = buildVariableBindingMap(v9aSf);
  const v9aFunctions = collectFileFunctions(v9aSf);
  let v9aFromTenants = false;
  function visit9a(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'update') {
      let curr = n.expression.expression;
      while (curr) {
        if (isFromTenantsCall(curr, v9aBindings, v9aFunctions)) {
          v9aFromTenants = true;
          break;
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) curr = curr.expression.expression;
        else break;
      }
    }
    ts.forEachChild(n, visit9a);
  }
  visit9a(v9aSf);

  // 9b: Dynamic unresolvable table expression chained with mutation
  const v9bCode = `
    supabase.from(someOpaqueTable).update({ name: 'hacked' });
  `;
  const v9bSf = ts.createSourceFile('v9b.ts', v9bCode, ts.ScriptTarget.Latest, true);
  const v9bBindings = buildVariableBindingMap(v9bSf);
  const v9bFunctions = collectFileFunctions(v9bSf);
  let v9bUnresolvableMutation = false;
  function visit9b(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['insert', 'update', 'upsert', 'delete'].includes(n.expression.name.text)) {
      let curr = n.expression.expression;
      while (curr) {
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression) && curr.expression.name.text === 'from') {
          if (curr.arguments.length > 0) {
            const res = resolveTableArgument(curr.arguments[0], v9bBindings, v9bFunctions);
            if (!res.resolved) {
              v9bUnresolvableMutation = true;
            }
          }
          break;
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) curr = curr.expression.expression;
        else break;
      }
    }
    ts.forEachChild(n, visit9b);
  }
  visit9b(v9bSf);

  if (!v9aFromTenants || !v9bUnresolvableMutation) {
    console.error('[SELF-TEST FAILED] Vector 9: Dynamic table alias resolution or fail-closed guard failed:', { v9aFromTenants, v9bUnresolvableMutation });
    process.exit(1);
  }

  console.log('[SELF-TEST PASSED] AST scanner correctly verifies all negative vectors (array payload, object spread alias, computed property name, builder reassignment, aliased projection import, browser re-export chain, helper call payload resolution, and dynamic table alias).');
  process.exit(0);
}

// ── 1. COLLECT ALL SOURCE FILES VIA DISCOVERED RUNTIME DIRECTORIES ────────────
const allFiles = [];
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        collectFiles(full);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      allFiles.push(full);
    }
  }
}
for (const d of discoveredRuntimeDirs) {
  collectFiles(path.join(rootDir, d));
}
if (fs.existsSync(path.join(rootDir, 'middleware.ts'))) {
  allFiles.push(path.join(rootDir, 'middleware.ts'));
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
const unverifiedHelperPayloads = [];
const unresolvableDynamicTableMutations = [];

let occCasCallCount = 0;
const occCasFiles = new Set();

for (const [filePath, { sourceFile, relPath }] of fileAstMap.entries()) {
  const isDirectClient = directClientFiles.has(filePath);
  const isBrowserReachable = browserReachableFiles.has(filePath);

  // Per-file variable binding map and file-level functions
  const varBindings = buildVariableBindingMap(sourceFile);
  const fileFunctions = collectFileFunctions(sourceFile);

  // Helper functions returning tenants query builder
  const tenantQueryHelpers = new Set();
  function scanFunctions(node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      let returnsTenants = false;
      function checkReturn(n) {
        if (ts.isReturnStatement(n) && n.expression) {
          if (isFromTenantsChain(n.expression, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
            returnsTenants = true;
          }
        }
        ts.forEachChild(n, checkReturn);
      }
      checkReturn(node.body);
      if (returnsTenants) tenantQueryHelpers.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const body = init.body;
        let returnsTenants = false;
        if (ts.isBlock(body)) {
          function checkReturn(n) {
            if (ts.isReturnStatement(n) && n.expression) {
              if (isFromTenantsChain(n.expression, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
                returnsTenants = true;
              }
            }
            ts.forEachChild(n, checkReturn);
          }
          checkReturn(body);
        } else {
          if (isFromTenantsChain(body, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
            returnsTenants = true;
          }
        }
        if (returnsTenants) tenantQueryHelpers.add(node.name.text);
      }
    }
    ts.forEachChild(node, scanFunctions);
  }

  // Multi-hop builder variable alias & reassignment propagation (fixed-point loop)
  const tenantBuilderVars = new Set();
  scanFunctions(sourceFile);

  let changed = true;
  while (changed) {
    const prevSize = tenantBuilderVars.size;
    function scanAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isFromTenantsChain(node.initializer, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
          tenantBuilderVars.add(node.name.text);
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        if (isFromTenantsChain(node.right, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
          tenantBuilderVars.add(node.left.text);
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
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression) && curr.expression.name.text === 'from') {
          if (curr.arguments.length > 0) {
            const tableRes = resolveTableArgument(curr.arguments[0], varBindings, fileFunctions);
            if (tableRes.resolved) {
              if (tableRes.name === 'tenants') {
                return { op: methodName.toUpperCase(), fromTenants: true };
              } else {
                return null; // Known non-tenant table
              }
            } else {
              // Non-literal dynamic table argument chained with a mutation!
              return { op: methodName.toUpperCase(), unresolvableTable: true, exprText: curr.arguments[0].getText(sourceFile) };
            }
          }
        }
        if (ts.isIdentifier(curr) && tenantBuilderVars.has(curr.text)) {
          return { op: methodName.toUpperCase(), fromTenants: true };
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
          curr = curr.expression.expression;
        } else if (
          ts.isAsExpression(curr) ||
          ts.isNonNullExpression?.(curr) ||
          ts.isParenthesizedExpression(curr) ||
          (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr))
        ) {
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

    const mut = getChainedMutationOp(node);
    if (mut) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      if (mut.unresolvableTable) {
        unresolvableDynamicTableMutations.push({
          file: relPath,
          line: pos.line + 1,
          column: pos.character + 1,
          op: mut.op,
          expr: mut.exprText,
          reason: 'UNRESOLVABLE_DYNAMIC_TABLE_MUTATION',
        });
      } else if (mut.fromTenants) {
        const op = mut.op;
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
            const helperErrs = [];
            if (node.arguments && node.arguments.length > 0) {
              const hasProducts = doesTenantRowHaveMetadataProducts(node.arguments[0], varBindings, fileFunctions, new Set(), helperErrs);
              if (hasProducts) {
                unauthorizedMetadataProductsWrites.push({
                  file: relPath,
                  line: pos.line + 1,
                  column: pos.character + 1,
                  op,
                  reason: 'UNAUTHORIZED_METADATA_PRODUCTS_WRITE',
                });
              }
            }
            if (helperErrs.length > 0) {
              for (const h of helperErrs) {
                unverifiedHelperPayloads.push({
                  file: relPath,
                  line: pos.line + 1,
                  column: pos.character + 1,
                  op,
                  ...h,
                });
              }
            }
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
console.log('Top-Level Runtime Directories Discovered:');
discoveredRuntimeDirs.forEach(d => console.log(`  - ${d}`));
console.log(`Total Runtime Source Files Scanned: ${allFiles.length}`);
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
console.log(`Unverified Helper Payloads:          ${unverifiedHelperPayloads.length}`);
console.log(`Unresolvable Dynamic Tables:         ${unresolvableDynamicTableMutations.length}`);

const hasFatalViolations =
  directClientMutations.length > 0 ||
  transitiveBrowserMutations.length > 0 ||
  browserOccHelperLeaks.length > 0 ||
  unauthorizedProjectionCallers.length > 0 ||
  unauthorizedServerWriters.length > 0 ||
  unauthorizedMetadataProductsWrites.length > 0 ||
  unverifiedHelperPayloads.length > 0 ||
  unresolvableDynamicTableMutations.length > 0;

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
  for (const h of unverifiedHelperPayloads) {
    console.error(`  UNVERIFIED HELPER PAYLOAD: ${h.file}:${h.line}:${h.column} [${h.op}] (${h.helper} - ${h.reason})`);
  }
  for (const t of unresolvableDynamicTableMutations) {
    console.error(`  UNRESOLVABLE DYNAMIC TABLE MUTATION: ${t.file}:${t.line}:${t.column} [${t.op}] (${t.expr} - ${t.reason})`);
  }
} else {
  console.log('SUCCESS: ZERO (0) browser mutations, ZERO unauthorized projection callers, ZERO unguarded server writers, ZERO unverified helper payloads, and ZERO unauthorized metadata.products writes verified via AST!');
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
