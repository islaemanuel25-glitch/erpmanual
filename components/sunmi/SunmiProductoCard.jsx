"use client";

// LA TARJETA DE PRODUCTO, con su capa de acciones.
//
// ── POR QUÉ NACE EN EL KIT Y NO ADENTRO DE LA PANTALLA DE PRODUCTOS ────────
//
// Porque no es del catálogo: es la tarjeta de producto del ERP. El mismo núcleo
// —nombre, empresa, equivalencia y pie de códigos— se repite en stock y en
// pedido, y lo único que cambia es QUÉ muestra en grande y QUÉ se puede tocar.
// Escrita adentro de `productos/page.jsx`, la próxima pantalla la copia, y ahí
// ya son dos que se rompen el día que una cambie.
//
// ── LAS DOS RANURAS ───────────────────────────────────────────────────────
//
// `valor`    — lo que esa pantalla muestra en grande. Catálogo: el precio.
//              Stock: existencia y mínimo. Pedido: el subtotal.
// `acciones` — lo que se puede tocar, dibujado en una capa SOBRE la tarjeta.
//              Catálogo: Información y Editar. Pedido: el selector y la cantidad.
//
// El núcleo NO es ranura a propósito: si cada pantalla pudiera reordenarlo,
// dejaría de reconocerse como la misma tarjeta.
//
// ── LA CAPA ES TRANSLÚCIDA, Y ESO NO ES DECORACIÓN ────────────────────────
//
// Se lee el producto entero por detrás mientras se decide. Por eso el fondo va
// al 50 % y el difuminado es de 0,4 px: subirlo tapa el dato que la persona
// está mirando para decidir. Y los botones NO van centrados: van a la altura de
// la banda de equivalencia, para dejar libre el precio grande.
//
// ── NEGOCIA, COMO EL RESTO DEL KIT ────────────────────────────────────────
//
// Acepta `className` y cede por eje: si la pantalla declara tamaño de letra,
// color, padding, fondo o borde, la pieza no pone el suyo. Los valores de acá
// son el DEFAULT, no una imposición — dos clases de la misma familia tienen la
// misma especificidad y ganaría cualquiera.
//
// ── LOS COLORES SON TOKENS, NO LOS HEX DEL PROTOTIPO ──────────────────────
//
// El handoff da `#7C3AED`, `#FAF7FF`, `#E7DDF7`, `#1E1B2E`, `#6B6478`… y son,
// uno por uno, los valores que `violetaSaas` ya tiene en sus tokens. Escribirlos
// fijos haría dos daños: la tarjeta se vería igual en los catorce temas —o sea,
// mal en trece— y cada uno subiría el contador de hardcodeo. Así que se usan los
// tokens; en `violetaSaas` dan exactamente los colores del prototipo.
//
// La única diferencia medida: el bloque de equivalencia pide `#F5F0FF` y se usa
// `--hover-bg`, que en este tema es `#F1E8FF`. No existe token para `#F5F0FF` y
// no se inventa uno acá — definir un token nuevo es una tanda de catorce temas.

import SunmiPanel from "@/components/sunmi/SunmiPanel";
import {
  componerClaseTexto,
  paddingQueSobrevive,
  declaraDisplay,
} from "@/lib/sunmi/claseNegociada";

/** El padding del cuerpo. Cede por eje si la pantalla declara el suyo. */
// `pt-3.5` y `pb-3` son 14 y 12 px en la escala de Tailwind: mismo píxel que el
// prototipo, sin clase arbitraria. Los 13 px del eje horizontal no tienen
// equivalente en la escala, así que ése sí va escrito.
const PADDING = "px-[13px] pt-3.5 pb-3";

export default function SunmiProductoCard({
  nombre,
  empresa = null,
  equivalencia = null,
  codigoBarra = null,
  codigoInterno = null,
  valor = null,
  acciones = null,
  abierta = false,
  onToggle = null,
  className = "",
}) {
  const padding = paddingQueSobrevive(PADDING, className);
  // `relative` y `overflow-hidden` no ceden: son lo que mantiene la capa DENTRO
  // de esta tarjeta. Sin ellos se derrama sobre las vecinas.
  const contenedor = [
    "relative overflow-hidden",
    declaraDisplay(className) ? "" : "flex flex-col",
    "gap-[11px]",
    padding,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SunmiPanel noPadding className={className}>
      <div
        className={contenedor}
        onClick={onToggle ?? undefined}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        onKeyDown={
          onToggle
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(e);
                }
              }
            : undefined
        }
      >
        {/* 1 · NOMBRE. Envuelve, nunca se corta: los reales son largos y a veces
            en mayúsculas, y recortarlos esconde justo lo que distingue un
            producto de otro. */}
        <div
          className={componerClaseTexto({
            base: "font-semibold leading-[1.3] [text-wrap:pretty] [overflow-wrap:anywhere]",
            tamano: "text-[15px]",
            color: "sunmi-text-strong",
            pedido: className,
          })}
        >
          {nombre}
        </div>

        {/* 2 · EMPRESA. Envuelve igual — es uno de los datos que se leen para
            decidir, así que no lleva ellipsis. */}
        {empresa && (
          <div
            className={componerClaseTexto({
              base: "leading-[1.35] [overflow-wrap:anywhere]",
              tamano: "text-[11.5px]",
              color: "sunmi-text-muted",
              pedido: className,
            })}
          >
            {empresa}
          </div>
        )}

        {/* 3 · LA RANURA DEL VALOR. En el catálogo, el precio. */}
        {valor && (
          <div className="flex justify-end items-baseline gap-1.5 min-h-[30px]">
            {valor}
          </div>
        )}

        {/* 4 · EQUIVALENCIA. Bloque tenue: explica de dónde sale el número de
            arriba, que es la pregunta que más se hace con un precio por bulto. */}
        {equivalencia && (
          <div
            className={componerClaseTexto({
              base: "rounded-lg px-[9px] py-[7px] leading-[1.4] [background:var(--hover-bg)]",
              tamano: "text-[11px]",
              color: "[color:var(--pos-muted-strong)]",
              pedido: className,
            })}
          >
            {equivalencia}
          </div>
        )}

        {/* 5 y 6 · EL PIE DE CÓDIGOS. Monoespaciada y con cifras tabulares: se
            comparan de un vistazo contra una etiqueta o un remito. */}
        {(codigoBarra || codigoInterno) && (
          <div
            className={componerClaseTexto({
              base: "flex justify-between gap-2 border-t sunmi-divider pt-[9px] font-mono [font-variant-numeric:tabular-nums]",
              tamano: "text-[10.5px]",
              color: "sunmi-text-muted",
              pedido: className,
            })}
          >
            <span>{codigoBarra}</span>
            {codigoInterno && <span>#{codigoInterno}</span>}
          </div>
        )}

        {/* LA CAPA. Sobre esta tarjeta y ninguna otra: la lista no se mueve ni
            cambia de alto al abrirla. */}
        {abierta && acciones && (
          <div
            // El velo sale del FONDO DE LA TARJETA, no de un blanco fijo. El
            // prototipo dice `rgba(255,255,255,.5)` y en `violetaSaas` es lo
            // mismo —la tarjeta es blanca— pero escrito fijo, en los cinco temas
            // oscuros quedaría un velo blanco sobre una tarjeta negra.
            className="absolute inset-0 flex items-end justify-center gap-2.5 pb-10 [background:color-mix(in_srgb,var(--card-bg)_50%,transparent)] [backdrop-filter:blur(.4px)]"
            onClick={onToggle ?? undefined}
          >
            {acciones}
          </div>
        )}
      </div>
    </SunmiPanel>
  );
}
