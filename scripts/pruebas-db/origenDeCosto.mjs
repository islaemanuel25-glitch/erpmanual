// PRUEBA DE BASE DEL ORIGEN DE LAS ESCRITURAS DE COSTO.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/origenDeCosto.mjs
//
// `declararOrigenDeCosto` deja en la transacción POR QUÉ cambió un costo, para
// el Libro de Costos que todavía no existe. Nadie lo lee hoy, así que ni el build
// ni los candados pueden ver si llega: es un `set_config` que se pierde sin
// ruido si se hace con el cliente equivocado o fuera de la transacción.
//
// Para verlo, esta prueba monta en una base DESCARTABLE un trigger de captura
// que hace de Libro: en cada alta o cambio de `precio_costo` de ProductoBase y
// ProductoLocal anota el origen y la referencia que la transacción declaró. Es
// solo de esta prueba; ninguna migración lo instala.
//
//   A. el mecanismo: se ve dentro de la transacción, muere con el commit y con
//      el rollback en la MISMA conexión, no toca el origen de stock, y una
//      declaración mal hecha no frena la escritura;
//   B. declarar no cambia el valor persistido: la misma escritura con y sin
//      declaración deja la misma fila, y ninguna función de la base lee el
//      origen de costo;
//   C. escritores reales: el cierre de una compra por su handler, la herencia
//      del depósito y el envío de una transferencia declaran lo esperado, los
//      costos quedan como siempre —la propagación intacta— y la operación
//      siguiente llega SIN_ORIGEN;
//   D. el libro físico no cambió: el movimiento de stock del cierre sigue
//      SIN_ORIGEN, porque declarar el costo no declara el stock;
//   E. las BAJAS de eliminar producto, por su handler: las filas y la base
//      llegan con ELIMINACION_PRODUCTO en una sola transacción, se borra
//      exactamente lo mismo que la misma baja hecha sin declarar —que sigue
//      siendo posible y queda SIN_ORIGEN—, un producto con historial se sigue
//      rechazando, y la operación siguiente llega sin origen;
//   F. el RESET OPERATIVO, por su handler: todas las bajas de ProductoLocal y
//      ProductoBase llegan con RESET_OPERATIVO en una sola transacción, y lo
//      que se crea después, sin origen.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { CONFIG_COSTO_ORIGEN, CONFIG_COSTO_ORIGEN_REF, ORIGEN_COSTO, SIN_ORIGEN_COSTO, declararOrigenDeCosto } =
  await import("../../lib/precios/origenDeCosto.js");
const { CONFIG_ORIGEN: CONFIG_STOCK_ORIGEN, SIN_ORIGEN: SIN_ORIGEN_STOCK } = await import(
  "../../lib/stock/libro/libroStock.js"
);

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
const json = (x) => JSON.stringify(x);
const igual = (t, o, e) => ok(t, json(o) === json(e), `esperado ${json(e)}, obtenido ${json(o)}`);
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

// ════════════════════════════════════════════════════════════════════════════
// La base descartable
// ════════════════════════════════════════════════════════════════════════════

const NOMBRE = "erpazul_origen_costo_prueba";
// UNA sola conexión: si el origen sobreviviera al commit, la operación
// siguiente lo encontraría sí o sí, porque no hay otra conexión donde caer.
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  u.searchParams.set("connection_limit", "1");
  return u.toString();
})();
const urlPsql = (() => {
  const u = new URL(urlPrueba);
  u.search = "";
  return u.toString();
})();

// El trigger de captura: hace de Libro de Costos, con las MISMAS
// configuraciones que exporta `origenDeCosto.js`.
const CAPTURA = [
  `CREATE TABLE "PruebaCapturaOrigenCosto" (
    "id" serial PRIMARY KEY,
    "tabla" text NOT NULL,
    "op" text NOT NULL,
    "fila" integer NOT NULL,
    "costo" numeric,
    "origen" text NOT NULL,
    "referencia" text NOT NULL,
    "txid" bigint NOT NULL
  )`,
  // En una BAJA la fila que queda es la vieja: `OLD`, como la va a leer el Libro.
  `CREATE FUNCTION prueba_captura_origen_costo() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    fila record;
  BEGIN
    IF TG_OP = 'DELETE' THEN fila := OLD; ELSE fila := NEW; END IF;
    INSERT INTO "PruebaCapturaOrigenCosto" ("tabla","op","fila","costo","origen","referencia","txid")
    VALUES (
      TG_TABLE_NAME, TG_OP, fila."id", fila."precio_costo",
      coalesce(nullif(current_setting('${CONFIG_COSTO_ORIGEN}', true), ''), '${SIN_ORIGEN_COSTO}'),
      coalesce(current_setting('${CONFIG_COSTO_ORIGEN_REF}', true), ''),
      txid_current()
    );
    RETURN NULL;
  END $$`,
  `CREATE TRIGGER "ProductoBase_prueba_captura" AFTER INSERT OR UPDATE OF "precio_costo" OR DELETE ON "ProductoBase"
    FOR EACH ROW EXECUTE FUNCTION prueba_captura_origen_costo()`,
  `CREATE TRIGGER "ProductoLocal_prueba_captura" AFTER INSERT OR UPDATE OF "precio_costo" OR DELETE ON "ProductoLocal"
    FOR EACH ROW EXECUTE FUNCTION prueba_captura_origen_costo()`,
];

const { PERMISO_REGISTRAR_PAGOS } = await import("../../lib/finanzas/pagosProveedores.js");
// Los mismos que `frenoDeCosto.mjs`: el cierre con pago los exige todos.
const PERMISOS = ["compras.ver", "compras.crear", "compras.recibir", PERMISO_REGISTRAR_PAGOS];
const marca = `ci-origen-costo-${Date.now()}`;

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(urlPsql);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. Declarar el origen no puede cambiar un valor");
  // ══════════════════════════════════════════════════════════════════════════
  // Antes de instalar la captura de esta prueba. Lo único que lee la
  // configuración son las dos funciones del Libro de Costos
  // (`20260929120000_libro_costos`), que solo la copian a la historia. Desde la
  // activación (`20260929200000_libro_costo_activacion`) las llaman los tres
  // triggers de captura, y NADA MÁS; los tres son AFTER, así que no pueden
  // cambiar la fila que se escribe: declarar no cambia ni un valor ni una
  // escritura. Hasta el 2026-09-29 esto afirmaba cero triggers, con el libro
  // sin activar.
  const lectores = await c.$queryRawUnsafe(
    `SELECT coalesce(array_agg(proname::text ORDER BY proname), '{}') AS n FROM pg_proc WHERE prosrc LIKE '%' || $1 || '%'`,
    CONFIG_COSTO_ORIGEN
  );
  igual("solo las funciones de origen del Libro de Costos leen la configuración", lectores[0].n, ["libro_costo_origen", "libro_costo_origen_ref"]);
  // tgtype es una máscara: el bit 2 es BEFORE.
  const triggersDeCosto = await c.$queryRawUnsafe(
    `SELECT coalesce(array_agg(t.tgname::text ORDER BY t.tgname), '{}') AS n,
            coalesce(bool_and((t.tgtype::int & 2) = 0), true) AS "todosAfter"
     FROM pg_trigger t JOIN pg_class k ON k.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND k.relname IN ('ProductoBase', 'ProductoLocal', 'Local')
       AND t.tgfoid IN (SELECT oid FROM pg_proc WHERE proname LIKE 'libro\\_costo\\_%')`
  );
  igual("con el libro activado, los únicos triggers de ProductoBase, ProductoLocal y Local que las usan son los tres de captura",
    triggersDeCosto[0].n, ["Local_costo_version", "ProductoBase_costo_version", "ProductoLocal_costo_version"]);
  ok("y los tres son AFTER: no pueden cambiar la fila que se escribe", triggersDeCosto[0].todosAfter === true);

  for (const sentencia of CAPTURA) await c.$executeRawUnsafe(sentencia);
  const capturas = (desde) =>
    c.$queryRawUnsafe(
      `SELECT "tabla","op","fila","costo"::float AS "costo","origen","referencia","txid"::text AS "txid"
       FROM "PruebaCapturaOrigenCosto" WHERE "id" > $1 ORDER BY "id"`,
      desde
    );
  const marcaDeCaptura = async () =>
    (await c.$queryRawUnsafe(`SELECT coalesce(max("id"),0)::int AS m FROM "PruebaCapturaOrigenCosto"`))[0].m;

  // ── Siembra mínima, con la forma de `frenoDeCosto.mjs` ──────────────────
  const rol = await c.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  const grupo = await c.grupo.create({ data: { nombre: `${marca}-grupo` } });
  const deposito = await c.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const localA = await c.local.create({ data: { nombre: `${marca}-A` } });
  const localC = await c.local.create({ data: { nombre: `${marca}-C` } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: localC.id } });
  const usuario = await c.usuario.create({
    data: { nombre: "CI Origen", email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: deposito.id },
  });
  const proveedor = await c.proveedor.create({ data: { nombre: `${marca}-proveedor` } });
  const sesion = jwt.sign(
    { id: usuario.id, nombre: "CI Origen", email: `${marca}@ci.local`, localId: deposito.id, permisos: PERMISOS },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );
  const baseDelDeposito = (nombre, costo) =>
    c.productoBase.create({
      data: {
        grupoId: grupo.id,
        nombre: `${marca}-${nombre}`,
        precio_costo: costo,
        precio_venta: costo * 2,
        proveedor_id: proveedor.id,
        creadoEnLocalId: deposito.id,
        unidad_medida: "unidad",
        modoCompraProveedor: "BULTO",
      },
    });

  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. El mecanismo, en una sola conexión");
  // ══════════════════════════════════════════════════════════════════════════
  const leer = async (db) =>
    (
      await db.$queryRawUnsafe(
        `SELECT current_setting($1, true) AS origen, current_setting($2, true) AS ref, current_setting($3, true) AS stock`,
        CONFIG_COSTO_ORIGEN,
        CONFIG_COSTO_ORIGEN_REF,
        CONFIG_STOCK_ORIGEN
      )
    )[0];
  const vacio = (v) => v === null || v === "";

  const adentro = await c.$transaction(async (tx) => {
    const declarado = await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.COMPRA_PROVEEDOR, referencia: 7 });
    return { declarado, ...(await leer(tx)) };
  });
  igual("adentro de la transacción se ve el origen y la referencia", [adentro.declarado, adentro.origen, adentro.ref], [
    true,
    ORIGEN_COSTO.COMPRA_PROVEEDOR,
    "7",
  ]);
  ok("declarar el costo no declara el stock", vacio(adentro.stock), json(adentro.stock));

  const despuesDelCommit = await leer(c);
  ok("después del commit, en la MISMA conexión, no queda nada", vacio(despuesDelCommit.origen) && vacio(despuesDelCommit.ref), json(despuesDelCommit));

  await c
    .$transaction(async (tx) => {
      await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.LISTA_PROVEEDOR_APLICAR, referencia: 9 });
      throw new Error("rollback a propósito");
    })
    .catch(() => {});
  const despuesDelRollback = await leer(c);
  ok("después de un rollback tampoco", vacio(despuesDelRollback.origen) && vacio(despuesDelRollback.ref), json(despuesDelRollback));

  const reemplazo = await c.$transaction(async (tx) => {
    await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.COMPRA_PROVEEDOR, referencia: 1 });
    await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.ALTA_PRODUCTO });
    return leer(tx);
  });
  igual("declarar de nuevo reemplaza, y la referencia no se hereda", [reemplazo.origen, reemplazo.ref], [ORIGEN_COSTO.ALTA_PRODUCTO, ""]);

  // Una declaración mal hecha no frena: la escritura pasa y queda SIN_ORIGEN.
  const avisos = [];
  const warnOriginal = console.warn;
  console.warn = (...a) => avisos.push(a.join(" "));
  let raiz;
  try {
    raiz = await declararOrigenDeCosto(c, { origen: ORIGEN_COSTO.COMPRA_PROVEEDOR });
  } finally {
    console.warn = warnOriginal;
  }
  igual("con el cliente raíz no lanza: devuelve false y avisa", [raiz, avisos.length], [false, 1]);

  const malo = await baseDelDeposito("mal-declarado", 100);
  let m0 = await marcaDeCaptura();
  console.warn = () => {};
  try {
    await c.$transaction(async (tx) => {
      const r = await declararOrigenDeCosto(tx, { origen: "INVENTADO" });
      await tx.productoBase.update({ where: { id: malo.id }, data: { precio_costo: 101 } });
      return r;
    });
    await c.$transaction(async (tx) => {
      await declararOrigenDeCosto(tx, { origen: SIN_ORIGEN_COSTO });
      await tx.productoBase.update({ where: { id: malo.id }, data: { precio_costo: 102 } });
    });
  } finally {
    console.warn = warnOriginal;
  }
  const malos = await capturas(m0);
  igual("un origen fuera del contrato o reservado no frena la escritura: queda SIN_ORIGEN", malos.map((x) => [x.costo, x.origen]), [
    [101, SIN_ORIGEN_COSTO],
    [102, SIN_ORIGEN_COSTO],
  ]);
  const escrito = await c.productoBase.findUnique({ where: { id: malo.id }, select: { precio_costo: true } });
  igual("y el costo quedó escrito", Number(escrito.precio_costo), 102);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. La misma escritura, con y sin declaración, deja la misma fila");
  // ══════════════════════════════════════════════════════════════════════════
  const gemeloCon = await baseDelDeposito("gemelo-con", 500);
  const gemeloSin = await baseDelDeposito("gemelo-sin", 500);
  await c.$transaction(async (tx) => {
    await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.ACTUALIZACION_MASIVA_PRECIOS });
    await tx.productoBase.update({ where: { id: gemeloCon.id }, data: { precio_costo: 1234.5, precio_venta: 2469 } });
  });
  await c.$transaction(async (tx) => {
    await tx.productoBase.update({ where: { id: gemeloSin.id }, data: { precio_costo: 1234.5, precio_venta: 2469 } });
  });
  const sinIdentidad = ({ id, nombre, createdAt, updatedAt, ...resto }) => resto;
  const [filaCon, filaSin] = await Promise.all([
    c.productoBase.findUnique({ where: { id: gemeloCon.id } }),
    c.productoBase.findUnique({ where: { id: gemeloSin.id } }),
  ]);
  igual("las dos filas son idénticas salvo identidad", sinIdentidad(filaCon), sinIdentidad(filaSin));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. Escritores reales");
  // ══════════════════════════════════════════════════════════════════════════
  // El cliente de la app se construye al importarse: recién ahora, contra la
  // base descartable.
  //
  // Con DOS conexiones, no con una. La auditoría de la app
  // (`lib/auditoria/interceptor`) lee con el cliente base, FUERA de la
  // transacción interactiva: con una sola conexión esa lectura espera a la
  // transacción que la contiene, y el cierre de la compra vence a los 5 s con
  // P2028. Medido: pasó así, antes de subir el límite. La garantía de "misma
  // conexión" es la de la sección A, con el cliente de la fábrica; acá lo que
  // se prueba es el camino real.
  process.env.DATABASE_URL = (() => {
    const u = new URL(urlPrueba);
    u.searchParams.set("connection_limit", "2");
    return u.toString();
  })();
  const app = (await import("../../lib/prisma.js")).default;
  const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
  const { inheritDepositoProductsToLocal } = await import("../../lib/grupos.js");
  const { crearTransferencia, DESCONTAR_Y_TRANSITO } = await import("../../lib/transferencias/crearTransferencia.js");

  // C1. El cierre de una compra, por el handler: el caso D de frenoDeCosto
  // (UNIDAD 1.000 → 1.050, dentro de la variación), con el producto también en
  // el local A para ver la propagación.
  const compra = await baseDelDeposito("compra", 1000);
  const plDeposito = await c.productoLocal.create({
    data: { localId: deposito.id, baseId: compra.id, precio_costo: 1000, precio_venta: 2000 },
  });
  const plA = await c.productoLocal.create({
    data: { localId: localA.id, baseId: compra.id, precio_costo: 1000, precio_venta: 2000 },
  });
  const pedido = await c.pedidoProveedor.create({
    data: {
      grupoId: grupo.id,
      depositoId: deposito.id,
      creadoEnLocalId: deposito.id,
      proveedorId: proveedor.id,
      estado: "ENVIADO",
      detalles: { create: [{ productoLocalId: plDeposito.id, cantidad: 2, unidad: "UNIDAD", precioCosto: 1050 }] },
    },
    include: { detalles: { select: { id: true } } },
  });
  const detId = pedido.detalles[0].id;
  const movAntes = (await c.$queryRawUnsafe(`SELECT coalesce(max("id"),0)::int AS m FROM "MovimientoStock"`))[0].m;
  m0 = await marcaDeCaptura();
  const r = await rutaRecibir.POST(
    new Request(`http://ci/api/compras-proveedor/recibir/${pedido.id}`, {
      method: "POST",
      headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
      body: JSON.stringify({
        recibidos: { [detId]: 2 },
        pagoAlProveedor: {
          estado: "PAGADA",
          totalAPagar: "1000",
          totalConfirmado: true,
          pago: { medio: "TRANSFERENCIA", localOrigenId: deposito.id },
        },
      }),
    }),
    { params: Promise.resolve({ id: String(pedido.id) }) }
  );
  const cuerpo = await r.json().catch(() => ({}));
  ok("C1: el cierre contesta 200", r.status === 200 && cuerpo.ok, `${r.status} ${cuerpo.error || ""}`);
  const [bC, dC, aC] = await Promise.all([
    c.productoBase.findUnique({ where: { id: compra.id }, select: { precio_costo: true } }),
    c.productoLocal.findUnique({ where: { id: plDeposito.id }, select: { precio_costo: true } }),
    c.productoLocal.findUnique({ where: { id: plA.id }, select: { precio_costo: true } }),
  ]);
  igual(
    "C1: base, depósito y local A quedan en 1.050 — la propagación intacta",
    [Number(bC.precio_costo), Number(dC.precio_costo), Number(aC.precio_costo)],
    [1050, 1050, 1050]
  );
  const deLaCompra = await capturas(m0);
  const filasDeLaCompra = deLaCompra.filter(
    (x) => (x.tabla === "ProductoBase" && x.fila === compra.id) || (x.tabla === "ProductoLocal" && [plDeposito.id, plA.id].includes(x.fila))
  );
  igual(
    "C1: las tres escrituras de costo llegan con COMPRA_PROVEEDOR y el id del pedido",
    filasDeLaCompra.map((x) => [x.tabla, x.costo, x.origen, x.referencia]),
    [
      ["ProductoBase", 1050, ORIGEN_COSTO.COMPRA_PROVEEDOR, String(pedido.id)],
      ["ProductoLocal", 1050, ORIGEN_COSTO.COMPRA_PROVEEDOR, String(pedido.id)],
      ["ProductoLocal", 1050, ORIGEN_COSTO.COMPRA_PROVEEDOR, String(pedido.id)],
    ]
  );

  // D. El libro físico: el stock que movió el cierre no tiene origen de stock
  // —ningún escritor lo declara todavía— y el de costo no se le pegó.
  const movs = await c.$queryRawUnsafe(
    `SELECT "origen" FROM "MovimientoStock" WHERE "id" > $1 AND "productoLocalId" = $2`,
    movAntes,
    plDeposito.id
  );
  ok(
    "D: el cierre movió stock y el libro físico lo registra SIN_ORIGEN, como antes",
    movs.length > 0 && movs.every((x) => x.origen === SIN_ORIGEN_STOCK),
    json(movs)
  );

  // C2. La operación siguiente, por el mismo cliente de la app —una conexión—,
  // no hereda el origen de la compra.
  m0 = await marcaDeCaptura();
  await app.productoBase.update({ where: { id: compra.id }, data: { precio_costo: 1060 } });
  igual("C2: la escritura siguiente llega SIN_ORIGEN", (await capturas(m0)).map((x) => [x.origen, x.referencia]), [
    [SIN_ORIGEN_COSTO, ""],
  ]);

  // C3. La herencia del depósito al local C: el ProductoLocal nuevo.
  m0 = await marcaDeCaptura();
  await app.$transaction((tx) => inheritDepositoProductsToLocal(tx, grupo.id, localC.id), { timeout: 60000 });
  const heredados = (await capturas(m0)).filter((x) => x.tabla === "ProductoLocal");
  const plsDeC = await c.productoLocal.findMany({ where: { localId: localC.id }, select: { id: true, baseId: true, precio_costo: true } });
  ok(
    "C3: la herencia crea los ProductoLocal de C y todos llegan con HERENCIA_DEL_DEPOSITO y el id de C",
    heredados.length === plsDeC.length &&
      heredados.length > 0 &&
      heredados.every((x) => x.origen === ORIGEN_COSTO.HERENCIA_DEL_DEPOSITO && x.referencia === String(localC.id)),
    json(heredados)
  );
  const heredadoCompra = plsDeC.find((p) => p.baseId === compra.id);
  igual("C3: y con el costo de la base, como siempre", Number(heredadoCompra?.precio_costo), 1060);

  // C4. El envío de una transferencia a un local que no tiene el producto: el
  // upsert crea su ProductoLocal. Items con la forma de `pos-transferencias/enviar`.
  const enviado = await baseDelDeposito("enviado", 700);
  const plEnviadoDep = await c.productoLocal.create({
    data: { localId: deposito.id, baseId: enviado.id, precio_costo: 700, precio_venta: 1400 },
    include: { base: true },
  });
  await c.stockLocal.create({ data: { localId: deposito.id, productoId: plEnviadoDep.id, cantidad: 10 } });
  m0 = await marcaDeCaptura();
  await app.$transaction((tx) =>
    crearTransferencia({
      tx,
      origenId: deposito.id,
      destinoId: localA.id,
      creadoPorId: usuario.id,
      politicaStockOrigen: DESCONTAR_Y_TRANSITO,
      items: [
        {
          baseId: enviado.id,
          productoLocalOrigenId: plEnviadoDep.id,
          cantidad: 2,
          unidadEnviada: "UNIDAD",
          factorPack: 1,
          productoLocalOrigen: plEnviadoDep,
        },
      ],
    })
  );
  const plEnviadoA = await c.productoLocal.findUnique({
    where: { localId_baseId: { localId: localA.id, baseId: enviado.id } },
    select: { id: true, precio_costo: true },
  });
  igual(
    "C4: el alta del destino llega con ALTA_POR_TRANSFERENCIA_ENVIO",
    (await capturas(m0)).map((x) => [x.tabla, x.fila, x.costo, x.origen]),
    [["ProductoLocal", plEnviadoA?.id, 700, ORIGEN_COSTO.ALTA_POR_TRANSFERENCIA_ENVIO]]
  );

  m0 = await marcaDeCaptura();
  await app.productoLocal.update({ where: { id: plEnviadoA.id }, data: { precio_costo: 710 } });
  igual("C4: y la siguiente vuelve a llegar SIN_ORIGEN", (await capturas(m0)).map((x) => x.origen), [SIN_ORIGEN_COSTO]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Bajas: eliminar producto");
  // ══════════════════════════════════════════════════════════════════════════
  const rutaEliminar = await import("../../app/api/productos/eliminar/[id]/route.js");
  const sesionEliminar = jwt.sign(
    { id: usuario.id, nombre: "CI Origen", email: `${marca}@ci.local`, localId: deposito.id, permisos: ["productos.eliminar"] },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );
  const eliminar = async (baseId) => {
    const res = await rutaEliminar.DELETE(
      new Request(`http://ci/api/productos/eliminar/${baseId}`, {
        method: "DELETE",
        headers: { cookie: `erpazul_sesion=${sesionEliminar}` },
      }),
      { params: Promise.resolve({ id: String(baseId) }) }
    );
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  // Un producto en el depósito y en A, con stock, sin historial: se puede borrar.
  const conFilas = async (nombre) => {
    const b = await baseDelDeposito(nombre, 300);
    const pls = [];
    for (const localId of [deposito.id, localA.id]) {
      const pl = await c.productoLocal.create({ data: { localId, baseId: b.id, precio_costo: 300, precio_venta: 600 } });
      await c.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: 4 } });
      pls.push(pl.id);
    }
    return { baseId: b.id, pls };
  };
  const totales = async () => ({ bases: await c.productoBase.count(), filas: await c.productoLocal.count() });
  const bajas = (filas) => filas.filter((x) => x.op === "DELETE");

  const declarado = await conFilas("eliminado-declarado");
  const antesE = await totales();
  m0 = await marcaDeCaptura();
  const rE = await eliminar(declarado.baseId);
  ok("E: la ruta contesta 200", rE.status === 200 && rE.ok, `${rE.status} ${rE.error || ""}`);
  const capE = bajas(await capturas(m0));
  igual(
    "E: las dos filas y la base llegan con ELIMINACION_PRODUCTO y el id de la base",
    capE.map((x) => [x.tabla, x.fila, x.origen, x.referencia]),
    [
      ["ProductoLocal", declarado.pls[0], ORIGEN_COSTO.ELIMINACION_PRODUCTO, String(declarado.baseId)],
      ["ProductoLocal", declarado.pls[1], ORIGEN_COSTO.ELIMINACION_PRODUCTO, String(declarado.baseId)],
      ["ProductoBase", declarado.baseId, ORIGEN_COSTO.ELIMINACION_PRODUCTO, String(declarado.baseId)],
    ]
  );
  ok("E: las tres bajas son de la MISMA transacción", new Set(capE.map((x) => x.txid)).size === 1, json(capE.map((x) => x.txid)));
  const despuesE = await totales();
  igual("E: se borraron exactamente esas dos filas y esa base, nada más", [antesE.bases - despuesE.bases, antesE.filas - despuesE.filas], [1, 2]);

  // La misma baja, con las mismas sentencias y sin declarar: sigue siendo
  // posible, queda SIN_ORIGEN y borra lo mismo.
  const sinDeclarar = await conFilas("eliminado-sin-declarar");
  const antesSD = await totales();
  m0 = await marcaDeCaptura();
  await app.$transaction(async (tx) => {
    await tx.stockLocal.deleteMany({ where: { productoId: { in: sinDeclarar.pls } } });
    await tx.productoLocal.deleteMany({ where: { baseId: sinDeclarar.baseId } });
    await tx.productoBase.delete({ where: { id: sinDeclarar.baseId } });
  });
  const capSD = bajas(await capturas(m0));
  igual(
    "E: sin declarar, la baja pasa igual y queda SIN_ORIGEN",
    capSD.map((x) => [x.tabla, x.origen]),
    [
      ["ProductoLocal", SIN_ORIGEN_COSTO],
      ["ProductoLocal", SIN_ORIGEN_COSTO],
      ["ProductoBase", SIN_ORIGEN_COSTO],
    ]
  );
  const despuesSD = await totales();
  igual(
    "E: declarar no cambia qué se borra: la misma forma con y sin origen",
    [antesSD.bases - despuesSD.bases, antesSD.filas - despuesSD.filas],
    [antesE.bases - despuesE.bases, antesE.filas - despuesE.filas]
  );

  // Las reglas de siempre: un producto con historial de transferencias no se borra.
  m0 = await marcaDeCaptura();
  const rHist = await eliminar(enviado.id);
  ok("E: un producto con historial sigue rechazándose con 400", rHist.status === 400, `${rHist.status} ${rHist.error || ""}`);
  ok(
    "E: y no se borra ni se captura nada",
    (await capturas(m0)).length === 0 && (await c.productoBase.count({ where: { id: enviado.id } })) === 1
  );

  m0 = await marcaDeCaptura();
  await app.productoBase.update({ where: { id: compra.id }, data: { precio_costo: 1070 } });
  igual("E: la operación siguiente llega SIN_ORIGEN", (await capturas(m0)).map((x) => x.origen), [SIN_ORIGEN_COSTO]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Bajas: reset operativo");
  // ══════════════════════════════════════════════════════════════════════════
  // Va último: borra todos los productos de la base descartable.
  const bcrypt = (await import("bcrypt")).default;
  const clave = `clave-${marca}`;
  const admin = await c.usuario.create({
    data: { nombre: "CI Admin", email: `${marca}-admin@ci.local`, passwordHash: await bcrypt.hash(clave, 4), rolId: rol.id },
  });
  const sesionAdmin = jwt.sign(
    { id: admin.id, nombre: "CI Admin", email: `${marca}-admin@ci.local`, permisos: ["*"] },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );
  const rutaReset = await import("../../app/api/admin/reset-operativo/route.js");
  const antesF = await totales();
  ok("F: hay productos y filas para borrar", antesF.bases > 0 && antesF.filas > 0, json(antesF));

  // El reset escribe su respaldo en `backups/` bajo el directorio de trabajo:
  // se lo corre desde un directorio temporal para no dejarlo en el repo.
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const resetear = async () => {
    const cwd = process.cwd();
    const temporal = await fs.mkdtemp(path.join(os.tmpdir(), "reset-operativo-"));
    process.chdir(temporal);
    try {
      const res = await rutaReset.POST(
        new Request("http://ci/api/admin/reset-operativo", {
          method: "POST",
          headers: { cookie: `erpazul_sesion=${sesionAdmin}`, "content-type": "application/json" },
          body: JSON.stringify({ password: clave, frase: "REINICIAR TODO", confirmado: true }),
        })
      );
      return { status: res.status, ...(await res.json().catch(() => ({}))) };
    } finally {
      process.chdir(cwd);
      await fs.rm(temporal, { recursive: true, force: true });
    }
  };

  // ── LO QUE YA HACÍA, Y SIGUE HACIENDO ──────────────────────────────────
  //
  // El cierre de C1 dejó una cuenta por pagar y un pago. El plan del reset
  // borra PedidoProveedor pero no CuentaPorPagarProveedor, así que la clave lo
  // rechaza y la transacción entera se revierte: 500, nada borrado. Es previo a
  // esta PR —el plan no cambió— y se afirma para ver que, con el origen
  // declarado, un reset que falla sigue sin dejar nada.
  m0 = await marcaDeCaptura();
  const rFalla = await resetear();
  ok("F: con una cuenta por pagar el reset se sigue rechazando, como antes (500)", rFalla.status === 500, `${rFalla.status}`);
  igual("F: y no borra ni captura nada: la transacción se revierte entera", [await totales(), (await capturas(m0)).length], [antesF, 0]);

  // Sin las filas de finanzas que dejó el fixture —fuera del plan del reset—,
  // el reset corre.
  await c.pagoProveedor.deleteMany({ where: { cuenta: { pedidoProveedorId: pedido.id } } });
  await c.cuentaPorPagarProveedor.deleteMany({ where: { pedidoProveedorId: pedido.id } });

  m0 = await marcaDeCaptura();
  const rF = await resetear();
  ok("F: el reset contesta 200", rF.status === 200 && rF.ok, `${rF.status} ${rF.error || ""}`);
  const capF = bajas(await capturas(m0));
  igual(
    "F: una baja capturada por cada fila y cada base que había",
    [capF.filter((x) => x.tabla === "ProductoBase").length, capF.filter((x) => x.tabla === "ProductoLocal").length],
    [antesF.bases, antesF.filas]
  );
  ok(
    "F: todas llegan con RESET_OPERATIVO y el id del administrador",
    capF.length > 0 && capF.every((x) => x.origen === ORIGEN_COSTO.RESET_OPERATIVO && x.referencia === String(admin.id)),
    json([...new Set(capF.map((x) => `${x.origen}/${x.referencia}`))])
  );
  ok("F: todas en la MISMA transacción", new Set(capF.map((x) => x.txid)).size === 1, json([...new Set(capF.map((x) => x.txid))]));
  igual("F: no quedó ningún producto", await totales(), { bases: 0, filas: 0 });

  m0 = await marcaDeCaptura();
  await app.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-despues-del-reset`, precio_costo: 50, precio_venta: 100, unidad_medida: "unidad" },
  });
  igual("F: lo que se crea después llega SIN_ORIGEN", (await capturas(m0)).map((x) => [x.op, x.origen]), [["INSERT", SIN_ORIGEN_COSTO]]);
  await app.$disconnect();
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  await c?.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
