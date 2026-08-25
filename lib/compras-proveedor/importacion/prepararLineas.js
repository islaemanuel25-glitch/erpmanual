import { buscarCandidatos } from "../comprobante/vinculo.js";
import { proponerCantidadPedido } from "./cantidad.js";

export function prepararLineasImportadas({ lineas = [], productos = [] } = {}) {
  const porBase = new Map(productos.map((p) => [Number(p.baseId), p]));
  const vinculos = productos.flatMap((p) => {
    const codigos = Array.isArray(p.codigosInternos)
      ? p.codigosInternos
      : p.codigoInterno
      ? [p.codigoInterno]
      : [];
    return codigos.map((codigoInterno) => ({
      productoBaseId: p.baseId,
      codigoInterno,
      descripcionProveedor: (p.aliasesProveedor || []).find(
        (a) => a.codigoInterno === codigoInterno
      )?.descripcionProveedor,
      activo: true,
      nombre: p.nombre,
    }));
  });
  const universoProveedor = productos.map((p) => ({ productoBaseId: p.baseId, nombre: p.nombre }));

  return lineas.map((linea, indice) => {
    const busqueda = buscarCandidatos({
      linea: { codigoProveedor: linea.codigo, descripcion: linea.descripcion },
      vinculos,
      universoProveedor,
    });
    const automatico = busqueda.vinculoAutomatico
      ? porBase.get(Number(busqueda.vinculoAutomatico.productoBaseId)) || null
      : null;
    const propuesta = automatico
      ? proponerCantidadPedido({
          cantidad: linea.cantidad,
          unidadFuente: linea.unidad,
          producto: automatico,
        })
      : null;

    return {
      id: `linea-${indice + 1}`,
      ...linea,
      productoLocalId: automatico ? String(automatico.productoLocalId) : "",
      candidatos: busqueda.candidatos
        .map((c) => porBase.get(Number(c.productoBaseId)))
        .filter(Boolean)
        .map((p) => p.productoLocalId),
      origenVinculo: busqueda.origen,
      cantidadPedido: propuesta?.cantidad ?? (Number(linea.cantidad) || 1),
      unidadPedido: propuesta?.unidad || "BULTO",
      requiereRevision: !automatico || Boolean(propuesta?.requiereRevision),
      motivoRevision: !automatico
        ? "El código no coincide exactamente con un producto. Elegilo y confirmá la línea."
        : propuesta?.motivo || null,
      equivalencia: propuesta?.equivalencia || null,
      confirmada: Boolean(automatico && !propuesta?.requiereRevision),
    };
  });
}

export function recalcularLineaConProducto(linea, producto) {
  const propuesta = proponerCantidadPedido({
    cantidad: linea.cantidad,
    unidadFuente: linea.unidad,
    producto,
  });
  return {
    ...linea,
    productoLocalId: producto ? String(producto.productoLocalId) : "",
    cantidadPedido: propuesta.cantidad,
    unidadPedido: propuesta.unidad,
    requiereRevision: true,
    motivoRevision: producto
      ? propuesta.motivo || "Confirmá que el producto elegido corresponde a la línea del archivo."
      : "Elegí un producto.",
    equivalencia: propuesta.equivalencia || null,
    confirmada: false,
  };
}
