// PRUEBA DE BASE: EL BUSCADOR DE PRODUCTOS ENCUENTRA LO MISMO QUE LA CAJA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/buscadorProductosComoLaCaja.mjs
//
// Desde el 2026-10-29 `/api/productos/listar` busca con `buscarComoLaCaja`, las
// mismas piezas que `/api/pos-ventas/buscar-producto`. Esto llama a los dos
// HANDLERS reales con la misma sesión, contra PostgreSQL, y compara para cada
// búsqueda los productos y su orden:
//
//   · por nombre con acentos y sin acentos, y en mayúsculas;
//   · por parte del nombre (inicio de palabra y adentro de una palabra);
//   · por código de barras (principal, secundario y el propio del local);
//   · por código interno del proveedor.
//
// La caja muestra los 10 primeros: se compara contra los primeros de Productos.
// Lo escrito directo es SOLO catálogo, como lo deja Productos.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");

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

const NOMBRE = "erpazul_buscador_productos_caja";
const urlDe = (nombre) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${nombre}`;
  u.search = "";
  return u.toString();
};
const urlPrueba = urlDe(NOMBRE);
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-buscador-productos-0123456789abcdef";

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(urlPrueba);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: un depósito y un local, y un catálogo con nombres parecidos ──
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const mini = await c.local.create({ data: { nombre: "Mini el 7" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: mini.id } });
  for (const l of [deposito, mini]) await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  const proveedor = await c.proveedor.create({ data: { nombre: "Paladini" } });

  const producto = async (nombre, codigo_barra, extra = {}, propio = null) => {
    const b = await c.productoBase.create({
      data: { grupoId: grupo.id, nombre, codigo_barra, unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, ...extra },
    });
    for (const l of [deposito, mini]) {
      const pl = await c.productoLocal.create({
        data: { localId: l.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000, codigo_barra_propio: l.id === mini.id ? propio : null },
      });
      await c.stockLocal.create({ data: { localId: l.id, productoId: pl.id, cantidad: 10 } });
    }
    return b;
  };
  // En un orden que no es el alfabético, para que se note si alguien ordena por nombre.
  const queso = await producto("Queso de jamón", "7790000000203");
  const jamonCocido = await producto("Jamón cocido Paladini", "7790000000201", { proveedor_id: proveedor.id, codigo_barra_secundario: "17790000000201" });
  await producto("Jamon crudo", "7790000000202");
  await producto("Leche La Serenísima", "7790000000301");
  await producto("Leche Cotar entera", "7790000000302", {}, "200000000099");
  await producto("Dulce de leche Cotar", "7790000000303");
  await producto("Galletitas Express", "7790000000401");
  await c.productoCodigoProveedor.create({
    data: { grupoId: grupo.id, proveedorId: proveedor.id, productoBaseId: jamonCocido.id, codigoInterno: "PAL-123", activo: true },
  });
  void queso;
  // Para los inactivos y los sin alta (2026-10-29): una yerba activa, una
  // INACTIVA —ficha y producto del local dados de baja, como los deja
  // Productos— y una SIN ALTA en el Mini —solo la tiene el depósito—.
  const yerbaActiva = await producto("Yerba Taragüi", "7790000000501");
  const yerbaInactiva = await producto("Yerba Playadito", "7790000000502");
  await c.productoBase.update({ where: { id: yerbaInactiva.id }, data: { activo: false } });
  await c.productoLocal.updateMany({ where: { baseId: yerbaInactiva.id }, data: { activo: false } });
  const yerbaSinAlta = await c.productoBase.create({
    data: { grupoId: grupo.id, nombre: "Yerba Rosamonte", codigo_barra: "7790000000503", unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
  });
  await c.productoLocal.create({ data: { localId: deposito.id, baseId: yerbaSinAlta.id, activo: true, precio_costo: 600, precio_venta: 1000 } });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  const rutaProductos = await import("../../app/api/productos/listar/route.js");
  const rutaPos = await import("../../app/api/pos-ventas/buscar-producto/route.js");

  const sesion = `erpazul_sesion=${jwt.sign(
    { id: 501, nombre: "CI", email: "ci@ci.local", rolId: null, rolNombre: null, permisos: ["*"], esAdmin: true, esDuenoLocal: false, localId: mini.id, esDeposito: false },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  )}`;
  const pedir = async (ruta, url) => {
    const req = new Request(url, { headers: { cookie: sesion } });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta.GET(req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const enLaCaja = async (q) => {
    const r = await pedir(rutaPos, `http://ci/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${mini.id}`);
    return { status: r.status, nombres: (r.items || []).map((i) => i.nombre), ids: (r.items || []).map((i) => i.productoBaseId), error: r.error };
  };
  const enProductos = async (q, extra = "") => {
    const r = await pedir(rutaProductos, `http://ci/api/productos/listar?q=${encodeURIComponent(q)}&localId=${mini.id}&pageSize=50${extra}`);
    return { status: r.status, nombres: (r.items || []).map((i) => i.nombre), ids: (r.items || []).map((i) => i.id), total: r.total, error: r.error };
  };

  console.log("\n── Productos encuentra lo mismo que la caja, en el mismo orden ─────────");
  const busquedas = [
    ["por nombre sin acento", "jamon"],
    ["por nombre con acento", "jamón"],
    ["por nombre en mayúsculas con acento", "JAMÓN"],
    ["por parte del nombre, inicio de palabra", "lech"],
    ["por parte del nombre, adentro de una palabra", "erenis"],
    ["por dos palabras", "leche cotar"],
    ["por código de barras", "7790000000201"],
    ["por código de barras secundario", "17790000000201"],
    ["por código propio del local", "200000000099"],
    ["por código interno del proveedor", "PAL-123"],
  ];
  for (const [titulo, q] of busquedas) {
    const caja = await enLaCaja(q);
    const prod = await enProductos(q);
    const primeros = prod.ids.slice(0, caja.ids.length);
    ok(
      `${titulo} («${q}»): ${caja.nombres.length ? caja.nombres.join(", ") : "nada"}`,
      caja.status === 200 && prod.status === 200 && json(primeros) === json(caja.ids) && prod.total === caja.ids.length,
      json({ caja: caja.nombres, productos: prod.nombres, error: caja.error || prod.error })
    );
  }
  const sinAcento = await enProductos("jamon");
  ok("y \"jamon\" encuentra los tres, con y sin acento", sinAcento.total === 3, json(sinAcento.nombres));

  console.log("\n── Los filtros de Productos se aplican encima de la búsqueda ─────────────");
  const conProveedor = await enProductos("jamon", `&proveedorId=${proveedor.id}`);
  ok("\"jamon\" con el proveedor Paladini: solo el cocido", json(conProveedor.ids) === json([jamonCocido.id]), json(conProveedor.nombres));

  console.log("\n── Con inactivos o todos, busca también los inactivos y los sin alta ─────");
  const mismos = (a, b) => json([...a].sort()) === json([...b].sort());
  const todos = await enProductos("yerba", "&estado=todos");
  ok("con Todos, «yerba» trae la activa, la INACTIVA y la SIN ALTA", todos.status === 200 && mismos(todos.ids, [yerbaActiva.id, yerbaInactiva.id, yerbaSinAlta.id]), json(todos));
  const inactivos = await enProductos("yerba", "&estado=inactivos");
  ok("con Inactivos, «yerba» trae la inactiva", inactivos.status === 200 && json(inactivos.ids) === json([yerbaInactiva.id]), json(inactivos));
  const inactivosMayus = await enProductos("PLAYADITO", "&estado=inactivos");
  ok("con Inactivos, las mismas reglas de la caja: «PLAYADITO» la encuentra", json(inactivosMayus.ids) === json([yerbaInactiva.id]), json(inactivosMayus));
  const porCodigoInactiva = await enProductos("7790000000502", "&estado=todos");
  ok("con Todos, por código, la inactiva", json(porCodigoInactiva.ids) === json([yerbaInactiva.id]), json(porCodigoInactiva));
  const porCodigoSinAlta = await enProductos("7790000000503", "&estado=todos");
  ok("con Todos, por código, la sin alta", json(porCodigoSinAlta.ids) === json([yerbaSinAlta.id]), json(porCodigoSinAlta));
  // El orden sigue siendo el de la caja: la que empieza con lo buscado primero.
  const ordenTodos = await enProductos("yerba ros", "&estado=todos");
  ok("con Todos, «yerba ros» trae solo la sin alta", json(ordenTodos.ids) === json([yerbaSinAlta.id]), json(ordenTodos));

  const activos = await enProductos("yerba");
  ok("sin el filtro (activos, el de siempre), «yerba» trae solo la activa", json(activos.ids) === json([yerbaActiva.id]), json(activos));
  const activosPorCodigo = await enProductos("7790000000503");
  ok("sin el filtro, el código de la sin alta no trae nada", activosPorCodigo.total === 0, json(activosPorCodigo));
  const cajaYerba = await enLaCaja("yerba");
  ok("la caja sigue trayendo solo la activa", cajaYerba.status === 200 && json(cajaYerba.ids) === json([yerbaActiva.id]), json(cajaYerba));
  const cajaCodigo = await enLaCaja("7790000000502");
  ok("y por código la caja sigue sin traer la inactiva", cajaCodigo.status === 200 && cajaCodigo.ids.length === 0, json(cajaCodigo));
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
