// lib/proveedores/listas/costoDelAltaDesdeLaLista.js
//
// EL COSTO DEL ALTA QUE SE ABRE DESDE UN RENGLÓN DE LA LISTA, Y LA PREGUNTA QUE
// LO DECIDE (Emanuel, 2026-11-06; reemplaza el "costo siempre vacío" del
// 2026-11-05).
//
// En una misma lista hay precios por unidad y por pack, y eso solo lo sabe quien
// la mira. Con cantidad mayor que 1 se pregunta "El precio de la lista ($ X)
// es… [Por la caja de N] [Por unidad]", sin nada elegido: hasta que conteste,
// el costo queda vacío. Por la caja, el costo del bulto es el precio; por
// unidad, el precio × N. Sin cantidad o con 1 no se pregunta: el precio es el de
// la unidad.
//
// Al precio se le aplica la misma cuenta que aplicar (`precioBaseDelCosto`:
// recargo e impuesto de la lista). La ÚNICA multiplicación por la cantidad es
// la de "Por unidad". NUNCA `costoMaestroPropuesto` ni `costoUnitarioCalculado`:
// una fila sin producto solo los trae si TUVO producto, y entonces son el costo
// calculado contra la ficha de OTRO producto (2026-11-05).
//
// ── POR QUÉ ESTÁ APARTE DE `altaDesdeLaLista.js` ─────────────────────────────
//
// Aquél no importa nada, y un candado lo exige: lo usa una pantalla, y un
// import que arrastró Prisma al navegador ya rompió `next dev` una vez. Éste sí
// importa —la cuenta de aplicar y la regla única de unidades no se reescriben—
// y su candado comprueba que nada de lo que arrastra toca Prisma.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { round2 } from "./calculoCosto.js";
import { precioBaseDelCosto } from "./configuracionProveedor.js";
import { money } from "./presentacion.js";
import { costoDelBulto } from "../../unidades/reglaDeUnidades.js";
import { bultoDeLaFila } from "./altaDesdeLaLista.js";

/** De qué es el precio del renglón, según la persona que crea el producto. */
export const PRECIO_ES = Object.freeze({ CAJA: "CAJA", UNIDAD: "UNIDAD" });

/** Un número finito o null. Los Decimal de Prisma llegan como string. */
function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * LA PREGUNTA DEL ALTA, o null si no hay nada que preguntar (sin cantidad, o 1).
 *
 * Diseño de Emanuel (2026-11-06):
 *
 *   ¿El precio de la lista es por caja o por unidad?
 *   La lista dice $ 3.139,92 y 10 por caja.
 *   ( ) Por la caja de 10   Caja $ 3.139,92 · c/u $ 313,99
 *   ( ) Por unidad          Caja $ 31.399,20 · c/u $ 3.139,92
 *
 * La cuenta de cada opción sale de `costoDelAltaDesdeLaLista` con esa misma
 * respuesta —recargo e impuesto incluidos—, así que lo que se muestra es lo que
 * se carga al elegirla: `costo` va junto a la `cuenta` para que el candado lo
 * compare. El c/u es el costo de la caja ÷ la cantidad. Sin ninguna elegida:
 * eso lo decide la pantalla, que arranca sin elegir.
 *
 * `deDonde` es de quién es el precio en los textos: "lista" acá, "factura" en
 * el alta desde la recepción, que es la misma pregunta (DAS Mayorista,
 * 2026-11-06). Por defecto, "lista": la pantalla de Listas no lo pasa.
 *
 * @returns `{ titulo, detalle, cantidad, opciones: [{ valor, texto, costo, unitario, cuenta }] }`
 */
export function preguntaDelPrecioDeLaLista(fila, { recargoPct = 0, impuestoAdicionalPct = null, deDonde = "lista" } = {}) {
  const n = bultoDeLaFila(fila);
  const precio = numero(fila?.precioConIva);
  if (n === null || precio === null || precio <= 0) return null;
  const opcion = (valor, texto) => {
    const costo = costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, precioEs: valor });
    const unitario = costo === null ? null : round2(costo / n);
    return {
      valor,
      texto,
      costo,
      unitario,
      cuenta: costo === null ? null : `Caja ${money(costo)} · c/u ${money(unitario)}`,
    };
  };
  return {
    titulo: `¿El precio de la ${deDonde} es por caja o por unidad?`,
    detalle: `La ${deDonde} dice ${money(precio)} y ${n} por caja.`,
    cantidad: n,
    opciones: [opcion(PRECIO_ES.CAJA, `Por la caja de ${n}`), opcion(PRECIO_ES.UNIDAD, "Por unidad")],
  };
}

/**
 * EL COSTO DEL ALTA, o null si todavía no se puede decir.
 *
 * El precio del renglón con la cuenta de aplicar. Con bulto: por la caja es el
 * costo del bulto; por unidad, × el bulto (`costoDelBulto`, la regla única de
 * unidades); sin respuesta, null. Sin bulto: el precio es el de la unidad, sin
 * preguntar.
 *
 * @param recargoPct, impuestoAdicionalPct  los de la importación
 * @param precioEs  `PRECIO_ES`, o null si la persona todavía no eligió
 */
export function costoDelAltaDesdeLaLista({ fila, recargoPct = 0, impuestoAdicionalPct = null, precioEs = null } = {}) {
  const precio = numero(fila?.precioConIva);
  if (precio === null || precio <= 0) return null;
  const base = precioBaseDelCosto({ precioLista: precio, recargoPct, impuestoAdicionalPct });
  if (base === null || !Number.isFinite(base) || base <= 0) return null;
  const n = bultoDeLaFila(fila);
  if (n === null) return round2(base);
  if (precioEs === PRECIO_ES.CAJA) return round2(base);
  if (precioEs === PRECIO_ES.UNIDAD) {
    const bulto = costoDelBulto({ precio: base, unidades: 1, bulto: n });
    return bulto === null ? null : round2(bulto);
  }
  return null;
}

/**
 * LO ELEGIDO, COMO LECTURA RECORDADA DEL PRODUCTO CON EL PROVEEDOR
 * (`LecturaProductoProveedor`), con las mismas claves que las lecturas del
 * motor (`hipotesisDeCosto`): por la caja es `MISMA_PRESENTACION` × 1, por
 * unidad es `PACK_<n>` × n. Así la próxima lista lee el precio igual. Null si
 * no hubo pregunta o no se contestó.
 */
export function lecturaRecordadaDelAlta({ fila, precioEs }) {
  const n = bultoDeLaFila(fila);
  if (n === null) return null;
  if (precioEs === PRECIO_ES.CAJA) return { clave: "MISMA_PRESENTACION", multiplicador: 1, cantidad: null };
  if (precioEs === PRECIO_ES.UNIDAD) return { clave: `PACK_${n}`, multiplicador: n, cantidad: null };
  return null;
}
