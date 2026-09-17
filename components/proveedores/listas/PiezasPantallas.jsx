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
export function TarjetaGrande({ numero, titulo, detalle, tono = "success" }) {
  const fondo = tono === "success" ? "sunmi-state-success" : "sunmi-state-warning";
  return (
    <SunmiCard className={`p-4 ${fondo}`}>
      <div className="text-4xl font-bold leading-none tabular-nums">{numero}</div>
      <div className="mt-3 text-base font-semibold">{titulo}</div>
      {detalle && <div className="mt-1 text-sm2 leading-snug">{detalle}</div>}
    </SunmiCard>
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
  const cuerpo = (
    <>
      <div className="text-2xl font-bold leading-none tabular-nums">{numero}</div>
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

/** El encabezado de una pantalla: de dónde se vuelve, y de qué se está hablando. */
/**
 * EL VOLVER DEL MÓDULO. Uno solo, igual en las cinco pantallas.
 *
 * ── POR QUÉ ES UNA PIEZA Y NO UN BOTÓN EN CADA PANTALLA ────────────────────
 *
 * Porque cada pantalla lo escribió por su cuenta y salieron distintos: distinto
 * tamaño de letra, distinto alto de toque, y en una faltaba. Emanuel llegó a la
 * pantalla vieja del detalle por un "Volver al historial" que ninguna otra
 * pantalla tenía.
 *
 * El destino lo pone quien la usa —Resultado vuelve al listado, Revisar y Se
 * actualizan vuelven a Resultado, Subir vuelve al listado, el listado vuelve a
 * Compras— porque eso sí es propio de cada pantalla. Lo que no cambia es cómo se
 * ve y que se pueda tocar con el pulgar.
 */
export function VolverDelModulo({ texto, onVolver }) {
  if (!onVolver) return null;
  return (
    <SunmiButton
      color="ghost"
      type="button"
      onClick={onVolver}
      className="text-sm2 sunmi-text-muted inline-flex items-center gap-1 min-h-toque min-w-toque px-2 justify-start"
    >
      ‹ {texto}
    </SunmiButton>
  );
}

export function Encabezado({ volverTexto, onVolver, titulo, subtitulo }) {
  return (
    <div className="space-y-1">
      <VolverDelModulo texto={volverTexto} onVolver={onVolver} />
      <h1 className="text-xl font-bold sunmi-text-strong leading-tight">{titulo}</h1>
      {subtitulo && <p className="text-sm2 sunmi-text-muted leading-snug">{subtitulo}</p>}
    </div>
  );
}

/** Un aviso con el motivo, para cuando algo no se pudo hacer. */
export function Aviso({ tono = "warning", children }) {
  const clase =
    tono === "danger" ? "sunmi-state-danger" : tono === "success" ? "sunmi-state-success" : "sunmi-state-warning";
  return <div className={`rounded-lg p-3 text-sm2 leading-snug ${clase}`}>{children}</div>;
}
