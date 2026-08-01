'use client';

import { useEffect, useRef } from 'react';

interface StarColor {
  r: number;
  g: number;
  b: number;
}

interface StarfieldProps {
  starCount?: number;
  waveFrequency?: number;
  starEscapeWidth?: number;
  voidWidth?: number;
  starColor?: StarColor;
  accentColor?: StarColor;
  maxOpacity?: number;
  rotationSpeed?: number;
  waveSpeed?: number;
  scrollReactive?: boolean;
  className?: string;
}

interface Star {
  orbital: number;
  angle: number;
  rotationDirection: number;
  speed: number;
  wavePhaseX: number;
  wavePhaseY: number;
  waveSpeedX: number;
  waveSpeedY: number;
  size: number;
  tone: 0 | 1;
  opacityBucket: number;
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

const clampChannel = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const rgba = (color: StarColor, opacity: number) =>
  `rgba(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}, ${opacity})`;

function Starfield({
  starCount = 25000,
  waveFrequency = 20,
  starEscapeWidth = 620,
  voidWidth = 100,
  starColor = { r: 13, g: 148, b: 136 },
  accentColor = { r: 37, g: 99, b: 235 },
  maxOpacity = 150,
  rotationSpeed = 0.00008,
  waveSpeed = 0.00045,
  scrollReactive = true,
  className,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const navigatorWithMemory = navigator as NavigatorWithMemory;
    const lowPower =
      window.innerWidth < 768 ||
      (navigatorWithMemory.deviceMemory ?? 8) <= 4 ||
      (navigator.hardwareConcurrency ?? 8) <= 4;
    // This is ambient background motion, so 30fps is visually sufficient and
    // leaves the main thread/GPU budget available for the actual page scroll.
    const adaptiveCount = Math.min(starCount, lowPower ? 600 : 1600);
    const targetFrameTime = 1000 / 30;
    const opacityScale = Math.min(1, Math.max(0.12, maxOpacity / 255));
    const stars: Star[] = [];
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let lastFrame = 0;
    let scrollProgress = 0;
    let smoothScrollProgress = 0;
    let visible = !document.hidden;

    const colors = [starColor, accentColor].map((color) =>
      [0.16, 0.28, 0.42, 0.62].map((opacity) => rgba(color, opacity * opacityScale)),
    );

    const createStars = () => {
      stars.length = 0;
      const escapeRadius = Math.max(starEscapeWidth, Math.hypot(width, height) * 0.53);
      const safeVoid = Math.min(voidWidth, escapeRadius * 0.42);
      for (let index = 0; index < adaptiveCount; index += 1) {
        const distribution = Math.pow(Math.random(), 0.68);
        stars.push({
          orbital: safeVoid + distribution * (escapeRadius - safeVoid),
          angle: Math.random() * Math.PI * 2,
          rotationDirection: Math.random() > 0.08 ? 1 : -1,
          speed: rotationSpeed * (0.55 + Math.random() * 1.15),
          wavePhaseX: Math.random() * Math.PI * 2,
          wavePhaseY: Math.random() * Math.PI * 2,
          waveSpeedX: waveSpeed * (0.5 + Math.random()),
          waveSpeedY: waveSpeed * (0.5 + Math.random()),
          size: Math.random() > 0.94 ? 1.8 : Math.random() > 0.65 ? 1.25 : 0.8,
          tone: Math.random() > 0.78 ? 1 : 0,
          opacityBucket: Math.min(3, Math.floor(Math.random() * 4)),
        });
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.25);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createStars();
    };

    const updateScroll = () => {
      if (!scrollReactive) return;
      const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / range));
    };

    const draw = (time: number) => {
      if (!visible) return;
      animationFrame = requestAnimationFrame(draw);
      if (time - lastFrame < targetFrameTime) return;
      const delta = Math.min(34, Math.max(1, time - lastFrame));
      lastFrame = time;
      smoothScrollProgress += (scrollProgress - smoothScrollProgress) * (motionQuery.matches ? 1 : 0.105);
      context.clearRect(0, 0, width, height);

      const centerX = width * (0.6 - smoothScrollProgress * 0.12);
      const centerY = height * (0.5 + Math.sin(smoothScrollProgress * Math.PI * 1.4) * 0.06);
      const scrollRotation = smoothScrollProgress * Math.PI * 1.65;
      const radiusScale = 0.96 + smoothScrollProgress * 0.15;
      const motionTime = motionQuery.matches ? 0 : time;

      context.save();
      context.lineWidth = 1;
      for (let ring = 0; ring < 4; ring += 1) {
        context.beginPath();
        context.ellipse(
          centerX,
          centerY,
          voidWidth + ring * Math.max(72, Math.min(width, height) * 0.13),
          (voidWidth + ring * Math.max(72, Math.min(width, height) * 0.13)) * 0.36,
          -0.32 + scrollRotation * 0.06,
          0,
          Math.PI * 2,
        );
        context.strokeStyle = rgba(ring % 2 === 0 ? starColor : accentColor, 0.055);
        context.stroke();
      }
      context.restore();

      for (let tone = 0; tone < colors.length; tone += 1) {
        for (let bucket = 0; bucket < colors[tone].length; bucket += 1) {
          context.beginPath();
          for (const star of stars) {
            if (star.tone !== tone || star.opacityBucket !== bucket) continue;
            const angle =
              star.angle +
              star.rotationDirection * star.speed * motionTime +
              scrollRotation * (0.38 + star.orbital / Math.max(width, height) * 0.2);
            const waveX = Math.sin(motionTime * star.waveSpeedX + star.wavePhaseX) * waveFrequency;
            const waveY = Math.cos(motionTime * star.waveSpeedY + star.wavePhaseY) * waveFrequency * 0.55;
            const radius = star.orbital * radiusScale;
            const x = centerX + Math.cos(angle) * radius + waveX;
            const y = centerY + Math.sin(angle) * radius * 0.38 + waveY;
            if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
            context.rect(x, y, star.size, star.size);
          }
          context.fillStyle = colors[tone][bucket];
          context.fill();
        }
      }

      const pulse = motionQuery.matches ? 0 : Math.sin(time * 0.0014) * 5;
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, voidWidth + 72 + pulse);
      glow.addColorStop(0, rgba(starColor, 0));
      glow.addColorStop(0.68, rgba(starColor, 0.025));
      glow.addColorStop(1, rgba(starColor, 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      if (motionQuery.matches) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      void delta;
    };

    const requestStaticFrame = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(draw);
    };

    const onScroll = () => {
      updateScroll();
      if (motionQuery.matches) requestStaticFrame();
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible && !animationFrame) animationFrame = requestAnimationFrame(draw);
      if (!visible && animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (motionQuery.matches) requestStaticFrame();
    });

    resize();
    updateScroll();
    resizeObserver.observe(container);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    animationFrame = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(animationFrame);
    };
  }, [accentColor, maxOpacity, rotationSpeed, scrollReactive, starColor, starCount, starEscapeWidth, voidWidth, waveFrequency, waveSpeed]);

  return (
    <div ref={containerRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}

export { Starfield };
export type { StarfieldProps, StarColor };
