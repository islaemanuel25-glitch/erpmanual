// lib/compras-proveedor/comprobante/aceptarPrecio.js
//
// QUÉ SE LE OFRECE A QUIEN MIRA UNA DIFERENCIA DE PRECIO.
//
// La clasificación ya existe y NO se toca: `clasificarDiferenciaCosto` vive en
// `fronteraCosto.js`, tiene sus candados y está enganchada en la recepción.
// Esto es la capa de arriba —qué se muestra y qué botón aparece— y se apoya en
// aquella sin duplicar ninguna regla.
//
// ── LAS TRES REGLAS, QUE NO SE REDISCUTEN ──────────────────────────────────
//
// 1. SUBIÓ MÁS DEL UMBRAL → aviso con el porcentaje y los botones Aceptar / No.
//
// 2. BAJÓ → se muestra el porcentaje SIN BOTÓN. El costo no se baja solo.
//
//    El motivo es asimétrico a propósito: un costo que sube y no se acepta hace
//    perder margen hasta que alguien lo mire, y eso se nota. Un costo que baja
//    solo hace ganar margen en silencio y NADIE lo mira nunca — el precio de
//    venta queda alto, se vende menos, y la causa es invisible. Bajar un costo
//    es una decisión, no una consecuencia.
//
// 3. SALTO BRUSCO → no es un precio nuevo, es sospecha de mala lectura, y frena.
//    Ni siquiera se ofrece aceptar: un botón que no hay que tocar termina
//    tocándose.
//
// ── UN SOLO ESCRITOR DE COSTO ──────────────────────────────────────────────
//
// Aceptar NO escribe el costo del producto: escribe el precio en la LÍNEA DEL
// PEDIDO. El costo lo sigue escribiendo la recepción, con la frontera que ya
// está, cuando alguien recibe la mercadería. Así hay un solo lugar que mueve
// costos y una sola regla que los gobierna.

import { CLASE_DIFERENCIA } from "@/lib/compras-proveedor/fronteraCosto";

export const ACCION_PRECIO = Object.freeze({
  /** Entra sin molestar: la diferencia está por debajo del umbral. */
  NINGUNA: "NINGUNA",
  /** Subió: se ofrece aceptar o no. */
  OFRECER: "OFRECER",
  /** Bajó: se informa, sin botón. */
  SOLO_INFORMAR: "SOLO_INFORMAR",
  /** Salto brusco: frena. */
  FRENA: "FRENA",
});

/** Un porcentaje como lo diría una persona. */
const pct = (v) => `${Math.abs(Number(v ?? 0)).toFixed(1).replace(/\.0$/, "")} %`;
const pesos = (v) =>
  "$" + Number(v ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Qué hacer con la diferencia de precio de una línea.
 *
 * @param clasificacion  lo que devolvió `clasificarDiferenciaCosto`
 * @param costoAnterior  para poder decir los dos números, no solo el porcentaje
 * @param costoNuevo
 */
export function decisionDePrecio({ clasificacion, costoAnterior, costoNuevo } = {}) {
  const c = clasificacion || {};
  const dif = Number(c.diferenciaPct);
  const subio = Number.isFinite(dif) && dif > 0;

  const numeros = {
    costoAnterior: Number(costoAnterior) || null,
    costoNuevo: Number(costoNuevo) || null,
    diferenciaPct: Number.isFinite(dif) ? dif : null,
  };

  if (c.clase === CLASE_DIFERENCIA.SOSPECHA_LECTURA) {
    return {
      ...numeros,
      accion: ACCION_PRECIO.FRENA,
      titulo: `Bajó ${pct(dif)}: no parece un precio nuevo`,
      detalle:
        `El catálogo tiene ${pesos(costoAnterior)} y la factura dice ${pesos(costoNuevo)}. ` +
        "Una baja así suele ser un dígito mal leído o el producto equivocado. No se ofrece " +
        "aceptarlo: revisá la lectura y el vínculo antes.",
      // No se ofrece NI SIQUIERA con confirmación: un botón que no hay que tocar
      // termina tocándose.
      ofreceAceptar: false,
    };
  }

  if (c.clase === CLASE_DIFERENCIA.SIN_COSTO_ANTERIOR) {
    return {
      ...numeros,
      accion: ACCION_PRECIO.OFRECER,
      titulo: "Sin costo anterior",
      detalle:
        `El producto no tenía costo cargado. La factura dice ${pesos(costoNuevo)}: es un alta, ` +
        "no un cambio, así que no hay porcentaje que mostrar.",
      ofreceAceptar: true,
    };
  }

  if (c.clase === CLASE_DIFERENCIA.SIN_AVISO) {
    return { ...numeros, accion: ACCION_PRECIO.NINGUNA, titulo: null, detalle: null, ofreceAceptar: false };
  }

  // A_REVISAR. Acá se parte según el SIGNO, que es lo que la clasificación no
  // distingue porque mide con valor absoluto.
  if (subio) {
    return {
      ...numeros,
      accion: ACCION_PRECIO.OFRECER,
      titulo: `Subió ${pct(dif)}`,
      detalle: `De ${pesos(costoAnterior)} a ${pesos(costoNuevo)}.`,
      ofreceAceptar: true,
    };
  }

  return {
    ...numeros,
    accion: ACCION_PRECIO.SOLO_INFORMAR,
    titulo: `Bajó ${pct(dif)}`,
    detalle:
      `De ${pesos(costoAnterior)} a ${pesos(costoNuevo)}. El costo NO se baja solo: si querés ` +
      "que baje, cambialo en el producto. Una baja aplicada sin querer sube el margen en " +
      "silencio y nadie la mira nunca.",
    ofreceAceptar: false,
  };
}

/**
 * ¿Se puede aceptar esta línea?
 *
 * Es la puerta del lado del servidor, y NO se apoya en que la pantalla haya
 * escondido el botón: quien llama a la ruta puede ser cualquiera.
 */
export const MOTIVO_NO_ACEPTAR = Object.freeze({
  SIN_VINCULO: "La línea todavía no está vinculada a ningún producto.",
  SIN_LINEA_DE_PEDIDO: "La línea no está asociada a ninguna línea del pedido: no hay dónde escribir el precio.",
  COMPROBANTE_NO_CIERRA:
    "El comprobante no cerró la verificación. De una lectura que no cierra no se acepta ningún precio.",
  // Motivo aparte, porque el de arriba sería FALSO acá: la lectura puede haber
  // sido perfecta y lo que falta es el total del papel. Bloquea igual, pero
  // decir el motivo equivocado hace que alguien busque el error donde no está.
  COMPROBANTE_SIN_TOTAL:
    "Este papel no trae total, así que la lectura no se pudo verificar. De un comprobante sin " +
    "verificar no se acepta ningún precio. Si el papel sí tiene total y no se leyó, volvé a leerlo.",
  UNIDAD_SIN_RESOLVER:
    "Todavía no se sabe si la factura cobra por unidad o por bulto. Sin eso, el precio que se " +
    "escribiría podría estar multiplicado o dividido por el tamaño del bulto.",
  SALTO_BRUSCO: "La diferencia es una sospecha de mala lectura, no un precio nuevo.",
  YA_CONFIRMADO: "El comprobante ya fue confirmado en una recepción.",
});

/**
 * ── `lineaDePedidoId` ENTRA POR ARGUMENTO Y NO SE LEE DE LA FILA ───────────
 *
 * Antes esta guarda miraba `linea.pedidoDetalleId`. Esa columna solo la escribe
 * la ruta de vincular cuando el cliente se la manda, y la pantalla nunca se la
 * manda: medido en producción el 2026-09-20, 21 líneas de comprobante, 4
 * vinculadas, 0 con la columna. O sea que la guarda cortaba SIEMPRE y aceptar
 * un precio no funcionaba nunca, mientras la fila de al lado mostraba su línea
 * de pedido porque la deducía por producto.
 *
 * Ahora quien llama resuelve la línea con `resolverLineaDelPedido` —el único
 * criterio, el mismo que usa la pantalla— y pasa el id. La guarda sigue
 * existiendo y sigue diciendo lo mismo: sin línea de pedido no hay dónde
 * escribir el precio. Lo que cambió es de dónde sale la respuesta.
 */
/**
 * ¿Aceptar el precio está bloqueado por lo que YA se decidió sobre esa
 * diferencia?
 *
 * Son las reglas 2 y 3 del encabezado: una baja no se aplica sola y un salto
 * brusco no es un precio nuevo. Existe como función aparte para que la PANTALLA
 * pregunte lo mismo que la puerta del servidor: si acá está bloqueado, la hoja
 * no ofrece el botón, y así no queda una opción que el servidor va a rechazar
 * siempre.
 *
 * OJO con `ofreceAceptar`, que NO es lo mismo: ése también es falso cuando la
 * diferencia está por debajo del umbral, y ahí aceptar sí se permite.
 */
export function aceptarEstaBloqueado(decision) {
  return (
    decision?.accion === ACCION_PRECIO.FRENA || decision?.accion === ACCION_PRECIO.SOLO_INFORMAR
  );
}

/**
 * ── EL PRODUCTO TAMBIÉN ENTRA POR ARGUMENTO, POR EL MISMO MOTIVO ──────────
 *
 * Esta guarda miraba `linea.productoLocalId`, que es la columna que se escribe
 * solo cuando alguien vincula a mano. La pantalla resuelve el producto con la
 * cascada entera —que también resuelve por ALIAS del proveedor—, así que las
 * dos contestaban distinto sobre la misma línea: la hoja mostraba la
 * comparación hecha contra Philips 20 red común y el servidor decía que la
 * línea no estaba vinculada. Medido sobre la línea 112 del comprobante 5.
 *
 * Ahora quien llama resuelve el producto con `analizarLineas` —el mismo camino
 * que la pantalla— y pasa el id. La guarda sigue diciendo lo mismo: sin saber
 * qué producto es, no se escribe ningún costo.
 */
export function puedeAceptarse({
  linea,
  productoBaseId = null,
  lineaDePedidoId = null,
  comprobante,
  decision,
  unidad,
} = {}) {
  if (comprobante?.confirmadoEn) return { ok: false, motivo: MOTIVO_NO_ACEPTAR.YA_CONFIRMADO };
  // ── SIN TOTAL IMPRESO NO SE ACEPTA NINGÚN PRECIO ──────────────────────
  //
  // Hasta la lectura interpretada, un renglón de un remito sin total se
  // aceptaba si su propia cuenta —cantidad × precio contra su importe— cerraba.
  // Era una regla de formato: el costo que importa es el FINAL, y en un papel
  // sin total nada lo controla —el modelo puede haber sumado un IVA que no
  // estaba, y la cuenta del renglón cerraría igual—. Orden de Emanuel del
  // 2026-10-10 (Mauro): un papel SIN_TOTAL no propone costo, y tampoco se
  // acepta a mano renglón por renglón. Se recibe igual con los costos de antes.
  if (comprobante?.estado === "SIN_TOTAL") {
    return { ok: false, motivo: MOTIVO_NO_ACEPTAR.COMPROBANTE_SIN_TOTAL };
  }
  if (!["CARGADO", "CIERRA"].includes(comprobante?.estado)) {
    return { ok: false, motivo: MOTIVO_NO_ACEPTAR.COMPROBANTE_NO_CIERRA };
  }
  if (!productoBaseId) return { ok: false, motivo: MOTIVO_NO_ACEPTAR.SIN_VINCULO };
  if (!lineaDePedidoId) return { ok: false, motivo: MOTIVO_NO_ACEPTAR.SIN_LINEA_DE_PEDIDO };
  // La unidad sin resolver es tan bloqueante como el vínculo: el precio que se
  // escribiría podría estar multiplicado por el tamaño del bulto.
  if (unidad?.requiereDecision) return { ok: false, motivo: MOTIVO_NO_ACEPTAR.UNIDAD_SIN_RESOLVER };
  // Las dos que la pantalla también pregunta, por la MISMA función: si acá
  // bloquea, la hoja no ofrece el botón.
  if (aceptarEstaBloqueado(decision)) {
    return {
      ok: false,
      motivo:
        decision?.accion === ACCION_PRECIO.FRENA
          ? MOTIVO_NO_ACEPTAR.SALTO_BRUSCO
          : "El costo no se baja solo.",
    };
  }
  return { ok: true };
}
