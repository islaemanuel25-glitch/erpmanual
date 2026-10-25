// lib/transferencias/detalleRecibido.js
//
// EL DETALLE DE UNA TRANSFERENCIA YA RECIBIDA, MIRADO DESDE EL TELÉFONO: qué le
// pasó a cada línea, en qué filtro cae y en qué orden se lista.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// El detalle listaba los productos en el orden del remito con las corregidas
// mezcladas entre las demás: con 60 líneas y 6 diferencias, encontrar las 6 era
// recorrer las 60. El diseño V45 (Figma `EVJ2KvVCrY0oVSowfboymQ`, nodos 452:483
// y 452:587) las separa con cuatro filtros y le pone a cada tarjeta una
// etiqueta que dice qué pasó.
//
// Todo lo que DECIDE vive acá y no en el JSX, por lo mismo que `recepcionUI`:
// el componente dibuja y esto se prueba sin montar nada.
//
// ── LA DIFERENCIA NO SE CALCULA ACÁ ───────────────────────────────────────
//
// Sale de `lecturaFisicaDeLinea`, la misma que cuenta las diferencias del
// tablero. El "6 con diferencia" de la lista y las 6 tarjetas de este detalle
// leen la misma función.

import { difiereLinea, lecturaFisicaDeLinea } from "./lineasConDiferencia.js";
import { diaYNumeroAR, horaAR } from "../fechas/formatearFechaHora.js";

/** Los cuatro filtros, en el orden en que se dibujan: 2 × 2. */
export const FILTRO_DETALLE = Object.freeze({
  CON_DIFERENCIA: "conDiferencia",
  FALTANTES: "faltantes",
  SIN_DIFERENCIA: "sinDiferencia",
  TODOS: "todos",
});

// ── "FALTANTES", NO "DEVUELTOS" ──────────────────────────────────────────
//
// El segundo filtro se llamaba "Devueltos" y contaba `devolucionOrigen > 0`.
// Pero el endpoint calcula lo devuelto como `max(0, enviada − recibida)`: es el
// faltante con otro nombre. Probado en el celular con la 504, el filtro contaba
// exactamente lo mismo que los faltantes y su nombre prometía otra cosa. Ahora
// se llama por lo que cuenta y cuenta por la cantidad, no por la devolución.
export const TEXTO_FILTRO_DETALLE = Object.freeze({
  [FILTRO_DETALLE.CON_DIFERENCIA]: "Con diferencia",
  [FILTRO_DETALLE.FALTANTES]: "Faltantes",
  [FILTRO_DETALLE.SIN_DIFERENCIA]: "Sin diferencia",
  [FILTRO_DETALLE.TODOS]: "Todos",
});

/**
 * Qué le pasó a la línea. El orden es el de prioridad: gana la primera que aplica.
 *
 * No hay "devuelto": por lo de arriba, nunca dice nada que "Faltan N" o "No
 * vino" no digan ya.
 */
export const SUCESO_LINEA = Object.freeze({
  AGREGADO: "agregado",
  NO_VINO: "noVino",
  FALTAN: "faltan",
  SOBRAN: "sobran",
});

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * EL IMPORTE QUE VALE HOY UNA LÍNEA.
 *
 * El endpoint manda dos: `subtotal` es el del REMITO —lo que salió del
 * depósito, inmutable mientras alguien cuenta— y `subtotalRecibido` es lo que
 * vale lo que llegó, que sigue a la corrección y es el mismo número que el
 * servidor suma para el total corregido del documento.
 *
 * Vivía como función privada de `TablaDetalleTransferencia`, donde se escribió
 * para cerrar dos defectos —la #195, un agregado dibujado en $0,00 porque su
 * `subtotal` vale cero por definición, y la #191, una línea corregida de 4 a 10
 * que se quedaba en el importe del documento—. Se mudó acá sin cambios cuando el
 * detalle recibido del teléfono necesitó el mismo número: dos copias serían dos
 * importes el día que una cambie.
 *
 * Se lee siempre lo recibido cuando existe. `subtotalRecibido` llega en `null`
 * solo si nadie contó todavía, y ahí lo enviado ES lo que vale la línea.
 */
export function importeVigenteDeLinea(d) {
  return d?.subtotalRecibido == null ? d?.subtotal : d.subtotalRecibido;
}

/**
 * Qué le pasó a UNA línea de una transferencia recibida.
 *
 * Con diferencia es cualquiera de tres cosas: lo recibido no es lo enviado, no
 * vino nada, o el local la agregó al recibir. "No vino" y "agregado" ya son
 * diferencias físicas —0 contra N, N contra 0—; se nombran aparte porque la
 * etiqueta dice cuál de las dos fue.
 *
 * Faltante es recibido < enviado, con "no vino" adentro. Un agregado no: no
 * tenía enviado contra el cual faltar.
 *
 * `importeAnterior` es el del remito, y solo cuando el importe cambió. Un
 * agregado no tiene anterior: no venía en el remito, y "antes $ 0,00" diría que
 * existía y valía cero.
 */
export function sucesoDeLinea(d = {}) {
  const { enviada, recibida, diferencia } = lecturaFisicaDeLinea(d);
  const agregado = d.agregadoEnRecepcion === true;
  const faltante = !agregado && difiereLinea(diferencia) && diferencia < 0;

  let suceso = null;
  let cantidad = null;
  if (agregado) suceso = SUCESO_LINEA.AGREGADO;
  else if (recibida === 0) suceso = SUCESO_LINEA.NO_VINO;
  else if (difiereLinea(diferencia)) {
    suceso = diferencia < 0 ? SUCESO_LINEA.FALTAN : SUCESO_LINEA.SOBRAN;
    cantidad = Math.abs(diferencia);
  }

  const importe = importeVigenteDeLinea(d);
  const cambioElImporte =
    !agregado &&
    d.subtotalRecibido != null &&
    d.subtotal != null &&
    Math.abs(num(d.subtotalRecibido) - num(d.subtotal)) >= 0.005;

  return {
    suceso,
    cantidad,
    conDiferencia: suceso != null,
    faltante,
    enviada: agregado ? null : enviada,
    recibida,
    importe,
    importeAnterior: cambioElImporte ? d.subtotal : null,
  };
}

/**
 * ¿La línea —ya leída por `sucesoDeLinea`— entra en este filtro? Un faltante
 * entra también en "Con diferencia": los dos no se excluyen.
 */
export function pasaFiltroDetalle(filtro, s) {
  if (filtro === FILTRO_DETALLE.CON_DIFERENCIA) return s.conDiferencia;
  if (filtro === FILTRO_DETALLE.FALTANTES) return s.faltante;
  if (filtro === FILTRO_DETALLE.SIN_DIFERENCIA) return !s.conDiferencia;
  return true;
}

/**
 * Todas las líneas leídas, en orden, más el conteo de cada filtro.
 *
 * El orden es el del remito —el endpoint ya las manda así, por id— con los
 * agregados al final. El `sort` es estable, así que dentro de cada grupo se
 * conserva el orden de llegada.
 */
export function armarDetalleRecibido(items = []) {
  const lineas = (Array.isArray(items) ? items : [])
    .map((d) => ({ d, s: sucesoDeLinea(d) }))
    .sort((a, b) => Number(a.s.suceso === SUCESO_LINEA.AGREGADO) - Number(b.s.suceso === SUCESO_LINEA.AGREGADO));

  const conteos = {};
  for (const clave of Object.values(FILTRO_DETALLE)) {
    conteos[clave] = lineas.filter(({ s }) => pasaFiltroDetalle(clave, s)).length;
  }

  const agregados = lineas.filter(({ s }) => s.suceso === SUCESO_LINEA.AGREGADO).length;
  return { lineas, conteos, enviados: lineas.length - agregados, agregados };
}

/**
 * "Viernes 23 · 12:46 · 60 enviados · 1 agregado". Sin agregados, la última
 * parte no va.
 */
export function rotuloDelResumen({ fecha, enviados = 0, agregados = 0 } = {}) {
  const dia = diaYNumeroAR(fecha, { vacio: "" });
  const partes = [];
  if (dia) partes.push(dia.charAt(0).toUpperCase() + dia.slice(1), horaAR(fecha));
  partes.push(`${enviados} ${enviados === 1 ? "enviado" : "enviados"}`);
  if (agregados > 0) partes.push(`${agregados} ${agregados === 1 ? "agregado" : "agregados"}`);
  return partes.join(" · ");
}

/** "Recibida · 6 con diferencia", o "Recibida sin diferencias". */
export function estadoDelResumen(conDiferencia = 0) {
  return conDiferencia > 0 ? `Recibida · ${conDiferencia} con diferencia` : "Recibida sin diferencias";
}

/**
 * Lo que va después de "Motivo:", en una línea.
 *
 * Es el motivo cargado al recibir, con su detalle. Un agregado no tiene motivo
 * —el servidor no se lo pide desde el 2026-09-08, porque su procedencia ya queda
 * registrada con autor y fecha— así que ahí se dice eso, en una frase que entra
 * entera a 360 px. La versión anterior nombraba a la persona —"No venía en el
 * remito, lo agregó Ana Pérez"— y en el celular el recuadro la cortaba en "lo
 * agregó …": el dato que justificaba alargarla era justo el que no se veía.
 */
export const TEXTO_AGREGADO_POR_EL_LOCAL = "Lo agregó el local al recibir";

export function textoDelMotivo(d = {}) {
  if (d.agregadoEnRecepcion) return TEXTO_AGREGADO_POR_EL_LOCAL;
  const principal = (d.motivoPrincipal || "").trim();
  const detalle = (d.motivoDetalle || "").trim();
  if (principal || detalle) return [principal, detalle].filter(Boolean).join(" · ");
  return "sin cargar";
}

/** Abre en "Con diferencia" si hay alguna; si no, en "Todos". */
export function filtroInicialDetalle(conteos = {}) {
  return conteos[FILTRO_DETALLE.CON_DIFERENCIA] > 0 ? FILTRO_DETALLE.CON_DIFERENCIA : FILTRO_DETALLE.TODOS;
}
