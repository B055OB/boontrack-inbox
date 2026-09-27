async function verify() {
  console.log('--- 1. Testing https://dashboard.boontrack.com/ ---');
  const r1 = await fetch('https://dashboard.boontrack.com/', { headers: { 'Cache-Control': 'no-cache' } });
  const t1 = await r1.text();
  console.log('Status:', r1.status);
  console.log('Matched Path:', r1.headers.get('x-matched-path'));
  console.log('Has "Masuk ke Dashboard Toko":', t1.includes('Masuk ke Dashboard Toko'));
  console.log('Has "PIN / Password Akses":', t1.includes('PIN') || t1.includes('Password Akses'));
  console.log('Is Landing Page?:', t1.includes('Dari Chat Sampai Order Beres'));

  console.log('\n--- 2. Testing https://dashboard.boontrack.com/buzzerukm ---');
  const r2 = await fetch('https://dashboard.boontrack.com/buzzerukm', { headers: { 'Cache-Control': 'no-cache' } });
  const t2 = await r2.text();
  console.log('Status:', r2.status);
  console.log('Matched Path:', r2.headers.get('x-matched-path'));
  console.log('Has "Buzzer UKM":', t2.includes('Buzzer UKM') || t2.includes('buzzerukm'));
  console.log('Has Dashboard Tabs:', t2.includes('Pesanan') || t2.includes('Ringkasan') || t2.includes('Overview'));

  console.log('\n--- 3. Testing https://dashboard.boontrack.com/manifest.json ---');
  const r3 = await fetch('https://dashboard.boontrack.com/manifest.json');
  const m3 = await r3.json();
  console.log('Status:', r3.status);
  console.log('start_url:', m3.start_url);
  console.log('scope:', m3.scope);
  console.log('display:', m3.display);

  console.log('\n--- 4. Testing https://dashboard.boontrack.com/api/v1/push/subscribe ---');
  const r4 = await fetch('https://dashboard.boontrack.com/api/v1/push/subscribe');
  const d4 = await r4.json();
  console.log('Status:', r4.status);
  console.log('Push Subscribe API Response:', d4);
}
verify();
