"use client";

import { AVAILABLE_LANGUAGES, useI18n, type AppLanguage } from "../lib/i18n";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <span>{t("language.label")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
        className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
      >
        {AVAILABLE_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>{t(option.labelKey)}</option>
        ))}
      </select>
    </label>
  );
}
