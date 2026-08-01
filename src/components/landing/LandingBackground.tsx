'use client';

import { Starfield } from '@/components/ui/starfield';

export function LandingBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_44%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_34%),radial-gradient(circle_at_28%_72%,color-mix(in_srgb,var(--accent)_5%,transparent),transparent_30%)]" />
      <Starfield
        className="absolute inset-0 size-full"
        starCount={12000}
        waveFrequency={12}
        starEscapeWidth={680}
        voidWidth={92}
        starColor={{ r: 13, g: 148, b: 136 }}
        accentColor={{ r: 37, g: 99, b: 235 }}
        maxOpacity={142}
        rotationSpeed={0.000065}
        waveSpeed={0.00032}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--background)_82%,transparent)_0%,transparent_30%,transparent_76%,color-mix(in_srgb,var(--background)_72%,transparent)_100%)]" />
    </div>
  );
}
