"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
  timezone: string;
  mapImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function EstablishmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC-3");
  const [mapImageUrl, setMapImageUrl] = useState("");
  const [mapByEstablishment, setMapByEstablishment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });

  const loadEstablishments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los establecimientos.");
      }
      const data = (await response.json()) as { establishments: Establishment[] };
      setEstablishments(data.establishments);
      setMapByEstablishment(
        data.establishments.reduce<Record<string, string>>((acc, establishment) => {
          acc[establishment.id] = establishment.mapImageUrl ?? "";
          return acc;
        }, {}),
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEstablishments();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError("Ingresá un nombre de establecimiento.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/establishments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          timezone: timezone.trim() || "UTC-3",
          mapImageUrl: mapImageUrl.trim() || null,
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo crear el establecimiento.");
      }
      setName("");
      setTimezone("UTC-3");
      setMapImageUrl("");
      setSuccess("Establecimiento creado correctamente.");
      await loadEstablishments();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  const handleSaveMap = async (establishmentId: string) => {
    const mapUrl = mapByEstablishment[establishmentId]?.trim() || null;
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_URL}/establishments/${establishmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapImageUrl: mapUrl }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo guardar el mapa del establecimiento.");
      }
      setSuccess("Mapa del establecimiento actualizado.");
      await loadEstablishments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    }
  };

  const handleCreateMapUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await toBase64(file);
      setMapImageUrl(dataUrl);
      setSuccess("Mapa cargado localmente. Guardá el establecimiento para persistirlo.");
      setError(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error inesperado al cargar imagen.");
    } finally {
      event.target.value = "";
    }
  };

  const handleExistingMapUpload = async (establishmentId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await toBase64(file);
      setMapByEstablishment((current) => ({ ...current, [establishmentId]: dataUrl }));
      setSuccess("Mapa cargado localmente. Presioná \"Guardar mapa\" para persistirlo.");
      setError(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error inesperado al cargar imagen.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Establecimientos</h2>
        <button
          className="rounded bg-slate-700 px-4 py-2 text-sm"
          type="button"
          onClick={loadEstablishments}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo establecimiento</h3>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
          <input
            className="rounded bg-slate-800 p-2 text-sm md:col-span-2"
            placeholder="URL del mapa del establecimiento (opcional)"
            value={mapImageUrl}
            onChange={(event) => setMapImageUrl(event.target.value)}
          />
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-300">O subir imagen de mapa</label>
            <input className="w-full rounded bg-slate-800 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:font-semibold" type="file" accept="image/*" onChange={handleCreateMapUpload} />
          </div>
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
            Crear
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Listado</h3>
        <div className="mt-3 grid gap-3">
          {establishments.length === 0 && <p className="text-sm text-slate-400">No hay establecimientos cargados.</p>}
          {establishments.map((establishment) => (
            <div key={establishment.id} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex-1">
                <p className="font-semibold">{establishment.name}</p>
                <p className="text-xs text-slate-400">{establishment.timezone}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-80 flex-1 rounded bg-slate-800 p-2 text-xs"
                    placeholder="URL del mapa para Incidentes"
                    value={mapByEstablishment[establishment.id] ?? ""}
                    onChange={(event) => setMapByEstablishment((current) => ({ ...current, [establishment.id]: event.target.value }))}
                  />
                  <label className="cursor-pointer rounded bg-slate-700 px-3 py-2 text-xs font-semibold">
                    Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handleExistingMapUpload(establishment.id, event)}
                    />
                  </label>
                  <button
                    className="rounded bg-slate-700 px-3 py-2 text-xs font-semibold"
                    type="button"
                    onClick={() => handleSaveMap(establishment.id)}
                  >
                    Guardar mapa
                  </button>
                </div>
              </div>
              <span className="text-xs text-slate-400">{establishment.id}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
