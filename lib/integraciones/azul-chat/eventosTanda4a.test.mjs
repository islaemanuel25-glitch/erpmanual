// Candados de `pedidos_eventos`, `envios_eventos` y `cancelaciones_eventos`
// (Tanda 4A): forma del pedido y del evento, cursor estricto con desempate por
// id, margen, hayMas, clave estable, local de la autorización y parámetros de
// más rechazados por la puerta.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/eventosTanda4a.test.mjs
//
// Las tres comparten el cursor (`cursorDeEventos.js`), así que los escenarios
// se escriben UNA vez y corren sobre cada una. La base es de mentira: una tabla
// en memoria que interpreta el `where` que arma cada `whereEventos` —y SOLO los
// operadores que usan: ante cualquier otro, tira— y ordena con el `orderBy`
// que le llega. Las filas tienen la forma del `SELECT_EVENTO` de cada una. La
// verdad contra PostgreSQL la ejerce `scripts/pruebas-db/azulChatEventosTanda4a.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";

import * as pedidos from "./pedidosEventos.js";
import * as envios from "./enviosEventos.js";
import * as cancelaciones from "./cancelacionesEventos.js";
import { LIMITE_MAXIMO, LIMITE_POR_DEFECTO } from "./cursorDeEventos.js";
import { atenderSolicitud } from "./atender.js";
import { CABECERAS, firmarSolicitud } from "./autenticacionAplicacion.js";
import { aRespuestaPublica } from "./respuestaPublica.js";
import { generarTokenDelegacion, hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

const AHORA = Date.parse("2026-10-11T15:00:00.000Z");
const ISO = (ms) => new Date(ms).toISOString();
const HACE = (s) => AHORA - s * 1000;

const ORIGEN = Object.freeze({ id: 1, nombre: "Depósito Central" });

/** Cada capacidad, con cómo se llama todo y cómo se arma una fila de su tabla. */
const CAPACIDADES_4A = [
  {
    nombre: "pedidos_eventos",
    modulo: pedidos,
    ejecutar: pedidos.pedidosEventos,
    tabla: "posTransferencia",
    columna: "solicitadoAt",
    campoFecha: "fechaSolicitud",
    campoId: "pedidoId",
    tipo: "PEDIDO_SOLICITADO",
    permiso: "pedidos.ver",
    fila: (id, fecha, extra = {}) => ({ id, solicitadoAt: fecha, destinoId: 10, origen: ORIGEN, _count: { detalles: 3 }, ...extra }),
    eventoEsperado: (id, iso) => ({ tipo: "PEDIDO_SOLICITADO", eventoId: `PEDIDO_SOLICITADO:${id}:${iso}`, pedidoId: id, fechaSolicitud: iso, origen: ORIGEN, lineas: 3 }),
    selectEsperado: ["_count", "id", "origen", "solicitadoAt"],
  },
  {
    nombre: "envios_eventos",
    modulo: envios,
    ejecutar: envios.enviosEventos,
    tabla: "transferencia",
    columna: "fechaEnvio",
    campoFecha: "fechaEnvio",
    campoId: "transferenciaId",
    tipo: "TRANSFERENCIA_ENVIADA",
    permiso: "transferencias.ver",
    fila: (id, fecha, extra = {}) => ({ id, fechaEnvio: fecha, destinoId: 10, posTransferenciaId: 77, origen: ORIGEN, _count: { detalle: 4 }, ...extra }),
    eventoEsperado: (id, iso) => ({ tipo: "TRANSFERENCIA_ENVIADA", eventoId: `TRANSFERENCIA_ENVIADA:${id}:${iso}`, transferenciaId: id, fechaEnvio: iso, origen: ORIGEN, lineas: 4, pedidoId: 77 }),
    selectEsperado: ["_count", "fechaEnvio", "id", "origen", "posTransferenciaId"],
  },
  {
    nombre: "cancelaciones_eventos",
    modulo: cancelaciones,
    ejecutar: cancelaciones.cancelacionesEventos,
    tabla: "transferencia",
    columna: "canceladaEn",
    campoFecha: "fechaCancelacion",
    campoId: "transferenciaId",
    tipo: "TRANSFERENCIA_CANCELADA",
    permiso: "transferencias.ver",
    fila: (id, fecha, extra = {}) => ({ id, canceladaEn: fecha, destinoId: 10, posTransferenciaId: null, origen: ORIGEN, ...extra }),
    eventoEsperado: (id, iso) => ({ tipo: "TRANSFERENCIA_CANCELADA", eventoId: `TRANSFERENCIA_CANCELADA:${id}:${iso}`, transferenciaId: id, fechaCancelacion: iso, origen: ORIGEN, pedidoId: null }),
    selectEsperado: ["canceladaEn", "id", "origen", "posTransferenciaId"],
  },
];

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

function baseDeMentira(cap, filas) {
  const pedidosALaBase = [];
  const findMany = async (args) => {
    pedidosALaBase.push(args);
    const comparar = (a, b) => {
      for (const criterio of args.orderBy) {
        const [[campo, dir]] = Object.entries(criterio);
        if (dir !== "asc") throw new Error(`orden no soportado: ${campo} ${dir}`);
        const d = a[campo] - b[campo];
        if (d !== 0) return d;
      }
      return 0;
    };
    return filas.filter((f) => cumple(f, args.where)).sort(comparar).slice(0, args.take);
  };
  const otra = { findMany: async () => { throw new Error("leyó la tabla de otra capacidad"); } };
  return {
    pedidos: pedidosALaBase,
    local: { findUnique: async ({ where }) => ({ 10: { id: 10, nombre: "Casiano" }, 11: { id: 11, nombre: "Centro" } })[where.id] ?? null },
    posTransferencia: cap.tabla === "posTransferencia" ? { findMany } : otra,
    transferencia: cap.tabla === "transferencia" ? { findMany } : otra,
  };
}

const AUTZ = Object.freeze({ localId: 10, grupoId: 1 });

async function recorrer(cap, db, { desde, limite, ahora = AHORA } = {}) {
  const vistos = [];
  let cursor = desde;
  for (let vueltas = 0; vueltas < 50; vueltas++) {
    const r = await cap.ejecutar(AUTZ, { ...(cursor ? { desde: cursor } : {}), ...(limite ? { limite } : {}) }, { db, ahora });
    assert.equal(r.ok, true, JSON.stringify(r));
    vistos.push(...r.datos.eventos);
    cursor = r.datos.siguiente;
    if (!r.datos.hayMas) return { vistos, cursor, ultima: r.datos };
  }
  throw new Error("la paginación no termina");
}

const idsDe = (cap, vistos) => vistos.map((e) => e[cap.campoId]);

for (const cap of CAPACIDADES_4A) {
  const { nombre } = cap;

  test(`${nombre}: constantes del contrato, margen de 60 s y orden por ${cap.columna} e id`, () => {
    assert.equal(cap.modulo.CAPACIDAD, nombre);
    assert.equal(cap.modulo.VERSION_CONTRATO, 1);
    assert.equal(cap.modulo.MARGEN_DE_VISIBILIDAD_MS, 60_000);
    assert.equal(LIMITE_POR_DEFECTO, 50);
    assert.equal(LIMITE_MAXIMO, 100);
    assert.deepEqual(cap.modulo.ORDEN_EVENTOS, [{ [cap.columna]: "asc" }, { id: "asc" }]);
    assert.deepEqual(Object.keys(cap.modulo.SELECT_EVENTO).sort(), cap.selectEsperado);
  });

  test(`${nombre}: el where es del DESTINO, con ${cap.columna} no nula y <= ahora − 60 s; desde estricto con desempate por id`, () => {
    const hasta = new Date(AHORA - 60_000);
    assert.deepEqual(cap.modulo.whereEventos({ localId: 10, desde: null, hasta }), { destinoId: 10, [cap.columna]: { not: null, lte: hasta } });
    const f = new Date("2026-10-11T14:00:00.123Z");
    assert.deepEqual(cap.modulo.whereEventos({ localId: 10, desde: { fecha: f, id: 5 }, hasta }).OR, [{ [cap.columna]: { gt: f } }, { [cap.columna]: f, id: { gt: 5 } }]);
  });

  test(`${nombre}: el evento lleva lo mínimo y su clave es TIPO:id:fechaISO`, () => {
    const iso = "2026-10-11T14:00:00.123Z";
    assert.deepEqual(cap.modulo.aEvento(cap.fila(182, new Date(iso))), cap.eventoEsperado(182, iso));
    assert.equal(cap.modulo.idDeEvento(1, iso), `${cap.tipo}:1:${iso}`);
  });

  test(`${nombre}: un id reutilizado (reset-operativo) con otra fecha da OTRA clave`, () => {
    const a = cap.modulo.aEvento(cap.fila(1, new Date("2026-09-01T10:00:00.000Z")));
    const b = cap.modulo.aEvento(cap.fila(1, new Date("2026-10-11T10:00:00.000Z")));
    assert.equal(a[cap.campoId], b[cap.campoId]);
    assert.notEqual(a.eventoId, b.eventoId);
  });

  test(`${nombre}: parámetros — limite 1..100 (50 por defecto), desde con exactamente ${cap.campoFecha} y ${cap.campoId}`, () => {
    const leer = cap.modulo.CURSOR.leerParametros;
    assert.equal(leer({}).limite, 50);
    assert.equal(leer({}).desde, null);
    for (const malo of [0, -1, 101, 1.5, "10", null, Number.NaN, Infinity]) assert.equal(leer({ limite: malo }).codigo, "PEDIDO_INVALIDO", String(malo));
    const bueno = { [cap.campoFecha]: "2026-10-11T14:00:00.123Z", [cap.campoId]: 9 };
    assert.deepEqual(leer({ desde: bueno }).desde, { fecha: new Date(bueno[cap.campoFecha]), id: 9 });
    for (const malo of [
      null,
      {},
      { [cap.campoFecha]: bueno[cap.campoFecha] },
      { ...bueno, usuarioId: 7 },
      { ...bueno, [cap.campoFecha]: "2026-10-11T14:00:00Z" },
      { ...bueno, [cap.campoFecha]: "2026-02-30T14:00:00.000Z" },
      { ...bueno, [cap.campoId]: 0 },
      { ...bueno, [cap.campoId]: "9" },
      // Las claves de OTRA capacidad no sirven: el cursor es de cada una.
      { fechaRecepcion: bueno[cap.campoFecha], [cap.campoId]: 9 },
    ]) {
      const r = leer({ desde: malo });
      assert.equal(r.codigo, "PEDIDO_INVALIDO", JSON.stringify(malo));
    }
  });

  test(`${nombre}: pide limite + 1 filas de SU tabla, con el local de la AUTORIZACIÓN`, async () => {
    const db = baseDeMentira(cap, []);
    await cap.ejecutar(AUTZ, { limite: 7 }, { db, ahora: AHORA });
    assert.equal(db.pedidos[0].take, 8);
    assert.equal(db.pedidos[0].where.destinoId, 10);
    // Con otra autorización, otro local: el cuerpo no tiene dónde elegirlo.
    const db2 = baseDeMentira(cap, []);
    await cap.ejecutar({ localId: 11, grupoId: 1 }, {}, { db: db2, ahora: AHORA });
    assert.equal(db2.pedidos[0].where.destinoId, 11);
  });

  test(`${nombre}: A. mismo milisegundo, aun cortando la página entre ellos — y B. id mayor con fecha menor va en su lugar por fecha`, async () => {
    const misma = new Date(HACE(600));
    const filas = [
      cap.fila(50, misma),
      cap.fila(51, misma),
      cap.fila(52, misma),
      cap.fila(95, new Date(HACE(1000))),
      cap.fila(10, new Date(HACE(500))),
    ];
    for (const limite of [1, 2, 3, 100]) {
      const { vistos } = await recorrer(cap, baseDeMentira(cap, filas), { limite });
      assert.deepEqual(idsDe(cap, vistos), [95, 50, 51, 52, 10], `limite ${limite}`);
      assert.equal(new Set(vistos.map((e) => e.eventoId)).size, vistos.length);
    }
  });

  test(`${nombre}: siguiente es el último devuelto; sin eventos no avanza; hayMas solo con la fila de más`, async () => {
    const db = baseDeMentira(cap, [cap.fila(1, new Date(HACE(300))), cap.fila(2, new Date(HACE(200)))]);
    const r1 = await cap.ejecutar(AUTZ, { limite: 1 }, { db, ahora: AHORA });
    assert.equal(r1.datos.hayMas, true);
    assert.deepEqual(r1.datos.siguiente, { [cap.campoFecha]: ISO(HACE(300)), [cap.campoId]: 1 });
    const r2 = await cap.ejecutar(AUTZ, { limite: 1, desde: r1.datos.siguiente }, { db, ahora: AHORA });
    assert.equal(r2.datos.hayMas, false);
    const r3 = await cap.ejecutar(AUTZ, { desde: r2.datos.siguiente }, { db, ahora: AHORA });
    assert.deepEqual(r3.datos.eventos, []);
    assert.deepEqual(r3.datos.siguiente, r2.datos.siguiente);
    const vacio = await cap.ejecutar(AUTZ, {}, { db: baseDeMentira(cap, []), ahora: AHORA });
    assert.equal(vacio.datos.siguiente, null);
  });

  test(`${nombre}: C/D. dentro de los 60 s no sale; en el borde sale, una sola vez`, async () => {
    const recien = cap.fila(300, new Date(AHORA - 30_000));
    const vieja = cap.fila(301, new Date(HACE(600)));
    const db = baseDeMentira(cap, [recien, vieja]);
    const ahora = await recorrer(cap, db);
    assert.deepEqual(idsDe(cap, ahora.vistos), [301]);
    assert.equal(ahora.ultima.hasta, ISO(AHORA - 60_000));
    const borde = await recorrer(cap, db, { desde: ahora.cursor, ahora: AHORA - 30_000 + 60_000 });
    assert.deepEqual(idsDe(cap, borde.vistos), [300]);
    const despues = await recorrer(cap, db, { desde: borde.cursor, ahora: AHORA + 3600_000 });
    assert.deepEqual(despues.vistos, []);
  });

  test(`${nombre}: sin ${cap.columna} no hay evento; y el local A no ve los del B ni los que A originó`, async () => {
    const filas = [
      cap.fila(400, new Date(HACE(600))),
      cap.fila(401, null),
      cap.fila(402, new Date(HACE(600)), { destinoId: 11 }),
      cap.fila(403, new Date(HACE(600)), { destinoId: 11, origenId: 10 }),
    ];
    const { vistos } = await recorrer(cap, baseDeMentira(cap, filas));
    assert.deepEqual(idsDe(cap, vistos), [400]);
  });

  test(`${nombre}: la respuesta tiene la forma de transferencias_eventos`, async () => {
    const r = await cap.ejecutar(AUTZ, {}, { db: baseDeMentira(cap, [cap.fila(600, new Date(HACE(600)))]), ahora: AHORA });
    assert.deepEqual(Object.keys(r.datos), ["capacidad", "version", "local", "grupoId", "hasta", "eventos", "siguiente", "hayMas"]);
    assert.deepEqual([r.datos.capacidad, r.datos.version, r.datos.local, r.datos.grupoId], [nombre, 1, { id: 10, nombre: "Casiano" }, 1]);
  });

  test(`${nombre}: un parámetro inválido no llega a la base; un local inexistente se rechaza`, async () => {
    const db = baseDeMentira(cap, [cap.fila(1, new Date(HACE(600)))]);
    assert.equal((await cap.ejecutar(AUTZ, { limite: 101 }, { db, ahora: AHORA })).codigo, "PEDIDO_INVALIDO");
    assert.equal(db.pedidos.length, 0);
    const r = await cap.ejecutar({ localId: 99, grupoId: 1 }, {}, { db, ahora: AHORA });
    assert.deepEqual([r.ok, r.codigo], [false, "LOCAL_SIN_GRUPO"]);
    assert.equal(db.pedidos.length, 0);
  });
}

test("los eventos de las tres no exponen productos, precios, ventas, usuarios ni motivos", () => {
  for (const cap of CAPACIDADES_4A) {
    const e = cap.modulo.aEvento(cap.fila(1, new Date(HACE(600)), { precio: 1, productoId: 2, ventaId: 3, solicitadoPorUserId: 4, creadaPor: 5, canceladaPorId: 6, motivoCancelacion: "x" }));
    assert.deepEqual(Object.keys(e).sort(), Object.keys(cap.eventoEsperado(1, "x")).sort(), cap.nombre);
  }
});

// ── por la puerta: atenderSolicitud con firma, delegación y el ejecutor real ──

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const MARCA = String(Math.floor(AHORA / 1000));
const TOKEN = generarTokenDelegacion();
const GRUPO_DE = { 10: 1, 11: 1, 20: 2 };

function puerta(cap, { cuerpo, permisos = [cap.permiso], localId = 10 } = {}) {
  const db = baseDeMentira(cap, [cap.fila(700, new Date(HACE(600)))]);
  const cargador = {
    delegacion: async (hash) =>
      hash === hashTokenDelegacion(TOKEN) ? { id: 5, vinculo: { id: 3, usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null } } : null,
    usuario: async (id) => (id === 7 ? { id: 7, activo: true, localId, rol: { permisos } } : null),
    grupoDeLocal: async (id) => GRUPO_DE[id] ?? null,
  };
  const texto = JSON.stringify(cuerpo);
  const headers = new Headers({
    [CABECERAS.aplicacion]: "azul-chat",
    [CABECERAS.marca]: MARCA,
    [CABECERAS.firma]: firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }),
  });
  const ejecutores = { [cap.nombre]: (autz, parametros, { ahora }) => cap.ejecutar(autz, parametros, { db, ahora }) };
  return { db, correr: async () => aRespuestaPublica(await atenderSolicitud({ headers, cuerpo: texto }, { cargador, ejecutores, entorno: ENTORNO, ahora: AHORA })) };
}

for (const cap of CAPACIDADES_4A) {
  const pedido = (extra = {}) => ({ capacidad: cap.nombre, delegacion: { token: TOKEN }, alcance: { grupoId: 1, localId: 10 }, parametros: {}, ...extra });

  test(`${cap.nombre} por la puerta: con ${cap.permiso} responde, sin caché`, async () => {
    const r = await puerta(cap, { cuerpo: pedido() }).correr();
    assert.equal(r.status, 200);
    assert.deepEqual(idsDe(cap, r.cuerpo.datos.eventos), [700]);
    assert.equal(r.cabeceras["Cache-Control"], "no-store");
  });

  test(`${cap.nombre} por la puerta: parámetros de más, usuarioId, alcance de más o sin alcance → SOLICITUD_INVALIDA sin tocar la base`, async () => {
    for (const cuerpo of [
      pedido({ parametros: { usuarioId: 8 } }),
      pedido({ parametros: { localId: 11 } }),
      pedido({ parametros: { desde: null } }),
      pedido({ parametros: { limite: 101 } }),
      pedido({ alcance: { grupoId: 1, localId: 10, usuarioId: 8 } }),
      pedido({ usuarioId: 8 }),
      pedido({ alcance: undefined }),
    ]) {
      const { db, correr } = puerta(cap, { cuerpo });
      const r = await correr();
      assert.deepEqual([r.status, r.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"], JSON.stringify(cuerpo));
      assert.equal(db.pedidos.length, 0);
    }
  });

  test(`${cap.nombre} por la puerta: sin ${cap.permiso}, o con un local fuera del alcance, NO_AUTORIZADO y el ejecutor no corre`, async () => {
    const otroPermiso = cap.permiso === "pedidos.ver" ? "transferencias.ver" : "pedidos.ver";
    for (const p of [
      puerta(cap, { cuerpo: pedido(), permisos: [otroPermiso, "reportes.ver"] }),
      puerta(cap, { cuerpo: pedido({ alcance: { grupoId: 1, localId: 11 } }) }),
      puerta(cap, { cuerpo: pedido({ alcance: { grupoId: 2, localId: 20 } }) }),
    ]) {
      const r = await p.correr();
      assert.deepEqual([r.status, r.cuerpo.codigo], [403, "NO_AUTORIZADO"]);
      assert.equal(p.db.pedidos.length, 0);
    }
  });
}

test("la base de mentira no acepta operadores que no conoce (si el where cambia, esto se entera)", () => {
  assert.throws(() => cumple({ x: 1 }, { x: { gte: 1 } }), /no soportado/);
  assert.throws(() => cumple({ x: 1 }, { x: { in: [1] } }), /no soportado/);
});
