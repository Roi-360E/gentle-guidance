import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function FacebookPixelProvider() {
  const [injected, setInjected] = useState(false);

  useEffect(() => {
    if (injected) return;

    const loadAndInject = async () => {
      const { data, error } = await supabase
        .from('facebook_pixel_config' as any)
        .select('pixel_snippet, is_active')
        .eq('is_active', true);

      if (error || !data) return;

      const pixels = (data as any[]) as { pixel_snippet: string; is_active: boolean }[];
      
      pixels.forEach((px) => {
        const snippet = px.pixel_snippet?.trim();
        if (!snippet) return;

        // Extract script content from the snippet
        const scriptMatches = snippet.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        const noscriptMatches = snippet.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi);

        // Inject script tags
        if (scriptMatches) {
          scriptMatches.forEach((match) => {
            const srcMatch = match.match(/src=["']([^"']+)["']/);
            const innerContent = match.replace(/<\/?script[^>]*>/gi, '').trim();

            if (srcMatch) {
              // External script
              const el = document.createElement('script');
              el.async = true;
              el.src = srcMatch[1];
              document.head.appendChild(el);
            }
            if (innerContent) {
              // Inline script
              const el = document.createElement('script');
              el.textContent = innerContent;
              document.head.appendChild(el);
            }
          });
        }

        // Inject noscript tags
        if (noscriptMatches) {
          noscriptMatches.forEach((match) => {
            const inner = match.replace(/<\/?noscript[^>]*>/gi, '').trim();
            if (inner) {
              const el = document.createElement('noscript');
              el.innerHTML = inner;
              document.head.appendChild(el);
            }
          });
        }
      });

      setInjected(true);
    };

    loadAndInject();
  }, [injected]);

  return null;
}
