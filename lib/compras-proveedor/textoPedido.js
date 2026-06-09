// Helper para generar texto plano del pedido a proveedor.
// Se usa para "Copiar pedido" (compartir el pedido por el medio que elija el usuario).

function fmtPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Construye el texto del pedido para copiar/compartir.
 *
 * @param {object} pedido — estructura tal como devuelve /api/compras-proveedor/obtener
 *   Espera: id, createdAt, fechaConfirmado, notas, proveedor.{nombre},
 *   deposito.{nombre}, detalles[]: { cantidad, unidad, precioCosto, producto.base.{nombre, sku} }
 * @returns {string} texto plano listo para compartir.
 */
export function generarTextoPedido(pedido) {
  if (!pedido) return "";

  const lineas = [];
  const fecha = fmtFecha(pedido.fechaConfirmado || pedido.createdAt);
  const proveedorNombre = pedido.proveedor?.nombre || "—";

  lineas.push(`*Pedido #${pedido.id}* — ${fecha}`);
  lineas.push(`Proveedor: ${proveedorNombre}`);
  if (pedido.deposito?.nombre) {
    lineas.push(`Depósito: ${pedido.deposito.nombre}`);
  }
  lineas.push("");

  let totalEstimado = 0;

  (pedido.detalles || []).forEach((det, i) => {
    const nombre = det.producto?.base?.nombre || "Sin nombre";
    const sku = det.producto?.base?.sku;
    const cant = Number(det.cantidad) || 0;
    const unidad = det.unidad || "BULTO";
    const costo = Number(det.precioCosto) || 0;

    let linea = `${i + 1}. ${nombre}`;
    if (sku) linea += ` (${sku})`;
    linea += `: ${cant} ${unidad}`;

    if (costo > 0) {
      const subtotal = cant * costo;
      totalEstimado += subtotal;
      linea += ` × $${fmtPrecio(costo)} = $${fmtPrecio(subtotal)}`;
    }

    lineas.push(linea);
  });

  if (totalEstimado > 0) {
    lineas.push("");
    lineas.push(`*Total estimado: $${fmtPrecio(totalEstimado)}*`);
  }

  if (pedido.notas) {
    lineas.push("");
    lineas.push(`Notas: ${pedido.notas}`);
  }

  return lineas.join("\n");
}
