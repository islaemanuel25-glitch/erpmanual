"use client";

// LA CABECERA DE LA PANTALLA DADA VUELTA.
//
// Un titular en criollo y cinco cards sobre los PRODUCTOS del proveedor. El
// número grande dejó de ser el del archivo —917 filas, de las cuales 625 son
// productos que este negocio no tiene— y pasó a ser el del catálogo: 376.
//
// ── LA CARD DE APLICAR SE APAGA SOLA ────────────────────────────────────────
//
// "Listos para aplicar" va destacada en el naranja de marca y lleva el botón
// adentro. Cuando el número da cero se apaga a gris y el botón desaparece, y eso
// NO tiene lógica aparte: sale del mismo número que muestra. Una card con una
// condición propia para encenderse es una card que algún día va a estar
// encendida con cero adentro.
//
// ── LOS DISCONTINUADOS NO SON UNA CARD ──────────────────────────────────────
//
// Van como una línea chica adentro de "sin código de Arcor", debajo del número y
// separados por una raya para que no se lean como parte de ese conteo. Son 3
// sobre 376 y ya están resueltos: darles una card los pondría al nivel de
// problemas que sí hay que atender.
//
// Está armado para poder moverse: la línea es un bloque propio con su propio
// `onClick`, así que sacarla de acá y ponerla en otro lado es mover un jsx, no
// desarmar la card.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { GRUPO_PRODUCTO, TEXTO_GRUPO, DETALLE_GRUPO } from "@/lib/proveedores/listas/gruposProducto";

/** El orden en que se leen. El de aplicar primero: es la acción del día. */
export const ORDEN_CARDS = [
  GRUPO_PRODUCTO.LISTO_PARA_APLICAR,
  GRUPO_PRODUCTO.NECESITA_DECISION,
  GRUPO_PRODUCTO.ACTUALIZADO,
  GRUPO_PRODUCTO.SIN_CODIGO,
  GRUPO_PRODUCTO.NO_TRAIDO,
];

function Card({ grupo, valor, activa, destacada, apagada, onClick, children }) {
  const borde = destacada && !apagada ? "sunmi-border-accent" : "sunmi-border";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`text-left rounded-lg border p-2.5 transition-colors min-w-0 ${borde} ${
        activa ? "sunmi-surface-soft" : ""
      }`}
      style={destacada && !apagada ? { borderColor: "var(--pos-accent)" } : undefined}
    >
      <div
        className={`text-[22px] leading-none font-bold tabular-nums ${
          apagada ? "sunmi-text-muted" : destacada ? "sunmi-text-accent" : "sunmi-text-strong"
        }`}
      >
        {valor}
      </div>
      <div className="text-[11px] font-semibold sunmi-text-strong mt-1 leading-tight">
        {TEXTO_GRUPO[grupo]}
      </div>
      <div className="text-[9.5px] sunmi-text-muted leading-tight mt-0.5 hidden sm:block">
        {DETALLE_GRUPO[grupo]}
      </div>
      {children}
    </button>
  );
}

export default function CabeceraCatalogo({
  titular,
  porGrupo = {},
  universo = 0,
  grupoActivo,
  onGrupo,
  onAplicar,
  puedeAplicar = false,
  onVerDiscontinuados,
}) {
  const valor = (g) => Number(porGrupo?.[g] ?? 0);
  const listos = valor(GRUPO_PRODUCTO.LISTO_PARA_APLICAR);
  const discontinuados = valor(GRUPO_PRODUCTO.DISCONTINUADO);

  return (
    <div data-rol="cabecera-catalogo" className="space-y-2">
      {/* El titular. Una frase, no un número suelto: dice qué hacer hoy. */}
      <p className={`text-[13.5px] font-semibold leading-snug ${titular?.tono ?? "sunmi-text-strong"}`}>
        {titular?.titulo}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {ORDEN_CARDS.map((g) => {
          const n = valor(g);
          const esAplicar = g === GRUPO_PRODUCTO.LISTO_PARA_APLICAR;
          const esSinCodigo = g === GRUPO_PRODUCTO.SIN_CODIGO;
          return (
            <Card
              key={g}
              grupo={g}
              valor={n}
              activa={grupoActivo === g}
              destacada={esAplicar}
              // El número la apaga. Sin condición propia.
              apagada={esAplicar && n === 0}
              onClick={() => onGrupo?.(g)}
            >
              {esAplicar && n > 0 && puedeAplicar ? (
                <SunmiButton
                  color="amber"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAplicar?.();
                  }}
                  className="mt-2 w-full py-1.5 !text-[11px] font-bold"
                >
                  Aplicar los {n}
                </SunmiButton>
              ) : null}

              {esSinCodigo && discontinuados > 0 ? (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerDiscontinuados?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onVerDiscontinuados?.();
                    }
                  }}
                  className="mt-2 pt-1.5 border-t sunmi-border block text-[9.5px] sunmi-text-muted hover:underline cursor-pointer"
                >
                  + {discontinuados} discontinuados · ver
                </span>
              ) : null}
            </Card>
          );
        })}
      </div>

      <p className="text-[10px] sunmi-text-muted">
        Sobre los {universo} productos de este proveedor que tenés en el sistema.
      </p>
    </div>
  );
}
