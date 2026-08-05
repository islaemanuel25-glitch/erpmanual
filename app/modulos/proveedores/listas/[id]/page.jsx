"use client";

// CONCILIACIÓN de una importación.
//
// Página propia y a ancho completo, no modal: son 917 filas que se revisan con
// calma, se filtran y se comparten por URL. Un modal con esto adentro sería
// inservible.
//
// Todavía no hay ningún botón para aplicar: esta pantalla explica QUÉ pasaría.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import {
  BadgeEstado,
  Dato,
  ErrorRecuperable,
  FilaCard,
  FilaTabla,
  Paginacion,
  ResumenMetricas,
  Vacio,
} from "@/components/proveedores/listas/PiezasListas";
import {
  ESTADOS_FILTRABLES,
  metricasDeImportacion,
  fechaHora,
  tamanoArchivo,
  porcentaje,
} from "@/lib/proveedores/listas/presentacion";

const PAGE_SIZE = 50;

export default function ConciliacionPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cab, setCab] = useState(null);
  const [filas, setFilas] = useState([]);
  const [pag, setPag] = useState({ page: 1, paginas: 1, total: 0 });

  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  // El texto tipeado se separa del que se consulta: buscar en cada tecla sobre
  // 917 filas dispararía una consulta por letra.
  const [qAplicado, setQAplicado] = useState("");

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError("");
    try {
      const url = new URL(`/api/proveedores/listas/${id}`, window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      if (estado) url.searchParams.set("estado", estado);
      if (qAplicado) url.searchParams.set("q", qAplicado);

      const r = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        // Una importación de otro grupo da 404: no se revela que existe.
        setError(json?.error || "No se pudo cargar la conciliación.");
        return;
      }
      setCab(json.importacion);
      setFilas(json.filas ?? []);
      setPag(json.paginacion ?? { page: 1, paginas: 1, total: 0 });
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, [id, page, estado, qAplicado]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  const buscar = () => {
    setPage(1);
    setQAplicado(q.trim());
  };
  const limpiar = () => {
    setQ("");
    setQAplicado("");
    setEstado("");
    setPage(1);
  };
  const hayFiltros = !!estado || !!qAplicado;

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  return (
    <Marco router={router}>
      {cargando && !cab && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && error && !cab && <ErrorRecuperable mensaje={error} onReintentar={cargar} />}

      {cab && (
        <>
          {/* ── Cabecera ──────────────────────────────────────────────── */}
          <SunmiCard className="p-3 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
                  {cab.proveedor?.nombre ?? "Proveedor"}
                </h1>
                <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight break-all">
                  {cab.archivoNombre} · {tamanoArchivo(cab.archivoTamano)}
                </p>
              </div>
              <BadgeEstado estado={cab.estado} className="shrink-0" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <Dato label="Fecha">{fechaHora(cab.createdAt)}</Dato>
              <Dato label="Usuario">{cab.usuario?.nombre ?? "—"}</Dato>
              <Dato label="Recargo">{porcentaje(cab.recargoPct)}</Dato>
              <Dato label="Umbral de variación">{porcentaje(cab.umbralVariacionPct)}</Dato>
              <Dato label="Sugerencias por código de barras">{cab.sugerenciasCodigoBarras}</Dato>
              <Dato label="Formato">{cab.parser} v{cab.parserVersion}</Dato>
            </div>

            <ResumenMetricas metricas={metricasDeImportacion(cab)} />

            {/* Productos del proveedor que no vinieron en el archivo. Por ahora
                solo el contador: el endpoint no entrega el detalle todavía. */}
            <div className="sunmi-surface-soft sunmi-border border rounded-lg px-3 py-2">
              <span className="text-[12px] sunmi-text-strong font-semibold">
                {cab.faltantes} {cab.faltantes === 1 ? "producto vinculado" : "productos vinculados"} a este
                proveedor no {cab.faltantes === 1 ? "apareció" : "aparecieron"} en el archivo
              </span>
              <p className="text-[10.5px] sunmi-text-muted leading-snug mt-0.5">
                Pueden ser productos discontinuados o códigos que el proveedor dejó de informar.
                El listado detallado queda para una etapa posterior.
              </p>
            </div>
          </SunmiCard>

          {/* ── Filtros ───────────────────────────────────────────────── */}
          <SunmiCard className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <label htmlFor="filtro-estado" className="text-[11px] sunmi-text-muted block">
                  Estado
                </label>
                <SunmiSelectAdv
                  id="filtro-estado"
                  value={estado}
                  onChange={(v) => {
                    setEstado(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "Todos los estados" },
                    ...ESTADOS_FILTRABLES.map((e) => ({ value: e.valor, label: e.etiqueta })),
                  ]}
                  placeholder="Todos los estados"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="filtro-q" className="text-[11px] sunmi-text-muted block">
                  Buscar por código o descripción
                </label>
                <div className="flex gap-2">
                  <SunmiInput
                    id="filtro-q"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && buscar()}
                    placeholder="Ej: 10301 o KETCHUP"
                    autoComplete="off"
                    className="flex-1"
                  />
                  <SunmiButton color="cyan" onClick={buscar} className="py-2 px-3 !text-xs">
                    <Search size={14} aria-hidden="true" />
                  </SunmiButton>
                </div>
              </div>

              <SunmiButton
                color="slate"
                onClick={limpiar}
                disabled={!hayFiltros}
                className="py-2 !text-xs inline-flex items-center gap-1 disabled:opacity-40"
              >
                <X size={14} aria-hidden="true" />
                Limpiar
              </SunmiButton>
            </div>
          </SunmiCard>

          {/* ── Filas ─────────────────────────────────────────────────── */}
          {cargando && (
            <SunmiCard className="p-6">
              <SunmiLoader />
            </SunmiCard>
          )}

          {!cargando && error && <ErrorRecuperable mensaje={error} onReintentar={cargar} />}

          {!cargando && !error && filas.length === 0 && (
            <Vacio
              titulo={hayFiltros ? "Ninguna fila coincide con el filtro" : "Esta importación no tiene filas"}
              detalle={hayFiltros ? "Probá con otro estado o limpiá la búsqueda." : null}
              accion={
                hayFiltros ? (
                  <SunmiButton color="slate" onClick={limpiar} className="py-2 !text-xs">
                    Limpiar filtros
                  </SunmiButton>
                ) : null
              }
            />
          )}

          {!cargando && !error && filas.length > 0 && (
            <>
              {/* ESCRITORIO: tabla. */}
              <SunmiCard className="hidden lg:block p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="sunmi-border border-b">
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">#</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Código</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Descripción</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Producto ERP</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Proveedor</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Costo actual</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Propuesto</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Diferencia</th>
                        <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <FilaTabla key={f.id} fila={f} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </SunmiCard>

              {/* MÓVIL: cards. */}
              <div className="lg:hidden space-y-2">
                {filas.map((f) => (
                  <FilaCard key={f.id} fila={f} />
                ))}
              </div>

              <Paginacion
                page={pag.page}
                paginas={pag.paginas}
                total={pag.total}
                cargando={cargando}
                onPage={setPage}
              />
            </>
          )}
        </>
      )}
    </Marco>
  );
}

function Marco({ children, router }) {
  // Ancho completo: la conciliación necesita el espacio, y no es un modal.
  return (
    <div className="p-2 lg:p-3 space-y-3 w-full max-w-[1600px] mx-auto">
      <button
        type="button"
        onClick={() => router.push("/modulos/proveedores/listas")}
        className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver al historial
      </button>
      {children}
    </div>
  );
}
