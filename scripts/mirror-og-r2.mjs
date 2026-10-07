import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const env = fs.readFileSync('.env.local', 'utf8');
const envMap = {};
for (const line of env.split('\n')) {
  const m = line.trim().match(/^([^=]+)=(.*)$/);
  if (m) {
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    envMap[key] = val;
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: envMap.R2_ENDPOINT_URL || 'https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: envMap.R2_ACCESS_KEY_ID || 'd3cc64b9df13a72194e16c825fa29d1c',
    secretAccessKey: envMap.R2_SECRET_ACCESS_KEY || '120e42953c884ce1f94acaed86765a9a335833e4555eb6a01e3d090cb666a5ce',
  },
});

const bucketName = envMap.R2_BUCKET_NAME || 'boontrack-media';

async function main() {
  const pngBody = fs.readFileSync('public/tenants/tumbuh-kembang-anak/og-image.png');
  const jpgBody = fs.readFileSync('public/tenants/tumbuh-kembang-anak/og-image.jpg');

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: 'og/tumbuh-kembang-anak/og-image.png',
    Body: pngBody,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=86400, s-maxage=604800',
  }));

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: 'og/tumbuh-kembang-anak/og-image.jpg',
    Body: jpgBody,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=86400, s-maxage=604800',
  }));

  console.log('Successfully mirrored to R2:');
  console.log('- https://assets.boontrack.com/og/tumbuh-kembang-anak/og-image.png');
  console.log('- https://assets.boontrack.com/og/tumbuh-kembang-anak/og-image.jpg');
}

main().catch(console.error);
