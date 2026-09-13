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

export default function ChipsDePeriodo({ valor = UNIDADES.SEMANA, onCambiar, className = "" }) {
  return (
    // `gap-1.5` son 5,25 px: el 6 de la especificación ajustado a la escala del
    // proyecto, donde 1rem = 14 px. Por qué se ajusta en vez de entrar al
    // config está en docs/roadmap/rediseno-transferencias-movil.md.
    <div role="group" aria-label="Período" className={`flex gap-1.5 ${className}`}>
      {OPCIONES_DE_PERIODO.map((o) => {
        const activo = o.clave === valor;
        return (
          <SunmiButton
            key={o.clave}
            type="button"
            color={activo ? "primary" : "slate"}
            aria-pressed={activo}
            onClick={() => onCambiar?.(o.clave)}
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
