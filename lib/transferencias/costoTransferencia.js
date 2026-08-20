// lib/transferencias/costoTransferencia.js
//
// Normalización de LECTURA del costo de un TransferenciaDetalle. Puro: no
// consulta Prisma ni depende de Next. Fuente única de la fórmula para las cuatro
// superficies que valorizan transferencias (detalle, listar, pdf, pdf-recepcion).
//
// EL PROBLEMA
//
// `TransferenciaDetalle.precioCosto` es un snapshot literal de
// `ProductoLocal.precio_costo` congelado al enviar (crearTransferencia). Ese
// campo está en la ESCALA COMERCIAL DEL PRODUCTO:
//
//   unidad_medida = unidad          → precio por unidad
//   unidad_medida = pack | cajon
//     con factor_pack > 1           → precio por BULTO
//
// Pero `cantidad` y `recibido` están en la escala de `unidadEnviada`. Las dos
// escalas coinciden solo cuando se envía por BULTO. Cuando se envía por UNIDAD
// un producto con presentación de pack, el documento multiplicaba unidades
// físicas por un precio de bulto y sobrevalorizaba por el factor:
//
//   9 de Oro Azucaradas, pack x28, 5 unidades recibidas
//     antes:  5 × 26.880 = 134.400
//     ahora:  5 ×    960 =   4.800
//
// POR QUÉ EN LECTURA Y NO AL ESCRIBIR
//
// Normalizar al crear el detalle dejaría la columna con DOS significados —escala
// de producto en las filas viejas, escala de envío en las nuevas— sin ningún
// discriminador para distinguirlas, lo que obligaría a una migración con
// backfill. Normalizando en lectura el campo conserva un único significado y las
// filas históricas se corrigen solas, sin tocar un solo dato persistido.
//
// LÍMITE CONOCIDO
//
// La normalización asume que el costo congelado estaba en la escala comercial
// vigente del producto. En filas muy viejas esa suposición puede no valer: si en
// su momento se guardó un costo ya unitario en un producto con presentación de
// pack, esta función lo dividirá de más. No hay forma de detectarlo por fila —no
// existe marca de escala— y NO se agrega ninguna excepción por id, producto ni
// fecha. Ver el informe de la Etapa de valorización para los casos detectados.

// ── EL CASO QUE FALTABA: EL FIAMBRE DE PIEZA FIJA ────────────────────────────
//
// Incidente del 2026-08-19, transferencia #97. "Papas Congeladas" tiene
// `unidad_medida = kg`, así que caía en la rama de "presentación unitaria: el
// costo ya es por unidad" y volvía tal cual. Pero ese costo está POR KILO y la
// cantidad de un fiambre de pieza fija enviado desde el depósito está EN PIEZAS:
// el documento multiplicaba pesos-por-kilo por cantidad-de-piezas.
//
//   Papas Congeladas, 2,5 kg por pieza, 2 piezas
//     antes:  2 × 3.800 =  7.600
//     ahora:  2 × 9.500 = 19.000   ← lo que el POS del depósito cobró por lo mismo
//
// Y NO SIEMPRE VA PARA ABAJO, que es lo que lo hacía difícil de ver: el error
// sigue al peso de la pieza. Con más de un kilo valorizaba de menos; con menos de
// un kilo —QUETH CHISITOS 400G pesa 0,400— valorizaba de MÁS. Con peso 1,000 no
// se notaba. Por eso el desvío neto de las 43 transferencias afectadas parecía
// chico: los dos signos se compensaban.
//
// LA CUENTA NO SE ESCRIBE ACÁ. Sale de `valorEnLaEscalaDeVenta`, que es la misma
// que usan el POS —`buscar-producto:302`— y la tarjeta del catálogo. Un tercer
// lugar que multiplique costo por peso es un tercer lugar que puede divergir.
//
// LA UBICACIÓN IMPORTA Y SE PASA, NO SE ASUME. En el depósito ese stock se cuenta
// en piezas; en un local, en kilos. Hoy las 43 transferencias salen del depósito
// —comprobado, y no existe ninguna transferencia con origen distinto—, pero si
// mañana un local transfiere a otro, la cantidad estaría en kg y dividir por la
// pieza valorizaría mal en silencio. Por eso el llamador dice de dónde sale.

import { esFiambreFijoEnUbicacion } from "../conversiones/stock.js";
import { valorEnLaEscalaDeVenta, ESCALA_PIEZA } from "../precios/escalaDeVenta.js";

/** Códigos estables de error. */
export const ERRORES_COSTO = {
  UNIDAD_DESCONOCIDA: "UNIDAD_ENVIADA_DESCONOCIDA",
  COSTO_INVALIDO: "COSTO_INVALIDO",
  FACTOR_INVALIDO: "FACTOR_PACK_INVALIDO",
  ORIGEN_FALTANTE: "ORIGEN_FALTANTE",
  PRODUCTO_INCOMPLETO: "PRODUCTO_INCOMPLETO",
};

/**
 * Las columnas de `ProductoBase` sin las cuales NO se puede saber si un producto
 * es fiambre de pieza fija. Están acá y no sueltas en cada ruta porque el que
 * decide qué hace falta es el predicado, no el que escribe el `select`.
 *
 * `esProductoFiambre` mira las tres primeras; `esFiambreFijo`, además la cuarta.
 */
export const COLUMNAS_DEL_FIAMBRE = [
  "unidad_medida",
  "modoCompraProveedor",
  "pesoReferenciaKg",
  "modoVentaDeposito",
];

/**
 * Presentaciones cuyo `precio_costo` se carga por bulto.
 * Son los valores REALES del enum `UnidadMedida` (unidad | pack | cajon | kg);
 * no se incluyen "caja" ni "carton", que no existen en la base.
 */
export const UNIDADES_ESCALA_BULTO = ["pack", "cajon"];

export const UNIDADES_ENVIO = ["UNIDAD", "BULTO"];

function error(code, message) {
  const e = new Error(message);
  e.code = code;
  e.esErrorCostoTransferencia = true;
  return e;
}

// ── EL ORIGEN ES OBLIGATORIO, Y ESTO LANZA SI FALTA ─────────────────────────
//
// Vive acá, con la fórmula, y no en `agregadosPeriodo.js` donde nació: es la
// función que lo NECESITA, y tenerlo en dos lugares sería tener dos criterios
// que un día difieren. `agregadosPeriodo` lo importa de acá.
//
// Tenía default `false` y se escapó TRES VECES. Las tres el resultado fue el
// mismo —un importe de plata mal calculado en una pantalla— y las tres pasó en
// silencio, porque un default hace que olvidarse se vea igual que decidir.
//
// La tercera fue la peor y enseña la parte que faltaba: el default se sacó de
// `agregadosPeriodo` pero NO de acá, así que la red tenía un agujero del tamaño
// de esta función.
export function exigirOrigen(opciones, quien) {
  if (!opciones || typeof opciones.origenEsDeposito !== "boolean") {
    throw error(
      ERRORES_COSTO.ORIGEN_FALTANTE,
      `${quien}: falta origenEsDeposito. Sin saber de dónde sale la mercadería no se ` +
        `puede valorizar el fiambre de pieza fija: en el depósito la cantidad está en ` +
        `piezas y su costo, por kilo. Pasá { origenEsDeposito: origenEsDepositoDe(t) }.`
    );
  }
  return opciones.origenEsDeposito;
}

/**
 * El origen de una transferencia, exigiendo que la columna VENGA.
 *
 * ── POR QUÉ NO ALCANZA CON `t.origen?.es_deposito === true` ─────────────────
 *
 * Porque ese `=== true` convierte `undefined` en `false`, y `undefined` es lo
 * que devuelve Prisma cuando el `select` no pidió la columna. O sea: un select
 * incompleto no producía un error, producía **una respuesta falsa** — y como
 * `false` es un booleano perfectamente válido, `exigirOrigen` lo dejaba pasar.
 *
 * Ésa fue la forma exacta del defecto de la #97 en la vista por destino: el
 * origen no faltó, llegó mentido. Un control que exige "que haya un booleano" no
 * puede distinguir "no es depósito" de "no te lo traje".
 *
 * Acá se distinguen: `undefined` lanza, `true` y `false` pasan.
 */
export function origenEsDepositoDe(transferencia, quien = "origenEsDepositoDe") {
  const valor = transferencia?.origen?.es_deposito;
  if (typeof valor !== "boolean") {
    throw error(
      ERRORES_COSTO.ORIGEN_FALTANTE,
      `${quien}: la transferencia no trae origen.es_deposito (llegó ${valor === undefined ? "undefined" : String(valor)}). ` +
        `Agregá es_deposito al select del origen. Sin esa columna el importe sale como si ` +
        `nada saliera del depósito, y el fiambre de pieza fija se valoriza por kilo.`
    );
  }
  return valor;
}

/** Number finito a partir de number | string | Decimal de Prisma. */
function aNumero(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean" || Array.isArray(valor)) return null;
  const n =
    typeof valor === "number"
      ? valor
      : typeof valor === "object" && typeof valor.toString === "function"
      ? Number(String(valor).trim())
      : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * ¿El `precio_costo` de este producto está cargado por bulto?
 * Misma condición que `esBultoConPack` en pos-ventas/buscar-producto: depende de
 * la PRESENTACIÓN (unidad_medida), no de `modo_envio`. Un pack con SOLO_UNIDAD
 * igual tiene el costo cargado por bulto — es justamente el caso que fallaba.
 */
export function costoEstaEnEscalaDeBulto({ unidadMedida, factorPack } = {}) {
  const um = String(unidadMedida || "").toLowerCase();
  if (!UNIDADES_ESCALA_BULTO.includes(um)) return false;
  const f = aNumero(factorPack);
  return f !== null && f > 1;
}

/**
 * Exige que el producto traiga las columnas con las que se decide si es fiambre
 * de pieza fija.
 *
 * ── ESTA ES LA DEFENSA QUE FALTABA, Y LAS OTRAS DOS NO LA CUBREN ────────────
 *
 * El origen obligatorio y `origenEsDepositoDe` miran de dónde SALE la
 * mercadería. El defecto de la #97 en la lista no era ése: el origen llegaba
 * perfecto y lo que llegaba a medias era el PRODUCTO, porque el `select` pedía
 * cuatro columnas de `base` y el predicado necesita siete. Ninguna defensa sobre
 * el origen podía verlo.
 *
 * ── POR QUÉ SE MIRA `undefined` Y NO FALSY ──────────────────────────────────
 *
 * Es toda la diferencia. `pesoEsFijo: false`, `pesoReferenciaKg: null` y
 * `modoVentaDeposito: "PESO"` son valores REALES de un producto que no es
 * fiambre, y tienen que pasar. `undefined` es lo único que significa "esta
 * columna no se pidió". Prisma no devuelve `undefined` para una columna que
 * existe, así que la distinción es confiable.
 *
 * Se exige solo cuando la presentación es `kg`, que es la única donde la rama
 * del fiambre puede aplicar. Un pack o una unidad no la tocan nunca, y hacer
 * pedir cuatro columnas a media aplicación por un caso que no existe sería la
 * clase de control que estorba todos los días y se termina apagando.
 */
export function exigirProductoCompleto(base, quien) {
  const um = String(base?.unidad_medida || "").toLowerCase();
  if (um !== "kg") return;

  const faltantes = COLUMNAS_DEL_FIAMBRE.filter(
    (col) => base?.[col] === undefined
  );
  if (faltantes.length === 0) return;

  throw error(
    ERRORES_COSTO.PRODUCTO_INCOMPLETO,
    `${quien}: el producto llega sin ${faltantes.join(", ")}. Es una presentación en ` +
      `kg, así que puede ser fiambre de pieza fija — y sin esas columnas el predicado ` +
      `contesta que no lo es y el importe sale por kilo donde el depósito cuenta piezas. ` +
      `Agregalas al select de base.`
  );
}

/**
 * Costo del detalle expresado en la MISMA escala que `unidadEnviada`.
 *
 *   unidadEnviada = "UNIDAD" + presentación de bulto → costo / factorPack
 *   unidadEnviada = "UNIDAD" + presentación unitaria → costo tal cual
 *   unidadEnviada = "BULTO"                          → costo tal cual
 *
 * Nunca convierte dos veces: es una única división, y solo cuando las escalas
 * difieren.
 *
 * @param {object} args
 * @param {number|string|object} args.precioCosto  TransferenciaDetalle.precioCosto
 * @param {string} args.unidadEnviada              "UNIDAD" | "BULTO"
 * @param {string} args.unidadMedida               ProductoBase.unidad_medida
 * @param {number|null} args.factorPack            ProductoBase.factor_pack
 * @returns {number} costo por unidad de `unidadEnviada`
 * @throws {Error} con `.code` en ERRORES_COSTO
 */
export function resolverCostoTransferencia({
  precioCosto,
  unidadEnviada,
  unidadMedida,
  factorPack,
  // Campos del fiambre de pieza fija. Vienen del ProductoBase, igual que los dos
  // de arriba; se listan sueltos y no como objeto para no cambiarle la forma a
  // los llamadores que ya andan.
  pesoEsFijo = null,
  pesoReferenciaKg = null,
  modoVentaDeposito = null,
  modoCompraProveedor = null,
  // De dónde SALE la mercadería. Sin esto no se puede saber si la cantidad está
  // en piezas o en kilos. NO tiene default: ver `exigirOrigen`.
  origenEsDeposito,
} = {}) {
  exigirOrigen({ origenEsDeposito }, "resolverCostoTransferencia");
  const costo = aNumero(precioCosto);
  if (costo === null) {
    throw error(
      ERRORES_COSTO.COSTO_INVALIDO,
      "precioCosto inválido: se esperaba un número"
    );
  }

  const unidad = String(unidadEnviada || "").trim().toUpperCase();
  if (!UNIDADES_ENVIO.includes(unidad)) {
    throw error(
      ERRORES_COSTO.UNIDAD_DESCONOCIDA,
      `unidadEnviada desconocida: ${unidadEnviada}. Se esperaba UNIDAD o BULTO`
    );
  }

  // ── PIEZA FIJA: VA PRIMERO, porque su `unidad_medida` es kg y si no caería en
  // la rama de "el costo ya es por unidad" y volvería sin convertir. Es
  // exactamente lo que pasaba.
  // `pesoReferenciaKg` va SÍ o SÍ en este objeto: `esProductoFiambre` exige que
  // sea mayor que cero, así que omitirlo hace que el predicado diga que no y la
  // conversión no ocurra — en silencio y con todo lo demás bien puesto.
  const base = {
    unidad_medida: unidadMedida,
    modoCompraProveedor,
    pesoReferenciaKg,
    pesoEsFijo,
    modoVentaDeposito,
  };
  if (unidad === "UNIDAD" && esFiambreFijoEnUbicacion(base, origenEsDeposito === true)) {
    const porPieza = valorEnLaEscalaDeVenta({
      escala: ESCALA_PIEZA,
      valor: costo,
      pesoReferenciaKg,
    });
    // Sin peso de referencia no hay conversión posible. Se devuelve el costo
    // como está en vez de inventar una, igual que hace la rama del factor.
    return porPieza === null ? costo : porPieza;
  }

  // Por bulto las escalas ya coinciden: el costo es el del bulto.
  if (unidad === "BULTO") return costo;

  const um = String(unidadMedida || "").toLowerCase();
  if (!UNIDADES_ESCALA_BULTO.includes(um)) {
    // Presentación unitaria (o kg): el costo ya es por unidad. `factor_pack`
    // nulo, 0 o 1 acá es irrelevante, no se divide nada.
    return costo;
  }

  // Presentación de bulto: hace falta el factor para bajar a unidad. Solo se
  // valida acá, que es donde efectivamente se divide.
  if (factorPack === null || factorPack === undefined) {
    // Sin factor no hay conversión posible; el costo queda como está en vez de
    // inventar una. No se rompe la lectura del documento.
    return costo;
  }
  const f = aNumero(factorPack);
  if (f === null || f <= 0) {
    throw error(
      ERRORES_COSTO.FACTOR_INVALIDO,
      `factor_pack inválido (${factorPack}) para una presentación "${um}": no se puede convertir el costo a unidad`
    );
  }
  if (f === 1) return costo; // pack de 1: no hay escala de bulto que bajar.

  return costo / f;
}

/**
 * Cantidad que valoriza el documento.
 *
 *   sin recepción cargada (recibido null) → la ENVIADA
 *   con recepción cargada                → la RECIBIDA, incluido 0
 *
 * Explícito con `== null`: usar truthiness haría que un 0 registrado se
 * valorizara como si hubiera llegado todo.
 */
export function cantidadAValorizar({ cantidad, recibido } = {}) {
  const env = aNumero(cantidad) ?? 0;
  if (recibido === null || recibido === undefined) return env;
  return aNumero(recibido) ?? 0;
}

/**
 * Costo normalizado + subtotal de un detalle, en un solo lugar, para que las
 * cuatro superficies no puedan divergir.
 *
 * @param {object} detalle  { cantidad, recibido, unidadEnviada, precioCosto }
 * @param {object} base     ProductoBase { unidad_medida, factor_pack }
 * @param {object} [opts]
 * @param {"VALORIZAR"|"ENVIADA"} [opts.cantidadModo="VALORIZAR"]
 *   VALORIZAR = recibido si hay recepción cargada, si no la enviada.
 *   ENVIADA   = siempre la enviada (remito de envío).
 */
export function valorizarDetalle(
  detalle = {},
  base = {},
  { cantidadModo = "VALORIZAR", origenEsDeposito } = {}
) {
  exigirOrigen({ origenEsDeposito }, "valorizarDetalle");
  exigirProductoCompleto(base, "valorizarDetalle");
  const costoUnitario = resolverCostoTransferencia({
    precioCosto: detalle.precioCosto,
    unidadEnviada: detalle.unidadEnviada,
    unidadMedida: base?.unidad_medida,
    factorPack: base?.factor_pack,
    pesoEsFijo: base?.pesoEsFijo,
    pesoReferenciaKg: base?.pesoReferenciaKg,
    modoVentaDeposito: base?.modoVentaDeposito,
    modoCompraProveedor: base?.modoCompraProveedor,
    origenEsDeposito,
  });

  const cantidad =
    cantidadModo === "ENVIADA"
      ? aNumero(detalle.cantidad) ?? 0
      : cantidadAValorizar(detalle);

  return { costoUnitario, cantidad, subtotal: cantidad * costoUnitario };
}
