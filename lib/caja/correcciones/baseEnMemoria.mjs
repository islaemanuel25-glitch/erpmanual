// lib/caja/correcciones/baseEnMemoria.mjs
//
// SOLO PARA CANDADOS. Una base en memoria con lo justo para que el motor de
// corrección histórica corra DE VERDAD —el mismo `ejecutarCorreccion`, sin
// dobles de sus funciones— sobre un alcance escrito en la prueba.
//
// Tiene transacción: se trabaja sobre una copia y solo se confirma si la
// función no tiró, como PostgreSQL. Así el ensayo en seco (que tira a propósito)
// y un fallo a mitad de camino no dejan nada escrito.
//
// No sabe crear ni borrar filas de caja: si el motor lo intentara, la prueba
// explota. La prueba contra PostgreSQL de las mismas reglas está en
// `scripts/pruebas-db/correccionCaja.mjs`.
//
// Salió de `manifiestos.test.mjs`, donde nació para I4 e I6, cuando I5 lo
// necesitó también.

import { ejecutarCorreccion } from "./motor.js";

const DELEGADOS = {
  turno: "Turno", cierrePreparacion: "CierrePreparacion", retiroPreparacion: "RetiroPreparacion",
  cambioPendiente: "CambioPendiente", arqueoCaja: "ArqueoCaja", cajaMovimiento: "CajaMovimiento",
};

export function baseEnMemoria(alcance) {
  let filas = structuredClone(alcance);
  const escrito = { updates: 0, registros: [], bitacoras: 0, filas: [] };
  const coincide = (fila, where) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return v.some((w) => coincide(fila, w));
      if (v && typeof v === "object" && "in" in v) return v.in.includes(fila[k]);
      return fila[k] === v;
    });
  const elegir = (fila, select) =>
    select ? Object.fromEntries(Object.keys(select).filter((k) => k in fila).map((k) => [k, structuredClone(fila[k])])) : structuredClone(fila);
  const cliente = (estado, cuenta) => {
    const tx = {
      $queryRawUnsafe: async () => [],
      correccionCaja: {
        findUnique: async ({ where }) => cuenta.registros.find((r) => r.codigo === where.codigo) ?? null,
        create: async ({ data }) => {
          const r = { id: cuenta.registros.length + 1, ...data };
          cuenta.registros.push(r);
          return r;
        },
      },
      auditoriaBitacora: { create: async () => { cuenta.bitacoras += 1; return {}; } },
    };
    for (const [delegado, entidad] of Object.entries(DELEGADOS)) {
      const de = () => Object.values(estado[entidad] ?? {});
      tx[delegado] = {
        findUnique: async ({ where, select }) => { const f = de().find((x) => coincide(x, where)); return f ? elegir(f, select) : null; },
        findFirst: async ({ where, select }) => { const f = de().find((x) => coincide(x, where)); return f ? elegir(f, select) : null; },
        findMany: async ({ where, select }) => de().filter((x) => coincide(x, where)).map((x) => elegir(x, select)),
        updateMany: async ({ where, data }) => {
          const hay = de().filter((x) => coincide(x, where));
          for (const f of hay) {
            Object.assign(f, structuredClone(data));
            cuenta.filas.push(`${entidad}#${f.id}`);
          }
          cuenta.updates += hay.length;
          return { count: hay.length };
        },
      };
    }
    return tx;
  };
  return {
    escrito,
    filas: () => filas,
    async $transaction(fn) {
      const estado = structuredClone(filas);
      const cuenta = { updates: 0, registros: structuredClone(escrito.registros), bitacoras: 0, filas: [] };
      const r = await fn(cliente(estado, cuenta));
      filas = estado;
      escrito.updates += cuenta.updates;
      escrito.registros = cuenta.registros;
      escrito.bitacoras += cuenta.bitacoras;
      escrito.filas.push(...cuenta.filas);
      return r;
    },
  };
}

/** El manifiesto con otra huella autorizada. */
export const conHuella = (m, hash) => ({ ...m, autorizacion: { ...m.autorizacion, hash } });

/** El manifiesto AUTORIZADO con esa huella, a nombre del usuario 1. */
export const autorizadoCon = (m, hash) => ({ ...m, estado: "AUTORIZADO", autorizacion: { hash, autorizadoPorUsuarioId: 1 } });

export const ensayar = (base, m) => ejecutarCorreccion(base, m, { modo: "ensayo", usuarioId: 1 });
export const aplicar = (base, m, ganchos) => ejecutarCorreccion(base, m, { modo: "aplicar", usuarioId: 1, ganchos });

/** Las 64 huellas que difieren de la dada en UN solo carácter, una por posición. */
export const unaLetraDistinta = (hash) => [...hash].map((c, i) => hash.slice(0, i) + (c === "0" ? "1" : "0") + hash.slice(i + 1));

/** El valor de un campo, movido lo mínimo para que ya no sea el que el plan leyó. */
export function correrValor(v) {
  if (typeof v === "number") return v + 1;
  if (v && typeof v === "object") return { ...v, 1: (v[1] ?? 0) + 1 };
  throw new Error(`no sé mover ${JSON.stringify(v)}`);
}

/** Lo que la base escribió: updates, registros de corrección y bitácoras. Tres ceros = nada. */
export const loEscrito = (base) => [base.escrito.updates, base.escrito.registros.length, base.escrito.bitacoras];
