'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import VerticalSegmentSelector from './components/VerticalSegmentSelector';
import ComparisonMatrix from './components/ComparisonMatrix';
import CorePillars from './components/CorePillars';
import StickyActionBar from './components/StickyActionBar';
import FloatingWaDemoModal from './components/FloatingWaDemoModal';
import Footer from './components/Footer';
import { Loader2 } from 'lucide-react';

function NewLanderCleanContent() {
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
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 relative">
      {/* 1. Sleek Light Navigation Header */}
      <Navbar
        referralCode={referralCode}
        onOpenDemo={() => setIsDemoOpen(true)}
      />

      {/* 2. Main Content Sections */}
      <main>
        {/* Hero Section with Clean Light Mockup */}
        <HeroSection
          referralCode={referralCode}
          onOpenDemo={() => setIsDemoOpen(true)}
        />

        {/* 3. Interactive Segment Selector (6 Model Bisnis Vertikal - Brand Sanitized) */}
        <VerticalSegmentSelector />

        {/* 4. Comparison Matrix (Marketplace vs BoonTrack Engine - Clean Light) */}
        <ComparisonMatrix referralCode={referralCode} />

        {/* 5. Core Pillars Showcase (Z-Pattern Layout) */}
        <CorePillars />
      </main>

      {/* 6. Clean Light Footer */}
      <Footer referralCode={referralCode} />

      {/* 7. Sticky Bottom Action Bar */}
      <StickyActionBar referralCode={referralCode} />

      {/* 8. Floating WhatsApp Demo Trigger & Modal */}
      <FloatingWaDemoModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        onOpen={() => setIsDemoOpen(true)}
        referralCode={referralCode}
      />
    </div>
  );
}

export default function PreviewNewLanderCleanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NewLanderCleanContent />
    </Suspense>
  );
}
