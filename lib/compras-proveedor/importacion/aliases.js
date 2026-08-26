import { aliasAEscribir } from "../comprobante/vinculo.js";

/**
 * Las decisiones de producto tomadas al importar, en la forma que se guarda.
 *
 * Un detalle consolidado puede venir de dos renglones del mismo producto. Los
 * dos alias se conservan: si se guardara solamente el primero, el segundo
 * nombre volvería a preguntar en el próximo archivo.
 */
export function aliasesDeImportacion({ items = [], productosPorLocal, grupoId, proveedorId } = {}) {
  const salida = new Map();
  for (const item of items) {
    const producto = productosPorLocal?.get?.(Number(item?.productoLocalId));
    const productoBaseId = producto?.baseId ?? producto?.base?.id ?? null;
    for (const crudo of Array.isArray(item?.aliases) ? item.aliases : []) {
      const alias = aliasAEscribir({
        linea: {
          codigoProveedor: crudo?.codigoProveedor ?? null,
          descripcion: crudo?.descripcionProveedor ?? null,
        },
        productoBaseId,
        grupoId,
        proveedorId,
      });
      if (!alias) continue;
      salida.set(`${alias.grupoId}:${alias.proveedorId}:${alias.codigoInterno}`, alias);
    }
  }
  return [...salida.values()];
}
