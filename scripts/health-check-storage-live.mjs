/**
 * BoonTrack Post-Deploy Canary Health Check for Object Storage & Image Uploads
 * Validates that live endpoints can accept multipart uploads, store images,
 * and serve them via CDN/proxy without TLS handshake or gateway errors.
 */

const TARGET_HOST =
  process.env.TARGET_HOST ||
  process.env.SHOP_URL ||
  'https://shop.boontrack.com';

const TARGET_TENANT = process.env.TARGET_TENANT || 'plasa-kreatif';

async function runCanaryCheck() {
  console.log('\n=============================================================');
  console.log('   🕊️  BOONTRACK POST-DEPLOY CANARY STORAGE HEALTH CHECK');
  console.log(`   Target Host   : ${TARGET_HOST}`);
  console.log(`   Target Tenant : ${TARGET_TENANT}`);
  console.log('=============================================================\n');

  const uploadEndpoint = `${TARGET_HOST.replace(/\/+$/, '')}/api/v1/upload`;
  const boundary = '----WebKitFormBoundaryCanary' + Math.random().toString(36).substring(2);

  // Minimal valid 1x1 WebP binary
  const dummyWebp = Buffer.from(
    'RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25\xa4\x00\x03\x70\x00\xfe\xfb\xfd\xb7\x00\x00'
  );

  const filename = `canary_probe_${Date.now()}.webp`;
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/webp\r\n\r\n`,
    dummyWebp,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="tenant_slug"\r\n\r\n${TARGET_TENANT}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\nproducts\r\n`,
    `--${boundary}--\r\n`,
  ];

  const body = Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p)));

  console.log(`[1/3] Mengirim POST probe upload ke ${uploadEndpoint}...`);
  const startTime = Date.now();

  let uploadRes;
  try {
    uploadRes = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Tenant-Slug': TARGET_TENANT,
        'User-Agent': 'BoonTrack-Storage-Canary/1.0',
      },
      body,
    });
  } catch (netErr) {
    console.error('❌ Gagal menghubungi endpoint upload:', netErr.message);
    process.exit(1);
  }

  const uploadDuration = Date.now() - startTime;
  console.log(`      Status Code : HTTP ${uploadRes.status} (${uploadDuration}ms)`);

  let resJson;
  const rawText = await uploadRes.text();
  try {
    resJson = JSON.parse(rawText);
  } catch {
    console.error('❌ Endpoint tidak mengembalikan JSON valid. Raw response:');
    console.error(rawText.substring(0, 500));
    process.exit(1);
  }

  if (uploadRes.status !== 200 || resJson.status !== 'success') {
    console.error('❌ Upload Canary GAGAL:');
    console.error(`   Status : ${resJson.status}`);
    console.error(`   Detail : ${resJson.detail || resJson.message || 'Tidak ada detail'}`);
    process.exit(1);
  }

  const assetUrl = resJson.url || resJson.public_url || resJson.r2_url;
  const storageEngine = resJson.storage || 'unknown';
  console.log(`[2/3] Upload SUKSES! Engine: ${storageEngine}`);
  console.log(`      URL Asset : ${assetUrl}`);

  // [3/3] Verify asset retrieval over HTTP
  console.log(`[3/3] Memverifikasi keterbacaan asset di CDN/Public Storage...`);
  const fetchStart = Date.now();
  let fetchRes;
  try {
    fetchRes = await fetch(assetUrl);
  } catch (fetchErr) {
    console.warn(`⚠️  Peringatan: Gagal fetch langsung dari URL CDN (${fetchErr.message}).`);
    if (resJson.local_proxy_url) {
      const proxyFull = `${TARGET_HOST.replace(/\/+$/, '')}${resJson.local_proxy_url}`;
      console.log(`    Mencoba via proxy fallback: ${proxyFull}...`);
      fetchRes = await fetch(proxyFull);
    }
  }

  const fetchDuration = Date.now() - fetchStart;
  if (!fetchRes || !fetchRes.ok) {
    console.error(`❌ Gagal mengunduh file hasil upload (HTTP ${fetchRes ? fetchRes.status : 'ERR'})`);
    process.exit(1);
  }

  const contentType = fetchRes.headers.get('content-type') || '';
  console.log(`      Status Code  : HTTP ${fetchRes.status} (${fetchDuration}ms)`);
  console.log(`      Content-Type : ${contentType}`);

  console.log('\n=============================================================');
  console.log('🎉 CANARY HEALTH CHECK LULUS (ALL SYSTEMS HEALTHY)');
  console.log(`   • Upload Latency   : ${uploadDuration}ms`);
  console.log(`   • Retrieve Latency : ${fetchDuration}ms`);
  console.log(`   • Storage Engine   : ${storageEngine}`);
  console.log(`   • Target Tenant    : ${TARGET_TENANT}`);
  console.log('=============================================================\n');

  process.exit(0);
}

runCanaryCheck().catch((err) => {
  console.error('Fatal canary exception:', err);
  process.exit(1);
});
