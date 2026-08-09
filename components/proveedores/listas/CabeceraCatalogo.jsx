"use client";

// LA CABECERA DE LA PANTALLA DADA VUELTA.
//
// Un titular en criollo y cinco cards sobre los PRODUCTOS del proveedor. El
// número grande dejó de ser el del archivo —917 filas, de las cuales 625 son
// productos que este negocio no tiene— y pasó a ser el del catálogo: 376.
//
// ── LA CARD DE APLICAR SE APAGA SOLA ────────────────────────────────────────
//
// "Listos para aplicar" va destacada en el acento del tema y lleva el botón
// adentro. Cuando el número da cero se apaga a gris y el botón desaparece, y eso
// NO tiene lógica aparte: sale del mismo número que muestra. Una card con una
// condición propia para encenderse es una card que algún día va a estar
// encendida con cero adentro.
//
// ── LAS CARDS SON EL FILTRO ─────────────────────────────────────────────────
//
// No hay una fila de chips escritos debajo. La había, decía exactamente lo mismo
// que las cards —las mismas cinco palabras y los mismos cinco números— y se
// comía una banda de alto que en la Sunmi empujaba la tabla abajo del pliegue.
// Un solo sistema de filtro, y es este. La búsqueda por texto se combina.
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

// ── LA CARD ES EL FILTRO, Y POR ESO NO ES UN <button> ───────────────────────
//
// El contenedor es un div y el filtro es un botón absoluto que lo tapa entero,
// por debajo de lo que sí es interactivo. Envolver todo en un <button> ponía
// adentro otro <button> —"Aplicar los N"— y un role="link" —los discontinuados—:
// eso es HTML inválido, y el navegador reacomoda el DOM por su cuenta cuando lo
// encuentra. Con la capa de abajo, tocar el número o el texto filtra, y tocar el
// botón o la línea de discontinuados hace lo suyo sin frenar ninguna burbuja.
function Card({ grupo, valor, activa, destacada, apagada, onClick, children }) {
  return (
    <div
      className={`relative rounded-lg border p-2.5 transition-colors min-w-0 ${
        destacada && !apagada ? "sunmi-border-accent" : "sunmi-border"
      }`}
      // EL MARCADO SALE DEL TEMA, NO DE UN COLOR. `--pos-accent` es la variable
      // CSS que define cada tema en globals.css: acá se ve naranja porque este
      // tema es naranja, y en violetaSaas sale violeta y en verdeComercio verde
      // sin tocar una línea. Nunca un hex ni una clase de Tailwind con número:
      // hay un segundo juego de temas en lib/sunmiThemes.js con los mismos
      // catorce nombres y valores propios, y clavar un color acá es empezar a
      // seguir el que no manda.
      //
      // El texto va en `--app-bg` —el fondo del tema— porque sobre el acento lo
      // que se lee es el color del fondo, no el de la letra.
      style={
        activa
          ? { background: "var(--pos-accent)", borderColor: "var(--pos-accent)", color: "var(--app-bg)" }
          : destacada && !apagada
            ? { borderColor: "var(--pos-accent)" }
            : undefined
      }
    >
      {/* La capa que filtra. Va primera y absoluta: queda debajo de todo lo que
          se dibuje después con `relative`. */}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={activa}
        aria-label={`Filtrar: ${TEXTO_GRUPO[grupo]}`}
        className="absolute inset-0 w-full h-full rounded-lg"
      />

      {/* Los textos NO llevan clase de color cuando la card está marcada: heredan
          el del acento. `sunmi-text-muted` sobre el acento no se lee. */}
      <div
        className={`relative pointer-events-none text-[22px] leading-none font-bold tabular-nums ${
          activa ? "" : apagada ? "sunmi-text-muted" : destacada ? "sunmi-text-accent" : "sunmi-text-strong"
        }`}
      >
        {valor}
      </div>
      <div
        className={`relative pointer-events-none text-[11px] font-semibold mt-1 leading-tight ${
          activa ? "" : "sunmi-text-strong"
        }`}
      >
        {TEXTO_GRUPO[grupo]}
      </div>
      <div
        className={`relative pointer-events-none text-[9.5px] leading-tight mt-0.5 hidden sm:block ${
          activa ? "opacity-80" : "sunmi-text-muted"
        }`}
      >
        {DETALLE_GRUPO[grupo]}
      </div>
      <div className="relative">{children}</div>
    </div>
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
                  // Ámbar sobre ámbar no se ve: con la card marcada el botón se
                  // pasa a oscuro para seguir existiendo.
                  color={grupoActivo === g ? "slate" : "amber"}
                  onClick={onAplicar}
                  className="mt-2 w-full py-1.5 !text-[11px] font-bold"
                >
                  Aplicar los {n}
                </SunmiButton>
              ) : null}

              {esSinCodigo && discontinuados > 0 ? (
                // Un botón de verdad, no un span con role. Está por encima de la
                // capa que filtra, así que tocarlo NO selecciona la card.
                <button
                  type="button"
                  onClick={onVerDiscontinuados}
                  // La raya de arriba es un separador, no un recuadro:
                  // `sunmi-border` pone los cuatro lados y dibujaba una cajita.
                  style={{ borderTopColor: "var(--app-border)" }}
                  className={`mt-2 pt-1.5 border-t block w-full text-left text-[9.5px] hover:underline ${
                    grupoActivo === g ? "" : "sunmi-text-muted"
                  }`}
                >
                  + {discontinuados} discontinuados · ver
                </button>
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
