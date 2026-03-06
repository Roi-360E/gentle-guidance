import { supabase } from '@/integrations/supabase/client';

/**
 * Centralized Facebook Pixel event tracker.
 * Fires browser-side fbq() AND logs to pixel_events_log table.
 */
export function trackPixelEvent(
  eventName: string,
  metadata: Record<string, any> = {},
  userId?: string
) {
  // Browser-side fbq with retry
  if (typeof window !== 'undefined') {
    const tryFire = (attempt = 0) => {
      const fbq = (window as any).fbq;
      if (fbq && typeof fbq === 'function') {
        fbq('track', eventName, metadata);
        console.log(`[pixel-tracker] ✅ fbq('track', '${eventName}') fired`, metadata);
      } else if (attempt < 30) {
        setTimeout(() => tryFire(attempt + 1), 500);
      } else {
        console.warn(`[pixel-tracker] ❌ fbq not available after 15s, '${eventName}' not fired browser-side`);
      }
    };
    tryFire();
  }

  // Log to database (fire-and-forget)
  supabase
    .from('pixel_events_log' as any)
    .insert({
      event_name: eventName,
      event_source: 'browser',
      user_id: userId || null,
      metadata,
    } as any)
    .then(() => {});
}

/**
 * Track custom events (non-standard FB events)
 */
export function trackCustomEvent(
  eventName: string,
  metadata: Record<string, any> = {},
  userId?: string
) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('trackCustom', eventName, metadata);
  }

  supabase
    .from('pixel_events_log' as any)
    .insert({
      event_name: eventName,
      event_source: 'browser',
      user_id: userId || null,
      metadata,
    } as any)
    .then(() => {});
}
