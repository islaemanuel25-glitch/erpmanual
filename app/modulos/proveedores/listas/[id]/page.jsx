"use client";

// CONCILIACIÓN de una importación.
//
// Página propia y a ancho completo, no modal: son 917 filas que se revisan con
// calma, se filtran y se comparten por URL. Un modal con esto adentro sería
// inservible.
//
// Desde acá se selecciona y se aplica. Es la única pantalla del módulo que
// escribe costos reales, así que la acción está separada de la revisión: primero
// se mira, después se marca, y recién al final se confirma en un panel aparte
// que dice proveedor, archivo, cantidad y qué pasa con el precio de venta.

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import PanelVincular from "@/components/proveedores/listas/PanelVincular";
import PanelAplicar from "@/components/proveedores/listas/PanelAplicar";
import FilaRevision from "@/components/proveedores/listas/FilaRevision";
import PanelMacheo from "@/components/proveedores/listas/PanelMacheo";
import PanelConfirmarArmado from "@/components/proveedores/listas/PanelConfirmarArmado";
import {
  BadgeEstado,
  Dato,
  ErrorRecuperable,
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

const PAGE_SIZE = 25;

/**
 * Las vistas de la revisión. El valor viaja al servidor, que es quien filtra:
 * la pantalla no puede filtrar por "con alerta" porque las alertas se calculan
 * comparando cada fila con el producto vivo, y para eso habría que traerse las
 * 917 filas en cada clic.
 */
const VISTAS = [
  { id: "todas", texto: "Todas" },
  { id: "seleccionadas", texto: "Seleccionadas" },
  { id: "listas", texto: "Listas pendientes" },
  { id: "aplicadas", texto: "Aplicadas" },
  { id: "alerta", texto: "Con alerta" },
  { id: "exactas", texto: "Exactas" },
  { id: "manuales", texto: "Manuales" },
  { id: "sinCeros", texto: "Sin ceros" },
  { id: "sufijo8", texto: "Sufijo 8" },
  { id: "sufijo7", texto: "Sufijo 7" },
  { id: "sufijo6", texto: "Sufijo 6" },
  { id: "sufijo5", texto: "Sufijo 5" },
  { id: "sufijo4", texto: "Sufijo 4" },
  { id: "codigoBarra", texto: "Código de barras" },
  // Mismo nombre que la tarjeta de progreso: el usuario busca "Revisar armado"
  // y el filtro se llamaba distinto.
  { id: "factorDudoso", texto: "Revisar armado" },
  { id: "sinVincular", texto: "Sin vincular" },
  { id: "ambiguas", texto: "Ambiguas" },
  { id: "excluidas", texto: "Excluidas" },
];

/**
 * ¿Esta fila admite vincularse?
 *
 * Solo las que no machearon, sin producto y sin aplicar. El backend vuelve a
 * validarlo —es la autoridad—; acá se decide si el botón se muestra, para no
 * ofrecer una acción que va a rebotar.
 */
function puedeVincular(fila) {
  return fila?.estado === "NO_MACHEADO" && fila?.productoBaseId == null && fila?.aplicada !== true;
}

/**
 * Qué mostrarle a la casilla de una fila.
 *
 * `seleccionable` lo calcula el backend con el mismo predicado que después
 * aplica: la pantalla no vuelve a decidirlo por su cuenta. Cuando la fila no se
 * puede marcar se pasa el motivo, para que el checkbox gris tenga explicación.
 */
const ESTADOS_ABIERTOS = ["CONCILIADA", "PARCIALMENTE_APLICADA"];

function seleccionDeFila(fila, importacion, onCambiar) {
  if (!importacion || !ESTADOS_ABIERTOS.includes(importacion.estado)) return null;
  const puede = fila?.seleccionable === true && fila?.aplicada !== true;
  return {
    puede,
    marcada: fila?.seleccionada === true,
    motivo: puede
      ? ""
      : fila?.aplicada === true
        ? "Esta fila ya se aplicó."
        : "Solo se pueden aplicar las filas listas para actualizar.",
    onCambiar,
  };
}

export default function ConciliacionPage() {
  const router = useRouter();
  const params = useParams();
  const busqueda = useSearchParams();
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
  const [macheo, setMacheo] = useState(null);

  // Los filtros arrancan de la URL: así una conciliación filtrada se puede
  // compartir por link y volver a abrir igual. Sin esto, pegar la URL con
  // ?estado=... mostraba la lista entera y el usuario veía otra cosa que quien
  // se la pasó.
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState(() => busqueda?.get("estado") ?? "");
  const [vista, setVista] = useState(() => busqueda?.get("vista") ?? "todas");
  const [q, setQ] = useState(() => busqueda?.get("q") ?? "");
  // El texto tipeado se separa del que se consulta: buscar en cada tecla sobre
  // 917 filas dispararía una consulta por letra.
  const [qAplicado, setQAplicado] = useState(() => busqueda?.get("q") ?? "");

  // Qué fila tiene el panel de vinculación abierto. Una sola por vez: dos
  // paneles abiertos invitan a confirmar el equivocado.
  const [vinculando, setVinculando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [avisoVinculo, setAvisoVinculo] = useState("");

  // ── Aplicación ──────────────────────────────────────────────────────────
  //
  // La selección vive en la BASE, no acá: la lista tiene miles de filas y se
  // navega paginada y filtrada. Un estado local se perdería al cambiar de
  // página, que es justo cuando el usuario está armando la selección.
  const [resumenSeleccion, setResumenSeleccion] = useState({ seleccionables: 0, seleccionadas: 0, aplicadas: 0 });
  const [trabajando, setTrabajando] = useState(false);
  const [errorAplicar, setErrorAplicar] = useState("");
  const [resultado, setResultado] = useState(null);
  const [previo, setPrevio] = useState(null);
  const [cargandoPrevio, setCargandoPrevio] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [trabajandoCancelar, setTrabajandoCancelar] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [trabajandoFinalizar, setTrabajandoFinalizar] = useState(false);

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
      if (vista && vista !== "todas") url.searchParams.set("vista", vista);
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
      if (json.seleccion) setResumenSeleccion(json.seleccion);
      if (json.macheo) setMacheo(json.macheo);
      if (json.progreso) setProgreso(json.progreso);
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, [id, page, estado, vista, qAplicado]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  /**
   * La fila vinculada vuelve del servidor ya recalculada, y el resumen con los
   * contadores nuevos. Se reemplaza en su lugar en vez de recargar todo: el
   * usuario no pierde el filtro ni la página en la que estaba.
   */
  const alVincular = (json) => {
    setFilas((prev) => prev.map((f) => (f.id === json.fila.id ? { ...f, ...json.fila } : f)));
    setCab((prev) => (prev ? { ...prev, ...json.resumen } : prev));
    setVinculando(null);
    setAvisoVinculo(
      `Fila ${json.fila.filaExcel} vinculada con ${json.fila.productoBase?.nombre ?? "el producto elegido"}. Nuevo estado: ${json.fila.estado}.`
    );
  };

  /**
   * La fila confirmada vuelve recalculada del servidor. Se recarga la página de
   * datos en vez de parchearla: al pasar a "lista" cambia de vista, cambian los
   * contadores y cambia el progreso, y parchear en memoria dejaría tres números
   * diciendo cosas distintas.
   */
  const alConfirmar = async (json) => {
    setConfirmando(null);
    setAvisoVinculo(
      json.quedoLista
        ? `Fila ${json.fila.filaExcel} confirmada con armado de ${json.factorConfirmado}. Ya está lista para aplicar.`
        : `Fila ${json.fila.filaExcel} confirmada: con ese armado el costo no cambia, así que no queda para aplicar.`
    );
    await cargar();
  };

  // ── Selección ───────────────────────────────────────────────────────────
  //
  // Cada cambio va al servidor, que es quien valida. La pantalla no decide si
  // una fila puede marcarse: dibuja lo que el backend ya declaró seleccionable.
  const mandarSeleccion = useCallback(
    async (cuerpo) => {
      setErrorAplicar("");
      try {
        const r = await fetch(`/api/proveedores/listas/${id}/seleccion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(cuerpo),
        });
        const json = await r.json();
        if (!r.ok || !json?.ok) {
          setErrorAplicar(json?.error || "No se pudo cambiar la selección.");
          return null;
        }
        setResumenSeleccion(json.resumen);
        const marcadas = new Set(json.seleccionadas ?? []);
        setFilas((prev) => prev.map((f) => ({ ...f, seleccionada: marcadas.has(f.id) })));
        return json;
      } catch {
        setErrorAplicar("Error de conexión.");
        return null;
      }
    },
    [id]
  );

  const alMarcarFila = (fila, marcada) =>
    mandarSeleccion({ accion: marcada ? "MARCAR" : "DESMARCAR", ids: [fila.id] });

  /**
   * Excluir e incluir recargan la página de datos en vez de parchear la fila:
   * excluir cambia el contador de seleccionables y, en la vista "excluidas",
   * hace que la fila entre o salga del listado. Parchear en memoria dejaría la
   * pantalla diciendo algo distinto de la base.
   */
  const cambiarExclusion = async (fila, excluir) => {
    const r = await mandarSeleccion({ accion: excluir ? "EXCLUIR" : "INCLUIR", ids: [fila.id] });
    if (r) await cargar();
  };

  /** El resumen final lo calcula el servidor sobre TODAS las seleccionadas. */
  const pedirPrevio = async () => {
    setCargandoPrevio(true);
    setPrevio(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/aplicar`, {
        credentials: "include", cache: "no-store",
      });
      const json = await r.json();
      if (r.ok && json?.ok) setPrevio(json);
      else setErrorAplicar(json?.error || "No se pudo calcular el resumen.");
    } catch {
      setErrorAplicar("Error de conexión.");
    } finally {
      setCargandoPrevio(false);
    }
  };

  /**
   * Cancelar deja el registro como historial y libera el archivo. No toca
   * costos, precios ni productos: es una decisión sobre el proceso.
   */
  const cancelarImportacion = async () => {
    setTrabajandoCancelar(true);
    setErrorAplicar("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/cancelar`, {
        method: "POST",
        credentials: "include",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErrorAplicar(json?.error || "No se pudo cancelar la importación.");
        return;
      }
      setCancelando(false);
      await cargar();
    } catch {
      setErrorAplicar("Error de conexión.");
    } finally {
      setTrabajandoCancelar(false);
    }
  };

  /** Cierra la importación por decisión del usuario. No aplica nada. */
  const finalizarImportacion = async () => {
    setTrabajandoFinalizar(true);
    setErrorAplicar("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/finalizar`, {
        method: "POST",
        credentials: "include",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErrorAplicar(json?.error || "No se pudo finalizar la importación.");
        return;
      }
      setFinalizando(false);
      await cargar();
    } catch {
      setErrorAplicar("Error de conexión.");
    } finally {
      setTrabajandoFinalizar(false);
    }
  };

  const aplicar = async (modoPrecioVenta) => {
    setTrabajando(true);
    setErrorAplicar("");
    setResultado(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/aplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modoPrecioVenta }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErrorAplicar(json?.error || "No se pudo aplicar la lista.");
        return;
      }
      setResultado(json);
      // Se recarga: la cabecera pasó a APLICADA y las filas traen su resultado.
      await cargar();
    } catch {
      setErrorAplicar("Error de conexión. No se aplicó nada.");
    } finally {
      setTrabajando(false);
    }
  };

  const seleccionDe = (f) => seleccionDeFila(f, cab, alMarcarFila);

  const buscar = () => {
    setPage(1);
    setQAplicado(q.trim());
  };
  const limpiar = () => {
    setQ("");
    setQAplicado("");
    setEstado("");
    setVista("todas");
    setPage(1);
  };
  const hayFiltros = !!estado || !!qAplicado || vista !== "todas";

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

            {/* ── Cancelar ─────────────────────────────────────────────
                Una importación que no sirve tiene que poder sacarse del medio.
                Antes no se podía, y además su archivo quedaba bloqueado para
                siempre: no había forma de subir el Excel corregido. */}
            {cab.estado === "CANCELADA" ? (
              <div className="sunmi-surface-soft sunmi-border border rounded-lg px-3 py-2">
                <span className="text-[12.5px] font-semibold sunmi-text-danger">
                  Importación cancelada
                </span>
                <p className="text-[11.5px] sunmi-text-muted leading-snug mt-0.5">
                  Queda solo como historial. No se puede aplicar y el archivo quedó liberado:
                  ya se puede volver a importar.
                </p>
              </div>
            ) : cab.estado !== "APLICADA" ? (
              <div className="flex flex-wrap items-center gap-2">
                <SunmiButton
                  color="slate"
                  onClick={() => setCancelando(true)}
                  disabled={trabajandoCancelar}
                  className="py-2 px-3 !text-[11.5px]"
                >
                  Cancelar importación
                </SunmiButton>
                {cancelando && (
                  <div className="w-full sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
                    <p className="text-[12px] sunmi-text-strong leading-snug">
                      ¿Cancelar esta importación? Queda como historial, se desmarcan todas las
                      filas y no se va a poder aplicar.
                    </p>
                    <p className="text-[11.5px] sunmi-text-muted leading-snug">
                      No se modifica ningún costo, precio ni producto. El archivo queda liberado
                      para volver a importarlo.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
                      <SunmiButton
                        color="slate"
                        onClick={() => setCancelando(false)}
                        disabled={trabajandoCancelar}
                        className="py-2 !text-xs order-2 sm:order-1"
                      >
                        No, volver
                      </SunmiButton>
                      <SunmiButton
                        color="red"
                        onClick={cancelarImportacion}
                        disabled={trabajandoCancelar}
                        className="py-2 font-bold !text-xs order-1 sm:order-2"
                      >
                        {trabajandoCancelar ? "Cancelando…" : "Sí, cancelar la importación"}
                      </SunmiButton>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {avisoVinculo && (
              <p className="text-[11.5px] sunmi-text-success leading-snug">{avisoVinculo}</p>
            )}

            {/* La barra de aplicación va ARRIBA de la tabla y fuera de ella: es
                una acción sobre el conjunto, no sobre una fila, y esconderla al
                final de 917 filas la volvería invisible. */}
            {cab.estado !== "CANCELADA" && cab.estado !== "APLICADA" && (
            <PanelAplicar
              importacion={cab}
              resumenSeleccion={resumenSeleccion}
              previo={previo}
              cargandoPrevio={cargandoPrevio}
              onPedirPrevio={pedirPrevio}
              trabajando={trabajando}
              onSeleccionarTodos={() => mandarSeleccion({ accion: "TODOS" })}
              onDeseleccionar={() => mandarSeleccion({ accion: "NINGUNO" })}
              onAplicar={aplicar}
              resultado={resultado}
              error={errorAplicar}
            />
            )}
            {cab.estado === "CANCELADA" && errorAplicar && (
              <p className="text-[12px] sunmi-text-danger">{errorAplicar}</p>
            )}

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
                  placeholder="Todos los estados"
                >
                  <SunmiSelectOption value="">Todos los estados</SunmiSelectOption>
                  {ESTADOS_FILTRABLES.map((e) => (
                    <SunmiSelectOption key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
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

          {/* ── Progreso de la importación ────────────────────────────────
              Aplicar una tanda no termina el trabajo. Estos cinco números son
              lo que dice si queda algo por hacer, y antes no existían: la
              pantalla seguía mostrando "101 listos" después de aplicar esas
              mismas 101, como si nada hubiera pasado. */}
          {!error && cab && progreso && (
            <SunmiCard className="p-3 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13.5px] font-bold sunmi-text-strong">Progreso</h2>
                {progreso.pendientes > 0 ? (
                  <span className="text-[11.5px] sunmi-text-warning">
                    Quedan {progreso.pendientes} filas por resolver
                  </span>
                ) : (
                  <span className="text-[11.5px] sunmi-text-success">No quedan filas pendientes</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { k: "aplicadas", t: "Aplicadas", v: progreso.aplicadas, tono: "sunmi-text-success", d: "Ya escribieron su costo. No se pueden volver a aplicar." },
                  { k: "listasPendientes", t: "Listas pendientes", v: progreso.listasPendientes, tono: "sunmi-text-accent", d: "Se pueden aplicar en la próxima tanda." },
                  { k: "requierenRevision", t: "Requieren revisión", v: progreso.requierenRevision, tono: "sunmi-text-warning", d: "Falta corregir el armado del producto." },
                  { k: "excluidas", t: "Excluidas", v: progreso.excluidas, tono: "sunmi-text-muted", d: "Se sacaron a mano de la aplicación." },
                  { k: "sinVincular", t: "Sin vincular", v: progreso.sinVincular, tono: "sunmi-text-muted", d: "No tienen producto del ERP asociado." },
                ].map((x) => (
                  <div key={x.k} className="sunmi-surface-soft rounded-lg p-2.5" title={x.d}>
                    <div className={`text-[19px] font-bold tabular-nums leading-none ${x.tono}`}>{x.v}</div>
                    <div className="text-[11.5px] sunmi-text-strong mt-1">{x.t}</div>
                    <div className="text-[10.5px] sunmi-text-muted leading-snug">{x.d}</div>
                  </div>
                ))}
              </div>

              {/* Cierre explícito: mientras haya pendientes, terminar es una
                  decisión, no una consecuencia de haber aplicado algo. */}
              {cab.estado !== "APLICADA" && cab.estado !== "CANCELADA" && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <SunmiButton
                    color="slate"
                    onClick={() => setFinalizando(true)}
                    disabled={trabajandoFinalizar}
                    className="py-2 px-3 !text-[11.5px]"
                  >
                    Finalizar importación
                  </SunmiButton>
                  <span className="text-[10.5px] sunmi-text-muted">
                    Cierra la lista sin aplicar lo que queda pendiente.
                  </span>
                  {finalizando && (
                    <div className="w-full sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
                      <p className="text-[12px] sunmi-text-strong leading-snug">
                        ¿Dar por terminada esta importación?
                        {progreso.pendientes > 0 && (
                          <> Quedan <span className="font-semibold">{progreso.pendientes}</span> filas
                          sin resolver y no se van a poder aplicar después.</>
                        )}
                      </p>
                      <p className="text-[11.5px] sunmi-text-muted leading-snug">
                        Las {progreso.aplicadas} ya aplicadas conservan su historial. No se modifica
                        ningún costo ni precio.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
                        <SunmiButton
                          color="slate"
                          onClick={() => setFinalizando(false)}
                          disabled={trabajandoFinalizar}
                          className="py-2 !text-xs order-2 sm:order-1"
                        >
                          No, seguir trabajando
                        </SunmiButton>
                        <SunmiButton
                          color="cyan"
                          onClick={finalizarImportacion}
                          disabled={trabajandoFinalizar}
                          className="py-2 font-bold !text-xs order-1 sm:order-2"
                        >
                          {trabajandoFinalizar ? "Finalizando…" : "Sí, finalizar la importación"}
                        </SunmiButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SunmiCard>
          )}

          {/* La sección de macheo va ARRIBA de todo el listado: responde la
              pregunta previa —cómo se encontró cada producto— antes de que el
              usuario empiece a revisar fila por fila. */}
          {!error && cab && (
            <PanelMacheo
              macheo={macheo}
              vista={vista}
              onVista={(v) => {
                setVista(v);
                setPage(1);
              }}
            />
          )}

          {/* ── Vistas ─────────────────────────────────────────────────── */}
          {!error && cab && (
            <div className="flex flex-wrap gap-1.5">
              {VISTAS.map((v) => {
                const activa = vista === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setVista(v.id);
                      setPage(1);
                    }}
                    aria-pressed={activa}
                    className={`px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${
                      activa
                        ? "sunmi-btn-base sunmi-btn-cyan border-transparent"
                        : "sunmi-border sunmi-text-muted"
                    }`}
                  >
                    {v.texto}
                  </button>
                );
              })}
            </div>
          )}

          {!cargando && !error && filas.length > 0 && (
            <>
              {/* Una sola lista para escritorio y móvil. La tarjeta pone los dos
                  lados enfrentados en pantalla ancha y los apila en el teléfono:
                  quince columnas en una tabla no se leen en ningún tamaño. */}
              <div className="space-y-2">
                {filas.map((f) => (
                  <Fragment key={f.id}>
                    <FilaRevision
                      fila={f}
                      seleccion={seleccionDe(f)}
                      onVincular={(x) => { setConfirmando(null); setVinculando(x); }}
                      onConfirmar={(x) => { setVinculando(null); setConfirmando(x); }}
                      onExcluir={(x) => cambiarExclusion(x, true)}
                      onIncluir={(x) => cambiarExclusion(x, false)}
                      trabajando={trabajando}
                    />
                    {confirmando?.id === f.id && (
                      <PanelConfirmarArmado
                        fila={f}
                        onConfirmada={alConfirmar}
                        onCerrar={() => setConfirmando(null)}
                        onVincularOtro={() => { setConfirmando(null); setVinculando(f); }}
                      />
                    )}
                    {vinculando?.id === f.id && (
                      <PanelVincular
                        importacionId={id}
                        fila={f}
                        onVinculada={alVincular}
                        onCerrar={() => setVinculando(null)}
                      />
                    )}
                  </Fragment>
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
