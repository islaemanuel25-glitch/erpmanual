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
// ── Y POR QUÉ NO VA AL KIT ────────────────────────────────────────────────
//
// Porque sabe de dominio: importa `UNIDADES` de `periodoDePago`, que es el
// vocabulario con el que este negocio paga. Una pieza del kit que conociera
// "SEMANA" dejaría de ser del kit. Lo que sí sale del kit es de lo que está
// hecho: `SunmiButton`, con su negociación de clases.
//
// ── LO QUE NO DECIDE ──────────────────────────────────────────────────────
//
// Qué hace "Otro". Avisa que lo eligieron y nada más; el calendario lo abre la
// pantalla, con `SunmiDateRangePicker`, que ya está en el kit y no se rediseña.

import SunmiButton from "@/components/sunmi/SunmiButton";
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
export default function ChipsDePeriodo({
  valor = UNIDADES.SEMANA,
  onCambiar,
  className = "",
  deshabilitadas = [],
}) {
  const apagadas = new Set(deshabilitadas || []);
  return (
    // `gap-1.5` son 5,25 px: el 6 de la especificación ajustado a la escala del
    // proyecto, donde 1rem = 14 px. Por qué se ajusta en vez de entrar al
    // config está en docs/roadmap/rediseno-transferencias-movil.md.
    <div role="group" aria-label="Período" className={`flex gap-1.5 ${className}`}>
      {OPCIONES_DE_PERIODO.map((o) => {
        const activo = o.clave === valor;
        const apagado = apagadas.has(o.clave);
        return (
          <SunmiButton
            key={o.clave}
            type="button"
            color={activo ? "primary" : "slate"}
            aria-pressed={activo}
            // `disabled` solo cuando la pantalla lo pidió. Sin la prop, esto es
            // `false` y el atributo no se emite: el marcado queda idéntico al
            // que las dos pantallas de hoy ya dibujan.
            disabled={apagado || undefined}
            // El motivo, para quien pase el dedo por encima y para el lector de
            // pantalla. Un control apagado sin explicación se lee como roto.
            title={apagado ? "Todavía no disponible" : undefined}
            onClick={apagado ? undefined : () => onCambiar?.(o.clave)}
            // `flex-1 basis-0` y no solo `flex-1`: sin base cero los cuatro se
            // reparten el sobrante y no el ancho, así que "Semana" quedaría más
            // ancho que "Día" por tener más letras. La especificación pide FILL,
            // que son cuatro iguales.
            //
            // El resto son los ejes que `SunmiButton` cede cuando la pantalla
            // los declara: alto, padding, radio, tamaño y peso de letra.
            className={`flex-1 basis-0 justify-center py-2.5 px-1 rounded-lg text-sm3 ${
              activo ? "font-semibold" : "font-medium"
            }`}
          >
            {o.texto}
          </SunmiButton>
        );
      })}
    </div>
  );
}
