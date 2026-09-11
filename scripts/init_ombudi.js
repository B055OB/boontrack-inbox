require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initOmBudiTenant() {
  console.log('🔄 Memulai inisialisasi tenant Om Budi...');

  const tenantPayload = {
    slug: 'ombudi',
    name: 'Om Budi',
    tier: 'ENTERPRISE', // PostgreSQL enum tenant_tier_enum accepts 'ENTERPRISE', which resolves to TEAM_SCALE
    category: 'community',
    is_active: true,
    status: 'active',
    metadata: {
      plan_tier: 'TEAM_SCALE',
      tier: 'TEAM_SCALE',
      bot_mode: 'STATIC',
      business_category: 'COMMUNITY_DAKWAH',
      features: {
        has_capi: true,
        has_reader: true,
        ads_tracking: true,
        multi_cs: true,
        tier: 'TEAM_SCALE',
      },
      interactive_menus: [
        {
          id: 'menu_mood_booster',
          trigger: 'mood booster',
          trigger_keyword: 'mood booster',
          header_text: 'Pilih Informasi',
          title: 'Pilih Informasi',
          description: "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di kanal resmi Om Budi. Silakan pilih informasi yang dibutuhkan:",
          body_text: "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di kanal resmi Om Budi. Silakan pilih informasi yang dibutuhkan:",
          options: [
            {
              id: 'opt_tentang',
              title: 'Tentang Zoom Booster',
              description: 'Penjelasan materi & bedah energi',
              responseText: 'Mood Booster adalah sesi live interaktif bersama Om Budi untuk membedah energi, pembersihan batin, dan peningkatan kualitas hidup sesuai tuntunan.',
              response_text: 'Mood Booster adalah sesi live interaktif bersama Om Budi untuk membedah energi, pembersihan batin, dan peningkatan kualitas hidup sesuai tuntunan.',
            },
            {
              id: 'opt_jadwal',
              title: 'Jadwal Zoom',
              description: 'Waktu & tanggal pelaksanaan',
              responseText: 'Sesi Mood Booster rutin diadakan setiap hari Rabu malam pukul 20.00 WIB via Zoom.',
              response_text: 'Sesi Mood Booster rutin diadakan setiap hari Rabu malam pukul 20.00 WIB via Zoom.',
            },
            {
              id: 'opt_syarat',
              title: 'Cara Mengikuti',
              description: 'Langkah bergabung ke sesi live',
              responseText: 'Pastikan telah mengunduh aplikasi Zoom dan bergabung di grup pengumuman. Link room Zoom dibagikan 30 menit sebelum sesi dimulai.',
              response_text: 'Pastikan telah mengunduh aplikasi Zoom dan bergabung di grup pengumuman. Link room Zoom dibagikan 30 menit sebelum sesi dimulai.',
            },
            {
              id: 'opt_peserta',
              title: 'Peserta Zoom Rabu',
              description: 'Kenapa Zoom tidak untuk semua?',
              responseText: 'Ruang Zoom dibatasi demi menjaga fokus, interaksi tanya-jawab langsung, dan kondusifitas materi selama sesi berlangsung.',
              response_text: 'Ruang Zoom dibatasi demi menjaga fokus, interaksi tanya-jawab langsung, dan kondusifitas materi selama sesi berlangsung.',
            },
          ],
        },
      ],
      ai_knowledge: {
        ai_name: 'Asisten Om Budi',
        tone: 'friendly',
        system_prompt: 'Anda adalah asisten resmi untuk kanal Om Budi (Mood Booster). Berikan informasi kajian dengan ramah dan santun.',
      },
    },
  };

  // Upsert tenant
  const { data: upsertData, error: upsertError } = await supabase
    .from('tenants')
    .upsert(tenantPayload, { onConflict: 'slug' })
    .select();

  if (upsertError) {
    console.error('❌ Gagal melakukan upsert tenant:', upsertError);
    process.exit(1);
  }

  console.log('✅ Upsert tenant Om Budi berhasil!');

  // Verifikasi query GET
  console.log('🔍 Menjalankan verifikasi query GET ke tabel tenants...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('tenants')
    .select('id, slug, name, tier, category, is_active, metadata')
    .eq('slug', 'ombudi')
    .single();

  if (verifyError || !verifyData) {
    console.error('❌ Gagal verifikasi data tenant:', verifyError);
    process.exit(1);
  }

  console.log('✅ Verifikasi Sukses! Data tenant di Supabase:');
  console.log(JSON.stringify({
    slug: verifyData.slug,
    name: verifyData.name,
    tier: verifyData.tier,
    category: verifyData.category,
    plan_tier: verifyData.metadata?.plan_tier,
    bot_mode: verifyData.metadata?.bot_mode,
    business_category: verifyData.metadata?.business_category,
    total_menus: verifyData.metadata?.interactive_menus?.length || 0,
    sample_menu_trigger: verifyData.metadata?.interactive_menus?.[0]?.trigger_keyword,
    total_options: verifyData.metadata?.interactive_menus?.[0]?.options?.length || 0,
  }, null, 2));

  console.log('\n🚀 Dasbor dapat diakses di: /ombudi/dashboard');
}

initOmBudiTenant();
