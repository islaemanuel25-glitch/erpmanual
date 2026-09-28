// CONFORMIDAD DE LA FUNCIÓN CANÓNICA CON EL POS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/costoPorUnidadFisica.mjs
//
// `costoPorUnidadFisica` no inventa otra interpretación de los casos que hoy
// funcionan: para cada familia en la que el POS y la regla de negocio coinciden,
// el costo por unidad física que devuelve la función es el `precioCostoUnitario`
// que devuelve `buscar-producto` —la ruta real, con sesiones firmadas como las
// firma el login—, en el depósito y en un local.
//
// La cuenta del POS vive adentro del handler (`buscar-producto/route.js`,
// 262-318), así que no hay función pura con qué comparar: se llama la ruta.
//
// Y la divergencia conocida queda escrita como afirmación: un producto por kg
// con PIEZA, peso y compra POR BULTO —el Chisito—. El POS lo muestra por kilo en
// el depósito (`esFiambreFijo` exige compra por unidad) y la regla lo cuenta por
// pieza. Si esto se pone rojo, el POS cambió: revisar y pasarlo a conformidad.
//
// Base descartable, borrada al terminar. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { costoPorUnidadFisica } = await import("../../lib/conversiones/costoPorUnidadFisica.js");

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
const centavos = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

const NOMBRE = "erpazul_costo_fisico_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

// Cada familia con su configuración real y un precio de venta mayor a cero: el
// POS solo divide el costo del pack cuando la venta es positiva
// (`buscar-producto:283`), y ese defecto no es lo que se mide acá.
const FAMILIAS = [
  {
    clave: "MORTADELA",
    nombre: "Mortadela pieza fija",
    base: { unidad_medida: "kg", pesoReferenciaKg: 4.5, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" },
    costo: 10000,
  },
  {
    clave: "MANI",
    nombre: "Mani con cascara x2kg",
    base: { unidad_medida: "kg", factor_pack: 2, pesoReferenciaKg: 2, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" },
    costo: 4500,
  },
  {
    clave: "KGPESO",
    nombre: "Salame por peso",
    base: { unidad_medida: "kg", pesoReferenciaKg: null, modoVentaDeposito: "PESO", modoCompraProveedor: "BULTO" },
    costo: 3800,
  },
  { clave: "UNIDAD", nombre: "Alfajor suelto", base: { unidad_medida: "unidad" }, costo: 1000 },
  { clave: "PACK", nombre: "Gaseosa pack x6", base: { unidad_medida: "pack", factor_pack: 6 }, costo: 12000 },
  { clave: "CAJON", nombre: "Cerveza cajon x8", base: { unidad_medida: "cajon", factor_pack: 8 }, costo: 24000 },
];
const CHISITO = {
  clave: "CHISITO",
  nombre: "Chisito bolsa 400g",
  base: { unidad_medida: "kg", pesoReferenciaKg: 0.4, modoVentaDeposito: "PIEZA", modoCompraProveedor: "BULTO" },
  costo: 5000,
};

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
  const grupo = await c.grupo.create({ data: { nombre: "Costo físico" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const local = await c.local.create({ data: { nombre: "Local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });

  const sembrados = [];
  for (const f of [...FAMILIAS, CHISITO]) {
    const base = await c.productoBase.create({
      data: {
        grupoId: grupo.id,
        nombre: f.nombre,
        precio_costo: f.costo,
        precio_venta: f.costo * 2,
        creadoEnLocalId: deposito.id,
        ...f.base,
      },
    });
    for (const l of [deposito, local]) {
      const pl = await c.productoLocal.create({ data: { localId: l.id, baseId: base.id } });
      await c.stockLocal.create({ data: { localId: l.id, productoId: pl.id, cantidad: 10 } });
    }
    sembrados.push({ ...f, base });
  }

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  const rutaBuscar = await import("../../app/api/pos-ventas/buscar-producto/route.js");
  const sesion = (localId) =>
    jwt.sign(
      { id: 1, nombre: "CI costo físico", email: "ci@local", localId, grupoId: grupo.id, permisos: ["pos.usar"] },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const delPos = async (nombre, l) => {
    const res = await rutaBuscar.GET(
      new Request(`http://ci/api/pos-ventas/buscar-producto?q=${encodeURIComponent(nombre)}&localId=${l.id}`, {
        headers: { cookie: `erpazul_sesion=${sesion(l.id)}` },
      })
    );
    const cuerpo = await res.json().catch(() => ({}));
    return (cuerpo.items || []).find((i) => i.nombre === nombre) ?? null;
  };

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Conformidad: POS y función dan lo mismo por unidad física");
  // ══════════════════════════════════════════════════════════════════════════
  for (const f of sembrados.filter((s) => s.clave !== "CHISITO")) {
    for (const [l, esDeposito] of [
      [deposito, true],
      [local, false],
    ]) {
      const item = await delPos(f.nombre, l);
      const r = costoPorUnidadFisica({ costoBase: f.base.precio_costo, costoLocal: null, producto: f.base, esDeposito });
      const donde = `${f.clave} en ${esDeposito ? "depósito" : "local"}`;
      ok(`${donde}: el POS lo encuentra`, item !== null);
      ok(
        `${donde}: ${r.unidadFisica} a ${centavos(r.costoPorUnidadFisica)}`,
        item !== null && centavos(item.precioCostoUnitario) === centavos(r.costoPorUnidadFisica),
        `POS ${item?.precioCostoUnitario}, función ${r.costoPorUnidadFisica}`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Divergencia conocida: kg + PIEZA + peso + compra por bulto");
  // ══════════════════════════════════════════════════════════════════════════
  const chisito = sembrados.find((s) => s.clave === "CHISITO");
  const enDeposito = await delPos(chisito.nombre, deposito);
  const rDeposito = costoPorUnidadFisica({ costoBase: chisito.base.precio_costo, producto: chisito.base, esDeposito: true });
  ok(
    "el POS lo costea por kilo en el depósito (esFiambreFijo exige compra por unidad)",
    centavos(enDeposito?.precioCostoUnitario) === 5000,
    `POS ${enDeposito?.precioCostoUnitario}`
  );
  ok(
    "la función lo cuenta por pieza, como manda la regla: 0,400 kg × $5.000 = $2.000",
    rDeposito.unidadFisica === "PIEZA" && rDeposito.costoPorUnidadFisica === 2000,
    JSON.stringify(rDeposito)
  );
  const enLocal = await delPos(chisito.nombre, local);
  const rLocal = costoPorUnidadFisica({ costoBase: chisito.base.precio_costo, producto: chisito.base, esDeposito: false });
  ok(
    "en el local coinciden: por kilo, $5.000",
    centavos(enLocal?.precioCostoUnitario) === 5000 && rLocal.costoPorUnidadFisica === 5000,
    `POS ${enLocal?.precioCostoUnitario}, función ${rLocal.costoPorUnidadFisica}`
  );
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
