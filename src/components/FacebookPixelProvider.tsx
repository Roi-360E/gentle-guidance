import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { initPixels, trackPageView, setAdvancedMatching } from '@/lib/facebook-pixel';

/**
 * Wraps the app to:
 * 1. Load active pixel configs & inject fbevents.js
 * 2. Fire PageView on every route change
 * 3. Send advanced matching data when user logs in
 */
export function FacebookPixelProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const initialized = useRef(false);

  // Init pixels once
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initPixels().then(() => trackPageView());
    }
  }, []);

  // Track page views on route changes
  useEffect(() => {
    trackPageView();
  }, [location.pathname]);

  // Advanced matching when user logs in
  useEffect(() => {
    if (user?.email) {
      setAdvancedMatching(user.email, user.user_metadata?.name);
    }
  }, [user?.id]);

  return <>{children}</>;
}
