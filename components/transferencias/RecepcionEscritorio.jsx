"use client";

// components/transferencias/RecepcionEscritorio.jsx
//
// LA COMPOSICIÓN DE COMPUTADORA DE "RECIBIR UNA TRANSFERENCIA", desde `lg`
// (Figma EVJ2KvVCrY0oVSowfboymQ, 384:483, "Escritorio · Recibir transferencia
// · 1366"). Por debajo de 1024 px se ve lo de siempre, sin tocar.
//
// ── LA REGLA DE ESTA PANTALLA: NO TOCA NADA DEL TELÉFONO ─────────────────
//
// Los archivos que usa el teléfono —`RecepcionMovil`, `TarjetaRecepcionMovil`,
// `recepcionUI.js`, las piezas del kit— NO se modifican para servir a esta
// pantalla: ni por dentro, ni para "compartir" lógica, ni con una prop nueva
// con valor por defecto. Lo decidió Emanuel el 2026-10-14, después de que
// b064e6b los tocara para compartir reglas y él tuviera que pedir que se
// restauraran. Esta pantalla solo IMPORTA de ellos lo que ya exportan, tal
// como está; lo que vive adentro de uno y no está exportado se COPIA acá,
// marcado como copia y con el archivo de donde salió. Esa duplicación se
// acepta a sabiendas: si la regla cambia en el teléfono, hay que cambiarla
// también acá.
//
// ── QUÉ ES ESTO ───────────────────────────────────────────────────────────
//
// Es PRESENTACIÓN. Recibe de `WorkspaceRecepcion` el estado compartido
// —filtro, categoría, búsqueda, catálogo— y los handlers que van al servidor
// —revisar, agregar, confirmar—, y los acomoda para un mouse y una pantalla
// ancha. Lo que es suyo: qué producto muestra el panel, el Enter del
// buscador y la cámara, para que lo encontrado vaya a su panel y no a la hoja
// del teléfono (que es un modal por portal y se abriría encima de esta).
//
//   · si se puede confirmar ......... `cierreDeRecepcion`, COPIA de la regla
//                                     de `RecepcionMovil`;
//   · qué dice cada línea ........... `lecturaDeLaLinea`, COPIA de la de
//                                     `TarjetaRecepcionMovil`;
//   · qué manda "✓ Coincide" ........ `cuerpoDeCoincide`, COPIA del de la tarjeta;
//   · el producto elegido ........... `FichaProductoRecepcion` con `enHoja`,
//                                     importada tal cual: la MISMA hoja que el
//                                     teléfono abre desde abajo;
//   · el "⋯" ........................ `MasAccionesRecepcion`, copia de las hojas
//                                     de `RecepcionMovil`;
//   · los cuatro filtros en fila .... `FiltroEstadoCompacto`, variante propia de
//                                     `SunmiFiltroEstado`.
//
// ── TRES FRANJAS ──────────────────────────────────────────────────────────
//
//   1. La transferencia: número, estado, puntas, avance, importe y las
//      acciones —⋯, Volver y Confirmar—, en una tarjeta.
//   2. Las herramientas en una fila: buscar o escanear, los cuatro filtros de
//      siempre y la categoría.
//   3. El cuerpo: la lista como tabla a la izquierda y, a la derecha, el panel
//      del producto elegido, pegado arriba mientras la lista scrollea.

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiBarraDeAvance from "@/components/sunmi/SunmiBarraDeAvance";
import SunmiEscanerCodigoBarra, {
  MENSAJES_SIN_CAMARA,
  hayEscanerDisponible,
} from "@/components/sunmi/SunmiEscanerCodigoBarra";

import EstadoTransferenciaBadge from "./EstadoTransferenciaBadge";
import FichaProductoRecepcion from "./FichaProductoRecepcion";
import FilaCatalogoRecepcion, { ROTULO_CATALOGO } from "./FilaCatalogoRecepcion";
import FiltroEstadoCompacto from "./FiltroEstadoCompacto";
import MasAccionesRecepcion, { TITULO_MAS_ACCIONES } from "./MasAccionesRecepcion";
import { AVISO_FALTA_CANTIDAD, MENSAJE_NO_FIGURA_CORTO, PLACEHOLDER_BUSCADOR } from "./RecepcionMovil";
import { TEXTO_COINCIDE, TEXTO_CORREGIR } from "./TarjetaRecepcionMovil";
import { fmtCantidad, fmtFechaHoraAR } from "./detallePresentacion";

import { formatearMoneda } from "@/lib/moneda";
import { FILTRO, RESOLUCION, pasaFiltro, resolverEntrada } from "@/lib/transferencias/controlFisico";
import {
  MOTIVOS_FALTANTE,
  MOTIVOS_SOBRANTE,
  chipsDeMotivo,
  costoMostradoDe,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
import {
  agrupa,
  descriptorDeEnvio,
  envioComoSeCuenta,
  firmaDeEdicion,
  nombreDePresentacion,
  rotuloConSueltasCorto,
  unidadDeDiferencia,
} from "@/lib/transferencias/presentacionEnvio";

// ═══════════════════════════════════════════════════════════════════════════
// LAS COPIAS. Ver el encabezado: el teléfono no se toca, así que lo que esta
// pantalla necesita de adentro de sus archivos se copia acá, tal cual.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * COPIA de `CLASE_COINCIDE` de `TarjetaRecepcionMovil.jsx`, que no la exporta:
 * el botón "✓ Coincide" se pinta igual en la fila que en la tarjeta.
 */
const CLASE_COINCIDE = "sunmi-btn-accent-outline";

/**
 * SI SE PUEDE CONFIRMAR, Y POR QUÉ NO. COPIA de las cuentas de
 * `RecepcionMovil.jsx` (`pendientes`, `todoRevisado`, `sinMotivo`,
 * `sinCargar`, `trabado`), renglón por renglón. El porqué de cada causa está
 * escrito allá; el servidor las vuelve a exigir de todas formas.
 */
export function cierreDeRecepcion({ items = [], resumen = null } = {}) {
  const pendientes = resumen?.pendientes ?? 0;
  const todoRevisado = pendientes === 0 && (resumen?.totalRemito ?? 0) > 0;
  const sinMotivo = (items || []).filter((d) => {
    if (d.agregadoEnRecepcion || d.motivoPrincipal) return false;
    if (d.cantidadRecibida == null) return false;
    const env = fisicasEnviadasDe(d);
    const rec = fisicasRecibidasDe(d);
    return env != null && rec != null && rec !== env;
  }).length;
  const faltaCargar = (d) => d.agregadoEnRecepcion === true && !(fisicasRecibidasDe(d) > 0);
  const sinCargar = (items || []).filter(faltaCargar).length;
  const trabado = !todoRevisado || sinMotivo > 0 || sinCargar > 0;
  return { pendientes, todoRevisado, sinMotivo, sinCargar, trabado };
}

/**
 * LO QUE UNA LÍNEA DICE. COPIA de las derivaciones del principio de
 * `TarjetaRecepcionMovil` —la escala mostrada, las físicas, la diferencia, los
 * dos importes—, con sus mismos nombres. El porqué de cada una está allá.
 */
export function lecturaDeLaLinea(d) {
  const envio = descriptorDeEnvio(d);
  const mostrado = envioComoSeCuenta(envio);
  const porUnidad = mostrado !== envio;
  const esAgregada = d.agregadoEnRecepcion === true;
  const revisado = d.revisadoEnRecepcion === true;
  const sueltasGuardadas = Number(d.recibidoUnidadesSueltas || 0);
  const fisicasContadas = fisicasRecibidasDe(d);
  const fisicasEnviadas = fisicasEnviadasDe(d);
  const chips = chipsDeMotivo({
    enviada: fisicasEnviadas,
    recibida: fisicasContadas,
    agregadoEnRecepcion: esAgregada,
  });
  const hayDiferencia = chips.length > 0;
  const delta =
    fisicasContadas == null || fisicasEnviadas == null ? null : fisicasContadas - fisicasEnviadas;
  const enviadasMostradas = porUnidad ? fisicasEnviadas : envio.cantidad;
  const recibidasMostradas = porUnidad ? fisicasContadas : d.cantidadRecibida;
  const sueltasMostradas = porUnidad ? 0 : sueltasGuardadas;
  const costoMostrado = costoMostradoDe(d, envio);
  const importeRemito = esAgregada ? null : d.subtotal;
  const importeRecibido = d.subtotalRecibido == null ? d.subtotal : d.subtotalRecibido;
  const hayCorreccionDeImporte =
    importeRemito != null && Number(importeRemito) !== Number(importeRecibido);
  return {
    envio,
    mostrado,
    porUnidad,
    esAgregada,
    revisado,
    sueltasGuardadas,
    fisicasContadas,
    fisicasEnviadas,
    chips,
    hayDiferencia,
    delta,
    enviadasMostradas,
    recibidasMostradas,
    sueltasMostradas,
    costoMostrado,
    importeRemito,
    importeRecibido,
    hayCorreccionDeImporte,
  };
}

/**
 * LO QUE MANDA "✓ COINCIDE". COPIA del cuerpo de `coincidir` en
 * `TarjetaRecepcionMovil`: lo que el remito dice, en la escala de la
 * PRESENTACIÓN —mandar las físicas guardaría 144 packs sobre 6 PACK x24—.
 */
export function cuerpoDeCoincide(d) {
  const envio = descriptorDeEnvio(d);
  return {
    detalleId: d.id,
    recibido: envio.cantidad,
    recibidoUnidadesSueltas: envio.sueltas || 0,
    motivoPrincipal: null,
    motivoDetalle: null,
  };
}

/** Los cuatro estados del trabajo, los mismos del teléfono y en el mismo orden. */
const TABS = [
  { clave: FILTRO.PENDIENTES, texto: "Pendientes" },
  { clave: FILTRO.DIFERENCIAS, texto: "Diferencias" },
  { clave: FILTRO.REVISADOS, texto: "Revisados" },
  { clave: FILTRO.TODOS, texto: "Todos" },
];

/** De dónde sale el número de cada filtro: del MISMO resumen que el teléfono. */
const CONTEO = {
  [FILTRO.PENDIENTES]: (r) => r.pendientes,
  [FILTRO.DIFERENCIAS]: (r) => r.diferencias,
  [FILTRO.REVISADOS]: (r) => r.revisados,
  [FILTRO.TODOS]: (r) => r.totalFisico ?? r.totalRemito,
};

export const TEXTO_TODO_REVISADO = "Está todo revisado. Revisá las diferencias y confirmá la recepción.";

const plural = (n, uno, varios) => `${fmtCantidad(n)} ${n === 1 ? uno : varios}`;

/** El rótulo de un motivo guardado, el mismo que muestra la ficha al elegirlo. */
function rotuloDeMotivo(valor) {
  if (!valor) return null;
  const m = [...MOTIVOS_FALTANTE, ...MOTIVOS_SOBRANTE].find((o) => o.value === valor);
  return m ? m.label : valor;
}

/**
 * Por qué no se puede confirmar, en una línea, para debajo del botón. La regla
 * es la de `cierreDeRecepcion`; esto solo la dice en palabras.
 */
function motivoDelBloqueo({ pendientes, sinMotivo, sinCargar }) {
  if (pendientes > 0) return `Falta revisar ${plural(pendientes, "producto", "productos")}`;
  if (sinMotivo > 0) return `Falta el motivo de ${plural(sinMotivo, "diferencia", "diferencias")}`;
  if (sinCargar > 0) return AVISO_FALTA_CANTIDAD;
  return null;
}

/** "Faltó 1 unidad" / "Sobró 4 unidades", en FÍSICO. */
function textoDeLaDiferencia(delta, unidad) {
  const n = Math.abs(delta);
  const palabra = unidad === "unidades" ? (n === 1 ? "unidad" : "unidades") : unidad;
  return `${delta < 0 ? "Faltó" : "Sobró"} ${fmtCantidad(n)} ${palabra}`;
}

// ── LAS CELDAS ────────────────────────────────────────────────────────────

function CeldaProducto({ d }) {
  return (
    <>
      <span className="block font-semibold sunmi-text-strong break-words">{d.nombre}</span>
      {d.categoria?.nombre ? <span className="block text-sm2 sunmi-text-muted">{d.categoria.nombre}</span> : null}
    </>
  );
}

function CeldaEnviado({ l }) {
  if (l.esAgregada) return <span className="sunmi-text-muted">—</span>;
  // Las unidades físicas debajo solo cuando la presentación agrupa —pack,
  // cartón, cajón—: "6 PACK x6 · 36 unidades". En una que se cuenta por unidad
  // serían el mismo número dos veces.
  const conFisicas = !l.porUnidad && agrupa(l.envio.presentacion) && l.fisicasEnviadas != null;
  return (
    <>
      <span className="block whitespace-nowrap tabular-nums font-medium">{rotuloConSueltasCorto(l.mostrado)}</span>
      {conFisicas ? (
        <span className="block text-xs2 tabular-nums sunmi-text-muted">
          {fmtCantidad(l.fisicasEnviadas)} {unidadDeDiferencia(l.envio)}
        </span>
      ) : null}
    </>
  );
}

function CeldaRecibido({ l }) {
  if (l.fisicasContadas == null && !l.revisado) return <span className="sunmi-text-muted">—</span>;
  const rotulo = rotuloConSueltasCorto({
    ...l.mostrado,
    cantidad: l.recibidasMostradas ?? 0,
    sueltas: l.sueltasMostradas,
  });
  if (l.esAgregada) {
    return <span className="block whitespace-nowrap tabular-nums font-medium sunmi-text-warning">{rotulo}</span>;
  }
  const coincide = l.delta === 0;
  return (
    <>
      <span
        className={`block whitespace-nowrap tabular-nums font-medium ${coincide ? "sunmi-text-success" : "sunmi-text-danger"}`}
      >
        {rotulo}
      </span>
      {coincide ? (
        agrupa(l.envio.presentacion) && !l.porUnidad && l.fisicasContadas != null ? (
          <span className="block text-xs2 tabular-nums sunmi-text-muted">
            {fmtCantidad(l.fisicasContadas)} {unidadDeDiferencia(l.envio)}
          </span>
        ) : null
      ) : l.fisicasContadas != null && l.fisicasEnviadas != null ? (
        <span className="block text-xs2 tabular-nums sunmi-text-danger">
          {fmtCantidad(l.fisicasContadas)} de {fmtCantidad(l.fisicasEnviadas)}
        </span>
      ) : null}
    </>
  );
}

function CeldaImporte({ l }) {
  // Los dos importes del endpoint, como en la tarjeta: el del remito tachado
  // arriba cuando la corrección lo cambió, y el que vale lo que llegó.
  return (
    <span className="whitespace-nowrap tabular-nums">
      {l.hayCorreccionDeImporte ? (
        <span className="block text-xs2 line-through sunmi-text-muted">{formatearMoneda(l.importeRemito)}</span>
      ) : null}
      <span className={`block ${l.hayCorreccionDeImporte ? "font-semibold sunmi-text-warning" : "sunmi-text-strong"}`}>
        {formatearMoneda(l.importeRecibido)}
      </span>
    </span>
  );
}

/** Una marca chica: "✓ Coincide", "Faltó 1 unidad · Faltante", "No declarado". */
function Marca({ tono, children }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs2 font-semibold ${tono}`}>
      {children}
    </span>
  );
}

function CeldaAcciones({ d, l, puedeRecibir, guardando, onCoincide, onCorregir }) {
  if (!puedeRecibir) return null;
  // Las mismas puertas que la tarjeta del teléfono: "Coincide" solo donde no
  // hay ninguna diferencia declarada ni es un no declarado; ahí el único
  // camino es "Corregir".
  const corregir = (
    <SunmiLinkButton
      onClick={(e) => {
        e.stopPropagation();
        onCorregir(d);
      }}
      disabled={guardando}
      aria-label={`${TEXTO_CORREGIR} ${d.nombre}`}
      className="text-sm2"
    >
      {TEXTO_CORREGIR}
    </SunmiLinkButton>
  );

  if (l.esAgregada) {
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-warning sunmi-text-warning">No declarado</Marca>
        {corregir}
      </span>
    );
  }
  if (l.hayDiferencia && l.delta != null) {
    const motivo = rotuloDeMotivo(d.motivoPrincipal);
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-danger sunmi-text-danger">
          {textoDeLaDiferencia(l.delta, unidadDeDiferencia(l.envio))}
          {motivo ? ` · ${motivo}` : " · sin motivo"}
        </Marca>
        {!l.revisado ? corregir : null}
      </span>
    );
  }
  if (l.revisado) {
    // Revisado y coincide: la marca, y "Corregir" apagado. Para cambiarlo se
    // toca la fila, que lo carga en el panel con su conteo.
    return (
      <span className="inline-flex items-center gap-2">
        <Marca tono="sunmi-state-success sunmi-text-success">{TEXTO_COINCIDE}</Marca>
        <span className="text-sm2 sunmi-text-muted opacity-50">{TEXTO_CORREGIR}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {corregir}
      <SunmiButton
        onClick={(e) => {
          e.stopPropagation();
          onCoincide(d);
        }}
        disabled={guardando}
        className={`shrink-0 min-h-0 px-3 py-1.5 text-sm2 ${CLASE_COINCIDE}`}
      >
        {TEXTO_COINCIDE}
      </SunmiButton>
    </span>
  );
}

// ── EL PANEL DEL PRODUCTO ─────────────────────────────────────────────────

function PanelDelProducto({ producto, puedeRecibir, guardando, quitandoId, onRevisar, onQuitarLinea, onGuardado, anterior, siguiente, onElegir, todoRevisado }) {
  if (!producto) {
    return (
      <SunmiCard className="p-4">
        <p className="text-sm2 sunmi-text-muted">
          {todoRevisado ? TEXTO_TODO_REVISADO : "Escaneá, buscá o elegí un producto de la lista."}
        </p>
      </SunmiCard>
    );
  }
  const l = lecturaDeLaLinea(producto);
  return (
    <SunmiCard className="p-5 space-y-3" data-panel-producto={producto.nombre}>
      <div>
        <h2 className="text-lg2 font-semibold sunmi-text-strong break-words">{producto.nombre}</h2>
        <p className="text-sm2 sunmi-text-muted">
          {producto.categoria?.nombre ? `${producto.categoria.nombre} · ` : ""}
          se cuenta por {nombreDePresentacion(l.mostrado)}
        </p>
      </div>

      {/* La MISMA hoja que el teléfono abre desde abajo, con `enHoja`: sin
          tarjeta propia —el panel ya es una— y con "y seguir" en el botón. */}
      <FichaProductoRecepcion
        key={firmaDeEdicion(producto)}
        producto={producto}
        puedeRecibir={puedeRecibir}
        guardando={guardando}
        onRevisar={onRevisar}
        onQuitar={onQuitarLinea}
        quitando={quitandoId === producto.id}
        enHoja
        onGuardado={onGuardado}
      />

      <div className="flex items-center justify-between gap-3 text-sm2">
        {anterior ? (
          <SunmiLinkButton onClick={() => onElegir(anterior)} className="text-sm2 no-underline">
            ‹ Anterior
          </SunmiLinkButton>
        ) : (
          <span />
        )}
        {siguiente ? (
          <SunmiLinkButton onClick={() => onElegir(siguiente)} className="min-w-0 truncate text-sm2 no-underline">
            Siguiente: {siguiente.nombre} ›
          </SunmiLinkButton>
        ) : null}
      </div>
    </SunmiCard>
  );
}

// ── LA COMPOSICIÓN ────────────────────────────────────────────────────────

export default function RecepcionEscritorio({
  item,
  resumen,
  categorias,
  visibles,
  filtro,
  categoriaId,
  texto,
  aviso,
  noFigura = false,
  puedeRecibir,
  guardando,
  quitandoId,
  catalogo = [],
  buscandoCatalogo = false,
  onAgregarDesdeCatalogo,
  onAbrirAgregar,
  accionAgregar,
  onFiltrar,
  onCategoria,
  onTexto,
  onVoz,
  onRevisar,
  onQuitarLinea,
  confirmarRecepcion,
  confirmando = false,
  puedeCancelar = false,
  abrirPanelCancelar,
  panelCancelar = null,
  imprimirTicket,
  volver = null,
}) {
  const [masAcciones, setMasAcciones] = useState(false);
  const [errorDeFila, setErrorDeFila] = useState("");
  const [avisoPropio, setAvisoPropio] = useState("");
  const [escaneando, setEscaneando] = useState(false);

  // ── EL PRODUCTO DEL PANEL ES DE ESTA PANTALLA ───────────────────────────
  //
  // No es el `seleccionado` del workspace: ése abre la hoja del teléfono, que
  // es un modal por portal y se abriría encima de esta pantalla aunque la del
  // teléfono esté oculta. Sin nada elegido, el panel muestra el primer
  // pendiente en el orden del remito; con todo revisado, ninguno.
  const items = item?.items || [];
  const [elegidoId, setElegidoId] = useState(null);
  const elegir = (d) => {
    setElegidoId(d?.id ?? null);
    setAvisoPropio("");
  };
  const producto =
    items.find((d) => d.id === elegidoId) || items.find((d) => pasaFiltro(d, FILTRO.PENDIENTES)) || null;

  // ── EL ENTER Y LA CÁMARA, A ESTE PANEL ──────────────────────────────────
  //
  // La cascada es la MISMA del workspace —`resolverEntrada`, importada tal
  // cual—: lo encontrado se abre en el panel; si no figura, el texto queda en
  // el buscador para que el catálogo del origen lo tome. La cámara pide solo
  // código, como en el teléfono.
  const resolver = (entrada, opciones) => {
    const r = resolverEntrada(items, entrada, opciones);
    if (r.tipo === RESOLUCION.ABRIR) {
      elegir(r.producto);
      if (r.porCodigo) onTexto("");
      return r;
    }
    if (r.tipo === RESOLUCION.NO_FIGURA) {
      onTexto(String(entrada || "").trim());
      return r;
    }
    return r;
  };
  const alTeclear = (e) => {
    if (e.key === "Enter" && texto.trim()) {
      e.preventDefault();
      resolver(texto.trim());
    }
  };

  // Lo agregado desde el catálogo va derecho al panel, para cargarle la cantidad.
  const agregarDesdeCatalogo = async (p) => {
    const r = await onAgregarDesdeCatalogo?.(p);
    if (r?.ok && !r.yaExistia && r.detalleId != null) setElegidoId(r.detalleId);
    return r;
  };

  // "Guardar y seguir": el pendiente que sigue en la lista.
  const alGuardar = () => elegir(siguientePendiente(visibles, producto));

  // Si se puede confirmar, y por qué no: la MISMA función que el teléfono.
  const cierre = cierreDeRecepcion({ items: item?.items, resumen });
  const { trabado, todoRevisado } = cierre;
  const bloqueo = motivoDelBloqueo(cierre);

  // El avance, contra el universo FÍSICO, igual que el teléfono: los no
  // declarados están resueltos por definición. Ver `RecepcionMovil`.
  const hechos = (resumen?.revisados ?? 0) + (resumen?.noDeclarados ?? 0);
  const total = resumen?.totalFisico ?? resumen?.totalRemito ?? 0;
  const pct = total > 0 ? Math.floor((hechos * 100) / total) : null;
  const pendientes = cierre.pendientes;

  const importeOriginal = item?.resumen?.importeOriginal ?? null;
  const importeCorregido = item?.resumen?.importeCorregido ?? null;
  const hayDiferenciaDeImporte =
    importeCorregido != null && item?.resumen?.diferenciaImporte != null && item.resumen.diferenciaImporte !== 0;

  const opcionesEstado = TABS.map((t) => ({ ...t, cantidad: CONTEO[t.clave](resumen || {}) }));

  // Anterior y siguiente, sobre lo que la tabla muestra.
  const i = producto ? visibles.findIndex((d) => d.id === producto.id) : -1;
  const anterior = i > 0 ? visibles[i - 1] : null;
  const siguiente = i >= 0 ? visibles[i + 1] || null : visibles.find((d) => d.id !== producto?.id) || null;

  const coincidir = async (d) => {
    setErrorDeFila("");
    const r = await onRevisar?.(cuerpoDeCoincide(d));
    if (r && r.ok === false) setErrorDeFila(r.error || "No se pudo guardar la revisión.");
  };

  const columnas = [
    { clave: "producto", titulo: "Producto", render: (d) => <CeldaProducto d={d} /> },
    { clave: "enviado", titulo: "Enviado", render: (d) => <CeldaEnviado l={lecturaDeLaLinea(d)} /> },
    { clave: "recibido", titulo: "Recibido", render: (d) => <CeldaRecibido l={lecturaDeLaLinea(d)} /> },
    { clave: "importe", titulo: "Importe", align: "der", render: (d) => <CeldaImporte l={lecturaDeLaLinea(d)} /> },
    {
      clave: "acciones",
      titulo: "",
      align: "der",
      render: (d) => (
        <CeldaAcciones
          d={d}
          l={lecturaDeLaLinea(d)}
          puedeRecibir={puedeRecibir}
          guardando={guardando}
          onCoincide={coincidir}
          onCorregir={elegir}
        />
      ),
    },
  ].map((c) => ({ ...c, thClassName: "text-xs2 uppercase tracking-wider sunmi-text-muted" }));

  return (
    <div className="space-y-3" data-recepcion-escritorio>
      {/* ── 1 · LA TRANSFERENCIA ─────────────────────────────────────────── */}
      <SunmiCard className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg2 font-bold sunmi-text-strong">Transferencia #{item?.id}</h1>
            <EstadoTransferenciaBadge estado={item?.estado} />
          </div>
          <p className="text-sm2 sunmi-text-muted">
            {item?.origen?.nombre} → {item?.destino?.nombre}
            {item?.fechaEnvio ? ` · enviada ${fmtFechaHoraAR(item.fechaEnvio)}` : ""}
            {item?.creadaPor?.nombre ? ` por ${item.creadaPor.nombre}` : ""}
          </p>
        </div>

        <div className="w-72 space-y-1.5" data-avance-recepcion>
          <div className="flex items-baseline gap-3">
            <span className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums font-semibold sunmi-text-strong">
                {hechos} / {total}
              </span>{" "}
              revisados
            </span>
            <span className={`text-sm2 ${pendientes > 0 ? "sunmi-text-accent" : "sunmi-text-success"}`}>
              {pendientes > 0 ? plural(pendientes, "pendiente", "pendientes") : "Sin pendientes"}
            </span>
          </div>
          <SunmiBarraDeAvance pct={pct} />
        </div>

        {importeOriginal != null && (
          <div>
            <div className="text-sm2 sunmi-text-muted">Importe enviado</div>
            <div className="text-xl2 font-bold tabular-nums sunmi-text-strong">{formatearMoneda(importeOriginal)}</div>
            {hayDiferenciaDeImporte ? (
              <div className="text-xs2 tabular-nums sunmi-text-warning">
                Corregido {formatearMoneda(importeCorregido)}
              </div>
            ) : null}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <SunmiButton
            color="slate"
            onClick={() => setMasAcciones(true)}
            aria-label={TITULO_MAS_ACCIONES}
            aria-haspopup="dialog"
            className="shrink-0"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </SunmiButton>
          {volver}
          {puedeRecibir && (
            <div className="flex flex-col items-center gap-1">
              <SunmiButton
                color="amber"
                onClick={confirmarRecepcion}
                disabled={trabado || confirmando}
                className="shrink-0 justify-center"
              >
                {confirmando ? "Confirmando..." : "Confirmar recepción"}
              </SunmiButton>
              {bloqueo ? <span className="text-xs2 sunmi-text-muted">{bloqueo}</span> : null}
            </div>
          )}
        </div>
      </SunmiCard>

      {/* El panel de cancelación lo dibuja la página; acá solo aparece. */}
      {panelCancelar}

      {/* ── 2 · LAS HERRAMIENTAS ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <SunmiCampoBusquedaVoz
              value={texto}
              onChange={onTexto}
              onVoz={onVoz}
              onKeyDown={alTeclear}
              placeholder={PLACEHOLDER_BUSCADOR}
              ariaLabel="Buscar producto de esta transferencia"
            />
          </div>
          {puedeRecibir && hayEscanerDisponible() && (
            <SunmiButton color="slate" onClick={() => setEscaneando(true)} className="shrink-0">
              Escanear
            </SunmiButton>
          )}
        </div>
        {/* Los cuatro filtros de siempre, con su número y su comportamiento,
            en fila en vez de 2×2: la variante propia de esta pantalla. */}
        <FiltroEstadoCompacto
          opciones={opcionesEstado}
          valor={filtro}
          onCambiar={onFiltrar}
          ariaLabel="Filtrar productos por estado"
        />
        <SunmiSelectAdv
          value={categoriaId == null ? "" : String(categoriaId)}
          onChange={(v) => onCategoria(v === "" ? null : v)}
          aria-label="Categoría"
          className="w-56 shrink-0"
        >
          {/* Los mismos textos y números que el desplegable del teléfono. */}
          <SunmiSelectOption value="">{`Todas · ${resumen?.totalFisico ?? resumen?.totalRemito ?? 0}`}</SunmiSelectOption>
          {categorias.map((c) => (
            <SunmiSelectOption key={c.id} value={String(c.id)}>
              {`${c.nombre} · ${c.cantidad}`}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </div>

      {/* ── EL CAMINO DE EXCEPCIÓN: NO FIGURA ───────────────────────────────
          Como en el teléfono: el aviso en una línea y, debajo, el catálogo del
          origen para tocarlo y agregarlo. Y el alta a mano, para lo que tampoco
          está en el catálogo. */}
      {(noFigura || aviso || avisoPropio) && (
        <SunmiAviso tono="warning">{noFigura ? MENSAJE_NO_FIGURA_CORTO : avisoPropio || aviso}</SunmiAviso>
      )}
      {noFigura && puedeRecibir && (
        <div className="space-y-1.5">
          <p className="text-sm2 font-semibold sunmi-text-muted">{ROTULO_CATALOGO}</p>
          {buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">Buscando en el catálogo…</p>
          )}
          {!buscandoCatalogo && catalogo.length === 0 && (
            <p className="text-sm2 sunmi-text-muted">Tampoco está en el catálogo del origen.</p>
          )}
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {catalogo.map((p) => (
              <FilaCatalogoRecepcion key={p.productoLocalId} p={p} onElegir={agregarDesdeCatalogo} agregando={guardando} />
            ))}
          </div>
          <SunmiButton color="slate" onClick={onAbrirAgregar}>
            {accionAgregar}
          </SunmiButton>
        </div>
      )}

      {errorDeFila && <SunmiAviso tono="danger">{errorDeFila}</SunmiAviso>}

      {/* ── 3 · LA LISTA Y EL PRODUCTO ───────────────────────────────────── */}
      {/* Dos tercios la lista, un tercio el panel: ~436 px a 1366, donde el
          diseño pide 400. Con un ancho fijo haría falta un token nuevo en
          `tailwind.config.js`, y esta pantalla no toca archivos compartidos. */}
      <div className="grid grid-cols-3 items-start gap-4">
        <div className="col-span-2 min-w-0 overflow-hidden rounded-xl2 border sunmi-border sunmi-bg-card">
          <SunmiTable
            columnas={columnas}
            filas={visibles}
            claveFila={(d) => firmaDeEdicion(d)}
            densidad="comoda"
            vacio={noFigura ? "" : "No hay productos que coincidan con este filtro."}
            onClickFila={(d) => elegir(d)}
            filaSeleccionada={(d) => d.id === producto?.id}
            // La elegida: fondo suave (el `selected` de la fila del kit) y el
            // borde izquierdo en el color de acción. Las demás llevan el mismo
            // ancho de borde en el color de siempre, para que elegir una fila no
            // corra su contenido.
            claseFila={(d) =>
              d.id === producto?.id ? "text-sm3 border-l-2 sunmi-border-accent" : "text-sm3 border-l-2 sunmi-border"
            }
            className="text-sm3"
          />
        </div>
        <div className="sticky top-3 min-w-0">
          <PanelDelProducto
            producto={producto}
            puedeRecibir={puedeRecibir}
            guardando={guardando}
            quitandoId={quitandoId}
            onRevisar={onRevisar}
            onQuitarLinea={onQuitarLinea}
            onGuardado={alGuardar}
            anterior={anterior}
            siguiente={siguiente}
            onElegir={elegir}
            todoRevisado={todoRevisado}
          />
        </div>
      </div>

      <MasAccionesRecepcion
        abierto={masAcciones}
        onCerrar={() => setMasAcciones(false)}
        item={item}
        puedeRecibir={puedeRecibir}
        puedeCancelar={puedeCancelar}
        abrirPanelCancelar={abrirPanelCancelar}
        imprimirTicket={imprimirTicket}
        onAbrirEscaner={() => setEscaneando(true)}
        forma="centrado"
      />

      {/* La cámara de ESTA pantalla: lo que lee va a su panel. */}
      <SunmiEscanerCodigoBarra
        abierto={escaneando}
        onCerrar={() => setEscaneando(false)}
        onCodigo={(codigo) => {
          setEscaneando(false);
          resolver(codigo, { soloCodigo: true });
        }}
        onSinCamara={(motivo) => {
          setEscaneando(false);
          setAvisoPropio(MENSAJES_SIN_CAMARA[motivo]);
        }}
        ayuda="Apuntá al código de barras del producto que tenés en la mano."
      />
    </div>
  );
}

/**
 * El siguiente pendiente DESPUÉS de `actual` en la lista que se ve, o el
 * primero si no hay ninguno después. Lo usa el panel al guardar.
 */
export function siguientePendiente(visibles = [], actual = null) {
  const pendientes = visibles.filter((d) => pasaFiltro(d, FILTRO.PENDIENTES) && d.id !== actual?.id);
  if (!actual) return pendientes[0] || null;
  const i = visibles.findIndex((d) => d.id === actual.id);
  return pendientes.find((d) => visibles.indexOf(d) > i) || pendientes[0] || null;
}
