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

import { PRESENTACION, agrupa, descriptorDeEnvio, recibidoDeLinea } from "@/lib/transferencias/presentacionEnvio";
import { round2 } from "@/lib/pos-ventas/pagos";
import { sumarSubtotales } from "@/lib/pos-ventas/lineaPorImporte";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ── CADA LÍNEA, COMO POSVENTA IMPRIME ESA MISMA VENTA ──────────────────────
//
// La #521 imprimió "156 x $11.601,86 → $11.601,86": la cantidad en unidades
// físicas (`cantidadEnviada`) al lado del costo del BULTO (`precioCosto`), y una
// cuenta que no cierra. Posventa nunca imprime eso: el depósito vende el bulto
// como "1 x $11.601,86" y la unidad suelta del mismo producto en OTRO renglón,
// a su precio unitario (`modoVentaLinea` NORMAL y UNIDAD_REMANENTE). La
// transferencia de esa venta consolida las dos en una línea con bultos y
// sueltas, así que acá se vuelve a abrir en los renglones de la venta:
//
//   · bultos  → cantidad de bultos × `precioCosto`, el costo del bulto;
//   · sueltas → cantidad de unidades × `costoUnitarioFisico`, en centavos como
//               cualquier precio impreso;
//   · unidad, kilo y pieza → su cantidad × `precioCosto`, que ya es el costo de
//               UNA unidad, UN kilo o UNA pieza.
//
// La escala sale de `descriptorDeEnvio`, el mismo que usan el stock, el dinero
// del remito y la tabla; y con recepción cargada se imprime lo contado, que es
// lo que valoriza la columna Subtotal. El importe de cada renglón lo calcula la
// pieza de Posventa —precio × cantidad—, así que la cuenta impresa cierra
// siempre.
//
// Cada renglón lleva además el descriptor `deposito` que trae una línea de
// venta —el de `descriptorDeposito`: modo, unidad de medida y factor—, para que
// la pieza de Posventa decida cómo se escribe la cantidad con el mismo dato en
// los dos papeles. La #520 imprimió "3.615 x" sobre 3,615 kg porque la
// transferencia no se lo pasaba.
function deposito(d, envio, modo) {
  return { modo, unidadMedida: d.unidadMedida ?? null, factorPack: envio.factor ?? 1 };
}

function renglonesDeLaLinea(d) {
  const nombre = d.nombre || "(sin nombre)";
  const envio = descriptorDeEnvio(d);
  const contado = recibidoDeLinea(d);
  const cantidad = contado ? num(contado.cantidad) : envio.cantidad;
  const sueltas = contado ? num(contado.sueltas) : envio.sueltas;
  // El modo de la venta para cada presentación del envío: el kilo no tiene modo
  // —lo dice la unidad de medida—, igual que una venta por peso.
  const modo =
    envio.presentacion === PRESENTACION.PIEZA ? "PIEZA"
      : envio.presentacion === PRESENTACION.KG ? null
        : agrupa(envio.presentacion) ? "PACK" : "UNIDAD";

  if (!agrupa(envio.presentacion) || !envio.factor || !sueltas) {
    return [{ nombre, cantidad, precio: num(d.precioCosto), deposito: deposito(d, envio, modo) }];
  }
  const renglones = [];
  if (cantidad) renglones.push({ nombre, cantidad, precio: num(d.precioCosto), deposito: deposito(d, envio, "PACK") });
  renglones.push({
    nombre, cantidad: sueltas, precio: round2(num(d.costoUnitarioFisico)), deposito: deposito(d, envio, "UNIDAD"),
  });
  return renglones;
}

export function ticketDeTransferencia(item) {
  const items = (Array.isArray(item?.items) ? item.items : []).flatMap(renglonesDeLaLinea);
  // La misma cuenta que el subtotal de una venta, sobre los renglones impresos.
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
