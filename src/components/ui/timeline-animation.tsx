"use client";

import type { RefObject, ReactNode } from "react";
import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";

type TimelineTag = "span" | "a" | "figure" | "div" | "button";

interface TimelineContentProps {
  as: TimelineTag;
  animationNum: number;
  timelineRef: RefObject<Element | null>;
  customVariants: Variants;
  children: ReactNode;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
}

export function TimelineContent({
  as,
  animationNum,
  timelineRef,
  customVariants,
  children,
  className,
  href,
  target,
  rel,
}: TimelineContentProps) {
  const isInView = useInView(timelineRef, { once: true, amount: 0.12 });
  const reduceMotion = useReducedMotion();
  const state = reduceMotion || isInView ? "visible" : "hidden";
  const shared = {
    custom: animationNum,
    initial: reduceMotion ? "visible" : "hidden",
    animate: state,
    variants: customVariants,
    className,
  };

  if (as === "a") {
    return <motion.a {...shared} href={href} target={target} rel={rel}>{children}</motion.a>;
  }
  if (as === "figure") {
    return <motion.figure {...shared}>{children}</motion.figure>;
  }
  if (as === "span") {
    return <motion.span {...shared}>{children}</motion.span>;
  }
  if (as === "button") {
    return <motion.button {...shared} type="button">{children}</motion.button>;
  }
  return <motion.div {...shared}>{children}</motion.div>;
}
