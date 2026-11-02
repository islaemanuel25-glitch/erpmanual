// PRUEBA DE BASE: EL PDF DE UN PEDIDO AL DEPÓSITO, POR SUS RUTAS REALES.
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs scripts/pruebas-db/pedidoPdf.mjs
//
// Con el molde de `pedidosEnviarCancelar.mjs`: la siembra —un grupo propio con
// su local y su depósito, las cuentas y los productos— se escribe directo, como
// la dejan Locales, Usuarios y Productos. Todo lo del pedido va por sus rutas:
// el local lo arma con `set-cantidad` y lo manda con `solicitar`; el depósito
// decide líneas con `detalle/editar`. Después se pide el PDF
// (`app/api/pedidos/pdf/[id]`) con cada sesión:
//
//   1. el local que lo pidió, recién enviado: 200, PDF, sin columna Preparado;
//   2. el depósito, después de decidir líneas: 200, con Preparado y "No hay";
//   3. el local de OTRO grupo: 404;
//   4. un cajero del mismo local, sin permiso de pedidos: 403.
//
// Con ESCRIBIR_FIXTURE=1 deja lo medido en `lib/pedidos/pdfDelPedido.fixture.json`,
// que es lo que leen los candados (`lib/pedidos/pdfDelPedido.test.mjs`): el
// status, los encabezados y los TEXTOS que el PDF dibuja, sacados del PDF.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";

const c = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, CAJERO } = await import("../../lib/rbac/systemRoles.js");

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

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-pedidos-0123456789abcdef";

/** Los textos que dibuja un PDF de `pdf-lib`: cada `drawText` es un `<HEX> Tj`. */
function textosDelPdf(bytes) {
  const crudo = Buffer.from(bytes);
  const textos = [];
  let desde = 0;
  for (;;) {
    const i = crudo.indexOf("stream", desde, "latin1");
    if (i === -1) break;
    const inicio = crudo[i + 6] === 0x0d ? i + 8 : i + 7;
    const fin = crudo.indexOf("endstream", inicio, "latin1");
    let plano = null;
    try {
      plano = zlib.inflateSync(crudo.subarray(inicio, fin)).toString("latin1");
    } catch {
      plano = crudo.subarray(inicio, fin).toString("latin1");
    }
    for (const m of plano.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) textos.push(Buffer.from(m[1], "hex").toString("latin1"));
    desde = fin + 9;
  }
  return textos;
}

const medido = {};

try {
  const marca = Date.now();
  const sembrarGrupo = async (sufijo) => {
    const grupo = await c.grupo.create({ data: { nombre: `Grupo pdf ${sufijo} ${marca}` } });
    await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
    const local = await c.local.create({ data: { nombre: `Mini Centro ${sufijo} ${marca}` } });
    const depo = await c.local.create({ data: { nombre: `Depósito ${sufijo} ${marca}`, es_deposito: true } });
    await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
    await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: depo.id } });
    for (const l of [local, depo]) await c.configuracionLocal.create({ data: { localId: l.id } });
    return { grupo, local, depo };
  };
  const A = await sembrarGrupo("A");
  const B = await sembrarGrupo("B");

  const rol = async (nombre) =>
    (await c.rol.findUnique({ where: { nombre } })) ??
    (await c.rol.create({ data: { nombre, esSistema: true, permisos: DEFAULT_PERMISOS_SISTEMA[nombre] } }));
  const rolEnc = await rol(ENCARGADO);
  const rolCaj = await rol(CAJERO);

  const cuenta = async (nombre, r, local, extra = {}) => {
    const u = await c.usuario.create({
      data: { nombre, email: `pdf-${nombre.replace(/\W+/g, "")}-${marca}@ci.local`, passwordHash: "x", rolId: r.id, localId: local.id },
    });
    return `erpazul_sesion=${jwt.sign(
      { id: u.id, nombre: u.nombre, email: u.email, rolId: r.id, rolNombre: r.nombre, permisos: r.permisos, esDuenoLocal: false, localId: local.id, esDeposito: !!local.es_deposito, ...extra },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  };
  const sesionLocal = await cuenta("Encargada A", rolEnc, A.local);
  const sesionDepo = await cuenta("Depósito A", rolEnc, A.depo);
  const sesionOtroGrupo = await cuenta("Encargada B", rolEnc, B.local);
  const sesionCajero = await cuenta("Cajero A", rolCaj, A.local);
  const ana = await c.operadorLocal.create({ data: { nombre: "Ana", pinHash: "x", localId: A.local.id } });
  const pinLocal = `${sesionLocal}; erpazul_operador_activo=${jwt.sign({ operadorId: ana.id, nombre: ana.nombre, localId: A.local.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
  const beto = await c.operadorLocal.create({ data: { nombre: "Beto", pinHash: "x", localId: A.depo.id } });
  const pinDepo = `${sesionDepo}; erpazul_operador_activo=${jwt.sign({ operadorId: beto.id, nombre: beto.nombre, localId: A.depo.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;

  // Productos del depósito, en dos categorías, con costo y venta cargados: el
  // PDF NO tiene que mostrarlos.
  const bebidas = await c.categoria.create({ data: { nombre: `Bebidas ${marca}` } });
  const almacen = await c.categoria.create({ data: { nombre: `Almacén ${marca}` } });
  const delDeposito = async (nombre, codigo_barra, categoria_id, extra = {}) => {
    const b = await c.productoBase.create({
      data: { grupoId: A.grupo.id, nombre, codigo_barra, unidad_medida: "unidad", precio_costo: 4321.5, precio_venta: 8765.25, redondeo_100: false, activo: true, categoria_id, ...extra },
    });
    const pl = await c.productoLocal.create({ data: { localId: A.depo.id, baseId: b.id, activo: true, precio_costo: 4321.5, precio_venta: 8765.25 } });
    await c.stockLocal.create({ data: { localId: A.depo.id, productoId: pl.id, cantidad: 50 } });
    return pl.id;
  };
  const coca = await delDeposito("Coca 2L", `77${marca}1`.slice(0, 13), bebidas.id);
  const agua = await delDeposito("Agua x10", `77${marca}2`.slice(0, 13), bebidas.id, { unidad_medida: "pack", factor_pack: 10 });
  const yerba = await delDeposito("Yerba 1kg", `77${marca}3`.slice(0, 13), almacen.id);

  const R = {
    setCantidad: await import("../../app/api/pedidos/set-cantidad/route.js"),
    solicitar: await import("../../app/api/pos-transferencias/solicitar/route.js"),
    detalle: await import("../../app/api/pos-transferencias/detalle/route.js"),
    editar: await import("../../app/api/pos-transferencias/detalle/editar/route.js"),
    pdf: await import("../../app/api/pedidos/pdf/[id]/route.js"),
  };
  const pedir = async (ruta, metodo, url, cookie, body = undefined) => {
    const req = new Request(url, {
      method: metodo,
      headers: { cookie, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await ruta[metodo](req);
    return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
  };
  const BASE = "http://ci/api";
  const pedirPdf = async (posId, cookie) => {
    const url = `${BASE}/pedidos/pdf/${posId}`;
    const req = new Request(url, { headers: { cookie } });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    const r = await R.pdf.GET(req, { params: Promise.resolve({ id: String(posId) }) });
    const tipo = r.headers.get("content-type") || "";
    const salida = { status: r.status, contentType: tipo, disposicion: r.headers.get("content-disposition") };
    if (tipo.includes("application/pdf")) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      salida.empiezaConPdf = Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
      salida.textos = textosDelPdf(bytes);
    } else {
      salida.cuerpo = await r.json().catch(() => ({}));
    }
    return salida;
  };

  console.log("\n── El local arma y manda el pedido");
  let posId = null;
  for (const [p, cant, unidad] of [[yerba, 4, "UNIDAD"], [coca, 3, "UNIDAD"], [agua, 2, "BULTO"]]) {
    const r = await pedir(R.setCantidad, "POST", `${BASE}/pedidos/set-cantidad`, pinLocal, { productoLocalId: p, cantidad: cant, unidad });
    ok(`set-cantidad ${cant} ${unidad}`, r.status === 200 && r.cuerpo.ok === true, json(r));
    posId = r.cuerpo.posId;
  }
  const sol = await pedir(R.solicitar, "POST", `${BASE}/pos-transferencias/solicitar`, pinLocal, { posId });
  ok("solicitar con PIN", sol.status === 200 && sol.cuerpo.ok === true, json(sol));

  console.log("\n── 1. El local baja el PDF");
  medido.local = await pedirPdf(posId, sesionLocal);
  ok("200 y application/pdf", medido.local.status === 200 && medido.local.contentType === "application/pdf", json(medido.local));
  ok("el archivo es un PDF", medido.local.empiezaConPdf === true);
  console.log("   ", medido.local.disposicion);
  console.log("   ", json(medido.local.textos));

  console.log("\n── 2. El depósito decide líneas y lo baja");
  const det = await pedir(R.detalle, "GET", `${BASE}/pos-transferencias/detalle?posId=${posId}`, sesionDepo);
  ok("el depósito lee el detalle", det.status === 200 && det.cuerpo.ok === true, json(det));
  const linea = (id) => det.cuerpo.item.detalles.find((d) => d.productoLocalId === id);
  const noHay = await pedir(R.editar, "POST", `${BASE}/pos-transferencias/detalle/editar`, pinDepo, { detalleId: linea(coca).detalleId, preparado: 0, unidadPreparada: "UNIDAD" });
  ok("No hay en la coca", noHay.status === 200 && noHay.cuerpo.ok !== false, json(noHay));
  const completo = await pedir(R.editar, "POST", `${BASE}/pos-transferencias/detalle/editar`, pinDepo, { detalleId: linea(agua).detalleId, preparado: 2, unidadPreparada: "BULTO" });
  ok("va completo el agua", completo.status === 200 && completo.cuerpo.ok !== false, json(completo));
  medido.deposito = await pedirPdf(posId, sesionDepo);
  ok("200 y application/pdf", medido.deposito.status === 200 && medido.deposito.contentType === "application/pdf", json(medido.deposito));
  console.log("   ", json(medido.deposito.textos));

  console.log("\n── 3. Otro grupo");
  medido.otroGrupo = await pedirPdf(posId, sesionOtroGrupo);
  ok("404", medido.otroGrupo.status === 404, json(medido.otroGrupo));

  console.log("\n── 4. Un cajero sin permiso de pedidos");
  medido.cajero = await pedirPdf(posId, sesionCajero);
  ok("403", medido.cajero.status === 403, json(medido.cajero));

  console.log("\n── 5. Sin sesión");
  medido.sinSesion = await pedirPdf(posId, "");
  ok("401", medido.sinSesion.status === 401, json(medido.sinSesion));

  // Lo que el candado necesita para comparar sin la marca de la corrida.
  medido.siembra = {
    posId,
    local: A.local.nombre,
    deposito: A.depo.nombre,
    categorias: [bebidas.nombre, almacen.nombre],
    costo: "4321",
    venta: "8765",
  };

  if (process.env.ESCRIBIR_FIXTURE === "1") {
    writeFileSync(new URL("../../lib/pedidos/pdfDelPedido.fixture.json", import.meta.url), `${JSON.stringify(medido, null, 2)}\n`);
    console.log("\nFixture escrito en lib/pedidos/pdfDelPedido.fixture.json");
  }
} finally {
  await c.$disconnect();
}

console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) process.exit(1);
