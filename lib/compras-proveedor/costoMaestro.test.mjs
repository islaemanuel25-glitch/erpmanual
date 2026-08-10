// Candados de lib/compras-proveedor/costoMaestro.js.
//
// Es UNO de los dos caminos que escriben el costo maestro en producción —el otro
// es el aplicador de listas de proveedor, que tiene ~787 tests— y hasta acá no
// tenía un solo candado propio. Lo llaman tres rutas: compras-proveedor/crear,
// editar-item/[id] y recibir/[id].
//
// ── ESTOS CANDADOS EJERCITAN EL COSTO QUE QUEDA ESCRITO ─────────────────────
//
// No verifican que la ruta llame a la función que calcula el costo: entra un
// valor y sale un número, y se compara el número.
//
// La razón está en C-14 (docs/business-rules/contradicciones.md): cinco rutas de
// clientes quedaron llamando mal a `checkPerm`, el candado comprobaba que la
// línea existiera y no que funcionara, y pasó en verde mientras las rutas
// respondían 500. Lo encontró una captura.
//
// Por eso acá hay un DOBLE DE BASE EN MEMORIA: implementa las cinco operaciones
// de Prisma que el módulo usa y registra cada escritura con sus valores. Lo que
// se afirma es el contenido de esas escrituras.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/costoMaestro.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { costoLineaAMaestro, actualizarCostoRealProducto } from "./costoMaestro.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Doble de base en memoria
// ---------------------------------------------------------------------------

/**
 * Fabrica un `db` que se comporta como el cliente Prisma para lo que este módulo
 * usa, y deja registrado TODO lo que se escribió y en qué orden.
 *
 * `fallarEnEscritura: n` hace que la n-ésima escritura tire. Es lo que permite
 * preguntar qué queda en la base cuando el proceso se corta a mitad de camino,
 * que es el caso que importa cuando no hay transacción.
 */
function crearDb({ base, locales, fallarEnEscritura = null }) {
  const escrituras = [];
  let contador = 0;

  const quizasFallar = () => {
    contador += 1;
    if (fallarEnEscritura !== null && contador === fallarEnEscritura) {
      throw new Error(`fallo simulado en la escritura ${contador}`);
    }
  };

  return {
    escrituras,
    productoLocal: {
      findUnique: async ({ where }) => {
        const pl = locales.find((l) => l.id === Number(where.id));
        if (!pl) return null;
        return {
          id: pl.id,
          baseId: base.id,
          margen: pl.margen ?? null,
          base: { es_combo: base.es_combo ?? false, creadoEnLocalId: base.creadoEnLocalId ?? null },
        };
      },
      findMany: async ({ where }) =>
        locales
          .filter((l) => (where.localId != null ? l.localId === Number(where.localId) : true))
          .map((l) => ({
            id: l.id,
            localId: l.localId,
            margen: l.margen ?? null,
            precio_venta: l.precio_venta ?? null,
            reglaPrecio: l.reglaPrecio ?? null,
            recargoFijoUnidad: l.recargoFijoUnidad ?? null,
          })),
      update: async ({ where, data }) => {
        quizasFallar();
        escrituras.push({ modelo: "ProductoLocal", id: where.id, ...data });
        return { id: where.id, ...data };
      },
    },
    productoBase: {
      findUnique: async () => ({
        margen: base.margen ?? null,
        redondeo_100: base.redondeo_100 ?? false,
        unidad_medida: base.unidad_medida ?? null,
        factor_pack: base.factor_pack ?? null,
      }),
      update: async ({ where, data }) => {
        quizasFallar();
        escrituras.push({ modelo: "ProductoBase", id: where.id, ...data });
        return { id: where.id, ...data };
      },
    },
  };
}

const soloBase = (esc) => esc.filter((e) => e.modelo === "ProductoBase");
const soloLocales = (esc) => esc.filter((e) => e.modelo === "ProductoLocal");

// Producto del DEPÓSITO (creadoEnLocalId null → de depósito), local 1 = depósito.
const escenarioBase = () => ({
  base: { id: 100, margen: 30, redondeo_100: false, creadoEnLocalId: null, factor_pack: 1 },
  locales: [
    { id: 11, localId: 1, margen: null, precio_venta: 130 },   // depósito, sin margen propio
    { id: 12, localId: 2, margen: 50, precio_venta: 150 },     // local con margen PROPIO
    { id: 13, localId: 3, margen: null, precio_venta: 130 },   // local sin margen propio
  ],
});

// ===========================================================================
// costoLineaAMaestro — la conversión del costo de la línea al costo almacenado
// ===========================================================================

test("UNIDAD sobre producto con pack: el costo se multiplica por el factor", () => {
  // $100 la unidad, caja de 12 → el maestro guarda $1200 por bulto.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 100, unidad: "UNIDAD", factorPack: 12 }),
    1200
  );
});

test("BULTO: el costo ya viene por bulto y NO se vuelve a multiplicar", () => {
  // El error que este candado previene es el doble factor: 1200 × 12 = 14400.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 1200, unidad: "BULTO", factorPack: 12 }),
    1200
  );
});

test("el unitario con decimales infinitos recompone el bulto exacto", () => {
  // 1480/18 = 82,2222… y el maestro tiene que dar 1480, no 1479,96. Se multiplica
  // a precisión completa y recién el resultado final se redondea a moneda.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 1480 / 18, unidad: "UNIDAD", factorPack: 18 }),
    1480
  );
});

test("fiambre y kg se guardan por kg, sin tocar el factor", () => {
  assert.equal(
    costoLineaAMaestro({ precioCosto: 8500, unidad: "UNIDAD", factorPack: 10, modoCompraProveedor: "UNIDAD" }),
    8500
  );
  assert.equal(
    costoLineaAMaestro({ precioCosto: 8500, unidad: "UNIDAD", factorPack: 10, unidadMedida: "kg" }),
    8500
  );
});

// --- FACTOR DE PACK MAL CARGADO -------------------------------------------

test("factor 0, negativo o basura NO multiplica: el costo pasa tal cual", () => {
  // Un factor mal cargado es un dato de catálogo, no del proveedor. Multiplicar
  // por 0 daría costo 0 y el producto pasaría a venderse regalado.
  for (const factor of [0, -5, null, undefined, "", "abc", NaN]) {
    assert.equal(
      costoLineaAMaestro({ precioCosto: 100, unidad: "UNIDAD", factorPack: factor }),
      100,
      `factorPack ${JSON.stringify(factor)} tendría que dejar el costo en 100`
    );
  }
});

test("un factor mal cargado ALTO sí multiplica, y ese es el riesgo real", () => {
  // Este candado NO afirma que esté bien: afirma qué hace hoy. Si el catálogo
  // dice 1000 y la caja trae 12, el maestro queda en $100.000 en vez de $1.200.
  // El módulo no puede distinguirlo — no tiene con qué— y por eso el número
  // queda acá escrito, para que el día que se agregue una cota se vea el cambio.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 100, unidad: "UNIDAD", factorPack: 1000 }),
    100000
  );
});

test("costo 0, negativo o inválido devuelve null y NO se propaga", () => {
  for (const c of [0, -1, null, undefined, "", "abc", NaN, Infinity]) {
    assert.equal(
      costoLineaAMaestro({ precioCosto: c, unidad: "UNIDAD", factorPack: 12 }),
      null,
      `precioCosto ${JSON.stringify(c)} tendría que dar null`
    );
  }
});

// ===========================================================================
// actualizarCostoRealProducto — QUÉ NÚMERO QUEDA ESCRITO
// ===========================================================================

test("escribe el costo en la base y recalcula la venta con el margen de la ficha", async () => {
  const db = crearDb(escenarioBase());
  await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });

  const b = soloBase(db.escrituras);
  assert.equal(b.length, 1);
  assert.equal(b[0].precio_costo, 200);
  // margen 30 % sobre 200 = 260.
  assert.equal(b[0].precio_venta, 260);
});

test("CADA ubicación recalcula con SU margen, no con el de la base ni con el de otra", async () => {
  // Es la regla que más plata mueve: si el precio de una ubicación se copiara a
  // otra, un local con margen 50 pasaría a vender con el 30 del depósito.
  const db = crearDb(escenarioBase());
  await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });

  const porId = Object.fromEntries(soloLocales(db.escrituras).map((e) => [e.id, e]));

  assert.equal(porId[11].precio_costo, 200);
  assert.equal(porId[11].precio_venta, 260, "sin margen propio usa el 30 de la ficha");

  assert.equal(porId[12].precio_costo, 200);
  assert.equal(porId[12].precio_venta, 300, "margen PROPIO 50 → 300, no 260");

  assert.equal(porId[13].precio_venta, 260, "sin margen propio usa el 30 de la ficha");
});

test("el override por local gana sobre el margen de la ficha", async () => {
  const esc = escenarioBase();
  esc.locales = [{ id: 12, localId: 2, margen: 80, precio_venta: 150 }];
  const db = crearDb(esc);
  await actualizarCostoRealProducto(db, { productoLocalId: 12, costoMaestro: 100 });

  const l = soloLocales(db.escrituras)[0];
  assert.equal(l.precio_venta, 180, "80 % sobre 100 = 180; con el 30 de la ficha daría 130");
});

test("un margen local de 0 es un margen puesto, no un margen ausente", async () => {
  // ESTE es el caso que separa `local.margen != null` de `local.margen ||`.
  //
  // Con margen 0 explícito no hay regla automática —el ERP pide margen > 0— así
  // que el precio de venta NO se toca. Con `||`, el 0 se lee como ausente, cae
  // al 30 de la ficha y le REESCRIBE el precio a una ubicación que lo tenía
  // puesto a mano.
  //
  // Lo escribo porque una mutación lo destapó: el candado de arriba usaba margen
  // 80 y pasaba con las dos versiones. Un candado que no distingue el error que
  // dice cubrir no cubre nada.
  const esc = escenarioBase();
  esc.locales = [{ id: 12, localId: 2, margen: 0, precio_venta: 150 }];
  const db = crearDb(esc);
  await actualizarCostoRealProducto(db, { productoLocalId: 12, costoMaestro: 100 });

  const l = soloLocales(db.escrituras)[0];
  assert.equal(l.precio_costo, 100, "el costo sí se escribe");
  assert.equal(
    "precio_venta" in l,
    false,
    "margen 0 = sin regla automática: el precio de venta NO se toca"
  );
});

test("sin margen en ningún lado NO se toca el precio de venta", async () => {
  // El ERP no tiene flag de "precio manual": la ausencia de margen ES el flag.
  // Escribir un precio acá pisaría uno cargado a mano.
  const esc = escenarioBase();
  esc.base.margen = null;
  esc.locales = [{ id: 11, localId: 1, margen: null, precio_venta: 130 }];
  const db = crearDb(esc);
  await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });

  const b = soloBase(db.escrituras)[0];
  const l = soloLocales(db.escrituras)[0];
  assert.equal(b.precio_costo, 200);
  assert.equal("precio_venta" in b, false, "la base no debería recibir precio_venta");
  assert.equal(l.precio_costo, 200, "el costo SÍ se escribe");
  assert.equal("precio_venta" in l, false, "la venta NO se toca");
});

test("sin margen y con la venta por debajo del costo, se informa bajoCosto", async () => {
  // No se pisa el precio manual, pero el llamador tiene que poder verlo: es
  // exactamente vender perdiendo.
  const esc = escenarioBase();
  esc.base.margen = null;
  esc.locales = [{ id: 11, localId: 1, margen: null, precio_venta: 130 }];
  const db = crearDb(esc);
  const r = await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });

  assert.equal(r.sinMargen.length, 1);
  assert.equal(r.sinMargen[0].precioVenta, 130);
  assert.equal(r.sinMargen[0].bajoCosto, true, "130 < 200 tiene que marcarse");
});

test("el redondeo a 100 de la ficha se respeta en el número escrito", async () => {
  const esc = escenarioBase();
  esc.base.redondeo_100 = true;
  esc.locales = [{ id: 11, localId: 1, margen: null, precio_venta: 100 }];
  const db = crearDb(esc);
  await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 210 });

  // 210 × 1,30 = 273 → sube a 300.
  assert.equal(soloBase(db.escrituras)[0].precio_venta, 300);
  assert.equal(soloLocales(db.escrituras)[0].precio_venta, 300);
});

// --- Las tres compuertas: nada se escribe -----------------------------------

test("un COMBO no recibe ninguna escritura", async () => {
  const esc = escenarioBase();
  esc.base.es_combo = true;
  const db = crearDb(esc);
  await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });
  assert.deepEqual(db.escrituras, [], "un combo no tiene costo físico que propagar");
});

test("un local que NO es dueño del producto no escribe NADA", async () => {
  // Un local comprando un producto del depósito. Decisión de negocio: no toca
  // ningún costo, ni el maestro ni su propio override.
  const db = crearDb(escenarioBase());
  await actualizarCostoRealProducto(db, {
    productoLocalId: 12,
    costoMaestro: 999,
    operadoDesdeLocalId: 2,   // local 2
    depositoLocalId: 1,       // el depósito es el 1 → el producto es del depósito
  });
  assert.deepEqual(db.escrituras, [], "el local 2 no es dueño: cero escrituras");
});

test("el dueño SÍ escribe, con los mismos parámetros de propiedad", async () => {
  // El contraste del anterior: si esto no pasara, la compuerta estaría cerrada
  // para todos y el candado de arriba pasaría por la razón equivocada.
  const db = crearDb(escenarioBase());
  await actualizarCostoRealProducto(db, {
    productoLocalId: 11,
    costoMaestro: 200,
    operadoDesdeLocalId: 1,
    depositoLocalId: 1,
  });
  assert.equal(soloBase(db.escrituras)[0].precio_costo, 200);
});

test("un costo inválido no escribe nada", async () => {
  for (const c of [0, -1, null, undefined, NaN, "abc"]) {
    const db = crearDb(escenarioBase());
    await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: c });
    assert.deepEqual(db.escrituras, [], `costoMaestro ${JSON.stringify(c)} escribió algo`);
  }
});

// ===========================================================================
// QUÉ QUEDA ESCRITO SI LA ESCRITURA FALLA A MITAD DE CAMINO
// ===========================================================================
//
// Estos candados NO afirman que el comportamiento sea correcto. Afirman qué pasa
// hoy, que es distinto según quién llame:
//
//   · recibir/[id] pasa la TRANSACCIÓN (`tx`) → un fallo revierte todo.
//   · crear y editar-item pasan el cliente (`prisma`) → NO hay transacción, y lo
//     que se escribió antes del fallo QUEDA.
//
// El módulo no puede saber cuál de los dos le tocó: recibe un `db` y escribe.

test("si falla la primera escritura, no queda nada", async () => {
  const db = crearDb({ ...escenarioBase(), fallarEnEscritura: 1 });
  await assert.rejects(
    () => actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 }),
    /fallo simulado/
  );
  assert.deepEqual(db.escrituras, []);
});

test("SIN transacción, un fallo después de la base deja el costo partido", async () => {
  // La base ya tiene el costo NUEVO y las ubicaciones el VIEJO. Con `prisma`
  // —que es lo que pasan crear y editar-item— esto queda así en la base.
  const db = crearDb({ ...escenarioBase(), fallarEnEscritura: 2 });
  await assert.rejects(
    () => actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 }),
    /fallo simulado/
  );

  assert.equal(soloBase(db.escrituras).length, 1, "la base alcanzó a escribirse");
  assert.equal(soloBase(db.escrituras)[0].precio_costo, 200);
  assert.equal(soloLocales(db.escrituras).length, 0, "ninguna ubicación se actualizó");
});

test("un fallo a mitad de la propagación deja ubicaciones con costos distintos", async () => {
  // El peor de los tres: el producto queda con costo 200 en la base y en la
  // primera ubicación, y 100 en las otras dos. Dos locales del mismo grupo
  // vendiendo el mismo producto con costos distintos.
  const db = crearDb({ ...escenarioBase(), fallarEnEscritura: 3 });
  await assert.rejects(
    () => actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 }),
    /fallo simulado/
  );

  const locales = soloLocales(db.escrituras);
  assert.equal(locales.length, 1, "solo la primera ubicación se actualizó");
  assert.equal(locales[0].id, 11);
  assert.equal(soloBase(db.escrituras)[0].precio_costo, 200);
  // Las ubicaciones 12 y 13 quedaron sin tocar: su costo sigue siendo el viejo.
});

test("con transacción el llamador revierte, y el módulo se comporta igual", async () => {
  // El módulo NO distingue: escribe lo mismo y propaga la excepción. Quien
  // decide si eso se revierte es quien le pasó el `db`. Este candado fija esa
  // frontera para que nadie asuma que el módulo transacciona por su cuenta.
  const db = crearDb({ ...escenarioBase(), fallarEnEscritura: 2 });
  let propago = false;
  try {
    await actualizarCostoRealProducto(db, { productoLocalId: 11, costoMaestro: 200 });
  } catch {
    propago = true;
  }
  assert.equal(propago, true, "la excepción tiene que llegar al llamador para que pueda revertir");
});

// ===========================================================================
// El producto que no existe
// ===========================================================================

test("un productoLocal inexistente no escribe nada", async () => {
  const db = crearDb(escenarioBase());
  await actualizarCostoRealProducto(db, { productoLocalId: 999, costoMaestro: 200 });
  assert.deepEqual(db.escrituras, []);
});

// ===========================================================================
// FORMA: quién le pasa una transacción y quién no
// ===========================================================================
//
// Estos DOS candados miran el código fuente, no un número, y por eso lo dicen en
// su nombre. No hay forma de ejercitar desde un módulo puro cuál de los tres
// llamadores abrió una transacción: eso vive en la ruta.
//
// Se fijan igual porque la diferencia es la que decide si un fallo a mitad de
// camino se revierte o queda escrito, y hoy los tres NO hacen lo mismo.

const leerRuta = (rel) =>
  fs.readFileSync(path.join(RAIZ, "app/api/compras-proveedor", rel), "utf8");

test("FORMA: recibir/[id] llama al costo maestro DENTRO de una transacción", async () => {
  const src = leerRuta("recibir/[id]/route.js");
  assert.match(src, /prisma\.\$transaction\(async \(tx\) => \{/);
  assert.match(
    src,
    /actualizarCostoRealProducto\(\s*tx\s*,/,
    "recibir tiene que pasar la transacción: si no, un fallo deja el costo escrito"
  );
});

test("FORMA: crear y editar-item YA NO llaman al costo maestro", async () => {
  // ACTUALIZADO el 2026-08-10. Este candado decía antes "llaman SIN transacción
  // — está así hoy", y documentaba que crear y editar-item propagaban el costo
  // fuera de transacción: si la propagación se cortaba, la base quedaba con el
  // costo nuevo y las ubicaciones con el viejo.
  //
  // Ese problema desapareció por otro camino: las dos rutas dejaron de propagar.
  // Un pedido registra lo que se le paga al proveedor; el costo del catálogo se
  // edita en editar producto. Los candados de fallo a mitad de camino de arriba
  // SIGUEN valiendo, porque describen al módulo, y al módulo lo sigue llamando
  // `recibir`.
  for (const rel of ["crear/route.js", "editar-item/[id]/route.js"]) {
    const src = leerRuta(rel);
    assert.doesNotMatch(
      src,
      /actualizarCostoRealProducto/,
      `${rel} volvió a propagar el costo maestro`
    );
  }
});

test("FORMA: agregar-item y editar-item hacen LO MISMO con el costo: nada", async () => {
  // ACTUALIZADO el 2026-08-10. Antes este candado fijaba una asimetría:
  // agregar una línea NO propagaba y editarla SÍ, así que el mismo hecho
  // económico movía el costo maestro o no según con qué botón se hubiera
  // cargado.
  //
  // La asimetría se resolvió hacia abajo, no hacia arriba: ninguna de las dos
  // propaga. Se conserva el candado —con el sentido dado vuelta— porque lo que
  // importa es que las dos sigan haciendo lo mismo.
  const agregar = leerRuta("agregar-item/[id]/route.js");
  const editar = leerRuta("editar-item/[id]/route.js");
  assert.doesNotMatch(agregar, /actualizarCostoRealProducto/);
  assert.doesNotMatch(editar, /actualizarCostoRealProducto/);
});

test("FORMA: la línea del pedido SIGUE guardando su precio", async () => {
  // Lo que se sacó es la propagación al catálogo, no el dato del pedido. El
  // precio de la línea es lo que se pidió y a qué precio, y eso se conserva.
  const agregar = leerRuta("agregar-item/[id]/route.js");
  const editar = leerRuta("editar-item/[id]/route.js");
  const crear = leerRuta("crear/route.js");
  assert.match(agregar, /precioCosto/);
  assert.match(editar, /precioCosto/);
  assert.match(crear, /precioCosto/);
});
