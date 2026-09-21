"use client";

import { useState, useEffect, useMemo, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import PanelComprobantes from "@/components/comprobantes/PanelComprobantes";
import ListaConciliacion from "@/components/comprobantes/ListaConciliacion";
import ListaDeLaFactura from "@/components/compras-proveedor/ListaDeLaFactura";
import CorregirComprobante from "@/components/compras-proveedor/CorregirComprobante";
import HojaCorregirLinea from "@/components/compras-proveedor/HojaCorregirLinea";
import HojaCerrarRecepcion from "@/components/compras-proveedor/HojaCerrarRecepcion";
import PedidoRecibido from "@/components/compras-proveedor/PedidoRecibido";
import {
  cantidadEnEscalaDelPedido,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  DECISION_DE_PRECIO,
  decisionVigente,
} from "@/lib/compras-proveedor/decisionDePrecio";
import { hayQuePedirLaConciliacion } from "@/lib/compras-proveedor/papelDelPedido";
import TarjetaContextoDelPedido from "@/components/compras-proveedor/TarjetaContextoDelPedido";
import BloqueDeLaFactura from "@/components/compras-proveedor/BloqueDeLaFactura";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import useContextoActivo from "@/hooks/useContextoActivo";
// Esta pantalla ya no importa `avisoCostoLinea`: el contador que lo usaba
// comparaba lo pedido contra el catálogo, que es la pregunta de cuando se arma el
// pedido y no la de cuando llega. El módulo sigue igual y lo usa `/nueva`.
import SinPermisos from "@/components/auth/SinPermisos";
import useAccionesEnvioPedido from "@/hooks/useAccionesEnvioPedido";
// Sólo `subtotalLinea`: `permiteToggleUnidad` y `unidadDisplay` los usaba el
// editor de borrador que se borró. Los dos siguen vivos en el módulo y los usan
// `/nueva` y `CarritoPedido`, así que no se tocaron ahí.
import { subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";
import {
  CLAVE_RECEPCION_EN_CURSO,
  serializarRecepcionEnCurso,
  deserializarRecepcionEnCurso,
} from "@/lib/compras-proveedor/retornoPedido";

const ESTADO_BADGE = {
  BORRADOR: "sunmi-badge-muted",
  CONFIRMADO: "sunmi-badge-accent",
  ENVIADO: "sunmi-badge-link",
  RECIBIDO: "sunmi-badge-success",
  ANULADO: "sunmi-badge-danger",
};

function formatFecha(f) {
  // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`. El año
  // pasa de dos dígitos a cuatro, que es el formato del resto del sistema.
  return fechaHoraAR(f, { vacio: "-" });
}

export default function DetallePedidoProveedorPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const { perfil } = useUser();
  // Ya no se saca `contexto`: su único uso era el link a editar producto, que se
  // fue con la tabla que nunca se dibujaba. Los otros dos SÍ siguen haciendo
  // falta, para el corte de "elegí una ubicación" de más abajo.
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // ── "LLEGÓ SIN FACTURA": LA SALIDA SECUNDARIA DEL ESTADO 1 ──────────────
  //
  // Mientras no hay ningún comprobante, la pantalla ofrece sacarle una foto a
  // la factura. Si no hay factura, esto destapa el conteo a mano, que es lo que
  // esta pantalla ya sabía hacer. No es un modo nuevo: es dejar ver lo que ya
  // estaba, cuando corresponde.
  const [sinFactura, setSinFactura] = useState(false);
  // Cuántos comprobantes tiene el pedido. Lo avisa `PanelComprobantes`, que es
  // el que los carga: la pantalla no pide la misma lista por su cuenta.
  const [hayComprobantes, setHayComprobantes] = useState(0);
  // ── LOS QUE NO CERRARON, PARA PODER ARREGLARLOS ANTES DE CONCILIAR ────
  //
  // Un comprobante MAL_LEIDO no propone ningún costo, así que la conciliación
  // de abajo queda trabada hasta que cierre. La lista la avisa
  // `PanelComprobantes`, que ya la tiene cargada.
  const [malLeidos, setMalLeidos] = useState([]);

  // ── LA FACTURA LEÍDA, CON SUS LÍNEAS EN EL ORDEN DEL PAPEL ─────────────
  //
  // Sale del endpoint de conciliación, que es el que ya cruza cada línea contra
  // la del pedido, decide el vínculo y analiza el precio. La pantalla no
  // recalcula nada: pide y muestra.
  const [conciliacion, setConciliacion] = useState(null);
  // Se pidió la conciliación y no se pudo. Es un estado propio y no la ausencia
  // de datos: sin él, "no se pudo saber" y "no hay papel" son el mismo null.
  const [falloLaConciliacion, setFalloLaConciliacion] = useState(false);
  // ── ESTE PEDIDO NACIÓ DE UNA FACTURA ───────────────────────────────────
  //
  // Nadie pidió nada: llegó mercadería y el pedido se armó con lo que el papel
  // dice. Tres cosas de la pantalla cambian por eso, y están decididas: no se
  // muestra "Pediste", no existe el bloque de lo que el papel no trajo, y la
  // hoja de cierre no pregunta por él.
  //
  // Es una columna del pedido y no algo que se deduzca acá: "no tiene líneas
  // pedidas" también es cierto en un pedido normal recién creado.
  const sinPedidoPrevio = pedido?.nacidoDeFactura === true;
  // ── VA ACÁ ARRIBA, Y NO AL LADO DE LO QUE LA USA ───────────────────────
  //
  // Se incrementa cuando algo cambió del lado del servidor —vincular, aceptar
  // un precio— y hay que volver a pedir la conciliación.
  //
  // Estaba declarada 19 líneas DESPUÉS del `useEffect` que la nombra en su
  // arreglo de dependencias. Un `const` no existe antes de su declaración: el
  // arreglo se evalúa en cada render y tiraba `Cannot access ... before
  // initialization`, o sea que la pantalla reventaba al abrirse. El build
  // compila igual —es un error de ejecución, no de sintaxis— y ningún candado
  // lo ve, porque ninguno monta esta pantalla.
  const [recargarConciliacion, setRecargarConciliacion] = useState(0);
  const [lineaACorregir, setLineaACorregir] = useState(null);
  // La hoja que se abre antes de cerrar: pregunta por las líneas que ningún
  // comprobante trajo y dice qué queda a medias.
  const [cerrandoRecepcion, setCerrandoRecepcion] = useState(false);

  // El primer comprobante con líneas leídas. Con varios, se muestra el primero:
  // el caso de dos facturas en un mismo pedido existe y se resuelve en la tanda
  // del cierre, no acá — mostrar dos listas encadenadas sin decir cuál es cuál
  // sería peor que mostrar una.
  // ── LA FORMA SALE DEL ENDPOINT, NO DE LA MEMORIA ───────────────────────
  //
  // Acá se leía `g.lineas` y el comprobante como si el grupo fuera plano. El
  // endpoint devuelve otra cosa: `{ tipo, comprobante: {...}, filas: [...] }`.
  // O sea que la lista NUNCA se dibujaba, ni con un comprobante perfecto —y el
  // síntoma se leía como "SIN_TOTAL no deja conciliar", que era una causa
  // equivocada para un defecto real. Medido sobre el pedido 232: el endpoint ya
  // devolvía sus 15 filas.
  const grupoActivo = useMemo(
    () => (conciliacion?.grupos || []).find((g) => (g.filas || []).length > 0) || null,
    [conciliacion]
  );
  const comprobanteActivo = grupoActivo?.comprobante || null;
  const filasDeFactura = useMemo(() => grupoActivo?.filas || [], [grupoActivo]);

  // ── RECIBIENDO, EL TÍTULO Y EL VOLVER LOS PONE EL SHELL ────────────────
  //
  // La pantalla decía "Compras" arriba y abajo "PEDIDO #237" en una cinta
  // naranja del tamaño de un botón que no es un botón. Dos encabezados, y el
  // segundo gritando. Ahora el shell dice "Recibir pedido" y lleva el Volver a
  // su derecha, que es donde está en las otras 33 pantallas.
  //
  // Solo en ENVIADO: los otros estados de esta ruta son de consulta y siguen
  // con su encabezado propio, que esta tanda no toca.
  const enRecepcion = pedido?.estado === "ENVIADO";
  useTituloDePagina(enRecepcion ? "Recibir pedido" : null);
  // ── Y UN PEDIDO CERRADO TAMBIÉN LLEVA EL VOLVER EN EL SHELL ───────────
  //
  // Su pantalla ya no dibuja el encabezado viejo —el que traía su propio
  // Volver— así que sin esto quedaba sin salida. Va al listado de compras y no
  // a la bandeja de recepción: de un pedido ya recibido no se vuelve a recibir.
  const yaRecibido = pedido?.estado === "RECIBIDO";
  useAccionDePagina(
    () =>
      enRecepcion ? (
        <SunmiBackButton href="/modulos/compras-proveedor/recepcion" />
      ) : yaRecibido ? (
        <SunmiBackButton href="/modulos/compras-proveedor" />
      ) : null,
    [enRecepcion, yaRecibido]
  );

  // Para recepción: cantidades recibidas editables
  const [recibidos, setRecibidos] = useState({});
  const [kgRecibidos, setKgRecibidos] = useState({});

  // ── LA RECEPCIÓN A MEDIO CARGAR SOBREVIVE A SALIR DE LA PANTALLA ────────
  //
  // Las cantidades contadas vivían SOLO en el estado de React y se escribían
  // recién al tocar "Recibir mercadería". Cargar cuarenta líneas y que se
  // recargue la página eran cuarenta líneas de vuelta a contar.
  //
  // Es el mismo defecto que tenía el pedido en armado y se arregla con el mismo
  // mecanismo: el serializador vive en `retornoPedido.js`, al lado del otro, y
  // acá hay un solo par guardar/limpiar que usan todos los caminos.
  const guardarRecepcion = useCallback((pid, rec, kg) => {
    try {
      const enCurso = serializarRecepcionEnCurso({ pedidoId: pid, recibidos: rec, kgRecibidos: kg });
      if (enCurso) sessionStorage.setItem(CLAVE_RECEPCION_EN_CURSO, JSON.stringify(enCurso));
      else sessionStorage.removeItem(CLAVE_RECEPCION_EN_CURSO);
    } catch {
      // Sin almacenamiento la carga no sobrevive, pero la pantalla sigue
      // andando: es preferible a romper la recepción.
    }
  }, []);

  const limpiarRecepcion = useCallback(() => {
    try {
      sessionStorage.removeItem(CLAVE_RECEPCION_EN_CURSO);
    } catch {}
  }, []);

  // ── SE LEE UNA SOLA VEZ, EN EL PRIMER RENDER, Y VIVE EN MEMORIA ─────────
  //
  // Es la carrera que apareció en la pantalla del pedido y que acá pasaría
  // igual: el efecto que guarda dispara con los mapas vacíos, escribe "nada" y
  // BORRA la clave, y lo hace antes de que `cargar()` termine de traer el
  // pedido, que es cuando recién se puede restaurar. Leyendo el
  // `sessionStorage` ahí, lo guardado ya no está.
  const recepcionAlAbrir = useRef(null);
  if (recepcionAlAbrir.current === null) {
    try {
      recepcionAlAbrir.current =
        typeof window === "undefined"
          ? false
          : deserializarRecepcionEnCurso(sessionStorage.getItem(CLAVE_RECEPCION_EN_CURSO)) || false;
    } catch {
      recepcionAlAbrir.current = false;
    }
  }

  // Costos editables por ítem (en recepción Y en borrador)
  const [costos, setCostos] = useState({});

  // Edición en BORRADOR: cantidad pedida y unidad por línea
  const [cantidadesEdit, setCantidadesEdit] = useState({});
  const [unidadesEdit, setUnidadesEdit] = useState({});

  // Buscar producto extra (recepción)
  const [extraSearch, setExtraSearch] = useState("");
  const [extraResults, setExtraResults] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraAdding, setExtraAdding] = useState(null);

  // Factura / ganancia (totalFactura es computed, no editable)
  const [totalReal, setTotalReal] = useState("");
  const [nroFactura, setNroFactura] = useState("");
  const [fechaFactura, setFechaFactura] = useState("");

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compras-proveedor/obtener?id=${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setPedido(data.item);
        // Inicializar recibidos con la cantidad pedida
        const rec = {};
        const kgRec = {};
        for (const d of data.item.detalles || []) {
          rec[d.id] = Number(d.cantidadRecibida ?? d.cantidad);
          // Para fiambres: inicializar kg
          const base = d.producto?.base;
          if (base?.modoCompraProveedor === "UNIDAD") {
            if (d.kgRecibidos != null) {
              kgRec[d.id] = Number(d.kgRecibidos);
            } else {
              const pesoRef = Number(base.pesoReferenciaKg || base.pesoPromedioKg || 1);
              kgRec[d.id] = Number(d.cantidad) * pesoRef;
            }
          }
        }
        // ── LO GUARDADO PISA A LOS VALORES POR DEFECTO ──────────────────
        //
        // Los defaults de arriba son "lo pedido", que es de dónde se arranca a
        // contar. Si hay una carga a medio hacer para ESTE pedido, manda ella:
        // es trabajo que alguien hizo y que no existe en ningún otro lado.
        //
        // Se compara el `pedidoId` guardado: abrir otro pedido no restaura
        // encima las cantidades del anterior.
        const guardadaEnCurso = recepcionAlAbrir.current || null;
        recepcionAlAbrir.current = false;
        if (guardadaEnCurso && Number(guardadaEnCurso.pedidoId) === Number(data.item.id)) {
          for (const [detId, valor] of Object.entries(guardadaEnCurso.recibidos || {})) {
            if (detId in rec) rec[detId] = valor;
          }
          for (const [detId, valor] of Object.entries(guardadaEnCurso.kgRecibidos || {})) {
            if (detId in kgRec) kgRec[detId] = valor;
          }
        }

        setRecibidos(rec);
        setKgRecibidos(kgRec);

        // Costos editables (recepción Y borrador)
        const costosInit = {};
        let totalEst = 0;
        for (const d of data.item.detalles || []) {
          const c = d.precioCosto != null ? Number(d.precioCosto) : 0;
          costosInit[d.id] = c > 0 ? c.toFixed(2) : "";
          totalEst += (Number(d.cantidad) || 0) * c;
        }
        setCostos(costosInit);

        // Edición en BORRADOR: cantidad pedida y unidad iniciales por línea
        const cantInit = {};
        const uniInit = {};
        for (const d of data.item.detalles || []) {
          cantInit[d.id] = String(Number(d.cantidad) || 1);
          uniInit[d.id] = d.unidad || "BULTO";
        }
        setCantidadesEdit(cantInit);
        setUnidadesEdit(uniInit);

        // Factura
        setTotalReal(data.item.totalReal != null ? String(Number(data.item.totalReal)) : "");
        setNroFactura(data.item.nroFactura || "");
        setFechaFactura(data.item.fechaFactura ? data.item.fechaFactura.slice(0, 10) : "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) cargar();
  }, [id]);

  // ── Y EN CADA CAMBIO: GUARDAR ───────────────────────────────────────────
  //
  // Solo con el pedido en ENVIADO, que es el único estado en el que se cuenta
  // mercadería. En los demás los campos no se editan y guardar dejaría una
  // clave que nadie va a restaurar.
  useEffect(() => {
    if (!pedido?.id || pedido.estado !== "ENVIADO") return;
    guardarRecepcion(pedido.id, recibidos, kgRecibidos);
  }, [pedido?.id, pedido?.estado, recibidos, kgRecibidos, guardarRecepcion]);

  // ── TRAER LA FACTURA LEÍDA ──────────────────────────────────────────────
  //
  // Solo si hay algún comprobante: sin papel no hay nada que conciliar y
  // pedirlo sería un viaje por nada. Se vuelve a pedir cuando cambia la
  // cantidad de comprobantes —o sea después de subir o de leer—.
  //
  // ── Y TAMBIÉN CON EL PEDIDO YA RECIBIDO ────────────────────────────────
  //
  // Antes esto era solo ENVIADO, así que un pedido cerrado no tenía de dónde
  // sacar las filas y caía en la tabla densa de escritorio: columnas apretadas,
  // el nombre cortado, y las cantidades SIN CONVERTIR —"Factura 80" donde son 8
  // bultos—, que es justo lo que la recepción arregló. Es la misma información:
  // se lee con las mismas tarjetas.
  //
  // ── Y EN RECIBIDO NO SE PREGUNTA POR EL CONTADOR DEL PANEL ─────────────
  //
  // Acá decía `hayComprobantes === 0`. Ese contador lo llena `PanelComprobantes`
  // por su callback, y en RECIBIDO ese panel NO SE MONTA: la pantalla cerrada
  // devuelve otro árbol varias decenas de líneas más abajo. O sea que el
  // contador se quedaba en 0 para siempre, la conciliación no se pedía NUNCA, y
  // la pantalla concluía "este pedido se cerró sin ningún papel" sobre el 232,
  // que tiene un comprobante leído con 15 renglones.
  //
  // La condición vive en `hayQuePedirLaConciliacion` para que sea una sola y se
  // pueda ejercer: el candado la corre con un RECIBIDO y cero avisos, que es
  // exactamente el caso que fallaba.
  useEffect(() => {
    if (!pedido?.id || !hayQuePedirLaConciliacion({ estado: pedido.estado, hayComprobantes })) {
      setConciliacion(null);
      setFalloLaConciliacion(false);
      return;
    }
    let vigente = true;
    (async () => {
      try {
        const r = await fetch(`/api/compras-proveedor/conciliacion/${pedido.id}`, {
          credentials: "include",
          cache: "no-store",
        });
        const d = await r.json();
        if (!vigente) return;
        if (d?.ok) {
          setConciliacion(d);
          setFalloLaConciliacion(false);
        } else {
          // ── UN ERROR QUE LA PANTALLA NO PUEDE DESCARTAR ───────────────
          //
          // Tragarlo dejaba la conciliación en null, y null se leía igual que
          // "no hay papel". Preferimos decir que no se pudo saber antes que
          // afirmar algo falso sobre lo que entró.
          setFalloLaConciliacion(true);
        }
      } catch {
        if (vigente) setFalloLaConciliacion(true);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [pedido?.id, pedido?.estado, hayComprobantes, recargarConciliacion]);

  // ── LO QUE LA HOJA GUARDA ───────────────────────────────────────────────
  //
  // Cantidad, sueltas y motivo van al estado de la pantalla, que ya los
  // persiste en el navegador y los escribe todos juntos al recibir. No hay una
  // ruta por línea a propósito: recibir es una sola transacción que mueve
  // stock, y guardar cada línea aparte dejaría media recepción escrita si algo
  // fallara en el medio.
  const [sueltas, setSueltas] = useState({});
  const [motivos, setMotivos] = useState({});
  // ── QUÉ LÍNEAS CONTROLÓ LA PERSONA ──────────────────────────────────────
  //
  // No se deduce de que la cantidad coincida: eso es lo que el sistema calcula,
  // y darlo por controlado es poner el tilde verde sobre un renglón que nadie
  // miró. Se llena con el toque —"✓ Coincide"— o guardando la hoja.
  //
  // ── ESTO YA NO ES LA VERDAD: ES UN ECO OPTIMISTA ───────────────────────
  //
  // La marca vive en la base, en `ComprobanteLinea.revisadoEnRecepcion`, y
  // llega en cada fila. Este mapa solo adelanta lo que el servidor va a
  // contestar, para que el tilde no tarde un viaje de red en aparecer; si la
  // escritura falla, se saca de acá y la fila vuelve a mostrar lo que dice la
  // base. La clave es el RENGLÓN DEL PAPEL —`lineaId`— y no la línea del
  // pedido: dos renglones pueden apuntar a la misma línea del pedido y marcar
  // uno marcaba el otro.
  const [revisadas, setRevisadas] = useState({});

  // ── MARCAR ES ESCRIBIR, Y SE ESCRIBE APENAS OCURRE ─────────────────────
  //
  // La cantidad, las sueltas y el motivo se juntan y se escriben todos al
  // recibir, porque recibir es una sola transacción que mueve stock. La marca
  // no mueve stock: su riesgo es perderse, y por eso va sola y en el momento.
  const marcarRevisada = useCallback(async (lineaId, revisada = true) => {
    if (!lineaId) return { ok: false, error: "Falta la línea." };
    setRevisadas((prev) => ({ ...prev, [lineaId]: revisada }));
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/marcar-revisada", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaId, revisada }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        // El eco se retira: si no se guardó, el tilde no puede quedar puesto.
        setRevisadas((prev) => {
          const n = { ...prev };
          delete n[lineaId];
          return n;
        });
        return { ok: false, error: d?.queHacer || d?.error || "No se pudo guardar la marca." };
      }
      return { ok: true };
    } catch (e) {
      setRevisadas((prev) => {
        const n = { ...prev };
        delete n[lineaId];
        return n;
      });
      return { ok: false, error: e?.message || "No se pudo guardar la marca." };
    }
  }, []);

  // ── LAS DOS DECISIONES DE PRECIO VAN ACÁ ARRIBA ────────────────────────
  //
  // Antes de quien las usa, y no al lado de la hoja: "✓ Coincide" aplica la
  // decisión ya tomada, así que la nombra. Un `const` declarado después no
  // existe cuando el arreglo de dependencias se evalúa, y eso es exactamente lo
  // que tiró la pantalla en producción con `recargarConciliacion`.
  const aceptarPrecioDeLinea = useCallback(async (fila) => {
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/aceptar-precio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineaId: fila?.lineaId,
          unidad: fila?.unidad?.elegida,
          decision: DECISION_DE_PRECIO.ACEPTA_FACTURA,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) return { ok: false, error: d?.queHacer || d?.error || "No se pudo aceptar." };
      // Se vuelve a pedir la conciliación: el precio cambió y la comparación de
      // todas las filas de ese producto ya no es la misma.
      setRecargarConciliacion((n) => n + 1);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "No se pudo aceptar." };
    }
  }, []);

  // ── DEJAR EL PROPIO TAMBIÉN SE GUARDA ──────────────────────────────────
  //
  // Es la MISMA ruta con la otra respuesta, no una segunda: no escribe ningún
  // costo, solo registra que sobre estos dos precios ya se contestó. Sin esto,
  // "dejo el mío" era la única decisión que la próxima factura volvía a
  // preguntar, porque no dejaba rastro en ningún lado.
  const dejarMiPrecioDeLinea = useCallback(async (fila) => {
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/aceptar-precio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineaId: fila?.lineaId,
          unidad: fila?.unidad?.elegida,
          decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) return { ok: false, error: d?.queHacer || d?.error || "No se pudo guardar." };
      // La fila cambia de estado —deja de estar para revisar— así que se vuelve
      // a pedir la conciliación, igual que al aceptar.
      setRecargarConciliacion((n) => n + 1);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "No se pudo guardar." };
    }
  }, []);

  // El caso feliz en un toque: lo que la factura dice es lo que llegó. Mismo
  // gesto que "✓ Coincide" en la recepción de una transferencia.
  const aceptarLoQueDiceLaFactura = useCallback(async (fila) => {
    if (!fila?.pedidoDetalleId) return;
    // ── SI EL PRECIO YA ESTABA DECIDIDO, ESTE TOQUE LO APLICA ──────────
    //
    // La tarjeta dice "Ya decidido · $X" y ofrece el tilde, así que el precio
    // no entra solo: entra porque alguien decidió ese número una vez y lo está
    // confirmando ahora. Sin esto, una línea con decisión de aceptar quedaría
    // en verde y la mercadería entraría al costo viejo en silencio, que es peor
    // que preguntar de más.
    const decidida = decisionVigente(fila);
    if (precioCambio(fila) && decidida?.decision === DECISION_DE_PRECIO.ACEPTA_FACTURA) {
      const r = await aceptarPrecioDeLinea(fila);
      if (r && r.ok === false) return;
    }
    // EN LA ESCALA DEL PEDIDO. `fila.cantidad` es lo crudo del papel —80
    // unidades— y guardarlo como cantidad recibida metería diez veces lo que
    // llegó. Es el mismo número convertido que muestra la tarjeta.
    const enEscala = cantidadEnEscalaDelPedido(fila);
    setRecibidos((prev) => ({ ...prev, [fila.pedidoDetalleId]: Number(enEscala) || 0 }));
    await marcarRevisada(fila.lineaId, true);
  }, [aceptarPrecioDeLinea, marcarRevisada]);

  const guardarCorreccion = useCallback((datos) => {
    const id = datos?.pedidoDetalleId;
    if (!id) return;
    if (datos.cantidadRecibida != null) {
      setRecibidos((prev) => ({ ...prev, [id]: datos.cantidadRecibida }));
    }
    setSueltas((prev) => ({ ...prev, [id]: datos.unidadesSueltas }));
    setMotivos((prev) => ({
      ...prev,
      [id]: datos.motivoPrincipal
        ? { principal: datos.motivoPrincipal, detalle: datos.motivoDetalle }
        : undefined,
    }));
    // Guardar la hoja también es controlar el renglón: alguien lo miró, contó y
    // decidió. Es el otro camino por el que una línea queda revisada — y se
    // guarda por el mismo lugar, no por uno parecido.
    marcarRevisada(datos?.lineaId, true);
    setLineaACorregir(null);
  }, [marcarRevisada]);

  // Volver una línea a pendiente. El mismo gesto que "Desmarcar" en la ficha
  // de recepción de una transferencia: devuelve la línea y nada más. Borra
  // también quién y cuándo — si nadie la controló, un autor colgado diría
  // que sí.
  const desmarcarLinea = useCallback((fila) => {
    marcarRevisada(fila?.lineaId, false);
    setLineaACorregir(null);
  }, [marcarRevisada]);

  // ── VINCULAR: LA LÍNEA PASA A SABER QUÉ PRODUCTO ES ────────────────────
  //
  // La ruta resuelve sola a qué línea del pedido corresponde, así que después
  // de esto la línea queda con su `pedidoDetalleId` y recién ahí se le puede
  // aceptar el precio. Se vuelve a pedir la conciliación porque cambian el
  // vínculo, la comparación y el análisis de precio de esa fila.
  const vincularLinea = useCallback(async (fila, productoBaseId) => {
    try {
      const r = await fetch("/api/compras-proveedor/comprobantes/vincular", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineaId: fila?.lineaId,
          productoBaseId,
          codigoProveedor: fila?.codigoProveedor ?? null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!d?.ok) return { ok: false, error: d?.queHacer || d?.error || "No se pudo vincular." };
      setRecargarConciliacion((n) => n + 1);
      setLineaACorregir(null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "No se pudo vincular." };
    }
  }, []);

  // BORRADOR (PENDIENTE) se edita SOLO en /nueva. Si el pedido está en borrador,
  // redirigir al editor único en vez de mantener un editor duplicado acá.
  useEffect(() => {
    if (pedido?.estado === "BORRADOR") {
      router.replace(`/modulos/compras-proveedor/nueva?pedidoId=${pedido.id}`);
    }
  }, [pedido, router]);

  // `extra` lo manda la hoja de cierre con lo que entra por CADA línea, ya
  // resuelto: lo contado, lo que dice el papel, y la respuesta por línea de las
  // que ningún comprobante trajo. El servidor dejó de completar lo que falta,
  // así que este mapa es lo único que decide qué entra al stock.
  const ejecutarAccion = async (accion, extra = null) => {
    setActing(true);
    try {
      let url = "";
      let bodyData = {};

      if (accion === "confirmar") {
        url = `/api/compras-proveedor/confirmar/${id}`;
      } else if (accion === "enviar") {
        url = `/api/compras-proveedor/marcar-enviado/${id}`;
      } else if (accion === "anular") {
        url = `/api/compras-proveedor/anular/${id}`;
      } else if (accion === "recibir") {
        url = `/api/compras-proveedor/recibir/${id}`;
        bodyData = {
          recibidos: extra?.recibidos ?? recibidos,
          kgRecibidos,
          sueltas,
          motivos,
          costos,
          totalReal: totalReal || null,
          nroFactura: nroFactura || null,
          fechaFactura: fechaFactura || null,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (data.ok) {
        // ── LA CARGA A MEDIO HACER SE TIRA CUANDO YA NO SIRVE ─────────────
        //
        // Al recibir, porque las cantidades ya quedaron escritas en la base y
        // dejarlas en el navegador haría reaparecer una copia sin guardar sobre
        // un pedido que ya está RECIBIDO. Al anular, porque ese pedido no se va
        // a recibir nunca.
        if (accion === "recibir" || accion === "anular") limpiarRecepcion();

        // Marcar como enviado → salir del detalle para evitar que el usuario
        // siga "tocando botones" hasta recibir por error.
        if (accion === "enviar") {
          router.push("/modulos/compras-proveedor");
          return;
        }
        cargar();
      } else {
        alert(data.error || "Error al ejecutar acción");
      }
    } finally {
      setActing(false);
    }
  };

  // --- Buscar producto extra (debounced) ---
  const debounceRef = useRef(null);

  const buscarExtra = useCallback(
    (text) => {
      setExtraSearch(text);
      setExtraResults([]);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!text.trim() || !pedido?.proveedorId) {
        setExtraLoading(false);
        return;
      }

      setExtraLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/compras-proveedor/productos?proveedorId=${pedido.proveedorId}&search=${encodeURIComponent(text.trim())}`,
            { credentials: "include" }
          );
          const data = await res.json();
          if (data.ok) {
            // Filtrar productos ya en el pedido
            const idsEnPedido = new Set(
              (pedido.detalles || []).map((d) => d.productoLocalId)
            );
            const filtrados = (data.items || []).filter(
              (p) => !idsEnPedido.has(p.productoLocalId)
            );
            setExtraResults(filtrados.slice(0, 10));
          }
        } catch {
          // silenciar
        } finally {
          setExtraLoading(false);
        }
      }, 350);
    },
    [pedido]
  );

  const agregarExtra = async (producto) => {
    setExtraAdding(producto.productoLocalId);
    try {
      const res = await fetch(`/api/compras-proveedor/agregar-item/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoLocalId: producto.productoLocalId,
          cantidad: 1,
          cantidadRecibida: 1,
          precioCosto: producto.precio_costo || null,
          unidad: producto.modoCompra || "BULTO",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setExtraSearch("");
        setExtraResults([]);
        await cargar();
      } else {
        alert(data.error || "Error al agregar producto");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setExtraAdding(null);
    }
  };

  // Compartir el pedido — hook compartido con el modal de /nueva.
  //
  // LAS ACCIONES ESTÁN PARTIDAS POR DESTINATARIO Y NO POR FORMATO. Hasta el
  // 2026-09-19 esta pantalla tenía "Descargar PDF" y "Copiar pedido", y las dos
  // mandaban el documento CON los costos y el total — o sea que el botón que se
  // usa para mandarle el pedido al proveedor le decía con qué número esperábamos
  // que facture. Ahora las del proveedor no llevan dinero y la prefactura es una
  // cuarta acción, con su nombre puesto.
  const {
    copiarTextoDelProveedor,
    descargarPdfDelProveedor,
    descargarPrefactura,
    copiarTextoDeLaPrefactura,
  } = useAccionesEnvioPedido(pedido);

  // ── EDITAR Y QUITAR UNA LÍNEA SE FUERON CON EL EDITOR DE BORRADOR ─────────
  //
  // Acá vivían `editarItemAPI` y `eliminarDetalle`. Sólo se llamaban desde el
  // bloque de `esBorrador`, que no se dibujaba nunca, así que desde esta pantalla
  // no se pudo editar ni quitar una línea en ningún momento.
  //
  // Y NO SE RECONECTARON A PROPÓSITO. Un pedido ENVIADO ya se armó: lo que cambia
  // de ahí en más lo hace el proveedor, y esa diferencia se captura contra la
  // boleta al recibir. Editar la línea del pedido acá haría coincidir lo pedido
  // con lo que llegó y borraría el dato que la recepción existe para registrar.
  //
  // LAS RUTAS NO SE TOCARON: `editar-item` y `eliminar-item` siguen en la API,
  // y las usa `/nueva`, que es donde el borrador sí se edita.

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  // ── EL LÁPIZ DE EDITAR PRODUCTO SE FUE CON LA TABLA ───────────────────────
  //
  // Acá vivían `puedeEditarProductoP` y `irAEditarProducto`, que armaban el link
  // a la ficha del producto con `ORIGENES.PEDIDO_DETALLE` para poder volver. Su
  // ÚNICO consumidor era `TablaDetallePedido`, que nunca se dibujó, así que el
  // botón no se veía desde acá ni una vez. Se borraron con ella el 2026-08-17.
  //
  // NO ES UNA FUNCIÓN QUE SE PIERDA HOY: es una que ya estaba perdida y que el
  // código hacía parecer viva. Desde el detalle de un pedido enviado o recibido
  // no se puede ir a editar un producto, y no se podía antes tampoco.
  //
  // `linkEditarProducto` y `ORIGENES.PEDIDO_DETALLE` siguen existiendo en
  // `lib/compras-proveedor/retornoPedido.js` con sus candados: lo que ya no hay
  // es nadie en la aplicación que produzca ese origen. Si el lápiz tiene que
  // volver, el lugar es la lista de conciliación, que es lo que sí se dibuja.

  if (loading) {
    return (
      <div className="sunmi-bg w-full min-h-full p-4">
        <SunmiCard>
          <p className="sunmi-text-muted">Cargando...</p>
        </SunmiCard>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="sunmi-bg w-full min-h-full p-4">
        <SunmiCard>
          <p className="sunmi-text-danger">Pedido no encontrado</p>
          <div className="mt-3 flex justify-end">
            <SunmiBackButton href="/modulos/compras-proveedor" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  // BORRADOR redirige a /nueva (efecto de arriba); no renderizar el detalle mientras tanto.
  if (pedido.estado === "BORRADOR") return null;

  const esRecepcion = pedido.estado === "ENVIADO";
  const esBorrador = pedido.estado === "BORRADOR";
  const tieneFiambre = (pedido?.detalles || []).some(
    (d) => d.producto?.base?.modoCompraProveedor === "UNIDAD"
  );

  // Subtotal económico de una línea según el estado (fuente única: calculoPedido).
  // Fiambre → kg × costo (kg reales en recepción/recibido, piezas×pesoRef en borrador).
  const calcLineaDetalle = (d) => {
    const base = d.producto?.base;
    let cant, costo, kg;
    if (esBorrador) {
      cant = Number(cantidadesEdit[d.id] ?? d.cantidad) || 0;
      costo = Number(costos[d.id] ?? d.precioCosto ?? 0) || 0;
      kg = null; // se deriva piezas × pesoRef dentro de subtotalLinea
    } else if (esRecepcion) {
      cant = Number(recibidos[d.id]) || 0;
      costo = Number(costos[d.id] ?? d.precioCosto ?? 0) || 0;
      kg =
        kgRecibidos[d.id] != null && kgRecibidos[d.id] !== ""
          ? Number(kgRecibidos[d.id])
          : null;
    } else {
      cant = Number(d.cantidadRecibida ?? d.cantidad) || 0;
      costo = Number(d.precioCosto) || 0;
      kg = d.kgRecibidos != null ? Number(d.kgRecibidos) : null;
    }
    return subtotalLinea({ base, cantidad: cant, costo, kg });
  };

  // ── ACÁ SE CONTABA "N líneas tienen un costo distinto del catálogo" ────────
  //
  // SE SACÓ EL 2026-08-17 porque hacía la comparación de la pantalla equivocada.
  // Cruzaba LO PEDIDO contra el catálogo, que es la pregunta de cuando se ARMA el
  // pedido —y ahí sigue viva, en el contador de `/nueva`, que no se tocó—. En el
  // detalle de un pedido ya enviado la pregunta es otra: qué trajo el proveedor,
  // y eso se compara contra LA BOLETA. Esa comparación ya existe abajo, en la
  // lista de conciliación.
  //
  // ESE MOTIVO SE SOSTIENE SOLO: el contador sobra acá se encienda o no.
  //
  // Se midió además que no se encendía —los 13 pedidos ENVIADO de `erpazul_dev`,
  // uno por uno, sin `[data-contador-avisos]` en el DOM—, pero el PORQUÉ que se
  // escribió acá primero era falso y conviene no repetirlo: decía que el módulo
  // reescribe el costo maestro. NO lo hace. Desde `ed52991` ninguna ruta de pedido
  // escribe el costo maestro; solo `recibir` propaga.
  //
  // Coinciden por otra razón: LA LÍNEA NACE CLONANDO el costo del catálogo cuando
  // se agrega el producto. Es una fotocopia, no un vínculo — tanto que la pantalla
  // de armado guarda el valor del catálogo APARTE, para poder compararlos cuando
  // se separen.
  //
  // Así que el contador SÍ PUEDE ENCENDERSE: al editar el costo de la línea, al
  // editar el producto, o al aplicar una lista de proveedor. El cero de 13 es un
  // hecho de esos datos, no una ley.
  //
  // `contarLineasConAviso` y `textoContadorAvisos` NO SE BORRARON: siguen en
  // `lib/compras-proveedor/avisoCostoLinea` y los usa `/nueva`, que es donde el
  // aviso sirve. Lo que se fue es este consumidor, no el módulo.

  // Total estimado/factura reactivo = suma de subtotales económicos.
  const computedTotalFactura = (pedido?.detalles || []).reduce(
    (acc, d) => acc + (calcLineaDetalle(d).subtotal || 0),
    0
  );

  // ── UN PEDIDO RECIBIDO ES OTRA PANTALLA, Y SALE ACÁ ────────────────────
  //
  // No se esconden bloques uno por uno: se devuelve otra cosa. Mientras las dos
  // pantallas compartan el árbol, cada cosa que se agregue a la recepción
  // aparece también en la cerrada y hay que acordarse de taparla — que es
  // exactamente como llegaron ahí el contador de revisadas, los cuatro filtros,
  // la tabla de comprobantes con su cuadradito y un "Detalle (24 items)" vacío.
  //
  // El título y el Volver los pone el shell, igual que en la recepción.
  if (pedido.estado === "RECIBIDO") {
    return (
      <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
        <PedidoRecibido
          pedido={pedido}
          sinPedidoPrevio={sinPedidoPrevio}
          comprobante={comprobanteActivo}
          filas={filasDeFactura}
          sinComprobante={conciliacion?.sinComprobante || []}
          // La respuesta entera, y no solo lo que se dibuja: es de donde sale
          // cuántos comprobantes tiene el pedido, que es la pregunta que la
          // pantalla estaba contestando por su cuenta y mal.
          conciliacion={conciliacion}
          falloElPapel={falloLaConciliacion}
        />
      </div>
    );
  }

  return (
    // ── EL MISMO ENVOLTORIO QUE LA RECEPCIÓN DE UNA TRANSFERENCIA ────────
    //
    // `p-2 lg:p-3` y no `p-4`. Medido a 360: con `p-4` el contenido arrancaba
    // en x=14 y medía 324; transferencias arranca en x=21 y mide 310, porque su
    // raíz agrega `p-2` sobre el `p-4` del `<main>`. Eran siete píxeles por
    // lado, y es la diferencia que hacía que las dos pantallas no midieran
    // igual por más que las piezas de adentro fueran las mismas.
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3">
      {/* ── Y SIN LA TARJETA QUE ENVOLVÍA TODO ──────────────────────────
          Acá había un `<SunmiCard>` alrededor de la pantalla entera. Ése es el
          origen de las cajas anidadas: la tarjeta de afuera, el panel adentro y
          la tabla adentro del panel, tres bordes y tres fondos uno dentro de
          otro, que es lo que se veía como rayas a los costados.
          La recepción de una transferencia no envuelve nada: sus bloques se
          apoyan directo sobre el fondo de la página, y cada uno pone su propia
          tarjeta cuando le corresponde. */}
      <>
        {/* ── EL ENCABEZADO Y LA FICHA SON DE LOS OTROS ESTADOS ───────────
            Recibiendo, el título y el Volver los pone el shell —abajo, con
            `useTituloDePagina` y `useAccionDePagina`— y la identidad del pedido
            la dice la tarjeta de contexto. Acá quedan para CONFIRMADO,
            RECIBIDO y ANULADO, que esta tanda no toca: son pantallas de
            consulta y la ficha con sus fechas es lo que se va a mirar. */}
        {!esRecepcion && (
          <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <SunmiHeader title={`Pedido #${pedido.id}`} />
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ESTADO_BADGE[pedido.estado] || ""
                }`}
              >
                {pedido.estado === "BORRADOR" ? "EN CURSO" : pedido.estado}
              </span>
            </div>

            <SunmiBackButton href="/modulos/compras-proveedor" />
          </div>

          {/* Info del pedido */}
          <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="sunmi-text-muted text-xs">Proveedor</span>
                <p className="sunmi-text-strong">{pedido.proveedor?.nombre}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Depósito</span>
                <p className="sunmi-text-strong">{pedido.deposito?.nombre}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Creado</span>
                <p className="sunmi-text-strong">{formatFecha(pedido.createdAt)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Notas</span>
                <p className="sunmi-text-strong">{pedido.notas || "-"}</p>
              </div>
            </div>

            {/* Fechas de flujo */}
            <div className="grid grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t sunmi-divider">
              <div>
                <span className="sunmi-text-muted text-xs">Confirmado</span>
                <p className="sunmi-text-strong">{formatFecha(pedido.fechaConfirmado)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Enviado</span>
                <p className="sunmi-text-strong">{formatFecha(pedido.fechaEnviado)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Recibido</span>
                <p className="sunmi-text-strong">{formatFecha(pedido.fechaRecibido)}</p>
              </div>
              <div>
                <span className="sunmi-text-muted text-xs">Anulado</span>
                <p className={pedido.fechaAnulado ? "sunmi-text-danger" : "sunmi-text-strong"}>
                  {formatFecha(pedido.fechaAnulado)}
                </p>
              </div>
            </div>
          </SunmiPanel>
          </>
        )}

        {/* ── RECIBIENDO: DÓNDE ESTOY, EN DOS RENGLONES ───────────────────
            Reemplaza media pantalla de ficha —proveedor, depósito, creado,
            notas y cuatro fechas de las cuales dos están siempre vacías— por
            lo único que hace falta para saber dónde se está parado. */}
        {esRecepcion && (
          <TarjetaContextoDelPedido
            proveedorNombre={pedido.proveedor?.nombre || "—"}
            pedidoId={pedido.id}
            cantItems={pedido.detalles?.length || 0}
            totalEstimado={computedTotalFactura}
            // No hubo pedido: "0 ítems · $0,00 estimado al pedir" habla de algo
            // que nunca se encargó, y el $0,00 se lee como un error.
            nacidoDeFactura={sinPedidoPrevio}
            estado={sinPedidoPrevio ? "Llegó sin pedido" : "Esperando mercadería"}
          />
        )}

        {/* ── ACÁ ESTABA EL CARTEL NARANJA DE TRES RENGLONES ──────────────
            Decía "Pedido enviado al proveedor. Esperando mercadería." y después
            explicaba que no se marcara la recepción hasta que la mercadería
            llegara, usando "el botón Recibir mercadería al final del detalle"
            — un botón que estaba veinte centímetros más abajo.
            Lo que decía ahora lo dice el chip de la tarjeta de contexto, en una
            palabra, y el detalle de cuándo tocar qué lo resuelve que la pantalla
            ofrezca UNA sola acción por estado. */}

        {/* Los comprobantes del pedido: subir, ver, agrupar y leer. La
            conciliación línea por línea contra el pedido viene después. */}
        {(pedido.proveedor?.id ?? pedido.proveedorId) && (
          <PanelComprobantes
            pedidoId={pedido.id}
            // Nacido de una factura: foto → se lee → se arma el pedido, sin un
            // toque en el medio. Es el camino que se acordó y el único que deja
            // el pedido con algo adentro.
            leerAlSubir={sinPedidoPrevio}
            proveedorId={pedido.proveedor?.id ?? pedido.proveedorId}
            puedeRecibir={esRecepcion}
            onCantidad={setHayComprobantes}
            onMalLeidos={setMalLeidos}
            // ── SIN COMPROBANTES Y RECIBIENDO: EL BLOQUE DE LA FACTURA ─────
            //
            // El panel sigue siendo el dueño de la subida —el endpoint, la
            // validación de tamaño, los duplicados y el modal de "¿factura
            // nueva u otra hoja?"—. Lo único que cambia es la cara del estado
            // vacío, y los dos disparadores salen de él.
            //
            // "Llegó sin factura" destapa lo que esta pantalla ya sabía hacer:
            // el conteo a mano contra el pedido.
            // ── UN SOLO BLOQUE DE COMPROBANTES, NO DOS QUE SE TURNAN ──────
            //
            // Antes en una pantalla se veía "Sacar foto" y en otra "Subir
            // fotos", según hubiera o no un papel cargado. Eran las dos caras
            // del mismo panel alternándose, y eso es lo que se veía desprolijo.
            //
            // Ahora la subida es SIEMPRE el bloque de la foto —el panel ya no
            // dibuja su botón en esta pantalla— y cuando hay comprobantes el
            // panel suma su lista debajo, que es de donde sale "Leer". La
            // ranura solo dibuja el bloque grande cuando no hay ninguno: con
            // uno cargado, lo que hace falta arriba es la lista, no volver a
            // ofrecer la foto en tamaño protagonista.
            vacio={
              esRecepcion && !sinFactura
                ? ({ sacarFoto, subir, subiendo }) => (
                    <BloqueDeLaFactura
                      onSacarFoto={sacarFoto}
                      onSubir={subir}
                      // Sin pedido previo NO se ofrece "Llegó sin factura":
                      // el pedido ES la factura, y sin papel no hay nada que
                      // recibir —cero líneas—. Ofrecerlo mandaba a la rama
                      // vieja, que es donde terminó el 240.
                      onSinFactura={sinPedidoPrevio ? null : () => setSinFactura(true)}
                      subiendo={subiendo}
                    />
                  )
                : null
            }
          />
        )}

        {/* ── TODO LO DE ABAJO ES EL CONTEO CONTRA EL PEDIDO ──────────────
            Recibiendo y sin ningún comprobante todavía, no se dibuja: en ese
            estado lo único que hay para hacer es sacarle una foto a la factura,
            y 197 tarjetas debajo del bloque que lo pide son exactamente lo que
            hacía falta scrollear para encontrarlo.

            Aparece cuando hay un comprobante —porque entonces hay algo que
            conciliar— o cuando se eligió "Llegó sin factura", que es el conteo
            a mano. En los otros estados del pedido se dibuja siempre, como
            antes.

            El rediseño de estas líneas y de la hoja de corregir es la tanda
            siguiente: necesita dos columnas que hoy no existen —el motivo de la
            diferencia y las unidades sueltas— y eso es una migración. */}
        {/* ── RECIBIENDO CON LA FACTURA LEÍDA: LA LISTA NUEVA ────────────
            En el orden del papel, con los cuatro filtros y la hoja de corregir.
            Reemplaza al detalle viejo, que dibujaba una tarjeta por línea del
            PEDIDO con una oración adentro —"Pediste 1 bulto a $30780.00. Ningún
            comprobante la trajo."— y los tres marcos anidados que desbordaban.
            Si se eligió "Llegó sin factura" no hay papel que mostrar y se cae
            al conteo viejo, que es lo que esa salida ofrece. */}
        {/* ── ACÁ ESTABA LA LISTA DEL PEDIDO YA RECIBIDO ────────────────
            Se fue entera: un pedido RECIBIDO devuelve otra pantalla mucho más
            arriba, y esto quedaba inalcanzable. Una rama muerta que se lee como
            viva es peor que no tenerla — la próxima persona la toca creyendo
            que dibuja algo. */}
        {/* ── EL PAPEL QUE NO CIERRA SE ARREGLA ACÁ, ARRIBA DE TODO ──────
            Es el mismo bloque que la receta —`AsiLoEntendio`— y la diferencia
            es qué pasa con lo que se elige: allá solo recalcula en pantalla,
            acá se guarda en la línea del comprobante y el papel se vuelve a
            verificar con la misma puerta que usa la lectura.

            ── Y ACÁ ESTUVO SIN DIBUJARSE NUNCA ───────────────────────────
            Nació metido adentro de `(!esRecepcion || sinFactura)`, que es la
            rama del pedido SIN papel. O sea que el bloque que existe para
            arreglar un papel solo se dibujaba cuando no había ninguno: en el
            #242, con su comprobante leído y sin cerrar, la condición daba falso
            y no aparecía nada.

            Su candado estaba en VERDE, porque afirmaba que el bloque va antes
            de la conciliación EN EL ARCHIVO — y los dos estaban adentro de la
            misma rama muerta. Es el defecto que CLAUDE.md llama "un candado
            montado sobre algo que nunca ocurre": no falla, no avisa, y cierra
            la pregunta. Ahora el candado exige además que NO esté anidado ahí.

            Va afuera de las dos ramas a propósito: el papel que no cierra hay
            que poder arreglarlo se dibuje la lista que se dibuje. */}
        {esRecepcion &&
          malLeidos.map((id) => (
            <CorregirComprobante key={id} comprobanteId={id} onCorregido={cargar} />
          ))}

        {esRecepcion && !sinFactura && filasDeFactura.length > 0 && (
          <>
            <ListaDeLaFactura
              // NACIÓ DE UNA FACTURA: no hubo pedido, así que la tarjeta no
              // puede decir "Pediste". Viaja desde acá porque es un hecho del
              // PEDIDO, y deducirlo en la tarjeta —"no tiene cantidad pedida"—
              // sería el segundo criterio de siempre: una línea no pedida de un
              // pedido normal se ve igual.
              sinPedidoPrevio={sinPedidoPrevio}
              comprobante={comprobanteActivo}
              filas={filasDeFactura}
              onCorregir={setLineaACorregir}
              onCoincide={aceptarLoQueDiceLaFactura}
              revisadas={revisadas}
              accionDelPie={
                <SunmiButton
                  color="amber"
                  type="button"
                  disabled={acting}
                  // ── ACÁ HABÍA UN `confirm()` DEL NAVEGADOR ──────────────
                  //
                  // "Solo continuar si la mercadería llegó físicamente", que se
                  // acepta sin leer — y detrás el servidor daba por recibido
                  // todo lo pedido, incluidas las líneas que ningún comprobante
                  // trajo. Ahora abre la hoja de cierre, que pregunta por esas
                  // líneas una por una y dice qué queda a medias.
                  onClick={() => setCerrandoRecepcion(true)}
                  // El alto de la barra de acción del módulo, el mismo que usa
                  // el bloque de la factura: `w-full min-h-botonFoto`. Antes
                  // era un botón encogido al lado de cuatro renglones de
                  // números, y por eso se montaba encima del porcentaje.
                  className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
                >
                  {acting ? "Procesando..." : "Recibir mercadería"}
                </SunmiButton>
              }
            />
            <HojaCorregirLinea
              sinPedidoPrevio={sinPedidoPrevio}
              // A quién se le compra. De acá sale en qué universo busca el
              // buscador de la hoja: lo que se le compra a este proveedor, y no
              // el catálogo entero.
              proveedorId={pedido.proveedor?.id ?? pedido.proveedorId ?? null}
              proveedorNombre={pedido.proveedor?.nombre ?? null}
              fila={lineaACorregir}
              abierta={!!lineaACorregir}
              onCerrar={() => setLineaACorregir(null)}
              onAceptarPrecio={aceptarPrecioDeLinea}
              onDejarMiPrecio={dejarMiPrecioDeLinea}
              onGuardar={guardarCorreccion}
              onVincular={vincularLinea}
              onDesmarcar={desmarcarLinea}
              // El eco optimista manda mientras exista; si no, lo que dice la
              // base. La misma regla que usa la lista, y por eso el botón
              // "Desmarcar" aparece justo cuando el tilde está puesto.
              revisada={
                revisadas[lineaACorregir?.lineaId] ?? lineaACorregir?.revisada === true
              }
            />

            <HojaCerrarRecepcion
              abierta={cerrandoRecepcion}
              onCerrar={() => setCerrandoRecepcion(false)}
              filas={filasDeFactura}
              // Sin pedido previo NO HAY "productos que el papel no trajo":
              // todo sale del papel. Se le pasa vacío en vez de esconder el
              // bloque adentro de la hoja, para que la hoja siga contestando
              // una sola pregunta —qué llegó de lo que nadie facturó— y no
              // tenga que saber de dónde nació el pedido.
              sinComprobante={sinPedidoPrevio ? [] : conciliacion?.sinComprobante || []}
              contados={recibidos}
              guardando={acting}
              onConfirmar={(recibidosDelCierre) => {
                setCerrandoRecepcion(false);
                ejecutarAccion("recibir", { recibidos: recibidosDelCierre });
              }}
            />
          </>
        )}

        {/* ── LA RAMA VIEJA NO EXISTE PARA UN PEDIDO NACIDO DE FACTURA ────
            Acá cae "Detalle (N productos)", "Agregar producto extra", la tabla
            de conciliación vieja —la que dice "Todavía no hay comprobantes ni
            líneas del pedido"— y los dos botones de abajo.

            Un pedido nacido de una factura SIN LEER tiene cero líneas, y con
            `sinFactura` en true esta rama se dibujaba igual: el pedido 240 de
            Paty mostró "Detalle (0 productos)" y "Todavía no hay comprobantes
            ni líneas del pedido" con un comprobante subido y visible dos
            centímetros más arriba. Las dos frases eran falsas.

            No hay nada acá que sirva para este caso: los productos los pone el
            papel, no se agregan a mano, y hasta que se lea no hay nada que
            mostrar más que la foto y en qué anda la lectura. */}
        {(!esRecepcion || sinFactura) && !sinPedidoPrevio && (
          <>
          {/* ── ACÁ ESTABA "FACTURA Y GANANCIA" ────────────────────────────
              Cuatro campos para teclear a mano: total factura (calculado),
              total real, número y fecha. Los tres que se cargaban a mano los
              trae la factura leída —`numero`, `fecha` y `totalLeido` de
              `ComprobanteProveedor`— y ahora `recibir/[id]` los toma de ahí
              cuando la pantalla no los manda.

              Pedirlos al lado del botón que los completa solo era ofrecer dos
              caminos para lo mismo, y el manual es el que se equivoca.

              LO QUE LA FOTO NO PUEDE LLENAR: el total cuando el papel no trae
              total impreso. Ese caso tiene su propio estado —SIN_TOTAL— y la
              lectura devuelve `totalLeido` en null a propósito, sin inventar la
              suma de las líneas. Queda anotado para la tanda del cierre, que es
              donde se decide qué se exige antes de pasar a RECIBIDO. */}

          {/* Detalle de productos */}
          <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center gap-2 flex-wrap pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Detalle ({pedido.detalles?.length || 0}{" "}
                {pedido.detalles?.length === 1 ? "producto" : "productos"})
              </h3>
            </div>

            {/* ── ACÁ VIVÍA EL EDITOR DE BORRADOR, Y SE BORRÓ ENTERO ──────────
                La tabla de escritorio, las tarjetas de mobile y el banner "Estás
                editando un borrador" colgaban todos de `esBorrador`, que es siempre
                falso por el `return null` de más arriba: no se dibujaron nunca.

                NO SE CONECTARON, SE BORRARON, y es una decisión de negocio y no de
                plomería: BORRADOR es "todavía se está armando" y se edita en
                `/nueva`; ENVIADO es "ya se armó". Lo que cambia después no lo hace
                uno —lo hace el proveedor, que manda de menos o cobra distinto— y eso
                se captura CONTRA LA BOLETA al recibir, que es a lo que vino el
                módulo de comprobantes. Editar el pedido acá sería reescribir lo que
                se pidió para que coincida con lo que llegó, y así la diferencia
                —que es el dato— desaparece.

                En recepción y en recibido va la lista única, abajo. */}

            {/* ── LA LISTA ÚNICA ────────────────────────────────────────────────
                Cada línea de la factura con lo que le corresponde del pedido al
                lado, agrupada por comprobante, y las del pedido que ningún
                comprobante trajo aparte y al final. Reemplaza a las DOS listas que
                había —las líneas de la factura arriba y el detalle del pedido
                abajo— que obligaban a cruzarlas de memoria.

                OJO CON EL NOMBRE: `esRecepcion` es el estado ENVIADO. Es
                justamente el estado en el que se suben y se leen las facturas, así
                que la conciliación SÍ está disponible ahí. El nombre engaña y ya
                hizo dudar una vez si faltaba un estado; no falta.

                El estado de lo recibido y su guardado siguen viviendo en esta
                página: la lista solo dibuja los campos. Cambiar cómo se ve y cómo
                se guarda en la misma tanda junta dos fuentes de error en la misma
                ventana. */}
            {/* ── Y CON EL PEDIDO CERRADO YA NO SE DIBUJA ──────────────────
                La tabla densa se quedó para la recepción, donde todavía se
                edita. Un pedido RECIBIDO se lee arriba, con las tarjetas y la
                conversión de la recepción: dos vistas de lo mismo, una de ellas
                sin convertir las cantidades, es cómo la pantalla terminó
                diciendo "Factura 80" sobre 8 bultos. */}
            {esRecepcion && (
              <ListaConciliacion
                pedidoId={pedido.id}
                proveedorIdDelPedido={pedido.proveedor?.id ?? pedido.proveedorId ?? null}
                estadoPedido={pedido.estado}
                esRecepcion={esRecepcion}
                puedeRecibir={esRecepcion}
                recibidos={recibidos}
                setRecibidos={setRecibidos}
                kgRecibidos={kgRecibidos}
                setKgRecibidos={setKgRecibidos}
                onCambio={cargar}
              />
            )}
          </SunmiPanel>

          {/* Agregar productos al pedido — visible en BORRADOR y ENVIADO */}
          {(esRecepcion || esBorrador) && (
            <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
              <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                <h3 className="text-[13px] font-semibold sunmi-text-strong">
                  {esBorrador ? "Agregar productos al pedido" : "Agregar producto extra"}
                </h3>
              </div>

              <SunmiInput
                type="text"
                placeholder="Buscar producto extra (nombre / SKU / código de barra)"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={extraSearch}
                onChange={(e) => buscarExtra(e.target.value)}
                className="mb-3"
              />

              {extraLoading && (
                <p className="text-xs sunmi-text-muted">Buscando...</p>
              )}

              {!extraLoading && extraSearch.trim() && extraResults.length === 0 && (
                <p className="text-xs sunmi-text-muted">Sin resultados</p>
              )}

              {extraResults.length > 0 && (
                <div className="overflow-x-auto rounded border sunmi-border">
                  <SunmiTable headers={["Producto", "SKU", "Cód. barra", "Modo", "Costo", ""]}>
                    {extraResults.map((p) => (
                      <SunmiTableRow key={p.productoLocalId}>
                        <td className="px-3 py-1.5 text-sm">{p.nombre}</td>
                        <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.sku || "-"}</td>
                        <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.codigo_barra || "-"}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {p.modoCompra === "UNIDAD" ? (
                            <span className="sunmi-text-link">FIAMBRE</span>
                          ) : (
                            "BULTO"
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {p.precio_costo ? `$${Number(p.precio_costo).toFixed(2)}` : "-"}
                        </td>
                        <td className="px-3 py-1.5">
                          <SunmiButton
                            color="cyan"
                            size="xs"
                            disabled={extraAdding === p.productoLocalId}
                            onClick={() => agregarExtra(p)}
                          >
                            {extraAdding === p.productoLocalId ? "..." : "Agregar"}
                          </SunmiButton>
                        </td>
                      </SunmiTableRow>
                    ))}
                  </SunmiTable>
                </div>
              )}
            </SunmiPanel>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3">
            {["BORRADOR", "CONFIRMADO", "ENVIADO"].includes(pedido.estado) && (
              <SunmiButton
                color="red"
                disabled={acting}
                onClick={() => {
                  if (!confirm("¿Anular este pedido? Esta acción no se puede deshacer.")) return;
                  ejecutarAccion("anular");
                }}
              >
                {acting ? "Procesando..." : "Anular pedido"}
              </SunmiButton>
            )}

            {pedido.estado === "BORRADOR" && (
              <SunmiButton
                color="amber"
                disabled={acting}
                onClick={() => ejecutarAccion("confirmar")}
              >
                {acting ? "Procesando..." : "Confirmar pedido"}
              </SunmiButton>
            )}

            {pedido.estado === "CONFIRMADO" && (
              <>
                {/* Los dos del proveedor: sin precios. */}
                <SunmiButton color="slate" onClick={descargarPdfDelProveedor}>
                  PDF para el proveedor
                </SunmiButton>
                <SunmiButton color="slate" onClick={copiarTextoDelProveedor}>
                  Copiar para el proveedor
                </SunmiButton>
                {/* Y los dos de adentro. Van con la palabra "prefactura" porque es
                    lo que distingue un documento del otro: el que lleva los costos
                    no se le manda a nadie. */}
                <SunmiButton color="slate" onClick={descargarPrefactura}>
                  Descargar prefactura
                </SunmiButton>
                <SunmiButton color="slate" onClick={copiarTextoDeLaPrefactura}>
                  Copiar prefactura
                </SunmiButton>
                <SunmiButton
                  color="cyan"
                  disabled={acting}
                  onClick={() => {
                    if (!confirm("¿Confirmás que este pedido ya fue enviado al proveedor?")) return;
                    ejecutarAccion("enviar");
                  }}
                >
                  {acting ? "Procesando..." : "Marcar como enviado"}
                </SunmiButton>
              </>
            )}

            {pedido.estado === "ENVIADO" && (
              <SunmiButton
                color="amber"
                disabled={acting}
                title="Solo continuar si la mercadería llegó físicamente al depósito"
                onClick={() => {
                  if (!confirm("Solo continuar si la mercadería llegó físicamente.\n\n¿Confirmás la recepción de este pedido?")) return;
                  ejecutarAccion("recibir");
                }}
              >
                {acting ? "Procesando..." : "Recibir mercadería"}
              </SunmiButton>
            )}
          </div>
          </>
        )}
      </>
    </div>
  );
}
