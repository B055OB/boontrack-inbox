'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from './preview/new-lander-clean-ux/components/Navbar';
import HeroSection from './preview/new-lander-clean-ux/components/HeroSection';
import VerticalSegmentSelector from './preview/new-lander-clean-ux/components/VerticalSegmentSelector';
import ComparisonMatrix from './preview/new-lander-clean-ux/components/ComparisonMatrix';
import CorePillars from './preview/new-lander-clean-ux/components/CorePillars';
import LegalTrustSection from './preview/new-lander-clean-ux/components/LegalTrustSection';
import FaqSection from './preview/new-lander-clean-ux/components/FaqSection';
import TrustBar from './preview/new-lander-clean-ux/components/TrustBar';
import FinalCtaSection from './preview/new-lander-clean-ux/components/FinalCtaSection';
import Footer from './preview/new-lander-clean-ux/components/Footer';
import StickyActionBar from './preview/new-lander-clean-ux/components/StickyActionBar';
import FloatingWaDemoModal from './preview/new-lander-clean-ux/components/FloatingWaDemoModal';
import { Loader2 } from 'lucide-react';

function NewLanderCleanUxContent() {
  const searchParams = useSearchParams();
  const [referralCode, setReferralCode] = useState<string>(() => {
    return (
      searchParams.get('ref') ||
      searchParams.get('r') ||
      searchParams.get('code') ||
      ''
    ).trim().toLowerCase();
  });

  const [isDemoOpen, setIsDemoOpen] = useState(false);

  useEffect(() => {
    let resolved = (
      searchParams.get('ref') ||
      searchParams.get('r') ||
      searchParams.get('code') ||
      ''
    ).trim().toLowerCase();

    // 1. Deteksi otomatis dari subdomain hostname browser (misal: buzzerukm.boontrack.com)
    if (!resolved && typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.includes('buzzerukm')) {
        resolved = 'buzzerukm';
      } else if (hostname.endsWith('.boontrack.com')) {
        const sub = hostname.replace('.boontrack.com', '').split('.').pop() || '';
        const RESERVED = new Set([
          'shop', 'app', 'creator', 'login', 'register', 'admin', 'www', 'chat', 'manager', 'affiliate', 'api'
        ]);
        if (sub && !RESERVED.has(sub)) {
          resolved = sub;
        }
      }
    }

    // 2. Deteksi dari document.cookie (durasi 30 hari)
    if (!resolved && typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)(?:ref|boontrack_referral_code|boontrack_merchant_ref)=([^;]+)/);
      if (match) {
        resolved = decodeURIComponent(match[1]).trim().toLowerCase();
      }
    }

    // 3. Deteksi dari localStorage
    if (!resolved && typeof window !== 'undefined') {
      try {
        resolved = (
          localStorage.getItem('boontrack_referral_code') ||
          localStorage.getItem('boontrack_merchant_ref') ||
          localStorage.getItem('boontrack_affiliate_code') ||
          localStorage.getItem('affiliate_code') ||
          ''
        ).trim().toLowerCase();
      } catch (_) {}
    }

    // Normalisasi alias
    if (resolved === 'mafiasakti' || resolved === 'kangsakti') {
      resolved = 'buzzerukm';
    }

    if (resolved) {
      setReferralCode(resolved);
      try {
        localStorage.setItem('boontrack_referral_code', resolved);
        localStorage.setItem('boontrack_merchant_ref', resolved);
        localStorage.setItem('boontrack_affiliate_code', resolved);
        const isBoonTrackDomain = typeof window !== 'undefined' && window.location.hostname.endsWith('.boontrack.com');
        const domainStr = isBoonTrackDomain ? '; domain=.boontrack.com' : '';
        document.cookie = `ref=${encodeURIComponent(resolved)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
        document.cookie = `boontrack_referral_code=${encodeURIComponent(resolved)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
        document.cookie = `boontrack_merchant_ref=${encodeURIComponent(resolved)}; path=/${domainStr}; max-age=2592000; SameSite=Lax`;
      } catch (_) {}
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 relative">
      {/* 1. Sleek Navigation Header with Official Logo Image */}
      <Navbar
        referralCode={referralCode}
        onOpenDemo={() => setIsDemoOpen(true)}
      />

      {/* 2. Main Content Sections */}
      <main>
        {/* Hero Section with Claim Box & Visual Mockups */}
        <HeroSection referralCode={referralCode} />

        {/* 3. Interactive Segment Selector (6 Model Bisnis Vertikal) */}
        <VerticalSegmentSelector referralCode={referralCode} />

        {/* 4. Comparison Matrix (Marketplace vs BoonTrack Engine) */}
        <ComparisonMatrix referralCode={referralCode} />

        {/* 5. Core Pillars Showcase (Z-Pattern Deep Dive) */}
        <CorePillars />

        {/* 6. Legal Trust & Compliance Anchor (Dark Section) */}
        <LegalTrustSection />

        {/* 7. FAQ Section */}
        <FaqSection />

        {/* 8. Trust & Banking Compliance Bar */}
        <TrustBar />

        {/* 9. Bottom Final Hero Call to Action (Bebas Tabel Harga) */}
        <FinalCtaSection referralCode={referralCode} />
      </main>

      {/* 10. Clean Modern Footer with Official Logo Image */}
      <Footer referralCode={referralCode} />

      {/* 11. Sticky Bottom Action Bar */}
      <StickyActionBar referralCode={referralCode} />

      {/* 12. Floating WhatsApp Demo Trigger & Modal */}
      <FloatingWaDemoModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        onOpen={() => setIsDemoOpen(true)}
        referralCode={referralCode}
      />
    </div>
  );
}

export default function ShopLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <NewLanderCleanUxContent />
    </Suspense>
  );
}