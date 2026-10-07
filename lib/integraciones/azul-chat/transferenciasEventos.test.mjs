// Candados de la capacidad `transferencias_eventos`: parámetros, cursor, margen
// de 60 s, forma del evento y clave estable.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/transferenciasEventos.test.mjs
//
// ── LA BASE DE MENTIRA DE ESTE ARCHIVO ────────────────────────────────────
//
// Los escenarios del cursor corren contra una tabla en memoria que interpreta
// el `where` que arma `whereEventos` —y SOLO los operadores que ése usa: ante
// cualquier otro, tira—. Así, si el `where` cambia de forma, el test se cae en
// vez de seguir afirmando sobre una consulta que ya no existe. La verdad sobre
// Prisma y PostgreSQL la ejerce `scripts/pruebas-db/azulChatTransferenciasEventos.mjs`.
//
// Las filas tienen la forma de `SELECT_EVENTO` (el select compartido con la
// cuenta del período más `tieneDiferencias`).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAPACIDAD,
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  MARGEN_DE_VISIBILIDAD_MS,
  ORDEN_EVENTOS,
  SELECT_EVENTO,
  TIPO_TRANSFERENCIA_RECIBIDA,
  aEvento,
  idDeEvento,
  leerParametros,
  limiteDeVisibilidad,
  transferenciasEventos,
  whereEventos,
} from "./transferenciasEventos.js";
import { SELECT_TRANSFERENCIA_DE_LA_CUENTA } from "../../transferencias/cuentaDelPeriodoServer.js";
import { atenderSolicitud, MAX_BYTES_CUERPO } from "./atender.js";
import { CABECERAS, firmarSolicitud } from "./autenticacionAplicacion.js";
import { PUBLICOS, TRADUCCION, aRespuestaPublica } from "./respuestaPublica.js";
import { generarTokenDelegacion, hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

const AHORA = Date.parse("2026-10-07T15:00:00.000Z");
const ISO = (ms) => new Date(ms).toISOString();
const HACE = (s) => AHORA - s * 1000;

// ── las filas ─────────────────────────────────────────────────────────────

/** Una línea del remito con la forma del select: 10 enviadas, `recibido` contadas. */
const linea = (recibido) => ({
  cantidad: 10,
  recibido,
  recibidoUnidadesSueltas: null,
  precioCosto: 100,
  unidadEnviada: "UNIDAD",
  presentacionEnvio: "UNIDAD",
  cantidadPresentada: 10,
  factorPresentacion: 1,
  sueltasEnviadas: 0,
  pesoPiezaKg: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: true,
  productoId: 1,
  producto: { precio_costo: 100, nombre: "Producto", base: { unidad_medida: "unidad", factor_pack: 1, nombre: "Producto" } },
});

let siguienteId = 1;
/** Una transferencia. Por defecto: recibida hace 5 minutos en el local 10, desde el depósito 1. */
const transferencia = (extra = {}) => ({
  id: siguienteId++,
  estado: "Recibida",
  fechaEnvio: new Date(HACE(3600)),
  fechaRecepcion: new Date(HACE(300)),
  createdAt: new Date(HACE(3600)),
  origenId: 1,
  destinoId: 10,
  tieneDiferencias: false,
  origen: { id: 1, nombre: "Depósito Central", es_deposito: true },
  destino: { id: 10, nombre: "Casiano" },
  detalle: [linea(10)],
  ...extra,
});

// ── la base en memoria ────────────────────────────────────────────────────

const igualFecha = (a, b) => a instanceof Date && b instanceof Date && a.getTime() === b.getTime();

function cumple(fila, where) {
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") {
      if (!cond.some((w) => cumple(fila, w))) return false;
      continue;
    }
    const v = fila[campo];
    if (cond instanceof Date) {
      if (!igualFecha(v, cond)) return false;
    } else if (cond !== null && typeof cond === "object") {
      for (const [op, x] of Object.entries(cond)) {
        if (op === "not" && x === null) {
          if (v == null) return false;
        } else if (op === "lte") {
          if (v == null || !(v <= x)) return false;
        } else if (op === "gt") {
          if (v == null || !(v > x)) return false;
        } else {
          throw new Error(`operador no soportado por la base de mentira: ${campo}.${op}`);
        }
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function baseDeMentira(filas, { locales = { 10: "Casiano", 11: "Centro" } } = {}) {
  const pedidos = [];
  return {
    pedidos,
    local: {
      findUnique: async ({ where }) => (locales[where.id] ? { id: where.id, nombre: locales[where.id] } : null),
    },
    transferencia: {
      findMany: async (args) => {
        pedidos.push(args);
        // Ordena con el `orderBy` QUE LE LLEGA, no con uno fijo: si la
        // capacidad cambiara el orden, los escenarios del cursor tienen que
        // verlo (con un orden fijo acá, B seguía en verde con el orden roto).
        const comparar = (a, b) => {
          for (const criterio of args.orderBy) {
            const [[campo, dir]] = Object.entries(criterio);
            if (dir !== "asc") throw new Error(`orden no soportado por la base de mentira: ${campo} ${dir}`);
            const d = a[campo] - b[campo];
            if (d !== 0) return d;
          }
          return 0;
        };
        return filas.filter((f) => cumple(f, args.where)).sort(comparar).slice(0, args.take);
      },
    },
  };
}

const AUTZ = Object.freeze({ capacidad: CAPACIDAD, localId: 10, grupoId: 1 });

/** Recorre todas las páginas desde `desde`, como haría Azul Chat. */
async function recorrer(db, { desde, limite, ahora = AHORA } = {}) {
  const vistos = [];
  let cursor = desde;
  for (let vueltas = 0; vueltas < 50; vueltas++) {
    const r = await transferenciasEventos(AUTZ, { ...(cursor ? { desde: cursor } : {}), ...(limite ? { limite } : {}) }, { db, ahora });
    assert.equal(r.ok, true, JSON.stringify(r));
    vistos.push(...r.datos.eventos);
    cursor = r.datos.siguiente;
    if (!r.datos.hayMas) return { vistos, cursor, ultima: r.datos };
  }
  throw new Error("la paginación no termina");
}

// ── parámetros ────────────────────────────────────────────────────────────

test("13. limite: por defecto 50, entre 1 y 100 entero; lo demás se rechaza server-side", () => {
  assert.equal(leerParametros({}).limite, LIMITE_POR_DEFECTO);
  assert.equal(LIMITE_POR_DEFECTO, 50);
  assert.equal(LIMITE_MAXIMO, 100);
  assert.equal(leerParametros({ limite: 1 }).limite, 1);
  assert.equal(leerParametros({ limite: 100 }).limite, 100);
  for (const malo of [0, -1, 101, 1000, 1.5, "10", null, Number.NaN, Infinity]) {
    const r = leerParametros({ limite: malo });
    assert.equal(r.ok, false, String(malo));
    assert.equal(r.codigo, "PEDIDO_INVALIDO");
    assert.equal(r.status, 400);
  }
});

test("desde: exactamente fechaRecepcion (ISO con milisegundos, UTC) y transferenciaId entero positivo", () => {
  const bueno = { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: 182 };
  const r = leerParametros({ desde: bueno });
  assert.equal(r.ok, true);
  assert.equal(r.desde.fecha.toISOString(), bueno.fechaRecepcion);
  assert.equal(r.desde.transferenciaId, 182);
  assert.equal(leerParametros({}).desde, null);

  for (const malo of [
    null,
    "2026-10-07T14:00:00.123Z",
    [],
    {},
    { fechaRecepcion: bueno.fechaRecepcion },
    { transferenciaId: 182 },
    { ...bueno, usuarioId: 7 },
    { ...bueno, fechaRecepcion: "2026-10-07T14:00:00Z" },
    { ...bueno, fechaRecepcion: "2026-10-07T14:00:00.123-03:00" },
    { ...bueno, fechaRecepcion: "2026-02-30T14:00:00.000Z" },
    { ...bueno, fechaRecepcion: 1759845600000 },
    { ...bueno, transferenciaId: 0 },
    { ...bueno, transferenciaId: "182" },
    { ...bueno, transferenciaId: 1.5 },
  ]) {
    const r2 = leerParametros({ desde: malo });
    assert.equal(r2.ok, false, JSON.stringify(malo));
    assert.equal(r2.codigo, "PEDIDO_INVALIDO");
  }
});

// ── la consulta ───────────────────────────────────────────────────────────

test("el where: destino = local, estado Recibida, fecha no nula y <= ahora − 60 s; desde estricto", () => {
  const hasta = limiteDeVisibilidad(AHORA);
  assert.equal(MARGEN_DE_VISIBILIDAD_MS, 60_000);
  assert.equal(hasta.toISOString(), ISO(AHORA - 60_000));
  assert.deepEqual(whereEventos({ localId: 10, desde: null, hasta }), {
    destinoId: 10,
    estado: "Recibida",
    fechaRecepcion: { not: null, lte: hasta },
  });
  const f = new Date("2026-10-07T14:00:00.123Z");
  assert.deepEqual(whereEventos({ localId: 10, desde: { fecha: f, transferenciaId: 5 }, hasta }).OR, [
    { fechaRecepcion: { gt: f } },
    { fechaRecepcion: f, id: { gt: 5 } },
  ]);
  assert.deepEqual(ORDEN_EVENTOS, [{ fechaRecepcion: "asc" }, { id: "asc" }]);
});

test("el select es el compartido con la cuenta del período, más tieneDiferencias y nada más", () => {
  assert.deepEqual(Object.keys(SELECT_EVENTO).sort(), [...Object.keys(SELECT_TRANSFERENCIA_DE_LA_CUENTA), "tieneDiferencias"].sort());
});

test("pide limite + 1 filas, con el local de la AUTORIZACIÓN", async () => {
  const db = baseDeMentira([]);
  await transferenciasEventos(AUTZ, { limite: 7 }, { db, ahora: AHORA });
  assert.equal(db.pedidos[0].take, 8);
  assert.equal(db.pedidos[0].where.destinoId, 10);
});

// ── el evento ─────────────────────────────────────────────────────────────

test("el evento lleva lo mínimo: tipo, clave, id, fecha, origen, destino y las dos diferencias", () => {
  const t = transferencia({ id: 182, fechaRecepcion: new Date("2026-10-07T14:00:00.123Z"), tieneDiferencias: true, detalle: [linea(7), linea(12), linea(10)] });
  assert.deepEqual(aEvento(t), {
    tipo: TIPO_TRANSFERENCIA_RECIBIDA,
    eventoId: "TRANSFERENCIA_RECIBIDA:182:2026-10-07T14:00:00.123Z",
    transferenciaId: 182,
    fechaRecepcion: "2026-10-07T14:00:00.123Z",
    origen: { id: 1, nombre: "Depósito Central", esDeposito: true },
    destino: { id: 10, nombre: "Casiano" },
    tieneDiferencias: true,
    lineasConDiferencia: 2,
  });
});

test("9. tieneDiferencias y lineasConDiferencia son dos datos: no se fuerzan a coincidir", () => {
  // Una línea histórica que la puerta no puede leer: la columna dice que sí, el conteo la saltea.
  const ilegible = linea(3);
  delete ilegible.recibido;
  const e = aEvento(transferencia({ tieneDiferencias: true, detalle: [ilegible] }));
  assert.equal(e.tieneDiferencias, true);
  assert.equal(e.lineasConDiferencia, 0);
});

test("G. reset-operativo puede reutilizar el id: con otra fecha, la clave del evento es otra", () => {
  const antes = aEvento(transferencia({ id: 1, fechaRecepcion: new Date("2026-09-01T10:00:00.000Z") }));
  const despues = aEvento(transferencia({ id: 1, fechaRecepcion: new Date("2026-10-07T10:00:00.000Z") }));
  assert.equal(antes.transferenciaId, despues.transferenciaId);
  assert.notEqual(antes.eventoId, despues.eventoId);
  assert.equal(idDeEvento(1, "2026-09-01T10:00:00.000Z"), "TRANSFERENCIA_RECIBIDA:1:2026-09-01T10:00:00.000Z");
});

// ── el cursor ─────────────────────────────────────────────────────────────

test("A. dos transferencias con el mismo fechaRecepcion: aparecen las dos, aun cortando la página entre ellas", async () => {
  const misma = new Date(HACE(600));
  const filas = [transferencia({ id: 50, fechaRecepcion: misma }), transferencia({ id: 51, fechaRecepcion: misma }), transferencia({ id: 52, fechaRecepcion: misma })];
  const { vistos } = await recorrer(baseDeMentira(filas), { limite: 1 });
  assert.deepEqual(vistos.map((e) => e.transferenciaId), [50, 51, 52]);
});

test("B. una transferencia posterior por id pero anterior por fecha no rompe el orden", async () => {
  const filas = [
    transferencia({ id: 90, fechaRecepcion: new Date(HACE(900)) }),
    transferencia({ id: 10, fechaRecepcion: new Date(HACE(800)) }),
    transferencia({ id: 95, fechaRecepcion: new Date(HACE(1000)) }),
  ];
  const { vistos } = await recorrer(baseDeMentira(filas), { limite: 2 });
  assert.deepEqual(vistos.map((e) => e.transferenciaId), [95, 90, 10]);
});

test("10/11/12. paginación: sin saltos ni duplicados, cualquiera sea el tamaño de página", async () => {
  const misma = new Date(HACE(700));
  const filas = [
    ...Array.from({ length: 7 }, (_, i) => transferencia({ id: 200 + i, fechaRecepcion: misma })),
    ...Array.from({ length: 6 }, (_, i) => transferencia({ id: 100 - i, fechaRecepcion: new Date(HACE(600 - i)) })),
  ];
  const esperado = [...filas].sort((a, b) => a.fechaRecepcion - b.fechaRecepcion || a.id - b.id).map((f) => f.id);
  for (const limite of [1, 2, 3, 5, 13, 100]) {
    const { vistos } = await recorrer(baseDeMentira(filas), { limite });
    assert.deepEqual(vistos.map((e) => e.transferenciaId), esperado, `limite ${limite}`);
    assert.equal(new Set(vistos.map((e) => e.eventoId)).size, vistos.length, `limite ${limite}: sin claves repetidas`);
  }
});

test("siguiente es el último evento devuelto; sin eventos, no avanza; hayMas solo con la fila de más", async () => {
  const filas = [transferencia({ id: 1 }), transferencia({ id: 2 })];
  const db = baseDeMentira(filas);
  const r1 = await transferenciasEventos(AUTZ, { limite: 1 }, { db, ahora: AHORA });
  assert.equal(r1.datos.hayMas, true);
  assert.deepEqual(r1.datos.siguiente, { fechaRecepcion: r1.datos.eventos[0].fechaRecepcion, transferenciaId: 1 });
  const r2 = await transferenciasEventos(AUTZ, { limite: 1, desde: r1.datos.siguiente }, { db, ahora: AHORA });
  assert.equal(r2.datos.hayMas, false);
  const r3 = await transferenciasEventos(AUTZ, { desde: r2.datos.siguiente }, { db, ahora: AHORA });
  assert.deepEqual(r3.datos.eventos, []);
  assert.deepEqual(r3.datos.siguiente, r2.datos.siguiente, "sin eventos, el cursor se queda donde estaba");
  const vacio = await transferenciasEventos(AUTZ, {}, { db: baseDeMentira([]), ahora: AHORA });
  assert.equal(vacio.datos.siguiente, null);
});

// ── el margen de 60 s ─────────────────────────────────────────────────────

test("C/D. una recepción dentro de los 60 s NO aparece; pasado el margen, aparece una sola vez", async () => {
  const recien = transferencia({ id: 300, fechaRecepcion: new Date(AHORA - 30_000) });
  const vieja = transferencia({ id: 301, fechaRecepcion: new Date(HACE(600)) });
  const db = baseDeMentira([recien, vieja]);

  const ahora = await recorrer(db, { ahora: AHORA });
  assert.deepEqual(ahora.vistos.map((e) => e.transferenciaId), [301], "la de hace 30 s todavía no");
  assert.equal(ahora.ultima.hasta, ISO(AHORA - 60_000));

  // Justo en el borde: fecha == ahora − 60 s entra (lte).
  const enElBorde = await recorrer(db, { desde: ahora.cursor, ahora: recien.fechaRecepcion.getTime() + 60_000 });
  assert.deepEqual(enElBorde.vistos.map((e) => e.transferenciaId), [300]);

  // Y después no vuelve a aparecer.
  const despues = await recorrer(db, { desde: enElBorde.cursor, ahora: AHORA + 3600_000 });
  assert.deepEqual(despues.vistos, []);
});

// ── qué es una recepción ──────────────────────────────────────────────────

test("E/F/7/8. solo Recibida con fecha; Enviada, Recibiendo, Cancelada o Recibida sin fecha no se publican", async () => {
  const filas = [
    transferencia({ id: 400 }),
    transferencia({ id: 401, fechaRecepcion: null }),
    transferencia({ id: 402, estado: "Enviada", fechaRecepcion: new Date(HACE(600)) }),
    transferencia({ id: 403, estado: "Recibiendo", fechaRecepcion: new Date(HACE(600)), detalle: [linea(4)] }),
    transferencia({ id: 404, estado: "Cancelada", fechaRecepcion: new Date(HACE(600)) }),
    transferencia({ id: 405, estado: "Confirmando", fechaRecepcion: new Date(HACE(600)) }),
  ];
  const { vistos } = await recorrer(baseDeMentira(filas));
  assert.deepEqual(vistos.map((e) => e.transferenciaId), [400]);
});

test("9. el local A no recibe eventos del local B, ni los que A ENVIÓ", async () => {
  const filas = [
    transferencia({ id: 500, destinoId: 10 }),
    transferencia({ id: 501, destinoId: 11, destino: { id: 11, nombre: "Centro" } }),
    transferencia({ id: 502, origenId: 10, destinoId: 11, origen: { id: 10, nombre: "Casiano", es_deposito: false }, destino: { id: 11, nombre: "Centro" } }),
  ];
  const { vistos } = await recorrer(baseDeMentira(filas));
  assert.deepEqual(vistos.map((e) => e.transferenciaId), [500]);
});

test("la respuesta: capacidad, versión, local, grupo, hasta, eventos, siguiente y hayMas", async () => {
  const r = await transferenciasEventos(AUTZ, {}, { db: baseDeMentira([transferencia({ id: 600 })]), ahora: AHORA });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.datos), ["capacidad", "version", "local", "grupoId", "hasta", "eventos", "siguiente", "hayMas"]);
  assert.equal(r.datos.capacidad, "transferencias_eventos");
  assert.equal(r.datos.version, 1);
  assert.deepEqual(r.datos.local, { id: 10, nombre: "Casiano" });
  assert.equal(r.datos.grupoId, 1);
});

test("un parámetro inválido no llega a la base", async () => {
  const db = baseDeMentira([transferencia()]);
  const r = await transferenciasEventos(AUTZ, { limite: 101 }, { db, ahora: AHORA });
  assert.equal(r.codigo, "PEDIDO_INVALIDO");
  assert.equal(db.pedidos.length, 0);
});

// ── por la puerta: atenderSolicitud con firma, delegación y ejecutor real ──
//
// El ejecutor es el de verdad (`transferenciasEventos`) sobre la base de
// mentira. El cargador tiene la forma de `cargadorErp`.

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const MARCA = String(Math.floor(AHORA / 1000));
const TOKEN = generarTokenDelegacion();
const GRUPO_DE = { 10: 1, 11: 1, 20: 2 };

function puerta({ cuerpo, permisos = ["transferencias.ver"], localId = 10, activo = true, filas = [transferencia({ id: 700 })] } = {}) {
  const db = baseDeMentira(filas);
  const cargador = {
    delegacion: async (hash) =>
      hash === hashTokenDelegacion(TOKEN) ? { id: 5, vinculo: { id: 3, usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null } } : null,
    usuario: async (id) => (id === 7 ? { id: 7, activo, localId, rol: { permisos } } : null),
    grupoDeLocal: async (id) => GRUPO_DE[id] ?? null,
  };
  const texto = JSON.stringify(cuerpo);
  const headers = new Headers({
    [CABECERAS.aplicacion]: "azul-chat",
    [CABECERAS.marca]: MARCA,
    [CABECERAS.firma]: firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }),
  });
  const ejecutores = { transferencias_eventos: (autz, parametros, { ahora }) => transferenciasEventos(autz, parametros, { db, ahora }) };
  return { db, correr: async () => aRespuestaPublica(await atenderSolicitud({ headers, cuerpo: texto }, { cargador, ejecutores, entorno: ENTORNO, ahora: AHORA })) };
}

const pedidoEventos = (extra = {}) => ({
  capacidad: "transferencias_eventos",
  delegacion: { token: TOKEN },
  alcance: { grupoId: 1, localId: 10 },
  parametros: {},
  ...extra,
});

test("por la puerta: una consulta válida devuelve los eventos, sin caché", async () => {
  const r = await puerta({ cuerpo: pedidoEventos() }).correr();
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.datos.eventos.map((e) => e.transferenciaId), [700]);
  assert.equal(r.cabeceras["Cache-Control"], "no-store");
});

test("14. parámetros extra, usuarioId, alcance o cuerpo de más: SOLICITUD_INVALIDA, sin tocar la base", async () => {
  for (const cuerpo of [
    pedidoEventos({ parametros: { usuarioId: 8 } }),
    pedidoEventos({ parametros: { desde: null } }),
    pedidoEventos({ parametros: { limite: 101 } }),
    pedidoEventos({ parametros: { sql: "select 1" } }),
    pedidoEventos({ alcance: { grupoId: 1, localId: 10, usuarioId: 8 } }),
    pedidoEventos({ usuarioId: 8 }),
    pedidoEventos({ alcance: undefined }),
  ]) {
    const { db, correr } = puerta({ cuerpo });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"], JSON.stringify(cuerpo));
    assert.equal(db.pedidos.length, 0, JSON.stringify(cuerpo));
  }
});

test("6. otro usuario no se elige desde el cuerpo: la persona sale de la delegación", async () => {
  // El usuario 7 sin el permiso no se arregla mandando otro id en ningún lado.
  const { db, correr } = puerta({ cuerpo: pedidoEventos({ parametros: { usuarioId: 9 } }), permisos: [] });
  assert.equal((await correr()).cuerpo.codigo, "SOLICITUD_INVALIDA");
  assert.equal(db.pedidos.length, 0);
});

test("J por la puerta: un local fuera del alcance es NO_AUTORIZADO y el ejecutor no corre", async () => {
  for (const alcance of [{ grupoId: 1, localId: 11 }, { grupoId: 2, localId: 20 }]) {
    const { db, correr } = puerta({ cuerpo: pedidoEventos({ alcance }) });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [403, "NO_AUTORIZADO"], JSON.stringify(alcance));
    assert.equal(r.cuerpo.datos, undefined, "no hay lista vacía: hay rechazo");
    assert.equal(db.pedidos.length, 0);
  }
});

test("1/2/3/5 por la puerta: sin delegación, inactivo, sin permiso o grupo inconsistente no ejecutan", async () => {
  const casos = [
    [puerta({ cuerpo: pedidoEventos({ delegacion: { token: generarTokenDelegacion() } }) }), "VINCULO_NO_VALIDO"],
    [puerta({ cuerpo: pedidoEventos(), activo: false }), "NO_AUTORIZADO"],
    [puerta({ cuerpo: pedidoEventos(), permisos: ["reportes.ver"] }), "NO_AUTORIZADO"],
    [puerta({ cuerpo: pedidoEventos({ alcance: { grupoId: 2, localId: 10 } }) }), "NO_AUTORIZADO"],
  ];
  for (const [p, codigo] of casos) {
    const r = await p.correr();
    assert.equal(r.cuerpo.codigo, codigo);
    assert.equal(p.db.pedidos.length, 0);
  }
});

test("18. los códigos que puede devolver la capacidad ya tienen traducción pública: el contrato no crece", () => {
  for (const interno of ["PEDIDO_INVALIDO", "LOCAL_SIN_GRUPO", "SIN_PERMISO", "FUERA_DE_ALCANCE", "GRUPO_LOCAL_INCONSISTENTE", "USUARIO_INACTIVO"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(TRADUCCION, interno), interno);
  }
  assert.deepEqual(Object.keys(PUBLICOS).sort(), [
    "CAPACIDAD_NO_DISPONIBLE",
    "CODIGO_NO_VALIDO",
    "CUERPO_DEMASIADO_GRANDE",
    "ERROR_AL_CALCULAR",
    "INTEGRACION_NO_DISPONIBLE",
    "LIMITE_EXCEDIDO",
    "NO_AUTORIZADO",
    "PERIODO_DEMASIADO_LARGO",
    "PERIODO_INVALIDO",
    "SOLICITUD_INVALIDA",
    "SOLICITUD_NO_AUTENTICADA",
    "TIPO_DE_CONTENIDO_INVALIDO",
    "VINCULO_NO_VALIDO",
  ]);
});

test("el pedido más grande posible entra en el tope de la puerta", () => {
  const cuerpo = JSON.stringify(
    pedidoEventos({ parametros: { desde: { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: Number.MAX_SAFE_INTEGER }, limite: LIMITE_MAXIMO } })
  );
  assert.ok(Buffer.byteLength(cuerpo) < MAX_BYTES_CUERPO / 4, `${Buffer.byteLength(cuerpo)} bytes`);
});

test("la base de mentira no acepta operadores que no conoce (si el where cambia, esto se entera)", () => {
  assert.throws(() => cumple({ x: 1 }, { x: { gte: 1 } }), /no soportado/);
  assert.throws(() => cumple({ x: 1 }, { x: { in: [1] } }), /no soportado/);
});
