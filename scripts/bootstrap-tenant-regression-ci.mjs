#!/usr/bin/env node
/**
 * scripts/bootstrap-tenant-regression-ci.mjs
 * BWM Phase 6.1N.7.6R — Disposable PostgreSQL Bootstrap for Tenant Operational Regression
 *
 * Directives:
 * 1. Connects ONLY to authorized disposable CI PostgreSQL container (test_workforce_ci on localhost:5432).
 * 2. Pre-validates target using shared assertDisposableDatabaseTarget (strict WHATWG URL guard).
 * 3. Applies verified_domain_registry DDL from workforce-billing-schema.sql.
 * 4. Applies canonical pre-Migration-002 workforce_webhook_inbox schema with 100% fidelity.
 * 5. Applies official migrations in sequence:
 *    - 002_enforce_tenant_not_null.sql
 *    - 003_create_workforce_payment_registry.sql
 *    - 004_enforce_payment_registry_immutability.sql
 *    - 005_tighten_registry_immutability_and_amount.sql
 *    - 006_enforce_bound_transaction_reference.sql
 * 6. Verifies constraints and immutability trigger on workforce_staging.workforce_payment_registry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { assertDisposableDatabaseTarget } from './disposable-database-guard.mjs';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.resolve(rootDir, 'packages', 'workforce-billing', 'schema', 'migrations');

export async function bootstrapTenantRegressionDatabase(customConnStr = null) {
  const connectionString =
    customConnStr ||
    process.env.DISPOSABLE_POSTGRES_URL ||
    process.env.WORKFORCE_DATABASE_DIRECT_URL ||
    '';

  console.log('======================================================================');
  console.log('BWM DISPOSABLE BOOTSTRAP: TENANT OPERATIONAL REGRESSION SCHEMA');
  console.log('======================================================================');

  // Strict disposable database guard
  assertDisposableDatabaseTarget(connectionString);
  console.log('✓ Disposable target guard PASSED (strictly localhost:5432/test_workforce_ci).');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 1. Enable UUID Extension & Create Schema
    console.log('\n--- Step 1: Initializing Schema & Extensions ---');
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS workforce_staging;`);
    console.log('✓ Extension uuid-ossp and schema workforce_staging ensured.');

    // 2. DDL for verified_domain_registry (workforce-billing-schema.sql lines 281-293)
    console.log('\n--- Step 2: Creating verified_domain_registry ---');
    await client.query(`
      CREATE TABLE IF NOT EXISTS workforce_staging.verified_domain_registry (
          domain_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tenant_id VARCHAR(64) NOT NULL,
          hostname VARCHAR(255) UNIQUE NOT NULL,
          brand_name VARCHAR(128) NOT NULL,
          logo_url TEXT,
          primary_color VARCHAR(32) NOT NULL DEFAULT '#059669',
          accent_color VARCHAR(32) NOT NULL DEFAULT '#0d9488',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_verified_domain_registry_hostname
      ON workforce_staging.verified_domain_registry(hostname, is_active);
    `);
    console.log('✓ Table workforce_staging.verified_domain_registry created.');

    // 3. DDL for workforce_webhook_inbox (Authoritative pre-Migration-002 schema with 100% column/type fidelity)
    console.log('\n--- Step 3: Creating canonical workforce_webhook_inbox (pre-002) ---');
    await client.query(`
      CREATE TABLE IF NOT EXISTS workforce_staging.workforce_webhook_inbox (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          provider VARCHAR(32) NOT NULL,
          event_id VARCHAR(128) NOT NULL,
          idempotency_key VARCHAR(256) UNIQUE NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          tenant_id VARCHAR(64),
          raw_payload JSONB NOT NULL,
          headers JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
          retry_count INT NOT NULL DEFAULT 0,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          processed_at TIMESTAMPTZ,
          error_message TEXT,
          CONSTRAINT uq_workforce_webhook_provider_event UNIQUE (provider, event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_idempotency
      ON workforce_staging.workforce_webhook_inbox(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_status
      ON workforce_staging.workforce_webhook_inbox(status);
    `);
    console.log('✓ Table workforce_staging.workforce_webhook_inbox created with canonical columns, constraints, and indexes.');

    // 4. Execute Migrations 002 -> 006
    console.log('\n--- Step 4: Applying Migrations 002 through 006 ---');
    const migrationFiles = [
      '002_enforce_tenant_not_null.sql',
      '003_create_workforce_payment_registry.sql',
      '004_enforce_payment_registry_immutability.sql',
      '005_tighten_registry_immutability_and_amount.sql',
      '006_enforce_bound_transaction_reference.sql',
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file missing: ${filePath}`);
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`✓ Applied migration: ${file}`);
    }

    // 5. Verification of Constraints & Triggers
    console.log('\n--- Step 5: Constraint & Immutability Verification ---');

    // Verify verified_domain_registry exists
    const domainTbl = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'workforce_staging' AND table_name = 'verified_domain_registry';
    `);
    if (domainTbl.rows.length === 0) {
      throw new Error('Verification failed: workforce_staging.verified_domain_registry missing');
    }

    // Verify workforce_payment_registry exists
    const payTbl = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'workforce_staging' AND table_name = 'workforce_payment_registry';
    `);
    if (payTbl.rows.length === 0) {
      throw new Error('Verification failed: workforce_staging.workforce_payment_registry missing');
    }

    // Verify chk_payment_registry_bound_has_valid_tx constraint
    const chkBound = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'chk_payment_registry_bound_has_valid_tx';
    `);
    if (chkBound.rows.length === 0) {
      throw new Error('Verification failed: constraint chk_payment_registry_bound_has_valid_tx missing');
    }

    // Verify chk_payment_registry_positive_amount constraint
    const chkAmount = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'chk_payment_registry_positive_amount';
    `);
    if (chkAmount.rows.length === 0) {
      throw new Error('Verification failed: constraint chk_payment_registry_positive_amount missing');
    }

    // Verify trg_payment_registry_immutability trigger
    const trg = await client.query(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_schema = 'workforce_staging'
        AND event_object_table = 'workforce_payment_registry'
        AND trigger_name = 'trg_payment_registry_immutability';
    `);
    if (trg.rows.length === 0) {
      throw new Error('Verification failed: trigger trg_payment_registry_immutability missing');
    }

    console.log('✓ All tables, constraints, and triggers verified on workforce_staging.');
    console.log('======================================================================');
    console.log('TENANT REGRESSION DISPOSABLE BOOTSTRAP COMPLETE — 100% READY FOR JEST');
    console.log('======================================================================');
  } finally {
    await client.end();
  }
}

const isMainModule = () => {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url).toLowerCase();
    const executedFilePath = path.resolve(process.argv[1]).toLowerCase();
    return currentFilePath === executedFilePath;
  } catch {
    return process.argv[1]?.includes('bootstrap-tenant-regression-ci');
  }
};

if (isMainModule()) {
  bootstrapTenantRegressionDatabase().catch((err) => {
    console.error('\n[BOOTSTRAP FAILED]', err);
    process.exit(1);
  });
}
