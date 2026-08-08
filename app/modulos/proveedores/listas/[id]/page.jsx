"use client";

// LA PANTALLA DE UNA IMPORTACIÓN, DADA VUELTA.
//
// La unidad es el PRODUCTO del sistema, no la fila del archivo. El archivo de
// Arcor trae 917 filas y 625 de ellas son productos que este negocio no tiene:
// medir contra ellas decía que faltaba el 68 % cuando el trabajo real estaba casi
// terminado. El número que manda ahora es 376, los productos de Arcor que hay en
// el sistema.
//
// ── LA CABECERA DICE QUÉ HACER HOY ──────────────────────────────────────────
//
// Un titular en criollo que cambia con el estado —recién importada habla de lo
// que hay para actualizar, ya aplicada de lo que quedó con el precio viejo— y
// cinco cards sobre esos 376. La de "listos para aplicar" lleva el botón adentro
// y se apaga sola cuando el número da cero.
//
// ── UN SOLO SISTEMA DE FILTRO ───────────────────────────────────────────────
//
// Cinco filtros, uno por card, con las mismas palabras. Antes había diecinueve
// chips Y un desplegable de estado: dos sistemas que se pisaban y que obligaban a
// entender el vocabulario del motor —FACTOR_DUDOSO, CODIGO_DUPLICADO— para poder
// filtrar. La búsqueda por texto va aparte y se combina, no reemplaza.
//
// ── EL ARCHIVO ES DIAGNÓSTICO ───────────────────────────────────────────────
//
// Las 917 filas y los criterios de macheo viven plegados abajo. Se abren cuando
// algo no cierra; en un día normal nadie necesita saber cuántas machearon por
// sufijo de cinco dígitos.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import PanelVincular from "@/components/proveedores/listas/PanelVincular";
import PanelAplicar from "@/components/proveedores/listas/PanelAplicar";
import PanelDecision from "@/components/proveedores/listas/PanelDecision";
import PanelProducto from "@/components/proveedores/listas/PanelProducto";
import CabeceraCatalogo, { ORDEN_CARDS } from "@/components/proveedores/listas/CabeceraCatalogo";
import TablaCatalogo from "@/components/proveedores/listas/TablaCatalogo";
import DiagnosticoArchivo from "@/components/proveedores/listas/DiagnosticoArchivo";
import BotonReporte from "@/components/proveedores/listas/BotonReporte";
import { ErrorRecuperable, Paginacion } from "@/components/proveedores/listas/PiezasListas";
import { formaDelPanel, PREGUNTA } from "@/lib/proveedores/listas/panelDecision";
import { GRUPO_PRODUCTO, TEXTO_GRUPO, titularDeCatalogo } from "@/lib/proveedores/listas/gruposProducto";

/** Los cinco filtros, en el mismo orden y con las mismas palabras que las cards. */
const FILTROS = ORDEN_CARDS;

export default function CatalogoImportacionPage() {
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
  const [productos, setProductos] = useState([]);
  const [porGrupo, setPorGrupo] = useState({});
  const [universo, setUniverso] = useState(0);
  const [cobertura, setCobertura] = useState(null);
  const [pag, setPag] = useState({ page: 1, paginas: 1, total: 0 });
  const [archivo, setArchivo] = useState(null);
  const [macheo, setMacheo] = useState(null);
  const [resumenSeleccion, setResumenSeleccion] = useState(null);

  const [grupo, setGrupo] = useState(() => busqueda?.get("grupo") ?? null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [q, setQ] = useState(() => busqueda?.get("q") ?? "");
  const [qAplicado, setQAplicado] = useState(() => busqueda?.get("q") ?? "");

  const [abierta, setAbierta] = useState(null);
  const [vinculando, setVinculando] = useState(null);
  const [aviso, setAviso] = useState("");
  const [trabajandoProducto, setTrabajandoProducto] = useState(false);

  // La aplicación: el botón vive en la card y el panel se revela debajo.
  const [mostrarAplicar, setMostrarAplicar] = useState(false);
  const [previo, setPrevio] = useState(null);
  const [cargandoPrevio, setCargandoPrevio] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorAplicar, setErrorAplicar] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [trabajandoCancelar, setTrabajandoCancelar] = useState(false);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError("");
    try {
      const url = new URL(`/api/proveedores/listas/${id}/catalogo`, window.location.origin);
      if (grupo) url.searchParams.set("grupo", grupo);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(pageSize));
      if (qAplicado) url.searchParams.set("q", qAplicado);

      // El catálogo trae los productos y los contadores. El endpoint viejo sigue
      // dando lo que describe al ARCHIVO —macheo, filas, selección—, que ahora es
      // el bloque de diagnóstico. Se piden en paralelo.
      const [rCat, rArch] = await Promise.all([
        fetch(url.toString(), { credentials: "include", cache: "no-store" }),
        fetch(`/api/proveedores/listas/${id}?pageSize=1`, { credentials: "include", cache: "no-store" }),
      ]);
      const jCat = await rCat.json();
      if (!rCat.ok || !jCat?.ok) {
        setError(jCat?.error || "No se pudo cargar el catálogo.");
        return;
      }
      setProductos(jCat.productos ?? []);
      setPorGrupo(Object.fromEntries((jCat.grupos ?? []).map((g) => [g.clave, g.valor])));
      setUniverso(jCat.cobertura?.universo ?? 0);
      setCobertura(jCat.cobertura ?? null);
      setPag(jCat.paginacion ?? { page: 1, paginas: 1, total: 0 });

      const jArch = await rArch.json().catch(() => null);
      if (jArch?.ok) {
        setCab(jArch.importacion);
        setArchivo(jArch.archivo ?? null);
        setMacheo(jArch.macheo ?? null);
        setResumenSeleccion(jArch.seleccion ?? null);
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, [id, grupo, page, pageSize, qAplicado]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  // El filtro arranca en la primera card que tenga trabajo. Se decide UNA vez:
  // re-derivarlo en cada carga pelearía con los clics del usuario.
  useEffect(() => {
    if (grupo !== null || !Object.keys(porGrupo).length) return;
    const conTrabajo = FILTROS.find((g) => Number(porGrupo[g] ?? 0) > 0);
    setGrupo(conTrabajo ?? GRUPO_PRODUCTO.ACTUALIZADO);
  }, [porGrupo, grupo]);

  const titular = useMemo(() => titularDeCatalogo({ porGrupo, universo }), [porGrupo, universo]);
  const abierto = cab?.estado !== "CANCELADA" && cab?.estado !== "APLICADA";

  // ── Acciones ────────────────────────────────────────────────────────────

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
        return json;
      } catch {
        setErrorAplicar("Error de conexión.");
        return null;
      }
    },
    [id]
  );

  /** Abrir el panel de aplicar: se marcan todas las listas y se pide el previo. */
  const abrirAplicar = async () => {
    setMostrarAplicar(true);
    await mandarSeleccion({ accion: "TODOS" });
    await pedirPrevio();
  };

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
      setMostrarAplicar(false);
      await cargar();
    } catch {
      setErrorAplicar("Error de conexión. No se aplicó nada.");
    } finally {
      setTrabajando(false);
    }
  };

  const cancelarImportacion = async () => {
    setTrabajandoCancelar(true);
    setErrorAplicar("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/cancelar`, {
        method: "POST", credentials: "include",
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

  /** La decisión del panel de una FILA. El panel elige; la página escribe. */
  const confirmarDecision = async ({ fila, clave, producto }) => {
    if (producto?.productoBaseId && producto.productoBaseId !== fila.erp?.id) {
      const rv = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productoBaseId: producto.productoBaseId }),
      });
      if (!rv.ok) {
        setAviso("No se pudo vincular el producto elegido.");
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
      setAviso(json?.error || "No se pudo confirmar la decisión.");
      return;
    }
    setAviso(`Fila ${json.fila.filaExcel} confirmada.`);
    setAbierta(null);
    await cargar();
  };

  const buscarCandidatos = async (fila) => {
    const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/candidatos`, {
      credentials: "include", cache: "no-store",
    });
    if (!r.ok) return [];
    const json = await r.json().catch(() => null);
    return Array.isArray(json?.candidatos) ? json.candidatos : [];
  };

  /** CASO A: el producto sin código es esta fila del archivo. */
  const vincularFilaAProducto = async (producto, filaId) => {
    setTrabajandoProducto(true);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${filaId}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productoBaseId: producto.id }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setAviso(json?.error || "No se pudo vincular la fila.");
        return;
      }
      setAviso(`${producto.nombre} quedó vinculado con la fila ${json.fila?.filaExcel ?? filaId}.`);
      setAbierta(null);
      await cargar();
    } finally {
      setTrabajandoProducto(false);
    }
  };

  /** CASO B: qué hacer con un producto que la lista no trajo. */
  const resolverDestino = async (producto, destino) => {
    if (destino === "DEJAR_COMO_ESTA") {
      setAviso(`${producto.nombre} queda como está.`);
      setAbierta(null);
      return;
    }
    if (destino === "REVISAR_CODIGO") {
      router.push(`/modulos/productos/${producto.id}/editar`);
      return;
    }
    setTrabajandoProducto(true);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/vinculos/baja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productoBaseId: producto.id }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setAviso(json?.error || "No se pudo dar de baja el código.");
        return;
      }
      setAviso(`${producto.nombre}: se dio de baja el código del proveedor. El producto no se tocó.`);
      setAbierta(null);
      await cargar();
    } finally {
      setTrabajandoProducto(false);
    }
  };

  /**
   * Qué panel le corresponde a un producto.
   *
   * Con filas del archivo, el de siempre: la comparación y sus dos preguntas. Sin
   * filas, la tercera forma. La decisión no se toma acá — sale del grupo, que
   * calculó el servidor con el mismo predicado que arma los contadores.
   */
  const renderPanel = (p) => {
    if (!p.filas?.length) {
      return (
        <PanelProducto
          producto={p}
          importacion={cab}
          onVincularFila={(filaId) => vincularFilaAProducto(p, filaId)}
          onDestino={(d) => resolverDestino(p, d)}
          trabajando={trabajandoProducto}
        />
      );
    }
    // La fila principal es la primera del archivo. El panel de siempre espera la
    // fila con su lado del ERP adentro, así que se arma acá desde el producto.
    const fila = {
      ...p.filas[0],
      importacionId: cab?.id,
      erp: {
        id: p.id,
        nombre: p.nombre,
        codigosArcor: (p.codigosProveedor ?? []).filter((c) => c.activo).map((c) => c.codigo),
        codigoBarra: p.codigoBarra,
        codigoBarraSecundario: p.codigoBarraSecundario,
        actualizadoEn: p.actualizadoEn,
        unidadMedida: p.unidadMedida,
        factorPack: p.factorPack,
        modoCompraProveedor: p.modoCompraProveedor,
        costoActual: p.costoActual,
        ventaActual: p.ventaActual,
        esCombo: p.esCombo,
      },
    };
    const forma = formaDelPanel({
      estado: fila.estado,
      tieneProducto: true,
      resultado: fila.resultadoInterpretacion ?? null,
      aplicada: !!fila.aplicada,
      excluida: fila.excluidaManual === true,
      confirmada: !!fila.confirmadoEn && (!fila.vinculadoEn || new Date(fila.confirmadoEn) > new Date(fila.vinculadoEn)),
    });
    return (
      <PanelDecision
        fila={fila}
        importacion={cab}
        forma={forma}
        candidatos={[]}
        productoElegido={null}
        eleccion={null}
        onElegir={() => {}}
        onConfirmar={() => {}}
        onVincularOtro={() => setVinculando(fila)}
      />
    );
  };

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
          <SunmiCard className="p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-bold sunmi-text-strong">
                Importación #{cab.id}
              </span>
              <span className="text-[11px] sunmi-text-muted">{cab.proveedor?.nombre}</span>
              <span className="text-[11px] sunmi-text-muted hidden sm:inline">
                {cab.archivoNombre}
              </span>
              <div className="ml-auto">
                <BotonReporte
                  importacionId={cab.id}
                  cabecera={cab}
                  proveedor={cab.proveedor}
                  usuario={cab.usuario?.nombre}
                />
              </div>
            </div>

            <CabeceraCatalogo
              titular={titular}
              porGrupo={porGrupo}
              universo={universo}
              grupoActivo={grupo}
              onGrupo={(g) => {
                setGrupo(g);
                setPage(1);
                setAbierta(null);
              }}
              onAplicar={abrirAplicar}
              puedeAplicar={abierto}
              onVerDiscontinuados={() => {
                setGrupo(GRUPO_PRODUCTO.DISCONTINUADO);
                setPage(1);
              }}
            />

            {cobertura && !cobertura.cierra ? (
              <p className="text-[11px] sunmi-text-danger">
                Los grupos suman {cobertura.suma} y el catálogo tiene {cobertura.universo}: faltan{" "}
                {cobertura.faltante} productos por clasificar. Avisá, es un error del sistema.
              </p>
            ) : null}

            {aviso ? <p className="text-[11.5px] sunmi-text-success leading-snug">{aviso}</p> : null}

            {mostrarAplicar && abierto ? (
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
            ) : null}

            {cab.estado === "CANCELADA" ? (
              <div className="sunmi-surface-soft sunmi-border border rounded-lg px-3 py-2">
                <span className="text-[12.5px] font-semibold sunmi-text-danger">
                  Importación cancelada
                </span>
                <p className="text-[11.5px] sunmi-text-muted leading-snug mt-0.5">
                  Queda solo como historial. No se puede aplicar y el archivo quedó liberado.
                </p>
              </div>
            ) : abierto ? (
              <div className="flex flex-wrap items-center gap-2">
                <SunmiButton
                  color="slate"
                  onClick={() => setCancelando(true)}
                  disabled={trabajandoCancelar}
                  className="py-1.5 px-2.5 !text-[11px]"
                >
                  Cancelar importación
                </SunmiButton>
                {cancelando && (
                  <div className="w-full sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
                    <p className="text-[12px] sunmi-text-strong leading-snug">
                      ¿Cancelar esta importación? Queda como historial y no se va a poder aplicar.
                      No se modifica ningún costo ni producto.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
                      <SunmiButton color="slate" onClick={() => setCancelando(false)} className="py-2 !text-xs">
                        No, volver
                      </SunmiButton>
                      <SunmiButton
                        color="red"
                        onClick={cancelarImportacion}
                        disabled={trabajandoCancelar}
                        className="py-2 font-bold !text-xs"
                      >
                        {trabajandoCancelar ? "Cancelando…" : "Sí, cancelar"}
                      </SunmiButton>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </SunmiCard>

          {/* ── Filtros: cinco, con las palabras de las cards ─────────── */}
          <SunmiCard className="p-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGrupo(g);
                    setPage(1);
                    setAbierta(null);
                  }}
                  aria-pressed={grupo === g}
                  className={`px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${
                    grupo === g ? "sunmi-btn-base sunmi-btn-cyan border-transparent" : "sunmi-border sunmi-text-muted"
                  }`}
                >
                  {TEXTO_GRUPO[g]} ({Number(porGrupo[g] ?? 0)})
                </button>
              ))}
            </div>

            {/* La búsqueda se COMBINA con el filtro, no lo reemplaza. */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <SunmiInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    setQAplicado(q.trim());
                  }
                }}
                placeholder="Buscar por nombre, SKU o código de barras"
                className="!py-1.5 !text-[12px]"
              />
              <SunmiButton
                color="cyan"
                onClick={() => {
                  setPage(1);
                  setQAplicado(q.trim());
                }}
                className="py-1.5 px-3 !text-[11px] inline-flex items-center gap-1"
              >
                <Search size={13} aria-hidden="true" /> Buscar
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => {
                  setQ("");
                  setQAplicado("");
                  setPage(1);
                }}
                disabled={!qAplicado}
                className="py-1.5 px-3 !text-[11px] inline-flex items-center gap-1"
              >
                <X size={13} aria-hidden="true" /> Limpiar
              </SunmiButton>
            </div>
          </SunmiCard>

          {/* ── La tabla de PRODUCTOS ─────────────────────────────────── */}
          <TablaCatalogo
            productos={productos}
            cargando={cargando}
            abierta={abierta}
            onAbrir={setAbierta}
            renderPanel={renderPanel}
          />

          <Paginacion
            page={pag.page}
            paginas={pag.paginas}
            total={pag.total}
            onPage={(n) => {
              setPage(n);
              setAbierta(null);
            }}
          />

          {vinculando ? (
            <PanelVincular
              importacionId={id}
              fila={vinculando}
              onCerrar={() => setVinculando(null)}
              onVinculada={async () => {
                setVinculando(null);
                await cargar();
              }}
            />
          ) : null}

          {/* ── El archivo, como diagnóstico ──────────────────────────── */}
          <DiagnosticoArchivo archivo={archivo} macheo={macheo} cabecera={cab} />
        </>
      )}
    </Marco>
  );
}

function Marco({ children, router }) {
  return (
    <div className="min-h-screen sunmi-bg p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/modulos/proveedores/listas")}
          className="inline-flex items-center gap-1 text-[12px] sunmi-text-muted hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Volver al historial
        </button>
      </div>
      {children}
    </div>
  );
}
