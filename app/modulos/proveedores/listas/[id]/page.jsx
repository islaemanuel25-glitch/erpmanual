"use client";

// 4 · LA REVISIÓN DE UNA LISTA — y 6 · CONFIRMAR APLICAR, que es su hoja inferior.
//
// ── TIENE LA FORMA DE RECIBIR UNA TRANSFERENCIA (Emanuel, 2026-10-24) ──────
//
// La versión del 2026-10-23 ya arrancaba de tus productos, pero no dejaba claro
// qué era tu producto y qué era el renglón de la lista. Emanuel prefiere cómo se
// ve y se usa la recepción de una transferencia, así que esta pantalla se arma
// con las MISMAS piezas que `RecepcionMovil`, en el mismo orden:
//
//   · `SunmiPantallaDeTrabajo`: la tarjeta de dónde estoy, el buscador, los
//     filtros, la lista y la barra fija de abajo.
//   · `SunmiCampoBusquedaVoz`, con el micrófono.
//   · `SunmiFiltroEstado`: los cuatro estados en grilla de 2 × 2.
//   · `TarjetaDeRevision`, adentro de `TarjetaProductoDeLaLista`.
//   · La barra de «Total / ✓ Confirmar», acá «Para aplicar / ✓ Aplicar».
//
// Lo que decide cada estado sigue en `tusProductos.js`, y qué hace el botón de
// cada tarjeta lo manda el servidor en `item.usar`.
//
// ── UNA LISTA TERMINADA NO INVITA A TRABAJAR ────────────────────────────────
//
// Cuando ya se aplicó y se terminó, esta pantalla muestra lo que pasó y ofrece
// SOLO lo que se puede hacer: sin botones en las tarjetas y sin barra de aplicar.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiBarraDeProgreso from "@/components/sunmi/SunmiBarraDeProgreso";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { elegirUbicacionActiva, nombreDeUbicacion } from "@/lib/ubicacionActiva";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import {
  useAccionDePagina,
  useTituloDePagina,
} from "@/app/context/AccionDePaginaContext";
// El chip de estado de la cabecera es el de la transferencia, con sus clases:
// el control de stock ya lo copió así, y no se escribe uno parecido al lado.
import EstadoTransferenciaBadge, {
  InsigniaEnCurso,
  InsigniaTerminada,
} from "@/components/transferencias/EstadoTransferenciaBadge";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import {
  Aviso,
  pct,
  // El peso con el formato de siempre. Se reusa el del kit y no se escribe otro
  // `toLocaleString` acá: dos formatos de moneda en la misma pantalla se separan
  // el día que uno cambie de decimales.
  money,
} from "@/components/proveedores/listas/PiezasPantallas";
import TarjetaProductoDeLaLista from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import HojaVincularConLaLista from "@/components/proveedores/listas/HojaVincularConLaLista";
import HojaRevisarPrecio, { ConfirmarFueraDeRango } from "@/components/proveedores/listas/HojaRevisarPrecio";
import {
  ACCION_USAR,
  FILTRO,
  ORDEN_FILTROS,
  TEXTO_FILTRO,
  cantidadDelFiltro,
  filtroInicial,
  filtroParaMostrar,
  resumenDeLaCerrada,
  seVe,
  textoSinTildarEnUnaCerrada,
  textoTildadosSinAplicarEnUnaCerrada,
} from "@/lib/proveedores/listas/tusProductos";
import HojaConfirmarAplicar from "@/components/proveedores/listas/HojaConfirmarAplicar";
import HojaBajasDePrecio from "@/components/proveedores/listas/HojaBajasDePrecio";
import {
  AL_APLICAR,
  DESPUES_DE_LAS_BAJAS,
  bajasAlAplicar,
  ordenarParaRevisar,
  queAbreAlAplicar,
  resumenParaRevisar,
  textoResumenParaRevisar,
} from "@/lib/proveedores/listas/bajasDeLaLista";
// Pasar un control a actualizar precios: pide el rango, que controlar no
// pregunta y actualizar no puede resolver sin él.
import HojaPasarAActualizar from "@/components/proveedores/listas/HojaPasarAActualizar";
import HojaCambiarColumna from "@/components/proveedores/listas/HojaCambiarColumna";
// El mismo predicado que usa el servidor para decidir si una columna explica
// poco. Escribir acá una comparación parecida es lo que CLAUDE.md prohíbe.
import { explicaPoco } from "@/lib/proveedores/listas/importacionGenerica";
import { nombreDeLaColumnaLeida } from "@/lib/proveedores/listas/nombreDeLaColumna";
// Cancelar una importación que quedó inservible. Con su propia palabra: no es
// lo mismo que terminarla.
import ModalCancelarImportacion from "@/components/proveedores/listas/ModalCancelarImportacion";
import HojaCancelarLaLista from "@/components/proveedores/listas/HojaCancelarLaLista";
// Deshacer y terminar YA tenían su modal, con su previa y su candado contra la
// previa vieja. Se reusan: escribir otro botón al lado sería tener dos caminos
// para escribir costos, y uno de los dos sin el candado.
import ModalRevertir from "@/components/proveedores/listas/ModalRevertir";
import ModalTerminar from "@/components/proveedores/listas/ModalTerminar";
import HojaReporte from "@/components/proveedores/listas/HojaReporte";
import TarjetaPorConfirmar from "@/components/proveedores/listas/TarjetaPorConfirmar";
import HojaCerrarConPendientes from "@/components/proveedores/listas/HojaCerrarConPendientes";
import {
  AL_CERRAR,
  CIERRE,
  aplicarYTerminar,
  pendientesDeLaLista,
  queAbreAlCerrar,
  textoDeLaCancelada,
} from "@/lib/proveedores/listas/cerrarConPendientes";
import { fechaHora } from "@/lib/proveedores/listas/presentacion";
// PARA QUÉ SE SUBIÓ LA LISTA. Controlando no se ofrece aplicar: se ofrecen las
// dos acciones del control.
import { MODO_LISTA, textoDelRango } from "@/lib/proveedores/listas/modoDeLaLista";
import {
  esImportacionAbierta,
  esImportacionRevertible,
  esImportacionSinCerrar,
} from "@/lib/proveedores/listas/persistencia";

/** El texto del buscador, como el de la recepción pero sobre lo tuyo. */
export const PLACEHOLDER_BUSCADOR_LISTA = "Buscar tu producto o código…";

/** El aviso de abajo después de resolver una tarjeta: "Listo: <producto> · Deshacer". */
export const TEXTO_HECHO = "Listo:";
export const TEXTO_DESHACER = "Deshacer";
/** Unos segundos: lo que tarda en leerse y en tocar «Deshacer» si hizo falta. */
export const DURACION_AVISO_HECHO_MS = 6000;

/** El botón que abre la hoja del reporte. */
export const TEXTO_REPORTE = "Reporte";

/**
 * LOS DOS PAQUETES DE UNA LISTA (Emanuel, 2026-10-24).
 *
 *   TUS_PRODUCTOS  "Tus productos de Dab": los que ya tienen a Dab en alguno de
 *                  sus tres lugares. Es esta pantalla, en `/listas/[id]`.
 *   PUEDEN_SER     "Pueden ser de Dab": tuyos de otro proveedor o sin
 *                  proveedor que se parecen a un renglón de la lista, en
 *                  `/listas/[id]/pueden-ser`.
 *
 * Son la MISMA pantalla con otro contenido, no dos: comparten la barra de
 * «Para aplicar» —que cuenta la lista entera, o sea los dos paquetes—,
 * «✓ Aplicar», «Usar», «Corregir» y las hojas. Escribir la segunda al lado
 * sería tener dos barras de aplicar que el día que una cambie dicen distinto.
 */
export const PAQUETE = Object.freeze({ TUS_PRODUCTOS: "TUS_PRODUCTOS", PUEDEN_SER: "PUEDEN_SER" });

/** «Por confirmar» y «Confirmados», los chips del paquete 2. */
export const PESTANA_PUEDEN_SER = Object.freeze({ POR_CONFIRMAR: "POR_CONFIRMAR", CONFIRMADOS: "CONFIRMADOS" });

/** "Pueden ser de Dab". */
export function tituloPuedenSer(proveedor) {
  return proveedor ? `Pueden ser de ${proveedor}` : "Pueden ser de este proveedor";
}

/** La explicación gris de arriba del paquete 2. */
export function explicacionPuedenSer(proveedor) {
  return `Productos tuyos que figuran con otro proveedor o sin proveedor, y se parecen a uno de la lista de ${proveedor || "este proveedor"}.`;
}

export default function ResultadoDeListaPage({ paquete = PAQUETE.TUS_PRODUCTOS } = {}) {
  const enPuedenSer = paquete === PAQUETE.PUEDEN_SER;
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Pasar un control a actualizar precios. Dos estados y no uno: `abierta` es la
  // hoja que pide el rango, `pasando` es el pedido en vuelo. Con uno solo, el
  // botón de la hoja no podría decir "Pasando…" sin cerrarla.
  const [pasandoAActualizar, setPasandoAActualizar] = useState(false);
  const [cambiandoColumna, setCambiandoColumna] = useState(false);
  const [pasando, setPasando] = useState(false);
  const [errorAlPasar, setErrorAlPasar] = useState(null);
  // La confirmación de cancelar. Cancelar no escribe ningún costo, pero cierra
  // la lista y eso no se deshace desde acá: se pregunta.
  const [cancelando, setCancelando] = useState(false);
  /** "Cancelar la lista": cancelar una lista que ya aplicó, deshaciendo. */
  const [cancelandoConReversion, setCancelandoConReversion] = useState(false);
  /**
   * "Te quedan precios sin aplicar": `CIERRE.TERMINAR` o `CIERRE.CANCELAR`
   * cuando se quiso cerrar con algo para aplicar; null, cerrada.
   */
  const [cerrandoConPendientes, setCerrandoConPendientes] = useState(null);
  /**
   * "Estos productos bajan de precio", abierta antes de escribir: qué hace
   * «Aplicar igual» (`DESPUES_DE_LAS_BAJAS`); null, cerrada.
   */
  const [avisandoBajas, setAvisandoBajas] = useState(null);
  /** La hoja del reporte, abierta. */
  const [viendoReporte, setViendoReporte] = useState(false);
  /** El chip del paquete 2; null hasta el primer resultado. */
  const [pestanaPuedenSer, setPestanaPuedenSer] = useState(null);
  /** Mientras se vuelven a leer las propuestas que quedaron viejas. */
  const [releyendo, setReleyendo] = useState(false);
  // ── LA LISTA DE TUS PRODUCTOS ──────────────────────────────────────────
  //
  // `filtro` arranca en null y se elige con el primer resultado: el primer
  // chip que tenga algo. La tarjeta resuelta SE VA del chip (Emanuel,
  // 2026-10-24): lo que la reemplaza a la vista es el aviso de abajo, `hecho`
  // —"Listo: <producto> · Deshacer"—, con el pedido que vuelve atrás.
  const [filtro, setFiltro] = useState(null);
  const [buscar, setBuscar] = useState("");
  /** `{ nombre, deshacer: { url, cuerpo } | null, vez }` o null. */
  const [hecho, setHecho] = useState(null);
  const [volviendoAtras, setVolviendoAtras] = useState(false);
  /** El producto que se está vinculando: `{ productoBaseId, nombre }` o null. */
  const [vinculando, setVinculando] = useState(null);
  /** «No es este producto», desde la hoja de revisar: `{ fila, productoBaseId }`. */
  const [eligiendoOtra, setEligiendoOtra] = useState(null);
  /** El producto que se está revisando: `{ filaId, productoBaseId }` o null. */
  const [revisando, setRevisando] = useState(null);
  // ── LO QUE SE TOCA EN LA TARJETA MISMA ─────────────────────────────────
  //
  // «✓ Usar» y «No viene» no abren nada: guardan y la tarjeta cambia en el
  // lugar. `tocando` es el producto con el pedido en vuelo; `errores`, el
  // rechazo del servidor PEGADO a la tarjeta donde se tocó —arriba de todo
  // quedaría fuera de la pantalla justo cuando el dedo está en el botón—.
  const [tocando, setTocando] = useState(null);
  const [errores, setErrores] = useState(() => new Map());
  /** La tarjeta que pidió «✓ Usar» sobre una lectura fuera de rango. */
  const [preguntaFuera, setPreguntaFuera] = useState(null);
  /** «Ir a <ubicación de los costos>»: el pedido en vuelo y su rechazo. */
  const [cambiandoUbicacion, setCambiandoUbicacion] = useState(false);
  const [errorDeUbicacion, setErrorDeUbicacion] = useState("");

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  // El permiso, como las rutas que esta pantalla llama; era solo admin escrito
  // a mano. Una lista de otro local la frena el servidor.
  const puedeListas = permisos.includes("*") || permisos.includes("proveedores.listas");

  // ── LA BARRA DE LA APP DICE QUÉ ES ESTO, Y LA TARJETA DE QUIÉN ──────────
  //
  // Decía el nombre del proveedor. Ahora el nombre va en negrita en la tarjeta
  // de arriba, como "Transferencia #464", y la barra dice qué pantalla es.
  // El paquete 2 se llama por lo que es: "Pueden ser de Dab".
  useTituloDePagina(enPuedenSer ? tituloPuedenSer(datos?.cabecera?.proveedor?.nombre) : "Lista de precios");

  // ── Y EL VOLVER VA EN LA FILA DEL SHELL, NO ADENTRO DEL CONTENIDO ───────
  //
  // La fila del shell vive AFUERA del `<main>` que scrollea, así que ahí no se
  // puede ir de pantalla. Es la misma llamada que hacen las pantallas que ya usan
  // el slot.
  useAccionDePagina(
    () => <SunmiBackButton href="/modulos/proveedores/listas" className="min-h-toque" />,
    []
  );

  // `silencioso`: después de vincular o revisar, la pantalla NO pasa por el
  // cargador. Con él, el contenido se reemplazaba por la rueda y al volver se
  // perdía el lugar de la lista: la tarjeta que se acaba de tocar quedaba
  // pantallas más arriba. Si la recarga silenciosa falla, se dice en el aviso
  // y lo que había queda a la vista.
  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    if (!silencioso) setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/resultado`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        const texto = json?.error || "No se pudo cargar el resultado de esta lista.";
        if (silencioso) setAviso({ tono: "danger", texto });
        else setError(texto);
        return;
      }
      setDatos(json);
      // El chip con el que arranca: el primero que tenga algo. Solo la primera
      // vez —después manda el que eligió la persona—.
      setFiltro((f) => f ?? filtroInicial(json?.tusProductos?.conteo));
      setPestanaPuedenSer(
        (p) =>
          p ??
          ((json?.puedenSer?.conteo?.porConfirmar ?? 0) > 0 || (json?.puedenSer?.conteo?.confirmados ?? 0) === 0
            ? PESTANA_PUEDEN_SER.POR_CONFIRMAR
            : PESTANA_PUEDEN_SER.CONFIRMADOS)
      );
      return json;
    } catch {
      const texto = "No se pudo conectar con el servidor. Probá de nuevo.";
      if (silencioso) setAviso({ tono: "danger", texto });
      else setError(texto);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [id]);

  /**
   * LO QUE SE ACABA DE RESOLVER: se relee la lista y se avisa abajo.
   *
   * La tarjeta que dejó de ser del chip ya no está (`seVe`), y los chips y la
   * barra salen de la relectura. `deshacer` es el pedido que vuelve atrás esa
   * acción, o null si no hay uno.
   */
  const despuesDeResolver = async (nombre, deshacer) => {
    await cargar({ silencioso: true });
    setHecho({ nombre, deshacer, vez: Date.now() });
  };

  // El aviso dura unos segundos; uno nuevo reinicia la cuenta.
  useEffect(() => {
    if (!hecho) return undefined;
    const reloj = setTimeout(() => setHecho(null), DURACION_AVISO_HECHO_MS);
    return () => clearTimeout(reloj);
  }, [hecho]);

  /** «Deshacer»: manda el pedido inverso y relee. Si falla, se dice arriba. */
  const volverAtras = async () => {
    const d = hecho?.deshacer;
    if (!d) return;
    setVolviendoAtras(true);
    try {
      const r = await fetch(d.url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d.cuerpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: `${j?.error || "No se pudo deshacer."} Quedó como estaba.` });
      }
      setHecho(null);
      await cargar({ silencioso: true });
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor para deshacer. Quedó como estaba." });
    } finally {
      setVolviendoAtras(false);
    }
  };

  /** Deshacer un vínculo hecho en esta lista: la fila vuelve a no ser de nadie. */
  const deshacerVinculo = (filaId) =>
    filaId ? { url: `/api/proveedores/listas/${id}/filas/${filaId}/otra-fila`, cuerpo: { noEstaEnLaLista: true } } : null;

  /** Deshacer «No viene»: el producto vuelve a «Sin vincular». */
  const deshacerNoViene = (productoBaseId) => ({
    url: `/api/proveedores/listas/${id}/productos/${productoBaseId}/en-la-lista`,
    cuerpo: { noViene: false },
  });

  /** Lo que devolvió la hoja de vincular, deshecho: un vínculo o un «No viene». */
  const deshacerDeLaHoja = (j, productoBaseId) =>
    j?.accion === "NO_VIENE" ? deshacerNoViene(productoBaseId) : deshacerVinculo(j?.filaId ?? null);

  /**
   * Deshacer una aceptación del paquete 2 es «No es de Dab»: saca el vínculo Y
   * el lugar que se le sumó. Con el «Deshacer» de un vínculo común quedaría con
   * Dab puesto y anotado como sumado.
   */
  const deshacerSumado = (productoBaseId) => ({
    url: `/api/proveedores/listas/${id}/posibles`,
    cuerpo: { deshacer: true, productoBaseId },
  });

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeListas || needsContexto || !Number.isInteger(id)) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, puedeListas, needsContexto, id]);

  // ── «TERMINAR LISTA» DESDE EL LISTADO (2026-10-24) ───────────────────────
  // Llega con `?terminar=1`. Apenas está la lista, se abre lo mismo que abre
  // «Terminar lista» de acá —la hoja de pendientes o la confirmación—, con las
  // mismas cuentas (`pendientesDeLaLista`). Se abre una vez: la marca se saca
  // de la dirección.
  const [terminarAlEntrar, setTerminarAlEntrar] = useState(false);
  /** Lo que abre terminar: con pendientes, la hoja; si no, la confirmación. */
  const abrirTerminar = (pend) =>
    queAbreAlCerrar(pend) === AL_CERRAR.HOJA_PENDIENTES
      ? setCerrandoConPendientes(CIERRE.TERMINAR)
      : setTerminando(true);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("terminar") === "1") setTerminarAlEntrar(true);
    } catch {
      // Sin la dirección, se entra como siempre.
    }
  }, []);
  useEffect(() => {
    if (!terminarAlEntrar || !datos?.cabecera) return;
    setTerminarAlEntrar(false);
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // Quedaría la marca en la dirección; no cambia lo que se abre ahora.
    }
    if (!esImportacionSinCerrar(datos.cabecera.estado)) return;
    abrirTerminar(pendientesDeLaLista(datos));
  }, [terminarAlEntrar, datos]);

  /**
   * UN PEDIDO DESDE LA TARJETA, con el error pegado a ella.
   *
   * Si sale bien, la lista se relee sin el cargador —el estado nuevo lo dice el
   * servidor, no esta pantalla— y abajo aparece el aviso con «Deshacer».
   * `deshacer` es el pedido inverso, o una función que lo arma con la respuesta.
   * Devuelve la respuesta, o null si no salió.
   */
  const pedirDesdeLaTarjeta = async (item, url, cuerpo, textoSiFalla, deshacer = null) => {
    const pid = item.productoBaseId;
    setTocando(pid);
    setErrores((prev) => {
      const m = new Map(prev);
      m.delete(pid);
      return m;
    });
    try {
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErrores((prev) => new Map(prev).set(pid, `${j?.error || textoSiFalla} No se guardó nada.`));
        return null;
      }
      await despuesDeResolver(item.nombre, typeof deshacer === "function" ? deshacer(j) : deshacer);
      return j;
    } catch {
      setErrores((prev) =>
        new Map(prev).set(pid, "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo.")
      );
      return null;
    } finally {
      setTocando(null);
    }
  };

  /**
   * «✓ USAR», QUE ES EL «✓ COINCIDE» DE LA RECEPCIÓN.
   *
   * Qué hace lo dice el servidor en `item.usar`, y cada acción es una ruta que ya
   * existía: confirmar la lectura que la tarjeta muestra, o tildar y destildar.
   * Una lectura fuera de rango NO se usa de un toque: se pregunta antes con la
   * misma pregunta de la hoja de revisar.
   */
  const usar = (item, { aceptarFueraDeRango = false } = {}) => {
    const u = item.usar;
    if (!u) return;
    if (u.accion === ACCION_USAR.CONFIRMAR) {
      if (u.fueraDeRango && !aceptarFueraDeRango) {
        setPreguntaFuera(item);
        return;
      }
      // Deshacer una confirmada es destildarla: vuelve a «Para revisar».
      return pedirDesdeLaTarjeta(
        item,
        `/api/proveedores/listas/${id}/filas/${item.filaId}/confirmar`,
        { clave: u.clave, aceptarFueraDeRango },
        "El servidor no pudo guardar este precio y no dijo por qué.",
        { url: `/api/proveedores/listas/${id}/seleccion`, cuerpo: { accion: ACCION_USAR.DESMARCAR, ids: [item.filaId] } }
      );
    }
    // Tildar y destildar se deshacen uno con el otro.
    const inversa = u.accion === ACCION_USAR.MARCAR ? ACCION_USAR.DESMARCAR : ACCION_USAR.MARCAR;
    return pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/seleccion`,
      { accion: u.accion, ids: [item.filaId] },
      "El servidor no pudo cambiarlo y no dijo por qué.",
      { url: `/api/proveedores/listas/${id}/seleccion`, cuerpo: { accion: inversa, ids: [item.filaId] } }
    );
  };

  /**
   * «✓ SÍ»: VINCULA CON EL RENGLÓN QUE LA TARJETA SUGIERE (Emanuel, 2026-10-24).
   *
   * El mismo pedido que la hoja de vincular hace al elegir un renglón, y el mismo
   * paso después: si hay una sola lectura en rango se toma sola, si no se abre
   * la decisión (`tomarLaUnica`). Desde una ubicación sin los costos, solo
   * vincula, como la hoja.
   */
  const si = async (item) => {
    const s = item.sugerencia;
    if (!s) return;
    const j = await pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/productos/${item.productoBaseId}/en-la-lista`,
      { filaElegidaId: s.id },
      "El servidor no pudo vincularlo y no dijo por qué.",
      (r) => deshacerVinculo(r?.filaId ?? s.id)
    );
    if (j?.filaId && puedeCambiarCostosAhora()) {
      setRevisando({ filaId: j.filaId, productoBaseId: item.productoBaseId, tomarLaUnica: true });
    }
  };

  /**
   * «LISTO» CON CUÁNTAS TRAE LA CAJA, O CON CUÁNTOS KILOS TRAE LA PIEZA: se
   * guarda como lectura recordada de este producto con este proveedor —no en
   * la ficha— y la tarjeta se relee con su cuenta. Deshacer vuelve a poner la
   * recordada que había antes. Las dos van a la misma ruta.
   */
  const guardarLoQueFalta = (item, cuerpo, textoSiFalla) => {
    const url = `/api/proveedores/listas/${id}/productos/${item.productoBaseId}/lectura-recordada`;
    return pedirDesdeLaTarjeta(item, url, cuerpo, textoSiFalla, (r) => ({
      url,
      cuerpo: { restaurar: r?.anterior ?? null },
    }));
  };
  const caja = (item, cantidad) =>
    guardarLoQueFalta(item, { cantidad }, "El servidor no pudo guardar cuántas trae la caja y no dijo por qué.");
  const kilos = (item, kilosDeLaPieza) =>
    guardarLoQueFalta(
      item,
      { kilos: kilosDeLaPieza },
      "El servidor no pudo guardar cuántos kilos trae la pieza y no dijo por qué."
    );

  /** El mismo criterio que el resto de la pantalla (`costos.puedeCambiar`). */
  const puedeCambiarCostosAhora = () => (datos?.cabecera?.costos?.puedeCambiar ?? true) !== false;

  /**
   * «Ir a Depósito: depo»: cambia la ubicación activa y vuelve a ESTA lista.
   *
   * Se recarga la página entera y no solo los datos: el encabezado de la app y
   * el contexto activo se leen al montar, y con una recarga parcial la barra
   * seguiría diciendo "Local: mini el 7" sobre una lista que ya se trabaja
   * desde el depósito.
   */
  const irALaUbicacionDeLosCostos = async () => {
    const destino = datos?.cabecera?.costos?.ubicacion;
    if (!destino) return;
    setCambiandoUbicacion(true);
    setErrorDeUbicacion("");
    const r = await elegirUbicacionActiva(destino.localId);
    if (!r?.ok) {
      setErrorDeUbicacion(`${r?.error || "No se pudo cambiar de ubicación."} Elegila desde el inicio.`);
      setCambiandoUbicacion(false);
      return;
    }
    window.location.assign(`/modulos/proveedores/listas/${id}`);
  };

  // ── EL PAQUETE 2, "PUEDEN SER DE DAB" (2026-10-24) ─────────────────────
  //
  // «✓ Sí» y «Otro» vinculan por la ruta de siempre (`en-la-lista`) con
  // `sumarProveedor`: el código, el renglón con el motor de la lista y Dab en
  // un lugar libre, sin quitar el que tenía. «No» y «No es de Dab» van a
  // `posibles`. Los cuatro dejan el aviso de abajo, como en el paquete 1.

  /** «✓ Sí» sobre el renglón propuesto: pasa a «Confirmados». */
  const siPuedeSer = (item) =>
    pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/productos/${item.productoBaseId}/en-la-lista`,
      { filaElegidaId: item.renglon.id, sumarProveedor: true },
      "El servidor no pudo vincularlo y no dijo por qué.",
      deshacerSumado(item.productoBaseId)
    );

  /** «No»: ese renglón no es ese producto, y no se vuelve a proponer. */
  const noPuedeSer = (item) =>
    pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/posibles`,
      { productoBaseId: item.productoBaseId, filaId: item.renglon.id },
      "El servidor no pudo guardar la respuesta y no dijo por qué."
    );

  /** «No es de Dab», en un confirmado: vuelve a «Por confirmar». */
  const noEsDe = (item) =>
    pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/posibles`,
      { deshacer: true, productoBaseId: item.productoBaseId },
      "El servidor no pudo deshacerlo y no dijo por qué."
    );

  /** «No viene»: lo mismo que el botón de la hoja de vincular, sin abrirla. */
  const noViene = (item) =>
    pedirDesdeLaTarjeta(
      item,
      `/api/proveedores/listas/${id}/productos/${item.productoBaseId}/en-la-lista`,
      { noViene: true },
      "El servidor no pudo guardarlo y no dijo por qué.",
      deshacerNoViene(item.productoBaseId)
    );

  /**
   * Pasa este control a actualizar precios, con el rango que se acaba de pedir.
   *
   * No escribe ningún costo: vuelve a conciliar la misma importación y la deja
   * en el resultado de siempre, con su botón de aplicar y su confirmación.
   */
  const pasarAActualizar = async ({ minPct, maxPct }) => {
    setPasando(true);
    setErrorAlPasar(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/pasar-a-actualizar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minPct, maxPct }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        // EL ERROR SE QUEDA EN LA HOJA, con el rango escrito a la vista. Sacarlo
        // afuera cerraría la hoja y habría que volver a escribir los dos
        // números para leer qué estuvo mal con ellos.
        setErrorAlPasar(j?.error || `No se pudo pasar a actualizar precios (error ${r.status}).`);
        return;
      }
      setPasandoAActualizar(false);
      setAviso({
        tono: "success",
        texto:
          `Listo: se volvió a leer con un aumento esperado de ${j.rango.minPct} % a ${j.rango.maxPct} %. ` +
          "Todavía no se cambió ningún costo.",
      });
      await cargar();
    } catch {
      setErrorAlPasar("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setPasando(false);
    }
  };

  /**
   * VUELVE A CALCULAR LA PROPUESTA DE LAS FILAS QUE QUEDARON VIEJAS.
   *
   * No manda ids: el servidor decide cuáles son con la misma función que decide
   * qué escribe aplicar. Mandarlos desde acá haría que una pantalla que quedó
   * abierta un rato pidiera releer filas que hoy ya se pueden aplicar.
   *
   * Y el aviso dice DÓNDE quedaron. "Listo" sin más dejaría a la persona
   * buscando: algunas vuelven a quedar listas con el número nuevo y otras caen en
   * la cola de revisión, y son dos próximos pasos distintos.
   */
  const releerPropuestas = async () => {
    setReleyendo(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/releer-propuestas`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({
          tono: "danger",
          texto: j?.error || `No se pudieron volver a leer esos precios (error ${r.status}).`,
        });
        return;
      }
      const partes = [];
      if (j.quedaronListas > 0) {
        partes.push(
          j.quedaronListas === 1
            ? "1 quedó lista con el precio de hoy"
            : `${j.quedaronListas} quedaron listas con los precios de hoy`
        );
      }
      if (j.quedaronParaRevisar > 0) {
        partes.push(
          j.quedaronParaRevisar === 1
            ? "1 pasó a la cola para que la mires"
            : `${j.quedaronParaRevisar} pasaron a la cola para que las mires`
        );
      }
      setAviso({
        tono: j.releidas === 0 ? "warning" : "success",
        texto:
          j.releidas === 0
            ? "No quedaba ninguna con la propuesta vieja: ya estaban al día."
            : `Se volvieron a leer ${j.releidas}. ${partes.join(" y ")}. Todavía no se cambió ningún costo.`,
      });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setReleyendo(false);
    }
  };

  /**
   * VUELVE A LEER LA LISTA CON OTRA COLUMNA DE PRECIO.
   *
   * No pide el archivo: cada fila guarda lo que decía cada columna. Y no toca el
   * modo ni el rango — lo único que cambia es de qué número se parte—, porque si
   * cambiaran dos cosas a la vez, mirando el resultado nadie podría decir cuál
   * de las dos lo movió.
   */
  const cambiarColumna = async ({ columna, conDescuento }) => {
    setPasando(true);
    setErrorAlPasar(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/columna-de-precio`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columna, conDescuento }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErrorAlPasar(j?.error || `No se pudo volver a leer con esa columna (error ${r.status}).`);
        return;
      }
      setCambiandoColumna(false);
      setAviso({
        tono: "success",
        texto: `Listo: se volvió a leer con ${nombreDeLaColumnaLeida({ ...datos?.lectura, ...j, nombreColumna: j.nombreColumna })}. Todavía no se cambió ningún costo.`,
      });
      await cargar();
    } catch {
      setErrorAlPasar("No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setPasando(false);
    }
  };

  /**
   * Rescata una lista que quedó leída con el rango en 0 a 0.
   *
   * No pide nada: el rango se conserva tal cual —es lo que distingue este
   * control de uno elegido a propósito— y lo único que cambia es con qué
   * pregunta se vuelve a conciliar.
   */
  const pasarAControlar = async () => {
    setPasando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/pasar-a-controlar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || `No se pudo pasar a control (error ${r.status}).` });
        return;
      }
      setAviso({
        tono: "success",
        texto: "Listo: ahora es un control. No se cambió ningún costo.",
      });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setPasando(false);
    }
  };

  /**
   * Cancela una importación SIN nada aplicado: solo la cierra. Con algo
   * aplicado se cancela desde "Cancelar la lista", que deshace.
   */
  const cancelarLista = async () => {
    setPasando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/cancelar`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || `No se pudo cancelar (error ${r.status}).` });
        return;
      }
      setCancelando(false);
      setCerrandoConPendientes(null);
      setAviso({ tono: "success", texto: textoDeLaCancelada(j) });
      await cargar();
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setPasando(false);
    }
  };

  /**
   * Baja el control entero como CSV.
   *
   * ── POR QUÉ UNA RUTA Y NO UN BLOB ARMADO ACÁ ────────────────────────────
   *
   * Porque acá NO están los datos: están tus productos, no las novecientas
   * líneas del archivo con su diferencia. Armar el archivo con lo que hay a mano
   * habría bajado un CSV titulado "el control" que se abre, se ve perfecto, y
   * miente por omisión sobre casi toda la lista.
   *
   * Es una navegación y no un `fetch`: el navegador maneja la descarga y el
   * `Content-Disposition` de la ruta pone el nombre del archivo.
   */
  const descargarElControl = () => {
    window.location.href = `/api/proveedores/listas/${id}/control.csv`;
  };

  /**
   * LOS MOTIVOS DE OMISIÓN, EN UNA FRASE.
   *
   * El servidor ya manda cada motivo con su texto en criollo —`textoOmision`— y
   * su cantidad, ordenados por cantidad. Acá NO se traduce nada: escribir los
   * textos de nuevo sería una segunda tabla de motivos, y el día que el servidor
   * agregue uno la pantalla lo mostraría como un código en mayúsculas.
   *
   * Se nombran los dos más grandes y el resto se resume. Con catorce motivos
   * distintos, listarlos todos sería un párrafo que nadie lee.
   */
  const textoDeMotivos = (motivos) => {
    if (!Array.isArray(motivos) || motivos.length === 0) return "";
    const conTexto = motivos.filter((m) => m?.texto);
    if (conTexto.length === 0) return "";
    const partes = conTexto.slice(0, 2).map((m) => `${m.cantidad}, ${m.texto}`);
    const resto = conTexto.length - partes.length;
    return partes.join(" ") + (resto > 0 ? ` Y ${resto} por otros motivos.` : "");
  };

  /** Devuelve `{ ok, escritos }`, para que «Aplicar y terminar» sepa si seguir. */
  const aplicar = async () => {
    setAplicando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/aplicar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alcance: "SELECCIONADAS" }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudieron aplicar los precios." });
        return { ok: false };
      }
      setConfirmando(false);
      // ── EL NÚMERO SALE DE DONDE EL SERVIDOR LO MANDA ────────────────────
      //
      // Acá decía `j.aplicadas`, y el endpoint NUNCA mandó ese campo: manda
      // `resumen.aplicadas`. O sea que el cartel decía "Se actualizaron 0
      // productos" SIEMPRE, hubiera escrito cero o trescientos. Es el texto que
      // Emanuel vio, y lo peor es que en su caso además era cierto — así que el
      // cartel tapaba el otro defecto en vez de delatarlo.
      const escritos = Number(j?.resumen?.aplicadas ?? 0);
      const omitidas = Number(j?.resumen?.omitidas ?? 0);
      const motivos = Array.isArray(j?.resumen?.motivos) ? j.resumen.motivos : [];

      if (escritos > 0) {
        setAviso({
          tono: "success",
          texto:
            `Listo. Se ${escritos === 1 ? "actualizó" : "actualizaron"} ${escritos} ` +
            `${escritos === 1 ? "producto" : "productos"}.` +
            (omitidas > 0 ? ` Quedaron ${omitidas} sin aplicar: ${textoDeMotivos(motivos)}` : ""),
        });
      } else {
        // ── CERO NO ES UN ÉXITO ───────────────────────────────────────────
        //
        // Un cartel verde que dice "Listo" sobre una operación que no escribió
        // nada es la pantalla afirmando que el trabajo está hecho. Emanuel tocó
        // el botón tres veces seguidas creyendo que algo había pasado.
        //
        // El motivo viene del servidor y se dice tal cual: es el que sabe por
        // qué omitió cada fila. Sin motivos —que no debería pasar— se dice eso
        // mismo, que es más honesto que inventar una explicación.
        setAviso({
          tono: "warning",
          texto:
            motivos.length > 0
              ? `No se actualizó ningún costo. ${textoDeMotivos(motivos)}`
              : "No se actualizó ningún costo, y el servidor no dijo por qué. " +
                "Mirá en «Cambian» si siguen marcados con «Usar».",
        });
      }
      await cargar();
      return { ok: true, escritos };
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
      return { ok: false };
    } finally {
      setAplicando(false);
    }
  };

  /**
   * Devuelve `true` si cerró. Con `conservarAviso` —después de aplicar— el
   * cartel de lo que se actualizó queda a la vista.
   */
  const terminar = async ({ conservarAviso = false } = {}) => {
    setAplicando(true);
    if (!conservarAviso) setAviso(null);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/finalizar`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || "No se pudo terminar la lista." });
        return false;
      }
      setTerminando(false);
      setCerrandoConPendientes(null);
      // Sin cartel "Lista terminada.": lo dice la píldora del estado, arriba.
      // Y el chip vuelve a elegirse: el que estaba puesto —"Cambian", para
      // aplicar— suele quedar en cero en una lista terminada.
      setFiltro(null);
      await cargar();
      return true;
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
      return false;
    } finally {
      setAplicando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeListas) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">
            Seleccioná un contexto operativo para ver esta lista.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando) {
    return (
      <Marco>
        <SunmiCard className="p-6"><SunmiLoader /></SunmiCard>
      </Marco>
    );
  }

  if (error) {
    return (
      <Marco>
        <ErrorRecuperable mensaje={error} onReintentar={cargar} />
      </Marco>
    );
  }

  const { cabecera, conteo, lectura } = datos;
  // Lo que el recálculo de HOY va a omitir, con el motivo y los dos números. El
  // default no es `{}` pelado: la tarjeta lee dos listas y con `{}` habría que
  // preguntar por cada una en tres lugares. Una importación vieja de un cliente
  // con la pantalla en caché puede no traer el campo, y ahí no hay omisiones que
  // mostrar, no una pantalla rota.
  const omitidas = datos.omitidasAlAplicar ?? { total: 0, porMotivo: [], propuestaDiferente: [] };
  const controlando = cabecera.modo === MODO_LISTA.CONTROLAR;
  // ── DESDE DÓNDE SE TRABAJA (Emanuel, 2026-10-24) ─────────────────────────
  //
  // Desde una ubicación que no administra los costos de la lista se puede
  // vincular y nada más: sin «Usar», sin «Corregir» y sin barra de aplicar, y
  // un solo aviso arriba en vez de una línea en cada tarjeta. Lo decide el
  // servidor con la regla de `confirmar`; un servidor viejo sin el dato deja
  // la pantalla como estaba.
  const costos = cabecera.costos ?? { puedeCambiar: true, ubicacion: null };
  const puedeCambiarCostos = costos.puedeCambiar !== false;
  const abierta = esImportacionAbierta(cabecera.estado);
  // Nadie la cerró: abierta, o APLICADA (todo aplicado). Se termina y se
  // cancela; solo TERMINADA y CANCELADA son cerradas de verdad (2026-10-24).
  const sinCerrar = esImportacionSinCerrar(cabecera.estado);
  const listos = conteo.listos;
  // Deshacer, y cancelar deshaciendo: solo lo que nadie cerró y aplicó algo.
  const puedeDeshacer = esImportacionRevertible(cabecera.estado) && cabecera.productosActualizados > 0;

  // ── CERRAR CON ALGO PARA APLICAR, NO DIRECTO (2026-10-24) ───────────────
  // Terminar cerraba sin avisar y 56 precios de Dab se perdieron. Con algo
  // para aplicar, terminar y cancelar abren "Te quedan precios sin aplicar";
  // sin nada, lo de siempre.
  const pendientes = pendientesDeLaLista({ conteo, cabecera });
  const alTerminar = () => abrirTerminar(pendientes);
  // ── CANCELAR DESHACE LO APLICADO (Emanuel, 2026-10-24) ───────────────────
  // Con algo aplicado, cancelar abre "Cancelar la lista": deshace y cierra.
  // Sin nada aplicado, lo de siempre (con su aviso de pendientes).
  const alCancelar = () =>
    puedeDeshacer
      ? setCancelandoConReversion(true)
      : queAbreAlCerrar(pendientes) === AL_CERRAR.HOJA_PENDIENTES
        ? setCerrandoConPendientes(CIERRE.CANCELAR)
        : setCancelando(true);

  const irA = (sub) => router.push(`/modulos/proveedores/listas/${id}${sub}`);

  // ── TUS PRODUCTOS, FILTRADOS ─────────────────────────────────────────────
  //
  // Una respuesta de un servidor viejo puede no traer la lista: se dibuja vacía
  // en vez de romper la pantalla.
  const tusProductos = datos.tusProductos ?? { items: [], conteo: { total: 0, traeLaLista: 0, porEstado: {} } };
  const nombreProveedor = cabecera.proveedor?.nombre ?? "este proveedor";
  const sinVincular = tusProductos.conteo.porEstado?.SIN_VINCULAR ?? 0;
  // Sin «Todos»: si todavía no se eligió, el mismo con el que arranca. Y con
  // texto en el buscador, `seVe` busca en todos sin mirar el chip.
  // Cerrada, un chip vacío no se queda puesto: arranca en el primero que tenga
  // algo (Emanuel, 2026-10-24: arrancaba en "Cambian 0" y "No hay ninguno").
  // Abierta sí, porque vaciar un chip es lo que pasa al ir resolviendo.
  const filtroActivo = filtroParaMostrar(filtro, tusProductos.conteo, { abierta });
  const visibles = tusProductos.items.filter((it) => seVe(it, { filtro: filtroActivo, buscar }));
  // "X de 158 listos": ni «Sin vincular» ni «Para revisar» (`tusProductos.js`).
  const listosDeLaRevision = tusProductos.conteo.listosDeLaRevision ?? 0;

  // ── EL PAQUETE 2 ─────────────────────────────────────────────────────────
  const puedenSer = datos.puedenSer ?? { porConfirmar: [], confirmados: [], conteo: { porConfirmar: 0, confirmados: 0 } };
  const pestanaActiva = pestanaPuedenSer ?? PESTANA_PUEDEN_SER.POR_CONFIRMAR;
  const enConfirmados = pestanaActiva === PESTANA_PUEDEN_SER.CONFIRMADOS;

  // ── LAS BAJAS DE LO QUE SE VA A APLICAR (2026-10-24) ─────────────────────
  // De los DOS paquetes, como «Para aplicar»: «✓ Aplicar» escribe los dos desde
  // cualquiera de las pantallas. Con alguna, Aplicar y «Aplicar y terminar»
  // abren "Estos productos bajan de precio" antes de escribir nada.
  const bajas = bajasAlAplicar([...tusProductos.items, ...puedenSer.confirmados]);
  const alAplicar = () =>
    queAbreAlAplicar(bajas) === AL_APLICAR.HOJA_BAJAS
      ? setAvisandoBajas(DESPUES_DE_LAS_BAJAS.APLICAR)
      : setConfirmando(true);
  const alAplicarIgual = async () => {
    if (avisandoBajas === DESPUES_DE_LAS_BAJAS.APLICAR_Y_TERMINAR) {
      await aplicarYTerminar({ listos: pendientes.listos, aplicar, terminar });
    } else {
      await aplicar();
    }
    setAvisandoBajas(null);
  };

  // «Para revisar»: las que bajan primero, después las que suben de más, con
  // la cuenta arriba de las tarjetas.
  const enParaRevisar = filtroActivo === FILTRO.REVISAR && !buscar.trim();
  const rangoDeLaLista = cabecera.rango ?? null;
  const resumenRevisar = resumenParaRevisar(visibles, rangoDeLaLista);
  const textoRevisar = textoResumenParaRevisar(resumenRevisar);
  const tarjetas = enParaRevisar ? ordenarParaRevisar(visibles, rangoDeLaLista) : visibles;

  // Arriba: qué es esto, y cuántos hay de cada uno ("N confirmados" / "M por
  // confirmar", lo pendiente en ámbar).
  const contextoPuedenSer = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="min-w-0 font-semibold sunmi-text-strong break-words">{nombreProveedor}</span>
        <ChipDeEstado cabecera={cabecera} />
      </div>
      <p className="text-sm2 sunmi-text-muted leading-snug">{explicacionPuedenSer(nombreProveedor)}</p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm2 sunmi-text-muted">
          <span className="tabular-nums sunmi-text-strong font-semibold">{puedenSer.conteo.confirmados}</span>{" "}
          {puedenSer.conteo.confirmados === 1 ? "confirmado" : "confirmados"}
        </span>
        <span className="text-sm2 sunmi-text-accent">
          <span className="tabular-nums font-semibold">{puedenSer.conteo.porConfirmar}</span> por confirmar
        </span>
      </div>
    </>
  );

  const filtrosPuedenSer = (
    <SunmiFiltroEstado
      opciones={[
        { clave: PESTANA_PUEDEN_SER.POR_CONFIRMAR, texto: "Por confirmar", cantidad: puedenSer.conteo.porConfirmar },
        { clave: PESTANA_PUEDEN_SER.CONFIRMADOS, texto: "Confirmados", cantidad: puedenSer.conteo.confirmados },
      ]}
      valor={pestanaActiva}
      onCambiar={setPestanaPuedenSer}
      ariaLabel="Por confirmar o confirmados"
    />
  );

  const listaPuedenSer = (
    <>
      {enConfirmados
        ? // Los confirmados son tarjetas de la revisión: «✓ Usar», «Corregir»,
          // la cuenta y el costo nuevo, iguales que en el paquete 1, más
          // «No es de Dab».
          puedenSer.confirmados.map((item) => (
            <TarjetaProductoDeLaLista
              key={item.productoBaseId}
              item={item}
              abierta={abierta}
              puedeCambiarCostos={puedeCambiarCostos}
              controlando={controlando}
              trabajando={tocando === item.productoBaseId}
              error={errores.get(item.productoBaseId) ?? ""}
              onUsar={(it) => usar(it)}
              onCorregir={(it) => setRevisando({ filaId: it.filaId, productoBaseId: it.productoBaseId })}
              onCaja={caja}
              onKilos={kilos}
              onNoEsDe={noEsDe}
              proveedor={nombreProveedor}
            />
          ))
        : puedenSer.porConfirmar.map((item) => (
            <TarjetaPorConfirmar
              key={item.productoBaseId}
              item={item}
              abierta={abierta}
              trabajando={tocando === item.productoBaseId}
              error={errores.get(item.productoBaseId) ?? ""}
              onSi={siPuedeSer}
              onNo={noPuedeSer}
              onOtro={(it) => setVinculando({ productoBaseId: it.productoBaseId, nombre: it.nombre, sumarProveedor: true })}
            />
          ))}
      {(enConfirmados ? puedenSer.confirmados : puedenSer.porConfirmar).length === 0 && (
        <p className="text-center py-6 sunmi-text-muted text-sm2">
          {enConfirmados ? "Todavía no confirmaste ninguno." : "No hay ninguno por confirmar."}
        </p>
      )}
    </>
  );

  // ── EL AVISO DE ABAJO: "Listo: <producto> · Deshacer" ───────────────────
  // Va en la barra fija, arriba de «Aplicar»; sin barra (un control, o desde
  // una ubicación sin los costos), es la barra él solo.
  const avisoHecho = hecho ? (
    <div className="flex items-center justify-between gap-3" role="status" aria-live="polite">
      {/* El nombre entero, en las líneas que haga falta (2026-10-24): con "…"
          dos productos parecidos se leen iguales. */}
      <span className="min-w-0 text-sm2 sunmi-text-strong break-words">
        {TEXTO_HECHO} {hecho.nombre}
        {hecho.deshacer ? " ·" : ""}
      </span>
      {hecho.deshacer && (
        <SunmiLinkButton onClick={volverAtras} disabled={volviendoAtras} className="shrink-0 text-sm2">
          {volviendoAtras ? "Deshaciendo…" : TEXTO_DESHACER}
        </SunmiLinkButton>
      )}
    </div>
  ) : null;

  // Los avisos que existen hoy, en el lugar de los caminos de excepción: entre
  // los filtros y la lista, como el "no figura" de la recepción. Se arman como
  // lista para que, sin ninguno, la ranura llegue en `null` y no deje un hueco.
  const avisos = [];

  // EL AVISO DEL 0 A 0. Se deduce de lo guardado, así que sigue estando la
  // semana que viene: quien puso 0 % tiene que poder entender por qué esta
  // lista terminó siendo un control, y no descubrirlo por descarte.
  if (cabecera.avisoDeModo) {
    avisos.push(<Aviso key="modo" tono="warning">{cabecera.avisoDeModo}</Aviso>);
  }

  // ── LA QUE QUEDÓ ATRAPADA EN EL DEFECTO VIEJO ──────────────────────────
  // Una lista leída con el rango en 0 a 0: el motor no pudo elegir la columna
  // de precio y dejó todo para revisar. No se arregla sola, así que se avisa al
  // abrirla y se ofrecen las dos salidas.
  if (cabecera.quedoAtrapada) {
    avisos.push(
      <Aviso key="atrapada" tono="warning">
        <p className="leading-snug">{cabecera.avisoAtrapada}</p>
        <div className="mt-2 space-y-2">
          <SunmiButton
            color="cyan"
            onClick={pasarAControlar}
            disabled={pasando}
            className="w-full min-h-toque text-sm3"
          >
            {pasando ? "Pasando…" : "Pasarla a control"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={alCancelar}
            disabled={pasando}
            className="w-full min-h-toque text-sm3"
          >
            Cancelar esta lista
          </SunmiButton>
        </div>
      </Aviso>
    );
  }

  if (aviso) avisos.push(<Aviso key="aviso" tono={aviso.tono}>{aviso.texto}</Aviso>);

  // ── FILAS QUE QUEDARON AFUERA POR UNA BAJA POSTERIOR ───────────────────
  // El archivo trae N renglones y la pantalla muestra menos: su producto se dio
  // de baja DESPUÉS de conciliar. Se dice el número, porque "algunas" no deja
  // comprobar nada.
  if (datos?.filasConProductoDeBaja > 0) {
    avisos.push(
      <Aviso key="bajas" tono="warning">
        {datos.filasConProductoDeBaja === 1
          ? "Una fila quedó afuera: el producto que tenía vinculado se dio de baja después de conciliar. No se le escribe costo."
          : `${datos.filasConProductoDeBaja} filas quedaron afuera: los productos que tenían vinculados se dieron de baja después de conciliar. No se les escribe costo.`}
      </Aviso>
    );
  }

  // ── LA COLUMNA QUE EXPLICA POCO, CON SU SALIDA ─────────────────────────
  // La columna equivocada no da un disparate visible, da un aumento plausible
  // que se aplica solo. Un aviso que dice que algo puede estar mal sin decir qué
  // hacer es peor que no avisar: va con el botón.
  if (explicaPoco(lectura) && abierta) {
    avisos.push(
      <Aviso key="columna" tono="warning">
        <p className="leading-snug">
          Los precios salieron de {nombreDeLaColumnaLeida(lectura)}, que coincide con tus costos en{" "}
          {lectura.explicadas} de cada {lectura.comparables} productos. Puede no ser la columna
          del precio que te factura este proveedor.
        </p>
        <div className="mt-2">
          <SunmiButton
            color="cyan"
            onClick={() => setCambiandoColumna(true)}
            disabled={pasando}
            className="w-full min-h-toque text-sm3"
          >
            Leer con otra columna
          </SunmiButton>
        </div>
      </Aviso>
    );
  }

  // CON QUÉ COLUMNA SE LEYÓ. Es la decisión de la que cuelga todo lo demás, así
  // que se dice, y se dice con su respaldo. NO se muestra cuando está el aviso de
  // arriba: dicen lo mismo con denominadores distintos.
  // Sin título también se dice (un PDF sin encabezado): con la columna descripta.
  if ((lectura?.titulo || lectura?.columna != null) && !(explicaPoco(lectura) && abierta)) {
    avisos.push(
      <p key="lectura" className="text-sm2 sunmi-text-muted leading-snug">
        Los precios salieron de {nombreDeLaColumnaLeida(lectura)}
        {lectura.conDescuento ? ", con el descuento aplicado" : ""}
        {lectura.comparables
          ? `, que coincide con tus costos en ${Math.round((lectura.explicadas / lectura.comparables) * 100)} de cada 100 productos.`
          : "."}
        {/* QUIÉN LA ELIGIÓ, y las tres respuestas son distintas para quien
            audita. */}
        {lectura.origenDeLaEleccion === "LA_ELEGISTE_AHORA" || (lectura.aMano && !lectura.origenDeLaEleccion)
          ? " La elegiste vos."
          : lectura.origenDeLaEleccion === "LA_ELEGISTE_ANTES"
            ? " La elegiste vos en una lista anterior de este proveedor."
            : " La eligió el sistema."}
      </p>
    );
  }

  // ── LAS QUE ESTÁN LISTAS Y NO SE VAN A ESCRIBIR ──────────────────────────
  // Sacarlas del número de la barra era la mitad del arreglo; la otra mitad es
  // decirlas. Solo cuando hay alguna.
  // Desde una ubicación sin los costos, ni éste ni el de abajo: los dos piden
  // una acción que desde acá no se puede hacer, y el de las omisiones además
  // decía "8 más: el costo lo administra otra ubicación", que es lo que ahora
  // dice una sola vez el aviso de arriba.
  // ── CERRADA, LO QUE NO SE APLICÓ SE DICE EN PASADO (2026-10-24) ─────────
  //
  // Decía "65 están listos pero sin tildar, así que aplicar no los va a tocar"
  // en una lista terminada: aplicar en futuro, cuando ya no se puede. Cerrada,
  // es un aviso de lo que quedó (`textoSinTildarEnUnaCerrada`), sin botón.
  if (!abierta && puedeCambiarCostos && !controlando && (conteo.listosSinTildar ?? 0) > 0) {
    avisos.push(
      <Aviso key="sinTildar" tono="warning">
        {textoSinTildarEnUnaCerrada(conteo.listosSinTildar)}
      </Aviso>
    );
  }
  if (!abierta && puedeCambiarCostos && !controlando && (conteo.omitidasAlAplicar ?? 0) > 0) {
    avisos.push(
      <Aviso key="omitidas" tono="warning">
        {textoTildadosSinAplicarEnUnaCerrada(conteo.omitidasAlAplicar)}
      </Aviso>
    );
  }

  if (abierta && puedeCambiarCostos && !controlando && (conteo.listosSinTildar ?? 0) > 0) {
    avisos.push(
      <SunmiCard key="sinTildar" className="p-3">
        <p className="text-sm2 sunmi-text-warning leading-snug">
          <span className="font-bold sunmi-text-strong">{conteo.listosSinTildar}</span>{" "}
          {conteo.listosSinTildar === 1 ? "está listo" : "están listos"} pero sin tildar, así que
          aplicar no {conteo.listosSinTildar === 1 ? "lo" : "los"} va a tocar.
        </p>
        <SunmiButton
          color="ghost"
          onClick={() => irA("/actualizan")}
          className="mt-2 w-full min-h-toque text-sm3"
        >
          Abrirlos para tildarlos
        </SunmiButton>
      </SunmiCard>
    );
  }

  // ── LAS QUE APLICAR VA A OMITIR PORQUE EL COSTO DA DISTINTO ────────────
  // De la importación #12: la pantalla decía 11, aplicar escribió 3 y nadie se
  // enteró. Se dicen con nombre y con los DOS números.
  if (abierta && puedeCambiarCostos && !controlando && (conteo.omitidasAlAplicar ?? 0) > 0) {
    avisos.push(
      <SunmiCard key="omitidas" className="p-3">
        {/* ── EL CARTEL NO AFIRMA QUE EL PRECIO CAMBIÓ ──────────────────
            En la #12 eso era FALSO en las siete filas que nombraba: lo que
            difería eran siete centavos por dónde caía un redondeo. Lo que el
            sistema SÍ sabe es cuánto difieren, así que eso es lo que dice. */}
        <p className="text-sm2 sunmi-text-warning leading-snug">
          <span className="font-bold sunmi-text-strong">{conteo.omitidasAlAplicar}</span>{" "}
          {conteo.omitidasAlAplicar === 1 ? "no se va a actualizar" : "no se van a actualizar"}:
          con los datos de hoy {conteo.omitidasAlAplicar === 1 ? "el costo da" : "los costos dan"}{" "}
          distinto del que se había propuesto, y la diferencia es grande como para
          escribirla sin que la mires.
        </p>

        {(omitidas.propuestaDiferente ?? []).length > 0 && (
          <div className="mt-2 divide-y sunmi-divide">
            {(omitidas.propuestaDiferente ?? []).slice(0, 5).map((o) => (
              <div key={o.filaId} className="py-2">
                <div className="text-sm2 sunmi-text-strong break-words">
                  {o.nombre ?? `Fila ${o.filaExcel ?? o.filaId}`}
                </div>
                <div className="text-sm2 sunmi-text-muted tabular-nums">
                  Antes se iba a poner {money(o.costoGuardado)} y ahora daría{" "}
                  <span className="sunmi-text-strong">{money(o.costoRecalculado)}</span>
                </div>
                {/* EN CUÁNTO DIFIERE, que es el dato que decide. Sale del
                    servidor, calculado por la misma función que decidió frenar. */}
                {o.diferencia?.pesos !== null && o.diferencia?.pesos !== undefined && (
                  <div className="text-xs2 sunmi-text-warning tabular-nums">
                    Son {money(Math.abs(o.diferencia.pesos))} de diferencia
                    {o.diferencia?.pct === null || o.diferencia?.pct === undefined
                      ? ""
                      : ` (${pct(o.diferencia.pct)})`}
                    .
                  </div>
                )}
              </div>
            ))}
            {(omitidas.propuestaDiferente ?? []).length > 5 && (
              <p className="pt-2 text-xs2 sunmi-text-muted">
                Y {(omitidas.propuestaDiferente ?? []).length - 5} más.
              </p>
            )}
          </div>
        )}

        {/* LA SALIDA. Volver a leerlas recalcula la propuesta con los datos de
            hoy y las deja para mirar de nuevo: no escribe ningún costo. */}
        {abierta && (omitidas.propuestaDiferente ?? []).length > 0 && (
          <SunmiButton
            color="ghost"
            onClick={releerPropuestas}
            disabled={releyendo}
            className="mt-2 w-full min-h-toque text-sm3"
          >
            {releyendo
              ? "Volviendo a leer…"
              : (omitidas.propuestaDiferente ?? []).length === 1
                ? "Volver a leer ese precio"
                : `Volver a leer esos ${(omitidas.propuestaDiferente ?? []).length} precios`}
          </SunmiButton>
        )}

        {/* Las omisiones que NO son de propuesta diferente también se nombran. */}
        {(omitidas.porMotivo ?? [])
          .filter((m) => m.motivo !== "PROPUESTA_DIFERENTE")
          .map((m) => (
            <p key={m.motivo} className="mt-2 text-xs2 sunmi-text-muted leading-snug">
              {m.cantidad === 1 ? "Una más" : `${m.cantidad} más`}: {m.texto}
            </p>
          ))}
      </SunmiCard>
    );
  }

  return (
    <Marco>
      {/* ── EL AVISO DE LA UBICACIÓN, ARRIBA Y UNA SOLA VEZ ──────────────────
          Antes se enteraba al final: vinculaba, elegía la lectura, tocaba
          «Usar» y recién ahí "No se guardó nada", con una línea suelta en cada
          tarjeta. Ahora se dice al abrir, con la salida al lado. Pasarse lo
          puede hacer quien puede elegir esa ubicación: la ruta de siempre no le
          deja a un no administrador elegir otro local, así que a él no se le
          ofrece un botón que va a fallar. */}
      {!puedeCambiarCostos && costos.ubicacion && (
        <SunmiAviso tono="warning">
          <p className="leading-snug">
            Esta lista se trabaja desde {nombreDeUbicacion(costos.ubicacion)}. Desde acá podés vincular
            pero no cambiar costos.
          </p>
          {perfil?.esAdmin && (
            <SunmiButton
              color="amber"
              onClick={irALaUbicacionDeLosCostos}
              disabled={cambiandoUbicacion}
              className="mt-2 w-full min-h-toque justify-center"
            >
              {cambiandoUbicacion ? "Cambiando…" : `Ir a ${nombreDeUbicacion(costos.ubicacion)}`}
            </SunmiButton>
          )}
          {errorDeUbicacion && <p className="mt-2 text-sm2 sunmi-text-danger">{errorDeUbicacion}</p>}
        </SunmiAviso>
      )}
      <SunmiPantallaDeTrabajo
        contexto={
          enPuedenSer ? contextoPuedenSer : <>
            {/* ── 1 · DE QUIÉN ES ESTA LISTA ──────────────────────────────
                Como "Transferencia #464": el nombre en negrita y el chip del
                estado al lado. */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 font-semibold sunmi-text-strong break-words">{nombreProveedor}</span>
              <ChipDeEstado cabecera={cabecera} />
            </div>
            {/* NO HAY FECHA DE LA LISTA: la base guarda cuándo se subió y
                cuándo se leyó, pero no la fecha que trae el papel. En su lugar
                va el archivo, que es lo que la identifica. Controlando se dice
                además que no cambia nada, que es la primera pregunta de quien
                abre un control. */}
            <p className="text-sm2 sunmi-text-muted break-words">
              {cabecera.archivoNombre} · subida {fechaHora(cabecera.subidaEn ?? cabecera.leidaEn)}
              {controlando ? " · control: no cambia ningún precio" : ""}
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm2 sunmi-text-muted">
                <span className="tabular-nums sunmi-text-strong font-semibold">
                  {tusProductos.conteo.traeLaLista} / {tusProductos.conteo.total}
                </span>{" "}
                en la lista
              </span>
              <span className={`text-sm2 ${sinVincular > 0 ? "sunmi-text-accent" : "sunmi-text-success"}`}>
                {sinVincular > 0 ? `${sinVincular} sin vincular` : "Nada sin vincular"}
              </span>
            </div>
            {/* ── 2 · CUÁNTO FALTA, COMO "0 / 14 REVISADOS" ──────────────
                Listo es lo que no está ni en «Sin vincular» ni en «Para
                revisar». Avanza a medida que las tarjetas se resuelven. */}
            <p className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">
                {listosDeLaRevision} de {tusProductos.conteo.total}
              </span>{" "}
              listos
            </p>
            <SunmiBarraDeProgreso
              hechos={listosDeLaRevision}
              total={tusProductos.conteo.total}
              etiqueta={`${listosDeLaRevision} de ${tusProductos.conteo.total} listos`}
            />
          </>
        }
        buscador={
          enPuedenSer ? null : <SunmiCampoBusquedaVoz
            value={buscar}
            onChange={setBuscar}
            onVoz={setBuscar}
            placeholder={PLACEHOLDER_BUSCADOR_LISTA}
            ariaLabel="Buscar tu producto o código"
          />
        }
        filtros={
          enPuedenSer ? filtrosPuedenSer : <SunmiFiltroEstado
            opciones={ORDEN_FILTROS.map((f) => ({
              clave: f,
              texto: TEXTO_FILTRO[f],
              cantidad: cantidadDelFiltro(f, tusProductos.conteo),
            }))}
            valor={filtroActivo}
            onCambiar={setFiltro}
            ariaLabel="Filtrar tus productos por estado"
          />
        }
        // En el paquete 2, solo el aviso de lo que acaba de pasar: los demás
        // —columna, omisiones, sin tildar— son de la lista y van en el 1.
        antesDeLista={
          enPuedenSer
            ? aviso
              ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
              : null
            : avisos.length > 0
              ? <>{avisos}</>
              : null
        }
        lista={
          enPuedenSer ? listaPuedenSer : <>
            {/* ── UNA TARJETA POR PRODUCTO TUYO ─────────────────────────
                Los renglones de la lista que no son tuyos no se listan: solo
                aparecen en el buscador de la hoja de vincular. */}
            {/* En «Para revisar», la cuenta de lo que más importa mirar, con
                las que bajan en rojo; las tarjetas vienen en ese orden. */}
            {enParaRevisar && visibles.length > 0 && (
              <p className="text-sm2 leading-snug">
                <span className="font-semibold sunmi-text-danger">{textoRevisar.bajan}</span>
                <span className="sunmi-text-muted"> · {textoRevisar.subenDeMas}</span>
              </p>
            )}
            {tarjetas.map((item) => (
              <TarjetaProductoDeLaLista
                key={item.productoBaseId}
                item={item}
                abierta={abierta}
                puedeCambiarCostos={puedeCambiarCostos}
                controlando={controlando}
                trabajando={tocando === item.productoBaseId}
                error={errores.get(item.productoBaseId) ?? ""}
                onUsar={(it) => usar(it)}
                onNoViene={noViene}
                onVincular={(it) => setVinculando({ productoBaseId: it.productoBaseId, nombre: it.nombre })}
                onCorregir={(it) => setRevisando({ filaId: it.filaId, productoBaseId: it.productoBaseId })}
                onSi={si}
                onCaja={caja}
                onKilos={kilos}
              />
            ))}
            {visibles.length === 0 && (
              <p className="text-center py-6 sunmi-text-muted text-sm2">
                {buscar.trim()
                  ? "Ninguno de tus productos se llama así ni tiene ese código."
                  : "No hay ninguno en este grupo."}
              </p>
            )}
          </>
        }
        despuesDeLista={
          enPuedenSer ? null : <>
            {/* ── LAS DOS ACCIONES DE UN CONTROL ───────────────────────────
                Ninguna de las dos escribe un costo. "Pasar a actualizar
                precios" convierte ESTA importación sin volver a subir el
                archivo, y el que escribe sigue siendo aplicar, con su
                confirmación. */}
            {controlando && abierta && (
              <div className="space-y-2">
                <SunmiButton
                  color="cyan"
                  onClick={() => setPasandoAActualizar(true)}
                  disabled={pasando}
                  className="w-full min-h-toque text-base font-bold"
                >
                  {pasando ? "Pasando…" : "Pasar a actualizar precios"}
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={descargarElControl}
                  className="w-full min-h-toque text-sm3"
                >
                  Descargar el control
                </SunmiButton>
                <p className="text-sm2 sunmi-text-muted text-center leading-snug">
                  Pasar a actualizar no cambia nada todavía: vuelve a leer esta misma lista con el
                  aumento que esperás y te muestra el resultado antes de aplicar.
                </p>
              </div>
            )}

            {puedeDeshacer && (
              <SunmiButton
                color="slate"
                onClick={() => setDeshaciendo(true)}
                disabled={aplicando}
                className="w-full min-h-toque text-sm3"
              >
                {cabecera.productosActualizados === 1
                  ? "Deshacer el que se actualizó"
                  : `Deshacer los ${cabecera.productosActualizados} que se actualizaron`}
              </SunmiButton>
            )}

            {/* ── TERMINAR Y CANCELAR, JUNTOS Y MIENTRAS LA LISTA ESTÉ ABIERTA
                Son la misma decisión mirada de los dos lados: cerrar esto
                porque ya está, o cerrarlo porque no servía. Terminar se ofrece
                siempre que esté abierta: una lista con productos que nunca se
                van a resolver tiene que poder cerrarse. */}
            {/* Cerrada, el reporte va en la barra fija de abajo; abierta, acá,
                a lo ancho y con el mismo botón que sus vecinos. Los dos abren
                la misma hoja. */}
            {sinCerrar && (
              <div className="grid grid-cols-2 gap-2">
                <SunmiButton
                  color="slate"
                  onClick={alTerminar}
                  disabled={aplicando || pasando}
                  className="min-h-toque text-sm3"
                >
                  Terminar lista
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={alCancelar}
                  disabled={aplicando || pasando}
                  className="min-h-toque text-sm3"
                >
                  Cancelar esta lista
                </SunmiButton>
                {/* Una APLICADA ya tiene el reporte en la barra de abajo. */}
                {abierta && (
                  <SunmiButton
                    color="slate"
                    onClick={() => setViendoReporte(true)}
                    className="col-span-2 min-h-toque text-sm3 justify-center"
                  >
                    {TEXTO_REPORTE}
                  </SunmiButton>
                )}
              </div>
            )}
          </>
        }
        /* ── LA BARRA FIJA DE ABAJO, COMO «TOTAL / ✓ CONFIRMAR» ──────────────
            El número es `conteo.listos`, el mismo que consulta aplicar y que
            decide qué tarjetas están en «Cambian». La confirmación y las reglas
            de rango son las de siempre. En un control no hay nada que aplicar, y
            en una lista cerrada tampoco: sin barra. */
        pieDePantalla={
          !controlando && abierta && puedeCambiarCostos ? (
            <div className="space-y-2">
            {avisoHecho}
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm2 sunmi-text-muted">Para aplicar</span>
                <span className="block tabular-nums text-lg2 font-semibold sunmi-text-strong">
                  {listos} {listos === 1 ? "precio" : "precios"}
                </span>
              </span>
              <SunmiButton
                color="amber"
                onClick={alAplicar}
                disabled={listos === 0 || aplicando}
                className="shrink-0 justify-center"
              >
                {aplicando ? "Aplicando…" : "✓ Aplicar"}
              </SunmiButton>
            </div>
            </div>
          ) : !abierta ? (
            // ── CERRADA: LO QUE QUEDÓ Y EL REPORTE (2026-10-24) ──────────────
            // La misma barra, con el resumen a la izquierda y el reporte a la
            // derecha, con el estilo de «✓ Aplicar». Antes era un botón de
            // medio ancho al final que no se parecía al resto de la pantalla.
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 tabular-nums text-lg2 font-semibold sunmi-text-strong">
                {resumenDeLaCerrada(cabecera.productosActualizados)}
              </span>
              <SunmiButton color="amber" onClick={() => setViendoReporte(true)} className="shrink-0 justify-center">
                {TEXTO_REPORTE}
              </SunmiButton>
            </div>
          ) : (
            avisoHecho
          )
        }
        despuesDelPie={
          <>
            <ModalRevertir
              abierto={deshaciendo}
              importacionId={id}
              onCerrar={() => setDeshaciendo(false)}
              onRevertido={async (r) => {
                setDeshaciendo(false);
                // EL AVISO DICE LO QUE QUEDÓ, y los números se releen de la base.
                const cuantos = r?.resumen?.revierten ?? 0;
                // ── SI LA LISTA NO SE PUDO REABRIR, SE DICE ─────────────────
                // Deshacer devuelve los costos y además reabre la lista. Lo
                // segundo no se puede cuando ya hay otra importación abierta del
                // MISMO archivo; acá se explica por qué la lista quedó cerrada.
                const otra = r?.noSePudoReabrir ?? null;
                setAviso({
                  tono: otra ? "warning" : "success",
                  texto: otra
                    ? `Se deshizo: ${cuantos} ${cuantos === 1 ? "producto volvió" : "productos volvieron"} a su costo anterior. ` +
                      `La lista queda cerrada porque ya tenés abierta otra importación del mismo archivo (#${otra.id}).`
                    : `Se deshizo. ${cuantos} ${cuantos === 1 ? "producto volvió" : "productos volvieron"} a su costo anterior.`,
                });
                await cargar();
              }}
            />

            <ModalTerminar
              abierto={terminando}
              sinAplicar={conteo.paraRevisar}
              actualizados={cabecera.productosActualizados}
              trabajando={aplicando}
              onCerrar={() => setTerminando(false)}
              onTerminar={() => terminar()}
            />

            {cerrandoConPendientes && (
              <HojaCerrarConPendientes
                accion={cerrandoConPendientes}
                pendientes={pendientes}
                trabajando={aplicando || pasando}
                // Si no cerró —aplicar falló, o no escribió nada—, la hoja se
                // va igual: el aviso que lo explica está arriba, debajo de ella.
                onAplicarYTerminar={async () => {
                  // Con bajas, primero "Estos productos bajan de precio": no se
                  // escribe nada hasta «Aplicar igual».
                  if (queAbreAlAplicar(bajas) === AL_APLICAR.HOJA_BAJAS) {
                    setCerrandoConPendientes(null);
                    setAvisandoBajas(DESPUES_DE_LAS_BAJAS.APLICAR_Y_TERMINAR);
                    return;
                  }
                  await aplicarYTerminar({ listos: pendientes.listos, aplicar, terminar });
                  setCerrandoConPendientes(null);
                }}
                onCerrarSinAplicar={async () => {
                  await (cerrandoConPendientes === CIERRE.CANCELAR ? cancelarLista() : terminar());
                  setCerrandoConPendientes(null);
                }}
                onVolver={() => setCerrandoConPendientes(null)}
              />
            )}

            {/* ── CANCELAR SE PREGUNTA, Y CON SU PROPIA PALABRA ─────────────
                No se reusa `ModalTerminar`: enumera cuántos productos quedan
                sin aplicar, que es el balance de un trabajo hecho. */}
            <ModalCancelarImportacion
              abierto={cancelando}
              archivo={cabecera.archivoNombre}
              trabajando={pasando}
              onCerrar={() => setCancelando(false)}
              onCancelar={cancelarLista}
            />

            {/* Con algo aplicado: deshace y cancela en una transacción. */}
            {cancelandoConReversion && (
              <HojaCancelarLaLista
                importacionId={id}
                onCancelada={async (j) => {
                  setCancelandoConReversion(false);
                  setFiltro(null);
                  setAviso({ tono: "success", texto: textoDeLaCancelada(j) });
                  await cargar();
                }}
                onVolver={() => setCancelandoConReversion(false)}
              />
            )}

            {pasandoAActualizar && (
              <HojaPasarAActualizar
                proveedor={cabecera.proveedor?.nombre ?? ""}
                // El rango del proveedor, si tiene, para no arrancar con dos
                // campos en blanco.
                minSugerido={cabecera.rango?.minPct ?? null}
                maxSugerido={cabecera.rango?.maxPct ?? null}
                trabajando={pasando}
                error={errorAlPasar}
                onPasar={pasarAActualizar}
                onVolver={() => {
                  setPasandoAActualizar(false);
                  setErrorAlPasar(null);
                }}
              />
            )}

            {cambiandoColumna && (
              <HojaCambiarColumna
                lectura={lectura}
                trabajando={pasando}
                error={errorAlPasar}
                onCambiar={cambiarColumna}
                onVolver={() => {
                  setCambiandoColumna(false);
                  setErrorAlPasar(null);
                }}
              />
            )}

            {/* ── VINCULAR CON LA LISTA ─────────────────────────────────────
                Al guardar, la hoja se cierra, la lista se relee sin el
                cargador y abajo queda el aviso con «Deshacer». */}
            {vinculando && (
              <HojaVincularConLaLista
                endpoint={`/api/proveedores/listas/${id}/productos/${vinculando.productoBaseId}/en-la-lista`}
                nombre={vinculando.nombre}
                proveedor={nombreProveedor}
                // «Otro» del paquete 2: suma Dab como «✓ Sí», y no ofrece «No
                // viene», porque el producto no es de Dab.
                cuerpoNoViene={vinculando.sumarProveedor ? null : { noViene: true }}
                cuerpoVincular={vinculando.sumarProveedor ? { sumarProveedor: true } : null}
                // VINCULAR EN UN SOLO PASO: vinculado, la misma hoja sigue con
                // caja entera / una unidad / No lo cambio, y se cierra sola si no
                // hay nada que decidir. Desde una ubicación sin los costos no
                // sigue: ahí no se puede elegir la lectura.
                importacionId={id}
                seguirConLaLectura={puedeCambiarCostos}
                onNoEsEste={async (fila) => {
                  const productoBaseId = vinculando.productoBaseId;
                  setVinculando(null);
                  setEligiendoOtra({ fila, productoBaseId });
                  // El vínculo ya quedó guardado: la tarjeta se relee igual.
                  await cargar({ silencioso: true });
                }}
                onCerrar={() => setVinculando(null)}
                onListo={async (j) => {
                  const { productoBaseId, nombre, sumarProveedor } = vinculando;
                  setVinculando(null);
                  await despuesDeResolver(
                    nombre,
                    sumarProveedor ? deshacerSumado(productoBaseId) : deshacerDeLaHoja(j, productoBaseId)
                  );
                }}
              />
            )}

            {/* ── «NO ES ESTE PRODUCTO», DESDE LA HOJA DE CORREGIR ──────────
                La misma hoja, por la puerta de la fila: mueve el vínculo a otro
                renglón, o con «No viene en esta lista» lo saca de la lista. */}
            {eligiendoOtra && (
              <HojaVincularConLaLista
                key={`${eligiendoOtra.fila.id}-${eligiendoOtra.vez ?? 0}`}
                endpoint={`/api/proveedores/listas/${id}/filas/${eligiendoOtra.fila.id}/otra-fila`}
                nombre={eligiendoOtra.fila.nombre}
                proveedor={nombreProveedor}
                cuerpoNoViene={{ noEstaEnLaLista: true }}
                // También en un solo paso: el renglón nuevo sigue con su lectura.
                importacionId={id}
                seguirConLaLectura={puedeCambiarCostos}
                // `vez` vuelve a montar la hoja: sin eso se quedaría en el paso de
                // la lectura del renglón anterior.
                onNoEsEste={(fila) => setEligiendoOtra({ fila, productoBaseId: eligiendoOtra.productoBaseId, vez: Date.now() })}
                onCerrar={() => setEligiendoOtra(null)}
                onListo={async () => {
                  setEligiendoOtra(null);
                  await cargar({ silencioso: true });
                }}
              />
            )}

            {/* ── CORREGIR: LA DECISIÓN DE SIEMPRE, EN UNA HOJA ─────────────
                Caja entera, una unidad, No lo cambio, o No es este producto. */}
            {revisando && (
              <HojaRevisarPrecio
                importacionId={id}
                filaId={revisando.filaId}
                // Recién vinculado con «✓ Sí»: el paso que sigue a la hoja de
                // vincular, con la única lectura en rango tomada sola.
                tomarLaUnica={revisando.tomarLaUnica === true}
                // Se contestó en la hoja lo que faltaba (kilos o caja): la
                // tarjeta de abajo se relee aunque la hoja siga abierta.
                onCambio={() => cargar({ silencioso: true })}
                onCerrar={() => setRevisando(null)}
                onNoEsEste={(fila) => {
                  const productoBaseId = revisando.productoBaseId;
                  setRevisando(null);
                  setEligiendoOtra({ fila, productoBaseId });
                }}
                onListo={async () => {
                  setRevisando(null);
                  await cargar({ silencioso: true });
                }}
              />
            )}

            {/* ── «✓ USAR» FUERA DE RANGO SE PREGUNTA, COMO EN LA HOJA ──────
                La misma pregunta, con el número de hoy y el nuevo enfrentados:
                el toque en la tarjeta no se saltea lo que la hoja pregunta. */}
            {preguntaFuera && (
              <ConfirmarFueraDeRango
                lectura={preguntaFuera.usar}
                costoDeHoy={preguntaFuera.costoHoy}
                rangoTexto={textoDelRango(cabecera.rango, pct)}
                trabajando={tocando === preguntaFuera.productoBaseId}
                onCerrar={() => setPreguntaFuera(null)}
                onConfirmar={async () => {
                  const item = preguntaFuera;
                  setPreguntaFuera(null);
                  await usar(item, { aceptarFueraDeRango: true });
                }}
              />
            )}

            {/* ── EL REPORTE, EN UNA HOJA ───────────────────────────────────
                La misma pieza que la hoja de vincular, con las tres descargas
                como tarjetas a todo el ancho. */}
            {viendoReporte && (
              <HojaReporte
                importacionId={id}
                cabecera={cabecera}
                proveedor={cabecera.proveedor}
                usuario={perfil}
                onCerrar={() => setViendoReporte(false)}
              />
            )}

            {avisandoBajas && (
              <HojaBajasDePrecio
                bajas={bajas}
                trabajando={aplicando}
                onAplicarIgual={alAplicarIgual}
                onVolver={() => setAvisandoBajas(null)}
              />
            )}

            {confirmando && (
              <HojaConfirmarAplicar
                cantidad={listos}
                proveedor={cabecera.proveedor?.nombre ?? ""}
                paraRevisar={conteo.paraRevisar}
                trabajando={aplicando}
                onAplicar={aplicar}
                onVolver={() => setConfirmando(false)}
              />
            )}
          </>
        }
      />
    </Marco>
  );
}

/**
 * EL CHIP DE LA CABECERA: Leída, Aplicada, Terminada o Cancelada.
 *
 * Con las clases del chip de la transferencia —en curso, recibida y cancelada—,
 * igual que el control de stock: la lista abierta está "en curso", la terminada
 * está cerrada como una recibida.
 */
function ChipDeEstado({ cabecera }) {
  if (cabecera.estado === "CANCELADA") return <EstadoTransferenciaBadge estado="Cancelada" />;
  if (cabecera.estado === "TERMINADA") return <InsigniaTerminada>Terminada</InsigniaTerminada>;
  if (cabecera.productosActualizados > 0 || cabecera.estado === "APLICADA" || cabecera.estado === "PARCIALMENTE_APLICADA") {
    return <InsigniaEnCurso>Aplicada</InsigniaEnCurso>;
  }
  return <InsigniaEnCurso>Leída</InsigniaEnCurso>;
}

/**
 * El contenedor de la página. El gutter de la recepción: el `p-2` de la página
 * más el `p-4` del `<main>`, que es con lo que cuenta la barra fija de
 * `SunmiPantallaDeTrabajo`. El ancho máximo es para que en la computadora las
 * tarjetas no se estiren de punta a punta.
 */
function Marco({ children }) {
  return <div className="sunmi-bg w-full min-h-full p-2 lg:p-3 max-w-3xl mx-auto space-y-3">{children}</div>;
}
