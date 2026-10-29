// PRUEBA DE BASE: EL CONTROL DE STOCK, POR SUS RUTAS REALES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/controlStock.mjs
//
// Llama a los HANDLERS de `/api/stock_locales/control/*` con sesiones firmadas
// como las firma el login —el dueño sin PIN, una cuenta de encargado con una
// operadora activa por PIN, el Admin en el depósito— contra PostgreSQL:
//
//   1. permisos y PIN: sin el permiso, 403; con PIN no se empieza ni termina;
//   2. abrir: uno solo por local;
//   3. el campo es el TOTAL: aceptarlo lo mide contra el stock VIVO y deja el
//      stock en lo contado, sea el primero o un recuento —aunque sea el mismo
//      número, y con lo vendido en el medio—; la diferencia es la suma de los
//      ajustes, y borrarlo los deshace; la tarjeta dice el total, quién lo tocó
//      último y el sistema; "Está bien" guarda el stock del sistema y con el
//      sistema en negativo se rechaza;
//   4. la lista es la de Stock Locales (`/api/stock_locales/listar?control=`):
//      Todos / Sin contar / Contados / Con diferencia, el texto, y el lector que
//      trae un producto aunque el filtro lo oculte; los contadores;
//   5. el depósito: la tarjeta de un pack es la de Stock, el total se guarda en
//      unidades y la plata sale del costo por bulto;
//   6. terminar: los que nadie contó se parten en vendidos durante el control
//      (no se tocan) y los que quedan en cero; una lista vieja se rechaza; las
//      diferencias, vivas antes y congeladas después: una venta o un costo
//      nuevo no las cambian; sin `costos.ver`, sin plata;
//   7. cada cambio quedó en el Libro como AJUSTE_POR_CONTROL con el id del
//      control, y en AuditoriaStock con su controlStockId;
//   8. con el control terminado no se cuenta más.
//
// Lo escrito directo es catálogo y stock inicial, como los dejan Productos y una
// recepción, y la VENTA de un producto: se escribe con el origen VENTA declarado,
// que es exactamente lo que la caja deja en el Libro. El conteo y el terminar van
// todos por sus rutas.
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
// (`components/stock_locales/control/controlStock.test.mjs`): las respuestas tal
// cual las devuelven las rutas. Se escriben solo a pedido.
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
  // instalación que ya corre —sin los dos permisos nuevos— y después se aplican
  // esas migraciones, que son las que tienen que dárselos.
  const MIGRACIONES_PERMISOS = [
    "20261020120100_permisos_control_stock_dueno_local",
    "20261020180000_permisos_control_stock_encargado",
  ];
  aplicarMigraciones(urlPrueba, { hasta: MIGRACIONES_PERMISOS[0] });
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });
  const sinLosNuevos = (l) => l.filter((p) => !p.startsWith("stock.control."));
  await c.rol.create({ data: { nombre: "DUEÑO_LOCAL", esSistema: true, permisos: sinLosNuevos(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]) } });
  await c.rol.create({ data: { nombre: "ENCARGADO", esSistema: true, permisos: sinLosNuevos(DEFAULT_PERMISOS_SISTEMA[ENCARGADO]) } });
  await c.rol.create({ data: { nombre: "CAJERO", esSistema: true, permisos: DEFAULT_PERMISOS_SISTEMA.CAJERO } });
  const rolAdmin = await c.rol.create({ data: { nombre: "Admin", esSistema: true, permisos: ["*"] } });
  aplicarMigraciones(urlPrueba, { solo: MIGRACIONES_PERMISOS });
  // Y las que vienen después: el informe de diferencias, y el stock al contar.
  aplicarMigraciones(urlPrueba, {
    solo: [
      "20261020200000_control_stock_diferencias",
      "20261020210000_control_stock_decision_no_contados",
      "20261022180000_control_stock_sistema_al_contar",
      // Los máximos por categoría de "Stock alto".
      "20261029120000_maximo_stock_por_categoria",
    ],
  });
  const rolEncargado = await c.rol.findUnique({ where: { nombre: "ENCARGADO" } });
  ok(
    "la migración le dio los dos permisos al ENCARGADO que ya existía",
    rolEncargado.permisos.includes("stock.control.gestionar") && rolEncargado.permisos.includes("stock.control.contar"),
    json(rolEncargado.permisos)
  );
  const rolCajero = await c.rol.findUnique({ where: { nombre: "CAJERO" } });
  ok("al CAJERO no le agregó nada", !rolCajero.permisos.some((p) => p.startsWith("stock.control.")), json(rolCajero.permisos));
  aplicarMigraciones(urlPrueba, { solo: MIGRACIONES_PERMISOS });
  const otraVez = await c.rol.findUnique({ where: { nombre: "ENCARGADO" } });
  ok("correrlas dos veces no duplica", otraVez.permisos.filter((p) => p.startsWith("stock.control.")).length === 2, json(otraVez.permisos));

  // ── Siembra: un grupo con un depósito y un local ────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo control" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const mini = await c.local.create({ data: { nombre: "Mini el 7" } });
  const depo = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: mini.id } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: depo.id } });
  for (const l of [mini, depo]) await c.configuracionLocal.create({ data: { localId: l.id } });

  const rolDueno = await c.rol.findUnique({ where: { nombre: "DUEÑO_LOCAL" } });
  ok(
    "la migración le dio los dos permisos al DUEÑO_LOCAL que ya existía",
    Array.isArray(rolDueno?.permisos) && rolDueno.permisos.includes("stock.control.gestionar") && rolDueno.permisos.includes("stock.control.contar"),
    json(rolDueno?.permisos)
  );
  const rolEnc = await c.rol.findUnique({ where: { nombre: "ENCARGADO" } });
  const dueno = await c.usuario.create({ data: { nombre: "Emanuel", email: "dueno@ci.local", passwordHash: "x", rolId: rolDueno.id, localId: mini.id } });
  const cuenta = await c.usuario.create({ data: { nombre: "Cuenta Mini", email: "cuenta@ci.local", passwordHash: "x", rolId: rolEnc.id, localId: mini.id } });
  const admin = await c.usuario.create({ data: { nombre: "Admin Depo", email: "admin@ci.local", passwordHash: "x", rolId: rolAdmin.id, localId: depo.id } });
  const ana = await c.operadorLocal.create({ data: { nombre: "Ana", pinHash: "x", localId: mini.id } });
  const proveedor = await c.proveedor.create({ data: { nombre: "Coca-Cola FEMSA", creadoEnLocalId: mini.id } });

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
    // Con categoría: el selector "Categoría" de la pantalla cuenta por ella.
    coca: await producto("Coca 2L", "7790000000001", 5, "unidad", { proveedor_id: proveedor.id, categoria_id: (await c.categoria.create({ data: { nombre: "Bebidas" } })).id }),
    queso: await producto("Queso por kg", "7790000000002", 2.5, "kg"),
    yerba: await producto("Yerba 1kg", "7790000000003", 12), //        nadie la cuenta, se vende: no se toca
    galletas: await producto("Galletas", "7790000000004", -15), //     nadie, negativa: queda en 0
    fideos: await producto("Fideos", "7790000000005", 4), //           nadie: queda en 0
    vacio: await producto("Sin stock", "7790000000006", 0), //         en cero: no está en "Sin contar"
    nuevo: await producto("Sin fila", "7790000000007", null), //        sin StockLocal: el conteo crea la fila
    combo: await producto("Combo desayuno", "7790000000008", null, "unidad", { es_combo: true }),
    inactivo: await producto("Discontinuado", "7790000000009", 7, "unidad", { activo: false }),
    aceite: await producto("Aceite 900", "7790000000011", 3), //        "Está bien": queda en 3
  };
  const stockDe = async (p, localId = mini.id) => Number((await c.stockLocal.findFirst({ where: { localId, productoId: p.pl } }))?.cantidad ?? NaN);
  const vender = (p, queda) =>
    c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.VENTA, referencia: "9001" });
      await tx.stockLocal.update({ where: { id: p.sl }, data: { cantidad: queda } });
    });

  // El depósito: un pack de 6 de una ficha del depósito, con su fila.
  const bPack = await c.productoBase.create({
    data: { grupoId: grupo.id, nombre: "Agua x6", codigo_barra: "7790000000010", unidad_medida: "pack", factor_pack: 6, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
  });
  const plPack = await c.productoLocal.create({ data: { localId: depo.id, baseId: bPack.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
  await c.stockLocal.create({ data: { localId: depo.id, productoId: plPack.id, cantidad: 40 } });
  const PACK = { pl: plPack.id };
  // Uno del depósito con su fila desde ANTES de abrir el control: en la sección
  // 13 se cuenta con "Está bien" de la versión anterior y no tiene ningún
  // movimiento en el Libro desde que se abrió.
  const bQuieto = await c.productoBase.create({
    data: { grupoId: grupo.id, nombre: "Quieto sin Libro", codigo_barra: "8000000000301", unidad_medida: "unidad", factor_pack: 1, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
  });
  const plQuieto = await c.productoLocal.create({ data: { localId: depo.id, baseId: bQuieto.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
  const slQuieto = await c.stockLocal.create({ data: { localId: depo.id, productoId: plQuieto.id, cantidad: 7 } });
  const QUIETO = { pl: plQuieto.id, sl: slQuieto.id };

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const R = {
    estado: await import("../../app/api/stock_locales/control/route.js"),
    abrir: await import("../../app/api/stock_locales/control/abrir/route.js"),
    productos: await import("../../app/api/stock_locales/control/productos/route.js"),
    conteos: await import("../../app/api/stock_locales/control/conteos/route.js"),
    terminar: await import("../../app/api/stock_locales/control/terminar/route.js"),
    diferencias: await import("../../app/api/stock_locales/control/diferencias/route.js"),
    revision: await import("../../app/api/stock_locales/control/revision/route.js"),
    listar: await import("../../app/api/stock_locales/listar/route.js"),
    maximos: await import("../../app/api/stock_locales/control/maximos/route.js"),
  };

  const sesion = (u, permisos, esDuenoLocal, localId = mini.id, esDeposito = false) =>
    `erpazul_sesion=${jwt.sign(
      { id: u.id, nombre: u.nombre, email: u.email, rolId: u.rolId, rolNombre: null, permisos, esDuenoLocal, localId, esDeposito },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  const pin = (op) =>
    `erpazul_operador_activo=${jwt.sign({ operadorId: op.id, nombre: op.nombre, localId: mini.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
  const permisosEnc = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  const S = {
    dueno: sesion(dueno, DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], true),
    // Con su PIN puesto en la cuenta del dueño: cuenta, pero no gestiona.
    duenoConPin: `${sesion(dueno, DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], true)}; ${pin(ana)}`,
    adminConPin: `${sesion(dueno, ["*"], false)}; ${pin(ana)}`,
    encargadoSinPermiso: sesion(cuenta, sinLosNuevos(permisosEnc), false),
    // La cuenta del encargado, sin PIN: gestiona, pero para contar pide el PIN.
    cuentaSinPin: sesion(cuenta, permisosEnc, false),
    ana: `${sesion(cuenta, permisosEnc, false)}; ${pin(ana)}`,
    adminDepo: sesion(admin, ["*"], false, depo.id, true),
  };

  const pedir = async (ruta, metodo, url, cookie, body = undefined) => {
    const req = new Request(url, {
      method: metodo,
      headers: { cookie, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta[metodo](req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const B = "http://ci/api/stock_locales/control";
  const estado = (s) => pedir(R.estado, "GET", B, s);
  const fijar = (s, p, total) => pedir(R.conteos, "PUT", `${B}/conteos`, s, { productoLocalId: p.pl, total });
  const estaBien = (s, p) => pedir(R.conteos, "PUT", `${B}/conteos`, s, { productoLocalId: p.pl, estaBien: true });
  // La lista del control ES la de Stock Locales, con el chip en `control`.
  const lista = (s, chip = "todos", qs = "") => pedir(R.listar, "GET", `http://ci/api/stock_locales/listar?control=${chip}${qs ? `&${qs}` : ""}`, s);
  const escanear = (s, qs) => pedir(R.productos, "GET", `${B}/productos?${qs}`, s);
  const diferencias = (s, id = null) => pedir(R.diferencias, "GET", `${B}/diferencias${id ? `?controlId=${id}` : ""}`, s);
  const resumenDif = (d) => (d.filas || []).filter((f) => f.diferencia !== 0).map((f) => [f.nombre, f.diferencia, f.importe]);
  const ids = (l) => (l || []).map((p) => p.id ?? p.productoLocalId).sort((a, b) => a - b);
  const auditoriasDe = (p) => c.auditoriaStock.count({ where: { productoLocalId: p.pl, controlStockId: { not: null } } });

  seccion("1. Permisos y PIN");
  {
    const r = await estado(S.encargadoSinPermiso);
    ok("sin ningún permiso del control: 403", r.status === 403, json(r));
    for (const [quien, s] of [["Ana con PIN", S.ana], ["el dueño con PIN", S.duenoConPin], ["el Admin con PIN", S.adminConPin]]) {
      const a = await pedir(R.abrir, "POST", `${B}/abrir`, s);
      ok(`${quien} no puede empezar: 403 y dice por qué`, a.status === 403 && /empezar o terminar el control lo hace la cuenta sin PIN/.test(a.error || ""), json(a));
    }
    ok("y no se abrió nada", (await c.controlStock.count()) === 0);
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
    // El universo es el de Stock Locales: coca, queso, yerba, galletas, fideos,
    // el de cero, el sin fila y el aceite. No: el combo ni el inactivo.
    ok("arranca con 0 contados de 8, los del listado de Stock", e.control?.contados === 0 && e.control?.total === 8 && e.control?.sinContar === 8, json(e.control));
  }
  const controlId = (await c.controlStock.findFirst({ where: { localId: mini.id, estado: "ABIERTO" } })).id;

  seccion("3. El campo es el total");
  {
    const sinPin = await fijar(S.cuentaSinPin, P.coca, 1);
    ok("con el permiso pero sin PIN: 428", sinPin.status === 428 && sinPin.needsOperador === true, json(sinPin));
    const r = await fijar(S.dueno, P.coca, 3);
    ok("el primer total fija: había 5, contó 3 → 3", r.status === 200 && (await stockDe(P.coca)) === 3, json(r));
    ok("y la tarjeta que vuelve dice el stock nuevo, el total y quién", r.item?.stock === 3 && r.item?.conteo?.total === 3 && r.item?.conteo?.contadoPor === "Emanuel", json(r.item));
    ok("y los contadores: 1 contado y 7 sin contar", r.resumen?.contados === 1 && r.resumen?.sinContar === 7, json(r.resumen));
    ok("el sistema es el stock vivo al contar: 5, y faltan 2", r.item?.conteo?.sistema === 5 && r.item?.conteo?.diferencia === -2, json(r.item?.conteo));
    const primera = await c.conteoControlStock.findFirst({ where: { controlId, productoLocalId: P.coca.pl, borradoEn: null } });
    ok("y el conteo guarda en su fila el stock del sistema al contar: 5", Number(primera?.sistemaAlContar) === 5, json(primera));
    const visto = await escanear(S.ana, "codigo=7790000000001");
    guardar("cocaContadaPorOtro", visto);
    ok("Ana escanea la coca: la ve ya contada por Emanuel, con el total", visto.item?.conteo?.total === 3 && visto.item?.conteo?.contadoPor === "Emanuel", json(visto));
    const r2 = await fijar(S.ana, P.coca, 7);
    ok("Ana la vuelve a contar en 7: el stock pasa a 7 (3 → 7)", r2.status === 200 && (await stockDe(P.coca)) === 7, json(r2));
    ok("y la tarjeta queda a nombre de Ana", r2.item?.conteo?.contadoPor === "Ana" && r2.item?.conteo?.total === 7, json(r2.item?.conteo));
    ok(
      "la diferencia es la suma de los dos ajustes (−2 + 4): sobran 2, y el sistema sin el control sigue 5",
      r2.item?.conteo?.sistema === 5 && r2.item?.conteo?.diferencia === 2,
      json(r2.item?.conteo)
    );
    const fila = await c.conteoControlStock.findFirst({ where: { controlId, productoLocalId: P.coca.pl, borradoEn: null } });
    ok("la fila del recuento guarda el stock vivo con que se midió: 3", Number(fila?.sistemaAlContar) === 3 && Number(fila?.sistemaAntes) === 5, json(fila));
    const filas = await c.conteoControlStock.findMany({ where: { controlId, productoLocalId: P.coca.pl }, orderBy: { id: "asc" } });
    ok("la historia queda: el total de Emanuel borrado, el de Ana vigente", filas.length === 2 && filas[0].borradoEn !== null && filas[1].borradoEn === null && filas[1].operadorId === ana.id, json(filas));
    const antes = await auditoriasDe(P.coca);
    guardar("listaAntesDelRecuento", await lista(S.ana, "contados", "q=Coca"));
    const igual = await fijar(S.ana, P.coca, 7);
    guardar("recuentoIgualDeLaCoca", igual);
    ok(
      "volver a contar el mismo número sin ventas en el medio: el stock queda en 7, la diferencia no cambia y el recuento queda en la bitácora",
      igual.status === 200 && (await stockDe(P.coca)) === 7 && igual.item?.conteo?.diferencia === 2 && (await auditoriasDe(P.coca)) === antes + 1,
      json(igual)
    );
    await vender(P.coca, 6);
    const r3 = await fijar(S.ana, P.coca, 5);
    ok(
      "se vendió 1 (7 → 6) y se vuelve a contar 5: se mide contra los 6 de ahora, el stock queda en 5 —no en 4— y sobra 1",
      r3.status === 200 && (await stockDe(P.coca)) === 5 && r3.item?.conteo?.diferencia === 1 && r3.item?.conteo?.sistema === 4,
      json(r3)
    );
    const recuentos = await c.auditoriaStock.findMany({ where: { controlStockId: controlId, productoLocalId: P.coca.pl, accion: "CONTROL_RECUENTO" } });
    ok("los recuentos van a la bitácora como CONTROL_RECUENTO, a nombre de quien contó", recuentos.length === 3, json(recuentos.map((a) => a.accion)));
    guardar("listaContadosAntesDeBorrar", await lista(S.dueno, "contados"));
    const borrar = await fijar(S.dueno, P.coca, null);
    guardar("borradoDeLaCoca", borrar);
    ok(
      "borrar el campo deshace los ajustes del control: 5 menos la venta → 4, y vuelve a sin contar",
      borrar.status === 200 && (await stockDe(P.coca)) === 4 && borrar.item?.conteo === null && borrar.resumen?.contados === 0,
      json({ stock: await stockDe(P.coca), borrar })
    );
    const deNuevo = await fijar(S.dueno, P.coca, 2);
    ok("contarlo de nuevo vuelve a fijar: 4 → 2", deNuevo.status === 200 && (await stockDe(P.coca)) === 2, json(deNuevo));

    // Lo que ve la pantalla antes de escribir "1,25" en el queso, y lo que
    // contesta el guardado: el arnés de la tarjeta lo usa tal cual.
    guardar("listaAntesDelQueso", await lista(S.dueno, "sin_contar", "q=Queso"));
    const kg = await fijar(S.dueno, P.queso, 1.25);
    guardar("guardadoDelQueso", kg);
    ok("el queso se cuenta en kg, con decimales", kg.status === 200 && (await stockDe(P.queso)) === 1.25, json(kg));
    const sinFila = await fijar(S.ana, P.nuevo, 2);
    ok("un producto sin fila de stock: la crea y queda en el total", sinFila.status === 200 && (await stockDe(P.nuevo)) === 2, json(sinFila));
    const combo = await fijar(S.dueno, P.combo, 1);
    ok("un combo no se cuenta: 400", combo.status === 400, json(combo));
    const neg = await fijar(S.dueno, P.fideos, -1);
    ok("un total negativo: 400, y no movió nada", neg.status === 400 && (await stockDe(P.fideos)) === 4, json(neg));
    const borrarSinContar = await fijar(S.dueno, P.fideos, null);
    ok("borrar uno que nadie contó no hace nada", borrarSinContar.status === 200 && (await stockDe(P.fideos)) === 4 && (await auditoriasDe(P.fideos)) === 0, json(borrarSinContar));

    guardar("listaAntesDeEstaBien", await lista(S.ana, "sin_contar", "q=Aceite"));
    guardar("listaSinContarAntesDeEstaBien", await lista(S.ana, "sin_contar"));
    const bien = await estaBien(S.ana, P.aceite);
    guardar("estaBienDelAceite", bien);
    ok(
      "'Está bien' guarda el stock del sistema: el aceite queda en 3, contado 3, sin diferencia",
      bien.status === 200 && (await stockDe(P.aceite)) === 3 && bien.item?.conteo?.total === 3 && bien.item?.conteo?.diferencia === 0,
      json(bien)
    );
    const negativo = await estaBien(S.ana, P.galletas);
    ok(
      "'Está bien' con el sistema en negativo: 400, y las galletas siguen sin contar en −15",
      negativo.status === 400 && (await stockDe(P.galletas)) === -15 && (await auditoriasDe(P.galletas)) === 0,
      json(negativo)
    );
  }

  seccion("4. La lista es la de Stock Locales, con los chips y el lector");
  {
    const sinControl = await pedir(R.listar, "GET", "http://ci/api/stock_locales/listar", S.ana);
    const todos = await lista(S.ana);
    ok(
      "Todos es el MISMO listado de Stock: mismos productos y mismo orden, stock 0 incluido",
      todos.status === 200 && todos.total === 8 && json(todos.items?.map((i) => i.id)) === json(sinControl.items?.map((i) => i.id)),
      json({ control: todos.items?.map((i) => i.nombre), stock: sinControl.items?.map((i) => i.nombre) })
    );
    ok("y sin `control` el listado de Stock no trae conteos ni contadores", sinControl.resumenControl === undefined && sinControl.items?.every((i) => i.conteo === undefined), json(sinControl.items?.[0]));
    const sinContar = await lista(S.ana, "sin_contar");
    guardar("listaSinContar", sinContar);
    ok(
      "Sin contar: yerba, galletas, fideos y el de cero",
      json(ids(sinContar.items)) === json([P.yerba.pl, P.galletas.pl, P.fideos.pl, P.vacio.pl].sort((a, b) => a - b)),
      json(sinContar.items?.map((i) => i.nombre))
    );
    ok(
      "y los contadores: 4 contados de 8, 3 con diferencia",
      sinContar.resumenControl?.contados === 4 && sinContar.resumenControl?.sinContar === 4 && sinContar.resumenControl?.total === 8 && sinContar.resumenControl?.conDiferencia === 3,
      json(sinContar.resumenControl)
    );
    const contados = await lista(S.ana, "contados");
    guardar("listaContados", contados);
    ok(
      "Contados: coca, queso, el sin fila y el aceite",
      json(ids(contados.items)) === json([P.coca.pl, P.queso.pl, P.nuevo.pl, P.aceite.pl].sort((a, b) => a - b)),
      json(contados.items?.map((i) => i.nombre))
    );
    const conDif = await lista(S.ana, "con_diferencia");
    guardar("listaConDiferencia", conDif);
    ok(
      "Con diferencia: coca, queso y el sin fila —el aceite dio igual—",
      json(ids(conDif.items)) === json([P.coca.pl, P.queso.pl, P.nuevo.pl].sort((a, b) => a - b)),
      json(conDif.items?.map((i) => i.nombre))
    );
    const enNegativo = await lista(S.ana, "en_negativo");
    guardar("listaEnNegativo", enNegativo);
    ok(
      "En negativo: solo las galletas (−15), y el contador dice 1",
      json(ids(enNegativo.items)) === json([P.galletas.pl]) && enNegativo.resumenControl?.enNegativo === 1 && sinContar.resumenControl?.enNegativo === 1,
      json({ items: enNegativo.items?.map((i) => i.nombre), resumen: enNegativo.resumenControl })
    );
    const negativoConTexto = await lista(S.ana, "en_negativo", "q=coca");
    ok("En negativo respeta el buscador: con 'coca' no queda nada", negativoConTexto.items?.length === 0, json(negativoConTexto.items?.map((i) => i.nombre)));
    const coca = contados.items.find((i) => i.id === P.coca.pl);
    ok(
      "la tarjeta trae lo de Stock: proveedor, código, unidad y stock, y su conteo",
      coca?.proveedorId === proveedor.id && coca?.codigoBarra === "7790000000001" && coca?.unidadMedida === "unidad" && coca?.stock === 2 && coca?.conteo?.total === 2,
      json(coca)
    );
    const texto = await lista(S.ana, "sin_contar", "q=gall");
    ok("el texto filtra por nombre, con el chip encima", json(ids(texto.items)) === json([P.galletas.pl]), json(texto.items?.map((i) => i.nombre)));
    const escaneada = await escanear(S.ana, "codigo=7790000000006");
    ok("el lector trae 'Sin stock' aunque el filtro no lo muestre", escaneada.item?.id === P.vacio.pl, json(escaneada));
    const combo = await escanear(S.ana, "codigo=7790000000008");
    ok("el lector con un combo no trae nada: la pantalla filtra por el texto", combo.status === 200 && combo.item === null, json(combo));
    const nada = await escanear(S.ana, "");
    ok("sin código ni producto: 400", nada.status === 400, json(nada));

    // ── EL BUSCADOR DEL CONTROL ES EL DE LA CAJA ──────────────────────────
    const porCodigo = await lista(S.ana, "sin_contar", "q=7790000000001");
    guardar("listaPorCodigo", porCodigo);
    ok(
      "un código del local muestra SOLO ese producto, aunque el chip no lo incluya (la coca está contada)",
      json(ids(porCodigo.items)) === json([P.coca.pl]) && porCodigo.lecturaControl?.porCodigo === P.coca.pl && porCodigo.items[0].conteo?.total === 2,
      json({ items: porCodigo.items?.map((i) => i.nombre), lectura: porCodigo.lecturaControl })
    );
    const leidoSinProducto = await lista(S.ana, "todos", "q=9999999999999&lectura=1");
    guardar("listaCodigoSinProducto", leidoSinProducto);
    ok(
      "un código LEÍDO que no es de ningún producto del local: lista vacía y lo dice",
      leidoSinProducto.status === 200 && leidoSinProducto.items?.length === 0 && leidoSinProducto.lecturaControl?.codigoSinProducto === "9999999999999",
      json(leidoSinProducto)
    );
    const tecleado = await lista(S.ana, "todos", "q=9999999999999");
    ok("tecleado sin lector, se busca como texto: vacío y sin aviso", tecleado.items?.length === 0 && !tecleado.lecturaControl?.codigoSinProducto, json(tecleado.lecturaControl));
  }

  seccion("5. El depósito: un pack se cuenta en bultos y se guarda en unidades");
  {
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.adminDepo);
    ok("el Admin abre un control en el depósito", a.status === 200, json(a));
    const l = await lista(S.adminDepo, "sin_contar");
    guardar("listaDeposito", l);
    const agua = l.items?.find((i) => i.id === PACK.pl);
    ok("la tarjeta es la del depósito: pack de 6 y 40 unidades", agua?.unidadMedida === "pack" && agua?.factorPack === 6 && agua?.stock === 40, json(agua));
    // 4 bultos + 3 sueltas = 27: lo calcula la pantalla con `toUnidades`.
    const r = await pedir(R.conteos, "PUT", `${B}/conteos`, S.adminDepo, { productoLocalId: PACK.pl, total: 27 });
    ok("el total en unidades fija el stock del depósito: 27", r.status === 200 && (await stockDe(PACK, depo.id)) === 27, json(r));
    // El costo del pack es POR BULTO (600 el de 6): la unidad vale 100, como en
    // Valor del stock. Faltan 13 unidades: $1.300.
    const d = await diferencias(S.adminDepo);
    guardar("diferenciasDeposito", d);
    ok(
      "la plata del depósito sale del costo por bulto: faltan 13 un, $1.300",
      d.status === 200 && json(resumenDif(d)) === json([["Agua x6", -13, -1300]]) && d.totales?.faltante === 1300 && d.totales?.sobrante === 0,
      json(d)
    );
  }

  seccion("6. Terminar");
  {
    // La yerba se vende durante el control: lo que la caja escribe en el Libro.
    await vender(P.yerba, 10);
    const t = await pedir(R.terminar, "GET", `${B}/terminar`, S.dueno);
    guardar("terminar", t);
    ok("la yerba va a 'se vendieron', con 2 vendidas y 10 en el sistema", t.status === 200 && json(ids(t.vendidos)) === json([P.yerba.pl]) && t.vendidos[0].vendidas === 2 && t.vendidos[0].stock === 10, json(t.vendidos));
    ok("quedan en 0: galletas (−15) y fideos (4)", json(ids(t.aCero)) === json([P.galletas.pl, P.fideos.pl].sort((a, b) => a - b)), json(t.aCero));
    for (const [quien, s] of [["Ana con PIN", S.ana], ["el dueño con PIN", S.duenoConPin], ["el Admin con PIN", S.adminConPin]]) {
      const post = await pedir(R.terminar, "POST", `${B}/terminar`, s, { productos: ids(t.aCero), decision: "EN_CERO" });
      const get = await pedir(R.terminar, "GET", `${B}/terminar`, s);
      ok(`${quien} cuenta pero no termina: 403 en el POST y en la lista`, post.status === 403 && get.status === 403, json({ post, get }));
    }
    const conPin = await fijar(S.duenoConPin, P.vacio, 0);
    ok("con PIN en la cuenta del dueño sí cuenta, a nombre de la operadora", conPin.status === 200 && conPin.item?.conteo?.contadoPor === "Ana", json(conPin));

    // Las diferencias con el control abierto: se calculan ahora, a costo (600).
    // La coca se volvió a contar después de borrarla: su sistema de antes es el
    // 4 que había al contarla de nuevo.
    const vivo = await diferencias(S.dueno);
    guardar("diferenciasAbierto", vivo);
    ok(
      "las diferencias del abierto: faltan la coca (−2) y el queso (−1,25 kg); sobra el sin fila (+2)",
      vivo.status === 200 && vivo.congelado === false && vivo.conPlata === true &&
        json(resumenDif(vivo)) === json([["Coca 2L", -2, -1200], ["Queso por kg", -1.25, -750], ["Sin fila", 2, 1200]]),
      json(resumenDif(vivo))
    );
    ok("y los totales: faltante $1.950, sobrante $1.200, 3 productos", vivo.totales?.faltante === 1950 && vivo.totales?.sobrante === 1200 && vivo.totales?.productos === 3, json(vivo.totales));
    const sinPlata = await diferencias(S.ana);
    guardar("diferenciasSinPlata", sinPlata);
    ok(
      "el encargado, sin costos.ver, ve las cantidades y no la plata",
      sinPlata.status === 200 && sinPlata.conPlata === false && sinPlata.filas.every((f) => f.importe === null && f.costoUnitario === null) && sinPlata.totales?.faltante === null && sinPlata.totales?.productos === 3,
      json(sinPlata)
    );
    const sinPinCuenta = await pedir(R.terminar, "GET", `${B}/terminar`, S.cuentaSinPin);
    ok("la cuenta del encargado, sin PIN, sí ve la lista de terminar", sinPinCuenta.status === 200, json(sinPinCuenta));
    // La elección es explícita: sin ella, o con cualquier otra cosa, no se toca nada.
    for (const decision of [undefined, "", "TODO_EN_CERO"]) {
      const sinElegir = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero), ...(decision === undefined ? {} : { decision }) });
      const sigue = await c.controlStock.findUnique({ where: { id: controlId } });
      ok(
        `terminar sin elegir qué hacer con lo no contado (${json(decision)}): 400, y ni el control ni el stock se mueven`,
        sinElegir.status === 400 && /Falta elegir qué hacer/.test(sinElegir.error || "") && sigue.estado === "ABIERTO" && (await stockDe(P.fideos)) === 4 && (await stockDe(P.galletas)) === -15,
        json(sinElegir)
      );
    }
    const vieja = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: [P.galletas.pl], decision: "EN_CERO" });
    ok("con una lista que no tiene a todos: 409 y no toca nada", vieja.status === 409 && vieja.cambioLaLista === true && (await stockDe(P.fideos)) === 4, json(vieja));
    const fin = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero), decision: "EN_CERO" });
    ok("terminar con 'Poner en 0' pone 2 en cero", fin.status === 200 && fin.puestosEnCero === 2 && fin.decision === "EN_CERO", json(fin));
    const registrado = await c.controlStock.findUnique({ where: { id: controlId } });
    ok("y queda registrado qué se eligió", registrado.noContadosDecision === "EN_CERO" && registrado.noContadosComoEstaban === null, json(registrado));
    ok("galletas y fideos en 0; la yerba sigue en 10; la coca en 2", (await stockDe(P.galletas)) === 0 && (await stockDe(P.fideos)) === 0 && (await stockDe(P.yerba)) === 10 && (await stockDe(P.coca)) === 2);
    ok("el inactivo no se tocó", (await stockDe(P.inactivo)) === 7);
    ok("terminar contesta el id del control, para abrir su informe", fin.controlId === controlId, json(fin));
    const e = await estado(S.dueno);
    guardar("terminado", e);
    ok("sin control abierto, el último terminado dice quién y cuántos", e.control === null && e.ultimo?.terminadoPorNombre === "Emanuel" && e.ultimo?.puestosEnCero === 2, json(e.ultimo));
    ok("y el historial lo tiene", json(e.historial?.map((h) => h.id)) === json([controlId]), json(e.historial));

    // El informe congelado: entran los puestos en cero —las galletas en −15
    // puestas en 0 SOBRAN 15—, en el orden de la plata que falta.
    const congelado = await diferencias(S.dueno, controlId);
    guardar("diferenciasCongeladas", congelado);
    const esperado = [
      ["Fideos", -4, -2400],
      ["Coca 2L", -2, -1200],
      ["Queso por kg", -1.25, -750],
      ["Galletas", 15, 9000],
      ["Sin fila", 2, 1200],
    ];
    ok("terminado, el informe se lee congelado, con los puestos en cero", congelado.status === 200 && congelado.congelado === true && json(resumenDif(congelado)) === json(esperado), json(resumenDif(congelado)));
    ok("los puestos en cero van marcados", congelado.filas.filter((f) => f.puestoEnCero).map((f) => f.nombre).sort().join() === "Fideos,Galletas", json(congelado.filas));
    ok("y los totales: faltante $4.350, sobrante $10.200, 5 productos", congelado.totales?.faltante === 4350 && congelado.totales?.sobrante === 10200 && congelado.totales?.productos === 5, json(congelado.totales));
    ok("se guardó en su tabla, una fila por producto revisado", (await c.diferenciaControlStock.count({ where: { controlId } })) >= 5);
    // Después de terminar se vende y cambia el costo: el informe no se mueve.
    await vender(P.coca, 1);
    await c.productoLocal.update({ where: { id: P.coca.pl }, data: { precio_costo: 9999 } });
    const otraVez = await diferencias(S.dueno, controlId);
    ok("una venta y un costo nuevo después de terminar no cambian el informe", json(otraVez.filas) === json(congelado.filas) && json(otraVez.totales) === json(congelado.totales), json(resumenDif(otraVez)));
    const ajeno = await diferencias(S.dueno, 999999);
    ok("el informe de un control que no es del local: 404", ajeno.status === 404, json(ajeno));
  }

  seccion("7. El Libro y la bitácora de stock");
  {
    const movs = await c.movimientoStock.findMany({ where: { localId: mini.id, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL }, orderBy: { id: "asc" } });
    ok("cada movimiento del control nombra al control", movs.length > 0 && movs.every((m) => m.origenRef === String(controlId)), json(movs.map((m) => m.origenRef)));
    const deCoca = movs.filter((m) => m.productoLocalId === P.coca.pl).map((m) => [Number(m.cantidadAnterior), Number(m.cantidadPosterior)]);
    // La venta (7 → 6) no es del control, y el recuento de 7 sobre 7 no movió
    // nada. Borrar deshace el +1 neto.
    ok("la coca: 5 → 3, 3 → 7, 6 → 5, el borrado 5 → 4 y al contarla de nuevo 4 → 2", json(deCoca) === json([[5, 3], [3, 7], [6, 5], [5, 4], [4, 2]]), json(deCoca));
    const altaSinFila = movs.find((m) => m.productoLocalId === P.nuevo.pl && m.tipo === "ALTA");
    ok("la fila creada por el conteo también es del control", Boolean(altaSinFila), json(movs.filter((m) => m.productoLocalId === P.nuevo.pl)));
    const ceros = movs.filter((m) => [P.galletas.pl, P.fideos.pl].includes(m.productoLocalId)).map((m) => Number(m.cantidadPosterior));
    ok("los dos puestos en cero, en el Libro", json(ceros) === json([0, 0]), json(ceros));
    const aud = await c.auditoriaStock.findMany({ where: { controlStockId: controlId, productoLocalId: P.coca.pl }, orderBy: { id: "asc" } });
    ok(
      "la bitácora de la coca: conteo, tres recuentos, el borrado y el conteo de nuevo",
      json(aud.map((a) => a.accion)) ===
        json(["CONTROL_CONTEO", "CONTROL_RECUENTO", "CONTROL_RECUENTO", "CONTROL_RECUENTO", "CONTROL_BORRADO", "CONTROL_CONTEO"]),
      json(aud.map((a) => a.accion))
    );
    const todas = await c.auditoriaStock.findMany({ where: { controlStockId: controlId } });
    ok("y todas dicen 'Ajuste por control #id'", todas.every((a) => a.motivo === `Ajuste por control #${controlId}`), json(todas.map((a) => a.motivo)));
    const vendida = await c.movimientoStock.count({ where: { productoLocalId: P.yerba.pl, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL } });
    ok("la yerba vendida no tiene ningún ajuste del control", vendida === 0);
  }

  seccion("8. Terminado, no se cuenta más");
  {
    const r = await fijar(S.dueno, P.fideos, 3);
    ok("fijar con el control terminado: 409, y no mueve el stock", r.status === 409 && (await stockDe(P.fideos)) === 0, json(r));
    const l = await lista(S.dueno);
    ok("la lista sin control es la de Stock, sin conteos ni contadores", l.status === 200 && l.resumenControl === null && l.items?.every((i) => i.conteo === undefined), json(l.resumenControl));
    const sinControl = await escanear(S.dueno, "codigo=7790000000001");
    ok("el lector sin control: 409", sinControl.status === 409, json(sinControl));
    // Y lo abre la cuenta del encargado, sin PIN: gestionar es de la cuenta.
    const nuevo = await pedir(R.abrir, "POST", `${B}/abrir`, S.cuentaSinPin);
    const abierto = nuevo.control ? await c.controlStock.findUnique({ where: { id: nuevo.control.id } }) : null;
    ok(
      "la cuenta del encargado, sin PIN, abre uno nuevo a su nombre",
      nuevo.status === 200 && abierto?.abiertoPorNombre === "Cuenta Mini" && abierto?.abiertoPorOperadorId === null,
      json({ nuevo, abierto })
    );
    const e = await estado(S.ana);
    guardar("abierto", e);
  }

  seccion("9. El ajuste va en el sentido del conteo (el caso de la LATA X24)");
  {
    // Lo que vio Emanuel en el depósito: un Pack x24 contado en 1 bulto, la
    // tarjeta "Sistema 0 · Contado 24 · Sobran 24" y el STOCK en −24. Acá se
    // recorre cada paso que mueve stock —primer conteo, subir, bajar, borrar,
    // volver a contar—, en un local y en el depósito con desglose, y en cada
    // uno se mira lo mismo por los tres lados: la fila de StockLocal, el
    // movimiento del Libro y la bitácora, y lo que dice la tarjeta.
    const ficha = async (localId, nombre, codigo, unidad, factor, stock) => {
      const b = await c.productoBase.create({
        data: { grupoId: grupo.id, nombre, codigo_barra: codigo, unidad_medida: unidad, factor_pack: factor, precio_costo: 2400, precio_venta: 3000, redondeo_100: false, activo: true },
      });
      const pl = await c.productoLocal.create({ data: { localId, baseId: b.id, activo: true, precio_costo: 2400, precio_venta: 3000 } });
      if (stock !== null) await c.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: stock } });
      return { pl: pl.id, localId };
    };
    const sesionDe = (p) => (p.localId === depo.id ? S.adminDepo : S.dueno);
    const paso = async (titulo, p, total, esperado) => {
      // Sin fila de stock el sistema dice 0, como la tarjeta.
      const antes = (await stockDe(p, p.localId)) || 0;
      const ultimoMov = (await c.movimientoStock.findFirst({ where: { productoLocalId: p.pl }, orderBy: { id: "desc" } }))?.id ?? 0;
      const ultimaAud = (await c.auditoriaStock.findFirst({ where: { productoLocalId: p.pl }, orderBy: { id: "desc" } }))?.id ?? 0;
      const r = await pedir(R.conteos, "PUT", `${B}/conteos`, sesionDe(p), { productoLocalId: p.pl, total });
      const despues = await stockDe(p, p.localId);
      const movs = await c.movimientoStock.findMany({ where: { productoLocalId: p.pl, id: { gt: ultimoMov } } });
      const auds = await c.auditoriaStock.findMany({ where: { productoLocalId: p.pl, id: { gt: ultimaAud } } });
      const enElLibro = movs.reduce((s, m) => s + Number(m.cantidadPosterior ?? 0) - Number(m.cantidadAnterior ?? 0), 0);
      const enLaBitacora = auds.reduce((s, a) => s + Number(a.cantidadNueva) - Number(a.cantidadAnterior), 0);
      ok(
        `${titulo}: ${antes} → ${esperado}, igual en el Libro, la bitácora y la tarjeta`,
        r.status === 200 && despues === esperado && enElLibro === esperado - antes && enLaBitacora === esperado - antes && r.item?.stock === esperado &&
          movs.every((m) => m.origen === ORIGEN_STOCK.AJUSTE_POR_CONTROL),
        json({ status: r.status, despues, enElLibro, enLaBitacora, tarjeta: r.item?.stock, conteo: r.item?.conteo })
      );
      return r;
    };

    // ── EL TEXTO SE BUSCA COMO EN LA CAJA, Y SALE EN SU ORDEN ──────────────
    //
    // "coco": por nombre, Bizcochos va antes que Coco; la caja pone primero lo
    // que EMPIEZA con lo buscado. El control sale como la caja; Stock Locales,
    // como siempre.
    await ficha(mini.id, "Bizcochos de coco", "8000000000201", "unidad", 1, 2);
    await ficha(mini.id, "Coco rallado", "8000000000202", "unidad", 1, 3);
    const porTexto = await lista(S.dueno, "todos", "q=coco");
    guardar("listaPorTexto", porTexto);
    const { rankearComoLaCaja, nombreDeBusqueda, SELECT_CANDIDATO_DE_BUSQUEDA } = await import("../../lib/productos/busquedaComoLaCaja.js");
    const { whereUniversoStock } = await import("../../lib/stock/universoStock.js");
    const comoLaCaja = rankearComoLaCaja(await c.productoLocal.findMany({ where: whereUniversoStock(mini.id, false), select: SELECT_CANDIDATO_DE_BUSQUEDA }), "coco").map((r) => nombreDeBusqueda(r.item));
    ok(
      "el control busca \"coco\" como la caja y en su orden: Coco rallado, después Bizcochos de coco",
      json(porTexto.items?.map((i) => i.nombre)) === json(comoLaCaja) && json(comoLaCaja) === json(["Coco rallado", "Bizcochos de coco"]),
      json({ control: porTexto.items?.map((i) => i.nombre), caja: comoLaCaja })
    );
    const enStock = await pedir(R.listar, "GET", "http://ci/api/stock_locales/listar?q=coco", S.dueno);
    ok("Stock Locales sigue como siempre: por nombre", json(enStock.items?.map((i) => i.nombre)) === json(["Bizcochos de coco", "Coco rallado"]), json(enStock.items?.map((i) => i.nombre)));

    // En un local, por unidad.
    const fanta = await ficha(mini.id, "Fanta 2L", "8000000000101", "unidad", 1, 5);
    await paso("local, primer conteo", fanta, 3, 3);
    await paso("local, sube el total", fanta, 8, 8);
    await paso("local, baja el total", fanta, 6, 6);
    await paso("local, borrar deshace", fanta, null, 5);
    await paso("local, contar de nuevo", fanta, 3, 3);

    // En el depósito, un Pack x24 SIN fila de stock: sistema 0, como la lata.
    const lata = await ficha(depo.id, "361 LATA X24", "8000000000102", "pack", 24, null);
    const primero = await paso("depósito, 1 bulto + 0 sueltas sobre 0", lata, 24, 24);
    ok(
      "la tarjeta dice Sistema 0 · Contado 24 · Sobran 24, y el stock 24 —no −24—",
      primero.item?.conteo?.sistema === 0 && primero.item?.conteo?.total === 24 && primero.item?.conteo?.diferencia === 24 && primero.item?.stock === 24,
      json(primero.item)
    );
    await paso("depósito, sube a 2 bultos", lata, 48, 48);
    await paso("depósito, baja a 1 bulto + 6", lata, 30, 30);
    await paso("depósito, borrar deshace", lata, null, 0);
    await paso("depósito, contar de nuevo 1 bulto", lata, 24, 24);
    const enLista = (await lista(S.adminDepo, "contados")).items?.find((i) => i.id === lata.pl);
    ok("y el listado de Stock dice lo mismo: 24", enLista?.stock === 24 && enLista?.conteo?.total === 24, json(enLista));

    // Con el sistema en negativo antes de contar.
    const neg = await ficha(depo.id, "Lata negativa x24", "8000000000103", "pack", 24, -24);
    const negAntes = await lista(S.adminDepo, "en_negativo");
    ok(
      "En negativo en el depósito: la lata en −24 está, y cuenta",
      negAntes.items?.some((i) => i.id === neg.pl) && negAntes.resumenControl?.enNegativo === negAntes.total,
      json({ items: negAntes.items?.map((i) => i.nombre), resumen: negAntes.resumenControl })
    );
    const contada = await paso("depósito, 1 bulto sobre −24", neg, 24, 24);
    guardar("contadaSaleDeNegativo", contada);
    const negDespues = await lista(S.adminDepo, "en_negativo");
    ok(
      "al aceptar 24 deja de ser negativa: sale de En negativo y el contador baja uno",
      !negDespues.items?.some((i) => i.id === neg.pl) &&
        contada.resumen?.enNegativo === negAntes.resumenControl.enNegativo - 1 &&
        negDespues.resumenControl?.enNegativo === negAntes.resumenControl.enNegativo - 1,
      json({ antes: negAntes.resumenControl?.enNegativo, guardado: contada.resumen?.enNegativo, despues: negDespues.resumenControl?.enNegativo })
    );
    // Este depósito no admite negativo (la configuración de siempre): deshacer
    // no puede volver a −24 y se queda en 0, igual que un Restar de Ajustar.
    await paso("depósito, borrar sobre un negativo que no se admite queda en 0", neg, null, 0);

    // Dos guardados del mismo total a la vez: la tarjeta de fa23d01 los mandaba
    // (Enter guarda, el foco va al buscador y el campo, al perderlo, guarda otra vez).
    const doble = await ficha(depo.id, "Lata doble x24", "8000000000104", "pack", 24, null);
    await Promise.all([1, 2].map(() => pedir(R.conteos, "PUT", `${B}/conteos`, S.adminDepo, { productoLocalId: doble.pl, total: 24 })));
    const dobleEnLista = (await lista(S.adminDepo, "contados")).items?.find((i) => i.id === doble.pl);
    ok(
      "dos guardados de 24 a la vez dejan 24: el segundo es un recuento que no mueve nada, y sobran 24 una sola vez",
      (await stockDe(doble, depo.id)) === 24 && (await auditoriasDe(doble)) === 2 && dobleEnLista?.conteo?.diferencia === 24,
      json(dobleEnLista?.conteo)
    );
    const mezcla = await ficha(depo.id, "Lata mezcla x24", "8000000000105", "pack", 24, 0);
    await Promise.all([24, null].map((t) => pedir(R.conteos, "PUT", `${B}/conteos`, S.adminDepo, { productoLocalId: mezcla.pl, total: t })));
    const quedo = await stockDe(mezcla, depo.id);
    const vigente = await c.conteoControlStock.findFirst({ where: { productoLocalId: mezcla.pl, borradoEn: null } });
    ok("guardar y borrar a la vez: el stock queda como dice el conteo vigente", (vigente ? quedo === 24 : quedo === 0), json({ quedo, vigente }));

    // Un control de la versión anterior: sus conteos no tienen `sistemaAntes`.
    const vieja = await ficha(depo.id, "Lata vieja x24", "8000000000106", "pack", 24, 0);
    await paso("versión anterior, primer conteo", vieja, 24, 24);
    await c.conteoControlStock.updateMany({ where: { productoLocalId: vieja.pl }, data: { sistemaAntes: null } });
    const sube = await paso("versión anterior, sube a 2 bultos", vieja, 48, 48);
    ok("y la tarjeta saca el sistema de la bitácora: 0", sube.item?.conteo?.sistema === 0 && sube.item?.conteo?.diferencia === 48, json(sube.item?.conteo));
    await paso("versión anterior, baja a 1 bulto", vieja, 24, 24);
    await paso("versión anterior, borrar deshace", vieja, null, 0);

    // ── LA FILA QUE SE LEE ES LA QUE SE ESCRIBE ────────────────────────────
    //
    // `StockLocal` es único por (local, producto), así que un producto del
    // depósito puede tener además una fila con OTRO local. El listado y la
    // tarjeta leían "una fila cualquiera" (`take: 1`) y el control escribe la
    // del depósito: con una de esas filas, la tarjeta podía mostrar un stock que
    // el control nunca tocó.
    const ajena = await ficha(depo.id, "Lata con fila ajena x24", "8000000000107", "pack", 24, null);
    await c.stockLocal.create({ data: { localId: mini.id, productoId: ajena.pl, cantidad: -24 } });
    const negDeOtro = await lista(S.adminDepo, "en_negativo");
    ok(
      "En negativo mira la fila del depósito: la −24 de otro local no la mete",
      negDeOtro.status === 200 && !negDeOtro.items?.some((i) => i.id === ajena.pl),
      json(negDeOtro.items?.map((i) => i.nombre))
    );
    const r = await pedir(R.conteos, "PUT", `${B}/conteos`, S.adminDepo, { productoLocalId: ajena.pl, total: 24 });
    const enListaAjena = (await lista(S.adminDepo, "contados")).items?.find((i) => i.id === ajena.pl);
    ok(
      "con otra fila del mismo producto en otro local, la tarjeta y el listado muestran la del depósito: 24",
      r.item?.stock === 24 && enListaAjena?.stock === 24 && (await stockDe(ajena, depo.id)) === 24,
      json({ tarjeta: r.item?.stock, listado: enListaAjena?.stock })
    );

    // ── LA REVISIÓN DEL CONTROL QUE CORRE LA SESIÓN DEL VPS ────────────────
    const revision = (s) => pedir(R.revision, "GET", `${B}/revision`, s);
    const reparar = (s, p) => pedir(R.revision, "POST", `${B}/revision`, s, { productoLocalId: p.pl });
    const depoControl = await c.controlStock.findFirst({ where: { localId: depo.id, estado: "ABIERTO" } });
    // Se vende 1 después de contar la lata: el stock bueno es 24 − 1.
    await c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.VENTA, referencia: "9002" });
      await tx.stockLocal.update({ where: { localId_productoId: { localId: depo.id, productoId: lata.pl } }, data: { cantidad: 23 } });
    });
    const sano = await revision(S.adminDepo);
    const deLaLata = sano.productos?.find((p) => p.productoLocalId === lata.pl);
    ok(
      "la revisión: contado 24, una venta posterior de −1, debería 23 y hay 23: nada que corregir",
      sano.status === 200 && deLaLata?.contado === 24 && deLaLata?.posteriores === -1 && deLaLata?.deberia === 23 && deLaLata?.actual === 23 && deLaLata?.corregir === false &&
        deLaLata?.movimientosPosteriores?.length === 1 && deLaLata.movimientosPosteriores[0].origen === ORIGEN_STOCK.VENTA,
      json(deLaLata)
    );
    ok("todo lo que el control movió hasta acá está bien: nada a corregir", sano.aCorregir === 0, json(sano.productos?.filter((p) => p.corregir)));
    const conPin = await revision(S.ana);
    ok("la revisión es de quien gestiona: con PIN, 403", conPin.status === 403, json(conPin));

    // El estado que vio Emanuel, armado en ESTA base descartable: el conteo de
    // 1 bulto (24) con un movimiento del control que dejó el stock al revés
    // (0 → −24), y su bitácora diciendo lo mismo. Ninguna ruta de hoy lo produce:
    // es el estado a corregir, no un caso de uso.
    const malo = await ficha(depo.id, "Lata al revés x24", "8000000000108", "pack", 24, 0);
    await c.$transaction(async (tx) => {
      await tx.conteoControlStock.create({
        data: { controlId: depoControl.id, localId: depo.id, productoLocalId: malo.pl, cantidad: 24, usuarioId: admin.id, operadorId: null, contadoPor: "Administrador", fijo: true, sistemaAntes: null },
      });
      await tx.auditoriaStock.create({
        data: { grupoId: grupo.id, localId: depo.id, productoLocalId: malo.pl, userId: admin.id, accion: "CONTROL_CONTEO", cantidadAnterior: 0, cantidadNueva: -24, motivo: `Ajuste por control #${depoControl.id}`, controlStockId: depoControl.id },
      });
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(depoControl.id) });
      await tx.stockLocal.update({ where: { localId_productoId: { localId: depo.id, productoId: malo.pl } }, data: { cantidad: -24 } });
    });
    const conElRoto = await revision(S.adminDepo);
    guardar("revisionConUnoRoto", conElRoto);
    const roto = conElRoto.productos?.find((p) => p.productoLocalId === malo.pl);
    ok(
      "la revisión lo encuentra primero: debería 24, hay −24, corregir +48",
      conElRoto.productos?.[0]?.productoLocalId === malo.pl && conElRoto.aCorregir === 1 && roto?.deberia === 24 && roto?.actual === -24 && roto?.corregir === true && roto?.ajuste === 48,
      json(roto)
    );
    const auditAntes = await c.auditoriaStock.count({ where: { productoLocalId: malo.pl } });
    // El conteo no se toca, salvo guardar el stock al contar, que no tenía.
    const sinSistemaAlContar = (filas) => json(filas.map(({ sistemaAlContar, actualizadoEn, ...resto }) => resto));
    const conteoAntes = sinSistemaAlContar(await c.conteoControlStock.findMany({ where: { productoLocalId: malo.pl } }));
    const rep = await reparar(S.adminDepo, malo);
    const movRep = await c.movimientoStock.findFirst({ where: { productoLocalId: malo.pl }, orderBy: { id: "desc" } });
    const audRep = await c.auditoriaStock.findFirst({ where: { productoLocalId: malo.pl }, orderBy: { id: "desc" } });
    ok(
      "y lo corrige: 24, con un Ajuste por control en el Libro y en la bitácora, sin tocar lo contado",
      rep.status === 200 && rep.reparado === true && rep.item?.stock === 24 && (await stockDe(malo, depo.id)) === 24 &&
        movRep.origen === ORIGEN_STOCK.AJUSTE_POR_CONTROL && movRep.origenRef === String(depoControl.id) && Number(movRep.cantidadAnterior) === -24 && Number(movRep.cantidadPosterior) === 24 &&
        (await c.auditoriaStock.count({ where: { productoLocalId: malo.pl } })) === auditAntes + 1 &&
        audRep.accion === "CONTROL_CORRECCION_REVISION" && audRep.motivo === `Ajuste por control #${depoControl.id}` && audRep.controlStockId === depoControl.id &&
        sinSistemaAlContar(await c.conteoControlStock.findMany({ where: { productoLocalId: malo.pl } })) === conteoAntes,
      json({ rep, movRep, audRep })
    );
    const marcado = await c.conteoControlStock.findFirst({ where: { productoLocalId: malo.pl, borradoEn: null } });
    const maloEnLista = (await lista(S.adminDepo, "contados")).items?.find((i) => i.id === malo.pl);
    ok(
      "la fila guarda el stock al contar que sale del Libro (0), y la diferencia queda en contado − eso: sobran 24",
      Number(marcado?.sistemaAlContar) === 0 && maloEnLista?.conteo?.diferencia === 24 && maloEnLista?.conteo?.sistema === 0,
      json({ marcado, conteo: maloEnLista?.conteo })
    );
    const otraVez = await reparar(S.adminDepo, malo);
    ok("corregirlo otra vez no mueve nada", otraVez.status === 200 && otraVez.reparado === false && (await stockDe(malo, depo.id)) === 24, json(otraVez));
    ok("y la revisión ya no marca nada", (await revision(S.adminDepo)).aCorregir === 0);
    const conPinPost = await reparar(S.ana, malo);
    ok("corregir con PIN: 403", conPinPost.status === 403, json(conPinPost));
    // Borrar después de corregir sigue deshaciendo el conteo: la corrección
    // entra en la bitácora como CONTROL_CORRECCION_REVISION y el deshacer la suma.
    await paso("borrar después de corregir", malo, null, 0);
  }

  seccion("10. Terminar dejando lo no contado como estaba");
  {
    // El control abierto del local (el de la sección 8): la Fanta se contó en 3
    // y se borró y se volvió a contar; el resto, nadie lo contó. Se vende una
    // yerba durante el control, para que haya un vendido.
    const abierto = await c.controlStock.findFirst({ where: { localId: mini.id, estado: "ABIERTO" } });
    await vender(P.yerba, 9);
    const t = await pedir(R.terminar, "GET", `${B}/terminar`, S.dueno);
    guardar("terminarAntesDeComoEstaban", t);
    const sinContar = [...t.aCero, ...t.vendidos];
    ok("hay no contados con stock para elegir: algunos a 0 y la yerba vendida", t.aCero.length > 0 && ids(t.vendidos).includes(P.yerba.pl), json({ aCero: ids(t.aCero), vendidos: ids(t.vendidos) }));
    const stockAntes = new Map();
    for (const p of sinContar) stockAntes.set(p.productoLocalId, await stockDe({ pl: p.productoLocalId }, mini.id));
    const movAntes = await c.movimientoStock.count({ where: { localId: mini.id, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, origenRef: String(abierto.id) } });

    const fin = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero), decision: "COMO_ESTABAN" });
    ok("terminar con 'Dejarlos como están': cierra sin poner nada en 0", fin.status === 200 && fin.puestosEnCero === 0 && fin.decision === "COMO_ESTABAN", json(fin));
    let iguales = true;
    for (const p of sinContar) if ((await stockDe({ pl: p.productoLocalId }, mini.id)) !== stockAntes.get(p.productoLocalId)) iguales = false;
    ok("ningún stock de lo no contado se movió", iguales, json([...stockAntes]));
    ok(
      "ni la bitácora ni el Libro tienen un puesto en cero de este control",
      (await c.auditoriaStock.count({ where: { controlStockId: abierto.id, accion: "CONTROL_PUESTO_EN_CERO" } })) === 0 &&
        (await c.movimientoStock.count({ where: { localId: mini.id, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, origenRef: String(abierto.id) } })) === movAntes
    );
    const cerrado = await c.controlStock.findUnique({ where: { id: abierto.id } });
    ok(
      "queda registrado qué se eligió y cuántos quedaron como estaban",
      cerrado.estado === "TERMINADO" && cerrado.noContadosDecision === "COMO_ESTABAN" && cerrado.noContadosComoEstaban === sinContar.length && cerrado.puestosEnCero === 0,
      json(cerrado)
    );
    const informe = await diferencias(S.dueno, abierto.id);
    guardar("diferenciasComoEstaban", informe);
    ok(
      "el informe no tiene puestos en 0, y lo dice desde lo guardado",
      informe.status === 200 && informe.congelado === true && informe.filas.every((f) => !f.puestoEnCero) &&
        informe.control?.noContadosDecision === "COMO_ESTABAN" && informe.control?.noContadosComoEstaban === sinContar.length,
      json({ control: informe.control, filas: resumenDif(informe) })
    );
    const elDeAntes = await diferencias(S.dueno, controlId);
    ok("el informe del que se puso en 0 lo dice como antes", elDeAntes.control?.noContadosDecision === "EN_CERO" && elDeAntes.filas.some((f) => f.puestoEnCero), json(elDeAntes.control));
  }

  seccion("11. El caso del SWIFT: cada conteo contra el stock vivo de su instante");
  {
    // Lo que vio Emanuel el 2026-10-22: al abrir había 23, se vendieron 4 (19),
    // se contaron 21. La tarjeta decía stock 19 y "Sistema 23 · Contado 21 ·
    // Faltan 2"; sobraban 2.
    const swift = await producto("SWIFT PICADILLO 90G", "7790360720115", 23);
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    const ctl = a.control.id;
    await vender(swift, 19);
    const r = await fijar(S.ana, swift, 21);
    guardar("conteoDelSwift", r);
    ok("se cuentan 21 con 19 en el sistema: el stock pasa YA a 21", r.status === 200 && (await stockDe(swift)) === 21 && r.item?.stock === 21, json(r));
    ok(
      "y la tarjeta dice Sistema 19 · Contado 21 · Sobran 2, no Sistema 23 · Faltan 2",
      r.item?.conteo?.sistema === 19 && r.item?.conteo?.total === 21 && r.item?.conteo?.diferencia === 2,
      json(r.item?.conteo)
    );
    const fila = await c.conteoControlStock.findFirst({ where: { controlId: ctl, productoLocalId: swift.pl, borradoEn: null } });
    ok("el conteo guarda el stock del sistema al contar: 19", Number(fila?.sistemaAlContar) === 19, json(fila));
    const mov = await c.movimientoStock.findFirst({ where: { productoLocalId: swift.pl }, orderBy: { id: "desc" } });
    const aud = await c.auditoriaStock.findFirst({ where: { productoLocalId: swift.pl }, orderBy: { id: "desc" } });
    ok(
      "el ajuste es un Ajuste por control de ESTE control, 19 → 21, a nombre de quien contó",
      mov?.origen === ORIGEN_STOCK.AJUSTE_POR_CONTROL && mov?.origenRef === String(ctl) && Number(mov.cantidadAnterior) === 19 && Number(mov.cantidadPosterior) === 21 &&
        aud?.accion === "CONTROL_CONTEO" && aud?.controlStockId === ctl && aud?.userId === cuenta.id,
      json({ mov, aud })
    );
    await vender(swift, 20);
    ok("la venta siguiente descuenta desde lo contado: 20", (await stockDe(swift)) === 20);
    const re = await fijar(S.dueno, swift, 20);
    ok(
      "se vuelve a contar y hay 20: es lo que dice el sistema, no mueve nada, y el producto sigue con sobran 2 (sistema 18)",
      re.status === 200 && (await stockDe(swift)) === 20 && re.item?.conteo?.diferencia === 2 && re.item?.conteo?.sistema === 18,
      json(re.item?.conteo)
    );
    await vender(swift, 18);
    const ajustesAntes = await c.movimientoStock.count({ where: { productoLocalId: swift.pl, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL } });
    const t = await pedir(R.terminar, "GET", `${B}/terminar`, S.dueno);
    const fin = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero), decision: "COMO_ESTABAN" });
    ok(
      "terminar NO vuelve a aplicar el conteo: queda 18, lo contado menos lo vendido después, sin otro ajuste",
      fin.status === 200 && (await stockDe(swift)) === 18 &&
        (await c.movimientoStock.count({ where: { productoLocalId: swift.pl, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL } })) === ajustesAntes,
      json(fin)
    );
    const informe = await diferencias(S.dueno, ctl);
    const deSwift = informe.filas?.find((f) => f.productoLocalId === swift.pl);
    ok(
      "el informe congelado usa la diferencia de los conteos: sistema 18, contado 20, sobran 2",
      deSwift?.sistema === 18 && deSwift?.contado === 20 && deSwift?.diferencia === 2,
      json(deSwift)
    );
  }

  seccion("12. La reconstrucción de los conteos escritos antes del stock al contar");
  {
    const { ESTADO_RECONSTRUCCION, reconstruirConteos } = await import("../../lib/stock/control/reconstruccionDeConteos.js");
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    const ctl = a.control.id;
    // Las filas COMO LAS ESCRIBÍA la versión anterior, en esta base descartable:
    // sin `sistemaAlContar`, el primer total como CONTROL_CONTEO y un cambio de
    // total como CONTROL_CORRECCION, que movía por la diferencia de totales.
    // Ninguna ruta de hoy las produce: es el estado a reconstruir.
    const conteoViejo = (p, { accion, total, queda, sumar = false }) =>
      c.$transaction(async (tx) => {
        const antes = Number((await tx.stockLocal.findUnique({ where: { id: p.sl } })).cantidad);
        if (!sumar) {
          await tx.conteoControlStock.updateMany({ where: { controlId: ctl, productoLocalId: p.pl, borradoEn: null }, data: { borradoEn: new Date() } });
        }
        await tx.conteoControlStock.create({
          data: { controlId: ctl, localId: mini.id, productoLocalId: p.pl, cantidad: total, usuarioId: dueno.id, operadorId: null, contadoPor: "Emanuel", fijo: accion === "CONTROL_CONTEO", sistemaAntes: null },
        });
        await tx.auditoriaStock.create({
          data: { grupoId: grupo.id, localId: mini.id, productoLocalId: p.pl, userId: dueno.id, accion, cantidadAnterior: antes, cantidadNueva: queda, motivo: `Ajuste por control #${ctl}`, controlStockId: ctl },
        });
        await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(ctl) });
        await tx.stockLocal.update({ where: { id: p.sl }, data: { cantidad: queda } });
      });

    // Arroz: al abrir 12. Se cuentan 10 (12 → 10), se venden 3 (7), y se
    // corrige el total a 8: la versión anterior movía −2 sobre lo que había
    // (7 → 5). Después se vende 1 (4). Contra el stock vivo, el 8 se contó
    // con 7 en el sistema: debería haber 8 − 1 = 7, y la diferencia es
    // 8 − (12 − 3) = −1.
    const arroz = await producto("Arroz 1kg", "7790000000301", 12);
    await conteoViejo(arroz, { accion: "CONTROL_CONTEO", total: 10, queda: 10 });
    await vender(arroz, 7);
    await conteoViejo(arroz, { accion: "CONTROL_CORRECCION", total: 8, queda: 5 });
    await vender(arroz, 4);
    // Harina: al abrir 10, se cuentan 6, se venden 2 (4) y el total pasa a 5:
    // la versión anterior la dejó en 3. Debería haber 5; la diferencia es
    // 5 − (10 − 2) = −3.
    const harina = await producto("Harina 000", "7790000000306", 10);
    await conteoViejo(harina, { accion: "CONTROL_CONTEO", total: 6, queda: 6 });
    await vender(harina, 4);
    await conteoViejo(harina, { accion: "CONTROL_CORRECCION", total: 5, queda: 3 });
    // Sal: se contaron 21 con 23 en el sistema y después se vendieron 2. Nada
    // que corregir: el stock ya es lo contado menos lo vendido.
    const sal = await producto("Sal fina", "7790000000302", 23);
    await conteoViejo(sal, { accion: "CONTROL_CONTEO", total: 21, queda: 21 });
    await vender(sal, 19);
    // Té: dos conteos que se SUMABAN (la primera versión): no hay un único
    // instante del conteo.
    const te = await producto("Té x25", "7790000000303", 5);
    await conteoViejo(te, { accion: "CONTROL_CONTEO", total: 2, queda: 2 });
    await conteoViejo(te, { accion: "CONTROL_CORRECCION", total: 3, queda: 5, sumar: true });
    // Mate: la bitácora dice 6 → 4 y el Libro 6 → 3: el conteo no está en el Libro.
    const mate = await producto("Mate cocido", "7790000000304", 6);
    await c.$transaction(async (tx) => {
      await tx.conteoControlStock.create({
        data: { controlId: ctl, localId: mini.id, productoLocalId: mate.pl, cantidad: 4, usuarioId: dueno.id, operadorId: null, contadoPor: "Emanuel", fijo: true, sistemaAntes: null },
      });
      await tx.auditoriaStock.create({
        data: { grupoId: grupo.id, localId: mini.id, productoLocalId: mate.pl, userId: dueno.id, accion: "CONTROL_CONTEO", cantidadAnterior: 6, cantidadNueva: 4, motivo: `Ajuste por control #${ctl}`, controlStockId: ctl },
      });
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(ctl) });
      await tx.stockLocal.update({ where: { id: mate.sl }, data: { cantidad: 3 } });
    });
    // Y uno contado con la versión de hoy, por su ruta: ya está al día.
    const lenteja = await producto("Lentejas", "7790000000305", 9);
    await vender(lenteja, 8);
    await fijar(S.dueno, lenteja, 6);

    const stockAntes = json(await Promise.all([arroz, harina, sal, te, mate, lenteja].map((p) => stockDe(p))));
    const auditAntes = await c.auditoriaStock.count({ where: { controlStockId: ctl } });
    const antesDeArroz = (await lista(S.dueno, "contados", "q=Arroz")).items?.[0]?.conteo;
    ok("antes de reconstruir, el arroz suma lo que el control movió: −2 − 2 = faltan 4", antesDeArroz?.diferencia === -4, json(antesDeArroz));
    const revisionAntes = await pedir(R.revision, "GET", `${B}/revision`, S.dueno);
    guardar("revisionAntesDeReconstruir", revisionAntes);
    ok(
      "la revisión es el modo prueba en la pantalla: 2 a corregir y 2 que no se pueden",
      revisionAntes.aCorregir === 2 && revisionAntes.noReconstruibles === 2,
      json({ aCorregir: revisionAntes.aCorregir, noReconstruibles: revisionAntes.noReconstruibles })
    );

    // ── El script, como lo corre una persona: primero en modo prueba ────────
    const { spawnSync } = await import("node:child_process");
    // Sin la marca del alias-loader de ESTE proceso: si el hijo la hereda, cree
    // que ya registró sus hooks y no resuelve `@/`.
    const { __ERPAZUL_ALIAS_LOADER__, ...ambiente } = process.env;
    const correrScript = (...extra) =>
      spawnSync(process.execPath, ["--import", "./scripts/alias-loader.mjs", "scripts/control-stock-reconstruir.mjs", "--control", String(ctl), ...extra], {
        encoding: "utf8",
        env: { ...ambiente, DATABASE_URL: urlPrueba },
      });
    const prueba = correrScript();
    ok(
      "el modo prueba dice cuántos toca y cuántos no puede, con el motivo de cada uno",
      prueba.status === 0 && /MODO PRUEBA/.test(prueba.stdout) && /Productos contados: 6/.test(prueba.stdout) && /Stock corregido \(los tocaría\): 2/.test(prueba.stdout) &&
        /el stock ya daba \(los tocaría\): 1/.test(prueba.stdout) && /Ya estaban al día: 1/.test(prueba.stdout) && /NO se pudieron reconstruir \(no se tocan\): 2/.test(prueba.stdout) &&
        /Té x25: Tiene varios conteos vigentes/.test(prueba.stdout) && /Mate cocido: El Libro no tiene el movimiento/.test(prueba.stdout),
      prueba.stdout + prueba.stderr
    );
    ok(
      "y no escribió nada: ni stock, ni bitácora, ni el stock al contar",
      json(await Promise.all([arroz, harina, sal, te, mate, lenteja].map((p) => stockDe(p)))) === stockAntes &&
        (await c.auditoriaStock.count({ where: { controlStockId: ctl } })) === auditAntes &&
        (await c.conteoControlStock.count({ where: { controlId: ctl, borradoEn: null, sistemaAlContar: { not: null } } })) === 1
    );

    const aplicado = correrScript("--aplicar");
    ok("aplicado: corrige el arroz y la harina, y marca la sal", aplicado.status === 0 && /Stock corregido: 2/.test(aplicado.stdout) && /el stock ya daba: 1/.test(aplicado.stdout), aplicado.stdout + aplicado.stderr);
    ok("el arroz queda en 7: lo contado (8) menos lo vendido después (1)", (await stockDe(arroz)) === 7);
    const harinaDespues = (await lista(S.dueno, "contados", "q=Harina")).items?.[0];
    ok("la harina queda en 5, con faltan 3", (await stockDe(harina)) === 5 && harinaDespues?.conteo?.diferencia === -3 && harinaDespues?.conteo?.sistema === 8, json(harinaDespues?.conteo));
    const arrozDespues = (await lista(S.dueno, "contados", "q=Arroz")).items?.[0]?.conteo;
    ok("y su diferencia es contado − stock al contar: 8 − 9 = falta 1, con sistema 9", arrozDespues?.diferencia === -1 && arrozDespues?.sistema === 9, json(arrozDespues));
    const filaArroz = await c.conteoControlStock.findFirst({ where: { controlId: ctl, productoLocalId: arroz.pl, borradoEn: null } });
    const audArroz = await c.auditoriaStock.findFirst({ where: { productoLocalId: arroz.pl }, orderBy: { id: "desc" } });
    ok(
      "la fila vigente guarda el stock al contar sacado del Libro (9), y la corrección queda como CONTROL_CORRECCION_REVISION de este control",
      Number(filaArroz?.sistemaAlContar) === 9 && audArroz?.accion === "CONTROL_CORRECCION_REVISION" && audArroz?.controlStockId === ctl && Number(audArroz.cantidadAnterior) === 4 && Number(audArroz.cantidadNueva) === 7,
      json({ filaArroz, audArroz })
    );
    ok("la sal no se movió (19) y quedó con su stock al contar (23)", (await stockDe(sal)) === 19 && Number((await c.conteoControlStock.findFirst({ where: { controlId: ctl, productoLocalId: sal.pl, borradoEn: null } }))?.sistemaAlContar) === 23);
    ok("el té y el mate no se tocaron", (await stockDe(te)) === 5 && (await stockDe(mate)) === 3);

    const auditDespues = await c.auditoriaStock.count({ where: { controlStockId: ctl } });
    await vender(arroz, 6);
    const otraVez = correrScript("--aplicar");
    ok(
      "correrlo otra vez, aun con una venta en el medio, no ajusta nada: es idempotente",
      otraVez.status === 0 && /Stock corregido: 0/.test(otraVez.stdout) && /el stock ya daba: 0/.test(otraVez.stdout) && (await c.auditoriaStock.count({ where: { controlStockId: ctl } })) === auditDespues && (await stockDe(arroz)) === 6,
      otraVez.stdout + otraVez.stderr
    );
    // El camino de producción: la misma función, por la ruta de la revisión.
    const todos = await pedir(R.revision, "POST", `${B}/revision`, S.dueno, { todos: true });
    ok(
      "'Corregir todos' de la revisión es la misma reconstrucción: tampoco ajusta nada ya",
      todos.status === 200 && todos.resumen?.ajustados === 0 && todos.resumen?.noReconstruibles === 2 && (await c.auditoriaStock.count({ where: { controlStockId: ctl } })) === auditDespues,
      json(todos)
    );
    const rev = await pedir(R.revision, "GET", `${B}/revision`, S.dueno);
    guardar("revisionConNoReconstruibles", rev);
    ok("y la revisión dice cuáles no se pueden corregir", rev.noReconstruibles === 2 && rev.aCorregir === 0, json({ aCorregir: rev.aCorregir, noReconstruibles: rev.noReconstruibles }));
    const directo = await reconstruirConteos(c, { controlId: ctl, aplicar: false, userId: dueno.id, grupoId: grupo.id });
    ok("sin aplicar, la función da lo mismo que la ruta", directo.ok && directo.productos.filter((p) => p.estado === ESTADO_RECONSTRUCCION.AL_DIA).length === 4, json(directo.resumen));
  }

  seccion("13. Con la forma de producción, el listado y la revisión contestan siempre");
  {
    // Lo que vio Emanuel el 2026-10-22 con 7607b48: "Error interno al cargar
    // stock." donde va el recuadro, y el recuadro nunca. Acá, el control del
    // depósito sigue abierto desde la sección 5 —con sus conteos de hoy—, y se
    // le suman los de la versión anterior con las formas que tiene producción:
    // sin `sistemaAlContar`, sin movimientos en el Libro desde que se abrió, de
    // un producto inactivo, de uno borrado, y un pack y un cajón.
    const depoCtl = await c.controlStock.findFirst({ where: { localId: depo.id, estado: "ABIERTO" } });
    const fichaDepo = async (nombre, codigo, unidad, factor, stock, extra = {}) => {
      const b = await c.productoBase.create({
        data: { grupoId: grupo.id, nombre, codigo_barra: codigo, unidad_medida: unidad, factor_pack: factor, precio_costo: 1200, precio_venta: 2000, redondeo_100: false, activo: true, ...extra },
      });
      const pl = await c.productoLocal.create({ data: { localId: depo.id, baseId: b.id, activo: extra.activo ?? true, precio_costo: 1200, precio_venta: 2000 } });
      const sl = await c.stockLocal.create({ data: { localId: depo.id, productoId: pl.id, cantidad: stock } });
      return { pl: pl.id, sl: sl.id, base: b.id };
    };
    // Como lo escribía la versión anterior: fila sin `sistemaAlContar`, su
    // bitácora y, si movió, su Ajuste por control en el Libro.
    const conteoViejo = (p, { total, antes, queda }) =>
      c.$transaction(async (tx) => {
        await tx.conteoControlStock.create({
          data: { controlId: depoCtl.id, localId: depo.id, productoLocalId: p.pl, cantidad: total, usuarioId: admin.id, operadorId: null, contadoPor: "Administrador", fijo: true, sistemaAntes: antes },
        });
        await tx.auditoriaStock.create({
          data: { grupoId: grupo.id, localId: depo.id, productoLocalId: p.pl, userId: admin.id, accion: "CONTROL_CONTEO", cantidadAnterior: antes, cantidadNueva: queda, motivo: `Ajuste por control #${depoCtl.id}`, controlStockId: depoCtl.id },
        });
        if (antes !== queda) {
          await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(depoCtl.id) });
          await tx.stockLocal.update({ where: { id: p.sl }, data: { cantidad: queda } });
        }
      });
    // "Está bien" de antes: no movió nada, y el producto no tiene NINGÚN
    // movimiento en el Libro desde que se abrió (la fila es de antes).
    const quieto = QUIETO;
    ok(
      "el quieto no tiene movimientos en el Libro desde que se abrió el control",
      (await c.movimientoStock.count({ where: { productoLocalId: quieto.pl, instante: { gte: depoCtl.abiertoEn } } })) === 0
    );
    await conteoViejo(quieto, { total: 7, antes: 7, queda: 7 });
    const pack = await fichaDepo("Pack viejo x12", "8000000000302", "pack", 12, 30);
    await conteoViejo(pack, { total: 24, antes: 30, queda: 24 });
    const cajon = await fichaDepo("Cajón viejo x8", "8000000000303", "cajon", 8, 16, { modoVentaDeposito: "PESO" });
    await conteoViejo(cajon, { total: 8, antes: 16, queda: 8 });
    const inactivo = await fichaDepo("Inactivo viejo", "8000000000304", "unidad", 1, 5);
    await conteoViejo(inactivo, { total: 3, antes: 5, queda: 3 });
    await c.productoLocal.update({ where: { id: inactivo.pl }, data: { activo: false } });
    // Uno contado y después BORRADO: la fila del conteo queda, el producto no.
    const borrado = await fichaDepo("Borrado viejo", "8000000000305", "unidad", 1, 4);
    await conteoViejo(borrado, { total: 2, antes: 4, queda: 2 });
    await c.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.ELIMINACION_PRODUCTO, referencia: String(borrado.pl) });
      await tx.stockLocal.delete({ where: { id: borrado.sl } });
    });
    await c.productoLocal.delete({ where: { id: borrado.pl } });

    for (const chip of ["todos", "sin_contar", "contados", "con_diferencia", "en_negativo"]) {
      const l = await lista(S.adminDepo, chip);
      ok(`el listado del control con '${chip}' contesta JSON con ok`, l.status === 200 && l.ok === true && Array.isArray(l.items), json({ status: l.status, error: l.error }));
    }
    const rev = await pedir(R.revision, "GET", `${B}/revision`, S.adminDepo);
    ok("la revisión contesta JSON con ok", rev.status === 200 && rev.ok === true && Array.isArray(rev.productos), json({ status: rev.status, error: rev.error }));
    const de = (id) => rev.productos?.find((p) => p.productoLocalId === id);
    ok("el pack y el cajón viejos se revisan en unidades y están al día", de(pack.pl)?.reconstruible === true && de(pack.pl)?.corregir === false && de(cajon.pl)?.reconstruible === true, json([de(pack.pl), de(cajon.pl)]));
    ok("el que no tiene movimientos en el Libro se revisa igual", de(quieto.pl)?.reconstruible === true && de(quieto.pl)?.corregir === false, json(de(quieto.pl)));
    ok("el inactivo contado está en la revisión", Boolean(de(inactivo.pl)), json(rev.productos?.map((p) => p.nombre)));
    ok("el borrado no está en la revisión ni la tira abajo", !de(borrado.pl));
    const todos = await pedir(R.revision, "POST", `${B}/revision`, S.adminDepo, { todos: true });
    ok("'Corregir todos' con todo eso también contesta, sin tocar el borrado", todos.status === 200 && todos.ok === true, json(todos));
  }

  seccion("14. Stock alto: el máximo de cada categoría, por ubicación");
  {
    // Un control abierto en el Mini (las secciones de antes pueden haberlo
    // terminado) y el del depósito, que sigue abierto desde la 5.
    await pedir(R.abrir, "POST", `${B}/abrir`, S.dueno);
    const maximos = (s) => pedir(R.maximos, "GET", `${B}/maximos`, s);
    const ponerMaximos = (s, filas) => pedir(R.maximos, "PUT", `${B}/maximos`, s, { maximos: filas });
    const fiambres = await c.categoria.create({ data: { nombre: "Fiambres SA" } });
    const masitas = await c.categoria.create({ data: { nombre: "Masitas SA" } });
    const conCategoria = async (localId, nombre, codigo, unidad, stock, categoriaId) => {
      const b = await c.productoBase.create({
        data: { grupoId: grupo.id, nombre, codigo_barra: codigo, unidad_medida: unidad, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, categoria_id: categoriaId },
      });
      const pl = await c.productoLocal.create({ data: { localId, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
      await c.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: stock } });
      return { pl: pl.id, base: b.id, localId };
    };
    // Fiambres es de kilos: tres de kg contra uno por unidad.
    const jamonAlto = await conCategoria(mini.id, "Jamón alto", "8000000000301", "kg", 20, fiambres.id);
    const jamonJusto = await conCategoria(mini.id, "Jamón justo", "8000000000302", "kg", 15, fiambres.id);
    await conCategoria(mini.id, "Salamín", "8000000000303", "kg", 10, fiambres.id);
    const fiambreUnidad = await conCategoria(mini.id, "Fiambre en unidad", "8000000000304", "unidad", 99, fiambres.id);
    const masita = await conCategoria(mini.id, "Masita", "8000000000305", "unidad", 500, masitas.id);
    const jamonDepo = await conCategoria(depo.id, "Jamón del depósito", "8000000000306", "kg", 20, fiambres.id);

    const conPin = await ponerMaximos(S.ana, [{ categoriaId: fiambres.id, maximo: 15 }]);
    ok("con PIN no se configuran: 403, como terminar", conPin.status === 403, json(conPin));
    const malo = await ponerMaximos(S.dueno, [{ categoriaId: masitas.id, maximo: "1,5" }]);
    ok("un máximo con coma en una categoría de un: 400 y no guarda nada", malo.status === 400 && (await c.maximoStockCategoria.count()) === 0, json(malo));
    const guardado = await ponerMaximos(S.dueno, [
      { categoriaId: fiambres.id, maximo: "15" },
      { categoriaId: masitas.id, maximo: null },
    ]);
    const deCategoria = (r, id) => r.categorias?.find((x) => x.id === id);
    ok(
      "el dueño guarda: Fiambres en kg con 15, Masitas en un sin máximo",
      guardado.status === 200 && deCategoria(guardado, fiambres.id)?.unidad === "kg" && deCategoria(guardado, fiambres.id)?.maximo === 15 &&
        deCategoria(guardado, masitas.id)?.unidad === "un" && deCategoria(guardado, masitas.id)?.maximo === null,
      json(guardado)
    );

    const alto = await lista(S.dueno, "stock_alto");
    guardar("listaStockAlto", alto);
    const enAlto = ids(alto.items);
    ok("arriba del máximo entra: el jamón con 20 sobre 15", enAlto.includes(jamonAlto.pl), json(alto.items?.map((i) => i.nombre)));
    ok("igual al máximo no entra: el jamón con 15", !enAlto.includes(jamonJusto.pl), json(alto.items?.map((i) => i.nombre)));
    ok("el de otra unidad que su categoría no se revisa: el fiambre por unidad con 99", !enAlto.includes(fiambreUnidad.pl));
    ok("una categoría sin máximo no se revisa: la masita con 500", !enAlto.includes(masita.pl));
    ok(
      "el contador dice 1 y la tarjeta trae el máximo: 15 kg",
      json(enAlto) === json([jamonAlto.pl]) && alto.resumenControl?.stockAlto === 1 && json(alto.items?.[0]?.stockAlto) === json({ maximo: 15, unidad: "kg" }),
      json({ resumen: alto.resumenControl?.stockAlto, tarjeta: alto.items?.[0]?.stockAlto })
    );
    const conTexto = await lista(S.dueno, "stock_alto", "q=salam");
    ok("respeta el buscador: con 'salam' no queda nada", conTexto.items?.length === 0, json(conTexto.items?.map((i) => i.nombre)));

    const enDepo = await lista(S.adminDepo, "stock_alto");
    ok(
      "el máximo del Mini no se aplica en el depósito: el jamón del depósito con 20 no entra",
      enDepo.status === 200 && !ids(enDepo.items).includes(jamonDepo.pl) && enDepo.resumenControl?.stockAlto === 0,
      json({ items: enDepo.items?.map((i) => i.nombre), resumen: enDepo.resumenControl?.stockAlto })
    );
    const delDepo = await ponerMaximos(S.adminDepo, [{ categoriaId: fiambres.id, maximo: "30,5" }]);
    const delMini = await maximos(S.dueno);
    guardar("maximosMini", delMini);
    ok(
      "lo que configura el depósito no toca al Mini: el depósito 30,5 y el Mini sigue en 15",
      delDepo.status === 200 && deCategoria(delDepo, fiambres.id)?.maximo === 30.5 && deCategoria(delMini, fiambres.id)?.maximo === 15,
      json({ depo: deCategoria(delDepo, fiambres.id), mini: deCategoria(delMini, fiambres.id) })
    );
    ok("y el Mini lee su ubicación: nombre y solo sus categorías", delMini.local?.nombre === "Mini el 7" && deCategoria(delMini, fiambres.id) && deCategoria(delMini, masitas.id), json(delMini.local));

    const contado = await pedir(R.conteos, "PUT", `${B}/conteos`, S.dueno, { productoLocalId: jamonAlto.pl, total: 12 });
    guardar("contadoSaleDeStockAlto", contado);
    const despues = await lista(S.dueno, "stock_alto");
    ok(
      "al aceptar 12 queda debajo del máximo: sale de Stock alto, la tarjeta sin máximo y el contador en 0",
      contado.status === 200 && contado.item?.stockAlto === null && contado.resumen?.stockAlto === 0 && !ids(despues.items).includes(jamonAlto.pl) && despues.resumenControl?.stockAlto === 0,
      json({ status: contado.status, tarjeta: contado.item?.stockAlto, resumen: contado.resumen?.stockAlto, despues: despues.resumenControl?.stockAlto })
    );
    const borrado = await ponerMaximos(S.dueno, [{ categoriaId: fiambres.id, maximo: null }]);
    ok(
      "vaciar el máximo lo borra: Fiambres queda sin máximo en el Mini, y el depósito conserva el suyo",
      borrado.status === 200 && deCategoria(borrado, fiambres.id)?.maximo === null && (await c.maximoStockCategoria.count({ where: { localId: depo.id } })) === 1,
      json(deCategoria(borrado, fiambres.id))
    );
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
