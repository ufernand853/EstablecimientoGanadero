"use client";

import { useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { offlineFetch } from "./offline-queue";

const API_URL = getApiUrl();

const EVENT_TYPE_LABELS: Record<string, string> = {
  ASIGNACION_POTRERO: "Asignación a potrero",
  INSEMINACION: "Inseminación",
  "PREÑEZ_CONFIRMADA": "Preñez confirmada",
  VACUNACION_PENDIENTE: "Vacunación pendiente",
  VACUNACION_REALIZADA: "Vacunación realizada",
  DESPARASITACION: "Desparasitación",
  TRATAMIENTO: "Tratamiento",
  PESAJE: "Pesaje",
  TRASLADO: "Traslado",
  MUERTE: "Muerte",
  ENVIO_FRIGORIFICO: "Envío a frigorífico",
  OBSERVACION: "Observación",
};

export type AnimalScanInfo = {
  exists: boolean;
  id?: string;
  status?: string;
  category?: string;
  sex?: string;
  lastKnownPaddock?: string | null;
  lastEvent?: { type: string; occurredAt: string } | null;
};

export type ScanContext = {
  earTag: string;
  animal: AnimalScanInfo;
  recentEvents?: Array<{ type: string; occurredAt: string; notes?: string | null }>;
};

export type Paddock = { id: string; name: string };

type WizardStep =
  | "SELECT"
  | "ALTA"
  | "BAJA"
  | "VACUNA"
  | "TRATAMIENTO"
  | "DESPARASITACION"
  | "PESAJE"
  | "TRASLADO"
  | "INCIDENTE"
  | "INSEMINACION"
  | "PRENEZ"
  | "FRIGORIFICO"
  | "OBSERVACION";

const STEP_LABELS: Partial<Record<WizardStep, string>> = {
  ALTA: "Alta de animal",
  BAJA: "Baja",
  VACUNA: "Vacunación",
  TRATAMIENTO: "Tratamiento",
  DESPARASITACION: "Desparasitación",
  PESAJE: "Pesaje",
  TRASLADO: "Traslado",
  INCIDENTE: "Incidente",
  INSEMINACION: "Inseminación",
  PRENEZ: "Preñez confirmada",
  FRIGORIFICO: "Envío a frigorífico",
  OBSERVACION: "Observación",
};

type Props = {
  context: ScanContext;
  establishmentId: string;
  paddocks: Paddock[];
  onDone: (summary: string) => void;
  onCancel: () => void;
};

export function ScanWizard({ context, establishmentId, paddocks, onDone, onCancel }: Props) {
  const [step, setStep] = useState<WizardStep>("SELECT");
  const [form, setForm] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 10),
    paddockName: context.animal.lastKnownPaddock ?? "",
    sex: context.animal.sex ?? "HEMBRA",
    category: context.animal.category ?? "vaquillona",
    severity: "MEDIUM",
    motivo: "MUERTE",
    incidentType: "animal lesionado",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const doSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const occuredAt = form.date
        ? new Date(`${form.date}T12:00:00`).toISOString()
        : new Date().toISOString();

      if (step === "ALTA") {
        const animalResult = await offlineFetch(API_URL, "/animals", "POST", {
          establishmentId,
          earTag: context.earTag,
          name: `Caravana ${context.earTag}`,
          sex: form.sex,
          category: form.category,
          status: "ACTIVO",
          notes: form.notes || null,
        }, `Alta ${context.earTag}`);
        if (!animalResult.ok) throw new Error("No se pudo dar de alta el animal.");

        if (form.paddockName) {
          await offlineFetch(API_URL, "/traceability/events", "POST", {
            establishmentId,
            earTag: context.earTag,
            type: "ASIGNACION_POTRERO",
            paddockName: form.paddockName,
            source: "RFID",
            occurredAt: occuredAt,
          }, `Potrero ${context.earTag}`);
        }
        const suffix = animalResult.queued ? " (en cola, sin conexión)" : "";
        onDone(`${context.earTag} — alta registrada como ${form.category}${form.paddockName ? ` en ${form.paddockName}` : ""}${suffix}.`);
        return;
      }

      if (step === "BAJA") {
        const motivo = form.motivo;
        const eventType = motivo === "MUERTE" ? "MUERTE" : "ENVIO_FRIGORIFICO";
        const newStatus = motivo === "MUERTE" ? "MUERTO" : "VENDIDO";
        await offlineFetch(API_URL, "/traceability/events", "POST", {
          establishmentId,
          earTag: context.earTag,
          type: eventType,
          notes: [motivo, form.notes].filter(Boolean).join(" — ") || null,
          source: "RFID",
          occurredAt: occuredAt,
        }, `Baja ${context.earTag}`);
        const statusResult = await offlineFetch(API_URL, "/animals/status", "PATCH", {
          establishmentId,
          earTag: context.earTag,
          status: newStatus,
        }, `Estado ${context.earTag}`);
        if (!statusResult.ok) throw new Error("No se pudo actualizar el estado del animal.");
        const suffix = statusResult.queued ? " (en cola, sin conexión)" : "";
        onDone(`${context.earTag} — baja registrada (${motivo.toLowerCase()})${suffix}.`);
        return;
      }

      const eventTypeMap: Partial<Record<WizardStep, string>> = {
        VACUNA: "VACUNACION_REALIZADA",
        TRATAMIENTO: "TRATAMIENTO",
        DESPARASITACION: "DESPARASITACION",
        PESAJE: "PESAJE",
        TRASLADO: "TRASLADO",
        INSEMINACION: "INSEMINACION",
        PRENEZ: "PREÑEZ_CONFIRMADA",
        FRIGORIFICO: "ENVIO_FRIGORIFICO",
        OBSERVACION: "OBSERVACION",
      };

      if (step in eventTypeMap) {
        if (step === "PESAJE" && (!form.weight || isNaN(Number(form.weight)))) {
          throw new Error("Ingresá el peso en kg.");
        }
        if (step === "TRASLADO" && !form.paddockName) {
          throw new Error("Seleccioná el potrero destino.");
        }

        const payload: Record<string, unknown> = {
          establishmentId,
          earTag: context.earTag,
          type: eventTypeMap[step],
          source: "RFID",
          occurredAt: occuredAt,
        };
        if (form.paddockName) payload.paddockName = form.paddockName;
        if (form.product) payload.product = form.product;
        if (form.dose) payload.dose = form.dose;
        if (form.weight) payload.weight = Number(form.weight);
        if (form.notes) payload.notes = form.notes;

        const evResult = await offlineFetch(API_URL, "/traceability/events", "POST", payload, `${STEP_LABELS[step] ?? step} ${context.earTag}`);
        if (!evResult.ok) throw new Error("No se pudo guardar el evento.");

        if (step === "FRIGORIFICO") {
          await offlineFetch(API_URL, "/animals/status", "PATCH", {
            establishmentId,
            earTag: context.earTag,
            status: "VENDIDO",
          }, `Frigorífico ${context.earTag}`);
        }

        const suffix = evResult.queued ? " (en cola, sin conexión)" : "";
        onDone(`${context.earTag} — ${STEP_LABELS[step]?.toLowerCase() ?? step} registrado${suffix}.`);
        return;
      }

      if (step === "INCIDENTE") {
        if (!form.incidentNotes) throw new Error("Ingresá una descripción del incidente.");
        const incResult = await offlineFetch(API_URL, "/incidents", "POST", {
          establishmentId,
          title: `${form.incidentType} — ${context.earTag}`,
          description: form.incidentNotes,
          severity: form.severity,
          status: "OPEN",
          source: "MANUAL",
        }, `Incidente ${context.earTag}`);
        if (!incResult.ok) throw new Error("No se pudo guardar el incidente.");
        const suffix = incResult.queued ? " (en cola, sin conexión)" : "";
        onDone(`${context.earTag} — incidente registrado (${form.severity.toLowerCase()})${suffix}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        {step !== "SELECT" ? (
          <button
            type="button"
            onClick={() => { setStep("SELECT"); setError(null); }}
            className="shrink-0 text-sm text-slate-400"
          >
            ← Volver
          </button>
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-emerald-400">Caravana detectada</p>
          <p className="text-xl font-bold text-white truncate">{context.earTag}</p>
          {step !== "SELECT" && STEP_LABELS[step] ? (
            <p className="text-xs text-slate-400">{STEP_LABELS[step]}</p>
          ) : null}
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-sm text-slate-500">
          Cerrar ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Animal info (SELECT step only) */}
        {step === "SELECT" ? (
          <div className="px-4 pt-4">
            {context.animal.exists ? (
              <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-3">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {context.animal.category ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Categoría</p>
                      <p className="font-semibold capitalize text-slate-200">{context.animal.category}</p>
                    </div>
                  ) : null}
                  {context.animal.status ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Estado</p>
                      <p className="font-semibold text-emerald-300">{context.animal.status}</p>
                    </div>
                  ) : null}
                  {context.animal.lastKnownPaddock ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Último potrero</p>
                      <p className="font-semibold text-slate-200">{context.animal.lastKnownPaddock}</p>
                    </div>
                  ) : null}
                </div>
                {context.animal.lastEvent ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Último evento:{" "}
                    {EVENT_TYPE_LABELS[context.animal.lastEvent.type] ?? context.animal.lastEvent.type}{" "}
                    —{" "}
                    {new Date(context.animal.lastEvent.occurredAt).toLocaleDateString("es-UY")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-3">
                <p className="text-sm font-semibold text-amber-300">No registrada en este establecimiento</p>
                <p className="mt-1 text-xs text-slate-400">
                  Podés dar de alta, registrar un incidente u observación.
                </p>
              </div>
            )}

            {context.recentEvents && context.recentEvents.length > 0 ? (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Últimas acciones</p>
                <div className="space-y-2">
                  {context.recentEvents.map((ev, idx) => (
                    <div key={idx} className="flex items-baseline justify-between text-xs">
                      <span className="text-slate-300">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                      <span className="text-slate-500">
                        {new Date(ev.occurredAt).toLocaleDateString("es-UY")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Action grid */}
        {step === "SELECT" ? (
          <div className="px-4 pt-4 pb-6">
            <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">¿Qué querés registrar?</p>
            {context.animal.exists ? (
              <div className="grid grid-cols-3 gap-2">
                <ActionBtn label="Vacuna" icon="💉" step="VACUNA" setStep={setStep} />
                <ActionBtn label="Tratamiento" icon="💊" step="TRATAMIENTO" setStep={setStep} />
                <ActionBtn label="Desparasit." icon="🔬" step="DESPARASITACION" setStep={setStep} />
                <ActionBtn label="Pesaje" icon="⚖️" step="PESAJE" setStep={setStep} />
                <ActionBtn label="Traslado" icon="➜" step="TRASLADO" setStep={setStep} />
                <ActionBtn label="Inseminación" icon="🐄" step="INSEMINACION" setStep={setStep} />
                <ActionBtn label="Preñez" icon="✓" step="PRENEZ" setStep={setStep} />
                <ActionBtn label="Incidente" icon="⚠️" step="INCIDENTE" setStep={setStep} />
                <ActionBtn label="Frigorífico" icon="🏭" step="FRIGORIFICO" setStep={setStep} />
                <ActionBtn label="Observación" icon="📝" step="OBSERVACION" setStep={setStep} />
                <ActionBtn label="Baja/Muerte" icon="✕" step="BAJA" setStep={setStep} color="red" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <ActionBtn label="Alta" icon="+" step="ALTA" setStep={setStep} color="green" />
                <ActionBtn label="Incidente" icon="⚠️" step="INCIDENTE" setStep={setStep} />
                <ActionBtn label="Observación" icon="📝" step="OBSERVACION" setStep={setStep} />
              </div>
            )}
          </div>
        ) : null}

        {/* ALTA form */}
        {step === "ALTA" ? (
          <FormSection>
            <SelectField
              label="Categoría *"
              field="category"
              options={["vaquillona", "vaca", "ternero", "ternera", "toro", "novillo"]}
              form={form}
              update={update}
            />
            <SelectField
              label="Sexo *"
              field="sex"
              options={["HEMBRA", "MACHO"]}
              labels={{ HEMBRA: "Hembra", MACHO: "Macho" }}
              form={form}
              update={update}
            />
            <PaddockField paddocks={paddocks} form={form} update={update} label="Potrero (opcional)" />
            <DateField form={form} update={update} />
            <NotesField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* BAJA form */}
        {step === "BAJA" ? (
          <FormSection>
            <SelectField
              label="Motivo *"
              field="motivo"
              options={["MUERTE", "VENTA", "DESCARTE", "PERDIDA"]}
              labels={{ MUERTE: "Muerte", VENTA: "Venta", DESCARTE: "Descarte", PERDIDA: "Robo / Pérdida" }}
              form={form}
              update={update}
            />
            <DateField form={form} update={update} />
            <NotesField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* VACUNA / TRATAMIENTO / DESPARASITACION forms */}
        {(step === "VACUNA" || step === "TRATAMIENTO" || step === "DESPARASITACION") ? (
          <FormSection>
            <TextField
              label="Producto *"
              field="product"
              form={form}
              update={update}
              placeholder="Ej: Clostridial, Ivermectina..."
            />
            <TextField
              label="Dosis (opcional)"
              field="dose"
              form={form}
              update={update}
              placeholder="Ej: 5 ml"
            />
            <DateField form={form} update={update} />
            <NotesField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* PESAJE form */}
        {step === "PESAJE" ? (
          <FormSection>
            <TextField
              label="Peso en kg *"
              field="weight"
              form={form}
              update={update}
              placeholder="Ej: 380"
              inputType="number"
            />
            <DateField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* TRASLADO form */}
        {step === "TRASLADO" ? (
          <FormSection>
            <PaddockField paddocks={paddocks} form={form} update={update} label="Potrero destino *" required />
            <DateField form={form} update={update} />
            <NotesField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* INCIDENTE form */}
        {step === "INCIDENTE" ? (
          <FormSection>
            <SelectField
              label="Tipo de incidente"
              field="incidentType"
              options={[
                "animal lesionado",
                "renguera",
                "enfermedad",
                "alambre / infraestructura",
                "falta de agua",
                "otro",
              ]}
              form={form}
              update={update}
            />
            <SelectField
              label="Severidad"
              field="severity"
              options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]}
              labels={{ LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" }}
              form={form}
              update={update}
            />
            <NotesField
              form={form}
              update={update}
              label="Descripción *"
              field="incidentNotes"
            />
            <DateField form={form} update={update} />
          </FormSection>
        ) : null}

        {/* INSEMINACION / PRENEZ / FRIGORIFICO / OBSERVACION forms */}
        {(step === "INSEMINACION" || step === "PRENEZ" || step === "FRIGORIFICO" || step === "OBSERVACION") ? (
          <FormSection>
            <DateField form={form} update={update} />
            <NotesField form={form} update={update} />
          </FormSection>
        ) : null}
      </div>

      {/* Footer */}
      {step !== "SELECT" ? (
        <div className="border-t border-slate-800 bg-slate-950 px-4 py-4">
          {error ? <p className="mb-3 text-sm font-semibold text-red-400">{error}</p> : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={doSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("SELECT"); setError(null); }}
              className="rounded-xl border border-slate-600 px-5 py-3 text-base text-slate-300"
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionBtn({
  label,
  icon,
  step,
  setStep,
  color,
}: {
  label: string;
  icon: string;
  step: WizardStep;
  setStep: (s: WizardStep) => void;
  color?: "red" | "green";
}) {
  const base = "rounded-xl border p-3 text-center active:scale-95 transition-transform";
  const colorCls =
    color === "red"
      ? "border-red-800 bg-red-950/30 text-red-300"
      : color === "green"
        ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
        : "border-slate-700 bg-slate-900 text-slate-200";
  return (
    <button type="button" onClick={() => setStep(step)} className={`${base} ${colorCls}`}>
      <p className="text-lg leading-none">{icon}</p>
      <p className="mt-1 text-xs font-semibold leading-tight">{label}</p>
    </button>
  );
}

function FormSection({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5 px-4 py-4">{children}</div>;
}

function TextField({
  label,
  field,
  form,
  update,
  placeholder,
  inputType = "text",
}: {
  label: string;
  field: string;
  form: Record<string, string>;
  update: (k: string, v: string) => void;
  placeholder?: string;
  inputType?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <input
        type={inputType}
        value={form[field] ?? ""}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}

function NotesField({
  label = "Notas (opcional)",
  field = "notes",
  form,
  update,
}: {
  label?: string;
  field?: string;
  form: Record<string, string>;
  update: (k: string, v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <textarea
        rows={2}
        value={form[field] ?? ""}
        onChange={(e) => update(field, e.target.value)}
        className="w-full resize-none rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}

function DateField({
  form,
  update,
}: {
  form: Record<string, string>;
  update: (k: string, v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">Fecha</p>
      <input
        type="date"
        value={form.date ?? ""}
        onChange={(e) => update("date", e.target.value)}
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}

function SelectField({
  label,
  field,
  options,
  labels,
  form,
  update,
}: {
  label: string;
  field: string;
  options: string[];
  labels?: Record<string, string>;
  form: Record<string, string>;
  update: (k: string, v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <select
        value={form[field] ?? options[0]}
        onChange={(e) => update(field, e.target.value)}
        className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labels?.[opt] ?? opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function PaddockField({
  paddocks,
  form,
  update,
  label = "Potrero",
  required,
}: {
  paddocks: Paddock[];
  form: Record<string, string>;
  update: (k: string, v: string) => void;
  label?: string;
  required?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">
        {label}
        {required ? " *" : ""}
      </p>
      {paddocks.length > 0 ? (
        <select
          value={form.paddockName ?? ""}
          onChange={(e) => update("paddockName", e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Sin potrero</option>
          {paddocks.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={form.paddockName ?? ""}
          onChange={(e) => update("paddockName", e.target.value)}
          placeholder="Nombre del potrero"
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      )}
    </div>
  );
}
