import React from 'react';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { LocalSubnav } from '@/components/navigation/LocalSubnav';
import { CinematicHeroSection } from '@/components/landing/CinematicHeroSection';
import { KeyInsightSection } from '@/components/landing/KeyInsightSection';
import { CompetitionSection } from '@/components/landing/CompetitionSection';
import AboutSection3 from '@/components/ui/about-section';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { QrLoyaltySection } from '@/components/landing/QrLoyaltySection';
import { AiCampaignsSection } from '@/components/landing/AiCampaignsSection';
import { MarginShieldSection } from '@/components/landing/MarginShieldSection';
import { GrowthContractSection } from '@/components/landing/GrowthContractSection';
import { ContentStudioSection } from '@/components/landing/ContentStudioSection';
import { ImpactLedgerSection } from '@/components/landing/ImpactLedgerSection';
import { NearbyDiscountsSection } from '@/components/landing/NearbyDiscountsSection';
import { BusinessSolutionsSection } from '@/components/landing/BusinessSolutionsSection';
import { FinalCtaSection } from '@/components/landing/FinalCtaSection';
import { Footer } from '@/components/navigation/Footer';
import { LandingBackground } from '@/components/landing/LandingBackground';

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'QOR Autopilot',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Автопилот снабжения для цветочного магазина: свежесть партий, прогноз спроса к празднику, разделённый заказ и контроль поставщиков.',
    inLanguage: ['ru', 'kk'],
  };
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col">
      <LandingBackground />
      <GlobalHeader />
      <LocalSubnav />

      <main id="main-content" tabIndex={-1} className="qadam-starfield-page relative z-10 flex-grow outline-none">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        <CinematicHeroSection />
        <KeyInsightSection />
        <CompetitionSection />
        <AboutSection3 headingLevel="h2" />
        <HowItWorksSection />
        <QrLoyaltySection />
        <AiCampaignsSection />
        <MarginShieldSection />
        <GrowthContractSection />
        <ContentStudioSection />
        <ImpactLedgerSection />
        <NearbyDiscountsSection />
        <BusinessSolutionsSection />
        <FinalCtaSection />
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
