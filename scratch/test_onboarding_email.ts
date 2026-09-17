/**
 * Test Onboarding Verification Email Dispatch
 * Validates universal email delivery via Resend with dynamic parameters.
 */
import { sendBoonPilotVerificationEmail } from '../lib/boonpilot-email';
import crypto from 'crypto';

async function runTest() {
  const dynamicTimestamp = Date.now();
  const dynamicSlug = `merchant-test-${dynamicTimestamp.toString().slice(-6)}`;
  const dynamicToken = crypto.randomBytes(32).toString('hex');
  const targetEmail = process.env.TEST_EMAIL || 'jajananrayi@gmail.com';
  const storeName = `Toko Uji Coba ${dynamicTimestamp.toString().slice(-4)}`;
  const merchantName = 'Partner Merchant Test';

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

