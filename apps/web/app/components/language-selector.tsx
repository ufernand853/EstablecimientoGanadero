"use client";

import { AVAILABLE_LANGUAGES, useI18n, type AppLanguage } from "../lib/i18n";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
      <span className="sr-only sm:not-sr-only">{t("language.label")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
        className="h-9 min-w-0 max-w-24 rounded-lg border border-slate-700 bg-slate-900/70 px-2 text-sm text-white outline-none transition focus:border-emerald-500 sm:max-w-none sm:px-3"
      >
        {AVAILABLE_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>{t(option.labelKey)}</option>
        ))}
      </select>
    </label>
  );
}
