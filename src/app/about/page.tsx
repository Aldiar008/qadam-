import React from 'react';
import AboutSection3 from '@/components/ui/about-section';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalHeader />
      <main id="main-content" tabIndex={-1} className="pt-28 outline-none">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'О нас' }]} />
        </div>
        <AboutSection3 />
      </main>
      <Footer />
    </div>
  );
}
