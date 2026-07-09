"use client";

export default function AdminUsersPage() {
  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Cuenta General</h2>
      </header>

      <section className="rounded-lg bg-slate-900 p-6 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">Gestión simplificada</p>
        <p className="mt-2">
          Este tenant quedó configurado para trabajar con una única cuenta general asociada al plan contratado.
          Ya no mostramos ni administramos perfiles separados como administrador, supervisor u operador desde esta pantalla.
        </p>
        <p className="mt-4">
          Si más adelante querés volver a manejar múltiples accesos internos, lo reactivamos sobre esta misma base SaaS.
        </p>
      </section>
    </main>
  );
}
