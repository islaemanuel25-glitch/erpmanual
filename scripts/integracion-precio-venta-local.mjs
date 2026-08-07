// Harness de integración: PRECIO DE VENTA PROPIO DEL LOCAL.
//
// La regla que se verifica acá tiene dos mitades que no hay que confundir:
//   - El COSTO MAESTRO es del dueño del producto (el depósito para los suyos; el
//     local creador para los exclusivos). Un local no lo toca ni por API directa.
//   - El PRECIO DE VENTA de un local es SUYO. Que el producto venga del depósito
//     no se lo bloquea, y lo que define no se derrama al depósito ni a otro local.
//
// Contra dev server + DB de test.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_migration_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-precio-venta-local.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: DATABASE_URL no apunta a *test*."); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

let pass = 0, fail = 0;
const S = {};

function cookieFor(user, { contextoLocalId = null, contextoEsDeposito = false, grupoActivo = null } = {}) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null,
      esDuenoLocal: !!user.esDuenoLocal, esDeposito: !!user.esDeposito },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  const cookies = [`erpazul_sesion=${token}`];
  if (grupoActivo) cookies.push(`erpazul_grupo_activo=${grupoActivo}`);
  if (contextoLocalId) {
    cookies.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: contextoLocalId, esDeposito: contextoEsDeposito }))}`);
  }
  return cookies.join("; ");
}

async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function check(name, r, expectedStatus, extra = null) {
  const res = await r;
  const okStatus = Array.isArray(expectedStatus) ? expectedStatus.includes(res.status) : res.status === expectedStatus;
  const okExtra = extra ? extra(res) : true;
  if (okStatus && okExtra) { console.log(`✔ ${name} → ${res.status}`); pass++; }
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 200)}`); fail++; }
  return res;
}
function assertOk(name, cond, detail = "") {
  if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; }
}

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

const num = (v) => (v == null ? null : Number(v));
const ventaBase = async (baseId) =>
  num((await prisma.productoBase.findUnique({ where: { id: baseId }, select: { precio_venta: true } }))?.precio_venta);
const costoBase = async (baseId) =>
  num((await prisma.productoBase.findUnique({ where: { id: baseId }, select: { precio_costo: true } }))?.precio_costo);
const ventaLocal = async (baseId, localId) =>
  num((await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { precio_venta: true } }))?.precio_venta);
const costoLocal = async (baseId, localId) =>
  num((await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { precio_costo: true } }))?.precio_costo);
const propioLocal = async (baseId, localId) =>
  (await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { codigo_barra_propio: true } }))?.codigo_barra_propio ?? null;

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Venta" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });

  const mk = (nombre, email, rolId, localId) =>
    prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@venta.test", rolAdmin.id, null);
  const duenoDepo = await mk("DuenoDepo", "dd@venta.test", rolDueno.id, depo.id);
  const duenoA = await mk("DuenoA", "da@venta.test", rolDueno.id, localA.id);
  const duenoB = await mk("DuenoB", "db@venta.test", rolDueno.id, localB.id);

  // Sin proveedor a propósito: la regla que se prueba no depende de él y así el
  // harness no arrastra el catálogo de proveedores. Las corridas masivas usan
  // MARGEN_MASIVO, que es el método que no exige proveedorId.
  // Producto del DEPÓSITO, materializado en los tres lugares.
  const baseDepo = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Coca 2L", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 100, precio_venta: 150, margen: 50,
      // Con estos dos cargados se reproduce el bloqueo que sufría un local: el
      // formulario los perdía al reenviar y el servidor lo leía como un intento de
      // tocar la ficha maestra.
      precio_sugerido: 175, iva_porcentaje: 21 },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: baseDepo.id, precio_costo: 100, precio_venta: 150, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseDepo.id, precio_venta: 150, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localB.id, baseId: baseDepo.id, precio_venta: 150, activo: true } });

  // Producto EXCLUSIVO de Local A.
  const baseA = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: localA.id, nombre: "Sandwich A", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 80, precio_venta: 120, margen: 50 },
  });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseA.id, precio_costo: 80, precio_venta: 120, activo: true } });

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    admin: { ...admin, permisos: ["*"] },
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    baseDepo: baseDepo.id, baseA: baseA.id,
  });
}

// `obtener` devuelve el producto en camelCase y el endpoint de edición lee
// snake_case: la interfaz traduce con camelToForm (FormProducto) antes de mandarlo.
// El harness hace la misma traducción, si no estaría probando un payload que la
// aplicación nunca envía.
function itemAPayload(o) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    nombre: o.nombre ?? null,
    descripcion: o.descripcion ?? null,
    sku: o.sku ?? null,
    codigo_barra: o.codigoBarra ?? null,
    codigo_barra_secundario: o.codigoBarraSecundario ?? null,
    categoria_id: n(o.categoriaId),
    proveedor_id: n(o.proveedorId),
    proveedor2_id: n(o.proveedor2Id),
    proveedor3_id: n(o.proveedor3Id),
    area_fisica_id: n(o.areaFisicaId),
    unidad_medida: o.unidadMedida,
    factor_pack: n(o.factorPack),
    peso_kg: n(o.pesoKg),
    volumen_ml: n(o.volumenMl),
    precio_costo: n(o.precioCosto),
    precio_venta: n(o.precioVenta),
    margen: n(o.margen),
    precio_sugerido: n(o.precioSugerido),
    iva_porcentaje: n(o.ivaPorcentaje),
    fecha_vencimiento: o.fechaVencimiento ?? null,
    redondeo_100: Boolean(o.redondeo100),
    activo: Boolean(o.activo),
    imagen_url: o.imagenUrl ?? null,
    es_combo: Boolean(o.esCombo),
    modalidad: o.modalidad ?? "NORMAL",
    modo_pedido: o.modoPedido ?? "BULTO",
    modo_envio: o.modoEnvio ?? "MIXTO",
    modo_stock: o.modoStock ?? "BULTO",
    modoCompraProveedor: o.modoCompraProveedor ?? "BULTO",
    pesoReferenciaKg: n(o.pesoReferenciaKg),
    pesoEsFijo: Boolean(o.pesoEsFijo),
    modoVentaDeposito: o.modoVentaDeposito ?? "PESO",
    actualizaPromedioPorRecepcion: o.actualizaPromedioPorRecepcion ?? true,
  };
}

async function payloadDesde(baseId, localId, cookie, over = {}) {
  const r = await req("GET", `/api/productos/obtener?id=${baseId}&localId=${localId}`, { cookie });
  if (r.status !== 200 || !r.json?.item) throw new Error(`obtener ${baseId}/${localId} → ${r.status}`);
  return { ...itemAPayload(r.json.item), ...over };
}

async function run() {
  await truncateAll();
  await seed();
  const ed = (id, localId) => `/api/productos/editar/${id}?localId=${localId}`;
  const ckDepo = cookieFor(S.duenoDepo);
  const ckA = cookieFor(S.duenoA);
  const ckB = cookieFor(S.duenoB);

  console.log("\n--- 1. Producto de depósito + usuario del depósito ---");
  await check("Depósito edita costo y venta de su producto → 200",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: ckDepo, body: await payloadDesde(S.baseDepo, S.depo, ckDepo, { precio_costo: 110, precio_venta: 165 }) }), 200);
  assertOk("costo maestro = 110", (await costoBase(S.baseDepo)) === 110);
  assertOk("venta maestra = 165", (await ventaBase(S.baseDepo)) === 165);
  // El depósito tiene que VER el precio que acaba de guardar: su propio override no
  // puede quedar con el valor viejo pisando la ficha.
  assertOk("precio efectivo del depósito = 165 (override alineado)",
    (await ventaLocal(S.baseDepo, S.depo)) === 165);

  console.log("\n--- 2. Producto de depósito + dueño de Local A ---");
  const costoMaestroAntes = await costoBase(S.baseDepo);
  await check("Local A intenta cambiar el costo maestro → 403",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: ckA, body: await payloadDesde(S.baseDepo, S.localA, ckA, { precio_costo: 999 }) }), 403,
    (r) => /depósito/i.test(r.json?.error || ""));
  assertOk("costo maestro intacto tras el intento", (await costoBase(S.baseDepo)) === costoMaestroAntes);

  const ventaBaseAntes = await ventaBase(S.baseDepo);
  const ventaBAntes = await ventaLocal(S.baseDepo, S.localB);
  await check("Local A cambia SU precio de venta → 200",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: ckA, body: await payloadDesde(S.baseDepo, S.localA, ckA, { precio_venta: 210, margen: 60 }) }), 200);
  assertOk("venta de A = 210", (await ventaLocal(S.baseDepo, S.localA)) === 210);
  const baseTrasVenta = await prisma.productoBase.findUnique({
    where: { id: S.baseDepo }, select: { precio_sugerido: true, iva_porcentaje: true },
  });
  assertOk("precio sugerido de la base no se perdió", Number(baseTrasVenta.precio_sugerido) === 175);
  assertOk("iva de la base no se perdió", Number(baseTrasVenta.iva_porcentaje) === 21);
  assertOk("venta maestra del depósito intacta", (await ventaBase(S.baseDepo)) === ventaBaseAntes);
  assertOk("venta de B intacta", (await ventaLocal(S.baseDepo, S.localB)) === ventaBAntes);
  assertOk("costo maestro intacto", (await costoBase(S.baseDepo)) === costoMaestroAntes);

  await check("obtener desde A: costo bloqueado, ficha maestra bloqueada",
    req("GET", `/api/productos/obtener?id=${S.baseDepo}&localId=${S.localA}`, { cookie: ckA }), 200,
    (r) => r.json?.puedeEditarCosto === false && r.json?.puedeEditarBase === false);

  console.log("\n--- 3. El mismo producto en Local B es independiente de Local A ---");
  await check("Local B cambia SU precio de venta → 200",
    req("PUT", ed(S.baseDepo, S.localB), { cookie: ckB, body: await payloadDesde(S.baseDepo, S.localB, ckB, { precio_venta: 333 }) }), 200);
  assertOk("venta de B = 333", (await ventaLocal(S.baseDepo, S.localB)) === 333);
  assertOk("venta de A sigue 210 (no la pisó B)", (await ventaLocal(S.baseDepo, S.localA)) === 210);
  assertOk("venta maestra sigue intacta", (await ventaBase(S.baseDepo)) === ventaBaseAntes);

  console.log("\n--- 3b. El depósito guarda su ficha: no debe pisar los precios propios ---");
  // Sin mandar el costo, la propagación por margen no se dispara y lo único que
  // corre es la alineación del propietario. Es el caso que aísla este cambio.
  const pDepoSinCosto = await payloadDesde(S.baseDepo, S.depo, ckDepo, { precio_venta: 180 });
  delete pDepoSinCosto.precio_costo;
  await check("Depósito guarda su ficha con venta 180 y SIN costo → 200",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: ckDepo, body: pDepoSinCosto }), 200);
  assertOk("precio efectivo del depósito = 180", (await ventaLocal(S.baseDepo, S.depo)) === 180);
  assertOk("la venta propia de A sobrevive (210)", (await ventaLocal(S.baseDepo, S.localA)) === 210);
  assertOk("la venta propia de B sobrevive (333)", (await ventaLocal(S.baseDepo, S.localB)) === 333);

  // Diagnóstico de la propagación PREEXISTENTE: cuando el guardado del depósito SÍ
  // lleva el costo, syncFromBaseToLocales recalcula el precio de TODAS las
  // ubicaciones que tengan margen configurado. No se rediseña acá; se documenta.
  const antesProp = { a: await ventaLocal(S.baseDepo, S.localA), b: await ventaLocal(S.baseDepo, S.localB) };
  await check("Depósito guarda su ficha CON costo (dispara la propagación) → 200",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: ckDepo, body: await payloadDesde(S.baseDepo, S.depo, ckDepo, { precio_costo: 120, precio_venta: 180 }) }), 200);
  const despuesProp = { a: await ventaLocal(S.baseDepo, S.localA), b: await ventaLocal(S.baseDepo, S.localB) };
  console.log(`  · propagación preexistente por margen: A ${antesProp.a} → ${despuesProp.a}, B ${antesProp.b} → ${despuesProp.b}`);
  // Restaurar los precios propios para los casos que siguen.
  await prisma.productoLocal.updateMany({ where: { baseId: S.baseDepo, localId: S.localA }, data: { precio_venta: 210 } });
  await prisma.productoLocal.updateMany({ where: { baseId: S.baseDepo, localId: S.localB }, data: { precio_venta: 333 } });

  console.log("\n--- 4. Producto propio de Local A + dueño de Local A ---");
  await check("Local A edita costo y venta de su producto exclusivo → 200",
    req("PUT", ed(S.baseA, S.localA), { cookie: ckA, body: await payloadDesde(S.baseA, S.localA, ckA, { precio_costo: 95, precio_venta: 190, nombre: "Sandwich A editado" }) }), 200);
  assertOk("costo efectivo del exclusivo = 95",
    ((await costoLocal(S.baseA, S.localA)) ?? (await costoBase(S.baseA))) === 95);
  assertOk("venta maestra del exclusivo = 190 (la edición del dueño se guardó)",
    (await ventaBase(S.baseA)) === 190);
  // Ojo: al cambiar el COSTO, la sincronización recalcula el precio del override por
  // el margen configurado y le aplica el redondeo a 100. Es la regla vigente del ERP
  // y no tiene que ver con permisos, así que acá no se la fuerza. Para verificar que
  // el dueño manda sobre su precio de venta, se edita la venta SIN tocar el costo.
  await check("Local A cambia solo la venta de su exclusivo (sin tocar el costo) → 200",
    req("PUT", ed(S.baseA, S.localA), { cookie: ckA, body: await payloadDesde(S.baseA, S.localA, ckA, { precio_venta: 250 }) }), 200);
  assertOk("venta maestra del exclusivo = 250", (await ventaBase(S.baseA)) === 250);
  assertOk("el costo del exclusivo no se movió (95)",
    ((await costoLocal(S.baseA, S.localA)) ?? (await costoBase(S.baseA))) === 95);
  // El dueño tiene que ver su propio cambio: sin la alineación, su override seguía
  // en el valor anterior y la pantalla mostraba el precio viejo tras recargar.
  assertOk("precio efectivo del dueño = 250 (override alineado)",
    (await ventaLocal(S.baseA, S.localA)) === 250);
  await check("obtener del exclusivo desde A: ficha maestra editable",
    req("GET", `/api/productos/obtener?id=${S.baseA}&localId=${S.localA}`, { cookie: ckA }), 200,
    (r) => r.json?.puedeEditarCosto === true && r.json?.puedeEditarBase === true);

  console.log("\n--- 5. Producto propio de Local A visto desde Local B ---");
  await check("Local B intenta abrir el exclusivo de A → 404",
    req("GET", `/api/productos/obtener?id=${S.baseA}&localId=${S.localB}`, { cookie: ckB }), 404);
  const costoExclusivoAntes = (await costoLocal(S.baseA, S.localA)) ?? (await costoBase(S.baseA));
  const ventaExclusivaAntes = (await ventaLocal(S.baseA, S.localA)) ?? (await ventaBase(S.baseA));
  await check("Local B intenta editar el exclusivo de A → 403",
    req("PUT", ed(S.baseA, S.localB), { cookie: ckB, body: { nombre: "Robado", unidad_medida: "unidad", factor_pack: 1, precio_costo: 1, precio_venta: 2, activo: true, es_combo: false } }), 403);
  assertOk("costo del exclusivo de A intacto",
    (((await costoLocal(S.baseA, S.localA)) ?? (await costoBase(S.baseA))) === costoExclusivoAntes));
  assertOk("venta del exclusivo de A intacta",
    (((await ventaLocal(S.baseA, S.localA)) ?? (await ventaBase(S.baseA))) === ventaExclusivaAntes));
  assertOk("B no se apropió del producto (sin ProductoLocal en B)",
    (await prisma.productoLocal.findFirst({ where: { baseId: S.baseA, localId: S.localB } })) === null);

  console.log("\n--- 6. Bypass por API directa del costo maestro ---");
  const costoAntesBypass = await costoBase(S.baseDepo);
  await check("Bypass: A manda precio_costo por API → 403",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: ckA, body: await payloadDesde(S.baseDepo, S.localA, ckA, { precio_costo: 7777 }) }), 403);
  assertOk("costo maestro intacto tras el bypass", (await costoBase(S.baseDepo)) === costoAntesBypass);

  await check("Bypass: A pide localId del depósito → 403 (no puede operar ajeno)",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: ckA, body: await payloadDesde(S.baseDepo, S.localA, ckA, { precio_costo: 8888 }) }), [403, 404]);
  assertOk("costo maestro intacto tras pedir localId ajeno", (await costoBase(S.baseDepo)) === costoAntesBypass);

  console.log("\n--- 7. Actualización masiva de precios desde un local ---");
  const ventaBaseAntesMasiva = await ventaBase(S.baseDepo);
  const ventaBAntesMasiva = await ventaLocal(S.baseDepo, S.localB);
  await check("Masiva desde Local A sobre producto de depósito → 200, solo venta local",
    req("POST", "/api/productos/precios/apply", {
      cookie: ckA,
      body: { metodo: "MARGEN_MASIVO", pricingMode: "SET_VENTA",
        items: [{ productoBaseId: S.baseDepo, costoAnterior: costoAntesBypass, costoNuevo: 5555, ventaAnterior: 210, ventaNueva: 260 }] },
    }), 200, (r) => r.json?.soloVenta === 1 && r.json?.saltados?.length === 0);
  assertOk("masiva: costo maestro intacto", (await costoBase(S.baseDepo)) === costoAntesBypass);
  assertOk("masiva: venta de A = 260", (await ventaLocal(S.baseDepo, S.localA)) === 260);
  assertOk("masiva: venta maestra intacta", (await ventaBase(S.baseDepo)) === ventaBaseAntesMasiva);
  assertOk("masiva: venta de B intacta", (await ventaLocal(S.baseDepo, S.localB)) === ventaBAntesMasiva);

  await check("Masiva desde el Depósito sobre su producto → 200 aplicado a la base",
    req("POST", "/api/productos/precios/apply", {
      cookie: ckDepo,
      body: { metodo: "MARGEN_MASIVO", pricingMode: "SET_VENTA",
        items: [{ productoBaseId: S.baseDepo, costoAnterior: costoAntesBypass, costoNuevo: 130, ventaAnterior: ventaBaseAntesMasiva, ventaNueva: 199 }] },
    }), 200, (r) => r.json?.applied === 1);
  assertOk("masiva del depósito SÍ cambió el costo maestro (130)", (await costoBase(S.baseDepo)) === 130);
  assertOk("masiva del depósito NO pisó la venta propia de A (260)", (await ventaLocal(S.baseDepo, S.localA)) === 260);

  console.log("\n--- 8. Código propio por ubicación (soporte existente) ---");
  await check("Local A asigna su código propio en un producto de depósito → 200",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: ckA, body: await payloadDesde(S.baseDepo, S.localA, ckA, { codigo_barra_propio: "AAA111" }) }), 200);
  assertOk("código propio guardado en A", (await propioLocal(S.baseDepo, S.localA)) === "AAA111");
  assertOk("B no heredó el código propio de A", (await propioLocal(S.baseDepo, S.localB)) === null);
  assertOk("costo maestro sigue intacto tras el código propio", (await costoBase(S.baseDepo)) === 130);
}

run()
  .then(async () => {
    await prisma.$disconnect();
    console.log(`\n== PRECIO-VENTA-LOCAL: ${pass} pass / ${fail} fail ==`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
