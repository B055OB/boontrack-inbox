'use client';

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import idDictionary from '../../locales/id.json';
import enDictionary from '../../locales/en.json';
import { formatCurrency, formatNumber, formatDate, SupportedCurrency } from './formatters';

export type Locale = 'id' | 'en';

export const DICTIONARIES: Record<Locale, Record<string, any>> = {
  id: idDictionary,
  en: enDictionary,
};

export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALE_STORAGE_KEY = 'bt_locale';

/**
 * Resolves nested path string like "dashboard.overview" from a dictionary object.
 */
function getNestedValue(obj: Record<string, any>, path: string): string | null {
  if (!obj || !path) return null;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

/**
 * Interpolates template variables in string (e.g. "Total {count} contacts" -> "Total 50 contacts")
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in params ? String(params[key]) : `{${key}}`;
  });
}

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number | string | null | undefined, currency?: SupportedCurrency) => string;
  formatNumber: (value: number | string | null | undefined) => string;
  formatDate: (date: string | Date | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
}

export const I18nContext = createContext<I18nContextType | null>(null);

/**
 * Custom React Hook for i18n localization.
 * Can be used standalone or within an I18nProvider.
 */
export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext);

  // If used inside an I18nProvider, return context
  if (context) {
    return context;
  }

  // Standalone fallback hook (zero dependency on wrapper)
  return useStandaloneTranslation();
}

/**
 * Standalone implementation of useTranslation for components used outside the provider.
 */
function useStandaloneTranslation(): I18nContextType {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // On client mount, read saved locale from localStorage / cookie
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (stored && (stored === 'id' || stored === 'en')) {
        setLocaleState(stored);
        return;
      }

      // Check cookie
      const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_STORAGE_KEY}=([^;]*)`));
      if (match && (match[1] === 'id' || match[1] === 'en')) {
        setLocaleState(match[1] as Locale);
      }
    } catch {
      // Ignored for environments without storage access
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    if (newLocale !== 'id' && newLocale !== 'en') return;
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      document.cookie = `${LOCALE_STORAGE_KEY}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Ignore
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
      let val = getNestedValue(dict, key);

      // Fallback to default locale (ID) if not found in active locale
      if (val === null && locale !== DEFAULT_LOCALE) {
        val = getNestedValue(DICTIONARIES[DEFAULT_LOCALE], key);
      }

      // If still missing, return raw key
      if (val === null) {
        return key;
      }

      return interpolate(val, params);
    },
    [locale]
  );

  const formattedCurrency = useCallback(
    (amount: number | string | null | undefined, currency: SupportedCurrency = 'IDR') => {
      const intlLocale = locale === 'id' ? 'id-ID' : 'en-US';
      return formatCurrency(amount, currency, intlLocale);
    },
    [locale]
  );

  const formattedNumber = useCallback(
    (value: number | string | null | undefined) => {
      const intlLocale = locale === 'id' ? 'id-ID' : 'en-US';
      return formatNumber(value, intlLocale);
    },
    [locale]
  );

  const formattedDate = useCallback(
    (date: string | Date | number | null | undefined, options?: Intl.DateTimeFormatOptions) => {
      const intlLocale = locale === 'id' ? 'id-ID' : 'en-US';
      return formatDate(date, intlLocale, options);
    },
    [locale]
  );

  return useMemo(
    () => ({
      locale,
      setLocale,
      t,
      formatCurrency: formattedCurrency,
      formatNumber: formattedNumber,
      formatDate: formattedDate,
    }),
    [locale, setLocale, t, formattedCurrency, formattedNumber, formattedDate]
  );
}
