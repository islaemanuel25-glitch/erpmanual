"use client";

// EL SELECTOR "Ver precios por: Pack | Un".
//
// Dos botones pegados que cambian en qué unidad se leen los precios de TODA la
// lista de una vez. Está acá y no adentro del catálogo porque el pedido usa el
// mismo control por línea — es la segunda pantalla que lo necesita, no una
// hipótesis.
//
// ── POR QUÉ DOS BOTONES Y NO UN DESPLEGABLE ───────────────────────────────
//
// Son dos opciones y se alternan seguido: un desplegable cuesta dos toques y
// esconde la que no está elegida. Con los dos a la vista se ve en qué unidad se
// está leyendo sin abrir nada, que es la pregunta que se hace mirando el precio.
//
// ── LOS PRODUCTOS POR KILO NO TIENEN BULTO ────────────────────────────────
//
// El selector no los toca: siguen en precio por kilo se elija lo que se elija.
// Por eso la nota de abajo lo dice en la pantalla, en vez de dejar que alguien
// concluya que el selector no funciona.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { componerClaseTexto } from "@/lib/sunmi/claseNegociada";

export const UNIDAD = Object.freeze({ PACK: "pack", UN: "un" });

export default function SunmiSelectorUnidad({
  valor = UNIDAD.PACK,
  onCambiar,
  rotulo = "Ver precios por",
  nota = null,
  className = "",
}) {
  const opciones = [
    { clave: UNIDAD.PACK, texto: "Pack" },
    { clave: UNIDAD.UN, texto: "Un" },
  ];

  return (
    <div className={["sunmi-surface-soft border-b sunmi-divider px-3 pb-2 pt-[9px]", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={componerClaseTexto({
            base: "",
            tamano: "text-[11.5px]",
            color: "[color:var(--pos-muted-strong)]",
            pedido: className,
          })}
        >
          {rotulo}
        </span>

        {/* PEGADOS, PERO EL RADIO LO PONE EL ENVOLTORIO Y NO LOS BOTONES.
            La primera versión les daba `rounded-r-none` / `rounded-l-none` y un
            candado la frenó con el motivo exacto: `SunmiButton` cede las OCHO
            esquinas en cuanto el consumidor declara un radio, y un token de un
            solo lado repone cuatro — las otras cuatro se perdían y el par salía
            con dos esquinas cuadradas de más.

            Recortando desde el contenedor se ve igual —extremos redondeados,
            unión recta— sin que los botones declaren radio y sin tocar el kit. */}
        <div className="flex rounded-[10px] overflow-hidden">
          {opciones.map((o, i) => (
            <SunmiButton
              key={o.clave}
              type="button"
              color={valor === o.clave ? "primary" : "slate"}
              aria-pressed={valor === o.clave}
              onClick={() => onCambiar?.(o.clave)}
              className={i === 0 ? "-mr-px" : ""}
            >
              {o.texto}
            </SunmiButton>
          ))}
        </div>
      </div>

      {nota && (
        <div
          className={componerClaseTexto({
            base: "pt-1",
            tamano: "text-[10.5px]",
            color: "sunmi-text-muted",
            pedido: className,
          })}
        >
          {nota}
        </div>
      )}
    </div>
  );
}
