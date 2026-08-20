// Tests del filtro que separa VENTA COMERCIAL de OPERACIÓN INTERNA.
//
// Contexto: cuando el POS del depósito le vende a un Cliente vinculado a un local
// propio, se crea Venta + VentaPago + Transferencia. Esa Venta no es una venta:
// infla los reportes y —sobre todo— suma al EFECTIVO ESPERADO del turno un cobro
// que nunca ocurrió, generando un faltante de caja inexistente.
//
// Caso real: turno 156 del depósito, 12 ventas, 4 internas por $80.000 en
// efectivo. Esperado antes $1.896.847,53 / comercial real $1.816.847,53.
//
// Los tests de integración se hacen sobre el CÓDIGO FUENTE de los endpoints (sin
// comentarios): son invariantes estructurales —"este endpoint filtra", "aquel no
// debe filtrar"— y afirmarlas acá evita que una edición futura las rompa en
// silencio o que un endpoint nuevo quede afuera.
//
// Correr con: node --test lib/ventas/filtroVentaComercial.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  soloComercial,
  soloInterna,
  whereVentaComercial,
  relacionVentaComercial,
  evaluarVentaComercial,
  SELECT_MARCA_INTERNA,
} from "./filtroVentaComercial.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Clasificación A + B: deben filtrar.
const COMERCIALES = [
  "app/api/reportes-ventas/general/route.js",
  "app/api/reportes-ventas/listado/route.js",
  "app/api/reportes-ventas/por-cliente/route.js",
  "app/api/dashboard/resumen/route.js",
  "app/api/dashboard/actividad/route.js",
  "app/api/dashboard/ventas-recientes/route.js",
  "app/api/clientes/analytics/ranking/route.js",
  "app/api/clientes/analytics/inactivos/route.js",
  "app/api/pos-ventas/stats-dia/route.js",
  "app/api/pos-ventas/historial-dia/route.js",
  // El historial de ventas de un cliente pasó de TÉCNICO a COMERCIAL.
  //
  // Estaba clasificado como técnico junto con la auditoría del POS, y la
  // clasificación era deliberada. Pero es una pantalla que mira una persona para
  // saber qué le compró un cliente, no una vista de inspección: cuando el
  // cliente está vinculado a un local interno, sus transferencias aparecían
  // mezcladas con sus compras reales e inflaban el historial con movimientos que
  // no compró nadie.
  //
  // La necesidad técnica no se perdió: se puede pedir con `?incluirInternas=1`,
  // que es explícito y se prende, en vez de ser la mezcla por defecto.
  "app/api/clientes/[id]/ventas/route.js",
];
const CAJA = [
  "app/api/pos-ventas/turnos/cerrar/route.js",
  "app/api/pos-ventas/turnos/resumen/route.js",
  "app/api/pos-ventas/turnos/ventas/route.js",
];
// Clasificación C + D: NO deben filtrar.
const TECNICOS = [
  "app/api/auditoria-pos-ventas/balances/route.js",
  "app/api/auditoria-pos-ventas/cajas/route.js",
  "app/api/auditoria-pos-ventas/medios/route.js",
  "app/api/auditoria-pos-ventas/operadores/route.js",
  "app/api/auditoria-pos-ventas/resumen/route.js",
  "app/api/auditoria-pos-ventas/turnos/route.js",
  "app/api/auditoria-pos-ventas/turnos/personas/route.js",
  "app/api/auditoria-pos-ventas/turnos/sin-turno/route.js",
  "app/api/admin/reset-operativo/route.js",
];

// Ventas de ejemplo. Desde el 2026-08-20 hay DOS marcas, no una: la relación
// `transferencia` y la fecha `anuladaEn`. Los fixtures traen las dos porque el
// select que las alimenta trae las dos — una venta sin `anuladaEn` en el select
// no es "una venta viva", es una venta que no se puede clasificar, y eso lo
// prueba el candado 4b.
const normal = (extra = {}) => ({ id: 1, total: 100, transferencia: null, anuladaEn: null, ...extra });
const interna = (extra = {}) => ({ id: 2, total: 100, transferencia: { id: 9 }, anuladaEn: null, ...extra });
const anulada = (extra = {}) => normal({ anuladaEn: new Date("2026-08-20T10:00:00Z"), ...extra });

// ── Clasificación ────────────────────────────────────────────────────────────

test("1. venta sin Transferencia → comercial", () => {
  assert.equal(evaluarVentaComercial(normal()).esComercial, true);
});

test("2. venta con Transferencia vinculada → interna", () => {
  assert.equal(evaluarVentaComercial(interna()).esComercial, false);
});

test("3. la condición Prisma apunta a la relación, no a campos heurísticos", () => {
  // La condición de la transferencia sigue siendo relacional y sigue sin mirar
  // cliente, forma de pago ni nada heurístico. Lo que se agregó al lado es la
  // anulación, que es una columna propia de la venta.
  assert.deepEqual(soloComercial(), { transferencia: { is: null }, anuladaEn: null });
  assert.deepEqual(soloInterna(), { transferencia: { isNot: null }, anuladaEn: null });
});

test("3c. una venta ANULADA no es comercial aunque no tenga remito", () => {
  assert.equal(evaluarVentaComercial(anulada()).esComercial, false);
  assert.equal(evaluarVentaComercial(anulada()).resoluble, true);
});

test("3b. una Transferencia sin ventaId no marca ninguna venta", () => {
  // Manual/automática: ventaId null → del lado de Venta, `transferencia` es null.
  assert.equal(evaluarVentaComercial(normal()).esComercial, true);
});

test("4. venta histórica interna se excluye sin backfill (la relación ya existe)", () => {
  // 1324..1327 tienen Transferencia 3..6. No hace falta ningún campo nuevo.
  for (const id of [1324, 1325, 1326, 1327]) {
    assert.equal(evaluarVentaComercial(interna({ id })).esComercial, false);
  }
});

test("4b. si no se pidió la relación, NO se asume comercial", () => {
  const sinRelacion = { id: 1, total: 100 };
  const r = evaluarVentaComercial(sinRelacion);
  assert.equal(r.resoluble, false);
  assert.equal(r.esComercial, false, "asumir comercial marcaría una interna como venta");
});

// ── Composición del where ────────────────────────────────────────────────────

test("5. whereVentaComercial no muta el where base y agrega la condición", () => {
  const base = { turnoId: 156 };
  const out = whereVentaComercial(base);
  assert.deepEqual(out, { turnoId: 156, transferencia: { is: null }, anuladaEn: null });
  assert.deepEqual(base, { turnoId: 156 }, "el objeto original no se toca");
});

test("5b. respeta un `transferencia` explícito del llamador SIN perder la anulación", () => {
  // El contrato cambió acá y es la parte delicada. Antes esta llamada devolvía
  // el where del llamador tal cual; ahora sigue respetando su `transferencia`
  // pero le agrega igual el filtro de anuladas. Pisar una condición no puede
  // llevarse la otra de arrastre: quien pide "solo internas" no está pidiendo
  // "internas incluidas las anuladas".
  const out = whereVentaComercial({ transferencia: { isNot: null } });
  assert.deepEqual(out, { transferencia: { isNot: null }, anuladaEn: null });
});

test("5c. tolera where vacío o inválido", () => {
  assert.deepEqual(whereVentaComercial(), { transferencia: { is: null }, anuladaEn: null });
  assert.deepEqual(whereVentaComercial(null), { transferencia: { is: null }, anuladaEn: null });
});

test("5d. relacionVentaComercial sirve para modelos que llegan por relación", () => {
  assert.deepEqual(relacionVentaComercial("venta", { localId: 1 }), {
    venta: { localId: 1, transferencia: { is: null }, anuladaEn: null },
  });
});

test("5e. `incluirAnuladas` es explícito y NO es el default", () => {
  // La excepción del listado: mostrar no es sumar. Que haya que escribirla es
  // parte del diseño — el default esconde las anuladas, que es lo correcto en 16
  // de los 17 lugares que pasan por acá.
  assert.deepEqual(whereVentaComercial({ localId: 1 }, { incluirAnuladas: true }), {
    localId: 1,
    transferencia: { is: null },
  });
  assert.deepEqual(whereVentaComercial({ localId: 1 }, {}), {
    localId: 1,
    transferencia: { is: null },
    anuladaEn: null,
  });
  assert.deepEqual(whereVentaComercial({ localId: 1 }), {
    localId: 1,
    transferencia: { is: null },
    anuladaEn: null,
  });
});

// ── Reportes: filtros preservados ────────────────────────────────────────────

test("14-16. fecha, local y paginación siguen en el where junto al filtro", () => {
  const out = whereVentaComercial({
    localId: 1,
    fecha: { gte: "A", lte: "B" },
    clienteId: 5,
  });
  assert.equal(out.localId, 1);
  assert.deepEqual(out.fecha, { gte: "A", lte: "B" });
  assert.equal(out.clienteId, 5);
  assert.deepEqual(out.transferencia, { is: null });
});

test("16b. la paginación no vive en el where, y count y findMany usan el MISMO", () => {
  // ── ESTE CANDADO ESTABA ATADO A LA FORMA DEL TEXTO ────────────────────────
  //
  // Buscaba la cadena literal `prisma.venta.count({ where: whereVentaComercial(where) })`
  // y se puso rojo el 2026-08-20 sobre un cambio correcto: el listado pasó a
  // construir el where UNA vez en una variable y usarlo en las dos consultas,
  // que es exactamente lo que este candado quiere garantizar.
  //
  // Lo que importa no es cómo se escribe, es que las dos consultas usen el mismo
  // where —si difieren, la paginación cuenta una cosa y muestra otra— y que ese
  // where salga del helper. Eso es lo que se afirma ahora, y admite tanto la
  // llamada inline como la variable.
  const src = leerSinComentarios("app/api/reportes-ventas/listado/route.js");
  assert.ok(/skip/.test(src) && /take/.test(src));

  const whereDe = (metodo) => {
    const m = src.match(new RegExp(`prisma\\.venta\\.${metodo}\\(\\{\\s*where:\\s*([A-Za-z0-9_]+(?:\\([^)]*\\))?)`));
    return m ? m[1] : null;
  };
  const wCount = whereDe("count");
  const wFind = whereDe("findMany");
  assert.ok(wCount && wFind, "no se encontraron las dos consultas del listado");
  assert.equal(wCount, wFind, "count y findMany usan wheres distintos: la paginación miente");

  // Y ese where sale del helper, no de un objeto armado a mano.
  const saleDelHelper =
    wCount.startsWith("whereVentaComercial") ||
    new RegExp(`(const|let)\\s+${wCount}\\s*=\\s*whereVentaComercial\\(`).test(src);
  assert.ok(saleDelHelper, `el where "${wCount}" del listado no sale de whereVentaComercial`);
});

// ── Cobertura de endpoints ───────────────────────────────────────────────────

test("5-13. todos los endpoints comerciales aplican el filtro", () => {
  for (const ruta of COMERCIALES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      src.includes("filtroVentaComercial"),
      `${ruta} no importa el helper`
    );
    // Se cuentan las llamadas al helper MÁS las variables construidas con él.
    // Contar solo las llamadas ataba el candado a que nadie extrajera el where a
    // una constante —una mejora legítima, y la que se hizo en el listado el
    // 2026-08-20 para que count y findMany no lo construyeran dos veces—. Lo que
    // se quiere garantizar es que ninguna consulta comercial quede sin filtro,
    // no cómo se escribe el filtro.
    const consultas = (src.match(/prisma\.venta\.(findMany|aggregate|groupBy|count)/g) || []).length;
    const llamadas = (src.match(/whereVentaComercial\(/g) || []).length;
    const variables = [...src.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*whereVentaComercial\(/g)];
    const usosDeVariables = variables.reduce((acc, m) => {
      const nombre = m[1];
      const apariciones = (src.match(new RegExp(`where:\\s*${nombre}\\b`, "g")) || []).length;
      return acc + apariciones;
    }, 0);
    const usos = llamadas + usosDeVariables;
    assert.ok(usos >= consultas, `${ruta}: ${consultas} consultas y solo ${usos} filtros`);
  }
});

test("17-25. los tres endpoints de turno aplican el MISMO filtro", () => {
  for (const ruta of CAJA) {
    const src = leerSinComentarios(ruta);
    assert.ok(src.includes("whereVentaComercial({ turnoId })"), `${ruta} debe filtrar por turno`);
    assert.ok(
      !/prisma\.venta\.findMany\(\{\s*where: \{ turnoId \}/.test(src),
      `${ruta} conserva la consulta sin filtrar`
    );
  }
});

test("24. resumen y cierre usan literalmente la misma expresión", () => {
  const cerrar = leerSinComentarios("app/api/pos-ventas/turnos/cerrar/route.js");
  const resumen = leerSinComentarios("app/api/pos-ventas/turnos/resumen/route.js");
  const expr = "whereVentaComercial({ turnoId })";
  assert.ok(cerrar.includes(expr) && resumen.includes(expr),
    "si divergen, el operador ve un esperado y el cierre calcula otro");
});

test("8-9. las agregaciones de ítems por relación también filtran", () => {
  for (const ruta of ["app/api/dashboard/resumen/route.js", "app/api/pos-ventas/stats-dia/route.js"]) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      /venta: whereVentaComercial\(/.test(src),
      `${ruta}: ventaDetalle.aggregate contaría los ítems de las internas`
    );
  }
});

test("26. la auditoría técnica y el soporte NO filtran", () => {
  for (const ruta of TECNICOS) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !src.includes("whereVentaComercial"),
      `${ruta} es técnico: las internas tienen que seguir viéndose`
    );
  }
});

test("26b. los 23 archivos que consultan Venta están clasificados", () => {
  assert.equal(COMERCIALES.length + CAJA.length + TECNICOS.length, 23);
  for (const ruta of [...COMERCIALES, ...CAJA, ...TECNICOS]) {
    assert.ok(fs.existsSync(path.join(RAIZ, ruta)), `${ruta} no existe`);
  }
});

// ── Regresión: lo que NO debe cambiar ────────────────────────────────────────

test("27-28. el POS sigue creando Venta + VentaPago + Transferencia", () => {
  const src = leerSinComentarios("app/api/pos-ventas/crear/route.js");
  assert.ok(src.includes("tx.venta.create"), "la venta se sigue creando");
  assert.ok(src.includes("tx.ventaPago.createMany"), "el pago se sigue creando");
  assert.ok(src.includes("crearTransferencia"), "la transferencia se sigue creando");
  assert.ok(!src.includes("whereVentaComercial"), "crear no clasifica, solo crea");
});

test("29-31. recepción, stock y transferencias no se tocan", () => {
  for (const ruta of [
    "app/api/transferencias/confirmar-recepcion/route.js",
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/detalle/route.js",
  ]) {
    const src = leerSinComentarios(ruta);
    assert.ok(!src.includes("whereVentaComercial"), `${ruta} no debe filtrar ventas`);
  }
});

test("33. la idempotencia no cambia", () => {
  const src = leerSinComentarios("app/api/pos-ventas/crear/route.js");
  assert.ok(src.includes("clientTxnId"), "sigue el barrera por clientTxnId");
});

test("34-35. el filtro no escribe nada: es solo lectura", () => {
  const src = leerSinComentarios("lib/ventas/filtroVentaComercial.js");
  for (const prohibido of ["prisma", "create", "update", "delete", "upsert", "$transaction"]) {
    assert.ok(!src.includes(prohibido), `el helper no debe mencionar ${prohibido}`);
  }
});

test("SELECT_MARCA_INTERNA trae lo mínimo para clasificar en memoria", () => {
  // Desde el 2026-08-20 son DOS marcas, así que el select mínimo tiene que traer
  // las dos: sin `anuladaEn`, `evaluarVentaComercial` no puede resolver y una
  // anulada se evaluaría como venta viva.
  assert.deepEqual(SELECT_MARCA_INTERNA, {
    transferencia: { select: { id: true } },
    anuladaEn: true,
  });
});

// ── Aritmética del turno 156 (datos reales) ──────────────────────────────────

test("17-23. turno 156: la interna no suma a ningún medio ni al conteo", () => {
  // Réplica de la agregación por tender de turnos/cerrar, sobre datos reales.
  // `anuladaEn: null` en todas: son datos reales de un turno donde no había
  // anulaciones —la anulación no existía—. El fixture lo dice explícitamente
  // porque el evaluador ahora exige la columna, y una venta sin ella no se
  // clasifica.
  const ventasTurno = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: i, transferencia: null, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: 259549.647 }] })),
    { id: 100, transferencia: null, anuladaEn: null, pagos: [{ medio: "CREDITO", monto: 146608.34 }] },
    { id: 1324, transferencia: { id: 3 }, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: 9600 }] },
    { id: 1325, transferencia: { id: 4 }, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: 28800 }] },
    { id: 1326, transferencia: { id: 5 }, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: 9600 }] },
    { id: 1327, transferencia: { id: 6 }, anuladaEn: null, pagos: [{ medio: "EFECTIVO", monto: 32000 }] },
  ];
  const comerciales = ventasTurno.filter((v) => evaluarVentaComercial(v).esComercial);

  assert.equal(ventasTurno.length, 12);
  assert.equal(comerciales.length, 8, "22. la cantidad de tickets excluye las internas");

  const porMedio = {};
  for (const v of comerciales) for (const p of v.pagos) porMedio[p.medio] = (porMedio[p.medio] || 0) + p.monto;

  const fantasma = ventasTurno
    .filter((v) => !evaluarVentaComercial(v).esComercial)
    .flatMap((v) => v.pagos)
    .reduce((a, p) => a + p.monto, 0);

  assert.equal(fantasma, 80000, "los 4 pagos internos suman el efectivo fantasma");
  assert.equal(Math.round(porMedio.EFECTIVO * 100) / 100, 1816847.53, "efectivo comercial real");
  assert.equal(porMedio.CREDITO, 146608.34, "el crédito comercial no se toca");
});

test("18-20. la regla es general: cualquier medio futuro también se excluye", () => {
  for (const medio of ["MERCADOPAGO", "DEBITO", "CREDITO", "TRANSFERENCIA", "QR"]) {
    const v = interna({ pagos: [{ medio, monto: 1000 }] });
    assert.equal(evaluarVentaComercial(v).esComercial, false, `${medio} debe excluirse igual`);
  }
});

test("21. una interna fiada tampoco cuenta como venta comercial", () => {
  assert.equal(evaluarVentaComercial(interna({ esFiado: true })).esComercial, false);
});
