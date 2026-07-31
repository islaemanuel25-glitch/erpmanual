// app/modulos/transferencias/page.jsx
//
// Listado de transferencias construido sobre la MISMA composición visual que
// app/modulos/reportes-ventas/page.jsx. No es "el mismo espíritu": es la misma
// estructura de bloques, en el mismo orden y con los mismos paddings.
//
//   contenedor  w-full min-h-full p-2 lg:p-3 space-y-3
//   1 · franja  SunmiCard p-3 overflow-visible !backdrop-blur-0 → título + filtros
//   2 · métricas section space-y-2 → SectionHead + grid 2/3/5 de MetricCard
//   3 · listado  section space-y-2 → SectionHead + acciones a la derecha, SunmiCard
//   4 · paginación dentro de la card, mt-3 pt-3 border-t
//
// Lo único que cambia es el CONTENIDO: acá los filtros son estado y período, las
// métricas cuentan transferencias y la tabla lista remitos. La lógica de Ventas
// no se importa ni se toca.
//
// Las piezas de presentación (SectionHead, MetricCard) están duplicadas a
// propósito al final de este archivo: en Ventas viven dentro de su propia
// page.jsx y extraerlas a components/ obligaría a modificar Ventas.
//
// El detalle NO se despliega debajo de la fila: vive en su propia página
// (/modulos/transferencias/[id]) y el único acceso es el botón "Ver
// transferencia", que guarda filtros, página y scroll para restaurarlos al
// volver. La configuración de columnas tampoco abre un modal: es un panel
// integrado dentro de la card del listado.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Settings2,
  ArrowLeftRight,
  Send,
  PackageCheck,
  TriangleAlert,
  Banknote,
} from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";

import ColumnSettingsPanel from "@/components/transferencias/ColumnSettingsPanel";
import TablaTransferencias from "@/components/transferencias/TablaTransferencias";
import CardTransferencia from "@/components/transferencias/CardTransferencia";

const TZ_AR = "America/Argentina/Cordoba";

// Estados OFRECIDOS como filtro. "Confirmando" y "Cancelando" son transitorios
// (viven dentro de una transacción) y no se ofrecen; "Pendiente" es el default
// del schema y ningún flujo lo escribe.
const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "Enviada", label: "Enviada" },
  { value: "Recibiendo", label: "Recibiendo" },
  { value: "Recibida", label: "Recibida" },
  { value: "Cancelada", label: "Cancelada" },
];

// El importe vuelve a estar visible por defecto: es la columna que hace de
// "Total" en la tabla de Ventas y sin ella la fila pierde su ancla derecha.
const COLUMN_DEFAULTS = {
  fecha: true,
  numero: true,
  ruta: true,
  items: true,
  enviada: true,
  recibida: true,
  estado: true,
  importe: true,
  acciones: true,
};

// Etiquetas de las columnas configurables. Viven acá —junto a COLUMN_DEFAULTS—
// para que agregar una columna sea un solo lugar a tocar.
const COLUMN_LABELS = {
  fecha: "Fecha / hora",
  numero: "Transferencia",
  ruta: "Origen / destino",
  items: "Ítems",
  enviada: "Enviada",
  recibida: "Recibida",
  estado: "Estado",
  importe: "Importe",
  acciones: "Acción",
};

const COLUMNS_KEY = "transferencias-columns";
const RETORNO_KEY = "transferencias:retorno";

// Contexto de retorno, con WHITELIST explícita — mismo criterio que
// lib/reportes-ventas/returnParams.js, implementado acá para no importar ni
// modificar nada de Ventas. Solo estos campos viajan y solo estos se leen: un
// valor inesperado en sessionStorage no puede inyectar estado arbitrario en la
// pantalla.
//
// Las columnas NO viajan en el contexto: ya persisten por su cuenta en
// localStorage, así que sobreviven a la navegación (y a cerrar el navegador).
function leerContextoRetorno() {
  let raw = null;
  try { raw = sessionStorage.getItem(RETORNO_KEY); } catch {}
  if (!raw) return null;
  try { sessionStorage.removeItem(RETORNO_KEY); } catch {}

  let ctx = null;
  try { ctx = JSON.parse(raw); } catch {}
  if (!ctx || typeof ctx !== "object") return null;

  const esFecha = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const pagina = Number(ctx.page);

  return {
    estado: ESTADOS.some((e) => e.value === ctx.estado) ? ctx.estado : null,
    fechaDesde: esFecha(ctx.fechaDesde) ? ctx.fechaDesde : null,
    fechaHasta: esFecha(ctx.fechaHasta) ? ctx.fechaHasta : null,
    page: Number.isInteger(pagina) && pagina > 0 ? pagina : null,
    y: Number.isFinite(Number(ctx.y)) ? Number(ctx.y) : 0,
  };
}

function guardarContextoRetorno(ctx) {
  try {
    sessionStorage.setItem(
      RETORNO_KEY,
      JSON.stringify({
        y: ctx.y,
        estado: ctx.estado,
        fechaDesde: ctx.fechaDesde,
        fechaHasta: ctx.fechaHasta,
        page: ctx.page,
      })
    );
  } catch {}
}

// Preferencias guardadas + columnas nuevas. Las claves viejas que ya no existen
// se descartan; las que sobreviven conservan la elección del usuario en vez de
// resetearse.
function normalizarColumnas(guardado) {
  const base = { ...COLUMN_DEFAULTS };
  if (!guardado || typeof guardado !== "object") return base;
  for (const clave of Object.keys(base)) {
    if (typeof guardado[clave] === "boolean") base[clave] = guardado[clave];
  }
  return base;
}

function fechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Cantidades: enteros sin decimales, fraccionarios con hasta 3 útiles (la escala
// física de StockLocal).
function formatCantidad(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  if (Number.isInteger(num)) return num.toLocaleString("es-AR");
  return num.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

function money(n) {
  return `$ ${Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// El contenedor scrolleable del layout es <main> (mismo criterio que Ventas).
function getScrollEl() {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hace30ISO() {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 30);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-${String(p.getDate()).padStart(2, "0")}`;
}

const RESUMEN_VACIO = {
  total: 0,
  enviadas: 0,
  recibidas: 0,
  conDiferencias: 0,
  importeTotal: 0,
};

export default function TransferenciasPage() {
  const router = useRouter();
  const { perfil: perfilTr, cargando: cargandoTr } = useUser();
  const permisosTr = perfilTr?.permisos || [];
  const esAdminTr = Array.isArray(permisosTr) && permisosTr.includes("*");

  const hoy = hoyISO();

  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState(hace30ISO);
  const [fechaHasta, setFechaHasta] = useState(hoyISO);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Métricas del PERÍODO completo (las calcula la API con el mismo filtro que el
  // listado). Contarlas sobre `items` daría cifras de la página visible, que no
  // cerrarían contra el total mostrado al lado.
  const [resumen, setResumen] = useState(RESUMEN_VACIO);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [columns, setColumns] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(COLUMNS_KEY);
        if (saved) return normalizarColumnas(JSON.parse(saved));
      } catch {}
    }
    return COLUMN_DEFAULTS;
  });

  const [openCols, setOpenCols] = useState(false);

  // ==============================
  // CONTEXTO DE RETORNO
  //
  // Al abrir el detalle se guardan filtros, página y posición de scroll; al
  // volver (botón del detalle o back del navegador) se restauran. Mismo criterio
  // que Ventas: sessionStorage, sin escribir la URL (evita loops estado↔URL).
  // ==============================
  const hidratadoRef = useRef(false);
  const [scrollPendiente, setScrollPendiente] = useState(null);

  useEffect(() => {
    if (hidratadoRef.current) return;
    hidratadoRef.current = true;
    const ctx = leerContextoRetorno();
    if (!ctx) return;
    if (ctx.estado != null) setEstado(ctx.estado);
    if (ctx.fechaDesde) setFechaDesde(ctx.fechaDesde);
    if (ctx.fechaHasta) setFechaHasta(ctx.fechaHasta);
    if (ctx.page) setPage(ctx.page);
    setScrollPendiente(ctx.y);
  }, []);

  // Restauración del scroll: recién cuando el listado terminó de cargar.
  useEffect(() => {
    if (scrollPendiente == null || loading) return;
    const y = scrollPendiente;
    setScrollPendiente(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = getScrollEl();
        if (el) el.scrollTop = y;
      })
    );
  }, [scrollPendiente, loading]);

  // ÚNICA vía de acceso al detalle. La fila y la card no navegan por sí mismas:
  // el detalle completo es una página propia, no un panel debajo de la fila.
  const irADetalle = (id) => {
    const el = getScrollEl();
    guardarContextoRetorno({
      y: el ? el.scrollTop : 0,
      estado,
      fechaDesde,
      fechaHasta,
      page,
    });
    router.push(`/modulos/transferencias/${id}`);
  };

  // ==============================
  // PERSISTENCIA DE COLUMNAS
  // ==============================
  useEffect(() => {
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)); } catch {}
  }, [columns]);

  // ==============================
  // CARGA DE TRANSFERENCIAS
  // ==============================
  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/transferencias/listar", window.location.origin);
      url.searchParams.set("page", String(page));
      if (estado) url.searchParams.set("estado", estado);
      if (fechaDesde) url.searchParams.set("fechaDesde", fechaDesde);
      if (fechaHasta) url.searchParams.set("fechaHasta", fechaHasta);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar transferencias");
        setItems([]);
        setTotalPages(1);
        setTotal(0);
        setResumen(RESUMEN_VACIO);
        return;
      }

      setItems(json.items || []);
      setTotalPages(json.totalPages || 1);
      setTotal(json.total || 0);
      setResumen({ ...RESUMEN_VACIO, ...(json.resumen || {}) });
    } catch {
      setError("Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  // Carga automática al montar y ante cualquier cambio de filtro o página.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [page, estado, fechaDesde, fechaHasta]);

  const quitarFiltros = () => {
    setEstado("");
    setFechaDesde(hace30ISO());
    setFechaHasta(hoyISO());
    setPage(1);
  };

  const prev = () => setPage((p) => Math.max(1, p - 1));
  const next = () => setPage((p) => Math.min(totalPages, p + 1));

  if (cargandoTr) return null;
  if (!esAdminTr && !permisosTr.includes("transferencias.ver")) return <SinPermisos />;

  return (
    // Mismo contenedor que Ventas: ancho útil completo (Ventas quitó su `max-w` a
    // propósito), padding p-2 / lg:p-3 y separación vertical space-y-3.
    <div className="w-full min-h-full p-2 lg:p-3 space-y-3">
      {/* 1 · Encabezado + filtros en una franja compacta (una sola fila en desktop) */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        {/* El botón Volver comparte fila con el título en lugar de flotar sobre la
            card: así la página arranca con el mismo bloque que Ventas y no con
            una franja suelta que rompe el ritmo vertical. */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              Transferencias
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Historial de transferencias entre Depósito y Locales
            </p>
          </div>
          <SunmiBackButton href="/inicio" className="shrink-0" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
          <div className="col-span-2 lg:col-span-1">
            <label className="text-[11px] sunmi-text-muted mb-1 block">Estado</label>
            <SunmiSelectAdv
              value={estado}
              onChange={(val) => { setEstado(val); setPage(1); }}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </SunmiSelectAdv>
          </div>

          <div className="col-span-2 lg:col-span-2">
            <label className="text-[11px] sunmi-text-muted mb-1 block">Período</label>
            <SunmiDateRangePicker
              valueDesde={fechaDesde}
              valueHasta={fechaHasta}
              onChangeDesde={setFechaDesde}
              onChangeHasta={setFechaHasta}
              onApply={(desde, hasta) => {
                setFechaDesde(desde);
                setFechaHasta(hasta);
                setPage(1);
              }}
              maxDate={hoy}
            />
          </div>

          <div className="col-span-2 lg:col-span-1">
            <SunmiButton
              color="slate"
              onClick={quitarFiltros}
              className="w-full font-semibold !border !border-[var(--pos-link)]"
            >
              Quitar filtros
            </SunmiButton>
          </div>
        </div>

        {error && (
          <div className="mt-2 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
            {error}
          </div>
        )}
      </SunmiCard>

      {/* 2 · Resumen del período — misma grilla de métricas que el resumen
          financiero de Ventas: 2 columnas en móvil, 3 en md y 5 en xl, con la
          última destacada y ocupando el ancho sobrante en móvil. */}
      <section className="space-y-2">
        <SectionHead title="Resumen del período" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
          <MetricCard
            icon={ArrowLeftRight}
            tone="link"
            label="Transferencias"
            value={formatCantidad(resumen.total)}
          />
          <MetricCard
            icon={Send}
            tone="accent"
            label="Enviadas"
            value={formatCantidad(resumen.enviadas)}
          />
          <MetricCard
            icon={PackageCheck}
            tone="success"
            label="Recibidas"
            value={formatCantidad(resumen.recibidas)}
          />
          <MetricCard
            icon={TriangleAlert}
            tone="warning"
            label="Con diferencias"
            value={formatCantidad(resumen.conDiferencias)}
          />
          <MetricCard
            icon={Banknote}
            tone="success"
            highlight
            label="Importe transferido"
            value={money(resumen.importeTotal)}
            className="col-span-2 md:col-span-1"
          />
        </div>
      </section>

      {/* 3 · Transferencias del período — sección protagonista. El encabezado y
          las acciones comparten fila, igual que el título de Ventas y sus tabs. */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <SectionHead
            title="Transferencias del período"
            subtitle={`${total} transferencia${total === 1 ? "" : "s"}`}
          />
          {/* Mismo contenedor segmentado que usan las tabs de Ventas, para que la
              acción quede alineada con el título y no suelta al costado. La
              configuración de columnas aplica SOLO a la tabla desktop; en cards
              la composición es fija, por eso se oculta debajo de lg. */}
          <div className="hidden lg:inline-flex p-0.5 rounded-lg sunmi-surface-soft sunmi-border shrink-0">
            <button
              type="button"
              onClick={() => setOpenCols((v) => !v)}
              aria-expanded={openCols}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${openCols ? "sunmi-pill-link shadow-sm" : "sunmi-text-muted hover:sunmi-text-strong"}`}
            >
              <Settings2 size={14} />
              Columnas
            </button>
          </div>
        </div>

        <SunmiCard>
          {/* Panel integrado, sin overlay: se despliega DENTRO de la card, arriba
              de la tabla, y no bloquea la lectura. */}
          {openCols && (
            <div className="hidden lg:block mb-3 pb-3 border-b sunmi-divider">
              <ColumnSettingsPanel
                open={openCols}
                onClose={() => setOpenCols(false)}
                columns={columns}
                setColumns={setColumns}
                labels={COLUMN_LABELS}
              />
            </div>
          )}

          {loading && (
            <div className="text-center py-8"><SunmiLoader /></div>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-10 sunmi-text-muted text-sm">
              No hay transferencias en el período seleccionado
            </div>
          )}

          {!loading && items.length > 0 && (
            <>
              {/* Hasta 1023 px: cards. Una por fila en 360/412, dos desde 768. */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((t) => (
                  <CardTransferencia
                    key={t.id}
                    t={t}
                    onVer={() => irADetalle(t.id)}
                    fechaHoraAR={fechaHoraAR}
                    formatCantidad={formatCantidad}
                    money={money}
                  />
                ))}
              </div>

              {/* Desde 1024 px: tabla */}
              <div className="hidden lg:block overflow-x-auto">
                <TablaTransferencias
                  items={items}
                  columns={columns}
                  onVer={irADetalle}
                  fechaHoraAR={fechaHoraAR}
                  formatCantidad={formatCantidad}
                  money={money}
                />
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 flex-wrap mt-3 pt-3 border-t sunmi-divider text-xs sunmi-text-muted">
                  <div>
                    Página {page} de {totalPages} · {total} transferencia{total === 1 ? "" : "s"}
                  </div>
                  <div className="flex gap-2">
                    <SunmiButton onClick={prev} disabled={page <= 1 || loading}>
                      Anterior
                    </SunmiButton>
                    <SunmiButton onClick={next} disabled={page >= totalPages || loading}>
                      Siguiente
                    </SunmiButton>
                  </div>
                </div>
              )}
            </>
          )}
        </SunmiCard>
      </section>
    </div>
  );
}

// ── Subcomponentes de presentación (solo UI) ─────────────────────────────────
// Duplicados del patrón de Ventas a propósito: allá viven dentro de su page.jsx
// y extraerlos a components/ obligaría a modificar Ventas.

function SectionHead({ title, subtitle }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{title}</h2>
      {subtitle && <p className="text-[11px] sunmi-text-muted leading-tight">{subtitle}</p>}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "neutral", highlight = false, className = "" }) {
  const toneColor = {
    neutral: "sunmi-text-strong",
    link: "sunmi-text-link",
    accent: "sunmi-text-accent",
    warning: "sunmi-text-warning",
    success: "sunmi-text-success",
  }[tone] || "sunmi-text-strong";
  const box = highlight ? "sunmi-state-success" : "sunmi-surface sunmi-border";
  return (
    // Móvil: icono arriba y valor a ancho completo (no se truncan importes grandes).
    // Desktop (sm+): icono a la izquierda con el texto al lado.
    <div className={`${box} rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${className}`}>
      <div className={`shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft ${toneColor}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
        <div className={`text-base sm:text-lg font-bold tabular-nums leading-tight ${toneColor}`}>{value}</div>
      </div>
    </div>
  );
}
