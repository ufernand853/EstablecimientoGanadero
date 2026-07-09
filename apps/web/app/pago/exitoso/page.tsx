import Link from "next/link";
import { withBasePath } from "../../lib/base-path";

export default function PaymentSuccessPage() {
  return (
    <main className="space-y-6 py-8">
      <section className="rounded-[1.75rem] border border-emerald-900 bg-emerald-950/40 p-8 text-emerald-100">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Pago exitoso</p>
        <h1 className="mt-4 text-3xl font-black text-white">Suscripción enviada correctamente</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7">
          Mercado Pago notificará a Ganadería para activar la licencia del tenant. En cuanto se procese el webhook, el cliente podrá ingresar con su cuenta.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={withBasePath("/login")} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950">
            Ir al login
          </Link>
          <Link href={withBasePath("/planes")} className="rounded-2xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-200">
            Ver planes
          </Link>
        </div>
      </section>
    </main>
  );
}
