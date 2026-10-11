// Candados del cursor COMPARTIDO de las capacidades de eventos (Tanda 4A).
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/cursorDeEventos.test.mjs
//
// ── LA HUELLA DE transferencias_eventos ───────────────────────────────────
//
// La lógica del cursor (validar `desde` y `limite`, la condición "estrictamente
// después", `siguiente` y `hayMas`) salió de `transferenciasEventos.js` a
// `cursorDeEventos.js` para que `pedidos_eventos`, `envios_eventos` y
// `cancelaciones_eventos` no la escriban de nuevo. La condición de la tanda:
// transferencias_eventos tiene que contestar BYTE A BYTE lo mismo.
//
// `huellaDeTransferenciasEventos` corre una batería fija —respuestas buenas,
// páginas, cursores, bordes del margen y cada parámetro inválido— y serializa
// TODO lo que sale: la respuesta, el error con su texto, y los argumentos que
// la capacidad le pasa a la base (where, orderBy, take, select). Su sha256 se
// tomó corriendo esta misma batería sobre `transferenciasEventos.js` en
// origin/main 3f439c06, ANTES de extraer nada. Si un cambio mueve un byte de
// cualquiera de esas salidas, el hash cambia y esto se pone rojo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { transferenciasEventos } from "./transferenciasEventos.js";

const AHORA = Date.parse("2026-10-07T15:00:00.000Z");

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

const fila = (id, fechaISO, extra = {}) => ({
  id,
  estado: "Recibida",
  fechaEnvio: new Date("2026-10-07T10:00:00.000Z"),
  fechaRecepcion: new Date(fechaISO),
  createdAt: new Date("2026-10-07T10:00:00.000Z"),
  origenId: 1,
  destinoId: 10,
  tieneDiferencias: false,
  origen: { id: 1, nombre: "Depósito Central", es_deposito: true },
  destino: { id: 10, nombre: "Casiano" },
  detalle: [linea(10)],
  ...extra,
});

/** Una base que NO filtra: devuelve las filas que se le dan, y anota lo que le piden. */
function baseQueAnota(filas) {
  const pedidos = [];
  return {
    pedidos,
    local: { findUnique: async (args) => (pedidos.push({ local: args }), args.where.id === 10 ? { id: 10, nombre: "Casiano" } : null) },
    transferencia: { findMany: async (args) => (pedidos.push({ transferencia: args }), filas.slice(0, args.take)) },
  };
}

const FILAS = [
  fila(180, "2026-10-07T12:00:00.000Z"),
  fila(181, "2026-10-07T13:30:15.250Z", { tieneDiferencias: true, detalle: [linea(7), linea(12), linea(10)] }),
  fila(182, "2026-10-07T13:30:15.250Z", { origen: { id: 5, nombre: "Belgrano", es_deposito: false } }),
  fila(183, "2026-10-07T14:10:00.000Z"),
];

const CASOS = [
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, {}, FILAS],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { limite: 2 }, FILAS],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { limite: 3 }, FILAS],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { limite: 100, desde: { fechaRecepcion: "2026-10-07T13:30:15.250Z", transferenciaId: 181 } }, FILAS.slice(2)],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { desde: { fechaRecepcion: "2026-10-07T14:10:00.000Z", transferenciaId: 183 } }, []],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, {}, []],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { limite: 1 }, FILAS.slice(0, 1)],
  [{ capacidad: "transferencias_eventos", localId: 99, grupoId: 1 }, {}, FILAS],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, null, FILAS],
  [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, [], FILAS],
  ...[0, -1, 101, 1.5, "10", null, Number.NaN, Infinity].map((limite) => [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { limite }, FILAS]),
  ...[
    null,
    "2026-10-07T14:00:00.123Z",
    [],
    {},
    { fechaRecepcion: "2026-10-07T14:00:00.123Z" },
    { transferenciaId: 182 },
    { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: 182, usuarioId: 7 },
    { fechaRecepcion: "2026-10-07T14:00:00Z", transferenciaId: 182 },
    { fechaRecepcion: "2026-10-07T14:00:00.123-03:00", transferenciaId: 182 },
    { fechaRecepcion: "2026-02-30T14:00:00.000Z", transferenciaId: 182 },
    { fechaRecepcion: 1759845600000, transferenciaId: 182 },
    { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: 0 },
    { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: "182" },
    { fechaRecepcion: "2026-10-07T14:00:00.123Z", transferenciaId: 1.5 },
  ].map((desde) => [{ capacidad: "transferencias_eventos", localId: 10, grupoId: 1 }, { desde }, FILAS]),
];

/** Todo lo que sale de la capacidad para la batería, en un solo texto. */
export async function huellaDeTransferenciasEventos() {
  const salida = [];
  for (const [autz, parametros, filas] of CASOS) {
    for (const ahora of [AHORA, Date.parse("2026-10-07T14:11:00.000Z")]) {
      const db = baseQueAnota(filas);
      const r = await transferenciasEventos(autz, parametros, { db, ahora });
      salida.push({ r, pedidos: db.pedidos });
    }
  }
  return JSON.stringify(salida);
}

/** sha256 de la huella, tomado en origin/main 3f439c06 antes de extraer el cursor. */
const HUELLA_3F439C06 = "fd7964b93f7962b4a2e45a89ae2e83f4699935d06ed53f66321af2ac1e7371f3";

test("transferencias_eventos contesta byte a byte lo mismo que antes de extraer el cursor", async () => {
  const texto = await huellaDeTransferenciasEventos();
  const hash = createHash("sha256").update(texto).digest("hex");
  assert.equal(hash, HUELLA_3F439C06, `la huella cambió (${texto.length} caracteres)`);
});
