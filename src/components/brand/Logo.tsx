import React from 'react';
import Link from 'next/link';
import { QadamSignal } from './QadamSignal';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function Logo({ className = '', size = 'md', href = '/' }: LogoProps) {
  const iconSizes = { sm: 24, md: 32, lg: 40 };
  const textSizes = {
    sm: 'text-lg font-bold tracking-tight',
    md: 'text-xl font-extrabold tracking-tight',
    lg: 'text-2xl font-black tracking-tight',
  };

  const content = (
    <div className={`inline-flex items-center gap-2.5 group ${className}`}>
      <QadamSignal size={iconSizes[size]} />
      <div className="flex flex-col">
        <span className={`font-sans text-foreground leading-none ${textSizes[size]}`}>
          QOR
          <span className="text-primary font-mono ml-1 text-xs px-1.5 py-0.5 rounded bg-primary/10 tracking-normal font-semibold">
            AUTOPILOT
          </span>
        </span>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
