import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';

// Read .env.local manually
const envLocal = fs.readFileSync('.env.local', 'utf-8');
const envMap = {};
for (const line of envLocal.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) {
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    envMap[key] = val;
  }
}

const accessKeyId = envMap.R2_ACCESS_KEY_ID;
const secretAccessKey = envMap.R2_SECRET_ACCESS_KEY;
const bucket = envMap.R2_BUCKET_NAME || 'boontrack-media';
const endpoint = envMap.R2_ENDPOINT_URL;

console.log('Testing R2 connection with:');
console.log('Bucket:', bucket);
console.log('Endpoint:', endpoint);
console.log('Access Key ID:', accessKeyId ? `${accessKeyId.slice(0, 8)}...` : 'MISSING');

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

try {
  const headRes = await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log('HeadBucket response: SUCCESS');

  const listRes = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
  console.log('ListObjects response: SUCCESS, found keys:', listRes.Contents?.map(c => c.Key) || []);
  console.log('R2 CONNECTIVITY VERIFIED SUCCESSFULLY!');
} catch (err) {
  console.error('R2 Test failed:', err);
  process.exit(1);
}
