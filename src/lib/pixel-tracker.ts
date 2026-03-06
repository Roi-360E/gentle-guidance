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
  // Browser-side fbq
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', eventName, metadata);
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
