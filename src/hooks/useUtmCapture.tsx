import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/**
 * Captures UTM parameters from URL on first visit and stores them.
 * Also saves to DB when user is authenticated.
 */
export function useUtmCapture(userId?: string) {
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    const params = new URLSearchParams(window.location.search);
    const hasUtm = UTM_PARAMS.some(p => params.has(p));
    if (!hasUtm) return;

    captured.current = true;

    const utmData: Record<string, string> = {};
    UTM_PARAMS.forEach(p => {
      const val = params.get(p);
      if (val) utmData[p] = val;
    });

    // Store in sessionStorage for later use
    sessionStorage.setItem('utm_data', JSON.stringify(utmData));
    sessionStorage.setItem('utm_landing_page', window.location.pathname);
  }, []);

  // Save to DB when user is available
  useEffect(() => {
    if (!userId) return;
    const raw = sessionStorage.getItem('utm_data');
    if (!raw) return;

    const utmData = JSON.parse(raw);
    const landingPage = sessionStorage.getItem('utm_landing_page') || '/';

    supabase
      .from('utm_tracking' as any)
      .insert({
        user_id: userId,
        utm_source: utmData.utm_source || null,
        utm_medium: utmData.utm_medium || null,
        utm_campaign: utmData.utm_campaign || null,
        utm_term: utmData.utm_term || null,
        utm_content: utmData.utm_content || null,
        landing_page: landingPage,
      } as any)
      .then(({ error }) => {
        if (!error) {
          sessionStorage.removeItem('utm_data');
          sessionStorage.removeItem('utm_landing_page');
        }
      });
  }, [userId]);
}
