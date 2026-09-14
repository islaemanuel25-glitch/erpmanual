"use client";

// components/transferencias/FachadaDelLocal.jsx
//
// LA FACHADA DE UN LOCAL, dibujada.
//
// ── ESTE ARCHIVO NO ESCRIBE NI UN SOLO COLOR ─────────────────────────────
//
// Todos salen de `paletaDelLocal(nombre)`, que vive en `lib/` porque son datos
// de un DIBUJO y no decisiones de interfaz —el verde de un toldo no cambia con
// el tema, igual que no cambia el color de una foto—. El porqué largo está
// escrito allá.
//
// Si alguien mete un hexadecimal acá, el trinquete lo va a contar. Y hace bien:
// este archivo es interfaz, y lo único que le corresponde es pintar lo que
// recibe.
//
// ── POR QUÉ UN `viewBox` DE 120 Y UN TAMAÑO APARTE ───────────────────────
//
// El diseño está dibujado en una caja de 120×120 y se muestra a 56. Con el
// `viewBox` los números del dibujo son los del diseño y el tamaño se decide
// afuera, así que la misma fachada sirve a 56 en la lista y a lo que haga falta
// en otra pantalla, sin volver a calcular una sola coordenada.
//
// ── `aria-hidden` A PROPÓSITO ────────────────────────────────────────────
//
// Es decoración: el nombre del local está al lado, en texto. Anunciar "imagen"
// antes de cada nombre alargaría la lista para quien la escucha sin agregar
// nada.

import {
  FRUTAS_DEL_CAJON,
  LINEAS_DEL_CARTEL,
  NEUTROS_DE_LA_FACHADA as N,
  PANOS_DEL_TOLDO,
  paletaDelLocal,
} from "@/lib/transferencias/fachadaDelLocal";

export default function FachadaDelLocal({ nombre, tamano = 56, className = "" }) {
  const p = paletaDelLocal(nombre);

  return (
    <svg
      viewBox="0 0 120 120"
      width={tamano}
      height={tamano}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Vereda y sombra: lo que apoya el dibujo sobre el piso. */}
      <rect x="2" y="102" width="116" height="11" rx="2.5" fill={N.vereda} />
      <ellipse cx="60" cy="102.5" rx="47" ry="3.5" fill={N.sombra} opacity="0.1" />

      {/* Cuerpo y zócalo. */}
      <rect x="14" y="26" width="92" height="76" rx="3" fill={p.muro} />
      <rect x="14" y="92" width="92" height="10" fill={p.zocalo} />

      {/* El cartel y sus tres líneas: un nombre sugerido, no escrito. */}
      <rect x="10" y="10" width="100" height="17" rx="3" fill={p.cartel} />
      {LINEAS_DEL_CARTEL.map((l) => (
        <rect
          key={l.x}
          x={l.x}
          y="17"
          width={l.ancho}
          height="2.5"
          rx="1.2"
          fill={p.textoCartel}
          opacity="0.9"
        />
      ))}

      {/* El toldo: siete paños alternados y sus festones. */}
      {PANOS_DEL_TOLDO.map((t) => (
        <rect
          key={`p${t.x}`}
          x={t.x}
          y="29"
          width="13.2"
          height="12"
          fill={t.par ? p.toldoA : p.toldoB}
        />
      ))}
      {PANOS_DEL_TOLDO.map((t) => (
        <ellipse
          key={`f${t.x}`}
          cx={t.x + 6.6}
          cy="41"
          rx="6.6"
          ry="4.5"
          fill={t.par ? p.toldoA : p.toldoB}
        />
      ))}
      <rect x="14" y="42" width="92" height="5" fill={N.sombra} opacity="0.08" />

      {/* La vidriera, con sus dos reflejos inclinados. */}
      <rect
        x="21"
        y="51"
        width="44"
        height="40"
        rx="2"
        fill={p.vidrio}
        stroke={p.marco}
        strokeWidth="2.6"
      />
      <g clipPath="url(#vidriera)">
        <rect x="28" y="44" width="9" height="56" fill={N.reflejo} opacity="0.32" transform="rotate(-20 28 44)" />
        <rect x="43" y="44" width="4.5" height="56" fill={N.reflejo} opacity="0.22" transform="rotate(-20 43 44)" />
      </g>
      <defs>
        <clipPath id="vidriera">
          <rect x="21" y="51" width="44" height="40" rx="2" />
        </clipPath>
      </defs>

      {/* El cajón de frutas de la vidriera. */}
      <rect x="25" y="77" width="36" height="12" rx="1.5" fill={p.cajon} />
      {FRUTAS_DEL_CAJON.map((f) => (
        <ellipse key={f.x} cx={f.x + 3} cy="77" rx="3" ry="3" fill={p.frutas[f.indice]} />
      ))}

      {/* La puerta: arco arriba, vidrio, manija y escalón. */}
      <rect x="72" y="51" width="26" height="41" rx="11" ry="11" fill={p.puerta} />
      <rect x="72" y="70" width="26" height="22" fill={p.puerta} />
      <rect x="77" y="57" width="16" height="17" rx="8" fill={p.vidrio} opacity="0.85" />
      <ellipse cx="77.75" cy="77.75" rx="1.75" ry="1.75" fill={p.marco} />
      <rect x="68" y="92" width="34" height="6" rx="1" fill={p.zocalo} />
    </svg>
  );
}
