// VINCULAR LOS RENGLONES DEL PAPEL CONTRA EL PEDIDO, Y GUARDARLO.
//
// ── EL CASO (Mauro #298, 2026-10-26) ──────────────────────────────────────
//
// De 19 productos leídos quedaban 10 "sin vincular" teniendo el producto en el
// pedido: "PHILIPS MORRIS 20 CONV" decía "Todavía no se sabe qué producto es".
// Las líneas del pedido solo SUGERÍAN, y la persona tenía que elegir una por
// una lo que ya había encargado.
//
// La regla: con pedido hecho, primero se busca entre los productos de ESE
// pedido, por nombre y por precio; si ahí no aparece, en el catálogo del
// proveedor y después en todo el ERP —que siguen sugiriendo, como siempre—.
// La cascada es la de siempre (`buscarProductoDeLaLinea` → `buscarCandidatos`),
// con el escalón del pedido encendido para que vincule solo.
//
// ── POR QUÉ SE GUARDA, Y DÓNDE ────────────────────────────────────────────
//
// Lo vinculado se escribe en el renglón —`productoLocalId` y `pedidoDetalleId`,
// como un vínculo a mano— y como alias del proveedor, con el motor de identidad
// de facturas, boletas y listas (`filasDeIdentidad` + `persistirIdentidad`).
// Desde ahí la conciliación, aceptar un precio y el cierre lo ven como un
// vínculo más, y la próxima boleta entra por el alias sin buscar.
//
// El alias queda como APLICACION_AUTOMATICA, no como confirmado por nadie:
// `persistirIdentidad` no deja que pise lo que una persona confirmó, y se puede
// revocar aparte. No corre en la conciliación, que es de solo lectura: la llaman
// la lectura de un papel y `recepcion/recalcular`, al abrir el pedido.
//
// NUNCA en un pedido nacido de la factura: sus líneas salieron del mismo papel
// y el precio se compararía contra sí mismo.

import { cargarContexto, aplanarDetalles, buscarProductoDeLaLinea } from "./analisisDeComprobante.js";
import { ORIGEN_VINCULO } from "./vinculo.js";
import { esRenglonDeEnvase } from "./envase.js";
import { esRenglonDeCargo } from "./cargos.js";
import { filasDeIdentidad, METODO_DETECCION } from "@/lib/proveedores/identidad/servicioIdentidad";
import { persistirIdentidad } from "@/lib/proveedores/identidad/persistirIdentidad";

/**
 * @returns `{ vinculadas: [{ lineaId, pedidoDetalleId, productoBaseId }] }`
 */
export async function vincularContraElPedido(prisma, { grupoId, localId, pedidoId } = {}) {
  const pedido = await prisma.pedidoProveedor.findFirst({
    where: { id: pedidoId, grupoId },
    select: { id: true, estado: true, proveedorId: true, nacidoDeFactura: true },
  });
  if (!pedido || pedido.estado !== "ENVIADO" || pedido.nacidoDeFactura === true || !pedido.proveedorId) {
    return { vinculadas: [] };
  }

  const renglones = await prisma.comprobanteLinea.findMany({
    where: {
      productoLocalId: null,
      // Lo que una persona dijo que no vino no se vincula a nada.
      noVino: false,
      comprobante: { grupoId, pedidoId, estado: { not: "ANULADO" }, confirmadoEn: null },
    },
    select: {
      id: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
      costoFinalRenglon: true, subtotalImpreso: true, netoUnitario: true, tipoRenglon: true,
    },
  });
  const sinVincular = renglones.filter((l) => !esRenglonDeEnvase(l) && !esRenglonDeCargo(l));
  if (!sinVincular.length) return { vinculadas: [] };

  const detalles = aplanarDetalles(
    await prisma.pedidoProveedorDetalle.findMany({
      where: { pedidoId },
      orderBy: { id: "asc" },
      select: {
        id: true, cantidad: true, precioCosto: true, unidad: true, productoLocalId: true,
        producto: { select: { id: true, baseId: true, base: { select: { id: true, nombre: true, factor_pack: true } } } },
      },
    })
  );
  const receta = await prisma.recetaProveedor.findFirst({
    where: { grupoId, proveedorId: pedido.proveedorId },
    select: { variacionNormalPct: true },
  });
  const contexto = await cargarContexto(prisma, { grupoId, localId, proveedorId: pedido.proveedorId });

  const vinculadas = [];
  for (const l of sinVincular) {
    const r = buscarProductoDeLaLinea({
      linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo },
      contexto,
      detallesPlanos: detalles,
      pedidoVinculaSolo: true,
      precio: { importe: l.costoFinalRenglon ?? l.subtotalImpreso, cantidad: l.cantidad },
      variacionPct: receta?.variacionNormalPct ?? null,
    });
    if (r.origen !== ORIGEN_VINCULO.LINEA_DEL_PEDIDO || !r.vinculoAutomatico || r.pedidoDetalleId == null) continue;
    const detalle = detalles.find((d) => d.id === r.pedidoDetalleId);
    if (!detalle?.productoLocalId) continue;
    await prisma.$transaction(async (tx) => {
      // Solo si nadie lo vinculó mientras tanto: una decisión a mano gana.
      const n = await tx.comprobanteLinea.updateMany({
        where: { id: l.id, productoLocalId: null },
        data: { productoLocalId: detalle.productoLocalId, pedidoDetalleId: detalle.id },
      });
      if (!n.count) return;
      await persistirIdentidad(
        tx,
        filasDeIdentidad({
          grupoId,
          proveedorId: pedido.proveedorId,
          productoBaseId: detalle.productoBaseId,
          codigoProveedor: l.codigoProveedor,
          descripcionProveedor: l.textoCrudo,
          metodoDeteccion: METODO_DETECCION.APROXIMADO,
        })
      );
      vinculadas.push({ lineaId: l.id, pedidoDetalleId: detalle.id, productoBaseId: detalle.productoBaseId });
    });
  }
  return { vinculadas };
}
