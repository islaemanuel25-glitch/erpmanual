// app/modulos/transferencias/page.jsx
//
// Listado de transferencias con el MISMO patrón visual y responsive que
// app/modulos/reportes-ventas/page.jsx: franja de filtros, métricas, cards hasta
// 1023 px y tabla desde 1024 px, badges de estado y navegación explícita al
// detalle con botón "Ver".
//
// Las piezas de presentación (SectionHead, MetricCard, EstadoTransferenciaBadge)
// están duplicadas a propósito al final de este archivo: en Ventas viven dentro
// de su propia page.jsx y extraerlas a components/ obligaría a modificar Ventas.
//
// Lo que NO cambia respecto de la versión anterior: carga automática, filtro por
// estado, rango de fechas, "Quitar filtros", configuración de columnas
// persistida, fila expandible con MiniInfo, permisos y alcance por ubicación
// (que resuelve la API, no la pantalla).
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, ArrowLeftRight, Boxes, Banknote } from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";

import ColumnSettingsModal from "@/components/transferencias/ColumnSettingsModal";
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

const COLUMN_DEFAULTS = {
  fecha: true,
  numero: true,
  ruta: true,
  items: true,
  enviada: true,
  recibida: true,
  estado: true,
  importe: false,
  acciones: true,
};

const COLUMNS_KEY = "transferencias-columns";
const SCROLL_KEY = "transferencias:scroll";

// Preferencias guardadas + columnas nuevas. Las claves viejas que ya no existen
// se descartan; las que sobreviven (estado, items, importe, acciones) conservan
// la elección del usuario en vez de resetearse.
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
  const [totalCostoGlobal, setTotalCostoGlobal] = useState(0);

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
  const [filaAbierta, setFilaAbierta] = useState(null);

  // ==============================
  // CONTEXTO DE RETORNO
  //
  // Al abrir el detalle se guarda la posición de scroll y los filtros vigentes;
  // al volver (botón del detalle o back del navegador) se restauran. Mismo
  // criterio que Ventas: sessionStorage, sin escribir la URL (evita loops
  // estado↔URL).
  // ==============================
  const hidratadoRef = useRef(false);
  const [scrollPendiente, setScrollPendiente] = useState(null);

  useEffect(() => {
    if (hidratadoRef.current) return;
    hidratadoRef.current = true;
    let raw = null;
    try { raw = sessionStorage.getItem(SCROLL_KEY); } catch {}
    if (!raw) return;
    try { sessionStorage.removeItem(SCROLL_KEY); } catch {}
    let ctx = null;
    try { ctx = JSON.parse(raw); } catch {}
    if (!ctx) return;
    if (typeof ctx.estado === "string") setEstado(ctx.estado);
    if (ctx.fechaDesde) setFechaDesde(ctx.fechaDesde);
    if (ctx.fechaHasta) setFechaHasta(ctx.fechaHasta);
    if (Number(ctx.page) > 0) setPage(Number(ctx.page));
    setScrollPendiente(Number(ctx.y) || 0);
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

  const irADetalle = (id) => {
    try {
      const el = getScrollEl();
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ y: el ? el.scrollTop : 0, id, estado, fechaDesde, fechaHasta, page })
      );
    } catch {}
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
        setTotalCostoGlobal(0);
        return;
      }

      setItems(json.items || []);
      setTotalPages(json.totalPages || 1);
      setTotal(json.total || 0);
      setTotalCostoGlobal(json.totalCostoGlobal || 0);
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
    // Ancho útil completo, igual que Ventas (que quitó su `max-w` a propósito).
    <div className="w-full min-h-full p-2 lg:p-3 space-y-3">
      <div className="flex justify-end">
        <SunmiBackButton href="/inicio" />
      </div>

      {/* Encabezado + filtros en una franja compacta */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        <div className="mb-3">
          <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
            Transferencias
          </h1>
          <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
            Historial de transferencias entre Depósito y Locales
          </p>
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

      {/* Resumen */}
      <section className="space-y-2">
        <SectionHead title="Resumen del período" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          <MetricCard icon={ArrowLeftRight} tone="link" label="Transferencias" value={formatCantidad(total)} />
          <MetricCard
            icon={Boxes}
            tone="accent"
            label="Con diferencias"
            value={formatCantidad(items.filter((t) => t.tieneDiferencias).length)}
          />
          <MetricCard
            icon={Banknote}
            tone="success"
            highlight
            label="Importe total transferido"
            value={money(totalCostoGlobal)}
            className="col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      {/* Listado */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <SectionHead
            title="Transferencias"
            subtitle={total ? `${total} transferencia${total === 1 ? "" : "s"}` : null}
          />
          {/* La configuración de columnas aplica SOLO a la tabla desktop; en cards
              la composición es fija, por eso el botón se oculta debajo de lg. */}
          <SunmiButton color="slate" onClick={() => setOpenCols(true)} className="hidden lg:inline-flex shrink-0">
            <Settings2 size={14} className="inline -mt-0.5" /> Columnas
          </SunmiButton>
        </div>

        <SunmiCard>
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
                  />
                ))}
              </div>

              {/* Desde 1024 px: tabla */}
              <div className="hidden lg:block overflow-x-auto">
                <TablaTransferencias
                  items={items}
                  columns={columns}
                  filaAbierta={filaAbierta}
                  setFilaAbierta={setFilaAbierta}
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

      <ColumnSettingsModal
        open={openCols}
        onClose={() => setOpenCols(false)}
        columns={columns}
        setColumns={setColumns}
      />
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
