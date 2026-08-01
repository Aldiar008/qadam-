"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

interface TextProps {
  children: React.ReactNode;
  reverse?: boolean;
  transition?: Transition;
  splitBy?: "words" | "characters" | "lines" | string;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | "random" | number;
  containerClassName?: string;
  wordLevelClassName?: string;
  elementLevelClassName?: string;
  onClick?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  autoStart?: boolean;
}

export interface VerticalCutRevealRef {
  startAnimation: () => void;
  reset: () => void;
}

interface WordObject {
  characters: string[];
  needsSpace: boolean;
}

function splitIntoCharacters(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("ru", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

const VerticalCutReveal = forwardRef<VerticalCutRevealRef, TextProps>(
  (
    {
      children,
      reverse = false,
      transition = { type: "spring", stiffness: 190, damping: 22 },
      splitBy = "words",
      staggerDuration = 0.06,
      staggerFrom = "first",
      containerClassName,
      wordLevelClassName,
      elementLevelClassName,
      onClick,
      onStart,
      onComplete,
      autoStart = true,
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const text = typeof children === "string" ? children : children?.toString() || "";
    const [isAnimating, setIsAnimating] = useState(autoStart);
    const reduceMotion = useReducedMotion();

    const elements = useMemo<WordObject[]>(() => {
      if (splitBy === "characters") {
        const words = text.split(" ");
        return words.map((word, index) => ({
          characters: splitIntoCharacters(word),
          needsSpace: index !== words.length - 1,
        }));
      }
      const units = splitBy === "words"
        ? text.split(" ")
        : splitBy === "lines"
          ? text.split("\n")
          : text.split(splitBy);
      return units.map((unit, index) => ({
        characters: [unit],
        needsSpace: splitBy === "words" && index !== units.length - 1,
      }));
    }, [text, splitBy]);

    const totalElements = useMemo(
      () => elements.reduce((total, word) => total + word.characters.length, 0),
      [elements],
    );

    const getStaggerDelay = useCallback(
      (index: number) => {
        if (reduceMotion) return 0;
        if (staggerFrom === "first") return index * staggerDuration;
        if (staggerFrom === "last") return (totalElements - 1 - index) * staggerDuration;
        if (staggerFrom === "center") {
          return Math.abs(Math.floor(totalElements / 2) - index) * staggerDuration;
        }
        if (staggerFrom === "random") {
          return Math.abs(Math.floor(totalElements / 2) - index) * staggerDuration;
        }
        return Math.abs(staggerFrom - index) * staggerDuration;
      },
      [reduceMotion, staggerFrom, staggerDuration, totalElements],
    );

    const startAnimation = useCallback(() => {
      setIsAnimating(true);
      onStart?.();
    }, [onStart]);

    useImperativeHandle(ref, () => ({
      startAnimation,
      reset: () => setIsAnimating(false),
    }));

    const variants: Variants = {
      hidden: { y: reverse ? "-100%" : "100%" },
      visible: (index: number) => ({
        y: 0,
        transition: {
          ...transition,
          delay: (typeof transition.delay === "number" ? transition.delay : 0) + getStaggerDelay(index),
        },
      }),
    };

    return (
      <span
        className={cn(
          "flex flex-wrap whitespace-pre-wrap",
          splitBy === "lines" && "flex-col",
          containerClassName,
        )}
        onClick={onClick}
        ref={containerRef}
        {...props}
      >
        <span className="sr-only">{text}</span>
        {elements.map((word, wordIndex) => {
          const previousCharacters = elements
            .slice(0, wordIndex)
            .reduce((sum, item) => sum + item.characters.length, 0);
          return (
            <span
              key={wordIndex}
              aria-hidden="true"
              className={cn("inline-flex overflow-hidden", wordLevelClassName)}
            >
              {word.characters.map((character, characterIndex) => (
                <span
                  className={cn("relative whitespace-pre-wrap", elementLevelClassName)}
                  key={characterIndex}
                >
                  <motion.span
                    custom={previousCharacters + characterIndex}
                    initial={reduceMotion ? "visible" : "hidden"}
                    animate={reduceMotion || isAnimating ? "visible" : "hidden"}
                    variants={variants}
                    onAnimationComplete={
                      wordIndex === elements.length - 1 &&
                      characterIndex === word.characters.length - 1
                        ? onComplete
                        : undefined
                    }
                    className="inline-block"
                  >
                    {character}
                  </motion.span>
                </span>
              ))}
              {word.needsSpace && <span> </span>}
            </span>
          );
        })}
      </span>
    );
  },
);

VerticalCutReveal.displayName = "VerticalCutReveal";

export { VerticalCutReveal };
