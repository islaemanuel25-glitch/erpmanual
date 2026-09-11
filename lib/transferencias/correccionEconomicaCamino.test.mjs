// EL CAMINO COMPLETO: CONFIRMAR UNA RECEPCIÓN MUEVE EL STOCK Y LA PLATA, JUNTOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/correccionEconomicaCamino.test.mjs
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
//
// `correccionEconomica.test.mjs` prueba la PIEZA: cuánto vale lo recibido. Éste
// prueba el CAMINO, que es donde vivió el defecto: la aritmética del dinero
// estuvo bien calculada desde el PR #57 y aun así la venta seguía diciendo
// 31.500, porque nadie la escribía.
//
// Es la regla 2 de CLAUDE.md, y la quinta vez que el mismo patrón se cobra algo
// en este módulo: los candados prueban piezas, y los defectos viven entre ellas.
//
// ── CÓMO SE EJERCE SIN POSTGRES ────────────────────────────────────────────
//
// Con un doble de `tx` que registra cada escritura en orden. No es un mock que
// devuelve lo que se le pide: guarda las filas, las relee, y al final se afirma
// sobre lo que QUEDÓ. Lo que necesita PostgreSQL de verdad —que el `@@unique`
// de la idempotencia rechace el segundo intento, que el lock serialice dos
// confirmaciones— vive en `scripts/pruebas-db/`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aplicarCorreccionEconomica, CODIGOS_CORRECCION } from "./aplicarCorreccionEconomica.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── EL ESTADO INICIAL, COPIADO DE PRODUCCIÓN ───────────────────────────────
//
// Transferencia #198 y venta 16836, leídas el 2026-09-11.
const VENTA_INICIAL = () => ({
  id: 16836,
  numero: 1203,
  localId: 1,
  turnoId: 370,
  total: 31500,
  subtotal: 31500,
  netoRecibido: 31500,
  costoTotal: 31500,
  gananciaBruta: 0,
  gananciaNeta: 0,
  descuento: 0,
  descuentoAutomatico: 0,
  descuentoManual: 0,
  descuentoPorPuntos: 0,
  descuentoPromocional: 0,
  recargoPagoImporte: 0,
  comisionBancaria: 0,
  version: 0,
  corregida: false,
  turno: { id: 370, cierre: null },
  detalles: [
    {
      id: 65440,
      productoBaseId: 2410,
      nombre: "Pancho 24 Als",
      cantidad: 6,
      cantidadStock: 144,
      precio: 5250,
      precioCosto: 5250,
      subtotal: 31500,
      ganancia: 0,
      listaPrecioId: null,
      tipoPrecioAplicado: "PRECIO_VENTA",
      productoLocalId: 3429,
      precioNormal: null,
      ofertaId: null,
      ofertaNombre: null,
    },
  ],
  pagos: [{ id: 9001, medio: "EFECTIVO", monto: 31500, comision: 0, neto: 31500, modalidadId: null }],
});

/**
 * Un doble de transacción que GUARDA. No contesta lo que se le pide: mantiene el
 * estado, y al final se mira qué quedó escrito.
 */
function txFalsa(venta) {
  const escrituras = [];
  const estado = {
    venta: { ...venta },
    detalles: venta.detalles.map((d) => ({ ...d })),
    pagos: venta.pagos.map((p) => ({ ...p })),
    correcciones: [],
  };
  let proximoId = 90000;

  const registrar = (op, datos) => escrituras.push({ op, datos });

  return {
    escrituras,
    estado,
    venta: {
      findUnique: async () => ({
        ...estado.venta,
        detalles: estado.detalles,
        pagos: estado.pagos,
      }),
      updateMany: async ({ where, data }) => {
        registrar("venta.updateMany", { where, data });
        if (where.version !== undefined && estado.venta.version !== where.version) {
          return { count: 0 };
        }
        Object.assign(estado.venta, data);
        return { count: 1 };
      },
    },
    ventaDetalle: {
      deleteMany: async ({ where }) => {
        registrar("ventaDetalle.deleteMany", where);
        const n = estado.detalles.length;
        estado.detalles = [];
        return { count: n };
      },
      create: async ({ data }) => {
        registrar("ventaDetalle.create", data);
        const fila = { id: proximoId++, ...data };
        estado.detalles.push(fila);
        return fila;
      },
    },
    ventaPago: {
      update: async ({ where, data }) => {
        registrar("ventaPago.update", { where, data });
        const p = estado.pagos.find((x) => x.id === where.id);
        Object.assign(p, data);
        return p;
      },
    },
    ventaCorreccion: {
      create: async ({ data }) => {
        registrar("ventaCorreccion.create", data);
        const fila = { id: proximoId++, ...data };
        estado.correcciones.push(fila);
        return fila;
      },
    },
  };
}

const confirmar = async (recibidasFisicas, { factor = 24, venta = VENTA_INICIAL() } = {}) => {
  const tx = txFalsa(venta);
  const r = await aplicarCorreccionEconomica(tx, {
    transferencia: { id: 198, ventaId: 16836, estado: "Confirmando" },
    recibido: [{ productoBaseId: 2410, recibidasFisicas, factor }],
    usuarioId: 4,
    grupoId: 1,
  });
  return { ...tx, resultado: r };
};

// ═══════════════════════════════════════════════════════════════════════════
// EL CANDADO CRÍTICO: SOBRANTE DE 5 SUELTAS
// ═══════════════════════════════════════════════════════════════════════════

test("CAMINO · 6 PACK x24 + 5 sueltas: la venta queda en 32.593,75", async () => {
  const { estado, resultado } = await confirmar(149);

  assert.equal(resultado.aplicada, true);
  assert.equal(resultado.totalAnterior, 31500);
  assert.equal(resultado.totalNuevo, 32593.75);
  assert.equal(resultado.diferencia, 1093.75);

  assert.equal(estado.venta.total, 32593.75, "Venta.total no se corrigió");
  assert.equal(estado.venta.subtotal, 32593.75);
  assert.equal(estado.venta.corregida, true);
  assert.equal(estado.venta.version, 1, "el bloqueo optimista tiene que avanzar");
});

test("CAMINO · el pago único cierra EXACTO contra el nuevo total", async () => {
  const { estado } = await confirmar(149);
  assert.equal(estado.pagos.length, 1, "no se inventó un pago nuevo");
  assert.equal(estado.pagos[0].medio, "EFECTIVO", "el medio congelado no se toca");
  assert.equal(estado.pagos[0].monto, 32593.75);
  assert.equal(estado.pagos[0].neto, 32593.75, "sin comisión, neto es el monto");
  assert.equal(
    estado.pagos.reduce((a, p) => a + p.monto, 0),
    estado.venta.total,
    "los pagos tienen que sumar el total de la venta"
  );
});

test("CAMINO · las líneas quedan en 6 PACK + 5 UNIDAD, sin pack fraccionario", async () => {
  const { estado } = await confirmar(149);
  assert.equal(estado.detalles.length, 2);

  const [bultos, sueltas] = estado.detalles;
  assert.equal(bultos.cantidad, 6);
  assert.equal(bultos.cantidadStock, 144);
  assert.equal(bultos.subtotal, 31500);
  assert.equal(sueltas.cantidad, 5, "5 unidades, nunca 0,208 packs");
  assert.equal(sueltas.cantidadStock, 5);
  assert.equal(sueltas.subtotal, 1093.75);

  // Las unidades físicas comerciales tienen que ser EXACTAMENTE las recibidas.
  assert.equal(
    estado.detalles.reduce((a, d) => a + Number(d.cantidadStock), 0),
    149,
    "la venta corregida dice haber movido otra cantidad que la recepción"
  );
  assert.equal(
    estado.detalles.reduce((a, d) => a + Number(d.subtotal), 0),
    estado.venta.total
  );
});

test("CAMINO · la VentaCorreccion registra el original y su tipo propio", async () => {
  const { estado } = await confirmar(149);
  assert.equal(estado.correcciones.length, 1);
  const c = estado.correcciones[0];

  assert.equal(c.tipo, "RECEPCION_TRANSFERENCIA", "no puede ser COMPLETA");
  assert.equal(c.totalAnterior, 31500, "el importe original no se puede perder");
  assert.equal(c.totalNuevo, 32593.75);
  assert.equal(c.diferencia, 1093.75);
  assert.equal(c.motivo, "Corrección automática por recepción de Transferencia #198");
  assert.equal(c.idempotencyKey, "recepcion-transferencia:198");
  assert.equal(c.versionAntes, 0);
  assert.equal(c.versionDespues, 1);

  // Auditable: el estado anterior completo queda congelado.
  assert.equal(c.snapshotAntes.total, 31500);
  assert.equal(c.snapshotAntes.detalles[0].cantidadStock, 144);
  assert.equal(c.snapshotAntes.pagos[0].monto, 31500);
  assert.equal(c.snapshotDespues.total, 32593.75);
  assert.equal(c.snapshotDespues.detalles.length, 2);
  assert.equal(c.diffProductos[0].cantidadAntes, 144);
  assert.equal(c.diffProductos[0].cantidadDespues, 149);
  assert.equal(c.diffProductos[0].estado, "MAS");
  assert.equal(c.diffPagos[0].montoAntes, 31500);
  assert.equal(c.diffPagos[0].montoDespues, 32593.75);
});

test("CAMINO · CERO impacto de stock, caja y cuenta corriente", async () => {
  const { estado, escrituras } = await confirmar(149);
  const c = estado.correcciones[0];

  assert.deepEqual(c.impactoStock, [], "la corrección no puede mover inventario");
  assert.equal(c.impactoCaja.monto, 0);
  assert.equal(c.impactoCaja.signo, 0);
  assert.deepEqual(c.impactoCaja.cajaMovimientoIds, []);
  assert.equal(
    c.snapshotDespues.stockAplicadoPor,
    "confirmar-recepcion",
    "tiene que quedar escrito quién movió el stock"
  );

  // Y no se escribió NADA fuera de las cuatro tablas permitidas.
  const permitidas = new Set([
    "venta.updateMany", "ventaDetalle.deleteMany", "ventaDetalle.create",
    "ventaPago.update", "ventaCorreccion.create",
  ]);
  for (const e of escrituras) {
    assert.ok(permitidas.has(e.op), `el aplicador escribió ${e.op}, que no está permitido`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EL MISMO CANDADO HACIA ABAJO
// ═══════════════════════════════════════════════════════════════════════════

test("CAMINO · faltante 4 PACK: la venta baja a 21.000 y el pago con ella", async () => {
  const { estado, resultado } = await confirmar(96);
  assert.equal(resultado.diferencia, -10500);
  assert.equal(estado.venta.total, 21000);
  assert.equal(estado.pagos[0].monto, 21000);
  assert.equal(estado.detalles.length, 1);
  assert.equal(estado.detalles[0].cantidad, 4);
  assert.equal(estado.detalles[0].cantidadStock, 96);
  assert.equal(estado.correcciones[0].diffProductos[0].estado, "MENOS");
  // Ni deuda, ni devolución de caja, ni turno.
  assert.equal(estado.correcciones[0].impactoCaja.monto, 0);
  assert.deepEqual(estado.correcciones[0].impactoStock, []);
});

test("CAMINO · la #198 REAL de hoy, con 12 sueltas: 34.125", async () => {
  const { estado, resultado } = await confirmar(156);
  assert.equal(resultado.totalNuevo, 34125);
  assert.equal(resultado.diferencia, 2625);
  assert.equal(estado.venta.total, 34125);
  assert.equal(estado.pagos[0].monto, 34125);
  assert.equal(estado.detalles[1].cantidad, 12);
});

test("CAMINO · recibido cero: la venta vale 0 y la línea queda", async () => {
  const { estado, resultado } = await confirmar(0);
  assert.equal(resultado.totalNuevo, 0);
  assert.equal(resultado.diferencia, -31500);
  assert.equal(estado.venta.total, 0);
  assert.equal(estado.pagos[0].monto, 0, "el pago acompaña, no se borra");
  assert.equal(estado.detalles.length, 1);
  assert.equal(estado.correcciones[0].totalAnterior, 31500, "el original sigue estando");
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE NO TIENE QUE PASAR
// ═══════════════════════════════════════════════════════════════════════════

test("CAMINO · sin diferencia NO se escribe nada de la venta", async () => {
  const { estado, escrituras, resultado } = await confirmar(144);
  assert.equal(resultado.aplicada, false);
  assert.equal(escrituras.length, 0, "una recepción exacta no puede tocar la venta");
  assert.equal(estado.venta.total, 31500);
  assert.equal(estado.venta.version, 0, "ni siquiera avanza la versión");
  assert.equal(estado.correcciones.length, 0);
});

test("CAMINO · una transferencia sin venta no rompe ni escribe", async () => {
  const tx = txFalsa(VENTA_INICIAL());
  const r = await aplicarCorreccionEconomica(tx, {
    transferencia: { id: 77, ventaId: null, estado: "Confirmando" },
    recibido: [{ productoBaseId: 2410, recibidasFisicas: 149, factor: 24 }],
    usuarioId: 4,
    grupoId: 1,
  });
  assert.equal(r.aplicada, false);
  assert.equal(r.motivo, "SIN_VENTA_VINCULADA");
  assert.equal(tx.escrituras.length, 0);
});

test("CAMINO · si otra corrección movió la venta, FRENA todo", async () => {
  // El doble responde version 0 en la lectura y el updateMany filtra por esa
  // versión. Se simula la carrera cambiando la versión entre medio.
  const venta = VENTA_INICIAL();
  const tx = txFalsa(venta);
  const lecturaOriginal = tx.venta.findUnique;
  tx.venta.findUnique = async (...args) => {
    const v = await lecturaOriginal(...args);
    tx.estado.venta.version = 5; // otra corrección se metió después de leer
    return v;
  };
  await assert.rejects(
    () =>
      aplicarCorreccionEconomica(tx, {
        transferencia: { id: 198, ventaId: 16836, estado: "Confirmando" },
        recibido: [{ productoBaseId: 2410, recibidasFisicas: 149, factor: 24 }],
        usuarioId: 4,
        grupoId: 1,
      }),
    (e) => e.code === CODIGOS_CORRECCION.VERSION_DESACTUALIZADA
  );
});

test("CAMINO · una venta con descuentos o comisiones FRENA en vez de adivinar", async () => {
  // Auditado: los siete campos están en cero en las 196 ventas internas. Si
  // aparece uno, `subtotal` y `total` dejan de ser el mismo número y este camino
  // estaría escribiendo un total que no sabe componer.
  for (const campo of ["descuento", "descuentoPromocional", "comisionBancaria", "recargoPagoImporte"]) {
    const venta = { ...VENTA_INICIAL(), [campo]: 500 };
    await assert.rejects(
      () => confirmar(149, { venta }),
      (e) => e.code === CODIGOS_CORRECCION.VENTA_CON_AJUSTES,
      `una venta con ${campo} tiene que frenar`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CABLEADO Y EL BLOQUEO QUE NO SE TOCA
// ═══════════════════════════════════════════════════════════════════════════

test("CABLEADO · la corrección va DENTRO de la transacción, después de la cabecera", async () => {
  const src = sinComentarios("app/api/transferencias/confirmar-recepcion/route.js");
  const iTx = src.indexOf("prisma.$transaction");
  const iCabecera = src.indexOf("tx.transferencia.update");
  const iCorreccion = src.indexOf("aplicarCorreccionEconomica(tx");

  assert.ok(iTx > -1 && iCabecera > -1 && iCorreccion > -1, "falta alguna de las tres piezas");
  assert.ok(iTx < iCorreccion, "la corrección quedó FUERA de la transacción: podría quedar stock sin venta");
  assert.ok(iCabecera < iCorreccion, "se movió el orden del cierre");

  // Y recibe el `tx` del llamador, no abre uno propio: una transacción anidada
  // sería otra unidad de todo-o-nada, que es justo lo que no puede haber.
  const aplicador = sinComentarios("lib/transferencias/aplicarCorreccionEconomica.js");
  assert.ok(!aplicador.includes("$transaction"), "el aplicador abre su propia transacción");
  assert.ok(!aplicador.includes("import prisma"), "el aplicador se trae su propio cliente");
});

test("CABLEADO · la plata parte de las MISMAS cantidades que movieron el stock", async () => {
  // El plan firme de adentro del lock alimenta las dos cosas. Si la corrección
  // releyera la recepción por su cuenta, podría corregir contra otra cantidad.
  const src = sinComentarios("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(src, /recibidasFisicas: recibidaUnidades/, "la plata dejó de usar el plan firme");
  assert.match(src, /factor: escalaDeRecepcion\(d\)\.factorPack/, "el factor dejó de salir de la escala canónica");
  const iPlan = src.indexOf("planesFirmes.get");
  const iPush = src.indexOf("recibidoParaVenta.push");
  assert.ok(iPlan > -1 && iPush > iPlan, "las cantidades de la plata no salen del plan firme");
});

test("BLOQUEO · corregir a mano una venta con remito SIGUE devolviendo 409", async () => {
  // La excepción es interna y solo para la venta que se corrige a sí misma al
  // confirmar SU PROPIO remito. Desde el POS y desde Reportes sigue prohibido.
  const integracion = sinComentarios("lib/ventas-internas/integracionVenta.js");
  assert.match(integracion, /export function bloqueoCorreccion/, "se borró la guarda");
  assert.match(integracion, /if \(!t\) return null;/, "la guarda dejó de mirar la transferencia");

  for (const ruta of [
    "app/api/pos-ventas/corregir-simple/[id]/route.js",
    "app/api/pos-ventas/venta/[id]/corregir/route.js",
    "app/api/pos-ventas/venta/[id]/revisar/route.js",
  ]) {
    assert.ok(
      sinComentarios(ruta).includes("bloqueoCorreccion"),
      `${ruta} dejó de aplicar el bloqueo: se podría corregir a mano una venta con remito`
    );
  }
});

test("BLOQUEO · el aplicador no es alcanzable desde una ruta propia", async () => {
  // No hay endpoint que lo exponga. La única puerta es confirmar su propia
  // transferencia, y por eso no puede usarse para corregir otra venta.
  const consumidores = [];
  const caminar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) caminar(p);
      else if (e.name === "route.js" && fs.readFileSync(p, "utf8").includes("aplicarCorreccionEconomica")) {
        consumidores.push(path.relative(RAIZ, p));
      }
    }
  };
  caminar(path.join(RAIZ, "app", "api"));
  assert.deepEqual(
    consumidores,
    ["app/api/transferencias/confirmar-recepcion/route.js"],
    "apareció otra ruta que corrige ventas por este camino"
  );
});
