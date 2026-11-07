// lib/compras-proveedor/comprobante/preguntaDeLectura.js
//
// LA PREGUNTA "¿EN QUÉ VIENE?" DE CORREGIR, CUANDO NINGUNA LECTURA GANA CLARA.
//
// Regla de Emanuel (2026-11-07): gana la lectura que deja menos diferencia
// contra tu costo (`elegirLectura`). Si no hay una ganadora clara —dos dentro
// de la variación, o la segunda a menos del triple—, no se frena: se pregunta
// con las lecturas candidatas, cada una con su cuenta, sin ninguna elegida. La
// forma es la de la pregunta del alta ("¿El precio de la factura es por caja o
// por unidad?"), con la misma pieza del kit, `SunmiOpcionElegible`.
//
// Lo elegido va al renglón (`unidadElegida`: "POR_UNIDAD", "POR_BULTO" o
// "PACK_<n>") y se recuerda para el producto con el proveedor
// (`lecturaRecordadaDeLaEleccion`, el mismo mecanismo que el alta).
//
// Módulo puro: sin React, sin Prisma y sin red.

import { formatearMoneda } from "@/lib/moneda";
import { lecturaRecordadaDelAlta, PRECIO_ES } from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";

export const TITULO_PREGUNTA_LECTURA = "¿En qué viene?";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1).replace(".", ",")} %`;

/** Lo que se guarda en el renglón para la lectura de k unidades. */
export function unidadElegidaDeLaLectura(k, factor) {
  if (Number(k) === 1) return "POR_UNIDAD";
  if (Number(k) === Number(factor)) return "POR_BULTO";
  return `PACK_${Number(k)}`;
}

/**
 * LA PREGUNTA, o null si no hay nada que preguntar: la escala se dedujo, o la
 * deducción no tiene lecturas con números.
 *
 * @returns `{ titulo, detalle, opciones: [{ valor, k, texto, cuenta }] }`
 */
export function preguntaDeLectura(fila) {
  const u = fila?.unidad;
  if (u?.requiereDecision !== true) return null;
  const lecturas = Array.isArray(u?.lecturasCandidatas) ? u.lecturasCandidatas : [];
  if (lecturas.length < 2) return null;
  const factor = num(u?.factorPack) ?? num(fila?.factorPack);
  const cantidad = num(fila?.cantidad);
  const precioDelPapel = lecturas.find((l) => l.unidadesPorFacturada === 1)?.papelPorUnidad ?? null;
  const opciones = lecturas.map((l) => {
    const k = l.unidadesPorFacturada;
    const texto = k === 1 ? "Por unidad" : k === factor ? `Por el pack de ${k}` : `Por el pack de ${k} que dice el papel`;
    return {
      valor: unidadElegidaDeLaLectura(k, factor),
      k,
      texto,
      cuenta: `${formatearMoneda(l.papelPorUnidad)} la unidad · ${pct(l.diferenciaPct)} contra tu costo`,
    };
  });
  return {
    titulo: TITULO_PREGUNTA_LECTURA,
    detalle:
      cantidad !== null && precioDelPapel !== null
        ? `La factura dice ${Number.isInteger(cantidad) ? cantidad : cantidad.toFixed(3)} a ${formatearMoneda(precioDelPapel)}.`
        : "Ninguna lectura gana clara.",
    opciones,
  };
}

/**
 * LO ELEGIDO, COMO LECTURA RECORDADA DEL PRODUCTO CON EL PROVEEDOR, o null.
 * Con las claves del alta (`lecturaRecordadaDelAlta`): por el bulto de la
 * ficha es "por la caja" (`MISMA_PRESENTACION` × 1), por unidad es
 * `PACK_<n>` × n. Un pack del papel que no es el bulto no tiene clave en ese
 * vocabulario: se recuerda en el vínculo (`unidadesPorPresentacion`).
 */
export function lecturaRecordadaDeLaEleccion({ k, factor }) {
  const n = num(factor);
  if (!(n > 1)) return null;
  if (Number(k) === n) return lecturaRecordadaDelAlta({ fila: { unidadesPorBulto: n }, precioEs: PRECIO_ES.CAJA });
  if (Number(k) === 1) return lecturaRecordadaDelAlta({ fila: { unidadesPorBulto: n }, precioEs: PRECIO_ES.UNIDAD });
  return null;
}

/**
 * Y AL REVÉS: cuántas trae lo facturado según una lectura recordada de este
 * producto con este proveedor, o null. Por la caja, el bulto; `PACK_<n>` con
 * el n del bulto, la unidad.
 */
export function unidadesDeLaLecturaRecordada(lectura, factor) {
  const n = num(factor);
  if (!lectura || !(n > 1)) return null;
  if (lectura.clave === "MISMA_PRESENTACION" && Number(lectura.multiplicador) === 1) return n;
  if (lectura.clave === `PACK_${n}` && Number(lectura.multiplicador) === n) return 1;
  return null;
}
