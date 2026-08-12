// lib/compras-proveedor/comprobante/productoDeLaFila.js
//
// DE `productoLocalId` AL PRODUCTO, SIN RELACIÓN DE PRISMA.
//
// ── POR QUÉ NO SE PIDE `productoLocal` EN EL SELECT ────────────────────────
//
// Porque esa relación NO EXISTE. `ComprobanteLinea` guarda el escalar
// `productoLocalId` y nada más: no hay campo de relación en el esquema ni clave
// foránea en la base. Tres rutas la pedían igual y las tres reventaban con
// `Unknown field productoLocal` — la de listar tumbó la pantalla entera de
// comprobantes en producción el 2026-08-12, y con ella la subida, que se veía
// rota sin estarlo: subía bien y fallaba al recargar la lista.
//
// Nada lo atajó porque Next no valida los argumentos de Prisma al compilar y los
// candados son funciones puras que no tocan la base. El error aparece recién
// contra Postgres.
//
// ── POR QUÉ UNA CONSULTA APARTE Y NO AGREGAR LA RELACIÓN ───────────────────
//
// Agregarla al esquema es más limpio a futuro, pero la migración crearía una
// clave foránea sobre una columna que hoy no la tiene, y eso FALLA si quedó
// alguna línea apuntando a un producto borrado. Eso se mira con tiempo, no con
// la pantalla caída. Queda anotado como deuda en
// `docs/roadmap/` y en el comentario del modelo.
//
// ── Y POR QUÉ ACÁ Y NO EN CADA RUTA ────────────────────────────────────────
//
// Porque son tres las que lo necesitan y ya divergieron una vez: cada una
// escribió su propio select inválido con campos distintos. Una sola función y un
// solo lugar donde arreglarlo la próxima.

/**
 * Map de productoLocalId → { id, baseId, base } para las líneas dadas.
 *
 * @param prisma   el cliente
 * @param lineas   filas con `productoLocalId` (los nulos se ignoran)
 * @param base     qué campos de `ProductoBase` hacen falta. Se pide lo que se
 *                 usa y nada más: traer el catálogo entero por comodidad es como
 *                 se llenan de datos las respuestas que nadie mira.
 */
export async function productosDeLasFilas(prisma, lineas, base = null) {
  const ids = [
    ...new Set(
      (Array.isArray(lineas) ? lineas : [])
        .map((l) => l?.productoLocalId)
        .filter((x) => Number.isFinite(Number(x)))
        .map(Number)
    ),
  ];
  if (!ids.length) return new Map();

  const filas = await prisma.productoLocal.findMany({
    where: { id: { in: ids } },
    select: { id: true, baseId: true, ...(base ? { base: { select: base } } : {}) },
  });
  return new Map(filas.map((p) => [p.id, p]));
}

/**
 * El `baseId` de una línea, o null.
 *
 * NULL TIENE DOS CAUSAS y las dos son legítimas: que la línea no esté vinculada,
 * o que apunte a un producto que ya no existe. Quien llama decide qué decir en
 * cada caso; acá no se inventa un cero ni se hace pasar una por la otra.
 */
export function baseIdDeLaFila(linea, porProductoLocal) {
  const id = linea?.productoLocalId;
  if (id == null) return null;
  return porProductoLocal?.get?.(Number(id))?.baseId ?? null;
}
