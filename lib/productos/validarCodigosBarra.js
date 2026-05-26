// lib/productos/validarCodigosBarra.js

function limpiar(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Normaliza el par (principal, secundario):
 *   - "" / undefined / whitespace → null
 *   - si secundario === principal → secundario = null (redundante)
 *   - si secundario viene cargado y principal vacío → error
 *
 * Devuelve { ok, error, principal, secundario }.
 */
export function normalizarCodigosBarra({ codigoBarra, codigoBarraSecundario }) {
  const principal = limpiar(codigoBarra);
  let secundario = limpiar(codigoBarraSecundario);

  if (secundario && !principal) {
    return {
      ok: false,
      error: "El código de barras principal es obligatorio si cargás un código secundario.",
      principal: null,
      secundario: null,
    };
  }

  if (secundario && principal && secundario === principal) {
    secundario = null;
  }

  return { ok: true, error: null, principal, secundario };
}

/**
 * Valida que ni el principal ni el secundario choquen con
 * principal o secundario de otro producto del mismo grupo.
 *
 * baseIdExcluir: si viene (caso editar), excluye al propio producto del chequeo.
 *
 * Devuelve { ok, error, codigoConflicto }.
 */
export async function validarUnicidadCodigos({
  prisma,
  grupoId,
  baseIdExcluir = null,
  principal,
  secundario,
}) {
  const codigos = [principal, secundario].filter((c) => c !== null && c !== undefined);
  if (codigos.length === 0) return { ok: true, error: null, codigoConflicto: null };

  const orClauses = [];
  for (const c of codigos) {
    orClauses.push({ codigo_barra: c });
    orClauses.push({ codigo_barra_secundario: c });
  }

  const where = { grupoId, OR: orClauses };
  if (baseIdExcluir) where.id = { not: Number(baseIdExcluir) };

  const conflicto = await prisma.productoBase.findFirst({
    where,
    select: { id: true, codigo_barra: true, codigo_barra_secundario: true },
  });

  if (!conflicto) return { ok: true, error: null, codigoConflicto: null };

  const codigoConflicto = codigos.find(
    (c) => c === conflicto.codigo_barra || c === conflicto.codigo_barra_secundario
  ) || codigos[0];

  return {
    ok: false,
    error: `El código ${codigoConflicto} ya está en uso por otro producto del grupo (como principal o secundario).`,
    codigoConflicto,
  };
}
