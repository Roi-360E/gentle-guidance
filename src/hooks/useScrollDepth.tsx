import { useEffect, useRef } from 'react';
import { trackCustomEvent } from '@/lib/pixel-tracker';

/**
 * Tracks scroll depth milestones (25%, 50%, 75%, 100%) and fires pixel events.
 */
export function useScrollDepth(pageName: string, userId?: string) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    firedRef.current = new Set();

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const pct = Math.round((scrollTop / docHeight) * 100);
      const milestones = [25, 50, 75, 100];

      milestones.forEach(m => {
        if (pct >= m && !firedRef.current.has(m)) {
          firedRef.current.add(m);
          trackCustomEvent('ScrollDepth', {
            page: pageName,
            depth_percent: m,
          }, userId);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pageName, userId]);
}
