// PRUEBA DE BASE DEL VALOR DEL STOCK.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/valorDelStock.mjs
//
// Ejerce contra PostgreSQL las consultas de `lib/stock/libro/valorDelStockServer.js`
// —que ni el build ni los candados pueden ver— y las rutas que las usan, con los
// importes esperados ESCRITOS, calculados a mano en el guion de abajo:
//
//   A. el costo congelado a las 00:00: un cambio intradía no mueve el día, sí el
//      siguiente (revalorización);
//   B. el pack se valoriza en unidades físicas con el costo del bulto dividido
//      por el factor; la pieza del depósito con kilo × peso;
//   C. el costo faltante no vale cero: la cadena queda afuera y se nombra;
//   D. el stock negativo se valoriza negativo y se marca;
//   E. el tránsito va aparte y conserva el costo que congeló la transferencia;
//   F. día, semana (parcial: antes del primer día valorizable), mes, rango y
//      el día en curso con un cambio de costo HOY;
//   G. la identidad final − inicial = físico + revalorización, exacta;
//   H. las rutas: stock.ver lee el valor; sin stock.ver, 403; finanzas.ver solo
//      no alcanza.
//
// ── CÓMO SE CONSIGUEN DÍAS DISTINTOS ───────────────────────────────────────
//
// Como en `stockDiario.mjs`: las escrituras se hacen DE VERDAD —StockLocal,
// ProductoBase, `crearTransferencia`— y los dos libros las capturan con sus
// triggers. Después, en la base descartable, se REUBICAN en el tiempo: los
// movimientos con `libroEnElTiempo`, y las versiones de costo, la activación y
// la fecha de envío con la misma cuenta, acá.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const jwt = (await import("jsonwebtoken")).default;
const { MIGRACION_LIBRO, aplicarMigraciones, aplicarLibroEnAdelante, AR, uno, guion } = await import("./lib/libroEnElTiempo.mjs");
const { PUNTO_CERO_PRODUCCION } = await import("../../lib/stock/libro/stockDiario.js");
const { valorDelPeriodo, activacionDelLibroDeCostos, movimientosDeCategoria } = await import("../../lib/stock/libro/valorDelStockServer.js");
const { ESTADO_VALOR, MOTIVO_COSTO_FALTANTE } = await import("../../lib/stock/libro/valorDelStock.js");
const { declararOrigenDeStock, ORIGEN_STOCK } = await import("../../lib/stock/libro/libroStock.js");
const { movimientoDeCategoriaApi } = await import("../../lib/stock/libro/stockDiarioApi.js");
const { renglonDeMovimiento } = await import("../../lib/stock/libro/stockDiarioPantalla.js");
const { crearTransferencia } = await import("../../lib/transferencias/crearTransferencia.js");
const { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");

const PREFIJO = "erpazul_vs_prueba_";
const NOMBRE = `${PREFIJO}valor`;
const ACTIVACION_COSTOS_AR = "2026-09-29 00:17:54.566";
const HOY = "2026-10-03";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);
const json = (x) => JSON.stringify(x);
const pesos = (c) => (c === null || c === undefined ? null : c / 100);

const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();
let c = null;

async function sembrar() {
  const G = (await uno(c, `INSERT INTO "Grupo" ("nombre","updatedAt") VALUES ('Valor del stock', now()) RETURNING "id"`)).id;
  const local = async (n, deposito) => (await uno(c, `INSERT INTO "Local" ("nombre","es_deposito","updatedAt") VALUES ('${n}', ${deposito}, now()) RETURNING "id"`)).id;
  const L = { D: await local("VS Depósito", true), L: await local("VS Local", false) };
  await c.$executeRawUnsafe(`INSERT INTO "GrupoLocal" ("grupoId","localId","updatedAt") VALUES (${G}, ${L.L}, now())`);
  await c.$executeRawUnsafe(`INSERT INTO "GrupoDeposito" ("grupoId","localId","updatedAt") VALUES (${G}, ${L.D}, now())`);
  // Otro grupo, con una ubicación que ningún usuario del primero tiene que poder elegir.
  const G2 = (await uno(c, `INSERT INTO "Grupo" ("nombre","updatedAt") VALUES ('Valor del stock, otro grupo', now()) RETURNING "id"`)).id;
  L.X = await local("VS Ajeno", false);
  await c.$executeRawUnsafe(`INSERT INTO "GrupoLocal" ("grupoId","localId","updatedAt") VALUES (${G2}, ${L.X}, now())`);

  const base = async (nombre, { um = "unidad", factor = null, costo, compra = "BULTO", venta = "PESO", peso = null }) =>
    (
      await uno(
        c,
        `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","factor_pack","precio_costo","precio_venta",
                                     "modoCompraProveedor","modoVentaDeposito","pesoReferenciaKg","updatedAt")
         VALUES (${G}, '${nombre}', 'VS-${nombre}', '${um}', ${factor ?? "NULL"}, ${costo}, ${costo * 2},
                 '${compra}', '${venta}', ${peso ?? "NULL"}, now()) RETURNING "id"`
      )
    ).id;
  const enLocal = async (localId, baseId, stock = null) => {
    const pl = (await uno(c, `INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES (${localId}, ${baseId}, now()) RETURNING "id"`)).id;
    let sl = null;
    if (stock !== null) sl = (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${localId}, ${pl}, ${stock}, now()) RETURNING "id"`)).id;
    return { pl, sl, base: baseId };
  };

  const P = {};
  // Depósito
  P.pack12 = await enLocal(L.D, await base("Pack12", { um: "pack", factor: 12, costo: 1200 }), 120);
  P.pack6 = await enLocal(L.D, await base("Pack6", { um: "pack", factor: 6, costo: 600 }), 60);
  P.pieza = await enLocal(L.D, await base("Pieza", { um: "kg", costo: 4000, compra: "UNIDAD", venta: "PIEZA", peso: 2.5 }), 3);
  // Local
  P.unidad = await enLocal(L.L, await base("Unidad", { costo: 50 }), 20);
  P.kg = await enLocal(L.L, await base("Kilo", { um: "kg", costo: 1000 }), 2.5);
  P.sinCosto = await enLocal(L.L, await base("SinCosto", { costo: 0 }), 5);
  P.negativo = await enLocal(L.L, await base("Negativo", { costo: 10 }), -3);
  P.revaloriza = await enLocal(L.L, await base("Revaloriza", { costo: 1000 }), 20);
  return { G, L, P };
}

const sesion = ({ id, localId, permisos, esDeposito = false }) =>
  jwt.sign(
    { id, nombre: `VS ${id}`, email: `vs-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );

try {
  // ══════════════════════════════════════════════════════════════════════════
  seccion("Base: migraciones, siembra, los dos libros, escrituras reales");
  // ══════════════════════════════════════════════════════════════════════════
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(urlPrueba, { hasta: MIGRACION_LIBRO });
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });
  const { G, L, P } = await sembrar();
  aplicarLibroEnAdelante(urlPrueba);
  const [estadoCostos] = await c.$queryRaw`SELECT estado FROM "libro_costo_estado"()`;
  ok("el Libro de Costos quedó ACTIVADO con un punto cero de la siembra", estadoCostos.estado === "ACTIVADO", json(estadoCostos));

  // Las versiones de costo, por paso, para reubicarlas con los movimientos.
  const maxVersion = async () => Number((await uno(c, `SELECT coalesce((SELECT max("version") FROM (SELECT "version" FROM "CostoBaseVersion" UNION ALL SELECT "version" FROM "CostoUbicacionVersion") x), 0)::text AS "v"`)).v);
  const g = guion(c);
  const pasosDeCosto = [];
  const transferencias = [];
  await g.puntoCero(PUNTO_CERO_PRODUCCION.instanteArgentina);
  pasosDeCosto.push({ momento: ACTIVACION_COSTOS_AR, antes: 0, despues: await maxVersion() });
  const paso = async (momento, fn) => {
    const antes = await maxVersion();
    await g.paso(momento, fn);
    pasosDeCosto.push({ momento, antes, despues: await maxVersion() });
  };
  const stock = (x, cant, origen = null) =>
    c.$transaction(async (tx) => {
      if (origen) await declararOrigenDeStock(tx, origen);
      await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = ${cant}, "updatedAt" = now() WHERE "id" = ${x.sl}`);
    });
  const costo = (x, valor) => c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "precio_costo" = ${valor}, "updatedAt" = now() WHERE "id" = ${x.base}`);

  await paso("2026-09-29 12:00:00", () => stock(P.unidad, 18));
  await paso("2026-09-30 10:00:00", async () => {
    await stock(P.unidad, 15, { origen: ORIGEN_STOCK.VENTA, referencia: "1" });
    await stock(P.pack12, 96); // SIN_ORIGEN: no se declara nada
  });
  await paso("2026-09-30 14:00:00", () => costo(P.revaloriza, 1200)); // intradía: no mueve el 30
  await paso("2026-09-30 15:00:00", () =>
    c.$transaction(async (tx) => {
      const origen = await tx.productoLocal.findUnique({ where: { id: P.pack6.pl }, include: { base: true } });
      const { transferencia } = await crearTransferencia({
        tx,
        origenId: L.D,
        destinoId: L.L,
        items: [{ baseId: P.pack6.base, productoLocalOrigenId: P.pack6.pl, cantidad: 12, unidadEnviada: "UNIDAD", productoLocalOrigen: origen }],
      });
      transferencias.push({ id: transferencia.id, momento: "2026-09-30 15:00:00" });
    })
  );
  await paso("2026-10-01 09:00:00", () => costo(P.pack6, 720)); // el costo de hoy NO toca el tránsito
  await paso("2026-10-01 11:00:00", () => costo(P.unidad, 60));
  await paso("2026-10-01 12:00:00", () => stock(P.unidad, 10));
  await paso("2026-10-01 12:00:00", () =>
    // REEXPRESIÓN: el pack de 12 pasa a 24 con el mismo costo del bulto ($1.200).
    // Desde el 02/10 cada unidad vale $50 y no $100, sin compra ni venta.
    c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "factor_pack" = 24, "updatedAt" = now() WHERE "id" = ${P.pack12.base}`)
  );
  // ¿POR QUÉ CAMBIÓ? Operaciones con su origen declarado, como lo hacen las rutas.
  await paso("2026-10-02 10:00:00", () => stock(P.pack12, 120, { origen: ORIGEN_STOCK.COMPRA_PROVEEDOR, referencia: "77" })); // +24 u a $50
  await paso("2026-10-02 11:00:00", () => stock(P.pieza, 5, { origen: ORIGEN_STOCK.AJUSTE_MANUAL, referencia: "501" })); // +2 piezas
  await paso("2026-10-02 12:00:00", () => stock(P.pieza, 4, { origen: ORIGEN_STOCK.AJUSTE_MANUAL, referencia: "502" })); // −1 pieza
  await paso("2026-10-03 10:00:00", () => costo(P.revaloriza, 1500)); // HOY: "Ahora" no lo usa
  await paso("2026-10-03 09:30:00", () =>
    // La recepción en el ORIGEN que solo libera el tránsito: delta físico cero.
    c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.TRANSFERENCIA_RECEPCION, referencia: String(transferencias[0].id) });
      await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "enTransito" = 0, "updatedAt" = now() WHERE "id" = ${P.pack6.sl}`);
    })
  );
  // NACE HOY en el depósito, a las 15:00, a $500 con 10 unidades: base,
  // ubicación y fila de stock, en el orden en que los escribe la app.
  await paso("2026-10-03 15:00:00", async () => {
    const b = (await uno(c, `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","precio_costo","precio_venta","updatedAt") VALUES (${G}, 'NaceHoy', 'VS-NaceHoy', 'unidad', 500, 900, now()) RETURNING "id"`)).id;
    const pl = (await uno(c, `INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES (${L.D}, ${b}, now()) RETURNING "id"`)).id;
    P.naceHoy = { base: b, pl, sl: (await uno(c, `INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${L.D}, ${pl}, 10, now()) RETURNING "id"`)).id };
  });
  await paso("2026-10-03 16:00:00", () => costo(P.naceHoy, 650)); // después del alta: hoy no cuenta

  await g.reubicar();
  for (const t of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
    await c.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER "${t}_inmutable"`);
  }
  for (const p of pasosDeCosto) {
    const t = AR(p.momento);
    for (const tabla of ["CostoBaseVersion", "CostoUbicacionVersion"]) {
      await c.$executeRawUnsafe(
        `UPDATE "${tabla}" SET "instante" = (${t})::timestamp(3), "dia" = "libro_stock_dia"((${t})::timestamp(3)) WHERE "version" > ${p.antes} AND "version" <= ${p.despues}`
      );
    }
  }
  const tAct = AR(ACTIVACION_COSTOS_AR);
  await c.$executeRawUnsafe(`UPDATE "LibroCostoActivacion" SET "instante" = (${tAct})::timestamp(3), "dia" = "libro_stock_dia"((${tAct})::timestamp(3))`);
  for (const t of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
    await c.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER "${t}_inmutable"`);
  }
  for (const t of transferencias) {
    await c.$executeRawUnsafe(`UPDATE "Transferencia" SET "fechaEnvio" = (${AR(t.momento)})::timestamp(3) WHERE "id" = ${t.id}`);
  }
  const act = await activacionDelLibroDeCostos(c);
  ok("la activación reubicada es la de producción: 2026-09-29", act?.dia === "2026-09-29", json(act));

  const valor = (localId, desde, hasta = desde, hoy = HOY) =>
    valorDelPeriodo(c, { localId, desde, hasta, hoy, esDeposito: localId === L.D });
  const cadena = (v, x) => v.cadenas.find((k) => k.productoLocalId === x.pl)?.valor;

  // ══════════════════════════════════════════════════════════════════════════
  seccion("A-B. El depósito: pack, pieza, un día y un período con revalorización");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const v = await valor(L.D, "2026-09-30");
    const t = v.totales;
    ok("30/09: estado COMPLETO, primer día valorizable 30/09", v.alcance.estado === ESTADO_VALOR.COMPLETO && v.alcance.primerDia === "2026-09-30", json(v.alcance));
    ok("pack x12: 120 unidades a $1.200 el bulto → $12.000; cierra 96 → $9.600", pesos(cadena(v, P.pack12).inicial) === 12000 && pesos(cadena(v, P.pack12).final) === 9600, json(cadena(v, P.pack12)));
    ok("pieza del depósito: 3 piezas de 2,5 kg a $4.000/kg → $30.000", pesos(cadena(v, P.pieza).inicial) === 30000, json(cadena(v, P.pieza)));
    ok("pack x6: 60 → 48 unidades (12 salieron en tránsito): $6.000 → $4.800", pesos(cadena(v, P.pack6).inicial) === 6000 && pesos(cadena(v, P.pack6).final) === 4800);
    ok("totales: inicial $48.000, final $44.400, físico −$3.600, revalorización 0", [t.inicial, t.final, t.fisico, t.revalorizacion].map(pesos).join() === "48000,44400,-3600,0", json(t));
    ok("E. el tránsito NO está en el disponible, y vale $1.200 aparte", pesos(v.transito.alCerrar.valor) === 1200 && pesos(v.transito.alAbrir.valor) === 0, json(v.transito));
    ok("el tránsito del libro concilia con el documento", v.transito.alCerrar.noConciliado.length === 0, json(v.transito.alCerrar.noConciliado));

    const p = await valor(L.D, "2026-09-30", "2026-10-02");
    const tp = p.totales;
    ok(
      "30/09 a 02/10: el pack x6 pasa a $120 la unidad el 02/10 (cambio del 01/10): revalorización +$960",
      pesos(cadena(p, P.pack6).revalorizacion) === 960 && pesos(cadena(p, P.pack6).final) === 5760,
      json(cadena(p, P.pack6))
    );
    ok(
      "REEXPRESIÓN: el pack pasa de x12 a x24 con el mismo bulto de $1.200 → 96 u de $100 a $50: −$4.800, sin físico ni revalorización",
      // Final 120 u × $50: después de la reexpresión entra la compra del 02/10 (+24 u a $50).
      pesos(cadena(p, P.pack12).reexpresion) === -4800 && pesos(cadena(p, P.pack12).revalorizacion) === 0 && pesos(cadena(p, P.pack12).final) === 6000,
      json(cadena(p, P.pack12))
    );
    ok(
      "inicial $48.000, final $51.760: variación +$3.760 = físico +$7.600 + revalorización $960 + reexpresión −$4.800, al centavo",
      [tp.inicial, tp.final, tp.variacion, tp.fisico, tp.revalorizacion, tp.reexpresion].map(pesos).join() === "48000,51760,3760,7600,960,-4800" && tp.cuadra,
      json(tp)
    );

    // ── J. ¿POR QUÉ CAMBIÓ? ──────────────────────────────────────────────
    const ex = tp.explicacion;
    const cat = Object.fromEntries(ex.categorias.map((x) => [x.categoria, x]));
    ok("J. la explicación suma EXACTAMENTE el movimiento físico ($7.600)", ex.cuadra === true && ex.total === tp.fisico, json({ total: ex.total, fisico: tp.fisico }));
    ok("J. compra (COMPRA_PROVEEDOR): +$1.200 = 24 u a $50, 1 movimiento", pesos(cat.COMPRAS.neto) === 1200 && cat.COMPRAS.movimientosDeEntrada === 1, json(cat.COMPRAS));
    ok("J. transferencia enviada: −$1.200 = 12 u a $100", pesos(cat.TRANSFERENCIAS.neto) === -1200 && pesos(cat.TRANSFERENCIAS.salidas) === -1200, json(cat.TRANSFERENCIAS));
    ok(
      "J. ajustes: la dirección sale del delta, no del origen — +2 piezas ($20.000) y −1 pieza (−$10.000)",
      pesos(cat.AJUSTES.entradas) === 20000 && pesos(cat.AJUSTES.salidas) === -10000 && pesos(cat.AJUSTES.neto) === 10000,
      json(cat.AJUSTES)
    );
    ok("J. SIN_ORIGEN no se reclasifica: 'Sin clasificar' −$2.400, 1 movimiento", pesos(ex.sinClasificar.efecto) === -2400 && ex.sinClasificar.movimientos === 1 && pesos(cat.SIN_CLASIFICAR.neto) === -2400, json(ex.sinClasificar));
    ok("J. la revalorización ($960) y la reexpresión (−$4.800) no aparecen como compra, venta ni ningún origen", pesos(cat.VENTAS.neto) === 0 && pesos(cat.OTROS.neto) === 0 && pesos(cat.ALTAS_Y_BAJAS.neto) === 0);

    const hoyTransito = await valor(L.D, HOY);
    const catHoy = Object.fromEntries(hoyTransito.totales.explicacion.categorias.map((x) => [x.categoria, x]));
    ok("J. la recepción que solo libera el tránsito no mueve stock disponible: Transferencias $0 hoy", pesos(catHoy.TRANSFERENCIAS.neto) === 0 && catHoy.TRANSFERENCIAS.movimientos === 0, json(catHoy.TRANSFERENCIAS));
    ok("J. el nacido hoy sin origen declarado es 'Sin clasificar' +$5.000, y cuadra", pesos(catHoy.SIN_CLASIFICAR.neto) === 5000 && hoyTransito.totales.explicacion.cuadra, json(catHoy.SIN_CLASIFICAR));

    const detalle = await movimientosDeCategoria(c, { localId: L.D, desde: "2026-09-30", hasta: "2026-10-02", categoria: "AJUSTES", esDeposito: true, hoy: HOY, page: 1, pageSize: 50 });
    ok(
      "J. el detalle de Ajustes: dos movimientos, con su delta, su efecto con el costo de ese día y su referencia",
      json(detalle.movimientos.items.map((m) => [m.delta, pesos(m.efecto), m.origenRef, m.identidad?.nombre])) === json([[2000, 20000, "501", "Pieza"], [-1000, -10000, "502", "Pieza"]]),
      json(detalle.movimientos.items.map((m) => [m.delta, m.efecto, m.origenRef]))
    );
    const detVentas = await movimientosDeCategoria(c, { localId: L.L, desde: "2026-09-30", hasta: "2026-09-30", categoria: "VENTAS", esDeposito: false, hoy: HOY, page: 1, pageSize: 50 });
    ok("J. el detalle de Ventas del local: la venta #1, −3 u a $50", detVentas.movimientos.total === 1 && detVentas.movimientos.items[0].origenRef === "1" && pesos(detVentas.movimientos.items[0].efecto) === -150, json(detVentas.movimientos));

    // La escala de SU momento: el −24 u del 30/09 se leía x12; el factor pasó a
    // 24 el 01/10. Por el camino real: servidor → API → renglón de la pantalla.
    const detSin = await movimientosDeCategoria(c, { localId: L.D, desde: "2026-09-30", hasta: "2026-10-02", categoria: "SIN_CLASIFICAR", esDeposito: true, hoy: HOY, page: 1, pageSize: 50 });
    const filaPack = detSin.movimientos.items.find((m) => m.productoLocalId === P.pack12.pl);
    const renglonPack = filaPack && renglonDeMovimiento(movimientoDeCategoriaApi(filaPack), { local: { esDeposito: true } });
    ok(
      "J. HISTÓRICO: el −24 u del 30/09 se lee con el x12 de ese día (−2 bultos), no con el x24 de hoy (−1 bulto)",
      filaPack?.escalaDelMomento?.escala?.factorPack === 12 && filaPack?.identidad?.escala?.factorPack === 24 && renglonPack?.cantidad === "−2 bultos",
      json({ escalaDelMomento: filaPack?.escalaDelMomento, hoy: filaPack?.identidad?.escala, renglon: renglonPack })
    );

    // Σ filas = categoría = su parte del físico, al centavo; y no depende de la página.
    const todasLasFilas = async (categoria, pageSize) => {
      const filas = [];
      let d;
      for (let page = 1; !d || page <= d.movimientos.totalPages; page++) {
        d = await movimientosDeCategoria(c, { localId: L.D, desde: "2026-09-30", hasta: "2026-10-02", categoria, esDeposito: true, hoy: HOY, page, pageSize });
        filas.push(...d.movimientos.items);
      }
      return { filas, total: d.totalDeLaCategoria };
    };
    let sumaDeCategorias = 0;
    const cuadres = [];
    for (const x of ex.categorias) {
      const deAUno = await todasLasFilas(x.categoria, 1);
      const deAMuchos = await todasLasFilas(x.categoria, 50);
      const suma = deAUno.filas.reduce((s, m) => s + (m.efecto ?? 0), 0);
      const mismaFila = json(deAUno.filas.map((m) => [m.id, m.efecto])) === json(deAMuchos.filas.map((m) => [m.id, m.efecto]));
      sumaDeCategorias += suma;
      cuadres.push({ categoria: x.categoria, suma, total: deAUno.total, neto: x.neto, filas: deAUno.filas.length, mismaFila });
    }
    ok(
      "J. DETALLE AL CENTAVO: en cada categoría Σ filas = total de la categoría = su neto del resumen, igual de a 1 por página que de a 50",
      cuadres.every((q) => q.suma === q.total && q.total === q.neto && q.mismaFila),
      json(cuadres)
    );
    ok("J. y Σ de todas las filas de todas las categorías = movimiento físico", sumaDeCategorias === tp.fisico, json({ sumaDeCategorias, fisico: tp.fisico }));
    ok("O. el tránsito conserva el costo congelado: 12 u × $100 = $1.200, no 12 × $120", pesos(p.transito.alCerrar.valor) === 1200, json(p.transito.alCerrar));

    const hoyD = await valor(L.D, HOY);
    const nace = cadena(hoyD, P.naceHoy);
    ok("NACE HOY: 10 u con el costo de su alta ($500) → $5.000, aunque a las 16:00 pase a $650", nace?.completa === true && pesos(nace.final) === 5000 && nace.nacioEnElPeriodo === true, json(nace));
    ok("y 'Ahora' del depósito NO queda incompleto por él", hoyD.totales.completo === true && hoyD.totales.faltantes.length === 0 && hoyD.totales.cuadra, json(hoyD.totales.faltantes));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C-D-F. El local: faltante, negativo, intradía, revalorización, períodos");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const v = await valor(L.L, "2026-09-30");
    const t = v.totales;
    ok("J. costo intradía: Revaloriza sigue a $1.000 el 30/09 → $20.000 al abrir y al cerrar", pesos(cadena(v, P.revaloriza).final) === 20000 && cadena(v, P.revaloriza).revalorizacion === 0);
    ok("L. sin costo: la cadena no vale cero, queda afuera y se nombra", cadena(v, P.sinCosto).completa === false && cadena(v, P.sinCosto).inicial === null && t.faltantes.some((f) => f.productoLocalId === P.sinCosto.pl && f.motivo === MOTIVO_COSTO_FALTANTE.SIN_COSTO), json(t.faltantes));
    ok("L. y el total se marca incompleto", t.completo === false);
    ok("M. el negativo se valoriza negativo (−3 × $10 = −$30) y se marca", pesos(cadena(v, P.negativo).inicial) === -30 && cadena(v, P.negativo).stockNegativo === true && t.cadenasConStockNegativo === 1);
    ok("inicial $23.370 y final $23.220 (sin el faltante)", pesos(t.inicial) === 23370 && pesos(t.final) === 23220, json(t));

    const p = await valor(L.L, "2026-09-30", "2026-10-02");
    const tp = p.totales;
    ok("K. el cambio del 30/09 a las 14:00 aparece el 01/10: +$4.000 de revalorización", pesos(cadena(p, P.revaloriza).revalorizacion) === 4000 && pesos(cadena(p, P.revaloriza).fisico) === 0);
    ok("Unidad: físico −$400 (−3 y −5 a $50) y revalorización +$100 (10 u de $50 a $60)", pesos(cadena(p, P.unidad).fisico) === -400 && pesos(cadena(p, P.unidad).revalorizacion) === 100, json(cadena(p, P.unidad)));
    ok("Z. inicial $23.370, final $27.070, variación = físico + revalorización", pesos(tp.inicial) === 23370 && pesos(tp.final) === 27070 && tp.cuadra && tp.variacion === tp.fisico + tp.revalorizacion, json(tp));
    ok(
      "la evolución son fotografías: 30/09 $23.220, 01/10 $26.970, 02/10 $27.070, y el final es la última",
      json(tp.evolucion.map((e) => [e.dia, pesos(e.valor)])) === json([["2026-09-30", 23220], ["2026-10-01", 26970], ["2026-10-02", 27070]]) && tp.final === tp.evolucion.at(-1).valor
    );

    const hoy = await valor(L.L, HOY);
    ok("EN CURSO: hoy es EN_CURSO", hoy.alcance.estado === ESTADO_VALOR.EN_CURSO);
    ok("'Ahora' usa el costo de HOY a las 00:00: el cambio de hoy a $1.500 no entra ($24.000, no $30.000)", pesos(cadena(hoy, P.revaloriza).final) === 24000, json(cadena(hoy, P.revaloriza)));

    const semana = await valor(L.L, "2026-09-28", "2026-10-04");
    ok("semana que empieza antes del 30/09: PARCIAL, se valoriza desde el 30/09 hasta hoy", semana.alcance.estado === ESTADO_VALOR.PARCIAL && semana.alcance.desdeValorizado === "2026-09-30" && semana.alcance.hastaValorizado === HOY, json(semana.alcance));
    ok("T. un día anterior al primero valorizable: NO_DISPONIBLE y sin totales (no ceros)", (await valor(L.L, "2026-09-29")).totales === null && (await valor(L.L, "2026-09-29")).alcance.estado === ESTADO_VALOR.NO_DISPONIBLE);
    const mes = await valor(L.L, "2026-10-01", "2026-10-31");
    ok("mes en curso: desde el 01/10 hasta hoy", mes.alcance.estado === ESTADO_VALOR.EN_CURSO && mes.dias.length === 3 && mes.totales.cuadra, json(mes.alcance));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("H. Las rutas: permisos, y el valor en el resumen y en los productos");
  // ══════════════════════════════════════════════════════════════════════════
  {
    // Las rutas usan el cliente de la app, que lee DATABASE_URL al importarse.
    process.env.DATABASE_URL = urlPrueba;
    const rutas = {
      resumen: (await import("../../app/api/stock_locales/diario/resumen/route.js")).GET,
      productos: (await import("../../app/api/stock_locales/diario/productos/route.js")).GET,
    };
    const llamar = async (ruta, params, s) => {
      const qs = new URLSearchParams(params).toString();
      const req = new Request(`http://ci.local/api/stock_locales/diario/${ruta}?${qs}`, { headers: { cookie: `erpazul_sesion=${s}` } });
      const r = await rutas[ruta](req);
      return { status: r.status, ...(await r.json().catch(() => ({}))) };
    };
    const encargado = sesion({ id: 201, localId: L.L, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] });
    const cajero = sesion({ id: 202, localId: L.L, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] });
    const soloFinanzas = sesion({ id: 203, localId: L.L, permisos: ["finanzas.ver"] });

    // Las rutas deciden "hoy" con el reloj REAL de PostgreSQL, no con el `HOY`
    // del guion. Por eso se piden el 30/09: el primer día del guion, que da los
    // mismos números corra el día que corra (hoy o completo, su cierre no ve los
    // movimientos reubicados en días posteriores).
    const DIA = { unidad: "DIA", fecha: "2026-09-30" };
    const r = await llamar("resumen", DIA, encargado);
    ok("V. con stock.ver: 200 y el valor del 30/09: $23.370 → $23.220", r.status === 200 && r.valor?.inicial === 23370 && r.valor?.final === 23220 && r.valor?.cuadra === true, json(r.valor));
    ok("el faltante viaja con su nombre, y el total dice incompleto", r.valor?.completo === false && r.valor?.faltantes?.some((f) => f.nombre === "SinCosto"), json(r.valor?.faltantes));
    const w = await llamar("resumen", DIA, cajero);
    ok("W. sin stock.ver (CAJERO): 403", w.status === 403 && w.valor === undefined, json(w));
    const x = await llamar("resumen", DIA, soloFinanzas);
    ok("X. finanzas.ver sin stock.ver: 403, no concede el Valor del Stock", x.status === 403, json(x));

    const lista = await llamar("productos", { ...DIA, filtro: "con_valor" }, encargado);
    const nombres = (lista.items || []).map((i) => i.nombre);
    ok("la lista del valor: primero el faltante, después el que movió el valor", json(nombres) === json(["SinCosto", "Unidad"]), json(nombres));
    const un = (lista.items || []).find((i) => i.nombre === "Unidad");
    ok(
      "16. el detalle de un producto: cantidades, costos congelados, efecto físico y revalorización",
      un?.valor?.cantidadInicial === 18 && un.valor.cantidadFinal === 15 && un.valor.costoInicial === 50 && un.valor.costoFinal === 50 && un.valor.inicial === 900 && un.valor.final === 750 && un.valor.fisico === -150 && un.valor.revalorizacion === 0,
      json(un?.valor)
    );
    const sc = (lista.items || []).find((i) => i.nombre === "SinCosto");
    ok("el faltante en la lista: importes en null, nunca $0", sc?.valor?.completo === false && sc.valor.inicial === null && sc.valor.final === null, json(sc?.valor));

    // ════════════════════════════════════════════════════════════════════════
    seccion("I. La ubicación: local normal, admin en vista global, y nada más");
    // ════════════════════════════════════════════════════════════════════════
    const conCookie = async (ruta, params, cookie) => {
      const qs = new URLSearchParams(params).toString();
      const r = await rutas[ruta](new Request(`http://ci.local/api/stock_locales/diario/${ruta}?${qs}`, { headers: { cookie } }));
      return { status: r.status, ...(await r.json().catch(() => ({}))) };
    };
    const admin = sesion({ id: 204, localId: null, permisos: ["*"] });
    const global = (g) => `erpazul_sesion=${admin}; erpazul_grupo_activo=${g}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`;

    const propio = await llamar("resumen", DIA, encargado);
    ok("local normal: su ubicación, sin lista de ubicaciones", propio.status === 200 && propio.local?.id === L.L && propio.ubicaciones === undefined, json({ local: propio.local, u: propio.ubicaciones }));
    const ajeno = await llamar("resumen", { ...DIA, localId: L.D }, encargado);
    ok("local normal pidiendo otra ubicación de su grupo: 403", ajeno.status === 403 && ajeno.valor === undefined, json(ajeno));

    const sinElegir = await conCookie("resumen", DIA, global(G));
    ok(
      "admin global sin localId: 400 FALTA_UBICACION con las ubicaciones del grupo activo (depósito primero), sin datos",
      sinElegir.status === 400 && sinElegir.codigo === "FALTA_UBICACION" && json((sinElegir.ubicaciones || []).map((u) => u.nombre)) === json(["VS Depósito", "VS Local"]) && sinElegir.valor === undefined,
      json(sinElegir)
    );
    const eligeLocal = await conCookie("resumen", { ...DIA, localId: L.L }, global(G));
    ok("admin global elige el local: 200, su valor, y la lista para cambiar", eligeLocal.status === 200 && eligeLocal.local?.id === L.L && eligeLocal.valor?.inicial === 23370 && eligeLocal.ubicaciones?.length === 2, json(eligeLocal.local));
    const cambia = await conCookie("resumen", { ...DIA, localId: L.D }, global(G));
    ok("cambio de ubicación: el depósito, con SU valor ($48.000)", cambia.status === 200 && cambia.local?.id === L.D && cambia.valor?.inicial === 48000, json(cambia.valor?.inicial));
    const deOtroGrupo = await conCookie("resumen", { ...DIA, localId: L.X }, global(G));
    ok("admin global pidiendo una ubicación de otro grupo: 403", deOtroGrupo.status === 403 && deOtroGrupo.valor === undefined, json(deOtroGrupo));
    const listaGlobal = await conCookie("productos", { ...DIA, filtro: "con_valor" }, global(G));
    ok("también /productos pide elegir, con la lista", listaGlobal.status === 400 && listaGlobal.codigo === "FALTA_UBICACION" && listaGlobal.ubicaciones?.length === 2, json(listaGlobal));
    const cajeroGlobal = await llamar("resumen", { ...DIA, localId: L.L }, cajero);
    ok("las rutas siguen protegidas por stock.ver aunque venga localId", cajeroGlobal.status === 403, json(cajeroGlobal));
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.log(`  ✗ EXCEPCIÓN: ${err?.stack || err}`);
} finally {
  await c?.$disconnect().catch(() => {});
  // `VALOR_DEL_STOCK_CONSERVAR_BASE=1` la deja, para abrir la pantalla contra
  // esta historia con `next dev` en la máquina de desarrollo. En CI se borra.
  if (process.env.VALOR_DEL_STOCK_CONSERVAR_BASE === "1") console.log(`\nBase conservada: ${NOMBRE}`);
  else await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${"═".repeat(72)}\nAfirmaciones que pasaron: ${pasadas}\nAfirmaciones que fallaron: ${fallas.length}`);
for (const f of fallas) console.log(`  ✗ ${f}`);
process.exit(fallas.length ? 1 : 0);
