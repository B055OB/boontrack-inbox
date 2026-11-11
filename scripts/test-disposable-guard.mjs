/**
 * scripts/test-disposable-guard.mjs
 *
 * Dedicated ESM Unit Test Suite for assertDisposableDatabaseTarget & getDisposableDatabaseConnectionString
 * Validates BWM Phase 6.1N.7.6R Mission 3 & Phase 1.4:
 * A. Missing environment variable and empty/malformed URL arguments.
 * B. Invalid protocol rejection (http, https, mysql, file).
 * C. Staging, production, pooler, and external host rejection.
 * D. Invalid port, database name, and case-sensitive database path rejection.
 * E. Unauthorized user rejection (root, admin, service_role, anon).
 * F. Query parameter (hostaddr, case-insensitive overrides) and URL-fragment rejection.
 * G. Accepted disposable localhost connections (postgres, postgresql, authenticator).
 */

import assert from 'assert';
import {
  assertDisposableDatabaseTarget,
  getDisposableDatabaseConnectionString,
} from './disposable-database-guard.mjs';

console.log('=== Running Authoritative Guard Unit Tests: disposable-database-guard ===');

// ----------------------------------------------------------------------------
// Group A: Missing Environment Variable & Empty/Malformed URL Validation
// ----------------------------------------------------------------------------
const originalDirectUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;

delete process.env.WORKFORCE_DATABASE_DIRECT_URL;
assert.throws(() => {
  getDisposableDatabaseConnectionString();
}, /DISPOSABLE_DB_REQUIRED: WORKFORCE_DATABASE_DIRECT_URL environment variable is required/);

process.env.WORKFORCE_DATABASE_DIRECT_URL = '   ';
assert.throws(() => {
  getDisposableDatabaseConnectionString();
}, /DISPOSABLE_DB_REQUIRED: WORKFORCE_DATABASE_DIRECT_URL environment variable is required/);

// Direct assertDisposableDatabaseTarget argument validation
assert.throws(() => {
  assertDisposableDatabaseTarget('');
}, /Database connection string is empty or invalid/);

assert.throws(() => {
  assertDisposableDatabaseTarget('   ');
}, /Database connection string is empty or invalid/);

assert.throws(() => {
  assertDisposableDatabaseTarget(null);
}, /Database connection string is empty or invalid/);

assert.throws(() => {
  assertDisposableDatabaseTarget(undefined);
}, /Database connection string is empty or invalid/);

assert.throws(() => {
  assertDisposableDatabaseTarget('not-a-valid-url');
}, /Malformed database connection URL/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgres://');
}, /Unauthorized database host/);

console.log('✓ Group A: Missing env var and empty/malformed URL rejection PASSED.');

// ----------------------------------------------------------------------------
// Group B: Invalid Protocol Rejection
// ----------------------------------------------------------------------------
assert.throws(() => {
  assertDisposableDatabaseTarget('http://postgres:pass@localhost:5432/test_workforce_ci');
}, /Invalid protocol \(http:\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('https://postgres:pass@localhost:5432/test_workforce_ci');
}, /Invalid protocol \(https:\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('mysql://postgres:pass@localhost:5432/test_workforce_ci');
}, /Invalid protocol \(mysql:\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('file:///localhost:5432/test_workforce_ci');
}, /Invalid protocol \(file:\)/);

console.log('✓ Group B: Invalid protocol rejection PASSED (http, https, mysql, file).');

// ----------------------------------------------------------------------------
// Group C: Staging, Production, Pooler & External Host Rejection
// ----------------------------------------------------------------------------
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:secret_pass@tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres');
}, /Unauthorized database host \(tjkbgxrckaocgosvmzmj\.supabase\.co\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:secret_pass@mpluzajlzpregmjwpjqr.supabase.co:5432/postgres');
}, /Unauthorized database host \(mpluzajlzpregmjwpjqr\.supabase\.co\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:secret_pass@xkhqirhurnjqglmajghn.supabase.co:5432/postgres');
}, /Unauthorized database host \(xkhqirhurnjqglmajghn\.supabase\.co\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@aws-0-ap-southeast-1.pooler.supabase.co:6543/postgres');
}, /Unauthorized database host/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@evil.example.com:5432/test_workforce_ci');
}, /Unauthorized database host/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@192.168.1.100:5432/test_workforce_ci');
}, /Unauthorized database host/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@10.0.0.1:5432/test_workforce_ci');
}, /Unauthorized database host/);

// Assert password/credentials are NEVER echoed in error messages
try {
  assertDisposableDatabaseTarget('postgresql://postgres:super_secret_password_999@mpluzajlzpregmjwpjqr.supabase.co:5432/postgres');
} catch (err) {
  assert(!err.message.includes('super_secret_password_999'), 'Error message must not leak credentials!');
}

console.log('✓ Group C: Staging, production, pooler, and external host rejection PASSED (zero credential echo).');

// ----------------------------------------------------------------------------
// Group D: Invalid Port, Database Name & Case-Sensitivity Rejection
// ----------------------------------------------------------------------------
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5433/test_workforce_ci');
}, /Invalid database port \(5433\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost/test_workforce_ci');
}, /Invalid database port \(default\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/postgres');
}, /Invalid database name \(\/postgres\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/production');
}, /Invalid database name \(\/production\)/);

// Case-sensitive database path enforcement: /TEST_WORKFORCE_CI must be rejected
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/TEST_WORKFORCE_CI');
}, /Invalid database name \(\/TEST_WORKFORCE_CI\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/');
}, /Invalid database name \(\/\)/);

console.log('✓ Group D: Invalid port, database, and case-sensitive dbname rejection PASSED.');

// ----------------------------------------------------------------------------
// Group E: Unauthorized Database Users
// ----------------------------------------------------------------------------
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://root:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(root\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://admin:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(admin\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://service_role:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(service_role\)/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://anon:pass@localhost:5432/test_workforce_ci');
}, /Unauthorized database user \(anon\)/);

console.log('✓ Group E: Unauthorized database user rejection PASSED (root, admin, service_role, anon).');

// ----------------------------------------------------------------------------
// Group F: Query Parameter, HostAddr & URL-Fragment Rejection
// ----------------------------------------------------------------------------
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?host=remote.db');
}, /Manipulative query parameter detected: "host"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?hostaddr=1.2.3.4');
}, /Manipulative query parameter detected: "hostaddr"/);

// Case-insensitive query parameter rejection
assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?HostAddr=1.2.3.4');
}, /Manipulative query parameter detected: "HostAddr"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?HOSTADDR=1.2.3.4');
}, /Manipulative query parameter detected: "HOSTADDR"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?user=root');
}, /Manipulative query parameter detected: "user"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?User=root');
}, /Manipulative query parameter detected: "User"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?port=5433');
}, /Manipulative query parameter detected: "port"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?dbname=evil_db');
}, /Manipulative query parameter detected: "dbname"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?DBNAME=evil_db');
}, /Manipulative query parameter detected: "DBNAME"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?database=evil_db');
}, /Manipulative query parameter detected: "database"/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?sslmode=require');
}, /Unexpected query parameters detected/);

assert.throws(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci#targetFragment');
}, /URL fragment identifier detected/);

console.log('✓ Group F: Query parameter (hostaddr, case-insensitive) and URL-fragment rejection PASSED.');

// ----------------------------------------------------------------------------
// Group G: Accepted Disposable Localhost Connection
// ----------------------------------------------------------------------------
assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgres://postgres:disposable_pass@localhost:5432/test_workforce_ci');
}, 'Should accept valid postgres URL on localhost:5432');

assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgresql://postgres:disposable_pass@127.0.0.1:5432/test_workforce_ci');
}, 'Should accept valid postgresql URL on 127.0.0.1:5432');

assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('postgresql://authenticator:auth_pass@localhost:5432/test_workforce_ci');
}, 'Should accept valid authenticator URL on localhost:5432');

// Protocol case-insensitivity validation
assert.doesNotThrow(() => {
  assertDisposableDatabaseTarget('POSTGRESQL://postgres:disposable_pass@localhost:5432/test_workforce_ci');
}, 'Should accept uppercase POSTGRESQL protocol on localhost:5432');

// Restore original env
if (originalDirectUrl) {
  process.env.WORKFORCE_DATABASE_DIRECT_URL = originalDirectUrl;
} else {
  delete process.env.WORKFORCE_DATABASE_DIRECT_URL;
}

console.log('✓ Group G: Accepted disposable localhost connections PASSED.');
console.log('======================================================================');
console.log('All enumerated guard assertions passed.');
console.log('======================================================================');
