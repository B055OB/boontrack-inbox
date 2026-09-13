import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local if present
try {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch { }

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mpluzajlzpregmjwpjqr.supabase.co';

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface TenantAuditReport {
  id: string;
  slug: string;
  name: string;
  category: string;
  resolvedBusinessType: string;
  capabilities: {
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    [key: string]: any;
  };
  needsHealing: boolean;
  recommendedVertical: string;
  reason: string;
}

export async function auditAndHealTenants(autoHeal: boolean = true) {
  console.log('===============================================================');
  console.log('🔍 BOONTRACK TENANTS VERTICAL AUDIT & AUTO-HEALING ENGINE');
  console.log('===============================================================\n');

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, name, slug, category, tier, status, metadata');

  if (error) {
    console.error('❌ Error querying tenants:', error);
    process.exit(1);
  }

  if (!tenants || tenants.length === 0) {
    console.log('ℹ️ No tenants found in database.');
    return;
  }

  console.log(`📊 Found ${tenants.length} tenants in Supabase database.\n`);

  const reports: TenantAuditReport[] = [];
  const healQueue: Array<{
    id: string;
    slug: string;
    name: string;
    newCategory: string;
    newBusinessType: string;
    newCapabilities: any;
    reason: string;
  }> = [];

  for (const t of tenants) {
    const meta = (t.metadata as Record<string, any>) || {};
    const slug = (t.slug || '').toLowerCase();
    const name = (t.name || '').toLowerCase();
    const currentCategory = (t.category || '').toUpperCase();
    const currentBusinessType = (
      meta.business_type ||
      meta.vertical_type ||
      currentCategory ||
      'PHYSICAL'
    ).toUpperCase();

    const capabilities = meta.capabilities || {};
    const bio = (meta.bio || '').toLowerCase();
    const businessCategory = (meta.business_category || '').toLowerCase();
    const products = Array.isArray(meta.products) ? meta.products : [];

    // Analyze if tenant is Dakwah, Digital, Service, or Physical
    const isDakwah =
      slug.includes('budi') ||
      slug.includes('kajian') ||
      slug.includes('dakwah') ||
      name.includes('budi') ||
      name.includes('kajian') ||
      name.includes('dakwah') ||
      businessCategory.includes('dakwah') ||
      bio.includes('kajian') ||
      bio.includes('sholawat') ||
      bio.includes('riyadhoh');

    const isDigital =
      isDakwah ||
      slug.includes('onlineboost') ||
      slug.includes('cpm') ||
      slug.includes('course') ||
      slug.includes('suhu') ||
      name.includes('boost') ||
      name.includes('masterclass') ||
      products.some((p: any) => p.category === 'DIGITAL' || p.download_url || p.digital_data);

    const isFieldService =
      slug.includes('toren') ||
      slug.includes('teknisi') ||
      slug.includes('servis') ||
      slug.includes('cleaning') ||
      name.includes('toren') ||
      name.includes('ac') ||
      name.includes('kuras');

    const isProService =
      slug.includes('travel') ||
      slug.includes('umroh') ||
      slug.includes('tour') ||
      slug.includes('konsultan') ||
      slug.includes('legal') ||
      name.includes('travel') ||
      name.includes('umroh') ||
      name.includes('konsultan');

    let recommendedVertical = 'PHYSICAL';
    let reason = 'Default physical retail';
    let needsHealing = false;

    if (isDakwah) {
      recommendedVertical = 'DIGITAL';
      reason = 'Konten dakwah, bimbingan online & infaq (non-fisik)';
      if (
        currentBusinessType === 'PHYSICAL' ||
        currentCategory === 'PHYSICAL' ||
        capabilities.shipping === true ||
        !capabilities.digital_fulfillment
      ) {
        needsHealing = true;
      }
    } else if (isDigital) {
      recommendedVertical = 'DIGITAL';
      reason = 'Produk digital / lisensi / e-course (non-fisik)';
      if (
        currentBusinessType === 'PHYSICAL' ||
        currentCategory === 'PHYSICAL' ||
        capabilities.shipping === true ||
        !capabilities.digital_fulfillment
      ) {
        needsHealing = true;
      }
    } else if (isFieldService) {
      recommendedVertical = 'FIELD_SERVICE';
      reason = 'Jasa teknisi kunjungan / lapangan (booking jadwal)';
      if (
        currentBusinessType === 'PHYSICAL' ||
        currentCategory === 'PHYSICAL' ||
        capabilities.shipping === true ||
        !capabilities.booking
      ) {
        needsHealing = true;
      }
    } else if (isProService) {
      recommendedVertical = 'PROFESSIONAL_SERVICE';
      reason = 'Jasa profesional, travel, atau konsultasi (jadwal/seat)';
      if (
        currentBusinessType === 'PHYSICAL' ||
        currentCategory === 'PHYSICAL' ||
        capabilities.shipping === true ||
        !capabilities.booking
      ) {
        needsHealing = true;
      }
    }

    reports.push({
      id: t.id,
      slug: t.slug,
      name: t.name || t.slug,
      category: t.category,
      resolvedBusinessType: currentBusinessType,
      capabilities,
      needsHealing,
      recommendedVertical,
      reason,
    });

    if (needsHealing) {
      const newCapabilities = {
        ...capabilities,
        shipping: false,
        booking: recommendedVertical === 'FIELD_SERVICE' || recommendedVertical === 'PROFESSIONAL_SERVICE' || isDakwah,
        digital_fulfillment: recommendedVertical === 'DIGITAL' || isDakwah,
      };

      healQueue.push({
        id: t.id,
        slug: t.slug,
        name: t.name,
        newCategory: recommendedVertical,
        newBusinessType: recommendedVertical,
        newCapabilities,
        reason,
      });
    }
  }

  // Print Summary Table
  console.log('📋 AUDIT TENANT LIST:');
  console.log('-----------------------------------------------------------------------------------------------------------------');
  console.log(
    'Slug'.padEnd(20) +
    'Category'.padEnd(16) +
    'Vertical'.padEnd(20) +
    'Shipping'.padEnd(12) +
    'Booking'.padEnd(10) +
    'Status'
  );
  console.log('-----------------------------------------------------------------------------------------------------------------');

  for (const r of reports) {
    const statusStr = r.needsHealing ? '⚠️ MISCONFIGURED' : '✅ HEALTHY';
    console.log(
      r.slug.padEnd(20) +
      (r.category || '-').padEnd(16) +
      r.resolvedBusinessType.padEnd(20) +
      String(r.capabilities.shipping ?? '-').padEnd(12) +
      String(r.capabilities.booking ?? '-').padEnd(10) +
      statusStr
    );
  }
  console.log('-----------------------------------------------------------------------------------------------------------------\n');

  if (healQueue.length === 0) {
    console.log('🎉 Semua tenant sudah sinkron dengan vertikal masing-masing (Zero Healing Needed).');
    return;
  }

  console.log(`🚨 Ditemukan ${healQueue.length} tenant yang membutuhkan penyesuaian:`);
  healQueue.forEach((h, i) => {
    console.log(`   ${i + 1}. [${h.slug}] ${h.name} ➔ ${h.newBusinessType} (${h.reason})`);
  });
  console.log('');

  if (autoHeal) {
    console.log('🔧 Menjalankan Auto-Healing...');
    for (const h of healQueue) {
      // Fetch fresh metadata
      const { data: current } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', h.slug)
        .single();

      const freshMeta = (current?.metadata as Record<string, any>) || {};

      // Invalidate old physical proposal if present
      let updatedProposal = freshMeta.boonpilot_proposal;
      if (updatedProposal && updatedProposal.template_code === 'PHYSICAL') {
        updatedProposal = {
          ...updatedProposal,
          template_code: h.newBusinessType,
          fulfillment_rules: {
            requires_shipping: false,
            instant_couriers_enabled: false,
            digital_delivery_type: 'DOWNLOAD_LINK',
          },
        };
      }

      const updatedMeta = {
        ...freshMeta,
        business_type: h.newBusinessType,
        vertical_type: h.newBusinessType,
        capabilities: h.newCapabilities,
        boonpilot_proposal: updatedProposal || null,
        boonpilot_configuration: updatedProposal || null,
      };

      const { error: healErr } = await supabase
        .from('tenants')
        .update({
          category: h.newCategory,
          metadata: updatedMeta,
        })
        .eq('slug', h.slug);

      if (healErr) {
        console.error(`   ❌ Gagal update tenant ${h.slug}:`, healErr.message);
      } else {
        console.log(`   ✅ Tenant [${h.slug}] berhasil di-heal ➔ category=${h.newCategory}, shipping=false`);
      }
    }

    console.log('\n✨ Auto-healing selesai dengan sukses!\n');
  }
}

// Execute if run directly
if (require.main === module) {
  auditAndHealTenants(true).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
