// lib/pedidos/preparacionEscritorio.js
//
// LO QUE EL ESCRITORIO DE PREPARAR UN PEDIDO DICE Y ESCRIBE DE CADA RENGLÓN
// (2026-10-28, `components/pos-transferencias/PrepararPedidoEscritorio.jsx`).
//
// No decide nada nuevo: qué está revisado, cuánto viaja, qué es "va completo" y
// "No hay" es `revisionDeLinea.js`; qué se pesa, cómo se dice lo pedido y en
// qué estado está un renglón es `preparacionDelPedido.js`. Esto solo arma, con
// esas piezas, lo que la fila del escritorio necesita:
//
//   · el campo VA: con qué arranca y en qué unidad escribe —la del celular es
//     una hoja con dos campos (bultos y sueltas); acá hay UNO, en la unidad en
//     que se pidió—;
//   · el cuerpo de "✓ Guardar": lo mismo que la hoja del celular manda a
//     `detalle/editar`;
//   · el estado en texto de una fila resuelta: "✓ Va completo",
//     "✓ Corregido · va 12", "✓ Pesado · 1,853 kg", "No hay".
//
// Puro: lo leen la pantalla y los candados.

import { estaRevisada, loPedido } from "./revisionDeLinea.js";
import {
  ESTADO_PREPARACION,
  TEXTO_NO_HAY,
  enUnidades,
  esAgregada,
  estadoDePreparacion,
  pidioEnUnidades,
  sePesa,
  textoDelCambio,
  textoVa,
} from "./preparacionDelPedido.js";
import { PRESENTACION } from "@/lib/productos/presentacionDeProducto";
import { fmtCantidadDeEnvio } from "@/lib/transferencias/presentacionEnvio";

/** Un peso escrito: entero, o con coma (o punto) y hasta tres decimales. COPIA de `KILOS_ESCRITOS` del celular. */
export const KILOS_ESCRITOS = /^\d+([.,]\d{1,3})?$/;

/** Kilos como se escriben en el campo: "1,850". COPIA de `textoDeKilos` del celular. */
export const textoDeKilos = (n) => Number(n || 0).toFixed(3).replace(".", ",");

/** Lo escrito en el campo, como número; `null` si no es un número. */
export function numeroEscrito(texto, { decimales = false } = {}) {
  const t = String(texto ?? "").trim();
  if (decimales ? !KILOS_ESCRITOS.test(t) : !/^\d+$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

/**
 * En qué unidad escribe el campo VA de un renglón que no se pesa: en bultos si
 * se pidió en bultos y lo decidido —si lo hay— cae en bultos enteros; si no,
 * en unidades (una corrección con sueltas hecha en el celular).
 */
export function unidadDelCampo(l) {
  const pedido = loPedido(l);
  if (pedido.unidad !== "BULTO") return "UNIDAD";
  if (!estaRevisada(l)) return "BULTO";
  const u = enUnidades(l.preparado, l.unidadPreparada || l.unidadSugerida, l.factorPack);
  return u % pedido.factorPack === 0 ? "BULTO" : "UNIDAD";
}

/**
 * Con qué arranca el campo VA. Pendiente: lo pedido —en kilos si se pidió en
 * kilos; vacío si es por peso y se pidió en unidades: hay que pesarlo—.
 * Resuelto: lo decidido.
 */
export function valorInicialDeVa(l) {
  if (sePesa(l)) {
    if (estaRevisada(l)) return textoDeKilos(l.preparado);
    return pidioEnUnidades(l) ? "" : textoDeKilos(l.sugerido);
  }
  if (!estaRevisada(l)) return String(loPedido(l).cantidad);
  const u = enUnidades(l.preparado, l.unidadPreparada || l.unidadSugerida, l.factorPack);
  return String(unidadDelCampo(l) === "BULTO" ? u / loPedido(l).factorPack : u);
}

/**
 * Lo que manda "✓ Guardar" con lo escrito en VA, o `null` si lo escrito no es
 * una cantidad. Lo que se pesa va en kilos (`UNIDAD` de un producto en kg),
 * como la hoja del celular.
 */
export function cuerpoDeVa(l, texto) {
  if (sePesa(l)) {
    const kilos = numeroEscrito(texto, { decimales: true });
    return kilos == null ? null : { preparado: kilos, unidadPreparada: "UNIDAD" };
  }
  const n = numeroEscrito(texto);
  return n == null ? null : { preparado: n, unidadPreparada: unidadDelCampo(l) };
}

/** ¿Lo escrito en VA es distinto de con qué arrancó? */
export function vaCambio(l, texto) {
  if (texto == null) return false;
  const inicial = valorInicialDeVa(l);
  const decimales = sePesa(l);
  const a = numeroEscrito(texto, { decimales });
  const b = numeroEscrito(inicial, { decimales });
  return a == null || b == null ? String(texto).trim() !== inicial : a !== b;
}

/** El estado de un renglón resuelto, en el primer lugar de las acciones. */
export function estadoEnTexto(l) {
  const estado = estadoDePreparacion(l);
  if (estado === ESTADO_PREPARACION.PENDIENTE) return null;
  if (Number(l.preparado || 0) === 0) return TEXTO_NO_HAY;
  if (esAgregada(l)) return `✓ ${textoDelCambio(l)}`;
  if (sePesa(l) && (estado === ESTADO_PREPARACION.CON_CAMBIOS || pidioEnUnidades(l))) {
    return `✓ Pesado · ${fmtCantidadDeEnvio(l.preparado, PRESENTACION.KG)} kg`;
  }
  if (estado === ESTADO_PREPARACION.COMPLETO) return "✓ Va completo";
  return `✓ Corregido · ${textoVa(l)}`;
}
