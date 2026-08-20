// Candados de "esta venta no era interna".
//
// El caso de origen es la venta 7726 / transferencia #97 del 2026-08-19: se
// eligió el cliente "Minimarket casiano" —vinculado a un local— cuando la venta
// era para Minimarket ayala, que es un cliente común. La venta disparó un remito
// de 155.486,40 a un local que nunca compró.
//
// Los datos de los fixtures son los reales, leídos de producción.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  puedeDesvincular,
  tieneAlgunaRecepcion,
  CODIGOS_DESVINCULAR,
  MOTIVO_MIN,
} from "./desvincularVenta.js";
import { bloqueoCorreccion } from "./integracionVenta.js";
import {
  reversionStockOrigen,
  movimientoStockOrigen,
  politicaDeLaTransferencia,
  SOLO_TRANSITO,
  DESCONTAR_Y_TRANSITO,
} from "../transferencias/politicasStock.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const MOTIVO = "Se eligio mal el cliente en el POS: era Minimarket ayala.";

// La #97 tal como está: Enviada, cinco líneas, ninguna con recepción.
const LINEAS_97 = [
  { id: 2684, cantidad: 3.62, recibido: null, unidadEnviada: "UNIDAD" },
  { id: 2685, cantidad: 24, recibido: null, unidadEnviada: "UNIDAD" },
  { id: 2686, cantidad: 2, recibido: null, unidadEnviada: "UNIDAD" },
  { id: 2687, cantidad: 4.3, recibido: null, unidadEnviada: "UNIDAD" },
  { id: 2688, cantidad: 24, recibido: null, unidadEnviada: "UNIDAD" },
];

const VENTA_7726 = {
  id: 7726,
  clienteId: 2, // Minimarket casiano — VINCULADO al local 4
  grupoId: 1,
  transferencia: { id: 97, estado: "Enviada", detalle: LINEAS_97 },
};

const AYALA = { id: 5, nombre: "Minimarket ayala", localVinculadoId: null, grupoId: 1 };
const CASIANO = { id: 2, nombre: "Minimarket casiano", localVinculadoId: 4, grupoId: 1 };
const MINI7 = { id: 1, nombre: "Minimarket7", localVinculadoId: 2, grupoId: 1 };

// ── EL CASO REAL ────────────────────────────────────────────────────────────

test("1. la #97 se puede desvincular hacia Minimarket ayala", () => {
  const v = puedeDesvincular({ venta: VENTA_7726, clienteNuevo: AYALA, motivo: MOTIVO });
  assert.equal(v.puede, true);
  assert.equal(v.codigo, CODIGOS_DESVINCULAR.OK);
});

// ── LA CONTRAPRUEBA DEL RIESGO, QUE ES LA QUE JUSTIFICA EL DISEÑO ───────────

test("2. NO se puede cancelar una transferencia de venta sin cambiar el cliente", () => {
  // Éste es EL candado de la operación, y lo pidió Emanuel por nombre. El riesgo
  // que ataja: si se pudiera cancelar dejando el cliente vinculado, la mercadería
  // quedaría descontada del depósito y no entraría en ningún local. Desaparece de
  // la contabilidad y nada avisa.
  //
  // No hay forma de expresar "cancelar sin cambiar el cliente" en esta API: el
  // cliente nuevo es obligatorio y tiene que ser DISTINTO y SIN vínculo. Las tres
  // formas de intentarlo se rechazan, cada una por su código.

  // a) Sin cliente nuevo: no alcanza con querer cancelar.
  assert.equal(
    puedeDesvincular({ venta: VENTA_7726, clienteNuevo: null, motivo: MOTIVO }).codigo,
    CODIGOS_DESVINCULAR.CLIENTE_NUEVO_AUSENTE
  );

  // b) Con el MISMO cliente: sería cancelar y nada más.
  assert.equal(
    puedeDesvincular({ venta: VENTA_7726, clienteNuevo: CASIANO, motivo: MOTIVO }).codigo,
    CODIGOS_DESVINCULAR.CLIENTE_NUEVO_ES_EL_MISMO
  );

  // c) Con OTRO cliente que también está vinculado: la venta seguiría siendo
  //    interna, así que cancelar dejaría la mercadería sin destino. Lo que ese
  //    caso necesita es redirigir el remito, que todavía no existe.
  const conOtroVinculado = puedeDesvincular({
    venta: VENTA_7726,
    clienteNuevo: MINI7,
    motivo: MOTIVO,
  });
  assert.equal(conOtroVinculado.codigo, CODIGOS_DESVINCULAR.CLIENTE_NUEVO_VINCULADO);
  assert.match(conOtroVinculado.error, /vinculado a un local/i);
});

test("2b. y la ruta no expone ninguna otra puerta para cancelar", () => {
  // El par del anterior. El candado de arriba prueba el predicado; éste prueba
  // que la RUTA no tenga un camino que lo saltee — un flag, un modo, una rama que
  // cancele antes de validar. Sin esto, el predicado podría ser impecable y la
  // ruta cancelar igual.
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/desvincular/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  // El veredicto se consulta y se corta ANTES de abrir la transacción.
  const posVeredicto = src.indexOf("puedeDesvincular(");
  const posTransaccion = src.indexOf("$transaction");
  assert.ok(posVeredicto > 0, "la ruta tiene que consultar el predicado");
  assert.ok(
    posVeredicto < posTransaccion,
    "el predicado se evalúa DESPUÉS de abrir la transacción: hay una ventana para cancelar sin validar"
  );
  assert.match(src, /if\s*\(\s*!veredicto\.puede\s*\)/, "el rechazo del predicado tiene que cortar");

  // Y el cliente se escribe en la MISMA transacción que la cancelación.
  const posCancela = src.indexOf('estado: "Cancelada"');
  const posCliente = src.indexOf("clienteId: clienteNuevo.id");
  assert.ok(posCancela > posTransaccion, "la cancelación tiene que estar dentro de la transacción");
  assert.ok(posCliente > posTransaccion, "el cambio de cliente tiene que estar dentro de la transacción");
});

// ── LAS CONDICIONES DE ESTADO ───────────────────────────────────────────────

test("3. solo con la transferencia en Enviada", () => {
  for (const estado of ["Recibiendo", "Recibida", "Cancelada", "Pendiente", "Cancelando"]) {
    const v = puedeDesvincular({
      venta: { ...VENTA_7726, transferencia: { id: 97, estado, detalle: LINEAS_97 } },
      clienteNuevo: AYALA,
      motivo: MOTIVO,
    });
    assert.equal(v.puede, false, `${estado} no debería poder`);
    assert.equal(v.codigo, CODIGOS_DESVINCULAR.TRANSFERENCIA_NO_ENVIADA);
  }
});

test("3b. y una venta sin transferencia no pasa por acá", () => {
  const v = puedeDesvincular({
    venta: { ...VENTA_7726, transferencia: null },
    clienteNuevo: AYALA,
    motivo: MOTIVO,
  });
  assert.equal(v.codigo, CODIGOS_DESVINCULAR.SIN_TRANSFERENCIA);
  assert.match(v.error, /corrección simple/i);
});

test("4. ninguna línea recibida — y 0 recibido YA es una recepción", () => {
  // La distinción que se cobra en todo el módulo: `null` es "nadie tocó",
  // `0` es "abrieron el remito y dijeron que no llegó nada". Colapsarlos dejaría
  // cancelar un remito que el destino ya empezó a procesar.
  assert.equal(tieneAlgunaRecepcion(LINEAS_97), false);
  assert.equal(tieneAlgunaRecepcion([{ recibido: null }, { recibido: 0 }]), true);
  assert.equal(tieneAlgunaRecepcion([{ recibido: null }, { recibido: 5 }]), true);
  assert.equal(tieneAlgunaRecepcion([{ recibido: undefined }]), false);

  const conCero = LINEAS_97.map((l, i) => (i === 2 ? { ...l, recibido: 0 } : l));
  const v = puedeDesvincular({
    venta: { ...VENTA_7726, transferencia: { id: 97, estado: "Enviada", detalle: conCero } },
    clienteNuevo: AYALA,
    motivo: MOTIVO,
  });
  assert.equal(v.codigo, CODIGOS_DESVINCULAR.TRANSFERENCIA_CON_RECEPCION);
});

test("5. el motivo es obligatorio y tiene que decir algo", () => {
  for (const motivo of ["", "   ", "error", "sin", null, undefined, 42]) {
    const v = puedeDesvincular({ venta: VENTA_7726, clienteNuevo: AYALA, motivo });
    assert.equal(v.codigo, CODIGOS_DESVINCULAR.MOTIVO_AUSENTE, `motivo ${JSON.stringify(motivo)}`);
  }
  // Justo en el límite, y con espacios alrededor que no cuentan.
  const justo = "x".repeat(MOTIVO_MIN);
  assert.equal(puedeDesvincular({ venta: VENTA_7726, clienteNuevo: AYALA, motivo: `  ${justo}  ` }).puede, true);
  assert.equal(
    puedeDesvincular({ venta: VENTA_7726, clienteNuevo: AYALA, motivo: "x".repeat(MOTIVO_MIN - 1) }).puede,
    false
  );
});

test("6. no se cruzan grupos", () => {
  const v = puedeDesvincular({
    venta: VENTA_7726,
    clienteNuevo: { ...AYALA, grupoId: 99 },
    motivo: MOTIVO,
  });
  assert.equal(v.codigo, CODIGOS_DESVINCULAR.CLIENTE_NUEVO_DE_OTRO_GRUPO);
});

// ── LA REVERSIÓN SIMÉTRICA ──────────────────────────────────────────────────

test("7. SOLO_TRANSITO revierte el tránsito y NO devuelve la cantidad", () => {
  // Lo que hacía mal el cancelar viejo, y el motivo por el que estaba prohibido.
  const { update } = reversionStockOrigen(SOLO_TRANSITO, 24);
  assert.deepEqual(update, { enTransito: { decrement: 24 } });
  assert.ok(!("cantidad" in update), "devolver la cantidad inventa mercadería que la venta ya cobró");
});

test("7b. DESCONTAR_Y_TRANSITO sí devuelve la cantidad", () => {
  const { update } = reversionStockOrigen(DESCONTAR_Y_TRANSITO, 24);
  assert.deepEqual(update, { cantidad: { increment: 24 }, enTransito: { decrement: 24 } });
});

test("7c. la reversión es la INVERSA EXACTA del movimiento, no algo parecido", () => {
  // El candado que importa de las dos funciones juntas: aplicar el movimiento y
  // después la reversión tiene que dejar el stock donde estaba. Se simula el
  // álgebra de los fragmentos de Prisma sobre un saldo.
  const aplicar = (saldo, frag) => ({
    cantidad: saldo.cantidad + (frag.cantidad?.increment ?? 0) - (frag.cantidad?.decrement ?? 0),
    enTransito: saldo.enTransito + (frag.enTransito?.increment ?? 0) - (frag.enTransito?.decrement ?? 0),
  });

  for (const politica of [SOLO_TRANSITO, DESCONTAR_Y_TRANSITO]) {
    const inicial = { cantidad: 100, enTransito: 7 };
    const despuesDeEnviar = aplicar(inicial, movimientoStockOrigen(politica, 24).update);
    const despuesDeCancelar = aplicar(despuesDeEnviar, reversionStockOrigen(politica, 24).update);
    assert.deepEqual(despuesDeCancelar, inicial, `${politica} no vuelve al punto de partida`);
  }
});

test("7d. una política desconocida no revierte nada: lanza", () => {
  assert.throws(() => reversionStockOrigen("INVENTADA", 10), (e) => e.code === "POLITICA_STOCK_INVALIDA");
  assert.throws(() => reversionStockOrigen(undefined, 10), (e) => e.code === "POLITICA_STOCK_INVALIDA");
});

test("8. la política se deriva de ventaId, y así nacieron las 101 de producción", () => {
  assert.equal(politicaDeLaTransferencia({ ventaId: 7726, posTransferenciaId: null }), SOLO_TRANSITO);
  assert.equal(politicaDeLaTransferencia({ ventaId: null, posTransferenciaId: 12 }), DESCONTAR_Y_TRANSITO);
  assert.equal(politicaDeLaTransferencia({}), DESCONTAR_Y_TRANSITO);
  assert.equal(politicaDeLaTransferencia(null), DESCONTAR_Y_TRANSITO);
});

test("8b. y cada llamador real sigue mandando la política que la derivación supone", () => {
  // Si mañana alguien cambia uno de los dos llamadores, la derivación empieza a
  // mentir y el stock se revierte al revés. Es la única forma de enterarse sin
  // una columna en la base.
  const leer = (rel) =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  const venta = leer("app/api/pos-ventas/crear/route.js");
  assert.match(venta, /politicaStockOrigen:\s*SOLO_TRANSITO/,
    "la venta dejó de usar SOLO_TRANSITO: politicaDeLaTransferencia quedó mintiendo");
  assert.match(venta, /ventaId:\s*nuevaVenta\.id/,
    "la venta dejó de pasar ventaId: la derivación no puede reconocerla");

  const pos = leer("app/api/pos-transferencias/enviar/route.js");
  assert.match(pos, /politicaStockOrigen:\s*DESCONTAR_Y_TRANSITO/,
    "el flujo manual dejó de usar DESCONTAR_Y_TRANSITO");
  assert.doesNotMatch(pos, /ventaId:\s*[a-zA-Z]/,
    "el flujo manual empezó a pasar ventaId: la derivación lo confundiría con una venta");
});

// ── EL BLOQUEO DE CORRECCIÓN ────────────────────────────────────────────────

test("9. Cancelada NO bloquea la corrección; los estados vivos sí", () => {
  // Sin esta excepción la operación no puede escribir el cliente nuevo, y
  // cualquier corrección futura de esa venta quedaría prohibida para siempre por
  // un remito que ya no significa nada.
  assert.equal(bloqueoCorreccion({ transferencia: { id: 97, estado: "Cancelada" } }), null);
  assert.equal(bloqueoCorreccion({ transferencia: null }), null);
  assert.equal(bloqueoCorreccion({}), null);

  for (const estado of ["Enviada", "Recibiendo", "Recibida", "Cancelando"]) {
    const b = bloqueoCorreccion({ transferencia: { id: 97, estado } });
    assert.ok(b, `${estado} tiene que seguir bloqueando`);
    assert.equal(b.status, 409);
  }
});

// ── LA RUTA, LEÍDA ──────────────────────────────────────────────────────────

test("10. la ruta exige los DOS permisos", () => {
  const src = fs.readFileSync(
    path.join(RAIZ, "app/api/pos-ventas/venta/[id]/desvincular/route.js"),
    "utf8"
  );
  assert.match(src, /ventas\.corregir_simple/);
  assert.match(src, /transferencias\.cancelar/);
});

test("11. la ruta no toca plata ni caja", () => {
  // La venta ocurrió y se cobró. Si esta operación tocara pagos o movimientos de
  // caja, descuadraría un turno por corregir un nombre.
  //
  // ── ESTE CANDADO SE ESCRIBIÓ MAL LA PRIMERA VEZ, Y VALE CONTARLO ──────────
  //
  // Buscaba la cadena "total:" y dio ROJO sobre una ruta correcta: la encontró en
  // `total: true` del select y en `totalAnterior`/`totalNuevo` del rastro, que son
  // una lectura y un registro, no una escritura de plata. Un candado que no
  // distingue leer de escribir no afirma lo que dice afirmar.
  //
  // Lo que hay que mirar es el `data` del update de la venta: ahí y solo ahí se
  // decide qué cambia. Se afirma la lista COMPLETA de lo que escribe, así que
  // agregar cualquier campo —total, pagos, lo que sea— pone esto en rojo.
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/desvincular/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  // Ninguna tabla de plata se toca, en ningún modo.
  for (const prohibido of ["ventaPago", "cajaMovimiento", "movimientoCaja", "cuentaCorriente"]) {
    assert.ok(
      !src.includes(prohibido),
      `la ruta menciona ${prohibido}: esta operación no debe tocar plata`
    );
  }

  // Y el update de la venta escribe EXACTAMENTE dos cosas.
  const m = src.match(/venta\.updateMany\(\{[\s\S]*?data:\s*\{([\s\S]*?)\}\s*,?\s*\}\)/);
  assert.ok(m, "no se encontró el update de la venta");
  const campos = m[1]
    .split(",")
    .map((s) => s.split(":")[0].trim())
    .filter(Boolean);
  assert.deepEqual(
    campos.sort(),
    ["clienteId", "version"],
    "el update de la venta escribe algo más que el cliente y la versión"
  );
});

test("12. la ruta persiste motivo, quién y cuándo", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/desvincular/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(src, /ventaCorreccion\.create/, "sin registro, la cancelación es indetectable después");
  assert.match(src, /motivo,/);
  assert.match(src, /usuarioId:\s*session\.id/);
  assert.match(src, /tipo:\s*"DESVINCULAR"/);
  // `createdAt` lo pone el default del modelo: no hace falta escribirlo, pero sí
  // que exista la fila.
});

test("13. la barrera atómica está, y es condicional por estado", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/desvincular/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(src, /updateMany\(\{[\s\S]*?estado:\s*"Enviada"[\s\S]*?estado:\s*"Cancelando"/,
    "sin la barrera condicional, dos pedidos concurrentes revierten el tránsito dos veces");
  assert.match(src, /lock\.count === 0/);
  assert.match(src, /version:\s*versionBase/,
    "sin bloqueo optimista, una corrección concurrente se pisa");
});
