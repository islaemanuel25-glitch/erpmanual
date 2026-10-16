/**
 * Contenido del ticket térmico de una transferencia.
 *
 * NO arma HTML. El ticket lo dibuja `lib/pos-ventas/imprimirTicketTermico.js`,
 * la misma pieza que imprime Posventa, así que los dos salen con el mismo papel,
 * la misma letra, el mismo encabezado del local y el mismo pie. Acá solo se
 * traduce la transferencia a lo que esa pieza recibe.
 *
 * Antes había un generador propio (`imprimirTicketTransferencia.js`) copiado a
 * mano del de Posventa, y se fue corriendo. Se borró: con una sola pieza no hay
 * dos formatos posibles.
 */

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function ticketDeTransferencia(item, me) {
  const items = Array.isArray(item?.items) ? item.items : [];
  return {
    ticket: {
      // El encabezado del local es el del que manda la mercadería.
      localNombre: item?.origen?.nombre || "Transferencia",
      // `/api/transferencias/detalle` no manda `numero`: el número es el id.
      numero: item?.id ?? "-",
      fecha: item?.fechaCreada || null,
      vendedor: me?.nombre || me?.email || me?.usuario || "-",
      items: items.map((it) => ({
        nombre: it.nombre || "(sin nombre)",
        cantidad: num(it.cantidadEnviada),
      })),
    },
    opts: {
      transferencia: {
        origen: item?.origen?.nombre || null,
        destino: item?.destino?.nombre || null,
      },
    },
  };
}

/** Imprime la transferencia con la pieza de Posventa. */
export default async function imprimirTicketDeTransferencia(item, me) {
  if (!item) return;
  const { default: imprimirTicketTermico } = await import(
    "@/lib/pos-ventas/imprimirTicketTermico"
  );
  const { ticket, opts } = ticketDeTransferencia(item, me);
  imprimirTicketTermico(ticket, 58, opts);
}
