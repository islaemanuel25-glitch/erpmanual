// PRUEBA DE BASE: EL CONTROL DE STOCK, POR SUS RUTAS REALES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/controlStock.mjs
//
// Llama a los HANDLERS de `/api/stock_locales/control/*` con sesiones firmadas
// como las firma el login —el dueño sin PIN, una cuenta de encargado con una
// operadora activa por PIN— contra PostgreSQL:
//
//   1. permisos y PIN: sin el permiso, 403; con el permiso y sin PIN, 428;
//   2. abrir: uno solo por local;
//   3. el primer conteo fija el stock en lo contado; el segundo, de otra persona,
//      avisa "Ya contado por…" y suma;
//   4. corregir y borrar lo propio mueven el stock por la diferencia, y lo ajeno
//      no se puede tocar;
//   5. terminar: los que nadie contó se parten en vendidos durante el control
//      (no se tocan) y los que quedan en cero; una lista vieja se rechaza;
//   6. cada cambio quedó en el Libro como AJUSTE_POR_CONTROL con el id del
//      control, y en AuditoriaStock con su controlStockId;
//   7. con el control terminado no se cuenta más.
//
// Lo escrito directo es catálogo y stock inicial, como los dejan Productos y una
// recepción, y la VENTA de un producto: se escribe con el origen VENTA declarado,
// que es exactamente lo que la caja deja en el Libro. El conteo, la corrección y
// el terminar van todos por sus rutas.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { writeFileSync } from "node:fs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, DUENO_LOCAL } = await import("../../lib/rbac/systemRoles.js");
const { declararOrigenDeStock, ORIGEN_STOCK } = await import("../../lib/stock/libro/libroStock.js");

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
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

const NOMBRE = "erpazul_control_stock";
const urlDe = (nombre) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${nombre}`;
  u.search = "";
  return u.toString();
};
const urlPrueba = urlDe(NOMBRE);
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-control-stock-0123456789abcdef";

// La forma real que leen los candados de pantalla
// (`components/stock_locales/control/controlStock.render.test.mjs`): las
// respuestas tal cual las devuelven las rutas. Se escriben solo a pedido.
const lectura = {};
const guardar = (clave, r) => {
  const { status, ...cuerpo } = r;
  lectura[clave] = cuerpo;
};

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  // Hasta ANTES de la de permisos: los roles se crean como los tiene una
  // instalación que ya corre —sin los dos permisos nuevos— y después se aplica
  // esa migración, que es la que tiene que dárselos al dueño.
  const MIGRACION_PERMISOS = "20261020120100_permisos_control_stock_dueno_local";
  aplicarMigraciones(urlPrueba, { hasta: MIGRACION_PERMISOS });
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });
  const sinLosNuevos = (l) => l.filter((p) => !p.startsWith("stock.control."));
  await c.rol.create({ data: { nombre: "DUEÑO_LOCAL", esSistema: true, permisos: sinLosNuevos(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]) } });
  await c.rol.create({ data: { nombre: "ENCARGADO", esSistema: true, permisos: sinLosNuevos(DEFAULT_PERMISOS_SISTEMA[ENCARGADO]) } });
  aplicarMigraciones(urlPrueba, { solo: [MIGRACION_PERMISOS] });
  const rolEncargado = await c.rol.findUnique({ where: { nombre: "ENCARGADO" } });
  ok("al ENCARGADO no le agregó nada", !rolEncargado.permisos.some((p) => p.startsWith("stock.control.")), json(rolEncargado.permisos));

  // ── Siembra: un grupo con un local ──────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo control" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const mini = await c.local.create({ data: { nombre: "Mini el 7" } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: mini.id } });
  await c.configuracionLocal.create({ data: { localId: mini.id } });

  const rolDueno = await c.rol.findUnique({ where: { nombre: "DUEÑO_LOCAL" } });
  ok(
    "la migración le dio los dos permisos al DUEÑO_LOCAL que ya existía",
    Array.isArray(rolDueno?.permisos) && rolDueno.permisos.includes("stock.control.gestionar") && rolDueno.permisos.includes("stock.control.contar"),
    json(rolDueno?.permisos)
  );
  const rolEnc = await c.rol.findUnique({ where: { nombre: "ENCARGADO" } });
  const dueno = await c.usuario.create({ data: { nombre: "Emanuel", email: "dueno@ci.local", passwordHash: "x", rolId: rolDueno.id, localId: mini.id } });
  const cuenta = await c.usuario.create({ data: { nombre: "Cuenta Mini", email: "cuenta@ci.local", passwordHash: "x", rolId: rolEnc.id, localId: mini.id } });
  const ana = await c.operadorLocal.create({ data: { nombre: "Ana", pinHash: "x", localId: mini.id } });

  const ficha = (nombre, codigo_barra, unidad_medida = "unidad", extra = {}) =>
    c.productoBase.create({
      data: { grupoId: grupo.id, creadoEnLocalId: mini.id, nombre, codigo_barra, unidad_medida, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, ...extra },
    });
  const producto = async (nombre, codigo, stock, unidad = "unidad", extra = {}) => {
    const b = await ficha(nombre, codigo, unidad, extra);
    const pl = await c.productoLocal.create({ data: { localId: mini.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
    const sl = stock === null ? null : await c.stockLocal.create({ data: { localId: mini.id, productoId: pl.id, cantidad: stock } });
    return { base: b.id, pl: pl.id, sl: sl?.id ?? null };
  };
  const P = {
    coca: await producto("Coca 2L", "7790000000001", 5), //            contada: había 5, se cuentan 3 + 4
    queso: await producto("Queso por kg", "7790000000002", 2.5, "kg"), // contada en kg, corregida y borrada
    yerba: await producto("Yerba 1kg", "7790000000003", 12), //        nadie la cuenta, se vende: no se toca
    galletas: await producto("Galletas", "7790000000004", -15), //     nadie, negativa: queda en 0
    fideos: await producto("Fideos", "7790000000005", 4), //           nadie: queda en 0
    vacio: await producto("Sin stock", "7790000000006", 0), //         en cero: no entra a ningún lado
    nuevo: await producto("Sin fila", "7790000000007", null), //        sin StockLocal: el conteo crea la fila
    combo: await producto("Combo desayuno", "7790000000008", null, "unidad", { es_combo: true }),
    inactivo: await producto("Discontinuado", "7790000000009", 7, "unidad", { activo: false }),
  };
  const stockDe = async (p) => Number((await c.stockLocal.findFirst({ where: { localId: mini.id, productoId: p.pl } }))?.cantidad ?? NaN);

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const R = {
    estado: await import("../../app/api/stock_locales/control/route.js"),
    abrir: await import("../../app/api/stock_locales/control/abrir/route.js"),
    producto: await import("../../app/api/stock_locales/control/producto/route.js"),
    conteos: await import("../../app/api/stock_locales/control/conteos/route.js"),
    conteo: await import("../../app/api/stock_locales/control/conteos/[id]/route.js"),
    terminar: await import("../../app/api/stock_locales/control/terminar/route.js"),
    buscar: await import("../../app/api/stock_locales/buscar-producto/route.js"),
  };

  const sesion = (u, permisos, esDuenoLocal) =>
    `erpazul_sesion=${jwt.sign(
      { id: u.id, nombre: u.nombre, email: u.email, rolId: u.rolId, rolNombre: null, permisos, esDuenoLocal, localId: mini.id, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  const pin = (op) =>
    `erpazul_operador_activo=${jwt.sign({ operadorId: op.id, nombre: op.nombre, localId: mini.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
  const permisosEnc = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  const S = {
    dueno: sesion(dueno, DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], true),
    encargadoSinPermiso: sesion(cuenta, permisosEnc, false),
    cuentaSinPin: sesion(cuenta, [...permisosEnc, "stock.control.contar"], false),
    ana: `${sesion(cuenta, [...permisosEnc, "stock.control.contar"], false)}; ${pin(ana)}`,
  };

  const pedir = async (ruta, metodo, url, cookie, body = undefined, params = undefined) => {
    const req = new Request(url, {
      method: metodo,
      headers: { cookie, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta[metodo](req, params ? { params: Promise.resolve(params) } : undefined);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const B = "http://ci/api/stock_locales/control";
  const estado = (s) => pedir(R.estado, "GET", B, s);
  const contar = (s, p, cantidad) => pedir(R.conteos, "POST", `${B}/conteos`, s, { productoLocalId: p.pl, cantidad });

  seccion("1. Permisos y PIN");
  {
    const r = await estado(S.encargadoSinPermiso);
    ok("sin ningún permiso del control: 403", r.status === 403, json(r));
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.ana);
    ok("contar no alcanza para abrir: 403", a.status === 403, json(a));
    const e = await estado(S.cuentaSinPin);
    ok("la cuenta compartida sin PIN igual ve el estado", e.status === 200 && e.control === null, json(e));
  }

  seccion("2. Abrir");
  {
    const vacio = await estado(S.dueno);
    ok("sin control: control null y sin último terminado", vacio.status === 200 && vacio.control === null && vacio.ultimo === null, json(vacio));
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    ok("el dueño, sin PIN, lo abre", a.status === 200 && a.control?.id > 0, json(a));
    const otra = await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    ok("un segundo abierto en el mismo local: 409", otra.status === 409, json(otra));
    const e = await estado(S.dueno);
    // Universo: coca, queso, yerba, galletas, fideos. No: el de cero, el sin fila,
    // el combo ni el inactivo.
    ok("arranca con 0 contados y 5 sin contar", e.control?.contados === 0 && e.control?.sinContar === 5, json(e.control));
  }
  const controlId = (await c.controlStock.findFirst({ where: { localId: mini.id, estado: "ABIERTO" } })).id;

  seccion("3. Contar: el primero fija, el siguiente suma");
  let conteoDueno = null;
  {
    const sinPin = await contar(S.cuentaSinPin, P.coca, 1);
    ok("con el permiso pero sin PIN: 428", sinPin.status === 428 && sinPin.needsOperador === true, json(sinPin));
    const r = await contar(S.dueno, P.coca, 3);
    conteoDueno = r.conteo?.id;
    ok("el primer conteo fija: había 5, contó 3 → 3", r.status === 200 && r.conteo?.fijo === true && (await stockDe(P.coca)) === 3, json(r));
    const p = await pedir(R.producto, "GET", `${B}/producto?productoLocalId=${P.coca.pl}`, S.ana);
    guardar("productoConAviso", p);
    ok("a Ana le avisa quién lo contó y cuánto", p.status === 200 && p.aviso === "Ya contado por Emanuel: 3 un · Lo tuyo se suma", json(p));
    const pd = await pedir(R.producto, "GET", `${B}/producto?productoLocalId=${P.coca.pl}`, S.dueno);
    ok("al que lo contó no le avisa", pd.status === 200 && pd.aviso === null, json(pd));
    const r2 = await contar(S.ana, P.coca, 4);
    ok("el de Ana suma: 3 + 4 → 7", r2.status === 200 && r2.conteo?.fijo === false && (await stockDe(P.coca)) === 7, json(r2));
    const conteoAna = await c.conteoControlStock.findUnique({ where: { id: r2.conteo.id } });
    ok("el conteo de Ana guarda su operador y su nombre", conteoAna.operadorId === ana.id && conteoAna.contadoPor === "Ana" && conteoAna.usuarioId === cuenta.id, json(conteoAna));

    const kg = await contar(S.dueno, P.queso, 1.25);
    ok("el queso se cuenta en kg, con decimales", kg.status === 200 && (await stockDe(P.queso)) === 1.25, json(kg));
    const pq = await pedir(R.producto, "GET", `${B}/producto?productoLocalId=${P.queso.pl}`, S.dueno);
    ok("y su unidad es kg", pq.producto?.unidad === "kg" && pq.producto?.admiteDecimales === true, json(pq));
    const sinFila = await contar(S.ana, P.nuevo, 2);
    ok("un producto sin fila de stock: la crea y queda en lo contado", sinFila.status === 200 && (await stockDe(P.nuevo)) === 2, json(sinFila));
    const combo = await contar(S.dueno, P.combo, 1);
    ok("un combo no se cuenta: 400", combo.status === 400, json(combo));
    const neg = await contar(S.dueno, P.fideos, -1);
    ok("una cantidad negativa: 400, y no movió nada", neg.status === 400 && (await stockDe(P.fideos)) === 4, json(neg));

    const e = await estado(S.ana);
    guardar("abierto", e);
    ok("3 contados (coca, queso, sin fila) y 3 sin contar", e.control?.contados === 3 && e.control?.sinContar === 3, json(e.control));
    const porNombre = Object.fromEntries((e.control?.personas || []).map((p) => [p.nombre, p.productos]));
    ok("quién está contando: Emanuel 2 productos, Ana 2", porNombre.Emanuel === 2 && porNombre.Ana === 2, json(e.control?.personas));
    ok("lo que contó Ana: sus dos conteos, el último primero", e.misConteos?.length === 2 && e.misConteos[0].nombre === "Sin fila", json(e.misConteos));
  }

  seccion("4. Corregir y borrar lo propio");
  {
    const ajeno = await pedir(R.conteo, "PATCH", `${B}/conteos/${conteoDueno}`, S.ana, { cantidad: 10 }, { id: String(conteoDueno) });
    ok("Ana no puede corregir el conteo de Emanuel: 403", ajeno.status === 403 && (await stockDe(P.coca)) === 7, json(ajeno));
    const cor = await pedir(R.conteo, "PATCH", `${B}/conteos/${conteoDueno}`, S.dueno, { cantidad: 5 }, { id: String(conteoDueno) });
    ok("Emanuel corrige 3 → 5: el stock sube 2 (7 → 9)", cor.status === 200 && (await stockDe(P.coca)) === 9, json(cor));
    const kgId = (await c.conteoControlStock.findFirst({ where: { productoLocalId: P.queso.pl } })).id;
    const bor = await pedir(R.conteo, "DELETE", `${B}/conteos/${kgId}`, S.dueno, undefined, { id: String(kgId) });
    ok("borrar el del queso le resta lo contado: 1,25 → 0", bor.status === 200 && (await stockDe(P.queso)) === 0, json(bor));
    const fila = await c.conteoControlStock.findUnique({ where: { id: kgId } });
    ok("el conteo borrado queda marcado, no desaparece", fila.borradoEn !== null, json(fila));
    const otraVez = await pedir(R.conteo, "DELETE", `${B}/conteos/${kgId}`, S.dueno, undefined, { id: String(kgId) });
    ok("borrarlo dos veces: 404, y el stock no se mueve de nuevo", otraVez.status === 404 && (await stockDe(P.queso)) === 0, json(otraVez));
  }

  seccion("5. Terminar");
  {
    // La yerba se vende durante el control: lo que la caja escribe en el Libro.
    await c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.VENTA, referencia: "9001" });
      await tx.stockLocal.update({ where: { id: P.yerba.sl }, data: { cantidad: 10 } });
    });
    const t = await pedir(R.terminar, "GET", `${B}/terminar`, S.dueno);
    guardar("terminar", t);
    const ids = (l) => (l || []).map((p) => p.productoLocalId).sort((a, b) => a - b);
    ok("la yerba va a 'se vendieron', con 2 vendidas y 10 en el sistema", t.status === 200 && json(ids(t.vendidos)) === json([P.yerba.pl]) && t.vendidos[0].vendidas === 2 && t.vendidos[0].stock === 10, json(t.vendidos));
    // El queso: su único conteo se borró y quedó en cero, así que no está en ninguna lista.
    ok("quedan en 0: galletas (−15) y fideos (4)", json(ids(t.aCero)) === json([P.galletas.pl, P.fideos.pl].sort((a, b) => a - b)), json(t.aCero));
    const sinTerminar = await pedir(R.terminar, "POST", `${B}/terminar`, S.ana, { productos: ids(t.aCero) });
    ok("Ana cuenta pero no termina: 403", sinTerminar.status === 403, json(sinTerminar));
    const vieja = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: [P.galletas.pl] });
    ok("con una lista que no tiene a todos: 409 y no toca nada", vieja.status === 409 && vieja.cambioLaLista === true && (await stockDe(P.fideos)) === 4, json(vieja));
    const fin = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero) });
    ok("terminar pone 2 en cero", fin.status === 200 && fin.puestosEnCero === 2, json(fin));
    ok("galletas y fideos en 0; la yerba sigue en 10; la coca en 9", (await stockDe(P.galletas)) === 0 && (await stockDe(P.fideos)) === 0 && (await stockDe(P.yerba)) === 10 && (await stockDe(P.coca)) === 9);
    ok("el inactivo no se tocó", (await stockDe(P.inactivo)) === 7);
    const e = await estado(S.dueno);
    guardar("terminado", e);
    ok("sin control abierto, el último terminado dice quién y cuántos", e.control === null && e.ultimo?.terminadoPorNombre === "Emanuel" && e.ultimo?.puestosEnCero === 2, json(e.ultimo));
  }

  seccion("6. El Libro y la bitácora de stock");
  {
    const movs = await c.movimientoStock.findMany({ where: { localId: mini.id, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL } });
    ok("cada movimiento del control nombra al control", movs.length > 0 && movs.every((m) => m.origenRef === String(controlId)), json(movs.map((m) => m.origenRef)));
    const deCoca = movs.filter((m) => m.productoLocalId === P.coca.pl).map((m) => [Number(m.cantidadAnterior), Number(m.cantidadPosterior)]);
    ok("la coca: 5 → 3, 3 → 7, 7 → 9", json(deCoca) === json([[5, 3], [3, 7], [7, 9]]), json(deCoca));
    const altaSinFila = movs.find((m) => m.productoLocalId === P.nuevo.pl && m.tipo === "ALTA");
    ok("la fila creada por el conteo también es del control", Boolean(altaSinFila), json(movs.filter((m) => m.productoLocalId === P.nuevo.pl)));
    const ceros = movs.filter((m) => [P.galletas.pl, P.fideos.pl].includes(m.productoLocalId)).map((m) => Number(m.cantidadPosterior));
    ok("los dos puestos en cero, en el Libro", json(ceros) === json([0, 0]), json(ceros));
    const aud = await c.auditoriaStock.findMany({ where: { controlStockId: controlId }, orderBy: { id: "asc" } });
    const acciones = aud.map((a) => a.accion);
    ok(
      "la bitácora de stock: 4 conteos, 1 corrección, 1 borrado, 2 en cero",
      acciones.filter((a) => a === "CONTROL_CONTEO").length === 4 &&
        acciones.filter((a) => a === "CONTROL_CORRECCION").length === 1 &&
        acciones.filter((a) => a === "CONTROL_BORRADO").length === 1 &&
        acciones.filter((a) => a === "CONTROL_PUESTO_EN_CERO").length === 2,
      json(acciones)
    );
    ok("y todas dicen 'Ajuste por control #id'", aud.every((a) => a.motivo === `Ajuste por control #${controlId}`), json(aud.map((a) => a.motivo)));
    const vendida = await c.movimientoStock.count({ where: { productoLocalId: P.yerba.pl, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL } });
    ok("la yerba vendida no tiene ningún ajuste del control", vendida === 0);
  }

  seccion("7. Terminado, no se cuenta más");
  {
    const r = await contar(S.dueno, P.fideos, 3);
    ok("contar con el control terminado: 409, y no mueve el stock", r.status === 409 && (await stockDe(P.fideos)) === 0, json(r));
    const cor = await pedir(R.conteo, "PATCH", `${B}/conteos/${conteoDueno}`, S.dueno, { cantidad: 1 }, { id: String(conteoDueno) });
    ok("corregir con el control terminado: 409", cor.status === 409 && (await stockDe(P.coca)) === 9, json(cor));
    const nuevo = await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    ok("se puede abrir uno nuevo", nuevo.status === 200);
  }

  seccion("8. El buscador de Stock, con el permiso de contar");
  {
    const url = `http://ci/api/stock_locales/buscar-producto?q=7790000000001&localId=${mini.id}`;
    const r = await pedir(R.buscar, "GET", url, S.ana);
    ok("Ana encuentra la coca por el código", r.status === 200 && r.items?.[0]?.productoLocalId === P.coca.pl, json(r));
    const sin = await pedir(R.buscar, "GET", url, sesion(cuenta, ["pos.usar"], false));
    ok("sin stock.ver ni contar: 403", sin.status === 403, json(sin));
  }

  if (process.env.ESCRIBIR_FIXTURE_CONTROL) {
    writeFileSync("components/stock_locales/control/lecturaReal.fixture.json", `${JSON.stringify(lectura, null, 2)}\n`);
    console.log("  · fixture escrito");
  }
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  if (c) await c.$disconnect().catch(() => {});
  try {
    const { default: prismaApp } = await import("../../lib/prisma.js");
    await prismaApp.$disconnect();
  } catch {
    // la app no llegó a construir su cliente
  }
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
