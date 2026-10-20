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
//   3. el campo es el TOTAL: el primero fija el stock, cambiarlo lo mueve por la
//      diferencia —sobre lo vendido mientras tanto—, y borrarlo deshace el
//      ajuste del control; la tarjeta dice el total y quién lo tocó último;
//   4. la lista: Sin contar / Contados / Todos, el texto, y el lector que trae
//      un producto aunque el filtro lo oculte; los contadores;
//   5. el depósito: la tarjeta de un pack es la de Stock y el total se guarda en
//      unidades;
//   6. terminar: los que nadie contó se parten en vendidos durante el control
//      (no se tocan) y los que quedan en cero; una lista vieja se rechaza;
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
    coca: await producto("Coca 2L", "7790000000001", 5, "unidad", { proveedor_id: proveedor.id }),
    queso: await producto("Queso por kg", "7790000000002", 2.5, "kg"),
    yerba: await producto("Yerba 1kg", "7790000000003", 12), //        nadie la cuenta, se vende: no se toca
    galletas: await producto("Galletas", "7790000000004", -15), //     nadie, negativa: queda en 0
    fideos: await producto("Fideos", "7790000000005", 4), //           nadie: queda en 0
    vacio: await producto("Sin stock", "7790000000006", 0), //         en cero: no está en "Sin contar"
    nuevo: await producto("Sin fila", "7790000000007", null), //        sin StockLocal: el conteo crea la fila
    combo: await producto("Combo desayuno", "7790000000008", null, "unidad", { es_combo: true }),
    inactivo: await producto("Discontinuado", "7790000000009", 7, "unidad", { activo: false }),
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

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const R = {
    estado: await import("../../app/api/stock_locales/control/route.js"),
    abrir: await import("../../app/api/stock_locales/control/abrir/route.js"),
    productos: await import("../../app/api/stock_locales/control/productos/route.js"),
    conteos: await import("../../app/api/stock_locales/control/conteos/route.js"),
    terminar: await import("../../app/api/stock_locales/control/terminar/route.js"),
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
  const lista = (s, qs = "") => pedir(R.productos, "GET", `${B}/productos?${qs}`, s);
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
    // Universo: coca, queso, yerba, galletas, fideos. No: el de cero, el sin fila,
    // el combo ni el inactivo.
    ok("arranca con 0 contados y 5 sin contar", e.control?.contados === 0 && e.control?.sinContar === 5, json(e.control));
  }
  const controlId = (await c.controlStock.findFirst({ where: { localId: mini.id, estado: "ABIERTO" } })).id;

  seccion("3. El campo es el total");
  {
    const sinPin = await fijar(S.cuentaSinPin, P.coca, 1);
    ok("con el permiso pero sin PIN: 428", sinPin.status === 428 && sinPin.needsOperador === true, json(sinPin));
    const r = await fijar(S.dueno, P.coca, 3);
    ok("el primer total fija: había 5, contó 3 → 3", r.status === 200 && (await stockDe(P.coca)) === 3, json(r));
    ok("y la tarjeta que vuelve dice el stock nuevo, el total y quién", r.item?.stock === 3 && r.item?.conteo?.total === 3 && r.item?.conteo?.contadoPor === "Emanuel", json(r.item));
    ok("y los contadores: 1 contado y 4 sin contar", r.resumen?.contados === 1 && r.resumen?.sinContar === 4, json(r.resumen));
    const visto = await lista(S.ana, "codigo=7790000000001");
    guardar("cocaContadaPorOtro", visto);
    ok("Ana escanea la coca: la ve ya contada por Emanuel, con el total", visto.item?.conteo?.total === 3 && visto.item?.conteo?.contadoPor === "Emanuel", json(visto));
    const r2 = await fijar(S.ana, P.coca, 7);
    ok("Ana escribe el nuevo total 7: el stock se mueve por la diferencia (3 → 7)", r2.status === 200 && (await stockDe(P.coca)) === 7, json(r2));
    ok("y la tarjeta queda a nombre de Ana", r2.item?.conteo?.contadoPor === "Ana" && r2.item?.conteo?.total === 7, json(r2.item?.conteo));
    const filas = await c.conteoControlStock.findMany({ where: { controlId, productoLocalId: P.coca.pl }, orderBy: { id: "asc" } });
    ok("la historia queda: el total de Emanuel borrado, el de Ana vigente", filas.length === 2 && filas[0].borradoEn !== null && filas[1].borradoEn === null && filas[1].operadorId === ana.id, json(filas));
    const antes = await auditoriasDe(P.coca);
    const igual = await fijar(S.ana, P.coca, 7);
    ok("el mismo total otra vez no mueve nada ni deja otra fila", igual.status === 200 && (await stockDe(P.coca)) === 7 && (await auditoriasDe(P.coca)) === antes, json(igual));
    await vender(P.coca, 6);
    const r3 = await fijar(S.ana, P.coca, 5);
    ok("se vendió 1 (7 → 6) y el total pasa a 5: el stock baja 2 sobre lo que hay (6 → 4)", r3.status === 200 && (await stockDe(P.coca)) === 4, json(r3));
    const borrar = await fijar(S.dueno, P.coca, null);
    ok(
      "borrar el campo deshace el ajuste del control: 5 menos la venta → 4, y vuelve a sin contar",
      borrar.status === 200 && (await stockDe(P.coca)) === 4 && borrar.item?.conteo === null && borrar.resumen?.contados === 0,
      json({ stock: await stockDe(P.coca), borrar })
    );
    const deNuevo = await fijar(S.dueno, P.coca, 2);
    ok("contarlo de nuevo vuelve a fijar: 4 → 2", deNuevo.status === 200 && (await stockDe(P.coca)) === 2, json(deNuevo));

    const kg = await fijar(S.dueno, P.queso, 1.25);
    ok("el queso se cuenta en kg, con decimales", kg.status === 200 && (await stockDe(P.queso)) === 1.25, json(kg));
    const sinFila = await fijar(S.ana, P.nuevo, 2);
    ok("un producto sin fila de stock: la crea y queda en el total", sinFila.status === 200 && (await stockDe(P.nuevo)) === 2, json(sinFila));
    const combo = await fijar(S.dueno, P.combo, 1);
    ok("un combo no se cuenta: 400", combo.status === 400, json(combo));
    const neg = await fijar(S.dueno, P.fideos, -1);
    ok("un total negativo: 400, y no movió nada", neg.status === 400 && (await stockDe(P.fideos)) === 4, json(neg));
    const borrarSinContar = await fijar(S.dueno, P.fideos, null);
    ok("borrar uno que nadie contó no hace nada", borrarSinContar.status === 200 && (await stockDe(P.fideos)) === 4 && (await auditoriasDe(P.fideos)) === 0, json(borrarSinContar));
  }

  seccion("4. La lista, los chips y el lector");
  {
    const sin = await lista(S.ana);
    ok("sin filtro pedido son todos los que se pueden contar: 7", sin.status === 200 && sin.total === 7, json({ total: sin.total, items: sin.items?.map((i) => i.nombre) }));
    const sinContar = await lista(S.ana, "filtro=sin_contar");
    guardar("listaSinContar", sinContar);
    ok("Sin contar: yerba, galletas y fideos —con stock y sin contar—", json(ids(sinContar.items)) === json([P.yerba.pl, P.galletas.pl, P.fideos.pl].sort((a, b) => a - b)), json(sinContar.items?.map((i) => i.nombre)));
    ok("y los contadores: 3 contados, 3 sin contar", sinContar.resumen?.contados === 3 && sinContar.resumen?.sinContar === 3, json(sinContar.resumen));
    const contados = await lista(S.ana, "filtro=contados");
    guardar("listaContados", contados);
    ok("Contados: coca, queso y el sin fila", json(ids(contados.items)) === json([P.coca.pl, P.queso.pl, P.nuevo.pl].sort((a, b) => a - b)), json(contados.items?.map((i) => i.nombre)));
    const coca = contados.items.find((i) => i.id === P.coca.pl);
    ok("la tarjeta trae lo de Stock: proveedor, código, unidad y stock", coca?.proveedorNombre === "Coca-Cola FEMSA" && coca?.codigoBarra === "7790000000001" && coca?.unidadMedida === "unidad" && coca?.stock === 2, json(coca));
    const texto = await lista(S.ana, "filtro=sin_contar&q=gall");
    ok("el texto filtra por nombre", json(ids(texto.items)) === json([P.galletas.pl]), json(texto.items?.map((i) => i.nombre)));
    const escaneada = await lista(S.ana, "codigo=7790000000006");
    ok("el lector trae 'Sin stock' aunque Sin contar no lo muestre", escaneada.item?.id === P.vacio.pl, json(escaneada));
    const combo = await lista(S.ana, "codigo=7790000000008");
    ok("el lector con un combo dice que no se puede contar", combo.status === 200 && combo.item === null && /No hay ningún producto para contar/.test(combo.error || ""), json(combo));
  }

  seccion("5. El depósito: un pack se cuenta en bultos y se guarda en unidades");
  {
    const a = await pedir(R.abrir, "POST", `${B}/abrir`, S.adminDepo);
    ok("el Admin abre un control en el depósito", a.status === 200, json(a));
    const l = await lista(S.adminDepo, "filtro=sin_contar");
    guardar("listaDeposito", l);
    const agua = l.items?.find((i) => i.id === PACK.pl);
    ok("la tarjeta es la del depósito: pack de 6 y 40 unidades", agua?.unidadMedida === "pack" && agua?.factorPack === 6 && agua?.stock === 40, json(agua));
    // 4 bultos + 3 sueltas = 27: lo calcula la pantalla con `toUnidades`.
    const r = await pedir(R.conteos, "PUT", `${B}/conteos`, S.adminDepo, { productoLocalId: PACK.pl, total: 27 });
    ok("el total en unidades fija el stock del depósito: 27", r.status === 200 && (await stockDe(PACK, depo.id)) === 27, json(r));
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
      const post = await pedir(R.terminar, "POST", `${B}/terminar`, s, { productos: ids(t.aCero) });
      const get = await pedir(R.terminar, "GET", `${B}/terminar`, s);
      ok(`${quien} cuenta pero no termina: 403 en el POST y en la lista`, post.status === 403 && get.status === 403, json({ post, get }));
    }
    const conPin = await fijar(S.duenoConPin, P.vacio, 0);
    ok("con PIN en la cuenta del dueño sí cuenta, a nombre de la operadora", conPin.status === 200 && conPin.item?.conteo?.contadoPor === "Ana", json(conPin));
    const sinPinCuenta = await pedir(R.terminar, "GET", `${B}/terminar`, S.cuentaSinPin);
    ok("la cuenta del encargado, sin PIN, sí ve la lista de terminar", sinPinCuenta.status === 200, json(sinPinCuenta));
    const vieja = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: [P.galletas.pl] });
    ok("con una lista que no tiene a todos: 409 y no toca nada", vieja.status === 409 && vieja.cambioLaLista === true && (await stockDe(P.fideos)) === 4, json(vieja));
    const fin = await pedir(R.terminar, "POST", `${B}/terminar`, S.dueno, { productos: ids(t.aCero) });
    ok("terminar pone 2 en cero", fin.status === 200 && fin.puestosEnCero === 2, json(fin));
    ok("galletas y fideos en 0; la yerba sigue en 10; la coca en 2", (await stockDe(P.galletas)) === 0 && (await stockDe(P.fideos)) === 0 && (await stockDe(P.yerba)) === 10 && (await stockDe(P.coca)) === 2);
    ok("el inactivo no se tocó", (await stockDe(P.inactivo)) === 7);
    const e = await estado(S.dueno);
    guardar("terminado", e);
    ok("sin control abierto, el último terminado dice quién y cuántos", e.control === null && e.ultimo?.terminadoPorNombre === "Emanuel" && e.ultimo?.puestosEnCero === 2, json(e.ultimo));
  }

  seccion("7. El Libro y la bitácora de stock");
  {
    const movs = await c.movimientoStock.findMany({ where: { localId: mini.id, origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL }, orderBy: { id: "asc" } });
    ok("cada movimiento del control nombra al control", movs.length > 0 && movs.every((m) => m.origenRef === String(controlId)), json(movs.map((m) => m.origenRef)));
    const deCoca = movs.filter((m) => m.productoLocalId === P.coca.pl).map((m) => [Number(m.cantidadAnterior), Number(m.cantidadPosterior)]);
    // La venta (7 → 6) no es del control. Borrar no movió nada: el ajuste neto era cero.
    ok("la coca: 5 → 3, 3 → 7, 6 → 4, y al contarla de nuevo 4 → 2", json(deCoca) === json([[5, 3], [3, 7], [6, 4], [4, 2]]), json(deCoca));
    const altaSinFila = movs.find((m) => m.productoLocalId === P.nuevo.pl && m.tipo === "ALTA");
    ok("la fila creada por el conteo también es del control", Boolean(altaSinFila), json(movs.filter((m) => m.productoLocalId === P.nuevo.pl)));
    const ceros = movs.filter((m) => [P.galletas.pl, P.fideos.pl].includes(m.productoLocalId)).map((m) => Number(m.cantidadPosterior));
    ok("los dos puestos en cero, en el Libro", json(ceros) === json([0, 0]), json(ceros));
    const aud = await c.auditoriaStock.findMany({ where: { controlStockId: controlId, productoLocalId: P.coca.pl }, orderBy: { id: "asc" } });
    ok(
      "la bitácora de la coca: conteo, dos correcciones, el borrado y el conteo de nuevo",
      json(aud.map((a) => a.accion)) === json(["CONTROL_CONTEO", "CONTROL_CORRECCION", "CONTROL_CORRECCION", "CONTROL_BORRADO", "CONTROL_CONTEO"]),
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
    ok("la lista sin control: 409", l.status === 409, json(l));
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
