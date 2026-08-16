/**
 * useScrollReveal — editorial scroll-reveal hook
 *
 * Uses IntersectionObserver to fire a one-shot reveal when an element enters
 * the viewport. Returns a ref to attach to the target element and a boolean
 * `isVisible`. Designed for "ink settling on paper" reveal effects:
 * — minimal vertical translate (4–8 px), slow fade (400–600 ms)
 * — no spring/bounce easing
 */
'use client';

import { useEffect, useRef, useState } from 'react';

interface UseScrollRevealOptions {
  /** Root margin — positive value = trigger before fully in view */
  rootMargin?: string;
  /** 0–1 intersection threshold to trigger reveal */
  threshold?: number;
  /** Only trigger once (default: true) */
  once?: boolean;
}

export function useScrollReveal<T extends Element = HTMLElement>(options: UseScrollRevealOptions = {}) {
  const {
    rootMargin = '0px 0px -48px 0px',
    threshold = 0.08,
    once = true,
  } = options;

  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, isVisible };
}
