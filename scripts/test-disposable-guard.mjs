/**
 * scripts/test-disposable-guard.mjs
 *
 * Dedicated ESM Unit Test Suite for assertDisposableDatabaseTarget
 * Validates BWM Phase 6.1N.7.2 Mission B:
 * - Strict allowlist enforcement: protocol (postgres/postgresql), host (localhost/127.0.0.1),
 *   port (5432), db (/test_workforce_ci), user (postgres/authenticator).
 * - Comprehensive negative security tests (zero bypass).
 */

import assert from 'assert';
import { assertDisposableDatabaseTarget } from './verify-disposable-postgres-ci.mjs';

console.log('=== Running ESM Guard Unit Tests: assertDisposableDatabaseTarget ===');

// 1. Positive tests: user postgres
assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgres://postgres:disposable_pass@localhost:5432/test_workforce_ci');
}, 'Should accept valid postgres URL on localhost:5432');

assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:disposable_pass@127.0.0.1:5432/test_workforce_ci');
}, 'Should accept valid postgresql URL on 127.0.0.1:5432');

// 2. Positive tests: user authenticator
assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgresql://authenticator:auth_pass@localhost:5432/test_workforce_ci');
}, 'Should accept valid authenticator URL on localhost:5432');

assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgres://authenticator:auth_pass@127.0.0.1:5432/test_workforce_ci');
}, 'Should accept valid authenticator URL on 127.0.0.1:5432');

// 3. Negative tests: invalid protocol
assert.throws(() => {
  assertDisposableDatabaseTarget('http://postgres:pass@localhost:5432/test_workforce_ci');
}, /Invalid protocol \(http:\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('mysql://postgres:pass@localhost:5432/test_workforce_ci');
}, /Invalid protocol \(mysql:\)/);

// 4. Negative tests: unauthorized host
assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/test_workforce_ci');
}, /Unauthorized database host/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@db.mpluzajlzpregmjwpjqr.supabase.co:5432/test_workforce_ci');
}, /Unauthorized database host/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@evil.example.com:5432/test_workforce_ci');
}, /Unauthorized database host/);

// 5. Negative tests: non-5432 port
assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5433/test_workforce_ci');
}, /Invalid database port \(5433\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@localhost/test_workforce_ci');
}, /Invalid database port \(default\)/);

// 6. Negative tests: generic/unauthorized database name
assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5432/postgres');
}, /Invalid database name \(\/postgres\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5432/production');
}, /Invalid database name \(\/production\)/);

// 7. Negative tests: unauthorized user
assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://root:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(root\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://service_role:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(service_role\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://anon:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(anon\)/);

// 8. Negative tests: query parameter overrides & manipulation (Mission A)
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?hostaddr=1.2.3.4');
}, /Manipulative query parameter detected: "hostaddr"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?host=remote.db');
}, /Manipulative query parameter detected: "host"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?port=5433');
}, /Manipulative query parameter detected: "port"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?user=root');
}, /Manipulative query parameter detected: "user"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?dbname=evil_db');
}, /Manipulative query parameter detected: "dbname"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?HostAddr=1.2.3.4');
}, /Manipulative query parameter detected: "HostAddr"/);

// 9. Negative tests: empty/malformed
assert.throws(() => {
  assertDisposableDatabaseTarget('');
}, /Database connection string is empty or invalid/);

assert.throws(() => {
  assertDisposableDatabaseTarget('not-a-valid-url');
}, /Malformed database connection URL/);

console.log('✓ All assertion groups in assertDisposableDatabaseTarget (including query param overrides) PASSED successfully.');
