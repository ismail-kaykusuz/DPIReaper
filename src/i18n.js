// ============================================================
// DPIReaper — i18n router
// ============================================================
//
// Style guide (same in every language):
//   • Section / Tab titles    → ALL CAPS         (e.g. "CONNECTION")
//   • Setting / Button name         → Title Case        (e.g. "Auto Connect")
//   • Description / Log message       → Sentence case
//   • Trail dots                   → "..." (three dots, not single character "…")
//
// Multilingual (12 langs): TR + EN complete (logs included). Other 10 langs have UI strings
// complete; rare entries like log messages fall back to EN
// automatically (Proxy logic).
// ============================================================

import tr from './locales/tr';
import en from './locales/en';
import de from './locales/de';
import fr from './locales/fr';
import es from './locales/es';
import it from './locales/it';
import ru from './locales/ru';
import ar from './locales/ar';
import zh from './locales/zh';
import ja from './locales/ja';
import pt from './locales/pt';
import ko from './locales/ko';

const ALL = { tr, en, de, fr, es, it, ru, ar, zh, ja, pt, ko };

/**
 * Returns dictionary for given language. Missing keys fall back to EN
 * (and ultimately TR) — no empty strings in UI.
 */
export const getTranslations = (lang = 'en') => {
  const base = ALL[lang] || ALL.en;
  return new Proxy(base, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in ALL.en) return ALL.en[key];
      if (key in ALL.tr) return ALL.tr[key];
      return undefined;
    },
  });
};

/** Auto-detect system language (default on first launch). */
export function detectSystemLang() {
  try {
    const nav = (navigator.language || 'en').toLowerCase();
    const short = nav.split('-')[0];
    if (ALL[short]) return short;
    // map zh-CN / zh-TW etc. to zh
    if (nav.startsWith('zh')) return 'zh';
  } catch (_) { /* sessizce yut */ }
  return 'en';
}

export const SUPPORTED_LANGUAGES = [
  { code: 'tr', name: 'Türkçe',     flag: '🇹🇷' },
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'pt', name: 'Português',  flag: '🇵🇹' },
  { code: 'ru', name: 'Русский',    flag: '🇷🇺' },
  { code: 'ar', name: 'العربية',     flag: '🇸🇦' },
  { code: 'zh', name: '中文',        flag: '🇨🇳' },
  { code: 'ja', name: '日本語',      flag: '🇯🇵' },
  { code: 'ko', name: '한국어',      flag: '🇰🇷' },
];

export default ALL;
