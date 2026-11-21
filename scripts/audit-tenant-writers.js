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
  if (
    ts.isArrowFunction(fnNode) ||
    ts.isFunctionExpression(fnNode) ||
    ts.isFunctionDeclaration(fnNode) ||
    ts.isMethodDeclaration(fnNode)
  ) {
    const body = fnNode.body;
    if (!body) return returns;
    if (ts.isBlock(body)) {
      function findReturns(n) {
        if (
          n !== fnNode &&
          (ts.isFunctionDeclaration(n) ||
            ts.isArrowFunction(n) ||
            ts.isFunctionExpression(n) ||
            ts.isMethodDeclaration(n))
        ) {
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
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      fileFunctions.set(node.name.text, node);
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
        if (knownHelpers.has(curr.expression.name.text)) return true;
        curr = curr.expression.expression;
        continue;
      }
    } else if (
      ts.isAsExpression(curr) ||
      ts.isNonNullExpression?.(curr) ||
      ts.isParenthesizedExpression(curr) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr)) ||
      (ts.isAwaitExpression && ts.isAwaitExpression(curr))
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

function collectParameterIdentifiers(sourceFile) {
  const params = new Set();
  function collectNames(nameNode) {
    if (!nameNode) return;
    if (ts.isIdentifier(nameNode)) {
      params.add(nameNode.text);
    } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
      for (const elem of nameNode.elements) {
        if (!ts.isOmittedExpression?.(elem) && elem.name) {
          collectNames(elem.name);
        }
      }
    }
  }

  function scan(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      if (node.parameters) {
        for (const p of node.parameters) {
          collectNames(p.name);
        }
      }
    }
    ts.forEachChild(node, scan);
  }
  scan(sourceFile);
  return params;
}

function isUnresolvedDynamicFromCall(node, varBindings, fileFunctions) {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'from') return false;
  const receiver = unwrap(node.expression.expression);
  if (ts.isIdentifier(receiver)) {
    const builtinTypes = new Set(['Array', 'Buffer', 'Promise', 'Object', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array']);
    if (builtinTypes.has(receiver.text)) return false;
  }
  if (!node.arguments || node.arguments.length === 0) return true;
  const tableRes = resolveTableArgument(node.arguments[0], varBindings, fileFunctions);
  return !tableRes.resolved;
}

function isUnresolvedDynamicChain(expr, unresolvedBuilderVars = new Set(), unresolvedHelpers = new Set(), varBindings, fileFunctions) {
  let curr = expr;
  while (curr) {
    if (isUnresolvedDynamicFromCall(curr, varBindings, fileFunctions)) return true;
    if (ts.isIdentifier(curr) && unresolvedBuilderVars.has(curr.text)) return true;
    if (ts.isCallExpression(curr)) {
      if (ts.isIdentifier(curr.expression) && unresolvedHelpers.has(curr.expression.text)) return true;
      if (ts.isPropertyAccessExpression(curr.expression)) {
        if (unresolvedHelpers.has(curr.expression.name.text)) return true;
        curr = curr.expression.expression;
        continue;
      }
    } else if (
      ts.isAsExpression(curr) ||
      ts.isNonNullExpression?.(curr) ||
      ts.isParenthesizedExpression(curr) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr)) ||
      (ts.isAwaitExpression && ts.isAwaitExpression(curr))
    ) {
      curr = curr.expression;
      continue;
    }
    break;
  }
  return false;
}

function resolveUnifiedTenantBuildersAndHelpers(sourceFile, varBindings, fileFunctions) {
  const tenantBuilderVars = new Set();
  const tenantQueryHelpers = new Set();

  let changed = true;
  while (changed) {
    const prevVars = tenantBuilderVars.size;
    const prevHelpers = tenantQueryHelpers.size;

    function scanTenantAliases(node) {
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
      ts.forEachChild(node, scanTenantAliases);
    }
    scanTenantAliases(sourceFile);

    function scanTenantFunctions(node) {
      function checkAndAddTenant(fnName, fnNode) {
        if (!fnName || !fnNode) return;
        const returns = getFunctionReturnExpressions(fnNode);
        for (const ret of returns) {
          if (isFromTenantsChain(ret, tenantBuilderVars, tenantQueryHelpers, varBindings, fileFunctions)) {
            tenantQueryHelpers.add(fnName);
            break;
          }
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name) {
        checkAndAddTenant(node.name.text, node);
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        checkAndAddTenant(node.name.text, node);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = unwrap(node.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          checkAndAddTenant(node.name.text, init);
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        node.right
      ) {
        const rightInit = unwrap(node.right);
        if (ts.isArrowFunction(rightInit) || ts.isFunctionExpression(rightInit)) {
          checkAndAddTenant(node.left.text, rightInit);
        }
      }
      ts.forEachChild(node, scanTenantFunctions);
    }
    scanTenantFunctions(sourceFile);

    changed = tenantBuilderVars.size > prevVars || tenantQueryHelpers.size > prevHelpers;
  }

  return { tenantBuilderVars, tenantQueryHelpers };
}

function resolveUnifiedDynamicBuildersAndHelpers(sourceFile, varBindings, fileFunctions) {
  const unresolvedDynamicBuilders = new Set();
  const unresolvedDynamicHelpers = new Set();

  let changed = true;
  while (changed) {
    const prevBuildersSize = unresolvedDynamicBuilders.size;
    const prevHelpersSize = unresolvedDynamicHelpers.size;

    function scanDynAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isUnresolvedDynamicChain(node.initializer, unresolvedDynamicBuilders, unresolvedDynamicHelpers, varBindings, fileFunctions)) {
          unresolvedDynamicBuilders.add(node.name.text);
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        if (isUnresolvedDynamicChain(node.right, unresolvedDynamicBuilders, unresolvedDynamicHelpers, varBindings, fileFunctions)) {
          unresolvedDynamicBuilders.add(node.left.text);
        }
      }
      ts.forEachChild(node, scanDynAliases);
    }
    scanDynAliases(sourceFile);

    function scanDynamicFunctions(node) {
      function checkAndAddDynamic(fnName, fnNode) {
        if (!fnName || !fnNode) return;
        const returns = getFunctionReturnExpressions(fnNode);
        for (const ret of returns) {
          if (isUnresolvedDynamicChain(ret, unresolvedDynamicBuilders, unresolvedDynamicHelpers, varBindings, fileFunctions)) {
            unresolvedDynamicHelpers.add(fnName);
            break;
          }
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name) {
        checkAndAddDynamic(node.name.text, node);
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        checkAndAddDynamic(node.name.text, node);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = unwrap(node.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          checkAndAddDynamic(node.name.text, init);
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        node.right
      ) {
        const rightInit = unwrap(node.right);
        if (ts.isArrowFunction(rightInit) || ts.isFunctionExpression(rightInit)) {
          checkAndAddDynamic(node.left.text, rightInit);
        }
      }
      ts.forEachChild(node, scanDynamicFunctions);
    }
    scanDynamicFunctions(sourceFile);

    changed = unresolvedDynamicBuilders.size > prevBuildersSize || unresolvedDynamicHelpers.size > prevHelpersSize;
  }

  return { unresolvedDynamicBuilders, unresolvedDynamicHelpers };
}

function doesObjectHaveProducts(expr, varBindings, fileFunctions, visitedVars = new Set(), unverifiedHelperErrors = [], parameterIdentifiers = null) {
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
        if (ts.isIdentifier(spreadExpr)) {
          if (parameterIdentifiers && parameterIdentifiers.has(spreadExpr.text)) {
            unverifiedHelperErrors.push({
              helper: spreadExpr.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
          const bindings = varBindings ? varBindings.get(spreadExpr.text) : null;
          if (!bindings || bindings.length === 0) {
            unverifiedHelperErrors.push({
              helper: spreadExpr.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
        }
        if (doesObjectHaveProducts(spreadExpr, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
      }
    }
  } else if (ts.isIdentifier(unwrapped)) {
    if (parameterIdentifiers && parameterIdentifiers.has(unwrapped.text)) {
      unverifiedHelperErrors.push({
        helper: unwrapped.text,
        reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
      });
      return false;
    }
    if (visitedVars.has(unwrapped.text)) return false;
    visitedVars.add(unwrapped.text);
    const bindings = varBindings ? varBindings.get(unwrapped.text) : null;
    if (!bindings || bindings.length === 0) {
      unverifiedHelperErrors.push({
        helper: unwrapped.text,
        reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
      });
      return false;
    }
    for (const b of bindings) {
      if (doesObjectHaveProducts(b, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
    }
  } else if (ts.isArrayLiteralExpression(unwrapped)) {
    for (const elem of unwrapped.elements) {
      if (doesObjectHaveProducts(elem, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
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
          if (doesObjectHaveProducts(r, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
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

function doesTenantRowHaveMetadataProducts(expr, varBindings, fileFunctions, visitedVars = new Set(), unverifiedHelperErrors = [], parameterIdentifiers = null) {
  const unwrapped = unwrap(expr);
  if (!unwrapped) return false;

  if (ts.isArrayLiteralExpression(unwrapped)) {
    for (const elem of unwrapped.elements) {
      if (doesTenantRowHaveMetadataProducts(elem, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
    }
    return false;
  }

  if (ts.isObjectLiteralExpression(unwrapped)) {
    for (const prop of unwrapped.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const pName = getPropertyName(prop.name, varBindings);
        if (pName === 'metadata') {
          const metaVal = unwrap(prop.initializer);
          if (ts.isIdentifier(metaVal)) {
            if (parameterIdentifiers && parameterIdentifiers.has(metaVal.text)) {
              unverifiedHelperErrors.push({
                helper: metaVal.text,
                reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
              });
              return false;
            }
            const mBindings = varBindings ? varBindings.get(metaVal.text) : null;
            if (!mBindings || mBindings.length === 0) {
              unverifiedHelperErrors.push({
                helper: metaVal.text,
                reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
              });
              return false;
            }
          }
          if (doesObjectHaveProducts(metaVal, varBindings, fileFunctions, new Set(), unverifiedHelperErrors, parameterIdentifiers)) return true;
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        if (prop.name.text === 'metadata') {
          if (parameterIdentifiers && parameterIdentifiers.has(prop.name.text)) {
            unverifiedHelperErrors.push({
              helper: prop.name.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
          const mBindings = varBindings ? varBindings.get(prop.name.text) : null;
          if (!mBindings || mBindings.length === 0) {
            unverifiedHelperErrors.push({
              helper: prop.name.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
          if (doesObjectHaveProducts(prop.name, varBindings, fileFunctions, new Set(), unverifiedHelperErrors, parameterIdentifiers)) return true;
        }
      } else if (ts.isSpreadAssignment(prop)) {
        const spreadExpr = unwrap(prop.expression);
        if (ts.isIdentifier(spreadExpr)) {
          if (parameterIdentifiers && parameterIdentifiers.has(spreadExpr.text)) {
            unverifiedHelperErrors.push({
              helper: spreadExpr.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
          const sBindings = varBindings ? varBindings.get(spreadExpr.text) : null;
          if (!sBindings || sBindings.length === 0) {
            unverifiedHelperErrors.push({
              helper: spreadExpr.text,
              reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
            });
            return false;
          }
        }
        if (doesTenantRowHaveMetadataProducts(spreadExpr, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
      }
    }
  } else if (ts.isIdentifier(unwrapped)) {
    if (parameterIdentifiers && parameterIdentifiers.has(unwrapped.text)) {
      unverifiedHelperErrors.push({
        helper: unwrapped.text,
        reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
      });
      return false;
    }
    if (visitedVars.has(unwrapped.text)) return false;
    visitedVars.add(unwrapped.text);
    const bindings = varBindings ? varBindings.get(unwrapped.text) : null;
    if (!bindings || bindings.length === 0) {
      unverifiedHelperErrors.push({
        helper: unwrapped.text,
        reason: 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION'
      });
      return false;
    }
    for (const b of bindings) {
      if (doesTenantRowHaveMetadataProducts(b, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
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
          if (doesTenantRowHaveMetadataProducts(r, varBindings, fileFunctions, new Set(visitedVars), unverifiedHelperErrors, parameterIdentifiers)) return true;
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
  const { tenantBuilderVars: v4BuilderVars, tenantQueryHelpers: v4Helpers } =
    resolveUnifiedTenantBuildersAndHelpers(v4Sf, v4Bindings, v4Functions);

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

  // Test 10: Vector 10 (Kasus A — Function Parameter Payload)
  const v10Code = `
    async function updateConfig(payload: any, supabase: any) {
      await supabase.from('tenants').update(payload).eq('id', 't1');
    }
  `;
  const v10Sf = ts.createSourceFile('v10.ts', v10Code, ts.ScriptTarget.Latest, true);
  const v10Bindings = buildVariableBindingMap(v10Sf);
  const v10Functions = collectFileFunctions(v10Sf);
  const v10Params = collectParameterIdentifiers(v10Sf);
  const v10Errors = [];

  function visitV10(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'update') {
      doesTenantRowHaveMetadataProducts(n.arguments[0], v10Bindings, v10Functions, new Set(), v10Errors, v10Params);
    }
    ts.forEachChild(n, visitV10);
  }
  visitV10(v10Sf);

  if (v10Errors.length === 0 || v10Errors[0].reason !== 'UNVERIFIED_HELPER_PAYLOAD_IN_TENANT_MUTATION') {
    console.error('[SELF-TEST FAILED] Vector 10: Function parameter payload fail-closed detection failed:', v10Errors);
    process.exit(1);
  }

  // Test 11: Vector 11 (Kasus B — Unresolved Dynamic Table Stored in Builder Variable)
  const v11Code = `
    async function mutate(supabase: any, tableName: string, payload: any) {
      const builder = supabase.from(tableName);
      await builder.update(payload);
    }
  `;
  const v11Sf = ts.createSourceFile('v11.ts', v11Code, ts.ScriptTarget.Latest, true);
  const v11Bindings = buildVariableBindingMap(v11Sf);
  const v11Functions = collectFileFunctions(v11Sf);
  const { unresolvedDynamicBuilders: v11DynamicBuilders, unresolvedDynamicHelpers: v11DynamicHelpers } =
    resolveUnifiedDynamicBuildersAndHelpers(v11Sf, v11Bindings, v11Functions);

  let v11UnresolvableMutation = false;
  function visitV11(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const methodName = n.expression.name.text;
      if (['insert', 'update', 'upsert', 'delete'].includes(methodName)) {
        let curr = n.expression.expression;
        while (curr) {
          if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression) && curr.expression.name.text === 'from') {
            if (curr.arguments.length > 0) {
              const tableRes = resolveTableArgument(curr.arguments[0], v11Bindings, v11Functions);
              if (!tableRes.resolved) {
                v11UnresolvableMutation = true;
              }
            }
            break;
          }
          if (ts.isIdentifier(curr) && v11DynamicBuilders.has(curr.text)) {
            v11UnresolvableMutation = true;
            break;
          }
          if (ts.isCallExpression(curr) && ts.isIdentifier(curr.expression) && v11DynamicHelpers.has(curr.expression.text)) {
            v11UnresolvableMutation = true;
            break;
          }
          if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
            curr = curr.expression.expression;
          } else break;
        }
      }
    }
    ts.forEachChild(n, visitV11);
  }
  visitV11(v11Sf);

  if (!v11UnresolvableMutation || !v11DynamicBuilders.has('builder')) {
    console.error('[SELF-TEST FAILED] Vector 11: Unresolved dynamic table in builder variable failed:', { v11UnresolvableMutation, builders: Array.from(v11DynamicBuilders) });
    process.exit(1);
  }

  // Test 12: Vector 12 (Unified Fixed-Point Dynamic Helper-Return via Local Variable)
  const v12Code = `
    function getBuilder(supabase: any, tableName: string) {
      const builder = supabase.from(tableName);
      return builder;
    }
    const arrowGetBuilder = (supabase: any, tableName: string) => {
      const b = supabase.from(tableName);
      return b;
    };
    class BuilderService {
      getMethodBuilder(supabase: any, tableName: string) {
        const mb = supabase.from(tableName);
        return mb;
      }
    }
    const service = new BuilderService();

    const query = getBuilder(supabase, runtimeTableName);
    await query.update(payload);

    const queryArrow = arrowGetBuilder(supabase, runtimeTableName);
    await queryArrow.update(payload);

    const queryMethod = service.getMethodBuilder(supabase, runtimeTableName);
    await queryMethod.update(payload);
  `;
  const v12Sf = ts.createSourceFile('v12.ts', v12Code, ts.ScriptTarget.Latest, true);
  const v12Bindings = buildVariableBindingMap(v12Sf);
  const v12Functions = collectFileFunctions(v12Sf);
  const { unresolvedDynamicBuilders: v12Builders, unresolvedDynamicHelpers: v12Helpers } =
    resolveUnifiedDynamicBuildersAndHelpers(v12Sf, v12Bindings, v12Functions);

  let v12DetectedCount = 0;
  function visitV12(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const methodName = n.expression.name.text;
      if (['insert', 'update', 'upsert', 'delete'].includes(methodName)) {
        let curr = n.expression.expression;
        while (curr) {
          if (ts.isIdentifier(curr) && v12Builders.has(curr.text)) {
            v12DetectedCount++;
            break;
          }
          if (ts.isCallExpression(curr)) {
            if (ts.isIdentifier(curr.expression) && v12Helpers.has(curr.expression.text)) {
              v12DetectedCount++;
              break;
            }
            if (ts.isPropertyAccessExpression(curr.expression) && v12Helpers.has(curr.expression.name.text)) {
              v12DetectedCount++;
              break;
            }
            if (ts.isPropertyAccessExpression(curr.expression)) {
              curr = curr.expression.expression;
              continue;
            }
          }
          if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
            curr = curr.expression.expression;
          } else if (ts.isAwaitExpression?.(curr) || ts.isParenthesizedExpression(curr)) {
            curr = curr.expression;
          } else break;
        }
      }
    }
    ts.forEachChild(n, visitV12);
  }
  visitV12(v12Sf);

  if (
    v12DetectedCount !== 3 ||
    !v12Helpers.has('getBuilder') ||
    !v12Helpers.has('arrowGetBuilder') ||
    !v12Helpers.has('getMethodBuilder') ||
    !v12Builders.has('query') ||
    !v12Builders.has('queryArrow') ||
    !v12Builders.has('queryMethod')
  ) {
    console.error('[SELF-TEST FAILED] Vector 12: Unified fixed-point dynamic helper-return detection failed:', {
      v12DetectedCount,
      helpers: Array.from(v12Helpers),
      builders: Array.from(v12Builders),
    });
    process.exit(1);
  }

  console.log('[SELF-TEST PASSED] AST scanner correctly verifies all 12 negative vectors (array payload, object spread alias, computed property name, builder reassignment, aliased projection import, browser re-export chain, helper call payload resolution, dynamic table alias, function parameter payload, dynamic builder variable, and unified fixed-point helper-return builder).');
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

  // Per-file variable binding map, parameter identifiers, and file-level functions
  const varBindings = buildVariableBindingMap(sourceFile);
  const fileFunctions = collectFileFunctions(sourceFile);
  const parameterIdentifiers = collectParameterIdentifiers(sourceFile);

  // Multi-hop builder variable alias & helper-return propagation (unified fixed-point loop)
  const { tenantBuilderVars, tenantQueryHelpers } = resolveUnifiedTenantBuildersAndHelpers(sourceFile, varBindings, fileFunctions);

  // Multi-hop unresolved dynamic builder variable & helper-return propagation (unified fixed-point loop)
  const { unresolvedDynamicBuilders, unresolvedDynamicHelpers } = resolveUnifiedDynamicBuildersAndHelpers(sourceFile, varBindings, fileFunctions);

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
        if (ts.isIdentifier(curr)) {
          if (tenantBuilderVars.has(curr.text)) {
            return { op: methodName.toUpperCase(), fromTenants: true };
          }
          if (unresolvedDynamicBuilders.has(curr.text)) {
            return { op: methodName.toUpperCase(), unresolvableTable: true, exprText: curr.text };
          }
        }
        if (ts.isCallExpression(curr)) {
          if (ts.isIdentifier(curr.expression)) {
            if (tenantQueryHelpers.has(curr.expression.text)) {
              return { op: methodName.toUpperCase(), fromTenants: true };
            }
            if (unresolvedDynamicHelpers.has(curr.expression.text)) {
              return { op: methodName.toUpperCase(), unresolvableTable: true, exprText: curr.expression.text };
            }
          } else if (ts.isPropertyAccessExpression(curr.expression)) {
            if (tenantQueryHelpers.has(curr.expression.name.text)) {
              return { op: methodName.toUpperCase(), fromTenants: true };
            }
            if (unresolvedDynamicHelpers.has(curr.expression.name.text)) {
              return { op: methodName.toUpperCase(), unresolvableTable: true, exprText: curr.expression.name.text };
            }
          }
        }
        if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
          curr = curr.expression.expression;
        } else if (
          ts.isAsExpression(curr) ||
          ts.isNonNullExpression?.(curr) ||
          ts.isParenthesizedExpression(curr) ||
          (ts.isSatisfiesExpression && ts.isSatisfiesExpression(curr)) ||
          (ts.isAwaitExpression && ts.isAwaitExpression(curr))
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

          // AST Payload Inspection: Check for metadata.products outside authorized projector modules and atomic tenant writer
          const isCoreSystemModule = AUTHORIZED_PROJECTION_ALLOWLIST.has(relPath) || relPath === 'lib/tenants/atomic-tenant-metadata-writer.ts';
          if (!isCoreSystemModule) {
            const helperErrs = [];
            if (node.arguments && node.arguments.length > 0) {
              const hasProducts = doesTenantRowHaveMetadataProducts(node.arguments[0], varBindings, fileFunctions, new Set(), helperErrs, parameterIdentifiers);
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
