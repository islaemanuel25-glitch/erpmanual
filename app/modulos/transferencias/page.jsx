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
//
// FLUJO: es un REPORTE, no un listado reactivo. Igual que Ventas, la pantalla
// arranca vacía y no consulta nada hasta que el usuario pulsa "Generar reporte".
// Cambiar Desde, Hasta o Estado después NO dispara la búsqueda: los valores
// nuevos recién se aplican al volver a generar. Ver `reporteGenerado` y
// `filtrosVigentes` más abajo.
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
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import SunmiTable from "@/components/sunmi/SunmiTable";
import ColumnSettingsPanel from "@/components/transferencias/ColumnSettingsPanel";
import TablaTransferencias from "@/components/transferencias/TablaTransferencias";
import CardTransferencia from "@/components/transferencias/CardTransferencia";
import ReporteTransferenciasPorDestino from "@/components/transferencias/ReporteTransferenciasPorDestino";

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

// Modos de visualización del listado (las tabs). Mismo par que Ventas:
// documento por documento, o agrupado.
const VISTAS = ["transferencia", "destino"];

// Ordenamientos de la vista agrupada. Duplicados como literal —en vez de
// importarlos de lib/— porque este archivo es un componente cliente y la lista
// solo se usa para validar lo que vuelve de sessionStorage.
const ORDENES_DESTINO = [
  "mayorImporte",
  "menorImporte",
  "masTransferencias",
  "masReciente",
  "nombreAZ",
];

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
    // `generado` es lo que distingue "vuelvo del detalle" de "entro del menú".
    // Sin esta marca la pantalla arranca vacía, que es el comportamiento por
    // defecto: solo un retorno legítimo reconstruye el reporte solo.
    generado: ctx.generado === true,
    // Tab y orden también viajan: volver del detalle a "Por transferencia"
    // cuando se salió desde "Por destino" pierde el contexto de lectura.
    tab: VISTAS.includes(ctx.tab) ? ctx.tab : null,
    orden: ORDENES_DESTINO.includes(ctx.orden) ? ctx.orden : null,
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
        generado: ctx.generado,
        tab: ctx.tab,
        orden: ctx.orden,
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

// `null` = ninguna línea del producto tiene recepción cargada → "—".
// `0`    = se registró que no llegó nada                      → "0".
// Los dos casos NO se colapsan: uno significa "todavía no se sabe" y el otro
// "se sabe que no llegó".
function cantidadOGuion(n) {
  if (n === null || n === undefined) return "—";
  return formatCantidad(n);
}

// Color de la diferencia: solo un faltante real merece alarma. Sin recepción
// cargada no hay diferencia que juzgar.
function claseDiferencia(n) {
  if (n === null || n === undefined) return "sunmi-text-muted";
  if (Number(n) > 0) return "sunmi-text-warning";
  return "sunmi-text-muted";
}

// El contenedor scrolleable del layout es <main> (mismo criterio que Ventas).
function getScrollEl() {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
}

// Fecha de hoy en Argentina como YYYY-MM-DD (sin tocar UTC). Misma función que
// usa Ventas: el día lo define TZ_AR, no el reloj del dispositivo, así que un
// equipo con la zona mal configurada no corre el período un día.
function hoyArgentinaISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
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

  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState(hoyArgentinaISO);
  const [fechaHasta, setFechaHasta] = useState(hoyArgentinaISO);

  // Interruptor del flujo manual. Mientras sea false no se consulta la API y no
  // se renderiza ningún resultado: solo el mensaje inicial.
  const [reporteGenerado, setReporteGenerado] = useState(false);

  // Filtros del último "Generar reporte". La paginación usa ESTOS, no los
  // inputs: si el usuario cambia una fecha y pagina sin regenerar, la página 2
  // seguiría siendo del mismo reporte que está viendo.
  const [filtrosVigentes, setFiltrosVigentes] = useState(null);

  // Modo de visualización del listado, igual que las tabs de Ventas
  // ("Por venta" / "Por cliente"). El inicial es "Por transferencia".
  const [vista, setVista] = useState("transferencia");
  const [ordenDestino, setOrdenDestino] = useState("mayorImporte");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Métricas del PERÍODO completo (las calcula la API con el mismo filtro que el
  // listado). Contarlas sobre `items` daría cifras de la página visible, que no
  // cerrarían contra el total mostrado al lado.
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  // Agregados del período completo, tal como los devuelve la API. La pantalla
  // NO los recalcula desde `items`: `items` son 25 filas.
  const [desgloseEstado, setDesgloseEstado] = useState([]);
  const [productos, setProductos] = useState([]);
  const [truncado, setTruncado] = useState(false);

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
    // Sin contexto (entrada desde el menú) o con un contexto sin reporte
    // generado, la pantalla arranca vacía. No se consulta nada.
    if (!ctx || !ctx.generado) return;
    setScrollPendiente(ctx.y);
    if (ctx.tab) setVista(ctx.tab);
    if (ctx.orden) setOrdenDestino(ctx.orden);
    generarReporte({
      estado: ctx.estado ?? "",
      fechaDesde: ctx.fechaDesde ?? undefined,
      fechaHasta: ctx.fechaHasta ?? undefined,
      page: ctx.page ?? 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restauración del scroll: recién cuando el listado terminó de cargar. La
  // guarda de `reporteGenerado` evita restaurar sobre una pantalla vacía.
  useEffect(() => {
    if (scrollPendiente == null || loading || !reporteGenerado) return;
    const y = scrollPendiente;
    setScrollPendiente(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = getScrollEl();
        if (el) el.scrollTop = y;
      })
    );
  }, [scrollPendiente, loading, reporteGenerado, items]);

  // ÚNICA vía de acceso al detalle. La fila y la card no navegan por sí mismas:
  // el detalle completo es una página propia, no un panel debajo de la fila.
  const irADetalle = (id) => {
    const el = getScrollEl();
    // Se guardan los filtros VIGENTES —los que produjeron lo que está en
    // pantalla—, no los inputs: si el usuario tocó una fecha sin regenerar, al
    // volver debe reaparecer el reporte que estaba viendo, no otro.
    const f = filtrosVigentes || { estado, fechaDesde, fechaHasta };
    guardarContextoRetorno({
      y: el ? el.scrollTop : 0,
      generado: reporteGenerado,
      tab: vista,
      orden: ordenDestino,
      estado: f.estado,
      fechaDesde: f.fechaDesde,
      fechaHasta: f.fechaHasta,
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
  //
  // No hay ningún useEffect que dispare esto. Se llama desde dos lugares y
  // nada más: "Generar reporte" (vía generarReporte) y la paginación. Cambiar
  // un input no ejecuta nada.
  // ==============================
  const cargarPagina = async (pagina, filtrosOverride) => {
    const filtros = filtrosOverride || filtrosVigentes;
    if (!filtros) return;

    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/transferencias/listar", window.location.origin);
      url.searchParams.set("page", String(pagina));
      if (filtros.estado) url.searchParams.set("estado", filtros.estado);
      if (filtros.fechaDesde) url.searchParams.set("fechaDesde", filtros.fechaDesde);
      if (filtros.fechaHasta) url.searchParams.set("fechaHasta", filtros.fechaHasta);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar transferencias");
        setItems([]);
        setTotalPages(1);
        setTotal(0);
        setResumen(RESUMEN_VACIO);
        setDesgloseEstado([]);
        setProductos([]);
        setTruncado(false);
        return;
      }

      setItems(json.items || []);
      setTotalPages(json.totalPages || 1);
      setTotal(json.total || 0);
      setResumen({ ...RESUMEN_VACIO, ...(json.resumen || {}) });
      // Los tres vienen calculados sobre el barrido completo del período.
      setDesgloseEstado(json.resumenPorEstado || []);
      setProductos(json.productosMasTransferidos || []);
      setTruncado(json.truncado === true);
      setPage(pagina);
    } catch {
      setError("Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  // Único punto de entrada del reporte. Sin argumentos usa el ESTADO de los
  // inputs (botón "Generar reporte"); con `over` usa esos valores y sincroniza
  // los inputs — así reconstruye el reporte al volver del detalle, en la página
  // exacta en la que estaba.
  const generarReporte = async (over = null) => {
    const fd = over?.fechaDesde ?? fechaDesde;
    const fh = over?.fechaHasta ?? fechaHasta;
    const es = over?.estado ?? estado;
    const pg = over?.page ?? 1;

    if (!fd || !fh) {
      setError("Selecciona las fechas");
      return;
    }
    if (fd > fh) {
      setError("La fecha Desde no puede ser posterior a Hasta");
      return;
    }

    if (over) {
      if (over.fechaDesde != null) setFechaDesde(over.fechaDesde);
      if (over.fechaHasta != null) setFechaHasta(over.fechaHasta);
      if (over.estado != null) setEstado(over.estado);
    }

    setError("");
    const filtros = { estado: es, fechaDesde: fd, fechaHasta: fh };
    setFiltrosVigentes(filtros);
    setReporteGenerado(true);
    await cargarPagina(pg, filtros);
  };

  // Acción secundaria: vuelve los inputs a su estado inicial y borra el reporte
  // en pantalla. No sustituye a "Generar reporte" — solo aparece una vez que
  // hay un reporte que limpiar.
  const limpiar = () => {
    setEstado("");
    setFechaDesde(hoyArgentinaISO());
    setFechaHasta(hoyArgentinaISO());
    setReporteGenerado(false);
    setFiltrosVigentes(null);
    setItems([]);
    setTotalPages(1);
    setTotal(0);
    setResumen(RESUMEN_VACIO);
    setDesgloseEstado([]);
    setProductos([]);
    setTruncado(false);
    setVista("transferencia");
    setPage(1);
    setError("");
  };

  const prev = () => cargarPagina(Math.max(1, page - 1));
  const next = () => cargarPagina(Math.min(totalPages, page + 1));

  if (cargandoTr) return null;
  if (!esAdminTr && !permisosTr.includes("transferencias.ver")) return <SinPermisos />;

  return (
    // Mismo contenedor que Ventas: ancho útil completo (Ventas quitó su `max-w` a
    // propósito), padding p-2 / lg:p-3 y separación vertical space-y-3.
    <div className="w-full min-h-full p-2 lg:p-3 space-y-3">
      {/* 1 · Encabezado + filtros en una franja compacta (una sola fila en desktop) */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        {/* Encabezado idéntico al de Ventas: solo título y subtítulo. No lleva
            botón Volver — la barra superior ya ofrece "Inicio" en las dos
            pantallas, y agregarlo acá rompía la simetría de la franja. */}
        <div className="mb-3">
          <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
            Transferencias
          </h1>
          <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
            Historial de transferencias entre Depósito y Locales
          </p>
        </div>

        {/* Misma grilla que Ventas: 2 columnas en móvil, 4 en lg, alineadas al
            pie. Los tres primeros huecos son Desde / Hasta / tercer filtro y el
            cuarto es el botón que genera. Acá el tercer filtro es Estado; en
            Ventas es Forma de pago. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div className="col-span-2 lg:col-span-1 relative">
            <label className="text-[11px] sunmi-text-muted mb-1 block">Estado</label>
            <SunmiSelectAdv
              value={estado}
              onChange={(val) => setEstado(val)}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </SunmiSelectAdv>
          </div>

          <div className="col-span-2 lg:col-span-1">
            <SunmiButton
              color="amber"
              onClick={() => generarReporte()}
              disabled={loading}
              className="w-full font-semibold"
            >
              {loading ? "Cargando…" : "Generar reporte"}
            </SunmiButton>
          </div>
        </div>

        {/* Acción secundaria, deliberadamente discreta y solo cuando hay algo
            que limpiar: no compite con "Generar reporte" ni ocupa la grilla. */}
        {reporteGenerado && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={limpiar}
              className="text-[11px] sunmi-text-muted hover:sunmi-text-strong underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          </div>
        )}

        {error && (
          <div className="mt-2 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
            {error}
          </div>
        )}
      </SunmiCard>

      {/* Loader entre la franja y los resultados, igual que Ventas. */}
      {loading && (
        <div className="text-center py-8">
          <SunmiLoader />
        </div>
      )}

      {/* Resultados: SOLO después de generar. Mismo gate que Ventas usa con
          `reporte && !loading`. */}
      {reporteGenerado && !loading && (
        <>
      {/* Truncamiento explícito del período. Nunca en silencio. */}
      {truncado && (
        <div className="sunmi-state-warning sunmi-border rounded-lg px-3 py-2 flex items-start gap-2 text-[12px]">
          <TriangleAlert size={15} className="shrink-0 mt-0.5 sunmi-text-warning" />
          <span className="sunmi-text-strong">
            El período supera las 5000 transferencias. El resumen, el desglose y los
            productos se calcularon sobre las 5000 más recientes: acotá el rango de
            fechas para ver el total completo.
          </span>
        </div>
      )}

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

      {/* 3 · Desglose por estado — bloque secundario, mismo lugar y misma
          composición que "Desglose por forma de pago" en Ventas: SectionHead,
          SunmiCard, overflow-x-auto y SunmiTable.

          NO hay fila "Con diferencias": sería un estado inventado y rompería que
          la columna Transferencias sume el total del período. Las diferencias
          van como texto secundario debajo del nombre del estado, con el mismo
          recurso tipográfico que la tabla de Ventas usa para Cliente / Ticket. */}
      {desgloseEstado.length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Desglose por estado" />
          <SunmiCard>
            <div className="overflow-x-auto">
              <SunmiTable
                headers={[
                  "Estado",
                  { label: "Transferencias", className: "text-center" },
                  { label: "Ítems", className: "text-center" },
                  { label: "Importe", className: "text-right" },
                ]}
              >
                {desgloseEstado.map((f) => (
                  <tr key={f.estado} className="sunmi-row-hover transition-colors border-t sunmi-divider">
                    <td className="px-3 py-2.5">
                      <div className="font-medium sunmi-text-strong">{f.estado}</div>
                      {f.conDiferencias > 0 && (
                        <div className="text-[11px] sunmi-text-warning">
                          {f.conDiferencias} con diferencia{f.conDiferencias === 1 ? "" : "s"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{f.cantidadTransferencias}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{f.cantidadItems}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(f.importeTotal)}</td>
                  </tr>
                ))}
              </SunmiTable>
            </div>
          </SunmiCard>
        </section>
      )}

      {/* 4 · Transferencias del período — sección protagonista. El encabezado y
          las acciones comparten fila, igual que el título de Ventas y sus tabs. */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <SectionHead
            title="Transferencias del período"
            subtitle={`${total} transferencia${total === 1 ? "" : "s"}`}
          />
          <div className="flex items-center gap-2 shrink-0">
            {/* Tabs segmentadas idénticas a las de Ventas (Por venta / Por cliente). */}
            <div className="inline-flex p-0.5 rounded-lg sunmi-surface-soft sunmi-border shrink-0">
              <button
                type="button"
                onClick={() => setVista("transferencia")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === "transferencia" ? "sunmi-pill-link shadow-sm" : "sunmi-text-muted hover:sunmi-text-strong"}`}
              >
                Por transferencia
              </button>
              <button
                type="button"
                onClick={() => setVista("destino")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === "destino" ? "sunmi-pill-link shadow-sm" : "sunmi-text-muted hover:sunmi-text-strong"}`}
              >
                Por destino
              </button>
            </div>

            {/* Columnas solo aplica a la tabla de "Por transferencia": en el
                agrupado no hay columnas que configurar, y en cards la
                composición es fija (por eso también se oculta debajo de lg). */}
            {vista === "transferencia" && (
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
            )}
          </div>
        </div>

        <SunmiCard>
          {/* Vista agrupada por destino. Se monta SOLO cuando la tab está
              activa: el endpoint no se consulta mientras se mira la tabla. */}
          {vista === "destino" && (
            <ReporteTransferenciasPorDestino
              filtros={filtrosVigentes}
              orden={ordenDestino}
              onOrdenChange={setOrdenDestino}
              onVerTransferencia={irADetalle}
            />
          )}

          {vista === "transferencia" && (<>
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

          {items.length === 0 && (
            <div className="text-center py-10 sunmi-text-muted text-sm">
              No hay transferencias en el período seleccionado
            </div>
          )}

          {items.length > 0 && (
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
          </>)}
        </SunmiCard>
      </section>

      {/* 5 · Productos más transferidos — mismo bloque de cierre que "Productos
          más vendidos" en Ventas. Sale del barrido del período, no de la página.

          Desktop: tabla desde md. Móvil: cards, para no obligar a scrollear en
          horizontal una tabla de 5 columnas numéricas. */}
      {productos.length > 0 && (
        <section className="space-y-2">
          <SectionHead
            title="Productos más transferidos"
            subtitle={`${productos.length} producto${productos.length === 1 ? "" : "s"} · ordenados por importe`}
          />
          <SunmiCard>
            {/* Hasta 767 px: cards */}
            <div className="md:hidden space-y-2">
              {productos.map((p, idx) => (
                <div key={p.productoId ?? `n${idx}`} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-semibold sunmi-text-strong text-[14px] leading-tight">
                      {p.nombre}
                    </div>
                    <div className="font-mono font-bold text-[15px] sunmi-text-strong whitespace-nowrap tabular-nums">
                      {money(p.importeTransferido)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div>
                      <div className="text-[10px] sunmi-text-muted">Enviada</div>
                      <div className="tabular-nums sunmi-text-strong">{formatCantidad(p.cantidadEnviada)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] sunmi-text-muted">Recibida</div>
                      <div className={`tabular-nums ${p.cantidadRecibida == null ? "sunmi-text-muted" : "sunmi-text-strong"}`}>
                        {cantidadOGuion(p.cantidadRecibida)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] sunmi-text-muted">Diferencia</div>
                      <div className={`tabular-nums ${claseDiferencia(p.diferencia)}`}>
                        {cantidadOGuion(p.diferencia)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desde 768 px: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <SunmiTable
                headers={[
                  "Producto",
                  { label: "Enviada", className: "text-right" },
                  { label: "Recibida", className: "text-right" },
                  { label: "Diferencia", className: "text-right" },
                  { label: "Importe transferido", className: "text-right" },
                ]}
              >
                {productos.map((p, idx) => (
                  <tr key={p.productoId ?? `n${idx}`} className="sunmi-row-hover transition-colors border-t sunmi-divider">
                    <td className="px-3 py-2.5 font-medium truncate max-w-[260px]">{p.nombre}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCantidad(p.cantidadEnviada)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.cantidadRecibida == null ? "sunmi-text-muted" : ""}`}>
                      {cantidadOGuion(p.cantidadRecibida)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${claseDiferencia(p.diferencia)}`}>
                      {cantidadOGuion(p.diferencia)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums sunmi-text-strong font-semibold">
                      {money(p.importeTransferido)}
                    </td>
                  </tr>
                ))}
              </SunmiTable>
            </div>
          </SunmiCard>
        </section>
      )}
        </>
      )}

      {/* Estado inicial: mismo bloque, mismo texto y mismo espaciado que el
          "sin datos" de Ventas. Es lo único que se ve al entrar. */}
      {!reporteGenerado && !loading && (
        <SunmiCard className="p-3">
          <div className="text-center py-12 sunmi-text-muted">
            Seleccioná las fechas y generá el reporte
          </div>
        </SunmiCard>
      )}
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
