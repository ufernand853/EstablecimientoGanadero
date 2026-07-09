import Link from "next/link";
import { withBasePath } from "../../lib/base-path";

export default function PaymentErrorPage() {
  return (
    <main className="space-y-6 py-8">
      <section className="rounded-[1.75rem] border border-rose-900 bg-rose-950/40 p-8 text-rose-100">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-300">Pago no completado</p>
        <h1 className="mt-4 text-3xl font-black text-white">No se pudo activar la suscripción</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7">
          El flujo de pago no terminó correctamente. El cliente puede volver a iniciar el alta o contactarnos para revisar la suscripción.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={withBasePath("/registro")} className="rounded-2xl bg-rose-300 px-4 py-3 text-sm font-bold text-slate-950">
            Intentar nuevamente
          </Link>
          <Link href={withBasePath("/planes")} className="rounded-2xl border border-rose-700 px-4 py-3 text-sm font-bold text-rose-200">
            Volver a planes
          </Link>
        </div>
      </section>
    </main>
  );
}
