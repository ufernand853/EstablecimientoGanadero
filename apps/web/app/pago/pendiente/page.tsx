import Link from "next/link";
import { withBasePath } from "../../lib/base-path";

export default function PaymentPendingPage() {
  return (
    <main className="space-y-6 py-8">
      <section className="rounded-[1.75rem] border border-amber-900 bg-amber-950/40 p-8 text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Pago pendiente</p>
        <h1 className="mt-4 text-3xl font-black text-white">La suscripción todavía no fue confirmada</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7">
          El checkout quedó pendiente en Mercado Pago. Cuando cambie el estado, el webhook actualizará automáticamente la suscripción del tenant.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={withBasePath("/login")} className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950">
            Volver al login
          </Link>
        </div>
      </section>
    </main>
  );
}
