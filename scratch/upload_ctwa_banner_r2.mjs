import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const accessKeyId = 'd3cc64b9df13a72194e16c825fa29d1c';
const secretAccessKey = '120e42953c884ce1f94acaed86765a9a335833e4555eb6a01e3d090cb666a5ce';
const endpoint = 'https://56303bb13200d0980da8695adcf08550.r2.cloudflarestorage.com';
const bucket = 'boontrack-media';
const publicUrlBase = 'https://assets.boontrack.com';

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function upload() {
  const filePath = path.resolve('public', 'ctwa-mastery-banner.jpg');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const key = 'products/ctwa_mastery_banner.jpg';

  console.log(`Uploading ${filePath} to R2 bucket ${bucket} with key ${key}...`);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
    })
  );

  const finalUrl = `${publicUrlBase}/${key}`;
  console.log('✅ Upload success! Absolute CDN URL:', finalUrl);
}

upload().catch((e) => {
  console.error('Upload failed:', e);
});
