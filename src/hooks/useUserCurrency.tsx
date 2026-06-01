import { useEffect, useState, useCallback } from 'react';

export type Currency = 'BRL' | 'USD' | 'EUR';

const STORAGE_KEY = 'user_currency_override';

const CURRENCY_META: Record<Currency, { symbol: string; locale: string; label: string }> = {
  BRL: { symbol: 'R$', locale: 'pt-BR', label: 'Real (BRL)' },
  USD: { symbol: '$', locale: 'en-US', label: 'Dollar (USD)' },
  EUR: { symbol: '€', locale: 'de-DE', label: 'Euro (EUR)' },
};

const EUR_LOCALES = ['de', 'fr', 'es', 'it', 'nl', 'pt-PT', 'pt-pt', 'el', 'fi', 'ga', 'lv', 'lt', 'mt', 'sk', 'sl', 'et'];

function detectFromBrowser(): Currency {
  try {
    // App language preference takes priority over browser locale
    const appLang = (localStorage.getItem('app_language') || '').toLowerCase();
    if (appLang.startsWith('es')) return 'EUR';
    if (appLang.startsWith('pt')) return 'BRL';

    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map(l => l.toLowerCase());
    for (const lang of langs) {
      if (lang.startsWith('pt-br') || lang === 'pt') return 'BRL';
      if (lang.startsWith('es')) return 'EUR'; // Spanish users default to EUR
      if (EUR_LOCALES.some(p => lang.startsWith(p))) return 'EUR';
      if (lang.startsWith('en')) return 'USD';
    }
  } catch {}
  return 'BRL';
}

export function useUserCurrency() {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
      if (stored && ['BRL', 'USD', 'EUR'].includes(stored)) return stored;
    } catch {}
    return detectFromBrowser();
  });

  // Re-detect on mount (in case localStorage stale)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setCurrencyState(detectFromBrowser());
    } catch {}
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
    setCurrencyState(c);
  }, []);

  const meta = CURRENCY_META[currency];

  const format = useCallback((amount: number | null | undefined) => {
    if (amount == null || isNaN(amount)) return '';
    if (currency === 'BRL') return `R$ ${amount.toFixed(2).replace('.', ',')}`;
    if (currency === 'EUR') return `€ ${amount.toFixed(2).replace('.', ',')}`;
    return `$ ${amount.toFixed(2)}`;
  }, [currency]);

  return { currency, setCurrency, symbol: meta.symbol, label: meta.label, format };
}
