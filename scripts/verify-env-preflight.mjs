import fs from 'fs';
import path from 'path';

/**
 * BoonTrack Preflight Environment & Storage Configuration Validator
 * Enforces strict presence and format of critical storage & database configurations
 * to prevent production regressions and TLS/SSL handshake failures.
 */

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        // Strip surrounding quotes
        val = val.replace(/^["']|["']$/g, '');
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function resolveEnv() {
  const root = process.cwd();
  const envLocal = loadEnvFile(path.join(root, '.env.local'));
  const envProd = loadEnvFile(path.join(root, '.env.production'));
  const envBase = loadEnvFile(path.join(root, '.env'));

  // Precedence: process.env > .env.local > .env.production > .env
  const combined = {
    ...envBase,
    ...envProd,
    ...envLocal,
  };

  // Overwrite with actual process.env if present and non-empty
  for (const [k, v] of Object.entries(process.env)) {
    if (v && v.trim() !== '') {
      combined[k] = v.trim().replace(/^["']|["']$/g, '');
    }
  }

  return combined;
}

export function runPreflightChecks(env = resolveEnv()) {
  const errors = [];
  const warnings = [];

  console.log('\n=============================================================');
  console.log('   🔍 BOONTRACK PREFLIGHT GUARD: STORAGE & ENVIRONMENT CHECK');
  console.log('=============================================================\n');

  // 1. R2_ACCOUNT_ID
  const accountId = (env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!accountId) {
    errors.push({
      field: 'R2_ACCOUNT_ID',
      message: 'R2_ACCOUNT_ID wajib didefinisikan (32 karakter hex).',
      fix: 'Tambahkan R2_ACCOUNT_ID="<your_cloudflare_account_id>" ke environment Vercel dan file .env.',
    });
  } else if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    errors.push({
      field: 'R2_ACCOUNT_ID',
      message: `Format R2_ACCOUNT_ID tidak valid ('${accountId}'). Wajib berupa 32 karakter hexadecimal.`,
      fix: 'Periksa Cloudflare Dashboard > Overview > Account ID.',
    });
  }

  // 2. R2_ENDPOINT_URL / R2_ENDPOINT
  const endpoint = (env.R2_ENDPOINT_URL || env.R2_ENDPOINT || env.S3_ENDPOINT || '').trim();
  if (!endpoint) {
    errors.push({
      field: 'R2_ENDPOINT_URL',
      message: 'R2_ENDPOINT_URL wajib didefinisikan.',
      fix: 'Set R2_ENDPOINT_URL="https://<ACCOUNT_ID>.r2.cloudflarestorage.com".',
    });
  } else {
    try {
      const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
      const host = url.hostname.toLowerCase();

      // Guard bare r2.cloudflarestorage.com without account subdomain
      if (host === 'r2.cloudflarestorage.com') {
        errors.push({
          field: 'R2_ENDPOINT_URL',
          message: `R2_ENDPOINT_URL tidak boleh berupa domain generic '${host}' karena tidak memiliki SSL certificate yang valid.`,
          fix: `Gunakan format https://${accountId || '<ACCOUNT_ID>'}.r2.cloudflarestorage.com`,
        });
      } else if (host.includes('boontrack.com') || host.includes('r2.dev')) {
        errors.push({
          field: 'R2_ENDPOINT_URL',
          message: `R2_ENDPOINT_URL tidak boleh menggunakan custom domain/CDN ('${host}'). Wajib endpoint S3 API resmi Cloudflare R2.`,
          fix: `Gunakan format https://${accountId || '<ACCOUNT_ID>'}.r2.cloudflarestorage.com`,
        });
      } else if (!host.endsWith('.r2.cloudflarestorage.com')) {
        errors.push({
          field: 'R2_ENDPOINT_URL',
          message: `Hostname R2_ENDPOINT_URL ('${host}') harus berakhiran .r2.cloudflarestorage.com`,
          fix: `Gunakan format https://${accountId || '<ACCOUNT_ID>'}.r2.cloudflarestorage.com`,
        });
      } else if (accountId && !host.includes(accountId.toLowerCase())) {
        warnings.push({
          field: 'R2_ENDPOINT_URL',
          message: `Hostname '${host}' tidak menyertakan Account ID '${accountId}'. Ini dapat menyebabkan kegagalan autentikasi S3.`,
        });
      }
    } catch {
      errors.push({
        field: 'R2_ENDPOINT_URL',
        message: `Format R2_ENDPOINT_URL tidak valid ('${endpoint}').`,
        fix: 'Pastikan URL valid berawalan https://.',
      });
    }
  }

  // 3. R2 Credentials & Bucket
  const accessKeyId = (env.R2_ACCESS_KEY_ID || env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
  if (!accessKeyId) {
    errors.push({
      field: 'R2_ACCESS_KEY_ID',
      message: 'R2_ACCESS_KEY_ID wajib diatur untuk upload gambar ke cloud storage.',
      fix: 'Buat R2 API Token dengan izin Object Read & Write di Cloudflare Dashboard.',
    });
  }

  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '').trim();
  if (!secretAccessKey) {
    errors.push({
      field: 'R2_SECRET_ACCESS_KEY',
      message: 'R2_SECRET_ACCESS_KEY wajib diatur.',
      fix: 'Set R2_SECRET_ACCESS_KEY dari API Token Cloudflare R2.',
    });
  }

  const bucketName = (env.R2_BUCKET_NAME || '').trim();
  if (!bucketName) {
    warnings.push({
      field: 'R2_BUCKET_NAME',
      message: "R2_BUCKET_NAME tidak diset. Akan menggunakan fallback default 'boontrack-media'.",
    });
  }

  // 4. Supabase Storage & Database
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!supabaseUrl) {
    errors.push({
      field: 'NEXT_PUBLIC_SUPABASE_URL',
      message: 'NEXT_PUBLIC_SUPABASE_URL wajib diatur untuk database tenant dan failover storage.',
      fix: 'Set NEXT_PUBLIC_SUPABASE_URL="https://<project_id>.supabase.co".',
    });
  } else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('supabase.co')) {
    errors.push({
      field: 'NEXT_PUBLIC_SUPABASE_URL',
      message: `NEXT_PUBLIC_SUPABASE_URL ('${supabaseUrl}') tidak valid. Wajib HTTPS dan berdomain supabase.co.`,
      fix: 'Periksa URL proyek di Supabase Project Settings > API.',
    });
  }

  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!serviceKey && !anonKey) {
    errors.push({
      field: 'SUPABASE_KEYS',
      message: 'Setidaknya satu dari SUPABASE_SERVICE_ROLE_KEY atau NEXT_PUBLIC_SUPABASE_ANON_KEY wajib ada.',
      fix: 'Tambahkan kunci API Supabase ke environment variables.',
    });
  }

  // Output Report
  if (warnings.length > 0) {
    console.log('⚠️  PERINGATAN KONFIGURASI:');
    for (const w of warnings) {
      console.log(`   - [${w.field}]: ${w.message}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    const isPreviewOrCi =
      (env.VERCEL_ENV || process.env.VERCEL_ENV) === 'preview' ||
      (env.CI || process.env.CI) === 'true' ||
      (env.CI || process.env.CI) === '1';

    if (isPreviewOrCi) {
      console.warn('⚠️  [PREVIEW / CI ENVIRONMENT GUARD]');
      console.warn('    Ditemukan ketidaklengkapan variabel storage/environment, namun dilewati sebagai WARNING');
      console.warn('    karena berjalan pada lingkungan non-production (VERCEL_ENV=preview / CI).\n');
      for (const err of errors) {
        console.warn(`   • [NON-BLOCKING] Field : ${err.field}`);
        console.warn(`     Pesan                : ${err.message}`);
        if (err.fix) {
          console.warn(`     Solusi               : ${err.fix}`);
        }
      }
      console.warn('\n✅ Build dilanjutkan untuk Preview / CI deployment.\n');
      return true;
    }

    console.error('❌ GAGAL: Ditemukan kesalahan konfigurasi kritis pada environment:');
    for (const err of errors) {
      console.error(`\n   • Field : ${err.field}`);
      console.error(`     Pesan : ${err.message}`);
      if (err.fix) {
        console.error(`     Solusi: ${err.fix}`);
      }
    }
    console.error('\n🚫 Build dibatalkan untuk mencegah regresi ke live production.\n');
    return false;
  }

  console.log('✅ SEMUA VARIABEL KRITIS TERVERIFIKASI DENGAN SUKSES:');
  console.log(`   • R2 Account ID      : ${accountId.substring(0, 8)}... (${accountId.length} hex)`);
  console.log(`   • R2 Endpoint        : ${endpoint}`);
  console.log(`   • R2 Bucket          : ${bucketName || 'boontrack-media'}`);
  console.log(`   • Supabase URL       : ${supabaseUrl}`);
  console.log(`   • Storage Failover   : READY (store-assets bucket backed)\n`);
  console.log('=============================================================\n');
  return true;
}

import { fileURLToPath } from 'url';

// Standalone execution
const currentFilePath = fileURLToPath(import.meta.url).toLowerCase();
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';

if (currentFilePath === executedFilePath) {
  const isOk = runPreflightChecks();
  if (!isOk) {
    process.exit(1);
  }
}
