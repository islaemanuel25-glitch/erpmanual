// lib/productos/controlesDesdePrisma.js
//
// EL PUENTE entre lo que devuelve Prisma y la clasificación pura.
//
// ── POR QUÉ ESTA CAPA EXISTE ────────────────────────────────────────────────
//
// Los cuatro controles NO se pueden expresar como un `where` de Prisma, y no es
// por falta de ingenio: dependen del precio y el costo EFECTIVOS, que salen de
// mergear `ProductoBase` con el `ProductoLocal` de la ubicación. Un producto
// puede tener margen en la ficha y un override sin margen en el local —o al
// revés—, y la respuesta correcta sale recién después de mergear.
//
// El issue lo anticipa y decide: consultar los campos necesarios y clasificar con
// las funciones de dominio, priorizando una sola semántica antes que una consulta
// "ingeniosa" distinta a la lógica del ERP.
//
// Este archivo hace UNA cosa: llevar una fila de Prisma a la forma que
// `controlesCalidad` espera. Ni el contador ni el filtro arman esa forma por su
// cuenta — si lo hicieran, un campo que uno mergea y el otro no volvería a
// separar los dos números.
//
// ── EL SELECT MÍNIMO ESTÁ ACÁ, Y NO ES UN DETALLE ──────────────────────────
//
// `SELECT_CONTROLES` es lo que hay que pedirle a Prisma para poder clasificar.
// Vive junto a la función que lo consume porque un select incompleto no falla:
// devuelve `undefined` en el campo que falta y la clasificación contesta con
// confianza una respuesta equivocada. Ya pasó en este repo con el fiambre de
// pieza fija — un `select` a medias hizo que un predicado dijera "no es fiambre"
// y el importe saliera mal en dos pantallas.

import { marcadoPor, contarControles, IDS_CONTROL } from "./controlesCalidad";
import { marcadoPorPresentacion, contarPresentaciones } from "./presentaciones";

/**
 * Lo mínimo que hay que traer de `ProductoBase` para poder clasificar.
 * Se pasa como `select` o se comprueba contra un `include`.
 */
export const SELECT_CONTROLES_BASE = {
  id: true,
  precio_costo: true,
  precio_venta: true,
  margen: true,
  modalidad: true,
  unidad_medida: true,
  factor_pack: true,
  pesoReferenciaKg: true,

  // ── LOS CINCO DE LAS PRESENTACIONES ──────────────────────────────────────
  //
  // No los necesita ninguno de los cuatro controles de "Para revisar": los pide
  // la clasificación de presentaciones, que viaja en la MISMA pasada de filas
  // para no abrir una segunda consulta ni ocho.
  //
  // Los cuatro primeros son exactamente lo que `escalaDeVentaDe` lee, y ese
  // detalle no es negociable: `esFiambreFijo` mira `modoVentaDeposito` PRIMERO y
  // solo cae a `pesoEsFijo` cuando el campo llega `undefined`. O sea que un
  // select a medias no da error — cambia la respuesta. Es el mismo defecto que
  // este archivo ya cuenta en su encabezado.
  //
  // `es_combo` va porque un combo se vende por unidad y no se compra, y eso no
  // se puede deducir de sus otras columnas: la ficha de un combo tiene su propia
  // `unidad_medida`, que el POS ignora.
  modo_envio: true,
  modoCompraProveedor: true,
  pesoEsFijo: true,
  modoVentaDeposito: true,
  es_combo: true,
};

/** Lo mínimo del `ProductoLocal` de la ubicación. */
export const SELECT_CONTROLES_LOCAL = {
  id: true,
  localId: true,
  precio_costo: true,
  precio_venta: true,
  margen: true,
  reglaPrecio: true,
  recargoFijoUnidad: true,
  precioRevisadoAt: true,
  activo: true,
};

/**
 * ── EL TECHO, Y EL ORDEN CON EL QUE SE CORTA ───────────────────────────────
 *
 * Los cuatro controles se clasifican EN MEMORIA —dependen de precios efectivos
 * que Prisma no puede mergear en un `where`—, así que hay que acotar cuántas
 * filas se traen. Ese techo lo aplican DOS consultas: el contador de las cards y
 * el filtro del listado.
 *
 * ── POR QUÉ EL ORDEN NO ES UN DETALLE ─────────────────────────────────────
 *
 * `take` sin `orderBy` le deja a Postgres elegir qué filas devuelve. No es
 * aleatorio, pero tampoco es estable: un plan distinto, un índice recién usado o
 * dos peticiones concurrentes pueden traer conjuntos distintos de 5.000.
 *
 * Con menos de 5.000 productos da igual —vienen todas—. Por encima del techo no:
 * el contador y el filtro estarían mirando dos muestras diferentes del mismo
 * catálogo, así que las cards podrían decir "+37" sobre una lista de "+41" sin
 * que ninguno de los dos esté mal. Los dos números serían límites inferiores
 * ciertos de poblaciones distintas, que es la clase de discrepancia que no se
 * puede explicar mirando la pantalla.
 *
 * `id asc` es único, indexado y no cambia con los datos, así que dos peticiones
 * cortan por el mismo lugar.
 *
 * ── Y POR QUÉ VIVEN ACÁ Y NO EN CADA RUTA ─────────────────────────────────
 *
 * Estaban los dos escritos en cada archivo: `const MAX_CONTROL = 5000` aparecía
 * dos veces y el orden no aparecía en ninguna. Un techo definido en dos lugares
 * es un techo que un día va a valer dos cosas distintas, y ahí vuelve el mismo
 * problema por la otra puerta. Un candado exige que las dos rutas usen esto.
 */
export const TECHO_CONTROL = 5000;

/** El orden con el que se corta. Único, indexado y estable. */
export const ORDEN_DEL_TECHO = { id: "asc" };

/**
 * Los argumentos de corte, para que las dos consultas no puedan diferir.
 *
 * `take` va con el +1 adentro: es lo que permite distinguir "trajo justo el
 * techo" de "hay más". Si cada ruta lo sumara por su cuenta, una podría
 * olvidarse y el flag de truncado nunca se prendería.
 */
export const opcionesDelTecho = () => ({
  take: TECHO_CONTROL + 1,
  orderBy: ORDEN_DEL_TECHO,
});

/** ¿Esta consulta se pasó del techo? Recibe las filas TAL CUAL volvieron. */
export const seTrunco = (filas) => filas.length > TECHO_CONTROL;

/** Las filas que se clasifican: nunca más que el techo. */
export const dentroDelTecho = (filas) =>
  seTrunco(filas) ? filas.slice(0, TECHO_CONTROL) : filas;

/** El primer valor que no es null ni undefined. */
const efectivo = (...valores) => valores.find((v) => v !== null && v !== undefined) ?? null;

/**
 * Lleva una fila de Prisma —base + su ProductoLocal— a la forma que la
 * clasificación espera.
 *
 * ── QUÉ SE MERGEA Y QUÉ NO ─────────────────────────────────────────────────
 *
 * Precio, costo, margen, regla y recargo son POR UBICACIÓN: el override gana y,
 * si está en null, se hereda de la ficha. Es la misma regla que usan el listado,
 * el editor y el POS.
 *
 * La modalidad, la unidad de medida, el factor de pack y el peso de referencia
 * son de la FICHA y no tienen override: un producto no es un servicio en un local
 * y una mercadería en otro.
 *
 * `precioRevisadoAt` sale SOLO del local y nunca se hereda: revisar el precio de
 * una ubicación no dice nada sobre el de otra. Si el ProductoLocal no existe,
 * queda `null` —sin evidencia—, que es la verdad.
 */
export function filaParaControles(base, local = null) {
  return {
    id: base?.id ?? null,
    localId: local?.localId ?? null,
    productoLocalId: local?.id ?? null,

    // Efectivos de la ubicación.
    precio_costo: efectivo(local?.precio_costo, base?.precio_costo),
    precio_venta: efectivo(local?.precio_venta, base?.precio_venta),
    margen: efectivo(local?.margen, base?.margen),

    // ── LA REGLA DE PRECIO VIVE SOLO EN EL LOCAL ──────────────────────────
    //
    // `reglaPrecio` y `recargoFijoUnidad` son columnas de `ProductoLocal` y NO
    // existen en `ProductoBase`: no hay de dónde heredarlas. Sin ProductoLocal la
    // respuesta es MARGEN_PORCENTUAL, que es el default de la columna y lo mismo
    // que resuelve `mergeBaseLocalToUi` — si acá se contestara otra cosa, el
    // control diría "falta regla" sobre un producto que la pantalla muestra con
    // margen.
    //
    // Esto lo encontró la sonda contra Postgres, no el build ni los candados: el
    // `select` original las pedía en la base y Prisma contestó
    // `Unknown field reglaPrecio`.
    reglaPrecio: local?.reglaPrecio ?? "MARGEN_PORCENTUAL",
    recargoFijoUnidad: local?.recargoFijoUnidad ?? null,

    // De la ficha, sin override.
    modalidad: base?.modalidad ?? null,
    unidad_medida: base?.unidad_medida ?? null,
    factor_pack: base?.factor_pack ?? null,
    pesoReferenciaKg: base?.pesoReferenciaKg ?? null,

    // ── LOS CINCO DE LAS PRESENTACIONES, TAMBIÉN DE LA FICHA ───────────────
    //
    // Ninguno tiene override por ubicación: un producto no se compra por pack en
    // un local y por kilo en otro, y cómo sale del mostrador lo decide
    // `escalaDeVentaDe` combinando estos campos con `esDeposito` — que es un dato
    // de la ubicación, no una columna.
    //
    // `modo_envio` viaja CRUDO, en null si en la base está en null. Rellenarlo
    // acá con un default sería exactamente lo que `escalaDeVenta.js` advierte en
    // su encabezado: el mapper lo completa con "MIXTO" y esta función con
    // `defaultModoEnvio`, y en los 120 productos donde el campo es null las dos
    // respuestas difieren. La que anticipa al POS es la segunda.
    modo_envio: base?.modo_envio ?? null,
    modoCompraProveedor: base?.modoCompraProveedor ?? null,
    pesoEsFijo: base?.pesoEsFijo ?? null,
    modoVentaDeposito: base?.modoVentaDeposito ?? null,
    es_combo: base?.es_combo ?? false,

    // Solo del local, sin herencia.
    precioRevisadoAt: local?.precioRevisadoAt ?? null,
  };
}

/**
 * Clasifica un conjunto de filas de Prisma y devuelve el conteo por control.
 *
 * @param {Array} rows   filas de ProductoBase con `locales` (0 o 1 elemento)
 * @param {Date} [ahora]
 */
export function contarDesdePrisma(rows = [], ahora = new Date()) {
  return contarControles(
    rows.map((p) => filaParaControles(p, p.locales?.[0] ?? null)),
    ahora
  );
}

/**
 * ¿Esta fila de Prisma está marcada por este control?
 *
 * La usa el listado para filtrar. Es la MISMA función que alimenta el conteo, así
 * que el número de la card y el total del listado no se pueden separar.
 */
export function filaMarcadaPor(control, row, ahora = new Date()) {
  return marcadoPor(control, filaParaControles(row, row.locales?.[0] ?? null), ahora);
}

/**
 * ── LAS PRESENTACIONES, SOBRE LAS MISMAS FILAS ────────────────────────────
 *
 * Estas dos son las gemelas de `contarDesdePrisma` y `filaMarcadaPor`, y viven
 * acá por el mismo motivo que aquéllas: para que el contador y el filtro mergeen
 * la fila con LA MISMA función. Si el listado armara la suya, un campo que uno
 * mergea y el otro no volvería a separar los dos números.
 *
 * Reciben `esDeposito` porque la presentación de VENTA depende de la ubicación
 * —un fiambre sale por pieza en el depósito y por kilo en un local— y no de la
 * fila. La de compra no lo usa, y por eso `presentacionDeCompra` ni lo recibe.
 */
export function contarPresentacionesDesdePrisma(rows = [], esDeposito = false) {
  return contarPresentaciones(
    rows.map((p) => filaParaControles(p, p.locales?.[0] ?? null)),
    esDeposito
  );
}

/** ¿Esta fila de Prisma cae en esta presentación? La usa el listado para filtrar. */
export function filaMarcadaPorPresentacion(id, row, esDeposito = false) {
  return marcadoPorPresentacion(id, filaParaControles(row, row.locales?.[0] ?? null), esDeposito);
}

export { IDS_CONTROL };
