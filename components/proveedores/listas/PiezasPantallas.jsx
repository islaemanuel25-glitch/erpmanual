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

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { textoDelCostoSospechoso } from "@/lib/proveedores/listas/costoSospechoso";

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
 * LA TARJETA GRANDE DEL NÚMERO QUE IMPORTA.
 *
 * Verde: lo que está listo. Es lo primero que se lee al abrir la pantalla, así
 * que el número va en grande y el resto abajo.
 */
export function TarjetaGrande({ numero, titulo, detalle, tono = "success", onClick, ariaLabel }) {
  const fondo = tono === "success" ? "sunmi-state-success" : "sunmi-state-warning";
  const cuerpo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-4xl font-bold leading-none tabular-nums">{numero}</div>
        <div className="mt-3 text-base font-semibold">{titulo}</div>
        {detalle && <div className="mt-1 text-sm2 leading-snug">{detalle}</div>}
      </div>
      {onClick && <Chevron />}
    </>
  );
  if (!onClick) {
    return <SunmiCard className={`p-4 ${fondo}`}><div className="flex items-center gap-2">{cuerpo}</div></SunmiCard>;
  }
  return (
    <SunmiButton
      color="ghost"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-full block rounded-xl p-4 text-left min-h-toque ${fondo}`}
    >
      <span className="flex items-center gap-2">{cuerpo}</span>
    </SunmiButton>
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
 * LA TARJETA ANCHA: un titular largo y su explicación, tocable.
 *
 * No es una `TarjetaChica` estirada: ahí el número manda y el texto es la
 * etiqueta. Acá manda la frase —"Tus productos de M Y F que no cambian · 117"—
 * porque el número solo no se entiende sin ella.
 */
export function TarjetaAncha({ titulo, detalle, onClick, ariaLabel }) {
  return (
    <SunmiButton
      color="ghost"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-full block rounded-xl p-3 text-left min-h-toque sunmi-surface-soft"
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm3 font-semibold sunmi-text-strong leading-snug">{titulo}</span>
          {detalle && (
            <span className="block mt-1 text-sm2 sunmi-text-muted leading-snug">{detalle}</span>
          )}
        </span>
        <Chevron />
      </span>
    </SunmiButton>
  );
}

/**
 * Una tarjeta chica con un número y dos renglones.
 *
 * Es un BOTÓN cuando lleva a algún lado, y un bloque cuando no. La diferencia
 * tiene que verse y tiene que poder tocarse: una tarjeta que lleva a otra
 * pantalla y no parece tocable es una pantalla sin salida.
 */
export function TarjetaChica({ numero, titulo, detalle, tono = "muted", onClick, ariaLabel }) {
  const fondo =
    tono === "warning" ? "sunmi-state-warning" : tono === "danger" ? "sunmi-state-danger" : "sunmi-surface-soft";
  // La flecha va PEGADA al número, en su renglón, y no centrada al alto de la
  // tarjeta: las dos tarjetas de una fila pueden tener títulos de distinto largo
  // —"para revisar" contra "de la lista que no tenés"— y con la flecha centrada
  // las dos quedaban a alturas distintas.
  const cuerpo = (
    <>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 text-2xl font-bold leading-none tabular-nums">{numero}</div>
        {onClick && <Chevron />}
      </div>
      <div className="mt-2 text-sm2 font-semibold">{titulo}</div>
      {detalle && <div className="text-xs2 sunmi-text-muted">{detalle}</div>}
    </>
  );
  if (!onClick) {
    return <div className={`rounded-xl p-3 min-h-toque ${fondo}`}>{cuerpo}</div>;
  }
  // `ghost` es la ausencia de relleno: no pinta fondo ni texto, así que el tono
  // lo pone la clase del tema y el botón conserva el alto de toque y el foco del
  // kit. Un `<button>` a mano acá perdería las dos cosas.
  return (
    <SunmiButton
      color="ghost"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded-xl p-3 text-left w-full min-h-toque block ${fondo}`}
    >
      {cuerpo}
    </SunmiButton>
  );
}

/**
 * Una fila de "esto va a pasar": nombre, el costo de hoy, el nuevo, y el salto.
 *
 * El porcentaje viene calculado del servidor. Recalcularlo acá con los dos
 * costos redondeados daría un número apenas distinto del que el motor usó para
 * decidir, y sería el que el usuario ve.
 */
export function FilaDeCambio({ nombre, costoAnterior, costoNuevo, variacionPct, detalle }) {
  return (
    <div className="flex items-center gap-2 py-2 min-h-toque">
      <div className="min-w-0 flex-1">
        <div className="text-sm2 sunmi-text-strong truncate" title={nombre}>{nombre}</div>
        <div className="text-sm2 sunmi-text-muted tabular-nums">
          {money(costoAnterior)} → <span className="sunmi-text-strong">{money(costoNuevo)}</span>
        </div>
        {detalle && <div className="text-xs2 sunmi-text-muted">{detalle}</div>}
      </div>
      <div className="text-sm2 font-semibold tabular-nums sunmi-text-success shrink-0">{pct(variacionPct)}</div>
    </div>
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

/** Tres números en fila: costo hoy · dice la lista · cambio. */
export function TresCifras({ costoAnterior, diceLaLista, variacionPct, tonoVariacion = "sunmi-text-warning" }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Cifra rotulo="Costo hoy" valor={money(costoAnterior)} />
      <Cifra rotulo="Dice la lista" valor={money(diceLaLista)} />
      <Cifra rotulo="Cambio" valor={pct(variacionPct)} tono={tonoVariacion} />
    </div>
  );
}

function Cifra({ rotulo, valor, tono = "sunmi-text-strong" }) {
  return (
    <div className="min-w-0">
      <div className="text-xs2 sunmi-text-muted">{rotulo}</div>
      <div className={`text-sm2 font-semibold tabular-nums truncate ${tono}`}>{valor}</div>
    </div>
  );
}

/**
 * Una fila de la lista de motivos: título, cantidad, y si está elegida.
 *
 * Es un botón de alto completo porque se toca con el pulgar en un teléfono.
 */
export function FilaMotivo({ titulo, cantidad, elegido, onClick }) {
  return (
    <SunmiButton
      color="ghost"
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      className={`w-full flex items-center justify-between gap-2 px-3 min-h-toque rounded-lg text-left ${
        elegido ? "sunmi-state-warning font-semibold" : "sunmi-surface-soft"
      }`}
    >
      <span className="text-sm2 truncate">{titulo}</span>
      <span className="text-sm2 font-semibold tabular-nums shrink-0">{cantidad}</span>
    </SunmiButton>
  );
}

/** El par de botones de una fila para revisar: dejar / usar. */
export function AccionesDeFila({ textoUsar, onDejar, onUsar, trabajando, deshabilitarUsar }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SunmiButton
        color="slate"
        onClick={onDejar}
        disabled={trabajando}
        className="min-h-toque text-sm2"
      >
        Dejar como está
      </SunmiButton>
      <SunmiButton
        color="cyan"
        onClick={onUsar}
        disabled={trabajando || deshabilitarUsar}
        className="min-h-toque text-sm2"
      >
        {textoUsar}
      </SunmiButton>
    </div>
  );
}

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
