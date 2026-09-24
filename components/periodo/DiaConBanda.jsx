"use client";

// components/periodo/DiaConBanda.jsx
//
// UN DÍA DE ACTIVIDAD: el marco, la banda con su título y su total, y adentro
// las filas de ese día.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/transferencias/DiaDeTransferencias.jsx`, tal cual estaba. No
// se escribió adivinando: se sacó de una pantalla que HOY funciona, cuando
// apareció la segunda que necesitaba lo mismo —la actividad por día de
// Finanzas—. Aquélla la sigue usando y dibuja el MISMO marcado: los nodos se
// movieron enteros, ningún par de hijos se juntó en una cadena, y
// `diaConBanda.test.mjs` compara el HTML renderizado por las dos partes.
//
// El tercer consumidor no agrupa por día: Pagos a proveedores agrupa las
// cuentas por PROVEEDOR con el mismo marco y la misma banda —título, subtítulo,
// importe—, que es justo lo que esta pieza recibe sin saber qué es. Se reusa
// tal cual en vez de escribir una parecida al lado.
//
// ── POR QUÉ ACÁ Y NO EN EL KIT ────────────────────────────────────────────
//
// Por lo mismo que `ChipsDePeriodo`: esta carpeta es de piezas que saben de
// PERÍODOS, que es vocabulario del negocio. El kit no conoce días ni semanas. Lo
// que sí sale del kit es de lo que está hecha —nada de colores ni medidas
// propias: `sunmi-bg-card`, `sunmi-border` y `sunmi-surface-soft` son tokens del
// tema, así que se ve bien en los catorce—.
//
// ── LA BANDA SE PINTA PAREJA DE LADO A LADO ──────────────────────────────
//
// Es el defecto que hay que no repetir, y viene anotado de la pieza original. El
// fondo va en UN solo nodo —el de la banda— y ninguno de sus hijos declara fondo
// propio. Un contenedor interno con su propio `bg` tapa la franja y deja un
// rectángulo del color de la tarjeta en el medio, que se lee como un bloque en
// blanco.
//
// Y el `overflow-hidden` del marco no es adorno: sin él la banda —que se pinta
// de lado a lado— se come las esquinas redondeadas.

/**
 * @param {object} props
 * @param {string} props.titulo      "Sábado 12".
 * @param {string} props.subtitulo   "3 transferencias · 1 sin recibir".
 * @param {React.ReactNode} props.importe  el total del día, YA FORMATEADO.
 * @param {React.ReactNode} props.children las filas del día.
 *
 * `importe` llega formateado y no como número: quién sabe cómo se escribe la
 * plata es la pantalla, no esta pieza. Recibir el número y formatearlo acá la
 * obligaría a conocer un formateador y sería el treintaiseisavo del repo.
 */
export default function DiaConBanda({ titulo, subtitulo, importe, children }) {
  return (
    <div className="sunmi-bg-card rounded-xl2 border sunmi-border overflow-hidden">
      {/* LA BANDA. Único nodo con fondo; sus hijos no declaran ninguno. */}
      <div className="sunmi-surface-soft px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base2 font-semibold sunmi-text-strong truncate">{titulo}</div>
          <div className="text-sm2 sunmi-text-muted">{subtitulo}</div>
        </div>
        <div className="shrink-0 text-base2 font-semibold sunmi-text-strong tabular-nums">
          {importe}
        </div>
      </div>

      {children}
    </div>
  );
}
