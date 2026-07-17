"use client";

import Link from "next/link";
import { withBasePath } from "../lib/base-path";
import { useI18n } from "../lib/i18n";

const MASTER_LINKS = [
  { href: withBasePath("/masters/herd-categories"), titleKey: "masters.categories.title", descriptionKey: "masters.categories.description" },
  { href: withBasePath("/masters/breeds"), titleKey: "masters.breeds.title", descriptionKey: "masters.breeds.description" },
  { href: withBasePath("/masters/movement-types"), titleKey: "masters.movementTypes.title", descriptionKey: "masters.movementTypes.description" },
  { href: withBasePath("/masters/consignors"), titleKey: "masters.consignors.title", descriptionKey: "masters.consignors.description" },
  { href: withBasePath("/masters/slaughterhouses"), titleKey: "masters.slaughterhouses.title", descriptionKey: "masters.slaughterhouses.description" },
] as const;

export default function MastersHubPage() {
  const { t } = useI18n();

  return (
    <main className="space-y-6">
      <header className="rounded-lg bg-slate-900 p-6 shadow">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">{t("masters.eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-black text-white">{t("masters.title")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t("masters.body")}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MASTER_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-lg border border-slate-800 bg-slate-900 p-5 transition hover:border-emerald-500">
            <h3 className="text-base font-semibold text-white">{t(item.titleKey)}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{t(item.descriptionKey)}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
