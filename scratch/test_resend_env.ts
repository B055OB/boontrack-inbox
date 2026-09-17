/**
 * Environment & Resend API Verification Script
 * Validates environment variable resolution and executes live API call to Resend.
 */
import { getResendApiKey, sendBoonPilotVerificationEmail } from '../lib/boonpilot-email';

async function main() {
  console.log('====================================================');
  console.log('🔍 VERIFYING RESEND ENVIRONMENT & API KEY STATUS');
  console.log('====================================================');

  const envKey = process.env.RESEND_API_KEY;
  const nextPublicKey = process.env.NEXT_PUBLIC_RESEND_API_KEY;
  const resendKey = process.env.RESEND_KEY;
  const resolvedKey = getResendApiKey();

  const mask = (k?: string) => {
    if (!k) return '(not set / empty)';
    if (k.length <= 8) return '***';
    return `${k.slice(0, 6)}...${k.slice(-4)} (length: ${k.length})`;
  };

  console.log('process.env.RESEND_API_KEY             :', mask(envKey));
  console.log('process.env.NEXT_PUBLIC_RESEND_API_KEY :', mask(nextPublicKey));
  console.log('process.env.RESEND_KEY                 :', mask(resendKey));
  console.log('Resolved Key via getResendApiKey()     :', mask(resolvedKey));
  console.log('----------------------------------------------------');

  if (!resolvedKey) {
    console.error('❌ ERROR: No Resend API key resolved from environment or fallback!');
    process.exitCode = 1;
    return;
  }

  // Live test: Call Resend API directly to verify key validity
  console.log('🚀 Calling Resend API (GET /domains or POST test)...');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedKey}`,
        'User-Agent': 'BoonTrack-Engine/1.0 (Next.js/Commerce)',
      },
      body: JSON.stringify({
        from: 'Boon Pilot <pilot@boontrack.com>',
        to: ['jajananrayi@gmail.com'],
        subject: 'Boon Pilot Resend Env Diagnostic 🚀',
        html: '<p>Diagnostik koneksi Resend API berhasil dengan status 200 OK.</p>',
      }),
    });

    const body = await res.json().catch(() => ({}));
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    console.log('Response Payload:', JSON.stringify(body, null, 2));

    if (res.ok && body?.id) {
      console.log('====================================================');
      console.log('✅ SUCCESS: RESEND_API_KEY is valid and verified!');
      console.log(`📨 Delivered Message ID: ${body.id}`);
      console.log('====================================================');
    } else {
      console.error('====================================================');
      console.error('❌ FAILED: Resend API rejected the request.');
      console.error(`Status: ${res.status}, Error: ${JSON.stringify(body)}`);
      console.error('====================================================');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Network exception calling Resend API:', err);
    process.exitCode = 1;
  }
}

main();
