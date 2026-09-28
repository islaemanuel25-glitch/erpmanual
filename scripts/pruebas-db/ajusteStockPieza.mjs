// EL AJUSTE DE STOCK DEL PESO FIJO, CONTRA LA RUTA REAL Y POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/ajusteStockPieza.mjs
//
// El modal de ajuste manda la cantidad en la unidad de la fila —piezas en el
// depósito para el peso fijo, kilos en un local— y la ruta la suma, la resta o
// la fija tal cual, sin convertir. Esto lo comprueba llamando a
// `/api/stock_locales/ajustar` con una sesión firmada como la firma el login, y
// mirando la fila de `StockLocal` y su rastro en `AuditoriaStock`.
//
// Y la única regla nueva: media pieza no. Un rechazo no mueve el stock ni deja
// fila de auditoría. Los kilos siguen admitiendo decimales.
//
// Base descartable, borrada al terminar. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production.

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
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

const NOMBRE = "erpazul_ajuste_pieza_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

// La configuración que el formulario de producto permite cargar: la venta por
// pieza solo aparece con compra "por pieza".
const pesoFijo = (peso, o = {}) => ({
  unidad_medida: "kg",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: peso,
  pesoEsFijo: true,
  modoVentaDeposito: "PIEZA",
  ...o,
});
const PRODUCTOS = [
  { clave: "CHISITO", nombre: "QUETH CHISITOS 400G", base: pesoFijo(0.4), deposito: 6, local: 2.4 },
  { clave: "MANI", nombre: "MANI CON CASCARA x2KG", base: pesoFijo(2, { factor_pack: 2 }), deposito: 3, local: 6 },
  { clave: "MORTADELA", nombre: "Mortadela", base: pesoFijo(4.5), deposito: 2, local: 9 },
  {
    clave: "VARIABLE",
    nombre: "Cremoso",
    base: { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, modoVentaDeposito: "PESO" },
    deposito: 4.73,
    local: 4.73,
  },
  { clave: "UNIDAD", nombre: "Alfajor", base: { unidad_medida: "unidad" }, deposito: 10, local: 10 },
  { clave: "PACK", nombre: "Gaseosa x6", base: { unidad_medida: "pack", factor_pack: 6 }, deposito: 45, local: 12 },
];

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  const urlPsql = (() => {
    const u = new URL(urlPrueba);
    u.search = "";
    return u.toString();
  })();
  aplicarMigraciones(urlPsql);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: un grupo con su depósito y un local ─────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Ajuste pieza" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const local = await c.local.create({ data: { nombre: "Local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  // La auditoría tiene la FK al usuario en la base: la sesión firma uno real.
  const rol = await c.rol.create({ data: { nombre: "CI ajuste", permisos: ["stock.editar"] } });
  const usuario = await c.usuario.create({
    data: { nombre: "CI ajuste", email: "ci-ajuste@ci.local", passwordHash: "x", rolId: rol.id },
  });

  const pl = {};
  for (const p of PRODUCTOS) {
    const base = await c.productoBase.create({
      data: { grupoId: grupo.id, nombre: p.nombre, precio_costo: 1000, precio_venta: 2000, creadoEnLocalId: deposito.id, ...p.base },
    });
    pl[p.clave] = {};
    for (const [l, cantidad, donde] of [
      [deposito, p.deposito, "deposito"],
      [local, p.local, "local"],
    ]) {
      const fila = await c.productoLocal.create({ data: { localId: l.id, baseId: base.id } });
      await c.stockLocal.create({ data: { localId: l.id, productoId: fila.id, cantidad } });
      pl[p.clave][donde] = { productoLocalId: fila.id, localId: l.id };
    }
  }

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  const ruta = await import("../../app/api/stock_locales/ajustar/route.js");
  const sesion = (localId) =>
    jwt.sign(
      { id: usuario.id, nombre: "CI ajuste", email: "ci@local", localId, grupoId: grupo.id, permisos: ["stock.editar"] },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const ajustar = async (clave, donde, tipo, cantidad) => {
    const { productoLocalId, localId } = pl[clave][donde];
    const res = await ruta.POST(
      new Request("http://ci/api/stock_locales/ajustar", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `erpazul_sesion=${sesion(localId)}` },
        body: JSON.stringify({ modo: "ajuste", localId, productoLocalId, cantidad, tipo, motivo: "prueba" }),
      })
    );
    return { status: res.status, cuerpo: await res.json().catch(() => ({})) };
  };
  const stockDe = async (clave, donde) => {
    const { productoLocalId, localId } = pl[clave][donde];
    const s = await c.stockLocal.findUnique({ where: { localId_productoId: { localId, productoId: productoLocalId } } });
    return Number(s.cantidad);
  };
  const auditorias = (clave, donde) => c.auditoriaStock.count({ where: { productoLocalId: pl[clave][donde].productoLocalId } });

  // Un ajuste aceptado: 200, la fila queda en lo esperado y deja un rastro más.
  const aceptado = async (titulo, clave, donde, tipo, cantidad, espera) => {
    const antes = await auditorias(clave, donde);
    const r = await ajustar(clave, donde, tipo, cantidad);
    const ahora = await stockDe(clave, donde);
    ok(`${titulo}: ${ahora}`, r.status === 200 && r.cuerpo.ok === true && ahora === espera, `status ${r.status} ${JSON.stringify(r.cuerpo)} stock ${ahora}`);
    ok(`${titulo}: deja su fila de auditoría`, (await auditorias(clave, donde)) === antes + 1);
  };
  // Un ajuste rechazado: 400, el stock no se mueve y no queda rastro.
  const rechazado = async (titulo, clave, donde, tipo, cantidad) => {
    const stockAntes = await stockDe(clave, donde);
    const antes = await auditorias(clave, donde);
    const r = await ajustar(clave, donde, tipo, cantidad);
    ok(`${titulo}: rechazado`, r.status === 400 && /no se fraccionan/.test(r.cuerpo.error ?? ""), `status ${r.status} ${JSON.stringify(r.cuerpo)}`);
    ok(`${titulo}: el stock no se movió`, (await stockDe(clave, donde)) === stockAntes);
    ok(`${titulo}: no dejó auditoría`, (await auditorias(clave, donde)) === antes);
  };

  // ══════════════════════════════════════════════════════════════════════════
  seccion("CHISITO 400G en el depósito: 6 piezas");
  // ══════════════════════════════════════════════════════════════════════════
  await aceptado("sumar 2 a 6", "CHISITO", "deposito", "sumar", 2, 8);
  await aceptado("volver a 6", "CHISITO", "deposito", "fijar", 6, 6);
  await aceptado("restar 2 a 6", "CHISITO", "deposito", "restar", 2, 4);
  await aceptado("fijar stock real 10", "CHISITO", "deposito", "fijar", 10, 10);
  await rechazado("sumar 0,5 pieza", "CHISITO", "deposito", "sumar", 0.5);
  await rechazado("fijar 2,5 piezas", "CHISITO", "deposito", "fijar", 2.5);
  await rechazado("restar 0,4 (un kilo disfrazado)", "CHISITO", "deposito", "restar", 0.4);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("CHISITO 400G en el local: 2,4 kg");
  // ══════════════════════════════════════════════════════════════════════════
  await aceptado("sumar 0,5 kg a 2,4", "CHISITO", "local", "sumar", 0.5, 2.9);
  await aceptado("fijar 1,234 kg", "CHISITO", "local", "fijar", 1.234, 1.234);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("MANÍ 2KG y MORTADELA 4,5 KG: piezas en el depósito, kilos en el local");
  // ══════════════════════════════════════════════════════════════════════════
  await aceptado("maní: sumar 1 pieza a 3", "MANI", "deposito", "sumar", 1, 4);
  await rechazado("maní: sumar 0,5 pieza", "MANI", "deposito", "sumar", 0.5);
  await aceptado("maní: sumar 0,5 kg a 6 en el local", "MANI", "local", "sumar", 0.5, 6.5);
  await rechazado("mortadela: fijar 1,5 piezas", "MORTADELA", "deposito", "fijar", 1.5);
  await aceptado("mortadela: restar 1 pieza a 2", "MORTADELA", "deposito", "restar", 1, 1);
  await aceptado("mortadela: restar 0,25 kg a 9 en el local", "MORTADELA", "local", "restar", 0.25, 8.75);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Lo que no es pieza no cambia");
  // ══════════════════════════════════════════════════════════════════════════
  await aceptado("peso variable en el depósito: sumar 0,27 kg a 4,73", "VARIABLE", "deposito", "sumar", 0.27, 5);
  await aceptado("unidad en el depósito: sumar 2", "UNIDAD", "deposito", "sumar", 2, 12);
  await aceptado("pack en el depósito: sumar 6 unidades (1 bulto)", "PACK", "deposito", "sumar", 6, 51);
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
