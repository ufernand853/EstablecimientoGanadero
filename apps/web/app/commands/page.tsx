export default function CommandsPage() {
  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Comandos en español</h2>
        <p className="text-sm text-slate-300">
          Ingresá una instrucción y revisá la previsualización antes de confirmar.
        </p>
      </header>
      <div className="rounded-lg bg-slate-900 p-6">
        <textarea
          className="h-32 w-full rounded bg-slate-800 p-3 text-sm"
          placeholder="Ej: Mover 120 terneros del Potrero 3 al Potrero 7 hoy 16:00"
        />
        <div className="mt-4 flex gap-3">
          <button className="rounded bg-slate-700 px-4 py-2 text-sm">Previsualizar</button>
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
            Confirmar
          </button>
        </div>
      </div>
      <div className="rounded-lg bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Previsualización</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>Movimiento de 120 terneros · Potrero 3 → Potrero 7</li>
          <li>Advertencia: confirmar asignación de lote</li>
        </ul>
      </div>
    </main>
  );
}
