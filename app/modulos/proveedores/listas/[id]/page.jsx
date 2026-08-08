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

import { useCallback, useEffect, useState } from "react";
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
import GrillaConciliacion from "@/components/proveedores/listas/GrillaConciliacion";
import PanelMacheo from "@/components/proveedores/listas/PanelMacheo";
import VistaProductosSistema from "@/components/proveedores/listas/VistaProductosSistema";
import ResumenConciliacion from "@/components/proveedores/listas/ResumenConciliacion";
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
  porcentaje,
} from "@/lib/proveedores/listas/presentacion";


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
  // Cuántas filas por página. Quien revisa 190 productos quiere elegir cuánto
  // barre de una: 25 para mirar con calma, 100 para pasar rápido.
  const [pageSize, setPageSize] = useState(25);
  /**
   * Qué muestra el área principal.
   *
   *   CONCILIACION  la grilla de filas del archivo. Es el modo normal.
   *   PENDIENTES    la MISMA grilla, acotada a los productos que faltan. No es
   *                 otra pantalla: son las filas de esos productos, con sus
   *                 acciones reales.
   *   AUSENTES      productos del ERP que la lista no informó.
   *   SIN_CODIGO    productos sin el código del proveedor guardado.
   *
   * Los dos últimos no tienen filas ni precio nuevo, así que se muestran como
   * productos y ofrecen abrir la ficha, no confirmar nada.
   */
  const [modo, setModo] = useState("CONCILIACION");
  // Los productos a los que se acota la grilla en el modo PENDIENTES.
  const [productosFiltro, setProductosFiltro] = useState(null);
  const [estado, setEstado] = useState(() => busqueda?.get("estado") ?? "");
  const [vista, setVista] = useState(() => busqueda?.get("vista") ?? "todas");
  const [q, setQ] = useState(() => busqueda?.get("q") ?? "");
  // El texto tipeado se separa del que se consulta: buscar en cada tecla sobre
  // 917 filas dispararía una consulta por letra.
  const [qAplicado, setQAplicado] = useState(() => busqueda?.get("q") ?? "");

  // Qué fila tiene el panel de vinculación abierto. Una sola por vez: dos
  // paneles abiertos invitan a confirmar el equivocado.
  const [vinculando, setVinculando] = useState(null);
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
  // El resumen visto desde el sistema —qué pasó con los productos del ERP— y el
  // del archivo, que pasa a ser secundario.
  const [sistema, setSistema] = useState(null);
  const [archivo, setArchivo] = useState(null);
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
      url.searchParams.set("pageSize", String(pageSize));
      if (productosFiltro?.length) url.searchParams.set("productos", productosFiltro.join(","));
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
      if (json.sistema) setSistema(json.sistema);
      if (json.archivo) setArchivo(json.archivo);
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, [id, page, pageSize, estado, vista, qAplicado, productosFiltro]);

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
  /**
   * El panel elige; la escritura la hace la página.
   *
   * La grilla no conoce endpoints a propósito: devuelve QUÉ se eligió y quién
   * sabe a dónde mandarlo es esta pantalla. Así el mismo panel sirve para la
   * pregunta de producto y la de interpretación sin cablearle dos rutas.
   */
  const confirmarDecision = async ({ fila, clave, producto }) => {
    // Si el paso 1 eligió otro producto, primero se vincula: la interpretación
    // se confirma contra el producto que quedó, no contra el que estaba.
    if (producto?.productoBaseId && producto.productoBaseId !== fila.erp?.productoBaseId) {
      const rv = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productoBaseId: producto.productoBaseId }),
      });
      if (!rv.ok) {
        setAvisoVinculo("No se pudo vincular el producto elegido.");
        return;
      }
    }

    const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/confirmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ clave, cantidadPresentacion: null }),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json?.ok) {
      setAvisoVinculo(json?.error || "No se pudo confirmar la decisión.");
      return;
    }
    await alConfirmar(json);
  };

  /**
   * Los candidatos de la pregunta de producto.
   *
   * No están persistidos en la fila —se guarda el tipo de coincidencia y la
   * sugerencia, no la lista— así que hay que pedirlos. Es el mismo endpoint que
   * usa el buscador de vinculación.
   */
  const buscarCandidatos = async (fila) => {
    // Con código duplicado se busca POR EL CÓDIGO: el endpoint machea contra
    // `codigosProveedor.codigoInterno`, así que devuelve justo los productos que
    // comparten ese código, que son los candidatos del empate. Sin código se
    // busca por la descripción del proveedor.
    const termino =
      fila.estado === "CODIGO_DUPLICADO" && fila.codigoCrudo
        ? String(fila.codigoCrudo)
        : String(fila.descripcionProveedor ?? "").slice(0, 40);
    if (termino.trim().length < 2) return [];

    const url = new URL(`/api/proveedores/listas/${id}/productos`, window.location.origin);
    url.searchParams.set("q", termino);
    const r = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
    if (!r.ok) return [];
    const json = await r.json().catch(() => null);
    return (json?.items ?? []).map((it) => ({
      productoBaseId: it.productoBaseId ?? it.id,
      nombre: it.nombre,
      unidadMedida: it.unidad_medida ?? it.unidadMedida,
      factorPack: it.factor_pack ?? it.factorPack,
      costoActual: it.precio_costo ?? it.costoActual ?? null,
      codigoProveedor: it.codigoInterno ?? it.codigosProveedor?.[0]?.codigoInterno ?? null,
    }));
  };

  const alConfirmar = async (json) => {
    const comoQuedo =
      json.multiplicador > 1
        ? `el precio informado por ${json.multiplicador}`
        : "el precio informado, sin multiplicar";
    setAvisoVinculo(
      json.quedoLista
        ? `Fila ${json.fila.filaExcel} confirmada: el costo es ${comoQuedo}. Ya está lista para aplicar.`
        : `Fila ${json.fila.filaExcel} confirmada: con esa interpretación el costo no cambia, así que no queda para aplicar.`
    );
    await cargar();
  };



  /**
   * Cambiar el modo del área principal.
   *
   * Pendientes vuelve a la grilla acotada a esos productos: los ids se piden al
   * mismo endpoint del resumen, que ya los sabe, y se limpian los filtros para
   * que no se crucen con el recorte.
   */
  const cambiarModo = async (nuevo) => {
    setVinculando(null);
    if (nuevo !== "PENDIENTES") setProductosFiltro(null);

    if (nuevo === "PENDIENTES") {
      setEstado("");
      setQ("");
      setQAplicado("");
      setVista("todas");
      setPage(1);
      try {
        const r = await fetch(
          `/api/proveedores/listas/${id}/sistema?situacion=PENDIENTES&page=1`,
          { credentials: "include" }
        );
        const json = await r.json();
        if (json?.ok) {
          setProductosFiltro(json.items.map((x) => x.id));
          setAvisoVinculo(
            `Mostrando los ${json.paginacion.total} productos que faltan actualizar.`
          );
        }
      } catch {
        setErrorAplicar("No se pudieron cargar los productos pendientes.");
        return;
      }
    }
    setModo(nuevo);
  };

  const volverAConciliacion = () => {
    setModo("CONCILIACION");
    setProductosFiltro(null);
    setPage(1);
    setAvisoVinculo("");
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
            {/* El resumen manda: primero qué pasó con los productos del ERP,
                después qué trajo el archivo. Los datos de la importación
                —fecha, usuario, parser— viven adentro del encabezado nuevo o
                dejan de mostrarse: no ayudan a decidir nada. */}
            <ResumenConciliacion
              cabecera={cab}
              sistema={sistema}
              archivo={archivo}
              proveedor={cab.proveedor}
              modo={modo}
              onModo={cambiarModo}
            />

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

          </SunmiCard>

          {/* ── Modos de PRODUCTOS ─────────────────────────────────────
              Ausentes y sin código no tienen filas ni precio nuevo: se muestran
              como productos, en el mismo lugar que la grilla, con su título y
              su vuelta atrás. */}
          {(modo === "AUSENTES" || modo === "SIN_CODIGO") && (
            <VistaProductosSistema
              importacionId={id}
              situacion={modo}
              onVolver={volverAConciliacion}
            />
          )}

          {modo !== "AUSENTES" && modo !== "SIN_CODIGO" && (
            <>
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

          {/* ── Cierre de la importación ───────────────────────────────────
              Los conteos se fueron al encabezado, que ahora los cuenta desde el
              sistema. Acá queda solo la decisión de terminar. */}
          {!error && cab && progreso && (
            <SunmiCard className="p-3 space-y-2">
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

          {modo === "PENDIENTES" && (
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-[14px] font-bold sunmi-text-strong">
                  Productos pendientes de actualizar
                </h2>
                <p className="text-[11px] sunmi-text-muted leading-tight">
                  La misma grilla, acotada a los productos del ERP que faltan. Las acciones son las
                  de siempre: confirmar, ver opciones o cambiar el producto.
                </p>
              </div>
              <SunmiButton
                color="slate"
                onClick={volverAConciliacion}
                className="py-1.5 px-3 !text-[11.5px] shrink-0"
              >
                Volver a la conciliación
              </SunmiButton>
            </div>
          )}

          {!cargando && !error && filas.length > 0 && (
            <>
              {/* La grilla decide sola cómo mostrarse: tabla densa en pantalla
                  ancha, tarjetas compactas en el teléfono. El detalle se abre
                  debajo de la propia fila, nunca en un modal ni en un panel. */}
              <GrillaConciliacion
                filas={filas}
                importacion={cab}
                seleccionDe={seleccionDe}
                onMarcar={alMarcarFila}
                onVincular={(x) => setVinculando(x)}
                onConfirmada={confirmarDecision}
                buscarCandidatos={buscarCandidatos}
                editable={ESTADOS_ABIERTOS.includes(cab?.estado) && !trabajando}
              />

              {/* Vincular sigue siendo un buscador aparte: es la única acción
                  que necesita escribir y comparar candidatos. */}
              {vinculando && (
                <PanelVincular
                  importacionId={id}
                  fila={vinculando}
                  onVinculada={alVincular}
                  onCerrar={() => setVinculando(null)}
                />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="filas-por-pagina" className="text-[11px] sunmi-text-muted">
                  Mostrar
                </label>
                <SunmiSelectAdv
                  id="filas-por-pagina"
                  value={String(pageSize)}
                  onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  className="w-24"
                >
                  <SunmiSelectOption value="25">25</SunmiSelectOption>
                  <SunmiSelectOption value="50">50</SunmiSelectOption>
                  <SunmiSelectOption value="100">100</SunmiSelectOption>
                </SunmiSelectAdv>
                <div className="flex-1 min-w-[12rem]">
                  <Paginacion
                    page={pag.page}
                    paginas={pag.paginas}
                    total={pag.total}
                    cargando={cargando}
                    onPage={setPage}
                  />
                </div>
              </div>
            </>
          )}
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
