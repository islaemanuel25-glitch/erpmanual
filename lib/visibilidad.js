/**
 * El cliente por defecto se resuelve TARDE, y solo cuando el llamador no pasa
 * uno. Importarlo arriba ata este módulo al interceptor de auditoría y, con él,
 * a `next/server`, que no existe fuera del bundle de Next: los predicados puros
 * de este archivo dejaban de poder importarse desde un script de mantenimiento.
 */
async function clientePorDefecto() {
  const m = await import("@/lib/prisma");
  return m.default;
}

/**
 * Predicado de visibilidad de PRODUCTO para un local dado.
 *
 * Regla A: lo que crea el depósito baja a todos los locales; lo que crea un
 * local existe SOLO en ese local. Un producto es visible salvo que haya sido
 * creado por OTRO local no-depósito. Los productos sin creador
 * (`creadoEnLocalId` null) se tratan como de depósito → visibles para todos
 * (decisión D2; hoy no hay ninguno en producción).
 *
 * Sirve tanto para el depósito (pasando su localId) como para un local:
 * el propio creador siempre se ve a sí mismo; el depósito nunca "es" otro
 * local no-depósito, así que ve todos sus productos y ninguno de local.
 *
 * @returns fragmento de `where` para ProductoBase.
 */
export function productoVisibleWhere(localIdActivo) {
  return {
    NOT: {
      AND: [
        { creadoEnLocal: { es_deposito: false } },
        { creadoEnLocalId: { not: localIdActivo } },
      ],
    },
  };
}

/**
 * Predicado de visibilidad de PROVEEDOR para un local dado, dentro de su grupo.
 *
 * Regla B: el proveedor se ve donde se CREÓ el producto que lo usa (no donde el
 * producto está disponible). Por eso un local stockea un producto del depósito
 * pero NO ve su proveedor. Se deriva de los productos; el fallback contempla el
 * proveedor recién creado que todavía no tiene productos: lo ve quien lo creó
 * (evaluado dentro del grupo del viewer — decisión D4).
 *
 * NOTA MULTI-DEPÓSITO (D3): usa el "local activo" tal cual. Hoy hay un solo
 * depósito por grupo. Si algún día un grupo tuviera DOS depósitos, cada uno
 * vería solo lo creado en él (lo creado en el otro depósito no le aparecería),
 * que probablemente no sea lo deseado — revisar cuando aparezca ese caso.
 *
 * @returns fragmento de `where` para Proveedor.
 */
export function proveedorVisibleWhere(localIdActivo, grupoId) {
  const creadoAca = { grupoId, creadoEnLocalId: localIdActivo };
  return {
    OR: [
      { productos: { some: creadoAca } },   // relación productoProveedor1 (proveedor_id)
      { productos2: { some: creadoAca } },  // proveedor2_id
      { productos3: { some: creadoAca } },  // proveedor3_id
      {
        // Proveedor sin productos en el grupo + creado por este local.
        AND: [
          { productos: { none: { grupoId } } },
          { productos2: { none: { grupoId } } },
          { productos3: { none: { grupoId } } },
          { creadoEnLocalId: localIdActivo },
        ],
      },
    ],
  };
}

/**
 * ¿Qué proveedores puede EDITAR la sesión? El par de escritura de
 * `proveedorVisibleWhere`.
 *
 * Cada local tiene sus propios proveedores: lo que un local crea es de ese local.
 * Ver no alcanza para editar: un local VE el proveedor de un producto que él
 * mismo creó aunque el proveedor lo haya dado de alta el depósito, y ése no es
 * suyo. Por eso la escritura mira solo `creadoEnLocalId`, que es quién lo creó.
 * Los proveedores viejos tienen `creadoEnLocalId` en null y quedan para el admin.
 *
 * Admin (comodín) → sin restricción, como hasta ahora.
 *
 * @returns fragmento de `where` para Proveedor.
 */
export function proveedorEditableWhere(localIdActivo, esAdmin) {
  if (esAdmin) return {};
  // Sin local no hay nada propio. Y no se deja pasar un `undefined`: Prisma lo
  // toma como "sin filtro" y abriría todos los proveedores.
  if (!localIdActivo) return { id: { in: [] } };
  return { creadoEnLocalId: localIdActivo };
}

/**
 * ¿Qué importaciones de lista de precios puede tocar la sesión? Las de un
 * proveedor PROPIO, con la misma regla de `proveedorEditableWhere`: una lista es
 * de su proveedor, y lo que el proveedor es de un local, su lista también.
 *
 * Va en el `where` de la cabecera (`ImportacionListaProveedor`), que es lo
 * primero que carga cada ruta del circuito: una lista de otro local o del
 * depósito no aparece, y la ruta contesta lo mismo que con un id que no existe.
 *
 * Admin (comodín) → sin restricción, como hasta ahora.
 *
 * @returns fragmento de `where` para ImportacionListaProveedor.
 */
export function importacionDeProveedorPropioWhere(localIdActivo, esAdmin) {
  if (esAdmin) return {};
  return { proveedor: proveedorEditableWhere(localIdActivo, false) };
}

/**
 * localId del depósito de un grupo (hoy: uno solo por grupo). null si no tiene.
 */
export async function getDepositoIdDeGrupo(grupoId, tx) {
  if (!grupoId) return null;
  const cliente = tx ?? (await clientePorDefecto());
  const gd = await cliente.grupoDeposito.findFirst({
    where: { grupoId },
    select: { localId: true },
  });
  return gd?.localId ?? null;
}
