// lib/auditoria/interceptor.js
//
// Client extension de Prisma que puebla la bitácora de auditoría central
// (modelo AuditoriaBitacora) en UN SOLO punto, interceptando las escrituras.
//
// Diseño (ver plan aprobado):
//  - ALLOW-LIST: solo los modelos/operaciones del relevamiento generan fila.
//    Todo lo demás (incl. el hot-path de ventas POS) es un lookup + passthrough.
//  - BEST-EFFORT: la fila se escribe con el cliente `base` (SIN extender) fuera
//    de la transacción del negocio y en try/catch: un audit roto NUNCA rompe la
//    operación real. Contrapartida: un rollback puede dejar una fila de algo
//    revertido (raro, solo ante error).
//  - DIFF: antes/después guardan solo los campos que cambiaron. Secretos siempre
//    redactados (crítico: Usuario está en scope).
//  - ANTI-RECURSIÓN: before-read e insert usan `base`, no el cliente extendido,
//    así que no se re-interceptan (validado en spike).

import { getAuditoriaCtx } from "./contexto";

// Tope de filas leídas/registradas para operaciones masivas.
const CAP = 500;

// Campos que NUNCA deben persistirse en la bitácora.
const SENSIBLES = new Set([
  "password", "passwordHash", "pinHash", "pin",
  "token", "secret", "authSecret", "auth_secret",
]);
const REDACT = "[REDACTADO]";

// Ruido: cambian en cada write y no aportan a la auditoría.
const IGNORAR_EN_DIFF = new Set(["updatedAt"]);

// ---------------------------------------------------------------------------
// ALLOW-LIST: Modelo (PascalCase, como llega en la extension) -> config.
// `accion({ operation, after })` deriva el código legible; `after` es la fila
// resultante (single) o el `data` aplicado (bulk).
// ---------------------------------------------------------------------------
const ALLOW = {
  PedidoProveedor: {
    ops: ["update"],
    accion: ({ operation, after }) => {
      const estado = after?.estado;
      if (estado === "ANULADO") return "pedido.anular";
      if (estado === "RECIBIDO") return "compra.recibir";
      return `pedido.${operation}`;
    },
  },
  Transferencia: {
    ops: ["update", "updateMany"],
    accion: ({ operation, after }) =>
      String(after?.estado || "").startsWith("Cancel")
        ? "transferencia.cancelar"
        : `transferencia.${operation}`,
  },
  PosTransferencia: {
    ops: ["delete", "deleteMany"],
    accion: () => "pos_transferencia.cancelar",
  },
  ProductoBase: {
    ops: ["update"],
    accion: () => "producto.editar",
  },
  ProductoLocal: {
    ops: ["create", "update", "updateMany"],
    accion: ({ operation }) =>
      operation === "create" ? "producto.local.crear" : "producto.editar",
  },
  Usuario: {
    ops: ["create", "update", "updateMany"],
    accion: ({ operation, after }) => {
      if (operation === "create") return "usuario.crear";
      if (after?.activo === false) return "usuario.baja";
      return "usuario.editar";
    },
  },
  Rol: {
    ops: ["create", "update", "delete"],
    accion: ({ operation }) =>
      `rol.${operation === "create" ? "crear" : operation === "delete" ? "eliminar" : "editar"}`,
  },
  OperadorLocal: {
    ops: ["create", "update", "delete"],
    accion: ({ operation }) =>
      `operador.${operation === "create" ? "crear" : operation === "delete" ? "eliminar" : "editar"}`,
  },
  OperadorEnLocal: {
    ops: ["create", "createMany", "delete", "deleteMany"],
    accion: ({ operation }) =>
      operation.startsWith("delete")
        ? "operador.asignacion.quitar"
        : "operador.asignacion.agregar",
  },
};

const BULK_OPS = new Set(["updateMany", "deleteMany", "createMany"]);

// ---------------------------------------------------------------------------
// Helpers de normalización / diff
// ---------------------------------------------------------------------------
function lcFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

// Convierte un valor a algo JSON-safe (Date -> ISO, Decimal/BigInt -> string).
function safeVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (v.constructor && v.constructor.name === "Decimal" && typeof v.toString === "function") {
      return v.toString();
    }
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  }
  return v;
}

// Objeto plano JSON-safe con secretos redactados.
function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = SENSIBLES.has(k) ? REDACT : safeVal(v);
  }
  return out;
}

function projectKeys(obj, keys) {
  if (!obj) return null;
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return Object.keys(out).length ? out : null;
}

function pickId(row) {
  if (!row || typeof row !== "object") return null;
  if (row.id !== undefined && row.id !== null) return String(row.id);
  // PK compuesta conocida (OperadorEnLocal)
  if (row.operadorId != null && row.localId != null) return `${row.operadorId}:${row.localId}`;
  return null;
}

// Diff de fila única: solo claves cuyo valor cambió (ignora timestamps de ruido).
function diffSingle(antesRow, despuesRow) {
  const a = antesRow ? normalizeRow(antesRow) : null;
  const d = despuesRow ? normalizeRow(despuesRow) : null;
  if (a && d) {
    const cambA = {};
    const cambD = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(d)]);
    for (const k of keys) {
      if (IGNORAR_EN_DIFF.has(k)) continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) {
        cambA[k] = a[k] ?? null;
        cambD[k] = d[k] ?? null;
      }
    }
    return {
      antes: Object.keys(cambA).length ? cambA : null,
      despues: Object.keys(cambD).length ? cambD : null,
    };
  }
  return { antes: a, despues: d };
}

// ---------------------------------------------------------------------------
// Before-read: captura el estado previo según la operación. Usa `base` (cliente
// sin extender) -> lee snapshot committed, no bloquea contra locks del tx.
// ---------------------------------------------------------------------------
async function leerAntes(base, model, operation, args) {
  const delegate = base[lcFirst(model)];
  if (!delegate) return [];
  try {
    if (operation === "update" || operation === "delete" || operation === "upsert") {
      const row = await delegate.findFirst({ where: args.where });
      return row ? [row] : [];
    }
    if (operation === "updateMany" || operation === "deleteMany") {
      return await delegate.findMany({ where: args.where, take: CAP + 1 });
    }
  } catch {
    // fail-open: si el before-read falla, seguimos sin "antes"
  }
  return [];
}

// ---------------------------------------------------------------------------
// Arma la(s) fila(s) de auditoría y las persiste (best-effort).
// ---------------------------------------------------------------------------
async function registrar(base, { model, operation, args, result, antesRows }) {
  const cfg = ALLOW[model];
  if (!cfg) return;
  const ctx = getAuditoriaCtx() || {};
  const baseFila = {
    usuarioId: ctx.usuarioId ?? null,
    operadorId: ctx.operadorId ?? null,
    localId: ctx.localId ?? null,
    grupoId: ctx.grupoId ?? null,
    entidad: model,
    metodo: operation,
  };

  let fila;
  if (!BULK_OPS.has(operation)) {
    // --- Operación de fila única ---
    const antesRow = antesRows[0] || null;
    const despuesRow = operation === "delete" ? null : result;
    const after = operation === "delete" ? antesRow : result;
    const { antes, despues } = diffSingle(antesRow, despuesRow);
    fila = {
      ...baseFila,
      accion: cfg.accion({ operation, after }),
      entidadId: pickId(result) ?? pickId(antesRow),
      antes,
      despues,
    };
  } else {
    // --- Operación masiva: una fila resumen ---
    const capped = antesRows.slice(0, CAP);
    const truncado = antesRows.length > CAP;
    const count = result?.count ?? capped.length;
    // No auditar masivas que no tocaron ninguna fila (no-op).
    if (!count && capped.length === 0) return;
    let antes = null;
    let despues = null;

    if (operation === "deleteMany") {
      antes = capped.map(normalizeRow);
    } else if (operation === "updateMany") {
      const dataKeys = Object.keys(args.data || {});
      antes = capped.map((r) => projectKeys(normalizeRow(r), dataKeys)).filter(Boolean);
      despues = normalizeRow(args.data || {});
    } else {
      // createMany
      const arr = Array.isArray(args.data) ? args.data : [args.data];
      despues = arr.slice(0, CAP).map(normalizeRow);
    }

    fila = {
      ...baseFila,
      accion: cfg.accion({ operation, after: args.data }),
      entidadId: capped.length === 1 ? pickId(capped[0]) : null,
      antes: antes ? { filas: antes, count, truncado } : (count != null ? { count } : null),
      despues: despues ? { valores: despues, count, truncado } : null,
    };
  }

  await base.auditoriaBitacora.create({ data: fila });
}

// ---------------------------------------------------------------------------
// Fábrica de la extensión. `base` = PrismaClient SIN extender (para reads/insert
// internos sin recursión).
// ---------------------------------------------------------------------------
export function auditoriaExtension(base) {
  return {
    name: "auditoria-bitacora",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const cfg = ALLOW[model];
          // passthrough barato para todo lo no auditado
          if (!cfg || !cfg.ops.includes(operation)) {
            return query(args);
          }

          const antesRows = await leerAntes(base, model, operation, args);
          const result = await query(args); // ejecuta la escritura real

          // best-effort: nunca romper el negocio por la auditoría
          try {
            await registrar(base, { model, operation, args, result, antesRows });
          } catch (e) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auditoria] no se pudo registrar:", e?.message);
            }
          }

          return result;
        },
      },
    },
  };
}
