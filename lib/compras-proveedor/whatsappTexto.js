// Helper para generar texto plano del pedido a proveedor.
// Se usa tanto en el botón "Copiar pedido" como en el enlace wa.me.

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
 * Construye el texto del pedido para WhatsApp / copiar.
 *
 * @param {object} pedido — estructura tal como devuelve /api/compras-proveedor/obtener
 *   Espera: id, createdAt, fechaConfirmado, notas, proveedor.{nombre},
 *   deposito.{nombre}, detalles[]: { cantidad, unidad, precioCosto, producto.base.{nombre, sku} }
 * @returns {string} texto plano listo para mandar.
 */
export function generarTextoWhatsApp(pedido) {
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

/**
 * Normaliza un teléfono argentino para WhatsApp (web.whatsapp.com / wa.me).
 *
 * Reglas:
 *  1. Quitar todo lo que no sea dígito (espacios, guiones, paréntesis, "+").
 *  2. Si quedan menos de 8 dígitos → "" (inválido, link de WhatsApp no servirá).
 *  3. Si ya empieza con "54" (código país AR) → no anteponer nada.
 *     - Incluye "549..." (móvil) y "54..." (línea).
 *  4. Sino → anteponer "549" para WhatsApp móvil argentino.
 *     - Ejemplo: "3416368002" → "5493416368002".
 *
 * No inserta el "9" del móvil si el usuario cargó "54" sin él — se respeta
 * lo que escribió (puede ser fijo).
 */
export function normalizarTelefonoWa(telefono) {
  if (!telefono) return "";
  const soloDigitos = String(telefono).replace(/[^\d]/g, "");
  if (soloDigitos.length < 8) return "";
  if (soloDigitos.startsWith("54")) return soloDigitos;
  return `549${soloDigitos}`;
}
