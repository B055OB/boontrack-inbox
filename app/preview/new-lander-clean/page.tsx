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

function NewLanderCleanContent() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') || searchParams.get('r') || '';

  const [isDemoOpen, setIsDemoOpen] = useState(false);

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
      <Footer />

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
