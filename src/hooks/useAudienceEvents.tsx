import { useEffect, useRef } from 'react';
import { trackCustomEvent } from '@/lib/pixel-tracker';

const VISIT_KEY = 'plans_visit_count';
const HIGH_INTENT_FIRED = 'high_intent_fired';
const POWER_USER_FIRED = 'power_user_fired';

/**
 * Fires HighIntent when user visits /plans 2+ times in this session.
 */
export function useHighIntentTracking(userId?: string) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const alreadyFired = sessionStorage.getItem(HIGH_INTENT_FIRED);
    if (alreadyFired) return;

    const count = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_KEY, String(count));

    if (count >= 2) {
      trackCustomEvent('HighIntent', {
        visit_count: count,
        content_name: 'Plans Page',
      }, userId);
      sessionStorage.setItem(HIGH_INTENT_FIRED, '1');
      fired.current = true;
    }
  }, [userId]);
}

/**
 * Fires PowerUser when user has processed 5+ videos.
 */
export function usePowerUserTracking(videoCount: number, userId?: string) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const alreadyFired = localStorage.getItem(POWER_USER_FIRED);
    if (alreadyFired) return;

    if (videoCount >= 5) {
      trackCustomEvent('PowerUser', {
        video_count: videoCount,
      }, userId);
      localStorage.setItem(POWER_USER_FIRED, '1');
      fired.current = true;
    }
  }, [videoCount, userId]);
}
