/**
 * Facebook Pixel client-side utilities
 * Handles: base script injection, PageView, funnel events, advanced matching
 */

import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

let pixelsInitialized = false;
let activePixelIds: string[] = [];

/** SHA-256 hash for advanced matching */
async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Inject the fbevents.js base code (runs once) */
function injectBaseScript() {
  if (window.fbq) return;

  const f: any = window;
  const b = document;
  const n = function () {
    // eslint-disable-next-line prefer-rest-params
    (n as any).callMethod
      ? (n as any).callMethod.apply(n, arguments)
      : (n as any).queue.push(arguments);
  };
  if (!f.fbq) {
    f.fbq = n;
    f._fbq = n;
    (n as any).push = n;
    (n as any).loaded = true;
    (n as any).version = '2.0';
    (n as any).queue = [];

    const script = b.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = b.getElementsByTagName('script')[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  }
}

/** Load active pixel configs from the database and init each one */
export async function initPixels() {
  if (pixelsInitialized) return;

  try {
    const { data, error } = await supabase
      .from('facebook_pixel_config' as any)
      .select('pixel_id, is_active')
      .eq('is_active', true);

    if (error || !data || (data as any[]).length === 0) return;

    injectBaseScript();

    activePixelIds = (data as any[]).map((p: any) => p.pixel_id);

    for (const pixelId of activePixelIds) {
      window.fbq('init', pixelId);
    }

    pixelsInitialized = true;
  } catch (e) {
    console.warn('Facebook Pixel init failed:', e);
  }
}

/** Track PageView (call on every route change) */
export function trackPageView() {
  if (!window.fbq || activePixelIds.length === 0) return;
  window.fbq('track', 'PageView');
}

/** Set advanced matching data for the current user */
export async function setAdvancedMatching(email?: string | null, name?: string | null) {
  if (!window.fbq || !email) return;

  const hashedEmail = await sha256(email);
  const userData: any = { em: hashedEmail };

  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts[0]) userData.fn = await sha256(parts[0]);
    if (parts.length > 1) userData.ln = await sha256(parts[parts.length - 1]);
  }

  // Re-init each pixel with advanced matching
  for (const pixelId of activePixelIds) {
    window.fbq('init', pixelId, userData);
  }
}

/** Track ViewContent event (e.g. Sales page) */
export function trackViewContent(contentName?: string, value?: number) {
  if (!window.fbq) return;
  window.fbq('track', 'ViewContent', {
    content_name: contentName || document.title,
    ...(value !== undefined ? { value, currency: 'BRL' } : {}),
  });
}

/** Track InitiateCheckout event */
export function trackInitiateCheckout(planName: string, value: number) {
  if (!window.fbq) return;
  window.fbq('track', 'InitiateCheckout', {
    content_name: planName,
    value,
    currency: 'BRL',
    content_type: 'product',
  });
}

/** Track Purchase event (browser-side for dedup with CAPI) */
export function trackPurchase(value: number, planName: string, eventId?: string) {
  if (!window.fbq) return;
  const params: any = {
    value,
    currency: 'BRL',
    content_name: planName,
    content_type: 'product',
  };
  if (eventId) {
    // eventID for deduplication with server-side CAPI
    window.fbq('track', 'Purchase', params, { eventID: eventId });
  } else {
    window.fbq('track', 'Purchase', params);
  }
}

/** Get diagnostic info */
export function getPixelDiagnostics() {
  return {
    scriptLoaded: typeof window.fbq === 'function',
    pixelsInitialized,
    activePixelIds,
    queueLength: window.fbq?.queue?.length ?? 0,
  };
}
