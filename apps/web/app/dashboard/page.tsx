"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";
import { LicenseResponse, formatLicenseDate, formatTrialDays } from "../lib/billing";
import { isCommercialDemoUser } from "../lib/roles";

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

type HealthSchedule = {
  scheduleStatus: "UPCOMING" | "OVERDUE";
};

type HealthEvent = {
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "OVERDUE";
};

export default function DashboardPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [healthSchedules, setHealthSchedules] = useState<HealthSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseResponse | null>(null);

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
        setHealthEvents([]);
        setHealthSchedules([]);
        router.replace(withBasePath("/onboarding"));
        return;
      }

      const query = `establishmentId=${encodeURIComponent(firstEstablishment.id)}`;
      const [paddocksResponse, stockResponse, movementsResponse, healthEventsResponse, healthSchedulesResponse] = await Promise.all([
        fetch(`${API_URL}/paddocks?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/stock?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/movements?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/health-events?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/health-schedules?${query}`, { cache: "no-store" }),
      ]);

      if (!paddocksResponse.ok || !stockResponse.ok || !movementsResponse.ok || !healthEventsResponse.ok || !healthSchedulesResponse.ok) {
        throw new Error("No se pudieron cargar los datos del dashboard.");
      }

      const paddocksData = (await paddocksResponse.json()) as { paddocks: Paddock[] };
      const stockData = (await stockResponse.json()) as { herds: Herd[] };
      const movementsData = (await movementsResponse.json()) as { movements: Movement[] };
      const healthEventsData = (await healthEventsResponse.json()) as { healthEvents: HealthEvent[] };
      const healthSchedulesData = (await healthSchedulesResponse.json()) as { schedules: HealthSchedule[] };

      setPaddocks(paddocksData.paddocks);
      if (paddocksData.paddocks.length === 0) {
        router.replace(withBasePath("/onboarding"));
        return;
      }
      setHerds(stockData.herds);
      setMovements(movementsData.movements);
      setHealthEvents(healthEventsData.healthEvents);
      setHealthSchedules(healthSchedulesData.schedules);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, [pathname]);

  useEffect(() => {
    fetch(`${API_URL}/auth/session`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ user?: { email?: string } }>;
      })
      .then((data) => setSessionEmail(data?.user?.email ?? null))
      .catch(() => setSessionEmail(null));

    fetch(`${API_URL}/billing/license`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<LicenseResponse>;
      })
      .then((data) => setLicense(data ?? null))
      .catch(() => setLicense(null));
  }, []);

  const isDemoUser = isCommercialDemoUser(sessionEmail);

  const cards = useMemo(() => {
    const totalStock = herds.reduce((accumulator, herd) => accumulator + herd.count, 0);
    const occupiedPaddocks = new Set(herds.filter((herd) => herd.count > 0).map((herd) => herd.paddockId)).size;
    const upcomingOperations = movements.filter((movement) => new Date(movement.occurredAt) > new Date()).length;
    const overdueHealth = healthSchedules.filter((item) => item.scheduleStatus === "OVERDUE").length;
    const pendingHealth = healthEvents.filter((item) => item.status === "PENDING").length;

    return [
      {
        title: "Stock por categoria",
        value: `${totalStock.toLocaleString("es-AR")} cabezas`,
      },
      {
        title: "Potreros ocupados",
        value: `${occupiedPaddocks} / ${paddocks.length}`,
      },
      {
        title: "Operaciones proximas",
        value: String(upcomingOperations),
      },
      {
        title: "Sanidad pendiente",
        value: String(pendingHealth),
      },
      {
        title: "Sanidad vencida",
        value: String(overdueHealth),
      },
    ];
  }, [healthEvents, healthSchedules, herds, paddocks.length, movements]);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <button
          className="rounded bg-slate-700 px-4 py-2 text-sm"
          onClick={() => void loadDashboardData()}
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

      {license?.activation.isTrialing ? (
        <section className="rounded-xl border border-sky-800/70 bg-sky-950/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Prueba activa</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Acceso completo habilitado por {formatTrialDays(license.activation.trialDaysLeft)}
              </h3>
              <p className="mt-1 text-sm text-slate-200">
                La prueba vence el {formatLicenseDate(license.subscription?.currentPeriodEnd)}. Activa la suscripcion antes de esa fecha para seguir sin cortes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {license.activation.pendingCheckout?.checkoutUrl ? (
                <a
                  href={license.activation.pendingCheckout.checkoutUrl}
                  className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                >
                  Activar suscripcion
                </a>
              ) : null}
              <Link
                href={withBasePath("/licencia")}
                className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-white transition hover:border-sky-400"
              >
                Ver detalles
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {isDemoUser ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Recorrido de demo</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-emerald-800/70 bg-emerald-950/20 p-4">
              <h3 className="text-sm font-semibold text-emerald-300">Modo Campo</h3>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Vista simple para usar en manga, potrero o recorrida. Sirve para cargar trabajo hecho, identificar animales
                y registrar novedades desde el celular.
              </p>
            </article>
            <article className="rounded-xl border border-sky-800/70 bg-sky-950/20 p-4">
              <h3 className="text-sm font-semibold text-sky-300">Modo Gestion</h3>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Espacio para supervisar resultados, ordenar tareas, consultar trazabilidad y mostrar una vision ejecutiva
                del establecimiento.
              </p>
            </article>
          </div>
        </section>
      ) : null}

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
            ? `${activeEstablishment.name} - ${activeEstablishment.timezone}`
            : "No hay establecimientos cargados"}
        </p>
      </section>
    </main>
  );
}
