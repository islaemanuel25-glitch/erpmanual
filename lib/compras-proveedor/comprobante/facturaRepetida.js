// LA MISMA FACTURA NO ENTRA DOS VECES, Y SE DICE CUÁL ES.
//
// ── POR QUÉ HACE FALTA AHORA ──────────────────────────────────────────────
//
// Con una factura por pedido, subir la misma dos veces era raro. Con cuatro o
// cinco por pedido y doce fotos seguidas deja de serlo: la hoja de la segunda
// factura se parece a la de la tercera, y nadie compara números en el mostrador.
//
// ── LO QUE YA EXISTÍA, Y POR QUÉ ESTO NO LO REESCRIBE ─────────────────────
//
// `evaluarAlta` en `identidad.js` YA decide si un comprobante choca con uno
// cargado, con el criterio correcto —normaliza el número, compara contra el
// proveedor de cada existente y no cuenta los ANULADO—. Lo único que le faltaba
// era quién se lo preguntara en el momento de LEER: hasta hoy se preguntaba al
// subir, cuando todavía no hay número impreso que comparar, así que en la
// práctica no se preguntaba nunca. La segunda factura llegaba hasta el índice
// único de la base y reventaba con un P2002 que la pantalla mostraba como
// "Error interno al leer".
//
// Así que acá no hay criterio nuevo: hay la consulta que faltaba y el texto que
// dice qué pasó.

import { evaluarAlta, MOTIVO_RECHAZO } from "@/lib/compras-proveedor/comprobante/identidad";

/**
 * ¿HAY OTRO COMPROBANTE DE ESTE PROVEEDOR CON ESTE MISMO NÚMERO?
 *
 * @param db         Prisma o una transacción
 * @param identidad  lo que la puerta va a guardar: `{ tipo, puntoVenta, numero }`
 * @param exceptoId  el comprobante que se está leyendo, que obviamente no choca
 *                   consigo mismo
 * @returns la fila que choca, o `null`. Null también cuando la lectura no trajo
 *          número: sin número no se puede afirmar que sea la misma, y frenar
 *          una factura por no haberle leído el número sería el peor de los dos
 *          errores.
 */
export async function comprobanteConLaMismaIdentidad(
  db,
  { grupoId, proveedorId, identidad, exceptoId = null } = {}
) {
  const numero = identidad?.numero;
  const puntoVenta = identidad?.puntoVenta;
  if (!numero || !puntoVenta) return null;

  const existentes = await db.comprobanteProveedor.findMany({
    where: {
      grupoId,
      proveedorId,
      estado: { not: "ANULADO" },
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
    },
    select: { id: true, proveedorId: true, tipo: true, puntoVenta: true, numero: true, estado: true, pedidoId: true },
  });

  const r = evaluarAlta({
    candidato: { proveedorId, puntoVenta, numero },
    existentes,
  });
  if (r.ok || r.motivo !== MOTIVO_RECHAZO.DUPLICADO) return null;
  return existentes.find((e) => e.id === r.choca) ?? null;
}

/**
 * CÓMO SE DICE.
 *
 * Nombra la factura como está impresa y dice dónde está la que ya entró: sin el
 * número, quien lo lee no puede comprobar si se equivocó o si el proveedor
 * mandó dos veces el mismo papel.
 */
export function textoDeDuplicado(choca) {
  if (!choca) return "Esta factura ya está cargada.";
  const nombre = `${choca.tipo ?? ""} ${choca.puntoVenta ?? ""}-${choca.numero ?? ""}`.trim();
  const donde = choca.pedidoId ? ` en el pedido #${choca.pedidoId}` : "";
  return `La factura ${nombre} de este proveedor ya está cargada${donde}.`;
}
