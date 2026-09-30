// lib/stock/ajusteManual.js
//
// LAS REGLAS DEL AJUSTE MANUAL DE STOCK LOCALES, SIN BASE NI HTTP.
//
// La ruta `app/api/stock_locales/ajustar` carga las filas, bloquea y escribe;
// acá se decide. Separarlas es lo que permite probar cada regla sin una base, y
// que la pantalla y el servidor pregunten lo mismo a la misma función.
//
// ── EL ORDEN IMPORTA, Y POR ESO HAY DOS MOMENTOS ────────────────────────────
//
//   1. `validarPedidoDeAjuste` — lo que se sabe sin mirar el stock: el tipo, la
//      cantidad, que la causa sea un valor del vocabulario, que "Otro" traiga
//      detalle. Corre ANTES de escribir nada, y antes de crear la fila si falta.
//
//   2. `validarCausaContraElStockReal` — lo que solo se sabe con la cantidad
//      REAL bloqueada: hacia dónde se movió de verdad. La pantalla eligió las
//      opciones mirando el stock que mostraba, que puede haber cambiado desde
//      entonces —una venta en el medio—, así que el servidor vuelve a preguntar.

import { motivoCantidadNoAdmitida } from "@/lib/stock/escalaFisica";
import {
  direccionDeDiferencia,
  DIRECCION_DIFERENCIA,
  esMotivoDeDiferencia,
  ETIQUETA_MOTIVO,
  motivoExigeDetalle,
  motivoPermitidoPara,
} from "@/lib/stock/motivosDeDiferencia";

/** Los tres tipos que ofrece la pantalla. No hay un cuarto por defecto. */
export const TIPO_AJUSTE = Object.freeze({
  SUMAR: "sumar",
  RESTAR: "restar",
  FIJAR: "fijar",
});

/** Lo que queda escrito en `AuditoriaStock.accion` para cada tipo. */
export const ACCION_AUDITORIA_AJUSTE = Object.freeze({
  [TIPO_AJUSTE.SUMAR]: "AJUSTE_SUMAR",
  [TIPO_AJUSTE.RESTAR]: "AJUSTE_RESTAR",
  [TIPO_AJUSTE.FIJAR]: "AJUSTE_FIJAR",
});

const TIPOS = new Set(Object.values(TIPO_AJUSTE));

const rechazo = (status, error) => ({ ok: false, status, error });

/**
 * Lo que se puede validar sin mirar el stock. Devuelve el pedido normalizado o
 * el rechazo, con su status.
 *
 * `motivoPrincipal` es la causa —un valor del vocabulario, o nada— y `motivo`
 * el detalle en texto libre.
 */
export function validarPedidoDeAjuste({ tipo, cantidad, motivoPrincipal, motivo, unidadFisica } = {}) {
  // Antes un tipo desconocido —o ninguno— se trataba como "sumar": un pedido
  // mal armado SUMABA stock en silencio.
  if (!TIPOS.has(tipo)) {
    return rechazo(400, "Tipo de ajuste inválido: tiene que ser sumar, restar o fijar.");
  }

  const n = cantidad === null || cantidad === undefined || cantidad === "" ? Number.NaN : Number(cantidad);
  if (!Number.isFinite(n)) return rechazo(400, "Cantidad inválida.");
  if (tipo === TIPO_AJUSTE.FIJAR ? n < 0 : n <= 0) {
    return rechazo(
      400,
      tipo === TIPO_AJUSTE.FIJAR ? "La cantidad no puede ser negativa." : "La cantidad debe ser mayor a 0."
    );
  }
  const noAdmitida = motivoCantidadNoAdmitida(n, unidadFisica);
  if (noAdmitida) return rechazo(400, noAdmitida);

  const causa = typeof motivoPrincipal === "string" && motivoPrincipal.trim() ? motivoPrincipal.trim() : null;
  if (causa !== null && !esMotivoDeDiferencia(causa)) {
    return rechazo(400, `Causa desconocida: "${causa}".`);
  }
  const detalle = typeof motivo === "string" ? motivo.trim() : "";
  if (causa !== null && motivoExigeDetalle(causa) && !detalle) {
    return rechazo(400, `Con la causa "${ETIQUETA_MOTIVO[causa]}" hay que contar qué pasó en el detalle.`);
  }

  return { ok: true, tipo, cantidad: n, motivoPrincipal: causa, motivo: detalle || null };
}

/**
 * La cantidad que queda, calculada desde la REAL.
 *
 * El piso en cero sin stock negativo es el comportamiento que ya tenía la ruta:
 * no se cambia acá.
 */
export function calcularNuevoStock({ actual, tipo, cantidad, allowNegativeStock }) {
  let nuevo;
  if (tipo === TIPO_AJUSTE.FIJAR) nuevo = cantidad;
  else if (tipo === TIPO_AJUSTE.RESTAR) nuevo = actual - cantidad;
  else nuevo = actual + cantidad;
  if (nuevo < 0 && !allowNegativeStock) nuevo = 0;
  return nuevo;
}

const DICE_DIRECCION = Object.freeze({
  [DIRECCION_DIFERENCIA.DISMINUCION]: "baja",
  [DIRECCION_DIFERENCIA.AUMENTO]: "sube",
});

/**
 * La causa contra lo que pasa DE VERDAD con el stock.
 *
 *   · sin diferencia real no hay nada que explicar: no se pide causa, y una
 *     causa elegida mirando otro número se rechaza diciendo cuál es el real;
 *   · con diferencia, la causa tiene que explicar ESA dirección;
 *   · con el motivo obligatorio para el grupo, la causa es obligatoria.
 */
export function validarCausaContraElStockReal({ actual, nuevo, motivoPrincipal, requireMotivo }) {
  const direccion = direccionDeDiferencia(actual, nuevo);

  if (direccion === null) {
    if (motivoPrincipal) {
      return rechazo(
        409,
        `El stock real es ${actual} y el ajuste lo deja igual: no hay diferencia que explicar con "${ETIQUETA_MOTIVO[motivoPrincipal]}". Revisá el ajuste.`
      );
    }
    return { ok: true, direccion };
  }

  if (!motivoPrincipal) {
    if (requireMotivo) return rechazo(400, "Elegí la causa del ajuste: es obligatoria en este grupo.");
    return { ok: true, direccion };
  }

  if (!motivoPermitidoPara(direccion, motivoPrincipal)) {
    return rechazo(
      409,
      `El stock real es ${actual} y el ajuste lo deja en ${nuevo}: el stock ${DICE_DIRECCION[direccion]}, y "${ETIQUETA_MOTIVO[motivoPrincipal]}" no explica eso. Revisá el ajuste.`
    );
  }
  return { ok: true, direccion };
}
