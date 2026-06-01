import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import pt from './locales/pt.json';
import es from './locales/es.json';

export const SUPPORTED_LANGS = ['pt', 'es'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      es: { translation: es },
    },
    fallbackLng: 'pt',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    nonExplicitSupportedLngs: true, // pt-BR → pt, es-ES → es
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_language',
      caches: ['localStorage'],
    },
  });

// Keep <html lang> in sync
const applyHtmlLang = (lng: string) => {
  const base = (lng || 'pt').split('-')[0];
  if (typeof document !== 'undefined') {
    document.documentElement.lang = base;
  }
};
applyHtmlLang(i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
