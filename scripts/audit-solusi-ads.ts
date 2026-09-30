import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Helper: Parse .env manually without external dependency
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function runAudit() {
  console.log('============================================================');
  console.log('🔍 AUDIT PREVENTIF (READ-ONLY): TENANT "solusi-ads" & HP 8975869998');
  console.log('============================================================');

  let foundTenantId: string | null = null;
  let foundTenantSlug: string | null = null;
  let foundTenantName: string | null = null;
  let foundTenantTier: string | null = null;
  let foundTenantStatus: string | null = null;

  // ------------------------------------------------------------
  // 1. INSPEKSI TABEL tenants
  // ------------------------------------------------------------
  console.log('\n--- [1] INSPEKSI TABEL tenants ---');
  
  // 1a. Query by slug
  const { data: tenantBySlug, error: errSlug } = await supabase
    .from('tenants')
    .select('id, name, slug, tier, status, is_active, trial_ends_at, subscription_ends_at, metadata, created_at')
    .eq('slug', 'solusi-ads');

  if (errSlug) {
    console.error('Error querying tenants by slug:', errSlug.message);
  } else if (tenantBySlug && tenantBySlug.length > 0) {
    console.log(`[FOUND by slug='solusi-ads']: ${tenantBySlug.length} record(s)`);
    for (const t of tenantBySlug) {
      foundTenantId = t.id;
      foundTenantSlug = t.slug;
      foundTenantName = t.name;
      foundTenantTier = t.tier;
      foundTenantStatus = t.status;
      console.log(`  - ID: ${t.id}`);
      console.log(`  - Name: ${t.name}`);
      console.log(`  - Slug: ${t.slug}`);
      console.log(`  - Tier: ${t.tier}`);
      console.log(`  - Status: ${t.status} (is_active: ${t.is_active})`);
      console.log(`  - Trial Ends At: ${t.trial_ends_at}`);
      console.log(`  - Sub Ends At: ${t.subscription_ends_at}`);
      console.log(`  - Created At: ${t.created_at}`);
      console.log(`  - Metadata keys: ${Object.keys(t.metadata || {}).join(', ')}`);
      const meta = t.metadata || {};
      const phoneInMeta = meta.phone || meta.whatsapp || meta.phone_number || meta.whatsapp_number;
      if (phoneInMeta) console.log(`  - Phone in metadata: ${phoneInMeta}`);
    }
  } else {
    console.log("[NOT FOUND] Tidak ditemukan tenant dengan slug = 'solusi-ads'");
  }

  // 1b. Query by phone in metadata or columns across all tenants
  const { data: allTenants, error: errAll } = await supabase
    .from('tenants')
    .select('id, name, slug, tier, status, is_active, metadata, created_at');

  if (errAll) {
    console.error('Error fetching tenants list:', errAll.message);
  } else if (allTenants) {
    const matchedByPhone = allTenants.filter((t) => {
      const metaStr = JSON.stringify(t.metadata || '');
      const nameStr = String(t.name || '');
      const slugStr = String(t.slug || '');
      return (
        metaStr.includes('8975869998') ||
        nameStr.includes('8975869998') ||
        slugStr.includes('8975869998') ||
        metaStr.toLowerCase().includes('solusi-ads')
      );
    });

    if (matchedByPhone.length > 0) {
      console.log(`\n[MATCH by Phone/Substring in tenants]: ${matchedByPhone.length} record(s)`);
      for (const t of matchedByPhone) {
        if (!foundTenantId) {
          foundTenantId = t.id;
          foundTenantSlug = t.slug;
          foundTenantName = t.name;
          foundTenantTier = t.tier;
          foundTenantStatus = t.status;
        }
        console.log(`  - ID: ${t.id} | Slug: ${t.slug} | Name: ${t.name} | Tier: ${t.tier} | Status: ${t.status}`);
      }
    } else {
      console.log("[NOT FOUND] Tidak ditemukan tenant lain yang mengandung nomor '8975869998' di metadata");
    }
  }

  // ------------------------------------------------------------
  // 2. INSPEKSI TABEL whatsapp_connections
  // ------------------------------------------------------------
  console.log('\n--- [2] INSPEKSI TABEL whatsapp_connections ---');
  const targetTenantId = foundTenantId;

  const { data: waConns, error: errWa } = await supabase
    .from('whatsapp_connections')
    .select('id, tenant_id, tenant_slug, phone_number, instance_name, status, is_connected, channel_type, provider, created_at');

  let matchedWaConnections: any[] = [];
  if (errWa) {
    console.error('Error querying whatsapp_connections:', errWa.message);
  } else if (waConns) {
    matchedWaConnections = waConns.filter((w) => {
      const p = String(w.phone_number || '');
      const inst = String(w.instance_name || '');
      const tSlug = String(w.tenant_slug || '');
      const tId = String(w.tenant_id || '');
      return (
        p.includes('8975869998') ||
        inst.toLowerCase().includes('solusi-ads') ||
        tSlug.toLowerCase().includes('solusi-ads') ||
        (targetTenantId && tId === targetTenantId)
      );
    });

    if (matchedWaConnections.length > 0) {
      console.log(`[FOUND in whatsapp_connections]: ${matchedWaConnections.length} record(s)`);
      for (const w of matchedWaConnections) {
        console.log(`  - ID: ${w.id}`);
        console.log(`  - Tenant ID: ${w.tenant_id} | Slug: ${w.tenant_slug}`);
        console.log(`  - Phone: ${w.phone_number}`);
        console.log(`  - Instance Name: ${w.instance_name}`);
        console.log(`  - Status: ${w.status} | is_connected: ${w.is_connected}`);
        console.log(`  - Provider/Channel: ${w.provider} / ${w.channel_type}`);
        console.log(`  - Created At: ${w.created_at}`);
      }
    } else {
      console.log("[NOT FOUND] Tidak ditemukan koneksi WhatsApp untuk nomor '8975869998' atau instance 'solusi-ads'");
    }
  }

  // ------------------------------------------------------------
  // 3. INSPEKSI TABEL products
  // ------------------------------------------------------------
  console.log('\n--- [3] INSPEKSI TABEL products ---');
  let productsCount = 0;

  // Query products table if tenant_slug exists
  const { data: prodsBySlug, error: errProdsSlug } = await supabase
    .from('products')
    .select('id, tenant_slug, name, sku, price, is_active')
    .eq('tenant_slug', 'solusi-ads');

  if (!errProdsSlug && prodsBySlug && prodsBySlug.length > 0) {
    productsCount += prodsBySlug.length;
    console.log(`[FOUND in products by tenant_slug='solusi-ads']: ${prodsBySlug.length} item(s)`);
    for (const p of prodsBySlug) {
      console.log(`  - ID: ${p.id} | Name: ${p.name} | SKU: ${p.sku} | Price: ${p.price} | Active: ${p.is_active}`);
    }
  }

  if (targetTenantId) {
    const { data: prodsById, error: errProdsId } = await supabase
      .from('products')
      .select('id, name, sku, price, is_active')
      .eq('tenant_id', targetTenantId);

    if (!errProdsId && prodsById && prodsById.length > 0) {
      const unique = prodsById.filter((p) => !prodsBySlug?.some((sp) => sp.id === p.id));
      if (unique.length > 0) {
        productsCount += unique.length;
        console.log(`[FOUND in products by tenant_id='${targetTenantId}']: ${unique.length} item(s)`);
        for (const p of unique) {
          console.log(`  - ID: ${p.id} | Name: ${p.name} | SKU: ${p.sku} | Price: ${p.price}`);
        }
      }
    }
  }

  // Also check if products are stored in tenant metadata.products
  if (tenantBySlug && tenantBySlug.length > 0) {
    const metaProds = tenantBySlug[0].metadata?.products || [];
    if (Array.isArray(metaProds) && metaProds.length > 0) {
      console.log(`[FOUND in tenants.metadata.products]: ${metaProds.length} product(s) in JSON metadata`);
      for (const p of metaProds) {
        console.log(`  - SKU: ${p.sku || 'N/A'} | Name: ${p.name || p.title} | Price: ${p.price}`);
      }
    }
  }

  if (productsCount === 0) {
    console.log("[NOT FOUND] Tidak ada produk di tabel 'products' untuk 'solusi-ads'");
  }

  // ------------------------------------------------------------
  // 4. INSPEKSI TABEL ai_knowledge / bot_profiles
  // ------------------------------------------------------------
  console.log('\n--- [4] INSPEKSI TABEL ai_knowledge / bot_profiles ---');
  
  // 4a. Cek tabel ai_knowledge jika ada
  try {
    const { data: aiK, error: errAiK } = await supabase
      .from('ai_knowledge')
      .select('*')
      .or(`tenant_slug.eq.solusi-ads${targetTenantId ? `,tenant_id.eq.${targetTenantId}` : ''}`);

    if (errAiK) {
      console.log(`  - Tabel 'ai_knowledge': ${errAiK.message}`);
    } else if (aiK && aiK.length > 0) {
      console.log(`[FOUND in ai_knowledge]: ${aiK.length} record(s)`);
      for (const k of aiK) {
        console.log(`  - ID: ${k.id} | Topic: ${k.topic || k.title || 'N/A'}`);
      }
    } else {
      console.log("  - Tabel 'ai_knowledge': Kosong untuk 'solusi-ads'");
    }
  } catch (e: any) {
    console.log(`  - Tabel 'ai_knowledge' exception: ${e.message}`);
  }

  // 4b. Cek tabel bot_profiles
  try {
    const { data: botProf, error: errBot } = await supabase
      .from('bot_profiles')
      .select('id, tenant_slug, persona_name, tone, system_prompt, knowledge_scope')
      .eq('tenant_slug', 'solusi-ads');

    if (errBot) {
      console.log(`  - Tabel 'bot_profiles': ${errBot.message}`);
    } else if (botProf && botProf.length > 0) {
      console.log(`[FOUND in bot_profiles]: ${botProf.length} record(s)`);
      for (const bp of botProf) {
        console.log(`  - ID: ${bp.id} | Persona: ${bp.persona_name} | Tone: ${bp.tone}`);
        console.log(`  - System prompt preview: ${String(bp.system_prompt).slice(0, 80)}...`);
      }
    } else {
      console.log("  - Tabel 'bot_profiles': Kosong untuk 'solusi-ads'");
    }
  } catch (e: any) {
    console.log(`  - Tabel 'bot_profiles' exception: ${e.message}`);
  }

  // ------------------------------------------------------------
  // 5. INSPEKSI TABEL single_page_config (jika ada)
  // ------------------------------------------------------------
  console.log('\n--- [5] INSPEKSI TABEL single_page_config ---');
  try {
    const { data: spc, error: errSpc } = await supabase
      .from('single_page_config')
      .select('*')
      .or(`tenant_slug.eq.solusi-ads${targetTenantId ? `,tenant_id.eq.${targetTenantId}` : ''}`);

    if (errSpc) {
      console.log(`  - Tabel 'single_page_config': ${errSpc.message}`);
    } else if (spc && spc.length > 0) {
      console.log(`[FOUND in single_page_config]: ${spc.length} record(s)`);
      for (const c of spc) {
        console.log(`  - ID: ${c.id} | Config keys: ${Object.keys(c).join(', ')}`);
      }
    } else {
      console.log("  - Tabel 'single_page_config': Kosong untuk 'solusi-ads'");
    }
  } catch (e: any) {
    console.log(`  - Tabel 'single_page_config' exception: ${e.message}`);
  }

  // Cek juga di metadata tenant jika ada konfigurasi single_page
  if (tenantBySlug && tenantBySlug.length > 0) {
    const meta = tenantBySlug[0].metadata || {};
    if (meta.single_page || meta.single_page_builder || meta.single_page_config) {
      console.log('  - [FOUND in tenants.metadata]: single_page config tersimpan di metadata');
    }
  }

  // ------------------------------------------------------------
  // RINGKASAN AKHIR
  // ------------------------------------------------------------
  console.log('\n============================================================');
  console.log('📋 RINGKASAN AUDIT PREVENTIF');
  console.log('============================================================');
  if (foundTenantId) {
    console.log(`STATUS: TENANT SUDAH ADA (EXISTING)`);
    console.log(`  - UUID (id)     : ${foundTenantId}`);
    console.log(`  - Name          : ${foundTenantName}`);
    console.log(`  - Slug          : ${foundTenantSlug}`);
    console.log(`  - Tier          : ${foundTenantTier}`);
    console.log(`  - Status DB     : ${foundTenantStatus}`);
    if (matchedWaConnections.length > 0) {
      const wa = matchedWaConnections[0];
      console.log(`  - WhatsApp Conn : ${wa.status} (is_connected: ${wa.is_connected}, instance: ${wa.instance_name})`);
    } else {
      console.log(`  - WhatsApp Conn : BELUM ADA KONEKSI TERDAFTAR`);
    }
  } else {
    console.log(`STATUS: TENANT MASIH KOSONG / BELUM TERDAFTAR`);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
