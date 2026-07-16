"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { es, type TranslationDictionary, type TranslationKey } from "./i18n/es";
import { pt } from "./i18n/pt";

export const LANGUAGE_STORAGE_KEY = "eg_language";

const dictionaries = {
  es,
  pt,
} satisfies Record<string, TranslationDictionary>;

export type AppLanguage = keyof typeof dictionaries;

type LanguageConfig = {
  code: AppLanguage;
  labelKey: TranslationKey;
};

export const AVAILABLE_LANGUAGES: LanguageConfig[] = [
  { code: "es", labelKey: "language.es" },
  { code: "pt", labelKey: "language.pt" },
];

const DEFAULT_LANGUAGE: AppLanguage = "es";

const isSupportedLanguage = (value: string | null): value is AppLanguage =>
  Boolean(value) && AVAILABLE_LANGUAGES.some((language) => language.code === value);

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey) => string;
  locale: string;
  voiceLocale: string;
};

const defaultDictionary = dictionaries[DEFAULT_LANGUAGE];

const defaultContextValue: I18nContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {
    // no-op fallback when provider is not mounted yet
  },
  t: (key: TranslationKey) => defaultDictionary[key],
  locale: defaultDictionary["locale.format"] ?? "es-UY",
  voiceLocale: defaultDictionary["voice.locale"] ?? "es-AR",
};

const I18nContext = createContext<I18nContextValue>(defaultContextValue);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isSupportedLanguage(saved)) {
        setLanguage(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // ignore storage errors
    }
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[language];
    return {
      language,
      setLanguage,
      t: (key: TranslationKey) => dictionary[key] ?? dictionaries[DEFAULT_LANGUAGE][key],
      locale: dictionary["locale.format"] ?? dictionaries[DEFAULT_LANGUAGE]["locale.format"] ?? "es-UY",
      voiceLocale: dictionary["voice.locale"] ?? dictionaries[DEFAULT_LANGUAGE]["voice.locale"] ?? "es-AR",
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
