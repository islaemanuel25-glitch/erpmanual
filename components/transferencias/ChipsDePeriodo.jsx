"use client";

// components/transferencias/ChipsDePeriodo.jsx
//
// DÍA · SEMANA · MES · OTRO, los cuatro repartiéndose el ancho.
//
// ── POR QUÉ NO ES `SunmiChipsFiltro` ──────────────────────────────────────
//
// Aquélla es una fila que SCROLLEA, con una opción "Todas" y la posibilidad de
// no tener ninguna elegida: es un filtro por taxonomía, y está bien así —con
// diez categorías no hay ancho que alcance—. Acá son cuatro opciones fijas, uno
// siempre elegido y ninguno puede quedar fuera de la vista: es un selector de
// período, no un filtro. Forzar aquélla habría pedido un `modo="fill"`, un
// `textoTodas={null}` y un valor que nunca puede ser nulo — tres excepciones
// para que una pieza haga lo contrario de lo que la hizo existir.
//
// ── Y POR QUÉ ESTE ARCHIVO NO VA AL KIT, PERO SU DIBUJO SÍ ────────────────
//
// Porque sabe de dominio: importa `UNIDADES` de `periodoDePago`, que es el
// vocabulario con el que este negocio paga. Una pieza del kit que conociera
// "SEMANA" dejaría de ser del kit.
//
// Lo que NO sabe de dominio —los botones que se reparten el ancho, uno elegido—
// se sacó al kit como `SunmiSelectorDeOpciones` cuando Pagos a proveedores
// necesitó lo mismo para Pendientes / Pagados / Todos. Acá quedan las cuatro
// opciones de período y la etiqueta; el marcado es el mismo que antes.
//
// ── LO QUE NO DECIDE ──────────────────────────────────────────────────────
//
// Qué hace "Otro". Avisa que lo eligieron y nada más; el calendario lo abre la
// pantalla, con `SunmiDateRangePicker`, que ya está en el kit y no se rediseña.

import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";

/** No es una unidad de `periodoDePago`: es "elegí vos las fechas". */
export const CLAVE_OTRO = "OTRO";

export const OPCIONES_DE_PERIODO = Object.freeze([
  { clave: UNIDADES.DIA, texto: "Día" },
  { clave: UNIDADES.SEMANA, texto: "Semana" },
  { clave: UNIDADES.MES, texto: "Mes" },
  { clave: CLAVE_OTRO, texto: "Otro" },
]);

/**
 * ── `deshabilitadas` ─────────────────────────────────────────────────────
 *
 * Qué chips se dibujan APAGADOS. Vacío por defecto, así que las dos pantallas
 * que ya usaban esta pieza —la cuenta de transferencias y la recepción de
 * mercadería— no cambian ni un píxel: sin la prop, ningún chip queda
 * deshabilitado y el `disabled` no llega al botón.
 *
 * Lo pidió Finanzas, que calcula Día, Semana y Mes y todavía NO tiene un
 * selector de rango para "Otro". Las dos salidas que había eran peores:
 *
 *   · no dibujar el chip — los cuatro se reparten el ancho con `flex-1 basis-0`,
 *     así que con tres cambia el ancho de los otros y la pantalla se ve distinta
 *     de la de transferencias sin que eso signifique nada;
 *   · dejarlo tocable y que caiga a Semana — es lo que hacen hoy las otras dos
 *     pantallas, y es justamente lo que no se quiere repetir: el chip se ve
 *     elegido y el período que se muestra es otro.
 *
 * Apagado dice la verdad: existe, y todavía no.
 */
export default function ChipsDePeriodo({ valor = UNIDADES.SEMANA, onCambiar, deshabilitadas = [] }) {
  // El `className` que aceptaba antes no lo pasaba ninguna de las tres pantallas
  // que lo usan, y concatenado no negociaba: se fue con el marcado al kit.
  return (
    <SunmiSelectorDeOpciones
      opciones={OPCIONES_DE_PERIODO}
      valor={valor}
      onCambiar={onCambiar}
      etiqueta="Período"
      deshabilitadas={deshabilitadas}
    />
  );
}
