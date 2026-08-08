// lib/proveedores/listas/gruposProducto.js
//
// LA PANTALLA DADA VUELTA: la unidad es el PRODUCTO del sistema, no la fila del
// archivo.
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
//
// El archivo de Arcor trae 917 filas y el sistema tiene 376 productos de Arcor.
// Paginar filas hace que el número grande sea el del proveedor, y 625 de esas
// filas son productos que este negocio no tiene: miden el catálogo de Arcor, no
// el trabajo. La pregunta de quien opera es "de MIS productos de Arcor, ¿cuáles
// ya actualicé y cuáles me faltan?", y esa se contesta contra el catálogo.
//
// ── LAS SITUACIONES SON CINCO, NO CUATRO ────────────────────────────────────
//
// Los cuatro grupos que pide la pantalla —actualizados, necesitan que decidas,
// siguen con el precio viejo, y todos— NO cubren el universo, y conviene verlo
// antes de construir encima:
//
//   Un producto cuya fila quedó LISTA PARA APLICAR, con una sola lectura creíble
//   y todavía sin aplicar, no está actualizado, no necesita que nadie decida
//   nada —el motor ya decidió— y tampoco sigue con el precio viejo por culpa de
//   la lista: la lista lo trajo.
//
// En la importación #3 ese grupo está VACÍO, porque ya se aplicó casi todo: los
// 376 se reparten en 279 + 7 + 90. Pero el día que se importe una lista nueva va
// a ser el grupo MÁS GRANDE, porque recién importado casi todo queda listo para
// aplicar en lote. O sea que el agujero no se ve hoy y se abre justo el día que
// más se usa la pantalla.
//
// Por eso acá las situaciones son cinco y EXCLUYENTES, con LISTO_PARA_APLICAR
// nombrado. Cómo se presenta —si es una card propia, si se suma a otra o si el
// botón de aplicar en lote lo absorbe— es una decisión de la pantalla, no de
// este módulo. Lo que este módulo garantiza es que ningún producto quede sin
// grupo, que es lo que permite verificar que la suma dé el universo.
//
// ── EL PRECIO VIEJO SE PARTE EN DOS PROBLEMAS DISTINTOS ─────────────────────
//
// Un producto que la lista no trajo puede ser dos cosas muy distintas, y se
// arreglan de maneras opuestas:
//
//   SIN_CODIGO  no tenemos guardado con qué código lo llama el proveedor. La
//               lista SÍ puede haberlo traído, pero no hubo forma de reconocerlo.
//               Se arregla vinculándolo a una fila del archivo.
//   NO_TRAIDO   sabemos su código y el proveedor no lo informó. Se arregla
//               decidiendo si sigue vigente, si se discontinuó o si el código
//               cambió.
//
// Módulo puro: sin BD, sin Next.

import { ESTADO_LINEA } from "./estados.js";

/** Las cinco situaciones de un producto frente a una importación. */
export const GRUPO_PRODUCTO = {
  ACTUALIZADO: "ACTUALIZADO",
  NECESITA_DECISION: "NECESITA_DECISION",
  LISTO_PARA_APLICAR: "LISTO_PARA_APLICAR",
  SIN_CODIGO: "SIN_CODIGO",
  NO_TRAIDO: "NO_TRAIDO",
};

/** Los dos que responden "sigue con el precio viejo". */
export const GRUPOS_PRECIO_VIEJO = [GRUPO_PRODUCTO.SIN_CODIGO, GRUPO_PRODUCTO.NO_TRAIDO];

export const TEXTO_GRUPO = {
  ACTUALIZADO: "Actualizados",
  NECESITA_DECISION: "Necesitan que decidas",
  LISTO_PARA_APLICAR: "Listos para aplicar",
  SIN_CODIGO: "Sin código de Arcor guardado",
  NO_TRAIDO: "Con código, pero la lista no lo trajo",
};

export const DETALLE_GRUPO = {
  ACTUALIZADO: "Su costo ya se escribió con esta lista.",
  NECESITA_DECISION: "El sistema no pudo resolverlos solo.",
  LISTO_PARA_APLICAR: "El sistema ya decidió: falta ejecutar la aplicación.",
  SIN_CODIGO: "No sabemos con qué código los llama el proveedor, así que la lista no pudo reconocerlos.",
  NO_TRAIDO: "Sabemos su código y el proveedor no los informó en esta lista.",
};

export const TONO_GRUPO = {
  ACTUALIZADO: "sunmi-text-success",
  NECESITA_DECISION: "sunmi-text-warning",
  LISTO_PARA_APLICAR: "sunmi-text-accent",
  SIN_CODIGO: "sunmi-text-danger",
  NO_TRAIDO: "sunmi-text-muted",
};

/** ¿Este grupo responde "sigue con el precio viejo"? */
export function esPrecioViejo(grupo) {
  return GRUPOS_PRECIO_VIEJO.includes(grupo);
}

/**
 * En qué situación está un producto.
 *
 * Recibe HECHOS, no los deduce, igual que `estados.js` y que `formaDelPanel`. El
 * orden de los chequeos es el de la prioridad: haber aplicado le gana a todo,
 * porque el costo ya se escribió y eso no se deshace por lo que digan las otras
 * filas del mismo producto.
 *
 * @param tieneFilaAplicada  alguna fila de esta importación ya se aplicó
 * @param tieneFilaEnCola    alguna fila está en "pendientes de decisión"
 * @param tieneFila          tiene alguna fila en esta importación
 * @param tieneCodigoActivo  tiene guardado un código de este proveedor
 */
export function grupoDeProducto({
  tieneFilaAplicada = false,
  tieneFilaEnCola = false,
  tieneFila = false,
  tieneCodigoActivo = false,
} = {}) {
  if (tieneFilaAplicada) return GRUPO_PRODUCTO.ACTUALIZADO;
  if (tieneFilaEnCola) return GRUPO_PRODUCTO.NECESITA_DECISION;
  if (tieneFila) return GRUPO_PRODUCTO.LISTO_PARA_APLICAR;
  // Sin ninguna fila: la lista no lo trajo. El motivo es lo que separa los dos.
  return tieneCodigoActivo ? GRUPO_PRODUCTO.NO_TRAIDO : GRUPO_PRODUCTO.SIN_CODIGO;
}

/**
 * ¿Un producto SIN CÓDIGO puede además tener filas?
 *
 * Sí: puede haber macheado por código de barras. Ese producto NO va a la card de
 * "sin código" —está actualizado o pendiente, según corresponda— y por eso la
 * partición de arriba pregunta por el código recién DESPUÉS de descartar que
 * tenga filas.
 *
 * Es una diferencia con la card de hoy, que cuenta 58 sobre todo el universo
 * incluyendo productos que la lista sí resolvió. Acá el número va a ser menor y
 * significa otra cosa: los que siguen con el precio viejo POR no tener código.
 */
export function sinCodigoSoloSiNoHayFila() {
  return true;
}

// ── El mismo criterio, en forma de `where` de Prisma ────────────────────────
//
// Segunda implementación de la misma regla, igual que `filtroDeLaCola`, y por la
// misma razón: Postgres no puede llamar a `grupoDeProducto`. Vive pegada a ella,
// cada rama nombra la que traduce, y el candado "el where de cada grupo dice lo
// mismo que grupoDeProducto" las compara sobre todas las combinaciones.

/**
 * El `where` de `ProductoBase` para un grupo.
 *
 * @param grupo            uno de GRUPO_PRODUCTO
 * @param universoWhere    el filtro del universo del proveedor, ya armado
 * @param importacionId    la importación que se está mirando
 * @param proveedorId      para saber si tiene código guardado
 * @param filtroCola       el `where` de FILA que define la cola (`filtroDeLaCola`)
 */
export function whereDelGrupo(grupo, { universoWhere = {}, importacionId, proveedorId, filtroCola } = {}) {
  const conAplicada = { filasImportacionLista: { some: { importacionId, aplicada: true } } };
  const conFila = { filasImportacionLista: { some: { importacionId } } };
  const enCola = { filasImportacionLista: { some: { importacionId, ...filtroCola } } };
  const conCodigo = { codigosProveedor: { some: { proveedorId, activo: true } } };
  const sinFila = { filasImportacionLista: { none: { importacionId } } };

  switch (grupo) {
    // `if (tieneFilaAplicada)`
    case GRUPO_PRODUCTO.ACTUALIZADO:
      return { ...universoWhere, ...conAplicada };

    // `if (tieneFilaEnCola)` — y todavía no aplicada.
    case GRUPO_PRODUCTO.NECESITA_DECISION:
      return { ...universoWhere, NOT: conAplicada, ...enCola };

    // `if (tieneFila)` — el resto de las que están en el archivo.
    case GRUPO_PRODUCTO.LISTO_PARA_APLICAR:
      return { ...universoWhere, NOT: [conAplicada, enCola], ...conFila };

    // Sin filas, con código guardado.
    case GRUPO_PRODUCTO.NO_TRAIDO:
      return { ...universoWhere, ...sinFila, ...conCodigo };

    // Sin filas y sin código.
    case GRUPO_PRODUCTO.SIN_CODIGO:
      return { ...universoWhere, ...sinFila, NOT: conCodigo };

    default:
      return { ...universoWhere };
  }
}

/**
 * ¿Los cinco grupos cubren el universo?
 *
 * Se informa en vez de suponerse, igual que `resumenDelSistema.cierra`. Un
 * resumen que no cierra tiene que decirlo: esconder la diferencia es lo que hace
 * que un número lindo tape un producto que nadie miró.
 */
export function coberturaDeGrupos({ universo = 0, porGrupo = {} } = {}) {
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const suma = Object.values(GRUPO_PRODUCTO).reduce((acc, g) => acc + n(porGrupo[g]), 0);
  const u = n(universo);
  return { universo: u, suma, cierra: u === suma, faltante: u - suma };
}

export { ESTADO_LINEA };
