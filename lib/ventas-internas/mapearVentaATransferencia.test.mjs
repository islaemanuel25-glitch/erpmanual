// lib/ventas-internas/mapearVentaATransferencia.test.mjs
//
// Buena parte de los casos NO usa fixtures escritas a mano: arma las líneas con el
// productor REAL (planConsumoVenta, el mismo helper que corre dentro de la venta) y
// le pasa su salida al mapper. Así el test falla si la forma de
// consumoFisicoConsolidado cambia, en vez de validar contra una copia congelada.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import {
  mapearVentaATransferencia,
  CODIGOS,
  UNIDAD_ENVIADA,
  FACTOR_PACK,
} from "./mapearVentaATransferencia.js";

const raiz = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** `git grep -l` sale con 1 cuando NO hay coincidencias: eso es "vacío", no un fallo. */
const gitGrepArchivos = (patron, ruta) => {
  try {
    return execFileSync("git", ["grep", "-l", patron, "--", ruta], {
      cwd: raiz,
      encoding: "utf8",
    }).trim();
  } catch (e) {
    if (e.status === 1) return "";
    throw e;
  }
};

// ── helpers de fixtures ───────────────────────────────────────────────────────

const normal = ({ productoLocalId, productoBaseId, cantidad, nombre = "P", baseStock, modoVentaLinea }) => ({
  tipo: "NORMAL",
  productoLocalId,
  productoBaseId,
  nombre,
  cantidad,
  precio: 100,
  costoUnitario: 60,
  baseStock,
  modoVentaLinea,
});

const combo = ({ comboProductoLocalId, productoBaseId, cantidad, componentes }) => ({
  tipo: "COMBO",
  comboProductoLocalId,
  productoBaseId,
  nombre: "Combo",
  cantidad,
  precio: 500,
  costoUnitario: 300,
  componentes,
});

const servicio = ({ productoLocalId, productoBaseId }) => ({
  tipo: "SERVICIO",
  productoLocalId,
  productoBaseId,
  nombre: "Carga SUBE",
  cantidad: 1,
  precio: 1030,
  costoUnitario: 1000,
  servicio: { importeBaseServicio: 1000, recargoServicioPct: 3, recargoServicioImporte: 30 },
});

/** Corre el productor real y mapea, como haría la integración futura. */
const mapearDesdePlan = (lineas, { esDeposito = true, snapshots = null } = {}) => {
  const plan = planConsumoVenta({ lineas, esDeposito });
  return mapearVentaATransferencia({
    consumoFisicoConsolidado: plan.consumoFisicoConsolidado,
    lineasComerciales: plan.lineasComerciales,
    snapshots,
  });
};

const lanza = (fn, code) => {
  assert.throws(fn, (e) => {
    assert.equal(e.code, code, `código esperado ${code}, recibido ${e.code}`);
    assert.equal(e.esErrorMapeoVentaInterna, true);
    return true;
  });
};

// ══ 1. PRODUCTOS FÍSICOS ══════════════════════════════════════════════════════

test("1. una unidad normal produce un ítem con cantidad 1", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 1 }),
  ]);
  assert.equal(r.debeCrearTransferencia, true);
  assert.equal(r.codigo, null);
  assert.deepEqual(r.items, [
    { baseId: 100, productoLocalOrigenId: 10, cantidad: 1, unidadEnviada: "UNIDAD", factorPack: 1 },
  ]);
});

test("2. varias unidades conservan la cantidad", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 7 }),
  ]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].cantidad, 7);
});

test("3. pack 3×12: el POS ya convirtió a 36 y el mapper NO vuelve a multiplicar", () => {
  const lineas = [
    normal({
      productoLocalId: 10,
      productoBaseId: 100,
      cantidad: 3,
      baseStock: { factorPack: 12, modo_envio: "MIXTO", unidad_medida: "un" },
      modoVentaLinea: "NORMAL",
    }),
  ];
  // El productor real ya entrega 36 unidades físicas.
  const plan = planConsumoVenta({ lineas, esDeposito: true });
  assert.equal(plan.consumoFisicoConsolidado[0].cantidad, 36);

  const r = mapearDesdePlan(lineas);
  assert.equal(r.items[0].cantidad, 36, "no debe ser 3 ni 432");
  assert.equal(r.items[0].factorPack, 1);
  assert.equal(r.items[0].unidadEnviada, "UNIDAD");

  // Contraprueba del contrato con crearTransferencia: toUnidades() es la identidad.
  assert.equal(r.items[0].cantidad * r.items[0].factorPack, 36);
});

test("4. dos líneas del mismo producto se consolidan en un solo ítem", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 2 }),
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 5 }),
  ]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].cantidad, 7);
});

test("5. el orden es estable y ascendente por productoLocalOrigenId", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 90, productoBaseId: 900, cantidad: 1 }),
    normal({ productoLocalId: 3, productoBaseId: 300, cantidad: 1 }),
    normal({ productoLocalId: 41, productoBaseId: 410, cantidad: 1 }),
  ]);
  assert.deepEqual(r.items.map((i) => i.productoLocalOrigenId), [3, 41, 90]);

  // Determinismo: otro orden de entrada, misma salida.
  const r2 = mapearDesdePlan([
    normal({ productoLocalId: 41, productoBaseId: 410, cantidad: 1 }),
    normal({ productoLocalId: 90, productoBaseId: 900, cantidad: 1 }),
    normal({ productoLocalId: 3, productoBaseId: 300, cantidad: 1 }),
  ]);
  assert.deepEqual(r2.items, r.items);
});

// ══ 2. SERVICIOS ══════════════════════════════════════════════════════════════

test("6. venta de solo servicios: sin transferencia y sin error", () => {
  const r = mapearDesdePlan([servicio({ productoLocalId: 50, productoBaseId: 500 })]);
  assert.equal(r.debeCrearTransferencia, false);
  assert.deepEqual(r.items, []);
  assert.equal(r.codigo, "VENTA_SIN_MERCADERIA_TRANSFERIBLE");
  assert.equal(r.codigo, CODIGOS.SIN_MERCADERIA);
  assert.equal(r.omitidos.servicios, 1);
});

test("7. venta mixta: 2 físicos + 1 servicio → 2 ítems", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 1 }),
    normal({ productoLocalId: 11, productoBaseId: 110, cantidad: 2 }),
    servicio({ productoLocalId: 50, productoBaseId: 500 }),
  ]);
  assert.equal(r.debeCrearTransferencia, true);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map((i) => i.productoLocalOrigenId), [10, 11]);
  assert.equal(r.omitidos.servicios, 1);
  // El servicio no aparece bajo ninguna forma.
  assert.equal(r.items.some((i) => i.productoLocalOrigenId === 50 || i.baseId === 500), false);
});

test("8. el servicio de importe variable no entra ni con recargo", () => {
  const plan = planConsumoVenta({
    lineas: [servicio({ productoLocalId: 50, productoBaseId: 500 })],
    esDeposito: true,
  });
  // El productor real ya lo excluye del consumo físico.
  assert.equal(plan.consumoFisicoConsolidado.length, 0);
  assert.equal(plan.lineasComerciales[0].consumoFisico, null);

  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: plan.consumoFisicoConsolidado,
    lineasComerciales: plan.lineasComerciales,
  });
  assert.equal(r.debeCrearTransferencia, false);
});

test("9. una línea con cantidadStock null no entra como producto físico", () => {
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [],
    lineasComerciales: [
      { tipo: "NORMAL", productoLocalId: 10, consumoFisico: { productoLocalId: 10, cantidadStock: null } },
      { tipo: "NORMAL", productoLocalId: 11, consumoFisico: null },
    ],
  });
  assert.equal(r.debeCrearTransferencia, false);
  assert.equal(r.omitidos.lineasSinConsumoFisico, 2);
  assert.deepEqual(r.items, []);
});

// ══ 3. COMBOS ═════════════════════════════════════════════════════════════════

const COMPONENTES = [
  { productoLocalId: 20, productoBaseId: 200, cantidadPorCombo: 2, costoUnitario: 500, nombre: "Coca" },
  { productoLocalId: 21, productoBaseId: 210, cantidadPorCombo: 1, costoUnitario: 3000, nombre: "Fernet" },
];

test("10. el combo se expande a sus componentes físicos", () => {
  const r = mapearDesdePlan([
    combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 1, componentes: COMPONENTES }),
  ]);
  assert.equal(r.items.length, 2);
  assert.deepEqual(
    r.items.map((i) => [i.productoLocalOrigenId, i.baseId, i.cantidad]),
    [[20, 200, 2], [21, 210, 1]]
  );
  assert.equal(r.omitidos.combos, 1);
});

test("11. combo + producto suelto del mismo producto se consolidan", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 20, productoBaseId: 200, cantidad: 1, nombre: "Coca suelta" }),
    combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 1, componentes: COMPONENTES }),
  ]);
  const coca = r.items.find((i) => i.productoLocalOrigenId === 20);
  assert.equal(coca.cantidad, 3, "1 suelta + 2 del combo");
  assert.equal(r.items.filter((i) => i.productoLocalOrigenId === 20).length, 1);
  assert.equal(r.items.length, 2);
});

test("12. dos combos que comparten componente se consolidan", () => {
  const otroCombo = [
    { productoLocalId: 20, productoBaseId: 200, cantidadPorCombo: 3, costoUnitario: 500, nombre: "Coca" },
  ];
  const r = mapearDesdePlan([
    combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 2, componentes: COMPONENTES }),
    combo({ comboProductoLocalId: 98, productoBaseId: 980, cantidad: 1, componentes: otroCombo }),
  ]);
  const coca = r.items.find((i) => i.productoLocalOrigenId === 20);
  assert.equal(coca.cantidad, 7, "2 combos × 2 + 1 combo × 3");
  assert.equal(r.omitidos.combos, 2);
});

test("13. el ProductoLocal del combo nunca aparece en items", () => {
  const r = mapearDesdePlan([
    combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 4, componentes: COMPONENTES }),
  ]);
  assert.equal(r.items.some((i) => i.productoLocalOrigenId === 99), false);
  assert.equal(r.items.some((i) => i.baseId === 990), false);
});

// ══ 4. FIAMBRES ═══════════════════════════════════════════════════════════════

test("14. fiambre fijo por piezas: 4 piezas viajan como 4", () => {
  const lineas = [
    normal({
      productoLocalId: 30,
      productoBaseId: 300,
      cantidad: 4,
      nombre: "Jamón pieza",
      baseStock: { factorPack: 1, modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5, unidad_medida: "kg" },
    }),
  ];
  const plan = planConsumoVenta({ lineas, esDeposito: true });
  assert.equal(plan.consumoFisicoConsolidado[0].cantidad, 4, "el depósito cuenta piezas");

  const r = mapearDesdePlan(lineas);
  assert.equal(r.items[0].cantidad, 4);
  assert.equal(r.items[0].unidadEnviada, "UNIDAD");
  // NO se multiplicó por el peso de referencia (4 × 3.5 = 14 kg).
  assert.notEqual(r.items[0].cantidad, 14);
});

test("15. fiambre por peso: 1.925 se conserva exacto (no 1.93)", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 31, productoBaseId: 310, cantidad: 1.925, nombre: "Queso" }),
  ]);
  assert.equal(r.items[0].cantidad, 1.925);
  assert.equal(String(r.items[0].cantidad), "1.925");
  assert.notEqual(r.items[0].cantidad, 1.93);
});

test("16. el mapper no convierte piezas a kg (no importa piezasToKg)", () => {
  const src = readFileSync(new URL("./mapearVentaATransferencia.js", import.meta.url), "utf8");
  // Se descartan los comentarios: los míos nombran piezasToKg para explicar
  // justamente que NO se llama.
  const codigo = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/piezasToKg/.test(codigo), false);
  assert.equal(/pesoReferenciaKg/.test(codigo), false);
});

// ══ 5. VALIDACIONES ═══════════════════════════════════════════════════════════

test("17. ProductoLocal ausente → ITEM_SIN_PRODUCTO_LOCAL", () => {
  for (const pl of [null, undefined, 0, -1, "abc", 1.5]) {
    lanza(
      () => mapearVentaATransferencia({
        consumoFisicoConsolidado: [{ productoLocalId: pl, productoBaseId: 100, cantidad: 1 }],
      }),
      CODIGOS.SIN_PRODUCTO_LOCAL
    );
  }
});

test("18. ProductoBase ausente → ITEM_SIN_PRODUCTO_BASE", () => {
  for (const pb of [null, undefined, 0, -3, "x"]) {
    lanza(
      () => mapearVentaATransferencia({
        consumoFisicoConsolidado: [{ productoLocalId: 10, productoBaseId: pb, cantidad: 1 }],
      }),
      CODIGOS.SIN_PRODUCTO_BASE
    );
  }
});

test("19. cantidad cero → CANTIDAD_FISICA_INVALIDA (no se acepta en silencio)", () => {
  lanza(
    () => mapearVentaATransferencia({
      consumoFisicoConsolidado: [{ productoLocalId: 10, productoBaseId: 100, cantidad: 0 }],
    }),
    CODIGOS.CANTIDAD_INVALIDA
  );
});

test("20. cantidad negativa → CANTIDAD_FISICA_INVALIDA", () => {
  for (const c of [-1, -0.001, "-5"]) {
    lanza(
      () => mapearVentaATransferencia({
        consumoFisicoConsolidado: [{ productoLocalId: 10, productoBaseId: 100, cantidad: c }],
      }),
      CODIGOS.CANTIDAD_INVALIDA
    );
  }
});

test("21. cantidades inválidas: NaN, Infinity, null, booleanos, objetos, strings", () => {
  const malos = [NaN, Infinity, -Infinity, null, undefined, true, false, {}, [], [1], "", "abc", "1,5", "1e3", " "];
  for (const c of malos) {
    lanza(
      () => mapearVentaATransferencia({
        consumoFisicoConsolidado: [{ productoLocalId: 10, productoBaseId: 100, cantidad: c }],
      }),
      CODIGOS.CANTIDAD_INVALIDA
    );
  }
  // Un 4º decimal no cabe en Decimal(12,3): se rechaza en vez de redondear.
  lanza(
    () => mapearVentaATransferencia({
      consumoFisicoConsolidado: [{ productoLocalId: 10, productoBaseId: 100, cantidad: 1.9255 }],
    }),
    CODIGOS.CANTIDAD_INVALIDA
  );
});

test("22. mismo ProductoLocal con distinto ProductoBase → SNAPSHOT_INCONSISTENTE", () => {
  lanza(
    () => mapearVentaATransferencia({
      consumoFisicoConsolidado: [
        { productoLocalId: 10, productoBaseId: 100, cantidad: 1 },
        { productoLocalId: 10, productoBaseId: 999, cantidad: 2 },
      ],
    }),
    CODIGOS.SNAPSHOT_INCONSISTENTE
  );
});

test("23. no muta sus argumentos", () => {
  const plan = planConsumoVenta({
    lineas: [
      normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 2 }),
      combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 1, componentes: COMPONENTES }),
      servicio({ productoLocalId: 50, productoBaseId: 500 }),
    ],
    esDeposito: true,
  });
  const entrada = {
    consumoFisicoConsolidado: plan.consumoFisicoConsolidado,
    lineasComerciales: plan.lineasComerciales,
    snapshots: { 10: { id: 10, nombre: "P", precio_costo: 5 } },
  };
  const antes = JSON.stringify(entrada);
  mapearVentaATransferencia(entrada);
  assert.equal(JSON.stringify(entrada), antes);
});

test("24. resultado exacto y códigos estables", () => {
  // Los códigos son parte del contrato: se comparan como literales.
  assert.deepEqual(CODIGOS, {
    SIN_MERCADERIA: "VENTA_SIN_MERCADERIA_TRANSFERIBLE",
    ENTRADA_INVALIDA: "ENTRADA_INVALIDA",
    SIN_PRODUCTO_LOCAL: "ITEM_SIN_PRODUCTO_LOCAL",
    SIN_PRODUCTO_BASE: "ITEM_SIN_PRODUCTO_BASE",
    CANTIDAD_INVALIDA: "CANTIDAD_FISICA_INVALIDA",
    SNAPSHOT_INCONSISTENTE: "SNAPSHOT_INCONSISTENTE",
  });

  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 2 }),
    servicio({ productoLocalId: 50, productoBaseId: 500 }),
  ]);
  assert.deepEqual(r, {
    debeCrearTransferencia: true,
    codigo: null,
    items: [
      { baseId: 100, productoLocalOrigenId: 10, cantidad: 2, unidadEnviada: "UNIDAD", factorPack: 1 },
    ],
    omitidos: { servicios: 1, combos: 0, lineasSinConsumoFisico: 0 },
    snapshotsFaltantes: [10],
  });
});

test("24b. entradas estructuralmente inválidas → ENTRADA_INVALIDA", () => {
  lanza(() => mapearVentaATransferencia({}), CODIGOS.ENTRADA_INVALIDA);
  lanza(() => mapearVentaATransferencia({ consumoFisicoConsolidado: null }), CODIGOS.ENTRADA_INVALIDA);
  lanza(
    () => mapearVentaATransferencia({ consumoFisicoConsolidado: [], lineasComerciales: "x" }),
    CODIGOS.ENTRADA_INVALIDA
  );
  lanza(
    () => mapearVentaATransferencia({ consumoFisicoConsolidado: [null] }),
    CODIGOS.ENTRADA_INVALIDA
  );
  lanza(
    () => mapearVentaATransferencia({ consumoFisicoConsolidado: ["x"] }),
    CODIGOS.ENTRADA_INVALIDA
  );
});

// ══ 6. CONTRATO CON crearTransferencia ════════════════════════════════════════

test("25 y 26. todos los ítems usan unidadEnviada UNIDAD y factorPack 1", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 3, baseStock: { factorPack: 12, modo_envio: "MIXTO" }, modoVentaLinea: "NORMAL" }),
    normal({ productoLocalId: 31, productoBaseId: 310, cantidad: 1.925 }),
    combo({ comboProductoLocalId: 99, productoBaseId: 990, cantidad: 2, componentes: COMPONENTES }),
  ]);
  assert.ok(r.items.length >= 4);
  for (const i of r.items) {
    assert.equal(i.unidadEnviada, UNIDAD_ENVIADA);
    assert.equal(i.unidadEnviada, "UNIDAD");
    assert.equal(i.factorPack, FACTOR_PACK);
    assert.equal(i.factorPack, 1);
  }
});

test("27. los ítems tienen exactamente los campos que consume crearTransferencia", () => {
  const src = readFileSync(new URL("../transferencias/crearTransferencia.js", import.meta.url), "utf8");
  // Campos que el servicio lee de cada item.
  for (const campo of ["baseId", "productoLocalOrigenId", "cantidad", "unidadEnviada", "factorPack", "productoLocalOrigen"]) {
    assert.ok(new RegExp(`item\\.${campo}\\b`).test(src), `crearTransferencia debe leer item.${campo}`);
  }

  const snap = { id: 10, nombre: "Coca 500", descripcion: "d", precio_costo: 800, precio_venta: 1200, base: { nombre: "Coca" } };
  const r = mapearDesdePlan(
    [normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 1 })],
    { snapshots: new Map([[10, snap]]) }
  );
  assert.deepEqual(Object.keys(r.items[0]).sort(), [
    "baseId", "cantidad", "factorPack", "productoLocalOrigen", "productoLocalOrigenId", "unidadEnviada",
  ]);
  // El snapshot se pasa por referencia, sin copiar ni recortar: es de donde
  // crearTransferencia saca precio_costo para el detalle congelado.
  assert.equal(r.items[0].productoLocalOrigen, snap);
  assert.deepEqual(r.snapshotsFaltantes, []);

  // Sin snapshot no se inventa el campo: se informa el faltante.
  const sin = mapearDesdePlan([normal({ productoLocalId: 10, productoBaseId: 100, cantidad: 1 })]);
  assert.equal("productoLocalOrigen" in sin.items[0], false);
  assert.deepEqual(sin.snapshotsFaltantes, [10]);

  // Y NO se agrega precioCosto suelto: crearTransferencia no lo lee del item.
  assert.equal(/item\.precioCosto/.test(src), false);
});

test("28. el mapper es puro: sin imports de Prisma ni Next", () => {
  const src = readFileSync(new URL("./mapearVentaATransferencia.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], "el mapper no debe importar nada");
  const codigo = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const prohibido of ["@prisma", "prisma", "next/", "NextResponse", "$transaction", "await "]) {
    assert.equal(codigo.includes(prohibido), false, `no debe aparecer "${prohibido}"`);
  }
});

// Etapa 4: el flujo se ACTIVÓ. Los guards de "todavía no conectado" se convierten
// en su invariante inverso: conectado, pero en UN solo punto y de UNA sola forma.

test("29. el mapper se usa exactamente en pos-ventas/crear", () => {
  const hits = gitGrepArchivos("mapearVentaATransferencia", "app/").split(/\r?\n/).filter(Boolean);
  assert.deepEqual(hits, ["app/api/pos-ventas/crear/route.js"]);
});

test("30. SOLO_TRANSITO se USA solo desde la venta interna", () => {
  const hits = gitGrepArchivos("SOLO_TRANSITO", "app/").split(/\r?\n/).filter(Boolean);
  // Se comparan sentencias, no menciones: cancelar/route.js lo nombra en un
  // comentario, explicando por qué una transferencia de venta no se puede cancelar.
  const sinComentarios = (ruta) =>
    readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  const usanDeVerdad = hits.filter((h) => sinComentarios(h).includes("SOLO_TRANSITO"));
  assert.deepEqual(usanDeVerdad, ["app/api/pos-ventas/crear/route.js"],
    "el flujo manual jamás debe usar esta política");
  // Y el envío manual ni siquiera la menciona.
  assert.equal(hits.includes("app/api/pos-transferencias/enviar/route.js"), false);
});

test("31. quien crea transferencias manuales sigue sin escribir ventaId", () => {
  const manual = readFileSync(new URL("../../app/api/pos-transferencias/enviar/route.js", import.meta.url), "utf8");
  assert.equal(/ventaId/.test(manual), false, "el envío manual no debe mencionar ventaId");
  // El servicio SÍ lo acepta ahora, pero como parámetro opcional excluyente.
  const svc = readFileSync(new URL("../transferencias/crearTransferencia.js", import.meta.url), "utf8");
  assert.match(svc, /ventaId = null/);
  assert.match(svc, /ORIGEN_DOCUMENTAL_AMBIGUO/);
});

// ══ 7. PRECISIÓN ══════════════════════════════════════════════════════════════

test("32. 1.925 sobrevive la consolidación sin drift de punto flotante", () => {
  const r = mapearDesdePlan([
    normal({ productoLocalId: 31, productoBaseId: 310, cantidad: 1.925 }),
  ]);
  assert.equal(r.items[0].cantidad, 1.925);

  // Suma que en float ingenuo daría 0.30000000000000004.
  const r2 = mapearVentaATransferencia({
    consumoFisicoConsolidado: [
      { productoLocalId: 5, productoBaseId: 50, cantidad: 0.1 },
      { productoLocalId: 5, productoBaseId: 50, cantidad: 0.2 },
    ],
  });
  assert.equal(r2.items[0].cantidad, 0.3);
  assert.equal(String(r2.items[0].cantidad), "0.3");

  // Strings y Decimal-like (lo que devolvería Prisma) se suman igual de exacto.
  const decimalLike = (s) => ({ toString: () => s });
  const r3 = mapearVentaATransferencia({
    consumoFisicoConsolidado: [
      { productoLocalId: 5, productoBaseId: 50, cantidad: "1.925" },
      { productoLocalId: 5, productoBaseId: 50, cantidad: decimalLike("0.075") },
    ],
  });
  assert.equal(r3.items[0].cantidad, 2);
});

test("33. schema: VentaDetalle.cantidadStock es Decimal(12,3)", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const ventaDetalle = schema.match(/model VentaDetalle \{[\s\S]*?\n\}/)[0];
  assert.match(ventaDetalle, /cantidadStock\s+Decimal\?\s+@db\.Decimal\(12,\s*3\)/);
});

test("34. BLOQUEO LEVANTADO: la cadena física persiste 1.925 sin pérdida", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const escala = (m, c) =>
    schema
      .match(new RegExp(`model ${m} \\{[\\s\\S]*?\\n\\}`))[0]
      .match(new RegExp(`\\n\\s+${c}\\s+Decimal\\??\\s[^\\n]*@db\\.Decimal\\((\\d+), ?(\\d+)\\)`))
      .slice(1, 3)
      .join(",");

  // La etapa 3B amplió la cadena física a 3 decimales. Lo que el mapper produce
  // ahora se puede persistir tal cual: destino, tránsito y stock usan la misma
  // escala que VentaDetalle.cantidadStock.
  assert.equal(escala("TransferenciaDetalle", "cantidad"), "12,3");
  assert.equal(escala("TransferenciaDetalle", "recibido"), "12,3");
  assert.equal(escala("StockLocal", "cantidad"), "12,3");
  assert.equal(escala("StockLocal", "enTransito"), "12,3");
  assert.equal(escala("VentaDetalle", "cantidadStock"), "12,3");

  // El mapper preserva 1.925 exacto y ya no hay ningún redondeo esperándolo.
  const r = mapearVentaATransferencia({
    consumoFisicoConsolidado: [{ productoLocalId: 31, productoBaseId: 310, cantidad: 1.925 }],
  });
  assert.equal(r.items[0].cantidad, 1.925);
  assert.equal(String(r.items[0].cantidad), "1.925");
  // Tres decimales caben en la escala destino: nada se pierde al persistir.
  assert.equal(r.items[0].cantidad.toFixed(3), "1.925");

  // Los montos NO se movieron: siguen en 2 decimales.
  assert.equal(escala("TransferenciaDetalle", "precioCosto"), "12,2");
});
