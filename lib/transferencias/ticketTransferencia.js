/**
 * Contenido del ticket térmico de una transferencia.
 *
 * NO arma HTML. El ticket lo dibuja `lib/pos-ventas/imprimirTicketTermico.js`,
 * la misma pieza que imprime Posventa, así que los dos salen con el mismo papel,
 * la misma letra, el mismo encabezado del local y el mismo pie. Acá solo se
 * traduce la transferencia a lo que esa pieza recibe: una venta.
 *
 * Antes había un generador propio (`imprimirTicketTransferencia.js`) copiado a
 * mano del de Posventa, y se fue corriendo. Se borró: con una sola pieza no hay
 * dos formatos posibles.
 */

import { presentacionDeLinea } from "@/components/transferencias/detallePresentacion";
import { importeVigenteDeLinea } from "@/lib/transferencias/detalleRecibido";
import { sumarSubtotales } from "@/lib/pos-ventas/lineaPorImporte";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ── CADA LÍNEA, CON LOS MISMOS DATOS QUE LA TABLA DE LA PANTALLA ───────────
//
// La #521 imprimía "CIF LIMA 300ml" y abajo un "3 x" suelto, sin presentación,
// sin costo y sin importe: la transferencia tenía una rama propia en la pieza
// de Posventa. Ahora cada línea sale por la misma fila que una venta —nombre
// arriba, "cantidad x precio" a la izquierda y el importe a la derecha— con lo
// que muestra `TablaDetalleTransferencia`, en su orden:
//
//   · cantidad    → `cantidadEnviada`, la columna "Enviada";
//   · presentación → `presentacionDeLinea`, la píldora de la columna;
//   · precio      → `precioCosto`, la columna "Costo";
//   · importe     → `importeVigenteDeLinea`, la columna "Subtotal".
//
// El importe viaja como `subtotalFijado` para que la pieza lo LEA y no lo
// recalcule: con recepción cargada la tabla muestra lo recibido valorizado, que
// no es enviada × costo, y el papel tiene que decir lo mismo que la pantalla.
//
// La presentación va adelante del nombre y no en la fila del importe: en 58 mm
// "3 Unidad x $1.832,67 $5.498,01" ya no entra, y la pieza recorta la izquierda.
function lineaDelTicket(d) {
  const presentacion = presentacionDeLinea(d);
  const nombre = d.nombre || "(sin nombre)";
  return {
    nombre: presentacion === "—" ? nombre : `${presentacion} - ${nombre}`,
    cantidad: num(d.cantidadEnviada),
    precio: num(d.precioCosto),
    subtotalFijado: num(importeVigenteDeLinea(d)),
  };
}

export function ticketDeTransferencia(item) {
  const items = (Array.isArray(item?.items) ? item.items : []).map(lineaDelTicket);
  // La suma de los subtotales impresos, en centavos: la misma cuenta del total
  // de una venta, sobre los mismos importes que la tabla.
  const total = sumarSubtotales(items);
  return {
    ticket: {
      // El encabezado del local es el del que manda la mercadería.
      localNombre: item?.origen?.nombre || "Transferencia",
      // `/api/transferencias/detalle` no manda `numero`: el número es el id.
      numero: item?.id ?? "-",
      // La misma fecha que la cabecera de la pantalla.
      fecha: item?.fechaEnvio ?? item?.fechaCreada ?? null,
      // Quien envió, el "Enviada por" de la cabecera. No quien imprime.
      vendedor: item?.creadaPor?.nombre || "-",
      items,
      subtotal: total,
      total,
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
export default async function imprimirTicketDeTransferencia(item) {
  if (!item) return;
  const { default: imprimirTicketTermico } = await import(
    "@/lib/pos-ventas/imprimirTicketTermico"
  );
  const { ticket, opts } = ticketDeTransferencia(item);
  imprimirTicketTermico(ticket, 58, opts);
}
