'use client';

import React, { useState, Suspense } from 'react';
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

function NewLanderContent() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') || searchParams.get('r') || '';

  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 font-sans selection:bg-indigo-600 selection:text-white relative">
      {/* 1. Sleek Navigation Header */}
      <Navbar
        referralCode={referralCode}
        onOpenDemo={() => setIsDemoOpen(true)}
      />

      {/* 2. Hero Section (Above the Fold with Dual Mockup & Social Proof) */}
      <main>
        <HeroSection
          referralCode={referralCode}
          onOpenDemo={() => setIsDemoOpen(true)}
        />

        {/* 3. Interactive Segment Selector (6 Canonical Business Verticals) */}
        <VerticalSegmentSelector />

        {/* 4. Comparison Matrix (Marketplace vs BoonTrack Engine) */}
        <ComparisonMatrix referralCode={referralCode} />

        {/* 5. Core Pillars Showcase (Z-Pattern Layout) */}
        <CorePillars />
      </main>

      {/* 6. Footer (PMSE Kemendag & Legal Compliance) */}
      <Footer />

      {/* 7. Sticky Bottom Action Bar (Appears on scroll past Hero) */}
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

export default function PreviewNewLanderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#080C14] flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      }
    >
      <NewLanderContent />
    </Suspense>
  );
}
