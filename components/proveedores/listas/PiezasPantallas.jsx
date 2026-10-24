"use client";

// LAS PIEZAS DE LAS SEIS PANTALLAS DE LISTAS.
//
// ── POR QUÉ ESTÁN ACÁ Y NO EN CADA PANTALLA ─────────────────────────────────
//
// Porque cada una aparece en más de una. La tarjeta grande con el número vive en
// la de resultado y en el fondo de la de confirmar; la fila de "costo hoy →
// costo nuevo" vive en resultado, en revisar y en la confirmación de columnas.
// Escritas dos veces se separan el día que alguien corrige una.
//
// ── LO QUE ESTAS PIEZAS NO HACEN ────────────────────────────────────────────
//
// No cargan datos ni deciden nada. Reciben lo que ya calculó el servidor y lo
// dibujan. Ningún porcentaje se recalcula acá: el que se muestra es el mismo que
// el motor miró para decidir.
//
// Todas se arman con piezas del kit y con las clases semánticas del tema, así que
// funcionan igual en claro y en oscuro sin que ninguna sepa cuál está puesto.

import SunmiPill from "@/components/sunmi/SunmiPill";
import { Check } from "lucide-react";
import { textoDelCostoSospechoso } from "@/lib/proveedores/listas/costoSospechoso";
import { esMismoPrecio } from "@/lib/proveedores/listas/rangoAumento";

/** El peso en pesos, con el formato de siempre. */
export function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
}

/** Un porcentaje con su signo, que es lo que hace legible un aumento. */
export function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const redondeado = Math.round(n * 10) / 10;
  const texto = redondeado.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${redondeado > 0 ? "+" : ""}${texto} %`;
}

/**
 * EL COLOR DE UN PORCENTAJE DICE SOLO PARA DÓNDE VA (Emanuel, 2026-10-24).
 *
 * Verde sube, rojo baja, gris es el mismo precio. Antes un porcentaje fuera del
 * rango salía en ámbar aunque subiera —ALICANTE PEREJIL, +14,3 %— y el ámbar
 * rojizo se leía como una baja. Que esté fuera del rango se dice APARTE, con
 * `EtiquetaFueraDeRango`: son dos datos y no pueden pelear por el mismo color.
 *
 * "Mismo precio" es la misma tolerancia de la tarjeta (`esMismoPrecio`), no una
 * escrita acá.
 */
export function tonoDelPorcentaje(variacionPct) {
  if (variacionPct === null || variacionPct === undefined) return "sunmi-text-muted";
  const v = Number(variacionPct);
  if (!Number.isFinite(v) || esMismoPrecio(v)) return "sunmi-text-muted";
  return v > 0 ? "sunmi-text-success" : "sunmi-text-danger";
}

export const TEXTO_FUERA_DE_RANGO = "Fuera de rango";

/** La marca de fuera de rango, chica y ámbar, a la izquierda del porcentaje. */
export function EtiquetaFueraDeRango() {
  return <SunmiPill color="amber">{TEXTO_FUERA_DE_RANGO}</SunmiPill>;
}

/**
 * UNA OPCIÓN DE UNA LISTA DE OPCIONES, ELEGIDA O NO (2026-10-24).
 *
 * El renglón elegido en la hoja de vincular solo tenía un borde fino de acento
 * y casi no se distinguía. Elegido: fondo de acento suave, borde de 2 px de
 * acento (`sunmi-opcion-elegida`, del kit) y el ✓ en un círculo de acento. No
 * elegido: la superficie de la tarjeta y el borde suave del tema.
 */
export const CLASE_OPCION = "border sunmi-border sunmi-card-surface";
export const CLASE_OPCION_ELEGIDA = "sunmi-opcion-elegida";

/** El ✓ de la opción elegida, grande y en un círculo de acento. */
export function MarcaDeElegida() {
  return (
    <span className="shrink-0 grid place-items-center size-7 rounded-full sunmi-badge-accent" aria-hidden="true">
      <Check size={18} strokeWidth={3} />
    </span>
  );
}

/**
 * LA FLECHA QUE DICE QUE LA TARJETA SE TOCA.
 *
 * ── POR QUÉ UNA PIEZA PARA UN CARÁCTER ─────────────────────────────────────
 *
 * Porque lo que importa no es el glifo sino que TODAS las tarjetas tocables lo
 * tengan y ninguna de las otras. Emanuel tocó la tarjeta verde del resultado
 * esperando ver los 111 y no pasó nada: la de "para revisar" llevaba a algún
 * lado y la verde no, y desde afuera se veían iguales.
 *
 * `aria-hidden` porque no aporta nada leído: el nombre accesible del botón ya
 * dice a dónde va.
 */
export function Chevron() {
  return (
    <span aria-hidden="true" className="shrink-0 text-2xl leading-none sunmi-text-muted">
      ›
    </span>
  );
}

/**
 * EL AVISO DE QUE EL COSTO DE HOY PARECE PUESTO A MANO.
 *
 * Aparece en la lista de los que se actualizan y en la revisión de a uno, que
 * son los dos lugares donde se mira un porcentaje calculado contra ese costo.
 * El porqué —y cuándo se considera sospechoso— está en `costoSospechoso.js`.
 *
 * No bloquea nada: es un renglón, en ámbar, al lado del número que pone en
 * duda. Un costo redondo puede ser real.
 */
export function AvisoCostoRedondo({ costo }) {
  return (
    <span className="block text-xs2 sunmi-text-warning leading-snug">
      {textoDelCostoSospechoso(costo)}
    </span>
  );
}

// ── SE FUERON LAS TARJETAS DE LA REVISIÓN VIEJA (2026-10-24) ───────────────
//
// `TarjetaGrande`, `TarjetaAncha`, `TarjetaChica`, `FilaDeCambio`,
// `TresCifras`, `FilaMotivo` y `AccionesDeFila` eran del resultado anterior al
// de la recepción de transferencias, y ninguna pantalla las importaba más.

// ── SE FUERON `VolverDelModulo` Y `Encabezado` ─────────────────────────────
//
// Eran el volver y el título propios del módulo, dibujados como primer hijo del
// contenido. Dos problemas, y el segundo es el que Emanuel vio:
//
//   1. **Ya existían en el kit.** `SunmiBackButton` es la pieza de volver del
//      proyecto y la usan 32 pantallas; `useTituloDePagina` es el slot por donde
//      una pantalla le pone título a la fila del shell. Tener una copia propia
//      es tener dos piezas que se separan el día que alguien corrige una — que
//      es justamente lo que había pasado: el volver del módulo medía distinto
//      que el del resto de la aplicación.
//
//   2. **Estaban adentro de `<main>`, que es el que scrollea.** En el resultado,
//      que es largo, el volver se iba de pantalla apenas se bajaba. La fila del
//      shell vive AFUERA de ese scroll: ahí no se puede ir ni se puede tapar.
//
// Lo que el módulo necesitaba y el kit no tenía era poder NOMBRAR el destino
// —"‹ Resultado", "‹ Listas"— y eso se le agregó al kit, con "Volver" de
// default para que las 32 pantallas que ya lo usan queden idénticas.


/** Un aviso con el motivo, para cuando algo no se pudo hacer. */
export function Aviso({ tono = "warning", children }) {
  const clase =
    tono === "danger" ? "sunmi-state-danger" : tono === "success" ? "sunmi-state-success" : "sunmi-state-warning";
  return <div className={`rounded-lg p-3 text-sm2 leading-snug ${clase}`}>{children}</div>;
}
