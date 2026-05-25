// ============================================================
// DPIReaper — i18n yönlendirici
// ============================================================
//
// Stil rehberi (her dilde aynı):
//   • Section / Tab başlıkları    → ALL CAPS         (örn. "CONNECTION")
//   • Setting / Buton ad ı         → Title Case        (örn. "Auto Connect")
//   • Açıklama / Log mesajı       → Sentence case
//   • Trail dots                   → "..." (üç nokta, tek karakter "…" değil)
//
// Çoklu dil (12 dil): TR + EN tam (log dahil). Diğer 10 dilde UI metinleri
// tam; log mesajları gibi nadir görünen kayıtlar için EN'den fallback
// otomatik gelir (Proxy mantığı).
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
 * Verilen dil için sözlük döndürür. Anahtar eksikse otomatik olarak EN'e
 * (ve nihayetinde TR'ye) düşer — UI'da hiçbir string boş kalmaz.
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

/** Sistem dilini otomatik tespit et (ilk açılışta default için). */
export function detectSystemLang() {
  try {
    const nav = (navigator.language || 'en').toLowerCase();
    const short = nav.split('-')[0];
    if (ALL[short]) return short;
    // zh-CN / zh-TW vb. için zh'ye düşür
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
