// lib/compras-proveedor/altaDesdeElPapel.js
//
// LO QUE EL ALTA DE PRODUCTO RECIBE PRECARGADO CUANDO SE CREA DESDE UN RENGLÓN.
//
// Myf #383, "HELLMANNS MAY LIVIANA DP 24X237G": el producto no existía y la hoja
// "Qué producto es" no tenía salida. Ahora ofrece "Crear producto", que abre EL
// MISMO formulario de alta (`ModalProductoFinal` → `FormProducto`) con lo que el
// sistema ya sabe, y nada más:
//
//   · nombre      — lo que dice el papel;
//   · proveedor   — el del comprobante;
//   · costo       — el de la recepción: `precioFinalDelRenglon`, con impuestos
//                   y cargos, por lo que factura el renglón;
//   · bulto       — si el renglón lo dice (`bultoDelAltaDesdeElPapel`: 24, 20),
//                   y con él "Pack" y la pregunta de si el precio es por caja
//                   o por unidad, que decide el costo (ver `precargaDelAlta`).
//
// Lo que NO se precarga, y por qué:
//
//   · SKU         — el alta no asigna ninguno: se guarda el que se escribe, o
//                   ninguno. Inventarlo a partir del papel está prohibido.
//   · venta       — el alta solo la calcula cuando hay un margen cargado, y un
//                   alta nueva no trae margen: queda vacía, como en cualquiera.
//   · código del proveedor — el alta no tiene ese campo editable: se MUESTRA
//                   fijo (`codigoDelProveedorParaElAlta`) y lo guarda el vínculo
//                   que se hace al volver (`aliasAEscribir`), con el texto del
//                   papel: el mismo motor que reconoce la próxima factura.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { precioFinalDelRenglon } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { aCentavos } from "@/lib/compras-proveedor/comprobante/impuestos";
import { contenidoQueDiceElPapel, unidadesQueDiceElRenglon } from "@/lib/compras-proveedor/contenidoDelBulto";
import { cantidadPorCajaEnNombre } from "@/lib/proveedores/listas/lectura/numeroDeLista";
import { esLata, packDeLataCoherente, packPropuestoDeLata } from "@/lib/productos/packDeLata";
import {
  costoDelAltaDesdeLaLista,
  lecturaRecordadaDelAlta,
  preguntaDelPrecioDeLaLista,
} from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";
import { respuestaSugerida } from "@/lib/proveedores/listas/cajaRecordada";
import { costoPorKiloDeLaBolsa, fichaDeBolsaDePesoFijo } from "@/lib/conversiones/stock";

// ── LA BOLSA DE PESO FIJO QUE SE VENDE POR KILO (2026-11-17) ──────────────
//
// Boleta del 16/11, "BIOM ANANA TROZ X500GR -20-", 3 a $ 16.463,62: se compra
// por bolsa de 500 g y en los locales se vende por kilo, pesándola. El alta la
// proponía "Unidad" y no había forma directa de dejarla bien.
//
// Decisión de Emanuel: es la ficha del MANI CON CASCARA X2KG
// (`fichaDeBolsaDePesoFijo`): el depósito la maneja POR BOLSA de N kg y los
// locales la venden POR KILO. Si se elige venta por kilo, el alta pide solo el
// peso de la bolsa —precargado del nombre—, el costo entra por bolsa como lo
// dice el papel y el costo por kilo sale de dividir.
//
// Se propone "Kg" de entrada SOLO si el papel trae peso (los FOX SAL). El
// nombre solo no alcanza: hay bolsas de 500 g que se venden por unidad (Mogul).

/** ¿El renglón del papel trae el peso de lo que factura? */
export function trajoPesoElPapel(fila) {
  return Number(fila?.peso) > 0;
}

/**
 * Lo que pesa UNA bolsa, para precargar el campo: lo que dice el nombre
 * ("X500GR" → 0,5, con el lector de las listas, `respuestaSugerida`), y si no,
 * el peso del renglón repartido entre lo que factura (FOX SAL: 1,3 kg en 2).
 * Null si no se sabe: el campo queda vacío para que lo escriban.
 */
export function pesoDeLaBolsaDelAlta(fila) {
  const delNombre = respuestaSugerida({ porKilo: true, textos: [fila?.textoCrudo] });
  if (delNombre !== null) return delNombre;
  const peso = Number(fila?.peso);
  const cantidad = Number(fila?.cantidad);
  if (peso > 0 && cantidad > 0) return Math.round((peso / cantidad) * 1000) / 1000;
  return null;
}

// El costo del kilo desde el de la bolsa vive junto a la ficha de la bolsa
// (`lib/conversiones/stock.js`): lo usa también el formulario de producto.
export { costoPorKiloDeLaBolsa };

/**
 * Lo que el formulario necesita para el campo "Peso de la bolsa": el peso
 * sugerido y el costo de una bolsa como lo dice el papel. Siempre se ofrece:
 * el campo aparece recién si eligen venta por kilo.
 */
export function bolsaDePesoDelAlta(fila) {
  return { pesoSugeridoKg: pesoDeLaBolsaDelAlta(fila), costoBolsa: costoDelRenglonParaElAlta(fila) };
}

// ── POR LA CAJA O POR UNIDAD, COMO EL ALTA DE LISTAS (2026-11-06) ─────────
//
// DAS Mayorista, factura 0020-00017245: "9020 CREMA VERONA XCAJA 20", 6 cajas
// a $ 24.793,38. El alta abría sin factor y con "Costo * (por unidad)" en
// 30.743,79 —el precio de la CAJA con lo que la recepción suma al costo—, y
// guardado así cada crema quedaba a $ 30.743,79.
//
// Decisión de Emanuel: el alta desde la recepción hace lo mismo que el alta
// desde "Sin producto en tu catálogo" de Listas, con las MISMAS funciones
// (`preguntaDelPrecioDeLaLista`, `costoDelAltaDesdeLaLista`,
// `lecturaRecordadaDelAlta`) sobre el renglón puesto con la forma de una fila
// de lista (`filaComoLaDeLaLista`): el precio es el que hoy precarga la
// recepción y la cantidad por caja la del renglón. Sin recargo ni impuesto de
// lista: los impuestos ya los sumó la recepción.

/**
 * CUÁNTAS TRAE LA CAJA, SEGÚN EL RENGLÓN, o null (sin número claro, o 1).
 *
 * Primero lo que el renglón dice por su cuenta —el UxB que guarda el lector en
 * `enQueViene`, "bulto de 40"—; si no, el nombre (`cantidadPorCajaEnNombre`:
 * "24X237G" → 24, "XCAJA 20" → 20, "X 12" → 12; "X 4.5 KG" es peso y no
 * cuenta); y si no, el contenido en unidades que ya leía la recepción, "(83u)".
 */
export function bultoDelAltaDesdeElPapel(fila) {
  const texto = fila?.textoCrudo;
  let dicho = null;
  for (const n of [unidadesQueDiceElRenglon(fila?.enQueViene), cantidadPorCajaEnNombre(texto), contenidoQueDiceElPapel(texto)]) {
    if (Number.isInteger(n) && n > 1) {
      dicho = n;
      break;
    }
  }
  // Una lata va por plancha entera: "CAN 4X6 473CC" son 24 (`packDeLata.js`).
  return packPropuestoDeLata({ texto, dicho }) ?? dicho;
}

/**
 * EL PACK QUE PROPONE EL ALTA, con el precio a la vista: el del renglón y, si
 * es una lata, el que deja el precio por lata coherente con las otras latas del
 * proveedor (`packDeLataCoherente`). Es el que arranca en el formulario.
 */
export function bultoPropuestoDelAltaDesdeElPapel({ fila, referenciaPorLata = null } = {}) {
  const propuesto = bultoDelAltaDesdeElPapel(fila);
  if (!esLata(fila?.textoCrudo)) return propuesto;
  return packDeLataCoherente({ propuesto, precioCaja: costoDelRenglonParaElAlta(fila), referenciaPorLata });
}

/**
 * El renglón con la forma que leen las funciones del alta de Listas.
 *
 * `bulto` es el pack que tiene el formulario EN VIVO (2026-11-18): la pregunta
 * y el costo lo siguen si alguien lo cambia. Sin él, el que dice el renglón.
 */
export function filaComoLaDeLaLista(fila, bulto = null) {
  return { precioConIva: costoDelRenglonParaElAlta(fila), unidadesPorBulto: bulto ?? bultoDelAltaDesdeElPapel(fila) };
}

/** La pregunta "¿El precio de la factura es por caja o por unidad?", o null. */
export function preguntaDelAltaDesdeElPapel(fila, { bulto = null } = {}) {
  // Con peso en el papel el alta se propone por kilo, y en un producto por kilo
  // no hay caja ni unidad que preguntar: "X4U" en un salame es otra cosa.
  if (trajoPesoElPapel(fila)) return null;
  return preguntaDelPrecioDeLaLista(filaComoLaDeLaLista(fila, bulto), { deDonde: "factura" });
}

/** El costo del alta: con caja, null hasta que se elija (`PRECIO_ES`). */
export function costoDelAltaDesdeElPapel({ fila, precioEs = null, bulto = null }) {
  return costoDelAltaDesdeLaLista({ fila: filaComoLaDeLaLista(fila, bulto), precioEs });
}

/**
 * Lo elegido, como se recuerda para el producto con el proveedor, o null. Con
 * el pack que quedó en el formulario (`bulto`), que es con el que se cargó el
 * costo; sin él, el del renglón.
 */
export function lecturaRecordadaDelAltaDesdeElPapel({ fila, precioEs, bulto = null }) {
  return lecturaRecordadaDelAlta({ fila: { unidadesPorBulto: bulto ?? bultoDelAltaDesdeElPapel(fila) }, precioEs });
}

/** El costo de lo que factura el renglón, o null si el papel no lo dice. */
export function costoDelRenglonParaElAlta(fila) {
  const importe = Number(fila?.importeDelPapel);
  const cantidad = Number(fila?.cantidad);
  // Sin importe, bonificado o sin cantidad no hay costo que proponer.
  if (!Number.isFinite(importe) || importe <= 0 || !Number.isFinite(cantidad) || cantidad <= 0) return null;
  return precioFinalDelRenglon({
    costoFinalRenglon: importe,
    // La fila trae su parte de los cargos en pesos; la regla la pide en centavos.
    cargoDeLaLinea: aCentavos(Number(fila?.cargoDelRenglon) || 0),
    divisor: cantidad,
  });
}

/**
 * El `initialData` del alta: sin `id`, así el formulario sigue siendo un alta.
 * Lo que no se sabe no va, y el formulario lo deja vacío como en cualquier alta.
 */
export function precargaDelAlta({ fila, proveedorId, bulto: bultoElegido = null }) {
  const precarga = {};
  const nombre = String(fila?.textoCrudo ?? "").trim();
  if (nombre) precarga.nombre = nombre;
  if (Number(proveedorId) > 0) precarga.proveedor_id = Number(proveedorId);
  // ── CON PESO EN EL PAPEL, POR KILO DE ENTRADA ─────────────────────────
  // La ficha de la bolsa de peso fijo, con el peso de una bolsa, y el costo del
  // kilo desde el de la bolsa. Sin peso que sugerir queda "Kg" con el campo
  // vacío y el costo de la bolsa, para que lo completen.
  if (trajoPesoElPapel(fila)) {
    const { pesoSugeridoKg, costoBolsa } = bolsaDePesoDelAlta(fila);
    const ficha = fichaDeBolsaDePesoFijo(pesoSugeridoKg);
    if (ficha) {
      Object.assign(precarga, ficha);
      const porKilo = costoPorKiloDeLaBolsa({ costoBolsa, pesoKg: pesoSugeridoKg });
      if (porKilo !== null) precarga.precio_costo = porKilo;
    } else {
      precarga.unidad_medida = "kg";
      if (costoBolsa !== null) precarga.precio_costo = costoBolsa;
    }
    return precarga;
  }
  // El pack propuesto con el precio a la vista, si quien abre el alta lo calculó
  // (`bultoPropuestoDelAltaDesdeElPapel`); si no, el del renglón.
  const bulto = bultoElegido ?? bultoDelAltaDesdeElPapel(fila);
  // ── CON BULTO, LA FICHA ES LA DEL PACK, Y EL COSTO SE PREGUNTA ────────
  //
  // En este negocio los productos se trabajan por pack: una sola ficha, la del
  // bulto. Con bulto viene "Pack" y el factor; el costo queda VACÍO hasta que
  // se conteste si el precio es por caja o por unidad (`preguntaDelAltaDesdeElPapel`),
  // igual que en Listas. Hasta el 2026-11-06 se suponía siempre "por unidad" y
  // se multiplicaba (Myf #383: 1.207,72 × 24); la CREMA VERONA XCAJA 20 cobra
  // por caja y así quedaba 20 veces más cara. Sin bulto, unidad y costo por
  // unidad, sin preguntar.
  if (bulto !== null) {
    precarga.unidad_medida = "pack";
    precarga.factor_pack = bulto;
  }
  const costo = costoDelAltaDesdeElPapel({ fila, bulto });
  if (costo !== null) precarga.precio_costo = costo;
  return precarga;
}

/**
 * El código que el proveedor le da al producto, tal como lo trae el renglón:
 * el alta lo muestra fijo y el vínculo lo guarda al crear. Null si no trae.
 */
export function codigoDelProveedorParaElAlta(fila) {
  const codigo = String(fila?.codigoProveedor ?? "").trim();
  return codigo || null;
}
