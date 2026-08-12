// lib/compras-proveedor/comprobante/precioDeLinea.js
//
// EL ANÁLISIS DE PRECIO DE UNA LÍNEA LEÍDA, EN UN SOLO LUGAR.
//
// De una línea del comprobante y el producto al que quedó vinculada salen cinco
// cosas encadenadas, y siempre las mismas cinco:
//
//   1. el precio de la factura llevado a ESCALA FINAL (el neto no compara),
//   2. si la factura cobra por unidad o por bulto,
//   3. cuál de los dos precios se escribiría según eso,
//   4. cómo clasifica esa diferencia contra el costo de hoy,
//   5. qué se le ofrece a quien mira.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO CÓDIGO EN CADA RUTA ─────────────────────
//
// Porque son DOS rutas las que necesitan las cinco: la que dibuja la pantalla y
// la que acepta el precio. Y tienen que dar el mismo número, porque una muestra
// lo que la otra va a escribir.
//
// La segunda copia llegó a existir: la ruta de aceptar nació repitiendo los
// pasos 1 a 3 con el mismo código pegado al lado. No se rompía ese día — se
// rompía el día que alguna de las dos cambiara, mostrando un precio y
// escribiendo otro. Es exactamente la regla 1 de CLAUDE.md, y se juntaron acá
// antes de que la copia se commiteara.
//
// ── EL ORDEN DE LOS PASOS NO ES LIBRE ──────────────────────────────────────
//
// Neto → final ANTES de comparar. El costo del ERP está en escala final y el
// unitario de la factura viene neto; comparar sin convertir mete la alícuota
// entera adentro del cociente y hace que un 21 % de IVA parezca un aumento.
//
// Y la unidad se decide ANTES de clasificar: si la factura cobra por unidad, lo
// que se compara contra el costo del bulto es el precio multiplicado por el
// pack. Clasificar antes de saber la unidad compara un precio de unidad contra
// un costo de bulto, y eso da siempre una baja brutal.

import {
  finalUnitarioSinPercepcionesCentavos,
  aPesos,
  RECETA_POR_DEFECTO,
} from "@/lib/compras-proveedor/comprobante/impuestos";
import {
  deducirUnidad,
  explicarVeredicto,
  lecturasPosibles,
  UNIDAD,
} from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import {
  clasificarDiferenciaCosto,
  umbralesDelProveedor,
} from "@/lib/compras-proveedor/fronteraCosto";
import { decisionDePrecio } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";

/**
 * Qué producto es esta línea.
 *
 * ── EL VÍNCULO YA HECHO GANA SOBRE LA SUGERENCIA ─────────────────────────
 *
 * Una línea vinculada a mano no vuelve a buscarse: alguien ya decidió. Antes
 * esto no estaba y el producto salía SOLO de la sugerencia automática, así que
 * una línea vinculada a mano perdía su producto y con él el precio, la unidad y
 * la línea del pedido — y la pantalla decía "Todavía no se sabe qué producto
 * es" sobre una línea que sí lo sabía, con el `productoLocalId` escrito en la
 * fila.
 *
 * @param linea            la fila leída, con `productoLocalId` si ya está vinculada
 * @param baseDelLocal     Map productoLocalId → productoBaseId
 * @param sugeridoBaseId   lo que propuso la búsqueda, si no estaba vinculada
 */
export function productoBaseDeLaLinea({ linea, baseDelLocal, sugeridoBaseId } = {}) {
  if (linea?.productoLocalId != null) {
    const base = baseDelLocal?.get?.(linea.productoLocalId);
    // Si el vínculo apunta a un producto que ya no se ve desde acá, el vínculo
    // existe igual: se devuelve nulo y quien llame lo dirá como corresponde, sin
    // hacerlo pasar por "sin vincular".
    return { productoBaseId: base ?? null, desdeVinculo: true };
  }
  return { productoBaseId: sugeridoBaseId ?? null, desdeVinculo: false };
}

/**
 * Los cinco pasos, encadenados.
 *
 * @param linea          { cantidad, netoUnitario, internoUnitario }
 * @param producto       { precio_costo, factor_pack } — el del ERP, o null
 * @param receta         la que usó la lectura, no la de hoy
 * @param proveedor      para los umbrales propios del proveedor
 * @param unidadElegida  UNIDAD.POR_UNIDAD | POR_BULTO si una persona ya decidió
 */
export function analizarPrecioDeLinea({ linea, producto, receta, proveedor, unidadElegida } = {}) {
  if (!producto) return null;

  const recetaUsada = receta ?? { ...RECETA_POR_DEFECTO };

  // 1. Neto → final.
  const precioFinal = aPesos(
    finalUnitarioSinPercepcionesCentavos({
      netoUnitario: Number(linea?.netoUnitario),
      internoUnitario: Number(linea?.internoUnitario ?? 0),
      receta: recetaUsada,
    })
  );

  const costoAnterior = Number(producto.precio_costo ?? 0);
  const factorPack = producto.factor_pack;
  const cantidad = Number(linea?.cantidad);

  // 2. ¿Por unidad o por bulto?
  const deducido = deducirUnidad({
    costoAnteriorFinal: costoAnterior,
    precioFacturaFinal: precioFinal,
    factorPack,
  });
  // Si una persona eligió, esa manda: eligió mirando la factura, que es más de
  // lo que puede hacer el cociente.
  const elegidaValida = unidadElegida === UNIDAD.POR_UNIDAD || unidadElegida === UNIDAD.POR_BULTO;
  const veredicto = elegidaValida
    ? { ...deducido, unidad: unidadElegida, requiereDecision: false, elegidaAMano: true }
    : deducido;

  const lecturas = lecturasPosibles({ cantidad, precioFinal, factorPack });

  // 3. Qué precio se escribiría.
  const precioAEscribir =
    lecturas && veredicto.unidad === UNIDAD.POR_UNIDAD ? lecturas.porUnidad.costoPorBulto : precioFinal;

  // 4. Cómo clasifica esa diferencia. Se reusa la frontera que ya gobierna la
  //    recepción: acá no hay ningún umbral nuevo.
  const clasificacion = clasificarDiferenciaCosto({
    costoAnterior,
    costoNuevo: precioAEscribir,
    umbrales: umbralesDelProveedor(proveedor),
  });

  // 5. Qué se le ofrece a quien mira.
  const decision = decisionDePrecio({ clasificacion, costoAnterior, costoNuevo: precioAEscribir });

  return {
    precioFinal,
    costoAnterior,
    precioAEscribir,
    unidad: {
      ...veredicto,
      precioFinal,
      lecturas,
      explicacion: explicarVeredicto({ veredicto, cantidad, precioFinal, factorPack }),
    },
    clasificacion,
    decision,
  };
}
