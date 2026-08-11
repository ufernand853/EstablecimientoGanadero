"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BASE_PATH } from "../lib/base-path";
import { useI18n, type AppLanguage } from "../lib/i18n";

type HelpContent = {
  title: string;
  description: string;
  steps: string[];
  tip: string;
};

type HelpScreen = {
  path: string;
  content: Record<AppLanguage, HelpContent>;
};

const helpScreens: HelpScreen[] = [
  {
    path: "/",
    content: {
      es: { title: "Inicio", description: "Usá este panel para elegir rápidamente qué parte de la operación querés gestionar.", steps: ["Elegí Modo Campo para registrar trabajo desde el terreno.", "Entrá a Modo Gestión para consultar indicadores y controlar la operación.", "Usá las tarjetas para abrir directamente cada función."], tip: "Los accesos que ves dependen del rol de tu usuario." },
      pt: { title: "Início", description: "Use este painel para escolher rapidamente qual parte da operação deseja gerenciar.", steps: ["Escolha Modo Campo para registrar o trabalho no terreno.", "Entre no Modo Gestão para consultar indicadores e controlar a operação.", "Use os cartões para abrir diretamente cada função."], tip: "Os acessos exibidos dependem da função do seu usuário." },
    },
  },
  {
    path: "/operations",
    content: {
      es: { title: "Registrar operaciones", description: "Registrá movimientos de animales entre potreros y cambios de categoría por destete.", steps: ["Seleccioná el establecimiento y los potreros de origen y destino.", "Indicá el tipo, la categoría y la cantidad de animales.", "Revisá los datos y guardá el movimiento."], tip: "Si el potrero de destino todavía no existe, podés crear uno temporal escribiendo su nombre." },
      pt: { title: "Registrar operações", description: "Registre movimentações de animais entre piquetes e mudanças de categoria por desmame.", steps: ["Selecione o estabelecimento e os piquetes de origem e destino.", "Informe o tipo, a categoria e a quantidade de animais.", "Revise os dados e salve a movimentação."], tip: "Se o piquete de destino ainda não existe, crie um temporário informando seu nome." },
    },
  },
  {
    path: "/campo",
    content: {
      es: { title: "Modo Campo", description: "Registrá el trabajo diario desde el celular, incluso cuando la conexión sea inestable.", steps: ["Elegí el establecimiento y la acción que vas a realizar.", "Leé o ingresá la caravana y completá los datos solicitados.", "Revisá y confirmá el registro; si estás sin conexión, quedará pendiente para sincronizar."], tip: "Antes de terminar la jornada, verificá que no queden registros pendientes de sincronización." },
      pt: { title: "Modo Campo", description: "Registre o trabalho diário pelo celular, mesmo quando a conexão estiver instável.", steps: ["Escolha o estabelecimento e a ação que vai realizar.", "Leia ou informe o brinco e preencha os dados solicitados.", "Revise e confirme o registro; sem conexão, ele ficará pendente para sincronizar."], tip: "Antes de terminar a jornada, verifique se não há registros pendentes de sincronização." },
    },
  },
  {
    path: "/animals",
    content: {
      es: { title: "Consultar animales", description: "Creá y consultá la ficha individual de cada animal, junto con sus fotos.", steps: ["Elegí el establecimiento para cargar su listado.", "Buscá o seleccioná un animal para ver su información.", "Completá la ficha o adjuntá fotos y guardá los cambios."], tip: "La caravana identifica al animal: verificá el número antes de guardar." },
      pt: { title: "Consultar animais", description: "Crie e consulte a ficha individual de cada animal, junto com suas fotos.", steps: ["Escolha o estabelecimento para carregar a lista.", "Busque ou selecione um animal para ver suas informações.", "Preencha a ficha ou anexe fotos e salve as alterações."], tip: "O brinco identifica o animal: confira o número antes de salvar." },
    },
  },
  {
    path: "/dashboard",
    content: {
      es: { title: "Reportes", description: "Obtené una vista rápida del estado actual del establecimiento y sus indicadores clave.", steps: ["Revisá las tarjetas de stock, potreros y actividad.", "Prestá atención a las alertas y tareas sanitarias.", "Abrí el detalle desde cada acceso para investigar un indicador."], tip: "Los datos reflejan los registros cargados; mantené al día movimientos y tareas." },
      pt: { title: "Relatórios", description: "Obtenha uma visão rápida do estado atual do estabelecimento e seus principais indicadores.", steps: ["Confira os cartões de estoque, piquetes e atividade.", "Observe os alertas e as tarefas sanitárias.", "Abra os detalhes para investigar cada indicador."], tip: "Os dados refletem os registros lançados; mantenha movimentações e tarefas atualizadas." },
    },
  },
  {
    path: "/supervision",
    content: {
      es: { title: "Supervisión", description: "Centralizá alertas, incidentes y prioridades para decidir qué atender primero.", steps: ["Seleccioná el establecimiento.", "Revisá tareas vencidas, urgentes e incidentes abiertos.", "Usá el resumen o la consulta asistida para definir acciones."], tip: "Atendé primero los elementos marcados como críticos o urgentes." },
      pt: { title: "Supervisão", description: "Centralize alertas, incidentes e prioridades para decidir o que atender primeiro.", steps: ["Selecione o estabelecimento.", "Confira tarefas vencidas, urgentes e incidentes abertos.", "Use o resumo ou a consulta assistida para definir ações."], tip: "Atenda primeiro os itens marcados como críticos ou urgentes." },
    },
  },
  {
    path: "/gestion/tareas",
    content: {
      es: { title: "Tareas", description: "Planificá, asigná y seguí el trabajo pendiente del equipo.", steps: ["Creá una tarea con fecha, prioridad y responsable.", "Filtrá la lista para encontrar el trabajo relevante.", "Actualizá el estado a medida que avanza la tarea."], tip: "Una fecha límite y una prioridad claras ayudan a ordenar la jornada." },
      pt: { title: "Tarefas", description: "Planeje, atribua e acompanhe o trabalho pendente da equipe.", steps: ["Crie uma tarefa com data, prioridade e responsável.", "Filtre a lista para encontrar o trabalho relevante.", "Atualize o status conforme a tarefa avança."], tip: "Um prazo e uma prioridade claros ajudam a organizar a jornada." },
    },
  },
  {
    path: "/commands",
    content: {
      es: { title: "Modo IA", description: "Consultá información o prepará registros escribiendo instrucciones en lenguaje natural.", steps: ["Describí con claridad lo que querés consultar o registrar.", "Revisá la interpretación y las advertencias del asistente.", "Confirmá solamente cuando los datos propuestos sean correctos."], tip: "Incluí caravana, fecha, potrero y cantidad cuando correspondan. La IA nunca confirma una operación por vos." },
      pt: { title: "Modo IA", description: "Consulte informações ou prepare registros escrevendo instruções em linguagem natural.", steps: ["Descreva claramente o que deseja consultar ou registrar.", "Revise a interpretação e os avisos do assistente.", "Confirme somente quando os dados propostos estiverem corretos."], tip: "Inclua brinco, data, piquete e quantidade quando necessário. A IA nunca confirma uma operação por você." },
    },
  },
  {
    path: "/traceability",
    content: {
      es: { title: "Trazabilidad", description: "Consultá y registrá el historial de eventos asociado a una caravana.", steps: ["Seleccioná el establecimiento e ingresá la caravana.", "Consultá la línea de tiempo antes de agregar información.", "Elegí el tipo de evento, completá los datos y guardalo."], tip: "Registrá la fecha real del evento para conservar un historial confiable." },
      pt: { title: "Rastreabilidade", description: "Consulte e registre o histórico de eventos associado a um brinco.", steps: ["Selecione o estabelecimento e informe o brinco.", "Consulte a linha do tempo antes de adicionar informações.", "Escolha o tipo de evento, preencha os dados e salve."], tip: "Registre a data real do evento para manter um histórico confiável." },
    },
  },
  {
    path: "/insumos",
    content: {
      es: { title: "Insumos", description: "Controlá medicamentos, vacunas, alimentos, lotes disponibles y vencimientos.", steps: ["Creá o seleccioná un insumo.", "Registrá cada lote con cantidad, ubicación y vencimiento.", "Revisá las alertas y el stock disponible antes de usarlo."], tip: "Cargar lote y vencimiento permite anticipar faltantes y evitar productos vencidos." },
      pt: { title: "Insumos", description: "Controle medicamentos, vacinas, alimentos, lotes disponíveis e vencimentos.", steps: ["Crie ou selecione um insumo.", "Registre cada lote com quantidade, localização e validade.", "Confira os alertas e o estoque disponível antes do uso."], tip: "Informar lote e validade ajuda a antecipar faltas e evitar produtos vencidos." },
    },
  },
];

const normalizePath = (pathname: string) => {
  const withoutBase = BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  return withoutBase.length > 1 ? withoutBase.replace(/\/$/, "") : withoutBase || "/";
};

export function ContextualHelp() {
  const pathname = normalizePath(usePathname());
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const content = (helpScreens.find((screen) => screen.path === pathname) ?? helpScreens[0]).content[language];
  const labels = language === "pt"
    ? { button: "Ajuda", close: "Fechar ajuda", guide: "Guia desta tela", steps: "Como começar", tip: "Dica" }
    : { button: "Ayuda", close: "Cerrar ayuda", guide: "Guía de esta pantalla", steps: "Cómo empezar", tip: "Consejo" };

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-700/70 bg-emerald-950/40 px-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-900/50 sm:px-3" aria-haspopup="dialog" aria-expanded={open} aria-label={labels.button}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400 text-xs" aria-hidden="true">?</span>
        <span className="hidden sm:inline">{labels.button}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{labels.guide}</p>
                <h2 id={titleId} className="mt-2 text-2xl font-bold text-white">{content.title}</h2>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xl text-slate-300 transition hover:border-emerald-400 hover:text-white" aria-label={labels.close}>×</button>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              <p className="text-base leading-7 text-slate-200">{content.description}</p>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-white">{labels.steps}</h3>
                <ol className="mt-4 space-y-3">
                  {content.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-6 text-slate-300">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-bold text-slate-950">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <aside className="rounded-2xl border border-amber-700/60 bg-amber-950/30 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-300">{labels.tip}</p>
                <p className="mt-1 text-sm leading-6 text-amber-100">{content.tip}</p>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
