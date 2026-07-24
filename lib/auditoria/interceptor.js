// lib/auditoria/interceptor.js
//
// Interceptor de escrituras de Prisma que puebla la bitácora central. Diseño v2:
//
//  - UNA acción de negocio = UNA fila. Las escrituras del request se acumulan en
//    un buffer (en el store del ALS) y se vuelcan en UNA sola fila al final del
//    request. El flush se dispara con `after()` de next/server, PERO registrado
//    desde getUsuarioSession (lib/auth.js) — no desde acá: dentro del hook de la
//    extensión Prisma el ALS de request de Next ya no está y after() no funciona
//    (validado en spike). Acá solo llenamos el buffer y exponemos el flush.
//  - DIFF correcto: el "antes" se captura en el PRIMER contacto con cada entidad
//    (pre-write); el "después" se re-lee al final. Campos sin cambio se descartan.
//  - LEGIBLE: el flush arma `cambios` = [{ entidad, nombre, campos:[{label,antes,
//    despues}] }] con nombres criollos y valores formateados (lib/auditoria/formato).
//  - BEST-EFFORT: nunca rompe el negocio; usa el cliente `base` (sin extender)
//    para reads/insert → sin recursión.

import { after } from "next/server";
import { getStore } from "./contexto";
import { labelDe, formatValor } from "./formato";

const CAP = 500;

const SENSIBLES = new Set([
  "password", "passwordHash", "pinHash", "pin",
  "token", "secret", "authSecret", "auth_secret",
]);
const REDACT = "[REDACTADO]";
const IGNORAR_EN_DIFF = new Set(["id", "updatedAt", "createdAt"]);

// Cliente base sin extender (lo setea auditoriaExtension). Lo usa el flush.
let baseRef = null;

// ---------------------------------------------------------------------------
// ALLOW-LIST: qué modelos/operaciones se auditan.
// ---------------------------------------------------------------------------
const ALLOW = {
  PedidoProveedor: ["update"],
  Transferencia: ["update", "updateMany"],
  PosTransferencia: ["delete", "deleteMany"],
  ProductoBase: ["update"],
  ProductoLocal: ["create", "update", "updateMany"],
  Usuario: ["create", "update", "updateMany"],
  Rol: ["create", "update", "delete"],
  OperadorLocal: ["create", "update", "delete"],
  OperadorEnLocal: ["create", "createMany", "delete", "deleteMany"],
};

// ---------------------------------------------------------------------------
// DOMINIOS: agrupación en criollo. Producto = ProductoBase + ProductoLocal.
// ---------------------------------------------------------------------------
const DOMINIOS = {
  ProductoBase:    { dominio: "Producto",        grupoKey: (e) => `Producto:${e.id}`,     refId: (e) => Number(e.id) },
  ProductoLocal:   { dominio: "Producto",        grupoKey: (e) => `Producto:${e.baseId}`, refId: (e) => Number(e.baseId) },
  PedidoProveedor: { dominio: "Pedido",          grupoKey: (e) => `Pedido:${e.id}`,       refId: (e) => Number(e.id) },
  Transferencia:   { dominio: "Transferencia",   grupoKey: (e) => `Transferencia:${e.id}`, refId: (e) => Number(e.id) },
  PosTransferencia:{ dominio: "Transferencia POS", grupoKey: (e) => `TransferenciaPOS:${e.id}`, refId: (e) => Number(e.id) },
  Usuario:         { dominio: "Usuario",         grupoKey: (e) => `Usuario:${e.id}`,      refId: (e) => Number(e.id) },
  Rol:             { dominio: "Rol",             grupoKey: (e) => `Rol:${e.id}`,          refId: (e) => Number(e.id) },
  OperadorLocal:   { dominio: "Operador",        grupoKey: (e) => `Operador:${e.id}`,     refId: (e) => Number(e.id) },
  OperadorEnLocal: { dominio: "Operador",        grupoKey: (e) => `Operador:${String(e.id).split(":")[0]}`, refId: (e) => Number(String(e.id).split(":")[0]) },
};

const BULK = new Set(["updateMany", "deleteMany", "createMany"]);

// ---------------------------------------------------------------------------
// Normalización (JSON-safe + redacción + descarte de relaciones)
// ---------------------------------------------------------------------------
function lcFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

// Duck-typing en vez de constructor.name: Turbopack minifica los nombres de
// clase, así que "Decimal" no es fiable. decimal.js expone toFixed + toNumber.
function esDecimal(v) {
  return (
    v &&
    typeof v === "object" &&
    typeof v.toFixed === "function" &&
    typeof v.toNumber === "function"
  );
}

function safeVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (esDecimal(v)) return v.toString();
  return v;
}

// Objeto plano JSON-safe. Redacta secretos y DESCARTA relaciones (objetos/arrays
// de objetos que trae `include`), para no ensuciar el diff. Conserva arrays de
// primitivos (p.ej. permisos).
function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSIBLES.has(k)) { out[k] = REDACT; continue; }
    if (v && typeof v === "object" && !(v instanceof Date) && !esDecimal(v)) {
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === "object") continue; // relación (array de objetos)
        out[k] = v; // array de primitivos
      }
      // objeto plano (relación incluida) → se descarta
      continue;
    }
    out[k] = safeVal(v);
  }
  return out;
}

function pickId(row) {
  if (!row || typeof row !== "object") return null;
  if (row.id !== undefined && row.id !== null) return String(row.id);
  if (row.operadorId != null && row.localId != null) return `${row.operadorId}:${row.localId}`;
  return null;
}

// ---------------------------------------------------------------------------
// Buffer del request
// ---------------------------------------------------------------------------
function recordEntidad(buffer, model, tipo, antes, despues) {
  const ref = despues || antes || {};
  const id = pickId(ref);
  const baseId = ref.baseId ?? null;
  const key = id != null ? `${model}:${id}` : `${model}:∅:${buffer.size}`;
  if (!buffer.has(key)) {
    buffer.set(key, { modelo: model, id, baseId, tipo, antes: antes ?? null, despues: despues ?? null });
  } else {
    const e = buffer.get(key); // mantener el "antes" original; actualizar "después"
    if (despues !== undefined) e.despues = despues;
    if (tipo === "eliminado") e.tipo = "eliminado";
  }
}

// ---------------------------------------------------------------------------
// Extensión: llena el buffer. No escribe filas (eso lo hace el flush).
// ---------------------------------------------------------------------------
export function auditoriaExtension(base) {
  baseRef = base;
  return {
    name: "auditoria-bitacora",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ops = ALLOW[model];
          if (!ops || !ops.includes(operation)) return query(args);
          const store = getStore();
          if (!store) return query(args); // sin request (scripts) → no se audita acá
          const buffer = store.__auditBuffer || (store.__auditBuffer = new Map());
          const delegate = base[lcFirst(model)];

          try {
            if (BULK.has(operation)) {
              if (operation === "createMany") {
                const result = await query(args);
                const arr = Array.isArray(args.data) ? args.data : [args.data];
                for (const d of arr.slice(0, CAP)) recordEntidad(buffer, model, "creado", null, normalizeRow(d));
                return result;
              }
              let matched = [];
              try { matched = await delegate.findMany({ where: args.where, take: CAP + 1 }); } catch {}
              const result = await query(args);
              if (operation === "deleteMany") {
                for (const row of matched.slice(0, CAP)) recordEntidad(buffer, model, "eliminado", normalizeRow(row), null);
              } else {
                const ids = matched.map((r) => r.id).filter((v) => v != null);
                let afterRows = [];
                if (ids.length) { try { afterRows = await delegate.findMany({ where: { id: { in: ids } } }); } catch {} }
                const afterById = new Map(afterRows.map((r) => [r.id, r]));
                for (const row of matched.slice(0, CAP)) {
                  const after = afterById.get(row.id) || null;
                  recordEntidad(buffer, model, "editado", normalizeRow(row), after ? normalizeRow(after) : null);
                }
              }
              return result;
            }

            if (operation === "create") {
              const result = await query(args);
              recordEntidad(buffer, model, "creado", null, normalizeRow(result));
              return result;
            }

            // update / upsert / delete
            let before = null;
            try { before = await delegate.findFirst({ where: args.where }); } catch {}
            const result = await query(args);
            if (operation === "delete") {
              recordEntidad(buffer, model, "eliminado", before ? normalizeRow(before) : null, null);
            } else {
              const tipo = before ? "editado" : "creado";
              recordEntidad(buffer, model, tipo, before ? normalizeRow(before) : null, normalizeRow(result));
            }
            return result;
          } catch (e) {
            // Si algo del buffering falla, NO romper la escritura del negocio.
            if (process.env.NODE_ENV !== "production") console.warn("[auditoria] buffer:", e?.message);
            return query(args);
          }
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Registro del flush (se llama desde getUsuarioSession, en contexto de request)
// ---------------------------------------------------------------------------
export function programarFlush(store) {
  if (!store || store.__flushRegistrado) return;
  store.__flushRegistrado = true;
  try {
    after(async () => {
      if (baseRef) await flushAuditoria(baseRef, store);
    });
  } catch {
    store.__flushRegistrado = false; // after() no disponible (fuera de request)
  }
}

// ---------------------------------------------------------------------------
// Diff / merge / nombres
// ---------------------------------------------------------------------------
function diffCampos(antes, despues) {
  const out = [];
  if (antes && despues) {
    const keys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
    for (const k of keys) {
      if (IGNORAR_EN_DIFF.has(k)) continue;
      if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(despues[k] ?? null)) {
        out.push({ campo: k, antes: antes[k] ?? null, despues: despues[k] ?? null });
      }
    }
  } else if (despues && !antes) {
    for (const [k, v] of Object.entries(despues)) {
      if (IGNORAR_EN_DIFF.has(k) || v === null || v === undefined) continue;
      out.push({ campo: k, antes: null, despues: v });
    }
  } else if (antes && !despues) {
    for (const [k, v] of Object.entries(antes)) {
      if (["nombre", "estado", "email", "numero", "nro"].includes(k) && v != null) {
        out.push({ campo: k, antes: v, despues: null });
      }
    }
  }
  return out;
}

// Une los cambios de las entidades del grupo. Dedup por CAMPO conservando la
// primera aparición: en Producto, ProductoBase se bufferea primero, así que su
// valor (autoritativo) gana sobre el del ProductoLocal del depósito (que espeja
// al base). Evita líneas duplicadas del mismo campo.
function mergeCampos(entradas) {
  const seen = new Set();
  const out = [];
  for (const e of entradas) {
    for (const c of e.campos) {
      if (seen.has(c.campo)) continue;
      seen.add(c.campo);
      out.push(c);
    }
  }
  return out;
}

async function safeFind(fn) {
  try { return await fn(); } catch { return null; }
}

function nombreDeAntes(entradas) {
  const e = entradas.find((x) => x.antes && x.antes.nombre);
  return e ? e.antes.nombre : null;
}

async function resolverGrupo(base, group) {
  const { dominio, refId, entradas } = group;
  const estados = entradas.map((e) => e.despues && e.despues.estado).filter(Boolean);
  const algunCreado = entradas.some((e) => e.tipo === "creado");
  const algunEliminado = entradas.some((e) => e.tipo === "eliminado");
  const algunInactivo = entradas.some((e) => e.despues && e.despues.activo === false);

  switch (dominio) {
    case "Producto": {
      const p = await safeFind(() => base.productoBase.findUnique({ where: { id: refId }, select: { nombre: true } }));
      return { id: refId, nombre: p?.nombre || `Producto #${refId}`, accion: "producto.editar" };
    }
    case "Pedido": {
      let accion = "pedido.editar";
      if (estados.includes("ANULADO")) accion = "pedido.anular";
      else if (estados.includes("RECIBIDO")) accion = "compra.recibir";
      return { id: refId, nombre: `Pedido #${refId}`, accion };
    }
    case "Transferencia":
      return {
        id: refId,
        nombre: `Transferencia #${refId}`,
        accion: estados.some((s) => String(s).startsWith("Cancel")) ? "transferencia.cancelar" : "transferencia.editar",
      };
    case "Transferencia POS":
      return { id: refId, nombre: `Transferencia POS #${refId}`, accion: "pos_transferencia.cancelar" };
    case "Usuario": {
      const u = await safeFind(() => base.usuario.findUnique({ where: { id: refId }, select: { nombre: true, email: true } }));
      let accion = "usuario.editar";
      if (algunCreado) accion = "usuario.crear";
      else if (algunInactivo) accion = "usuario.baja";
      return { id: refId, nombre: u?.nombre || u?.email || nombreDeAntes(entradas) || `Usuario #${refId}`, accion };
    }
    case "Rol": {
      const r = await safeFind(() => base.rol.findUnique({ where: { id: refId }, select: { nombre: true } }));
      const accion = algunCreado ? "rol.crear" : algunEliminado ? "rol.eliminar" : "rol.editar";
      return { id: refId, nombre: r?.nombre || nombreDeAntes(entradas) || `Rol #${refId}`, accion };
    }
    case "Operador": {
      const o = await safeFind(() => base.operadorLocal.findUnique({ where: { id: refId }, select: { nombre: true } }));
      const accion = algunCreado ? "operador.crear" : algunEliminado ? "operador.eliminar" : "operador.editar";
      return { id: refId, nombre: o?.nombre || nombreDeAntes(entradas) || `Operador #${refId}`, accion };
    }
    default:
      return { id: refId, nombre: `${dominio} #${refId}`, accion: `${dominio.toLowerCase()}.editar` };
  }
}

function plural(dominio) {
  return dominio.endsWith("s") ? dominio : `${dominio}s`;
}

// ---------------------------------------------------------------------------
// FLUSH: una fila por acción de negocio.
// ---------------------------------------------------------------------------
async function flushAuditoria(base, store) {
  try {
    const buffer = store.__auditBuffer;
    if (!buffer || buffer.size === 0) return;

    // Agrupar por dominio, diffeando y descartando lo que no cambió.
    const grupos = new Map();
    for (const e of buffer.values()) {
      const d = DOMINIOS[e.modelo];
      if (!d) continue;
      const campos = diffCampos(e.antes, e.despues);
      if (e.tipo === "editado" && campos.length === 0) continue; // no cambió nada real
      const gk = d.grupoKey(e);
      if (!grupos.has(gk)) grupos.set(gk, { dominio: d.dominio, refId: d.refId(e), entradas: [] });
      grupos.get(gk).entradas.push({ ...e, campos });
    }
    if (grupos.size === 0) return; // nada que registrar (p.ej. guardar sin cambios)

    const gruposArr = [...grupos.values()];
    const cambios = [];
    for (const g of gruposArr) {
      g.info = await resolverGrupo(base, g);
      const merged = mergeCampos(g.entradas);
      cambios.push({
        entidad: g.dominio,
        nombre: g.info.nombre,
        id: String(g.info.id ?? ""),
        campos: merged.map((c) => ({
          label: labelDe(c.campo),
          antes: formatValor(c.campo, c.antes),
          despues: formatValor(c.campo, c.despues),
        })),
      });
    }

    const primary = gruposArr[0];
    const mismoDominio = gruposArr.every((g) => g.dominio === primary.dominio);
    const entidadNombre = gruposArr.length > 1 && mismoDominio
      ? `${gruposArr.length} ${plural(primary.dominio).toLowerCase()}`
      : primary.info.nombre;

    // grupoId: usar el del contexto o derivarlo del local (sin importar grupos.js → evita ciclo)
    let grupoId = store.grupoId ?? null;
    if (!grupoId && store.localId) {
      const gl = await safeFind(() => base.grupoLocal.findFirst({ where: { localId: store.localId }, select: { grupoId: true } }));
      grupoId = gl?.grupoId ?? null;
      if (!grupoId) {
        const gd = await safeFind(() => base.grupoDeposito.findFirst({ where: { localId: store.localId }, select: { grupoId: true } }));
        grupoId = gd?.grupoId ?? null;
      }
    }

    await base.auditoriaBitacora.create({
      data: {
        usuarioId: store.usuarioId ?? null,
        operadorId: store.operadorId ?? null,
        localId: store.localId ?? null,
        grupoId,
        accion: primary.info.accion,
        entidad: primary.dominio,
        entidadId: String(primary.info.id ?? ""),
        entidadNombre,
        cambios,
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn("[auditoria] flush:", e?.message);
  }
}
