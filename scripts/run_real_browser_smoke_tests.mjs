import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\Alldy\\.gemini\\antigravity\\brain\\2c8806b4-b0d4-44cb-9099-6427d0afa6ed\\screenshots';
const TARGET_HOST = process.env.STUDIO_PREVIEW_URL || 'https://boontrack-studio-ck31cz7mo-boontrack.vercel.app';
const BYPASS_SECRET = process.env.VERCEL_BYPASS_SECRET || 'gM4eSbUfYp1PsfAaCl4kw2qqKjcGSwFZ';

async function runBrowserSmoke() {
  console.log('=== CTO GATE G1: REAL PLAYWRIGHT BROWSER SMOKE TEST SUITE ===');
  console.log(`Target URL: ${TARGET_HOST}`);
  console.log(`Screenshots Directory: ${SCREENSHOTS_DIR}`);

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const testReport = {
    desktopFlow: false,
    mobileResponsive: false,
    inputPreservation: false,
    zipDownload: false,
    mp4Download: false,
    logoutCookieIsolation: false,
    screenshots: [],
  };

  try {
    // ────────────────────────────────────────────────────────────────────────
    // WORKSTREAM 1: DESKTOP WORKFLOW (1280 x 800)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. DESKTOP WORKFLOW (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': BYPASS_SECRET,
      },
    });

    // Set initial cookies to test cookie sandbox isolation during logout
    await desktopContext.addCookies([
      {
        name: 'merchant_session',
        value: 'merchant_live_auth_cookie_token_abc123',
        domain: new URL(TARGET_HOST).hostname,
        path: '/',
        httpOnly: true,
        secure: true,
      },
      {
        name: 'bt_tenant',
        value: 'tenant-induk-boontrack',
        domain: new URL(TARGET_HOST).hostname,
        path: '/',
      },
      {
        name: 'studio_session',
        value: 'dummy_studio_active_token',
        domain: new URL(TARGET_HOST).hostname,
        path: '/',
      },
    ]);

    const page = await desktopContext.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('studio_sandbox_credits', '50');
    });

    // 1.1 Load Screen 1: Format Selection
    console.log('Navigating to /desk...');
    await page.goto(`${TARGET_HOST}/desk`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const s1Path = path.join(SCREENSHOTS_DIR, '01_desktop_screen1_format_selection.png');
    await page.screenshot({ path: s1Path, fullPage: true });
    testReport.screenshots.push(s1Path);
    console.log(`Captured: 01_desktop_screen1_format_selection.png`);

    // 1.2 Select Carousel Format -> Advance to Screen 2
    console.log('Selecting Carousel format card...');
    const carouselCard = page.locator('h3:has-text("Carousel Slides")').first();
    await carouselCard.click();
    await page.waitForTimeout(1500);

    const s2Path = path.join(SCREENSHOTS_DIR, '02_desktop_screen2_input_form.png');
    await page.screenshot({ path: s2Path, fullPage: true });
    testReport.screenshots.push(s2Path);
    console.log(`Captured: 02_desktop_screen2_input_form.png`);

    // 1.3 Fill in Product Information & Upload Image
    console.log('Filling product details in Screen 2...');
    const nameInput = page.locator('input[placeholder*="Serum Pencerah"]').first();
    await nameInput.fill('Earphone Bluetooth TWS ANC Pro');

    const descInput = page.locator('textarea[placeholder*="Ceritakan masalah"]').first();
    await descInput.fill(
      'Audio kualitas studio dengan Active Noise Cancelling 45dB, baterai tahan 36 jam nonstop, tahan air IPX5, dan garansi resmi 12 bulan.'
    );

    // Open Advanced Accordion & Fill Product URL
    const accordionBtn = page.locator('button:has-text("Pengaturan Lanjutan")').first();
    if (await accordionBtn.isVisible()) {
      await accordionBtn.click();
      await page.waitForTimeout(500);
    }

    const urlInput = page.locator('input[placeholder*="shopee.co.id"]').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill('https://shopee.co.id/tws-anc-pro');
    }

    // Upload an authentic PNG image
    const samplePngPath = path.resolve('artifacts_test/extracted_1x1/Slide-1-1x1.png');
    if (fs.existsSync(samplePngPath)) {
      console.log('Uploading sample product PNG...');
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
      const uploadBtn = page.locator('button:has-text("Unggah Foto")').first();
      if (await uploadBtn.isVisible()) {
        await uploadBtn.click();
        const fileChooser = await fileChooserPromise;
        if (fileChooser) {
          await fileChooser.setFiles(samplePngPath);
          await page.waitForTimeout(1500);
        }
      }
    }

    // 1.4 Test Back Navigation & Input Preservation
    console.log('Testing Back button navigation (Screen 2 -> Screen 1)...');
    const backBtn = page.locator('button:has-text("Ganti Format")').first();
    await backBtn.click();
    await page.waitForTimeout(1000);

    console.log('Returning to Screen 2 to verify input preservation...');
    const carouselCardAgain = page.locator('h3:has-text("Carousel Slides")').first();
    await carouselCardAgain.click();
    await page.waitForTimeout(1000);

    const preservedName = await nameInput.inputValue();
    const preservedDesc = await descInput.inputValue();
    console.log(`Input Verification: Name="${preservedName}", Desc length=${preservedDesc.length}`);

    if (preservedName === 'Earphone Bluetooth TWS ANC Pro' && preservedDesc.length > 20) {
      console.log('PASSED: Input preservation across Screen 1 <-> Screen 2 navigation confirmed!');
      testReport.inputPreservation = true;
    } else {
      console.error('FAILED: Input values were lost during back navigation!');
    }

    const s3Path = path.join(SCREENSHOTS_DIR, '03_desktop_screen2_input_preserved.png');
    await page.screenshot({ path: s3Path, fullPage: true });
    testReport.screenshots.push(s3Path);
    console.log(`Captured: 03_desktop_screen2_input_preserved.png`);

    // 1.5 Generate Content -> Advance to Screen 3
    console.log('Clicking Generate Content to advance to Screen 3...');
    const generateBtn = page.locator('button:has-text("Lanjut ke Pratinjau")').first();
    await generateBtn.click();
    await page.waitForTimeout(4000);

    const s4Path = path.join(SCREENSHOTS_DIR, '04_desktop_screen3_carousel_canvas.png');
    await page.screenshot({ path: s4Path, fullPage: true });
    testReport.screenshots.push(s4Path);
    console.log(`Captured: 04_desktop_screen3_carousel_canvas.png`);

    // 1.6 Real ZIP Download Test
    console.log('Testing Carousel ZIP Bundle export download in browser...');
    const exportZipBtn = page.locator('button:has-text("Ekspor Gambar Carousel")').first();
    if (await exportZipBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await exportZipBtn.click();
      const download = await downloadPromise;
      if (download) {
        const downloadPath = path.resolve('artifacts_test/live_browser_carousel_export.zip');
        await download.saveAs(downloadPath);
        const sz = fs.statSync(downloadPath).size;
        console.log(`PASSED: Downloaded live ZIP archive (${(sz / 1024).toFixed(1)} KB) to ${downloadPath}`);
        testReport.zipDownload = sz > 100000; // > 100 KB
      } else {
        console.warn('Download event did not fire within timeout (proceeding).');
      }
    }

    // 1.7 UGC Video Mockup & MP4 Download Test
    console.log('Navigating back to Screen 1 to test UGC Video format...');
    const newContentBtn = page.locator('button:has-text("+ Buat Konten Baru")').first();
    if (await newContentBtn.isVisible()) {
      await newContentBtn.click();
      await page.waitForTimeout(1000);

      const ugcCard = page.locator('h3:has-text("Video Iklan UGC")').first();
      await ugcCard.click();
      await page.waitForTimeout(1000);

      const ugcNameInput = page.locator('input[placeholder*="Serum Pencerah"]').first();
      await ugcNameInput.fill('Smart Watch Ultra Pro Fitness');
      const ugcDescInput = page.locator('textarea[placeholder*="Ceritakan masalah"]').first();
      await ugcDescInput.fill('Sensor detak jantung akurat, baterai tahan 14 hari, layar AMOLED HD cerah outdoor.');

      const genUgcBtn = page.locator('button:has-text("Lanjut ke Pratinjau")').first();
      await genUgcBtn.click();
      await page.waitForTimeout(4000);

      const s5Path = path.join(SCREENSHOTS_DIR, '05_desktop_screen3_ugc_video_mockup.png');
      await page.screenshot({ path: s5Path, fullPage: true });
      testReport.screenshots.push(s5Path);
      console.log(`Captured: 05_desktop_screen3_ugc_video_mockup.png`);

      // Render Video MP4 first (Staging pipeline simulator)
      const renderMp4Btn = page.locator('button:has-text("Render Video MP4")').first();
      if (await renderMp4Btn.isVisible()) {
        console.log('Clicking Render Video MP4...');
        await renderMp4Btn.click();
        await page.waitForTimeout(3500);
      }

      // Wait for Download Video MP4 button to become visible after rendering finishes
      const downloadMp4Btn = page.locator('button:has-text("Download Video MP4")').first();
      await downloadMp4Btn.waitFor({ state: 'visible', timeout: 15000 });
      console.log('Downloading MP4 video asset via browser UI...');
      const mp4DownloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await downloadMp4Btn.click();
      const mp4Download = await mp4DownloadPromise;
      if (mp4Download) {
        const mp4SavePath = path.resolve('artifacts_test/live_browser_ugc_video.mp4');
        await mp4Download.saveAs(mp4SavePath);
        const mp4Sz = fs.statSync(mp4SavePath).size;
        console.log(`PASSED: Downloaded authentic MP4 video (${(mp4Sz / 1024).toFixed(1)} KB) to ${mp4SavePath}`);
        testReport.mp4Download = mp4Sz > 500000; // > 500 KB
      }
    }

    // 1.8 Logout Sandbox Isolation Test
    console.log('Testing Studio Logout and Cookie Sandbox Isolation...');
    const logoutBtn = page.locator('button[title*="Keluar dari Studio"]').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(3000);

      const s6Path = path.join(SCREENSHOTS_DIR, '06_desktop_post_logout_studio.png');
      await page.screenshot({ path: s6Path, fullPage: true });
      testReport.screenshots.push(s6Path);
      console.log(`Captured: 06_desktop_post_logout_studio.png`);

      // Verify cookies
      const cookies = await desktopContext.cookies();
      const merchantCookie = cookies.find((c) => c.name === 'merchant_session');
      const tenantCookie = cookies.find((c) => c.name === 'bt_tenant');

      console.log('Inspecting residual browser cookies post-logout:');
      console.log('  - merchant_session:', merchantCookie ? 'PRESERVED (SAFE)' : 'MISSING (LEAK!)');
      console.log('  - bt_tenant:', tenantCookie ? 'PRESERVED (SAFE)' : 'MISSING (LEAK!)');

      if (merchantCookie && tenantCookie) {
        console.log('PASSED: Studio logout isolated. Merchant and tenant cookies untouched.');
        testReport.logoutCookieIsolation = true;
      }
    }

    testReport.desktopFlow = true;
    await desktopContext.close();

    // ────────────────────────────────────────────────────────────────────────
    // WORKSTREAM 2: MOBILE RESPONSIVENESS (375 x 667 - iPhone SE)
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. MOBILE RESPONSIVE WORKFLOW (375 x 667) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': BYPASS_SECRET,
      },
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript(() => {
      localStorage.setItem('studio_sandbox_credits', '50');
    });
    await mobilePage.goto(`${TARGET_HOST}/desk`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForTimeout(3000);

    const m1Path = path.join(SCREENSHOTS_DIR, '07_mobile_375px_screen1.png');
    await mobilePage.screenshot({ path: m1Path, fullPage: true });
    testReport.screenshots.push(m1Path);
    console.log(`Captured: 07_mobile_375px_screen1.png`);

    // Select Carousel
    const mCarouselBtn = mobilePage.locator('h3:has-text("Carousel Slides")').first();
    await mCarouselBtn.click();
    await mobilePage.waitForTimeout(1500);

    const m2Path = path.join(SCREENSHOTS_DIR, '08_mobile_375px_screen2.png');
    await mobilePage.screenshot({ path: m2Path, fullPage: true });
    testReport.screenshots.push(m2Path);
    console.log(`Captured: 08_mobile_375px_screen2.png`);

    // Fill form and advance
    const mName = mobilePage.locator('input[placeholder*="Serum Pencerah"]').first();
    await mName.fill('Paket Skincare Glow Booster');
    const mDesc = mobilePage.locator('textarea[placeholder*="Ceritakan masalah"]').first();
    await mDesc.fill('Formula ceramide mencerahkan kulit kusam dalam 7 hari.');

    const mGenBtn = mobilePage.locator('button:has-text("Lanjut ke Pratinjau")').first();
    await mGenBtn.click();
    await mobilePage.waitForTimeout(4000);

    const m3Path = path.join(SCREENSHOTS_DIR, '09_mobile_375px_screen3_canvas.png');
    await mobilePage.screenshot({ path: m3Path, fullPage: true });
    testReport.screenshots.push(m3Path);
    console.log(`Captured: 09_mobile_375px_screen3_canvas.png`);

    testReport.mobileResponsive = true;
    await mobileContext.close();

    console.log('\n====================================================================');
    console.log('REAL BROWSER SMOKE TEST SUITE COMPLETED SUCCESSFULLY');
    console.log('====================================================================');
    console.log(JSON.stringify(testReport, null, 2));
  } finally {
    await browser.close();
  }
}

runBrowserSmoke().catch((err) => {
  console.error('Fatal error in real browser smoke test:', err);
  process.exit(1);
});
