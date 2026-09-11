// app/modulos/transferencias/[id]/page.jsx
//
// Página "Ver transferencia". Copia la composición de
// app/modulos/reportes-ventas/[ventaId]/page.jsx: mismo contenedor a ancho
// completo, misma franja de encabezado, misma card de acciones arriba y las
// mismas secciones hermanas debajo (Información general → Productos → Totales).
//
//   contenedor  sunmi-bg w-full min-h-full p-2 lg:p-3
//   interior    w-full space-y-3
//   franja      flex items-start justify-between gap-3 flex-wrap
//   acciones    SunmiCard p-3 con flex flex-wrap gap-2
//   secciones   section space-y-2 → SectionHead + SunmiCard
//
// Lo que se eliminó a propósito: `max-w-6xl mx-auto` (Ventas lo quitó porque
// recortaba la página y la centraba dejando el ancho vacío), la SunmiCard única
// que envolvía todo, y los `mx-1` internos. La lógica de recepción,
// confirmación, cancelación y permisos no se tocó.
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

import SinPermisos from "@/components/auth/SinPermisos";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "@/components/transferencias/EstadoTransferenciaBadge";
import TransferenciaHeader from "@/components/transferencias/TransferenciaHeader";
import TablaDetalleTransferencia from "@/components/transferencias/TablaDetalleTransferencia";
import AccionesRecepcion from "@/components/transferencias/AccionesRecepcion";
import WorkspaceRecepcion from "@/components/transferencias/WorkspaceRecepcion";
import PanelCancelarTransferencia from "@/components/transferencias/PanelCancelarTransferencia";
import { SectionHead, TotalTile, fmtCantidad, fmtMoneda } from "@/components/transferencias/detallePresentacion";
import { exigeMotivo } from "@/lib/transferencias/recepcion";
import { ESTADO_PRODUCTO, estadoDeProducto } from "@/lib/transferencias/controlFisico";
import {
  MODO_RECEPCION,
  cuerpoQuitarLinea,
  modoDeRecepcion,
  siguienteEdicion,
} from "@/lib/transferencias/recepcionUI";

const LISTADO = "/modulos/transferencias";
const TZ_AR = "America/Argentina/Cordoba";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtFechaHoraAR(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

export default function TransferenciaDetallePage() {
  const { id } = useParams();
  const router = useRouter();
  const { contexto } = useContextoActivo();

  const [item, setItem] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  // ── ESTE HOOK ESTABA 130 LÍNEAS MÁS ABAJO Y ROMPÍA LA PANTALLA ────────────
  //
  // Abre el panel de cancelación. Vivía después de `if (!me) return ...`, y ahí
  // está el defecto: en el PRIMER render `me` es null, el componente retorna
  // antes y React cuenta ocho `useState`; en el segundo `me` ya existe, la
  // ejecución llega hasta acá y React cuenta nueve. Cambiar la cantidad de hooks
  // entre renders es exactamente lo que las Rules of Hooks prohíben, y el
  // resultado fue "Application error: a client-side exception has occurred" al
  // abrir CUALQUIER transferencia.
  //
  // Lo introduje al reemplazar el handler `cancelarTransferencia` por este
  // estado: un handler puede vivir en cualquier lado, un hook no. Que el
  // reemplazo fuera línea por línea en el mismo lugar es lo que lo hizo
  // invisible al leer el diff.
  //
  // Todo hook de este componente va acá arriba, antes de cualquier return.
  const [panelCancelar, setPanelCancelar] = useState(false);

  // Selector de "producto que llegó y no estaba en el remito", y qué línea se
  // está quitando. Los dos hooks van acá arriba, antes de cualquier return, por
  // el mismo motivo que el de arriba: cambiar la cantidad de hooks entre renders
  // rompe la pantalla entera.
  const [quitandoId, setQuitandoId] = useState(null);
  const [revisando, setRevisando] = useState(false);

  const [me, setMe] = useState(null);

  // Detecta cambios sin guardar
  const [dirty, setDirty] = useState(false);

  // ── UN ESPEJO DE `editItems`, Y NO ES UNA COMODIDAD ───────────────────────
  //
  // Agregar una línea recarga del servidor y tiene que RECONCILIAR lo fresco con
  // lo que el operador tenía escrito. Ese "lo que tenía escrito" hay que leerlo
  // en el momento de recargar, y leerlo del estado significaría leer la clausura
  // del render en el que se creó el handler: si entre medio hubo otro
  // `setEditItems`, el valor sería viejo y la edición que se pretende conservar
  // se perdería igual — el mismo defecto con otra causa.
  //
  // El ref se escribe en el MISMO lugar donde se escribe el estado, así que los
  // dos dicen siempre lo mismo.
  const editItemsRef = useRef([]);
  const aplicarEditItems = (valor) => {
    editItemsRef.current = valor;
    setEditItems(valor);
  };

  // Wrapper para marcar cambios como dirty. Solo lo llama la tabla histórica,
  // que es el único consumidor del editor por lotes.
  const setEditItemsDirty = (valor) => {
    setDirty(true);
    aplicarEditItems(valor);
  };

  // ── EL MODO, DECIDIDO UNA VEZ Y ANTES QUE LOS HANDLERS ────────────────────
  //
  // Se calcula acá arriba, y no junto al resto de los permisos, porque `cargar()`
  // lo necesita: es lo que decide si una recarga preserva la edición del editor
  // por lotes o parte de cero. Dejarlo abajo obligaría a que `cargar` lo leyera
  // de una variable declarada después, o a repetir la condición — y una condición
  // repetida es una que un día va a decir dos cosas distintas.
  //
  // Es derivación pura de `item` y del local activo: no necesita al usuario
  // cargado, así que puede vivir antes del `if (!me) return`.
  const localIdActivo = contexto?.localId || me?.localId || null;
  const puedeRecibir =
    !!item &&
    !!localIdActivo &&
    (item.estado === "Enviada" || item.estado === "Recibiendo") &&
    item.destino?.id === localIdActivo;

  const modo = modoDeRecepcion({ puedeRecibir });

  // ── Y ACÁ SE CORTA LA ÚLTIMA VÍA POR LA QUE EL LEGACY PODRÍA GOBERNAR ─────
  //
  // `siguienteEdicion` ya garantiza que en control físico `dirty` nace en false.
  // Esto lo vuelve a decir del lado de la LECTURA, así que ni siquiera un
  // `setDirty(true)` escrito mañana en otro handler podría bloquear el puesto de
  // trabajo. Es una sola expresión y está al lado de su motivo, no un
  // `setDirty(false)` suelto después de cada fetch.
  const dirtyEfectivo = modo === MODO_RECEPCION.EDITOR_LOTES && dirty;

  // ── EL "VOLVER" VIVE EN EL SHELL, NO ADENTRO DEL CONTENIDO ───────────────
  //
  // En el teléfono había DOS encabezados: la fila del shell diciendo
  // "Transferencias", y abajo otra franja con "← Volver a transferencias" y el
  // número. Dos barras para lo mismo, y la de abajo empujaba el trabajo real
  // —el buscador— más lejos todavía.
  //
  // El mecanismo genérico ya existe y lo estrenó Cobros: la pantalla registra su
  // acción y `LayoutBase` la dibuja a la derecha de su propio título. Acá no se
  // agrega nada al shell ni se compara ninguna ruta.
  //
  // El slot del shell es `md:hidden`, así que de 768 px para arriba no dibuja
  // nada y el escritorio conserva su franja con el botón de siempre. Por eso el
  // registro es incondicional y lo que se esconde es la franja, no la acción.
  //
  // El hook va acá arriba, con los demás: `if (!me) return` está más abajo y un
  // hook detrás de un retorno temprano cambia la cantidad de hooks entre
  // renders. Es el defecto que ya rompió esta pantalla una vez.
  useAccionDePagina(() => <SunmiBackButton href={LISTADO} />, []);

  /**
   * Imprimir el ticket en la impresora del POS.
   *
   * Vivía SOLO adentro de `AccionesRecepcion`. La composición móvil lo ofrece
   * desde "Más acciones", así que sube a la página —que es de donde cuelgan las
   * dos— en vez de escribirse una segunda vez allá abajo. `AccionesRecepcion`
   * conserva el suyo y no se toca: cambiarlo movería el escritorio.
   *
   * El import es dinámico por lo mismo que allá: el módulo de impresión no tiene
   * por qué viajar en el bundle de una pantalla que casi siempre solo se lee.
   */
  const imprimirTicket = async () => {
    const { default: imprimir } = await import(
      "@/lib/transferencias/imprimirTicketTransferencia"
    );
    imprimir(item, me);
  };

  // ===============================
  // Usuario
  // ===============================
  const cargarUsuario = async () => {
    const res = await fetch("/api/me");
    const json = await res.json();
    if (json.ok) setMe(json.user);
  };

  // ===============================
  // Cargar transferencia
  // ===============================
  /**
   * ── LOS DOS MODOS DE RECARGAR, Y CUÁNDO VA CADA UNO ─────────────────────
   *
   * Por defecto `cargar()` REEMPLAZA todo y deja `dirty` en false. Es lo que
   * corresponde después de la carga inicial, de Guardar y de Confirmar: en esos
   * tres momentos lo que hay en el servidor ES lo último que quiso el operador,
   * así que no hay nada pendiente que conservar.
   *
   * `cargar({ preservarEdicion: true })` es solo para las recargas que provoca
   * AGREGAR o QUITAR una línea. Ahí el operador no guardó nada: pidió otra cosa,
   * y pisarle lo escrito sería cobrarle esa otra cosa con su trabajo.
   *
   * QUÉ SIGNIFICA ESE PEDIDO LO DECIDE `siguienteEdicion`, NO ESTE ARCHIVO. En
   * control físico no hay edición pendiente que preservar —cada producto se
   * persiste al marcarlo revisado— así que el pedido no hace nada y `dirty` no
   * puede quedar encendido. Ver el bloque del dirty fantasma en `recepcionUI`.
   */
  const cargar = async ({ preservarEdicion = false } = {}) => {
    try {
      setLoading(true);
      setError("");

      const url = new URL(
        "/api/transferencias/detalle",
        window.location.origin
      );
      url.searchParams.set("id", String(id));

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error || "Error al cargar");
        setItem(null);
        return;
      }

      setItem(json.item);

      // Reemplazar, reconciliar y decidir el `dirty` es UNA decisión y vive en
      // `recepcionUI`. Acá no se elige nada: se pasa el modo y lo que se pidió.
      const frescos = json.item.items;
      const siguiente = siguienteEdicion({
        modo,
        preservar: preservarEdicion,
        items: frescos,
        previos: editItemsRef.current,
      });

      aplicarEditItems(siguiente.editItems);
      setDirty(siguiente.dirty);

    } catch (e) {
      console.error("Error cargando transferencia:", e);
      setError("Error al cargar transferencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarUsuario(); }, []);
  useEffect(() => { if (id) cargar(); }, [id]);

  // "Volver a transferencias": navegación al listado, que reconstruye el reporte
  // solo. El contexto —reporte generado, fechas, estado, tab, orden, página y
  // scroll— lo dejó guardado el listado en sessionStorage al abrir el detalle;
  // acá no hace falta reenviarlo. Por eso NO se usa un href fijo suelto: se
  // navega con el router para que el listado se monte y lo hidrate.
  const volver = () => {
    router.push(LISTADO);
  };

  if (!me) return <div className="p-4 sunmi-text-muted">Cargando usuario...</div>;

  // ===============================
  // Guard de acceso a pantalla
  // ===============================
  const permisos = me?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  // Permisos de recepción: `puedeRecibir` se calcula arriba, junto al modo,
  // porque `cargar()` lo necesita. Acá solo se le pone el nombre que usa el JSX.
  const inputsHabilitados = puedeRecibir;

  // ── QUIÉN VE EL BOTÓN DE CANCELAR ──────────────────────────────────────────
  //
  // Estado "Enviada" + permiso, y además PARTICIPAR de la transferencia: ser el
  // origen o el destino. Ese último pedazo faltaba y creaba una contradicción —
  // la pantalla ofrecía el botón a cualquiera con el permiso y el backend
  // rechazaba con un 403 al que no fuera el origen.
  //
  // Ahora el backend acepta a las dos puntas (el destino es quien descubre que
  // el remito no le corresponde) y la pantalla pregunta lo mismo, así que botón
  // visible y backend dicen una sola cosa.
  const localActual = Number(contexto?.localId || me?.localId || 0);
  const participa =
    esAdmin ||
    (localActual > 0 &&
      (Number(item?.origen?.id) === localActual || Number(item?.destino?.id) === localActual));
  const puedeCancelar =
    item?.estado === "Enviada" &&
    participa &&
    (esAdmin || permisos.includes("transferencias.cancelar"));

  // ===============================
  // Guardar cambios
  // ===============================
  const guardarCambios = async () => {
    try {
      setGuardando(true);

      // ── LA MISMA REGLA QUE EL SERVIDOR, NO UNA PARECIDA ──────────────────
      //
      // Esto miraba solo `recibido !== enviado`, y con eso le pedía motivo a una
      // línea AGREGADA en recepción —que por definición tiene 0 enviado y algo
      // recibido—. El servidor dejó de exigirlo el 2026-09-08 porque su
      // procedencia ya está registrada con autor y fecha; si la pantalla siguiera
      // pidiéndolo, habría dos reglas contradictorias y la que frena sería la de
      // acá, sobre una línea que el propio sistema creó bien.
      //
      // `exigeMotivo` es la función que usa `validarDetalleRecepcion`. Una sola.
      for (const it of editItems) {
        const enviado = num(it.enviado);
        const recibido = num(it.recibido);

        const pideMotivo = exigeMotivo({
          hayDiferencia: recibido !== enviado,
          // Estructural y del servidor: la reconciliación nunca conserva una
          // versión vieja de este flag.
          agregadoEnRecepcion: it.agregadoEnRecepcion,
        });

        if (pideMotivo) {
          if (!it.motivoPrincipal) {
            alert("Falta motivo.");
            setGuardando(false);
            return;
          }

          if (
            it.motivoPrincipal === "Otro" &&
            (!it.motivoDetalle || it.motivoDetalle.trim() === "")
          ) {
            alert("Debés detallar motivo (Otro).");
            setGuardando(false);
            return;
          }
        }
      }

      const res = await fetch("/api/transferencias/guardar-recepcion", {
        method: "POST",
        body: JSON.stringify({
          transferenciaId: item.id,
          items: editItems,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      // `cargar()` sin preservar ya deja `dirty` en false: lo decide
      // `siguienteEdicion`, que es el único lugar donde se decide. Acá había
      // además un `setDirty(false)` suelto, redundante y engañoso — hacía
      // parecer que el estado se apaga a mano después de cada fetch, que es
      // exactamente la forma de "arreglo" que deja la causa intacta.
      await cargar();

    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // ===============================
  // Agregar y quitar una línea de recepción
  //
  // ── EL SERVIDOR ES EL AUTORITATIVO, Y POR ESO SE RECARGA ──────────────────
  //
  // Después de agregar o de quitar NO se toca `editItems` a mano: se vuelve a
  // pedir `/api/transferencias/detalle` y se reconstruye todo desde la respuesta
  // real, con el mismo `cargar()` de siempre.
  //
  // Inventar la línea en el estado local y confiar en que coincida con lo que
  // quedó guardado es exactamente la clase de suposición que después aparece
  // como una diferencia que nadie sabe explicar: el servidor le pone el id, la
  // marca de agregada, el autor, la fecha y el costo, y cualquiera de esos cinco
  // puede salir distinto de lo que la pantalla imaginó.
  //
  // Y `cargar()` deja `dirty` en false, que también es correcto: lo que había sin
  // guardar se pierde al recargar, y el aviso de la card lo dice antes.
  // ===============================
  const agregarLinea = async (cuerpo) => {
    const res = await fetch("/api/transferencias/linea-recepcion", {
      method: "POST",
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json();
    // `yaExistia` NO recarga ni cierra: el modal muestra el mensaje y el
    // operador corrige la cantidad en la línea que ya está.
    //
    // Y la recarga PRESERVA la edición pendiente. El caso que esto arregla es el
    // más común de todos: alguien escribió 15 sobre 10, no guardó, y agrega el
    // producto que apareció al abrir los bultos. Sin preservar, el 15 volvía a 10
    // y el operador perdía su trabajo por haber usado otra función de la misma
    // pantalla.
    if (json?.ok && !json.yaExistia) await cargar({ preservarEdicion: true });
    return json;
  };

  /**
   * CERRAR EL CONTROL FÍSICO DE UN PRODUCTO.
   *
   * Se persiste al toque, de a un producto: con 150, esperar a tener todos
   * revisados para guardar el checklist es perder el trabajo de una tarde si se
   * cierra el navegador.
   *
   * ── Y SE RECARGA FRESCO, QUE ES LO CONTRARIO DE LO QUE HACÍA ─────────────
   *
   * Pedía `preservarEdicion: true` "por lo mismo que agregar y quitar". No era lo
   * mismo: esta acción SOLO existe en el control físico, donde no hay edición
   * pendiente que preservar porque lo que el operador escribe se acaba de
   * persistir. Preservar ahí resucitaba la propuesta vieja de `filaDeServidor` y
   * la comparaba contra lo recién guardado — el dirty fantasma.
   *
   * `siguienteEdicion` ya lo haría imposible aunque acá dijera lo contrario. Se
   * escribe igual como carga fresca porque es lo que esta acción significa, y un
   * pedido que el sistema tiene que anular es un pedido mal escrito.
   */
  const revisarProducto = async (cuerpo) => {
    try {
      setRevisando(true);
      const res = await fetch("/api/transferencias/revisar-producto", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id, ...cuerpo }),
      });
      const json = await res.json();
      if (json?.ok) await cargar();
      return json;
    } catch (err) {
      return { ok: false, error: err?.message || "No se pudo guardar la revisión." };
    } finally {
      setRevisando(false);
    }
  };

  /**
   * ADOPTAR, PARA ESTA RECEPCIÓN, LA PRESENTACIÓN QUE EL DEPÓSITO USA HOY.
   *
   * Solo manda ids. La presentación, el factor y el peso los resuelve el
   * servidor releyendo el catálogo del producto: si la pantalla los mandara,
   * un cliente viejo podría decir "x6" sobre un producto que hoy es x8 y la
   * recepción entera quedaría contada en la escala equivocada.
   *
   * Y se recarga FRESCO, sin preservar edición: lo que cambia es la escala en la
   * que se cuenta esta línea, así que una cantidad escrita en la escala anterior
   * dejó de significar lo que significaba. Preservarla sería arrastrar un número
   * de "40 unidades" a un campo que ahora dice cajones.
   */
  const adoptarPresentacion = async ({ detalleId }) => {
    try {
      setRevisando(true);
      const res = await fetch("/api/transferencias/adoptar-presentacion", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id, detalleId }),
      });
      const json = await res.json();
      if (json?.ok) await cargar();
      return json;
    } catch (err) {
      return { ok: false, error: err?.message || "No se pudo adoptar la presentación actual." };
    } finally {
      setRevisando(false);
    }
  };

  const quitarLinea = async (detalleId) => {
    try {
      setQuitandoId(detalleId);
      const res = await fetch("/api/transferencias/linea-recepcion", {
        method: "DELETE",
        body: JSON.stringify(cuerpoQuitarLinea({ transferenciaId: item.id, detalleId })),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      // Mismo motivo que al agregar. La línea borrada desaparece sola —no viene
      // en la respuesta— y las ediciones pendientes de las OTRAS sobreviven.
      await cargar({ preservarEdicion: true });
    } catch (err) {
      alert("No se pudo quitar la línea: " + err.message);
    } finally {
      setQuitandoId(null);
    }
  };

  // ===============================
  // Confirmar recepción
  // ===============================
  const confirmarRecepcion = async () => {

    // BLOQUEAR si hay cambios sin guardar EN EL EDITOR POR LOTES.
    //
    // Se lee `dirtyEfectivo` y no `dirty` a propósito: en el puesto de control
    // físico no hay editor por lotes montado ni botón de guardar, así que este
    // aviso mandaría al operador a apretar algo que no existe. Ver el bloque del
    // dirty fantasma en `recepcionUI`.
    if (dirtyEfectivo) {
      alert("Tenés cambios sin guardar. Guardalos antes de confirmar.");
      return;
    }

    try {
      setConfirmando(true);

      const res = await fetch("/api/transferencias/confirmar-recepcion", {
        method: "POST",
        body: JSON.stringify({ transferenciaId: item.id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      await cargar();

    } catch (err) {
      alert("Error confirmando: " + err.message);
    } finally {
      setConfirmando(false);
    }
  };

  // ===============================
  // ===============================
  // Totales
  //
  // Se cuentan LÍNEAS, no cantidades. Sumar las cantidades de todas las líneas
  // daría un número sin significado físico: un remito puede tener una línea en
  // BULTO, otra en unidades y otra en kg, y "58" no sería ni bultos ni unidades
  // ni kilos. Las cantidades siguen estando, por línea, en la tabla.
  // El importe sí es homogéneo —pesos— y se muestra tal cual.
  // ===============================
  const lineas = item?.items || [];
  const lineasRecibidas = lineas.filter((d) => d.cantidadRecibida != null).length;
  // ── LA DIFERENCIA SE CUENTA EN FÍSICO ──────────────────────────────────
  //
  // Comparaba `cantidadRecibida !== cantidadEnviada`, o sea las cantidades en la
  // PRESENTACIÓN. Desde que existe el pack incompleto eso miente en los dos
  // sentidos: "6 packs + 1 suelta" contra 6 enviados daba 6 !== 6 = false, o sea
  // "sin diferencia", con 37 unidades contra 36; y "5 packs + 6 sueltas" daba
  // diferencia con 36 contra 36.
  //
  // Se usa `estadoDeProducto`, el mismo que alimenta las cards del puesto de
  // trabajo, así que el tile de acá y el resumen de allá no pueden discrepar.
  const lineasConDiferencia = lineas.filter((d) => {
    const e = estadoDeProducto({ ...d, revisadoEnRecepcion: true });
    return d.cantidadRecibida != null &&
      (e === ESTADO_PRODUCTO.FALTANTE || e === ESTADO_PRODUCTO.SOBRANTE);
  }).length;
  const lineasDevueltas = lineas.filter((d) => d.devolucionOrigen != null && num(d.devolucionOrigen) > 0).length;
  // EL VALOR DEL REMITO, no el de lo recibido.
  //
  // Leía `resumen.costoTotal`, que valoriza lo que FÍSICAMENTE LLEGÓ y por lo
  // tanto se movía mientras alguien contaba: el mismo tile decía un número antes
  // de revisar y otro después, bajo el mismo rótulo. Un importe que cambia
  // durante el control no sirve para controlar.
  //
  // `importeEnviado` es lo que salió del depósito y quedó valorizado al enviar.
  // Los dos siguen viniendo en la respuesta: son dos preguntas distintas y
  // tienen dos nombres.
  const importeTotal = item ? num(item.resumen?.importeEnviado) : 0;

  const titulo = item ? `Transferencia #${item.id}` : "Ver transferencia";
  const fechaCabecera = item ? (item.fechaEnvio ?? item.fechaCreada) : null;

  // ===============================
  // Render
  // ===============================
  return (
    // Mismo contenedor que "Ver venta": ancho útil completo, sin `max-w` y sin
    // centrado. Antes era `p-2 sm:p-4 max-w-6xl mx-auto`, que recortaba la
    // página a ~1120 px y dejaba el resto vacío.
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
      <div className="w-full space-y-3">
        {/* Franja de encabezado: Volver + título + badges a la izquierda, fecha
            a la derecha. Una sola fila en desktop, con wrap en pantallas chicas. */}
        {/* La franja del encabezado es de ESCRITORIO. En el teléfono el shell
            ya dibuja "Transferencias" con el Volver a la derecha —ver
            `useAccionDePagina` arriba—, y repetirla acá era el segundo
            encabezado que la V2 viene a sacar. El corte es `md`, el mismo
            que usa `LayoutBase` para su fila: o manda uno o manda el otro. */}
        <div className="hidden md:flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <SunmiButton color="slate" onClick={volver} className="text-sm shrink-0">
              ← Volver a transferencias
            </SunmiButton>
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
              {titulo}
            </h1>
            {item && <EstadoTransferenciaBadge estado={item.estado} />}
            {item && (
              <DiferenciasBadge estado={item.estado} tieneDiferencias={item.tieneDiferencias} />
            )}
            {loading && item && (
              <span className="text-[11px] sunmi-text-muted">Actualizando…</span>
            )}
          </div>
          {item && (
            <div className="text-right shrink-0">
              <div className="text-[11px] sunmi-text-muted leading-tight">Fecha y hora</div>
              <div className="text-sm font-medium tabular-nums leading-tight">
                {fmtFechaHoraAR(fechaCabecera)}
              </div>
            </div>
          )}
        </div>

        {/* Primera carga */}
        {loading && !item && (
          <div className="text-center py-10">
            <SunmiLoader />
          </div>
        )}

        {/* Errores de carga (solo cuando no hay datos que mostrar) */}
        {!item && error && (
          <div className="space-y-3">
            <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm">
              {error}
            </div>
            <div className="flex gap-2">
              <SunmiButton color="amber" onClick={cargar} className="text-sm">
                Reintentar
              </SunmiButton>
              <SunmiButton color="slate" onClick={volver} className="text-sm">
                ← Volver a transferencias
              </SunmiButton>
            </div>
          </div>
        )}

        {item && (
          <>
            {/* Acciones ARRIBA, en su propia card — mismo lugar y misma
                composición que AccionesTicket en "Ver venta". */}
            {/* ── LAS ACCIONES, SOLO EN ESCRITORIO ────────────────────────
                En el teléfono esta card no va arriba del flujo físico: PDF,
                ticket y cancelación se llegan por "⋯", y confirmar es el CTA
                del pie. Las funciones son LAS MISMAS —se le pasan también a
                `WorkspaceRecepcion`—, no hay una segunda versión. */}
            <div className="hidden md:block">
            <AccionesRecepcion
              id={id}
              item={item}
              me={me}
              puedeRecibir={puedeRecibir}
              guardando={guardando}
              // ── SIN GUARDADO POR LOTES CUANDO SE ESTÁ RECIBIENDO ────────
              //
              // El puesto de trabajo persiste cada producto al marcarlo
              // revisado, de a uno. Ofrecer además un "Guardar cambios" sería
              // peligroso: la ficha PROPONE lo enviado para el caso feliz de un
              // toque, así que un guardado masivo escribiría esos 150 valores
              // propuestos como cantidades reales de productos que nadie contó.
              //
              // La ruta `guardar-recepcion` sigue existiendo y sigue siendo el
              // borrador por lotes —no marca revisado—; lo que deja de existir
              // es el botón que la dispararía con defaults visuales.
              guardarCambios={puedeRecibir ? null : guardarCambios}
              confirmando={confirmando}
              confirmarRecepcion={confirmarRecepcion}
              dirty={dirtyEfectivo}
              puedeCancelar={puedeCancelar}
              panelCancelarAbierto={panelCancelar}
              abrirPanelCancelar={() => setPanelCancelar((v) => !v)}
              panelCancelar={
                panelCancelar ? (
                  <PanelCancelarTransferencia
                    id={id}
                    onCerrar={() => setPanelCancelar(false)}
                    onCancelada={async () => {
                      setPanelCancelar(false);
                      await cargar();
                    }}
                  />
                ) : null
              }
            />
            </div>

            {/* ── 1 · INFORMACIÓN GENERAL, SOLO EN ESCRITORIO ─────────────
                No se borra: en el teléfono se llega por "⋯" → "Información
                general", y lo que se abre es ESTE MISMO componente. Lo que
                deja de pasar es que ocupe media pantalla durante el conteo. */}
            <div className="hidden md:block">
              <TransferenciaHeader item={item} />
            </div>

            {/* ── 2 · PRODUCTOS: DOS PANTALLAS, Y LA QUE SE VE DEPENDE DE SI
                   ESTA PERSONA ESTÁ RECIBIENDO ─────────────────────────────

                Quien RECIBE ve el puesto de trabajo: buscador, escáner, cards
                que filtran y una ficha por producto. Con 150 productos, recorrer
                la lista en el orden del remito no es una forma de trabajar.

                Todos los demás —el origen, un admin mirando, una transferencia
                Recibida o Cancelada— siguen viendo el detalle de siempre. Esa
                pantalla es el registro histórico del documento y no se convierte
                en un editor: se lee, se imprime y se compara. Cambiarla por el
                workspace le sacaría a la mitad de los usuarios la vista que
                usan. */}
            {puedeRecibir ? (
              <WorkspaceRecepcion
                item={item}
                puedeRecibir={puedeRecibir}
                onRevisar={revisarProducto}
                onAgregar={agregarLinea}
                onAdoptarPresentacion={adoptarPresentacion}
                onQuitarLinea={quitarLinea}
                guardando={revisando}
                quitandoId={quitandoId}
                // Lo administrativo, para que la composición móvil pueda
                // acomodarlo. Son las MISMAS funciones que recibe
                // `AccionesRecepcion`: una sola definición de cada acción.
                confirmarRecepcion={confirmarRecepcion}
                confirmando={confirmando}
                puedeCancelar={puedeCancelar}
                abrirPanelCancelar={() => setPanelCancelar((v) => !v)}
                panelCancelar={
                  panelCancelar ? (
                    <PanelCancelarTransferencia
                      id={id}
                      onCerrar={() => setPanelCancelar(false)}
                      onCancelada={async () => {
                        setPanelCancelar(false);
                        await cargar();
                      }}
                    />
                  ) : null
                }
                imprimirTicket={imprimirTicket}
              />
            ) : (
              <TablaDetalleTransferencia
                item={item}
                editItems={editItems}
                setEditItems={setEditItemsDirty}
                inputsHabilitados={inputsHabilitados}
              />
            )}

            {/* ── 3 · TOTALES, SOLO EN ESCRITORIO ─────────────────────────
                Métricas por LÍNEA (ver el comentario de arriba). En el
                teléfono el avance vive en el bloque compacto —"0 / 15
                revisados"— y las cinco cifras aparecen recién al llegar a
                15/15, que es cuando dejan de ser ruido. */}
            <section className="hidden md:block space-y-2">
              <SectionHead title="Totales" />
              <SunmiCard>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
                  <TotalTile label="Líneas" value={fmtCantidad(lineas.length)} />
                  <TotalTile
                    label="Líneas recibidas"
                    value={lineasRecibidas === 0 ? "—" : fmtCantidad(lineasRecibidas)}
                    tone={lineasRecibidas === 0 ? "muted" : "neutral"}
                  />
                  <TotalTile
                    label="Líneas con diferencia"
                    value={lineasRecibidas === 0 ? "—" : fmtCantidad(lineasConDiferencia)}
                    tone={lineasConDiferencia > 0 ? "accent" : "muted"}
                  />
                  <TotalTile
                    label="Líneas devueltas al origen"
                    value={lineasDevueltas === 0 ? "—" : fmtCantidad(lineasDevueltas)}
                    tone={lineasDevueltas > 0 ? "accent" : "muted"}
                  />
                  <TotalTile
                    label="Importe total"
                    value={fmtMoneda(importeTotal)}
                    tone="success"
                    highlight
                  />
                </div>
              </SunmiCard>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
