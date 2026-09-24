"use client";

// components/periodo/DiaConBanda.jsx
//
// UN DÍA: la caja, la banda pintada con el día y su dato, y adentro las filas.
//
// ES LA ÚNICA. La usan las cuatro pantallas que agrupan por día —Recibir
// mercadería, Transferencias, Pagos a proveedores y la actividad de Finanzas—
// y ninguna dibuja su propia banda. Qué dice cada una lo decide la pantalla;
// cómo se ve, esta pieza.
//
// ── DE DÓNDE SALIÓ SU ASPECTO ─────────────────────────────────────────────
//
// De `components/compras-proveedor/DiaDePedidos.jsx`, que era la única de las
// cuatro con la banda visible. Las otras tres pintaban la franja con
// `sunmi-surface-soft`, que lee `--app-input-bg`, y en doce de los catorce
// temas ese token vale lo mismo que `--card-bg`: la banda salía del color de la
// tarjeta y dos días seguidos se leían como una lista continua. Ésta usa
// `sunmi-control` —`--pos-control-bg`, el fondo de los botones secundarios—,
// que es distinto de la tarjeta en los catorce. Mismo token que Recibir, así
// que no se escribe ningún color.
//
// `sunmi-control` trae un `:hover` que acá no significa nada —la banda no se
// toca—; en un teléfono no hay hover, y usar la clase que existe es preferible a
// escribir una variante nueva para ahorrarse una regla que nunca se activa.
//
// ── UNA LÍNEA CUANDO ENTRA, Y SE ACOMODA CUANDO NO ────────────────────────
//
// Con lugar: el día a la izquierda, y a la derecha el dato en gris y el importe
// en negrita, en una sola línea —el aspecto compacto de Recibir—.
//
// Sin lugar, se reacomoda DENTRO de la misma banda, por el espacio REAL del
// contenedor y no por un corte de pantalla: `flex-wrap` decide el salto con el
// ancho natural de cada bloque, así que funciona igual en un teléfono que en
// una columna angosta de escritorio.
//
//   · El día nunca se corta: no lleva `truncate`, y como el salto se decide con
//     su ancho completo, el bloque de la derecha baja ANTES de que el día tenga
//     que achicarse. Solo si el día solo no entra en la banda, se parte en dos
//     renglones — nunca queda en cero.
//   · El bloque de la derecha baja entero y se alinea a la derecha (`ml-auto`).
//     Si ni así entran el dato y el importe juntos, el importe baja debajo del
//     dato, también a la derecha. Ninguno sale de la tarjeta.
//
// Medido a 360 px con los textos más largos de cada pantalla; los números están
// en el mensaje del commit que trajo esto.
//
// ── LA CAJA ───────────────────────────────────────────────────────────────
//
// La banda es lo PRIMERO de la caja, así que el redondeo de arriba se lo recorta
// el `overflow-hidden`. Sin ese recorte la banda saldría cuadrada por encima del
// borde redondeado. El fondo va en UN solo nodo —el de la banda— y ninguno de
// sus hijos declara fondo propio: un hijo con `bg` tapa la franja.

/**
 * @param {object} props
 * @param {React.ReactNode} props.titulo   "Miércoles 23", "Vencidas".
 * @param {React.ReactNode} props.dato     "1 pedido", "3 transferencias · 1 sin recibir".
 * @param {React.ReactNode} [props.importe] YA FORMATEADO. Sin él no se dibuja el nodo:
 *                                          Recibir lo omite con un solo pedido.
 * @param {React.ReactNode} props.children las filas del día.
 *
 * `importe` llega formateado y no como número: quién sabe cómo se escribe la
 * plata es la pantalla, no esta pieza.
 */
export default function DiaConBanda({ titulo, dato, importe = null, children }) {
  const conImporte = importe !== null && importe !== undefined && importe !== false && importe !== "";
  return (
    <div className="rounded-xl border sunmi-divider sunmi-bg-card overflow-hidden">
      <div className="sunmi-control px-4 py-renglon flex flex-wrap items-baseline gap-x-renglon gap-y-dato">
        <div className="grow text-sm3 font-bold sunmi-text-strong">{titulo}</div>

        <div className="ml-auto flex flex-wrap items-baseline justify-end gap-x-renglon gap-y-dato">
          {/* El dato, en gris: dice cuántos hay sin competir con el día. */}
          <div className="text-sm3 sunmi-text-muted">{dato}</div>
          {conImporte && (
            <div className="text-sm3 font-bold sunmi-text-strong tabular-nums">{importe}</div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
