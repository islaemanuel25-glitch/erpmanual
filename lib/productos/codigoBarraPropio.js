// lib/productos/codigoBarraPropio.js
//
// Código de barras PROPIO por ubicación (ProductoLocal.codigo_barra_propio). Reglas
// de normalización y validación de COLISIÓN dentro de la ubicación activa. El alcance
// es LOCAL: dos locales pueden usar el mismo código propio sin conflicto.
//
// La unicidad "código propio vs código propio del mismo local" está además respaldada
// por un índice único de DB (@@unique([localId, codigo_barra_propio])) → seguro ante
// concurrencia (P2002). La validación cruzada contra los códigos GLOBALES de otros
// productos visibles en el local no puede ser un constraint (es cross-table), así que
// se valida en backend, dentro de la transacción de edición.

/** Normaliza el código propio: "" / whitespace / undefined → null; si no, trim. */
export function normalizarCodigoPropio(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * ¿El código propio es REDUNDANTE con un código global del PROPIO producto?
 * (mismo valor que su codigo_barra o codigo_barra_secundario). En ese caso no tiene
 * sentido guardarlo aparte: se colapsa a null. NO es un error.
 */
export function esRedundanteConGlobalPropio(codigo, codigoBarra, codigoBarraSecundario) {
  if (codigo == null) return false;
  return codigo === codigoBarra || codigo === codigoBarraSecundario;
}

/**
 * Mensaje claro de colisión a partir de la fila conflictiva (ProductoLocal + base)
 * y el código que se intentó guardar. Distingue el TIPO de choque.
 */
export function mensajeColisionCodigoPropio(row, codigo) {
  if (!row) return null;
  if (row.codigo_barra_propio === codigo) {
    return `El código ${codigo} ya está asignado como código propio de otro producto en esta ubicación.`;
  }
  if (row.base?.codigo_barra === codigo) {
    return `El código ${codigo} coincide con el código principal de otro producto disponible en esta ubicación.`;
  }
  if (row.base?.codigo_barra_secundario === codigo) {
    return `El código ${codigo} coincide con el código secundario de otro producto disponible en esta ubicación.`;
  }
  return `El código ${codigo} ya identifica a otro producto en esta ubicación.`;
}

/**
 * Busca una COLISIÓN del código propio dentro de la ubicación `localId`, contra:
 *   - el código propio de OTRO ProductoLocal del mismo local;
 *   - el código principal/secundario GLOBAL de OTRO producto materializado en el local
 *     (es decir, escaneable en esa ubicación).
 * Excluye al PROPIO producto (`baseIdExcluir`): su propio código global no cuenta como
 * colisión (la redundancia se resuelve colapsando a null). Devuelve la fila conflictiva
 * (con base) o null. `db` puede ser el cliente Prisma o una tx.
 *
 * NOTA: NO se valida contra "código interno por proveedor" (ProductoCodigoProveedor):
 * ese código NO participa hoy del mecanismo de escaneo exacto del POS
 * (buscar-producto solo matchea codigo_barra/codigo_barra_secundario), por lo que no
 * genera ambigüedad con el código propio.
 */
export async function buscarColisionCodigoPropio({ db, localId, codigo, baseIdExcluir = null }) {
  if (codigo == null) return null;
  const where = {
    localId: Number(localId),
    OR: [
      { codigo_barra_propio: codigo },
      { base: { OR: [{ codigo_barra: codigo }, { codigo_barra_secundario: codigo }] } },
    ],
  };
  if (baseIdExcluir) where.baseId = { not: Number(baseIdExcluir) };
  return db.productoLocal.findFirst({
    where,
    select: {
      id: true,
      codigo_barra_propio: true,
      base: { select: { id: true, nombre: true, codigo_barra: true, codigo_barra_secundario: true } },
    },
  });
}
