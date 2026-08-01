'use client';

import React from 'react';
import { motion } from 'motion/react';

interface QadamSignalProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export function QadamSignal({ className = '', size = 32, animated = true }: QadamSignalProps) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full text-primary"
        aria-hidden="true"
      >
        {/* Stage 1: Observe - Outer ring */}
        <motion.circle
          cx="24"
          cy="24"
          r="21"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.25"
          strokeDasharray="4 4"
          animate={animated ? { rotate: 360 } : {}}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        />

        {/* Stage 2: Detect - Middle ring */}
        <motion.circle
          cx="24"
          cy="24"
          r="15"
          stroke="currentColor"
          strokeWidth="2"
          strokeOpacity="0.5"
          animate={animated ? { scale: [0.95, 1.05, 0.95] } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Stage 3: Compile - Signal Dot & Pulse */}
        <motion.circle
          cx="24"
          cy="24"
          r="6"
          fill="currentColor"
          animate={animated ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Signal pulse expanding wave */}
        {animated && (
          <motion.circle
            cx="24"
            cy="24"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            initial={{ r: 6, opacity: 0.8 }}
            animate={{ r: 20, opacity: 0 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Stage 4: Measure & Action - Growth Arrow converting signal to action */}
        <path
          d="M24 16V24L30 30"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Forward momentum dot */}
        <circle cx="30" cy="18" r="2.5" fill="currentColor" />
      </svg>
    </div>
  );
}
