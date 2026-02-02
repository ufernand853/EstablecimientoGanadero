export default function LoginPage() {
  return (
    <main className="rounded-lg bg-slate-900 p-6 shadow">
      <h2 className="text-xl font-semibold">Iniciar sesión</h2>
      <form className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          Email
          <input className="rounded bg-slate-800 p-2" placeholder="owner@estancias.local" />
        </label>
        <label className="grid gap-1 text-sm">
          Contraseña
          <input type="password" className="rounded bg-slate-800 p-2" placeholder="••••••••" />
        </label>
        <button className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Entrar
        </button>
      </form>
    </main>
  );
}
