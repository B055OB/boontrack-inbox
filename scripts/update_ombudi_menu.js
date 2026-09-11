const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// 1. Load environment variables
['.env.local', '.env'].forEach((file) => {
  const fullPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    });
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Fetch page HTML with social crawler UA to bypass Cloudflare
function fetchWithCrawlerUA(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return resolve(fetchWithCrawlerUA(redirectUrl));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    });
    req.on('error', reject);
  });
}

// 3. Extract main banner/og:image from Lynk.id page
function extractMainImage(html) {
  if (!html) return null;

  // Cek hero banner template Lynk.id: <div data-col="" class="Mb(8px) "> ... <img src="https://cdn.lynkid.my.id/products/..."
  const productBannerMatch = html.match(/src=["'](https:\/\/cdn\.lynkid\.my\.id\/products\/[^"'\s?]+)/i);
  if (productBannerMatch && productBannerMatch[1]) {
    return productBannerMatch[1];
  }

  // Cek tag meta og:image
  const ogMatch = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (ogMatch && ogMatch[1]) {
    return ogMatch[1];
  }

  // Cek tag meta twitter:image
  const twMatch = html.match(/name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["']\s+name=["']twitter:image["']/i);
  if (twMatch && twMatch[1]) {
    return twMatch[1];
  }

  return null;
}

async function main() {
  console.log('=== STEP 1: EKSTRAKSI GAMBAR DARI LYNK.ID ===\n');

  const sources = [
    { key: 'kelas_online', name: 'Kelas Online', url: 'https://lynk.id/ombudichannel/page/kelas-online' },
    { key: 'sedekah', name: 'Sedekah Berjamaah', url: 'https://lynk.id/ombudichannel/page/sedekah-berjamaah' },
    { key: 'testimoni', name: 'Testimoni', url: 'https://lynk.id/ombudichannel/page/testimoni' }
  ];

  const extractedImages = {};

  for (const src of sources) {
    console.log(`Mengambil data dari: ${src.url}...`);
    try {
      const { status, html } = await fetchWithCrawlerUA(src.url);
      const imgUrl = extractMainImage(html);
      extractedImages[src.key] = imgUrl;
      console.log(` -> Status: ${status}, Ekstraksi Gambar: ${imgUrl || 'Tidak Ditemukan'}`);
    } catch (err) {
      console.error(` -> Gagal fetch ${src.url}:`, err.message);
      extractedImages[src.key] = null;
    }
  }

  console.log('\nRingkasan URL Gambar:');
  console.log(JSON.stringify(extractedImages, null, 2));

  console.log('\n=== STEP 2: MENYIAPKAN STRUKTUR INTERACTIVE MENUS ===\n');

  const updatedInteractiveMenu = {
    id: "menu_layanan_ombudi",
    trigger: "Layanan & Program Om Budi",
    trigger_keyword: "layanan",
    title: "Layanan & Program Om Budi",
    header_text: "Layanan & Program Om Budi",
    body_text: "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di kanal resmi Om Budi. Silakan pilih informasi program yang ingin diakses:",
    description: "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di kanal resmi Om Budi. Silakan pilih informasi program yang ingin diakses:",
    options: [
      {
        id: "opt_kelas_online",
        title: "Kelas Online",
        description: "Info bimbingan & daftar",
        image_url: extractedImages.kelas_online || null,
        imageUrl: extractedImages.kelas_online || null,
        response_text: "Informasi kurikulum, jadwal, dan pendaftaran Kelas Online bimbingan Om Budi dapat diakses melalui tautan resmi berikut:\nhttps://lynk.id/ombudichannel/page/kelas-online",
        responseText: "Informasi kurikulum, jadwal, dan pendaftaran Kelas Online bimbingan Om Budi dapat diakses melalui tautan resmi berikut:\nhttps://lynk.id/ombudichannel/page/kelas-online"
      },
      {
        id: "opt_sedekah",
        title: "Sedekah Berjamaah",
        description: "Sedekah bersama & subuh",
        image_url: extractedImages.sedekah || null,
        imageUrl: extractedImages.sedekah || null,
        response_text: "Mari berikhtiar kebaikan bersama program Sedekah Berjamaah dan Sedekah Shubuh. Detail rekening amanah dan konfirmasi dapat dilihat di:\nhttps://lynk.id/ombudichannel/page/sedekah-berjamaah\natau\nhttps://lynk.id/ombudichannel/page/sedekah-shubuh",
        responseText: "Mari berikhtiar kebaikan bersama program Sedekah Berjamaah dan Sedekah Shubuh. Detail rekening amanah dan konfirmasi dapat dilihat di:\nhttps://lynk.id/ombudichannel/page/sedekah-berjamaah\natau\nhttps://lynk.id/ombudichannel/page/sedekah-shubuh"
      },
      {
        id: "opt_zoom_mood_booster",
        title: "Zoom Mood Booster",
        description: "Sesi live Rabu malam",
        image_url: null,
        imageUrl: null,
        response_text: "Sesi Mood Booster diadakan rutin setiap Rabu malam pukul 20.00 WIB via Zoom untuk pembersihan batin dan penguatan energi. Tautan ruang Zoom dibagikan di grup pengumuman 30 menit sebelum sesi dimulai.",
        responseText: "Sesi Mood Booster diadakan rutin setiap Rabu malam pukul 20.00 WIB via Zoom untuk pembersihan batin dan penguatan energi. Tautan ruang Zoom dibagikan di grup pengumuman 30 menit sebelum sesi dimulai."
      },
      {
        id: "opt_testimoni",
        title: "Kisah & Testimoni",
        description: "Kisah nyata jamaah",
        image_url: extractedImages.testimoni || null,
        imageUrl: extractedImages.testimoni || null,
        response_text: "Kumpulan kisah inspiratif, keajaiban ikhtiar sholawat, dan pengalaman sahabat jamaah dapat dibaca langsung di:\nhttps://lynk.id/ombudichannel/page/testimoni",
        responseText: "Kumpulan kisah inspiratif, keajaiban ikhtiar sholawat, dan pengalaman sahabat jamaah dapat dibaca langsung di:\nhttps://lynk.id/ombudichannel/page/testimoni"
      }
    ]
  };

  console.log('=== STEP 3: UPDATE KE SUPABASE ===\n');

  // Ambil metadata terkini tenant ombudi
  const { data: currentTenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'ombudi')
    .single();

  if (fetchErr || !currentTenant) {
    console.error('Gagal mengambil tenant ombudi:', fetchErr);
    process.exit(1);
  }

  const existingMetadata = currentTenant.metadata || {};
  const updatedMetadata = {
    ...existingMetadata,
    interactive_menus: [updatedInteractiveMenu]
  };

  const { data: updatedTenant, error: updateErr } = await supabase
    .from('tenants')
    .update({
      metadata: updatedMetadata
    })
    .eq('slug', 'ombudi')
    .select('id, slug, name, tier, metadata')
    .single();

  if (updateErr) {
    console.error('Gagal mengupdate metadata tenant ombudi:', updateErr);
    process.exit(1);
  }

  console.log('✅ BERHASIL UPDATE METADATA TENANT OM BUDI DI SUPABASE!\n');
  console.log('=== HASIL METADATA INTERACTIVE_MENUS ===');
  console.log(JSON.stringify(updatedTenant.metadata.interactive_menus, null, 2));

  console.log('\n=== DAFTAR OPSI & IMAGE URL ===');
  updatedTenant.metadata.interactive_menus[0].options.forEach((opt, idx) => {
    console.log(`${idx + 1}. [${opt.id}] ${opt.title}`);
    console.log(`   Deskripsi : ${opt.description}`);
    console.log(`   Image URL : ${opt.image_url}`);
    console.log(`   Balasan   : ${opt.response_text.replace(/\n/g, ' ')}\n`);
  });
}

main();
