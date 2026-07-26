// Harness de integración de los ROLES NUEVOS (CAJERO / ENCARGADO / DUEÑO_LOCAL)
// contra los endpoints reales vía HTTP. Verifica la matriz de permisos, el scope
// estricto por local, los guards de rol de sistema (esSistema) y localId obligatorio.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_roles_test?schema=public" \
//   AUTH_SECRET="<el del .env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-roles-nuevos.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, CAJERO, ENCARGADO, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) {
  console.error("ABORT: DATABASE_URL no apunta a una base de *test*.");
  process.exit(2);
}
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error("ABORT: falta AUTH_SECRET.");
  process.exit(2);
}
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

let pass = 0, fail = 0;
const S = {};
const PASS_LOGIN = "secret123";

function cookieFor(user) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null, esDeposito: !!user.esDeposito },
    AUTH_SECRET,
    { expiresIn: "8h" }
  );
  return `erpazul_sesion=${token}`;
}

async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function check(name, promiseOrVal, expectedStatus, extra = null) {
  try {
    const r = await promiseOrVal;
    const okStatus = Array.isArray(expectedStatus) ? expectedStatus.includes(r.status) : r.status === expectedStatus;
    const okExtra = extra ? extra(r) : true;
    if (okStatus && okExtra) { console.log(`✔ ${name} → ${r.status}`); pass++; }
    else { console.log(`✖ ${name} → ${r.status} (esperado ${expectedStatus})  ${JSON.stringify(r.json)?.slice(0, 100)}`); fail++; }
    return r;
  } catch (e) {
    console.log(`✖ ${name} → EXCEPCIÓN ${e.message}`); fail++;
    return { status: 0 };
  }
}

async function limpiar() {
  await prisma.cajaMovimiento.deleteMany({}).catch(() => {});
  await prisma.ventaDetalleComponente.deleteMany({});
  await prisma.ventaDetalle.deleteMany({});
  await prisma.venta.deleteMany({});
  await prisma.turno.deleteMany({}).catch(() => {});
  await prisma.posTransferenciaDetalle.deleteMany({}).catch(() => {});
  await prisma.posTransferencia.deleteMany({}).catch(() => {});
  await prisma.movimientoCuenta.deleteMany({}).catch(() => {});
  await prisma.clientePuntoMovimiento.deleteMany({}).catch(() => {});
  await prisma.operadorEnLocal.deleteMany({}).catch(() => {});
  await prisma.operadorLocal.deleteMany({}).catch(() => {});
  await prisma.stockLocal.deleteMany({});
  await prisma.productoLocal.deleteMany({});
  await prisma.productoBase.deleteMany({});
  await prisma.configuracionLocal.deleteMany({}).catch(() => {});
  await prisma.grupoLocal.deleteMany({});
  await prisma.grupoDeposito.deleteMany({});
  await prisma.configuracionGrupo.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.rol.deleteMany({});
  await prisma.local.deleteMany({});
  await prisma.grupo.deleteMany({});
}

async function seed() {
  await limpiar();
  const hash = await bcrypt.hash(PASS_LOGIN, 8);

  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolCajero = await prisma.rol.create({ data: { nombre: CAJERO, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO], esSistema: true } });
  const rolEnc = await prisma.rol.create({ data: { nombre: ENCARGADO, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const gA = await prisma.grupo.create({ data: { nombre: "GrupoA" } });
  const depoA = await prisma.local.create({ data: { nombre: "DepoA", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: gA.id, localId: depoA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: gA.id, localId: localA.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: gA.id, allowNegativeStock: false } });

  const gB = await prisma.grupo.create({ data: { nombre: "GrupoB" } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: gB.id, localId: localB.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: gB.id, allowNegativeStock: false } });

  const mkUser = (nombre, email, rolId, localId) =>
    prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const adminU = await mkUser("AdminU", "admin@rn.test", rolAdmin.id, null);
  const cajeroA = await mkUser("CajeroA", "cajero@rn.test", rolCajero.id, localA.id);
  const encargadoA = await mkUser("EncargadoA", "enc@rn.test", rolEnc.id, localA.id);
  const duenoA = await mkUser("DuenoA", "duenoa@rn.test", rolDueno.id, localA.id);
  const duenoB = await mkUser("DuenoB", "duenob@rn.test", rolDueno.id, localB.id);

  // Producto en local A (para productos.ver de ENCARGADO)
  const base = await prisma.productoBase.create({ data: { grupoId: gA.id, creadoEnLocalId: depoA.id, nombre: "ProdA", unidad_medida: "unidad", precio_costo: 100, precio_venta: 200 } });
  const pl = await prisma.productoLocal.create({ data: { localId: localA.id, baseId: base.id, precio_costo: 100, precio_venta: 200, activo: true } });
  await prisma.stockLocal.create({ data: { localId: localA.id, productoId: pl.id, cantidad: 10 } });
  // Venta en local A (para costos.ver)
  const ventaA = await prisma.venta.create({ data: { localId: localA.id, vendedorId: encargadoA.id, numero: 1, subtotal: 200, total: 200, costoTotal: 100, gananciaBruta: 100, gananciaNeta: 100, formaPago: "efectivo" } });

  Object.assign(S, {
    gA: gA.id, gB: gB.id, localA: localA.id, localB: localB.id, depoA: depoA.id,
    rolCajero: rolCajero.id, rolAdmin: rolAdmin.id,
    baseId: base.id, ventaA: ventaA.id,
    userAdmin: { ...adminU, permisos: ["*"] },
    cajeroA: { ...cajeroA, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] },
    encargadoA: { ...encargadoA, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL] },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL] },
  });
}

async function main() {
  try {
    const ping = await fetch(`${BASE}/login`, { method: "GET" });
    if (!ping.ok && ping.status !== 200) throw new Error("status " + ping.status);
  } catch (e) {
    console.error(`ABORT: no hay dev server en ${BASE} (${e.message}).`);
    process.exit(3);
  }

  await seed();
  const CAJ = cookieFor(S.cajeroA);
  const ENC = cookieFor(S.encargadoA);
  const DUE = cookieFor(S.duenoA);
  const DUEB = cookieFor(S.duenoB);
  const ADM = cookieFor(S.userAdmin);

  console.log("\n=== CAJERO (POS mínimo, sin admin/costos/config) ===");
  await check("CAJERO abre turno propio → NO 401/403 (scope+perm OK)", req("POST", `/api/pos-ventas/turnos/abrir`, { cookie: CAJ, body: { localId: S.localA, montoInicial: 0 } }), [200, 428, 409, 400], (r) => ![401, 403].includes(r.status));
  await check("CAJERO NO ve productos (sin productos.ver) → 403", req("GET", `/api/productos/obtener?id=${S.baseId}&localId=${S.localA}`, { cookie: CAJ }), 403);
  await check("CAJERO NO ve reportes de ventas → 403", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-01-01`, { cookie: CAJ }), 403);
  await check("CAJERO NO configura stock del local → 403", req("POST", `/api/config/stock-negativo`, { cookie: CAJ, body: { allowNegativeStock: true } }), 403);
  await check("CAJERO NO gestiona usuarios → 403", req("POST", `/api/usuarios/crear`, { cookie: CAJ, body: { nombre: "x", email: "x1@rn.test", password: "123456", rolId: S.rolCajero, localId: S.localA } }), 403);

  console.log("\n=== ENCARGADO (operación diaria, sin config crítica/usuarios/costos) ===");
  await check("ENCARGADO ve su producto → 200", req("GET", `/api/productos/obtener?id=${S.baseId}&localId=${S.localA}`, { cookie: ENC }), 200);
  await check("ENCARGADO ve reportes de ventas → 200", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-01-01`, { cookie: ENC }), 200);
  await check("ENCARGADO NO configura stock del local → 403", req("POST", `/api/config/stock-negativo`, { cookie: ENC, body: { allowNegativeStock: true } }), 403);
  await check("ENCARGADO NO configura ticket → 403", req("POST", `/api/config/ticket`, { cookie: ENC, body: { config: { x: 1 } } }), 403);
  await check("ENCARGADO NO gestiona usuarios → 403", req("POST", `/api/usuarios/crear`, { cookie: ENC, body: { nombre: "x", email: "x2@rn.test", password: "123456", rolId: S.rolCajero, localId: S.localA } }), 403);
  await check("ENCARGADO detalle venta SIN costos (verCostos=false)", req("GET", `/api/reportes-ventas/detalle/${S.ventaA}`, { cookie: ENC }), 200, (r) => r.json?.permisos?.verCostos === false);

  console.log("\n=== DUEÑO_LOCAL (admin del local propio) ===");
  await check("DUEÑO configura vender-sin-stock del local → 200", req("POST", `/api/config/stock-negativo`, { cookie: DUE, body: { allowNegativeStock: true } }), 200);
  await check("DUEÑO configura cliente-obligatorio del local → 200", req("POST", `/api/config/pos-ventas-cliente`, { cookie: DUE, body: { exigirClienteVenta: true } }), 200);
  await check("DUEÑO configura ticket del local → 200", req("POST", `/api/config/ticket`, { cookie: DUE, body: { config: { encabezado: "X" } } }), 200);
  await check("DUEÑO ve detalle venta CON costos (verCostos=true)", req("GET", `/api/reportes-ventas/detalle/${S.ventaA}`, { cookie: DUE }), 200, (r) => r.json?.permisos?.verCostos === true);
  await check("DUEÑO crea usuario en SU local → 201", req("POST", `/api/usuarios/crear`, { cookie: DUE, body: { nombre: "Nuevo", email: "nuevo@rn.test", password: "123456", rolId: S.rolCajero, localId: S.localA } }), 201);
  await check("DUEÑO NO puede asignar rol Admin → 403", req("POST", `/api/usuarios/crear`, { cookie: DUE, body: { nombre: "Y", email: "y@rn.test", password: "123456", rolId: S.rolAdmin, localId: S.localA } }), 403);
  await check("DUEÑO crea operador en SU local → 200", req("POST", `/api/operador/crear`, { cookie: DUE, body: { nombre: "OpUno", pin: "1234", localIds: [S.localA] } }), 200);
  await check("DUEÑO crea operador en OTRO local → 403", req("POST", `/api/operador/crear`, { cookie: DUE, body: { nombre: "OpDos", pin: "1234", localIds: [S.localB] } }), 403);

  console.log("\n=== SCOPE CROSS-LOCAL ===");
  await check("DUEÑO A configura stock con localId AJENO (B) → 403", req("POST", `/api/config/stock-negativo?localId=${S.localB}`, { cookie: DUE, body: { allowNegativeStock: true } }), 403);
  await check("DUEÑO B (otro local) configura stock por su cuenta → 200", req("POST", `/api/config/stock-negativo`, { cookie: DUEB, body: { allowNegativeStock: false } }), 200);
  await check("DUEÑO B edita usuario de local A → 403/404", req("PUT", `/api/usuarios/editar/${S.encargadoA?.id ?? 0}`, { cookie: DUEB, body: { nombre: "hack" } }), [403, 404]);

  console.log("\n=== GUARDS esSistema (vía admin) ===");
  await check("admin NO elimina rol de sistema CAJERO → 400", req("DELETE", `/api/roles/eliminar/${S.rolCajero}`, { cookie: ADM }), 400);
  await check("admin NO renombra rol de sistema CAJERO → 400", req("PUT", `/api/roles/editar/${S.rolCajero}`, { cookie: ADM, body: { nombre: "CAJERO2" } }), 400);
  await check("admin SÍ ajusta permisos de CAJERO (sin *) → 200", req("PUT", `/api/roles/editar/${S.rolCajero}`, { cookie: ADM, body: { permisos: ["pos.usar", "clientes.crear"] } }), 200);
  await check("admin NO agrega '*' a CAJERO → 400", req("PUT", `/api/roles/editar/${S.rolCajero}`, { cookie: ADM, body: { permisos: ["*"] } }), 400);

  console.log("\n=== localId OBLIGATORIO para roles por-local ===");
  await check("admin crea CAJERO SIN local → 400", req("POST", `/api/usuarios/crear`, { cookie: ADM, body: { nombre: "SinLocal", email: "sl@rn.test", password: "123456", rolId: S.rolCajero, localId: null } }), 400);
  await check("admin crea CAJERO CON local → 201", req("POST", `/api/usuarios/crear`, { cookie: ADM, body: { nombre: "ConLocal", email: "cl@rn.test", password: "123456", rolId: S.rolCajero, localId: S.localA } }), 201);

  console.log("\n=== APARIENCIA INSTITUCIONAL POR LOCAL ===");
  // Admin operando con local de contexto (session.localId = localA).
  const ADM_A = cookieFor({ id: S.userAdmin.id, rolId: S.rolAdmin, permisos: ["*"], localId: S.localA });
  await check("Sin ConfiguracionLocal → GET apariencia usa fallback (null)", req("GET", `/api/config/apariencia-local`, { cookie: DUE }), 200, (r) => r.json?.apariencia == null);
  await check("CAJERO (sin config_local.apariencia) modifica → 403", req("PUT", `/api/config/apariencia-local`, { cookie: CAJ, body: { apariencia: { tema: "sunmiLight" } } }), 403);
  await check("ENCARGADO (sin config_local.apariencia) modifica → 403", req("PUT", `/api/config/apariencia-local`, { cookie: ENC, body: { apariencia: { tema: "sunmiLight" } } }), 403);
  await check("DUEÑO modifica apariencia de SU local → 200", req("PUT", `/api/config/apariencia-local`, { cookie: DUE, body: { apariencia: { tema: "sunmiLight" } } }), 200, (r) => r.json?.apariencia?.tema === "sunmiLight");
  await check("DUEÑO consulta apariencia de su local → 200", req("GET", `/api/config/apariencia-local`, { cookie: DUE }), 200, (r) => r.json?.apariencia?.tema === "sunmiLight");
  await check("Otro usuario del MISMO local ve la misma apariencia institucional", req("GET", `/api/config/apariencia-local`, { cookie: ENC }), 200, (r) => r.json?.apariencia?.tema === "sunmiLight");
  await check("DUEÑO modifica OTRO local (localId ajeno) → 403", req("PUT", `/api/config/apariencia-local?localId=${S.localB}`, { cookie: DUE, body: { apariencia: { tema: "sunmiDark" } } }), 403);
  await check("Admin (contexto localA) modifica apariencia → 200", req("PUT", `/api/config/apariencia-local`, { cookie: ADM_A, body: { apariencia: { tema: "sunmiDark" } } }), 200, (r) => r.json?.apariencia?.tema === "sunmiDark");

  console.log(`\nRESULTADO ROLES NUEVOS: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERROR harness:", e);
  await prisma.$disconnect();
  process.exit(1);
});
