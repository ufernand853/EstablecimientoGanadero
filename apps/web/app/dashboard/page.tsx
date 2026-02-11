"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
  timezone: string;
};

type Paddock = {
  id: string;
};

type Herd = {
  paddockId: string;
  count: number;
};

type Movement = {
  occurredAt: string;
};

export default function DashboardPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeEstablishment = establishments[0] ?? null;

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const establishmentsResponse = await fetch(`${API_URL}/establishments`, {
        cache: "no-store",
      });

      if (!establishmentsResponse.ok) {
        throw new Error("No se pudieron cargar los establecimientos.");
      }

      const establishmentsData = (await establishmentsResponse.json()) as { establishments: Establishment[] };
      setEstablishments(establishmentsData.establishments);

      const firstEstablishment = establishmentsData.establishments[0];
      if (!firstEstablishment) {
        setPaddocks([]);
        setHerds([]);
        setMovements([]);
        return;
      }

      const query = `establishmentId=${encodeURIComponent(firstEstablishment.id)}`;
      const [paddocksResponse, stockResponse, movementsResponse] = await Promise.all([
        fetch(`${API_URL}/paddocks?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/stock?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/movements?${query}`, { cache: "no-store" }),
      ]);

      if (!paddocksResponse.ok || !stockResponse.ok || !movementsResponse.ok) {
        throw new Error("No se pudieron cargar los datos del dashboard.");
      }

      const paddocksData = (await paddocksResponse.json()) as { paddocks: Paddock[] };
      const stockData = (await stockResponse.json()) as { herds: Herd[] };
      const movementsData = (await movementsResponse.json()) as { movements: Movement[] };

      setPaddocks(paddocksData.paddocks);
      setHerds(stockData.herds);
      setMovements(movementsData.movements);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const cards = useMemo(() => {
    const totalStock = herds.reduce((accumulator, herd) => accumulator + herd.count, 0);
    const occupiedPaddocks = new Set(herds.filter((herd) => herd.count > 0).map((herd) => herd.paddockId)).size;
    const upcomingOperations = movements.filter((movement) => new Date(movement.occurredAt) > new Date()).length;

    return [
      {
        title: "Stock por categoría",
        value: `${totalStock.toLocaleString("es-AR")} cabezas`,
      },
      {
        title: "Potreros ocupados",
        value: `${occupiedPaddocks} / ${paddocks.length}`,
      },
      {
        title: "Operaciones próximas",
        value: String(upcomingOperations),
      },
    ];
  }, [herds, paddocks.length, movements]);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <button
          className="rounded bg-slate-700 px-4 py-2 text-sm"
          onClick={loadDashboardData}
          disabled={loading}
          type="button"
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </header>

      {error && (
        <section className="rounded-lg bg-red-950/50 p-4 text-sm text-red-200">
          {error}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg bg-slate-900 p-4">
            <p className="text-sm text-slate-400">{card.title}</p>
            <p className="text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg bg-slate-900 p-6">
        <h2 className="text-lg font-semibold">Establecimiento activo</h2>
        <p className="mt-2 text-slate-300">
          {activeEstablishment
            ? `${activeEstablishment.name} · ${activeEstablishment.timezone}`
            : "No hay establecimientos cargados"}
        </p>
      </section>
    </main>
  );
}
