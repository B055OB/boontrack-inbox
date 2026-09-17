/**
 * Test Onboarding Verification Email Dispatch
 * Validates universal email delivery via Resend with dynamic parameters.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Auto-load .env.local if not already in process.env
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  });
}

import { sendBoonPilotVerificationEmail } from '../lib/boonpilot-email';

async function runTest() {
  const dynamicTimestamp = Date.now();
  const dynamicSlug = `buzzerukm-${dynamicTimestamp.toString().slice(-4)}`;
  const dynamicToken = crypto.randomBytes(32).toString('hex');
  const targetEmail = process.env.TEST_EMAIL || 'buzzerukm@gmail.com';
  const storeName = 'Buzzer UKM Store';
  const merchantName = 'Kang Sakti (Buzzer UKM)';

  const verificationUrl = `https://shop.boontrack.com/auth/confirm?token=${dynamicToken}&type=merchant&slug=${dynamicSlug}`;

  console.log('====================================================');
  console.log('🧪 RUNNING UNIVERSAL ONBOARDING EMAIL DISPATCH TEST');
  console.log('====================================================');
  console.log('Store Name       :', storeName);
  console.log('Merchant Slug    :', dynamicSlug);
  console.log('Target Email     :', targetEmail);
  console.log('Verification URL :', verificationUrl);
  console.log('----------------------------------------------------');

  const result = await sendBoonPilotVerificationEmail({
    to: targetEmail,
    name: merchantName,
    role: 'merchant',
    verificationUrl,
    storeName,
    slug: dynamicSlug,
    expiresInHours: 24,
  });

  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.success && result.messageId) {
    console.log('====================================================');
    console.log('✅ TEST PASSED: Resend email successfully dispatched!');
    console.log(`📨 Resend Message ID: ${result.messageId}`);
    console.log(`📮 Sender Domain Used: ${result.senderUsed}`);
    console.log('====================================================');
    return;
  } else {
    console.error('====================================================');
    console.error('❌ TEST FAILED: Email could not be sent to Resend.');
    console.error(`🚨 Error detail: ${result.error}`);
    console.error('====================================================');
    process.exitCode = 1;
  }
}

runTest().catch((err) => {
  console.error('Unexpected exception during test:', err);
  process.exitCode = 1;
});

