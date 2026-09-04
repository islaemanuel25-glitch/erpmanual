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
 * ¿HAY UNA ASOCIACIÓN EXPLÍCITA de este proveedor con esta ubicación?
 *
 * Fragmento de `where` sobre `Proveedor`, exportado aparte para que la ruta que
 * crea la asociación y los candados apunten a LA MISMA condición que usa la
 * visibilidad. Si cada uno escribiera la suya, el día que cambie una el
 * proveedor se asociaría por un camino y se vería por otro.
 *
 * Los tres campos hacen falta: el par grupo+local identifica la ubicación —ver
 * el único de `ProveedorLocal`— y `activo` es lo que permite desasociar sin
 * borrar la evidencia de que la asociación existió.
 */
export function proveedorAsociadoWhere(localIdActivo, grupoId) {
  return { localesAsociados: { some: { grupoId, localId: localIdActivo, activo: true } } };
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
 * ── LA CUARTA RAMA ES ADITIVA, Y ESO ES TODO EL CAMBIO ────────────────────
 *
 * Se agregó `proveedorAsociadoWhere` como una rama más del MISMO `OR`. Las tres
 * ramas de la Regla B y su fallback quedaron intactas, en el mismo orden y con
 * las mismas condiciones: un proveedor que se veía antes se sigue viendo, porque
 * agregar una alternativa a una disyunción no puede sacarle nada a las otras.
 *
 * Y al revés: un proveedor SIN ninguna fila en `ProveedorLocal` —o sea, todos
 * los que existen hoy— evalúa la rama nueva en falso y se resuelve por las tres
 * de siempre. Por eso la tabla arranca vacía y no hace falta backfill.
 *
 * Lo que la rama nueva agrega es lo que la Regla B no podía expresar: un local
 * que usa un proveedor del que todavía no creó ningún producto. Antes eso era
 * imposible —había que crear el producto primero, y para crearlo había que ver
 * el proveedor— y ese círculo es el que bloqueaba la compra propia de un local.
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
      // Asociación EXPLÍCITA con esta ubicación. Ver el bloque de arriba.
      proveedorAsociadoWhere(localIdActivo, grupoId),
    ],
  };
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
