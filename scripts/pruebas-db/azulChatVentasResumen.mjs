// AZUL CHAT · `ventas_resumen` CONTRA EL REPORTE DEL ERP, EN POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatVentasResumen.mjs
//
// Lo que ningún candado puede probar, porque vive en la base:
//
//   A. MISMA SEMÁNTICA: para cada período y cada local, la integración y
//      `/api/reportes-ventas/general` —el handler real, con una sesión firmada—
//      dan la misma cantidad, el mismo total y el mismo desglose por medio;
//   B. los números esperados, escritos a mano: la anulada y la interna no
//      entran, el pago mixto se reparte, FIADO no es efectivo, la corrección
//      cuenta con su importe vigente, y la medianoche es la argentina;
//   C. la CONTRAPRUEBA: la misma consulta sin el filtro comercial cuenta la
//      anulada y la interna, así que el fixture de verdad ejerce el filtro;
//   D. la AUTORIZACIÓN contra las filas reales: usuario inactivo, sin permiso,
//      permiso quitado EN VIVO, local fuera de alcance, grupo manipulado, local
//      inexistente, admin con local fijo, capacidad fuera del catálogo;
//   E. la PUERTA: sin firma no entra aunque traiga una cookie de admin válida, y
//      con firma la cookie no amplía nada;
//   F. el VÍNCULO por sus rutas reales del ERP: sin vínculo no entra, el código
//      de A no sirve como B, revocar corta en la próxima consulta, reautorizar
//      mata el código viejo, quién puede revocar a otro, y tres autorizaciones
//      simultáneas dejan uno solo vigente;
//   G. lo que garantiza la BASE: las columnas, que no se guarda ningún secreto,
//      el trigger que solo deja revocar, los CHECK, el índice parcial y la FK.
//
// Las ventas entran por `/api/pos-ventas/crear`, la corrección por
// `/api/pos-ventas/venta/[id]/corregir`, la anulación por el motor real
// (`revertirVenta`) y la venta interna por `crear` desde el depósito a un cliente
// vinculado. Lo único escrito directo es la HORA de tres ventas, para ponerlas
// en los bordes del día argentino: `crear` siempre fecha "ahora".
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { crearProductoVendible, abrirTurnoDePrueba } = await import("./fixturePos.mjs");

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

const NOMBRE = "erpazul_azul_chat_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

// El secreto de la integración solo existe en esta prueba, y es distinto del de
// las sesiones a propósito.
const SECRETO = "prueba-azul-chat-0123456789abcdef0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };

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

  // ── Siembra ─────────────────────────────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  const grupo2 = await c.grupo.create({ data: { nombre: "Grupo dos" } });
  for (const g of [grupo, grupo2]) await c.configuracionGrupo.create({ data: { grupoId: g.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const localA = await c.local.create({ data: { nombre: "Local A" } });
  const localB = await c.local.create({ data: { nombre: "Local B" } });
  const localX = await c.local.create({ data: { nombre: "Local X" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const [g, l] of [[grupo, localA], [grupo, localB], [grupo2, localX]]) {
    await c.grupoLocal.create({ data: { grupoId: g.id, localId: l.id } });
  }
  for (const l of [deposito, localA]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  }

  const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
  const rolAdmin = await c.rol.create({ data: { nombre: "CI admin", permisos: ["*"] } });
  const rolEncargado = await c.rol.create({ data: { nombre: "CI encargado", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolSinReportes = await c.rol.create({ data: { nombre: "CI sin reportes", permisos: ["pos.usar"] } });
  const usuario = (nombre, rolId, localId, activo = true) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId, activo } });
  const U = {
    vendedorA: await usuario("vendedor-a", rolAdmin.id, localA.id),
    vendedorD: await usuario("vendedor-d", rolAdmin.id, deposito.id),
    adminGlobal: await usuario("admin-global", rolAdmin.id, null),
    adminEnX: await usuario("admin-en-x", rolAdmin.id, localX.id),
    encargadoA: await usuario("encargado-a", rolEncargado.id, localA.id),
    inactivoA: await usuario("inactivo-a", rolEncargado.id, localA.id, false),
    sinReportesA: await usuario("sin-reportes-a", rolSinReportes.id, localA.id),
    sinVinculoA: await usuario("sin-vinculo-a", rolEncargado.id, localA.id),
    gestorA: await usuario("gestor-a", (await c.rol.create({ data: { nombre: "CI gestor local", permisos: ["usuarios.gestionar_local"] } })).id, localA.id),
  };
  ok("el ENCARGADO tiene reportes.ver: es un rol real que ve el reporte", DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("reportes.ver"));

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  process.env.CORRECCION_VENTAS_BETA_USER_IDS = String(U.vendedorA.id);
  const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
  const rutaCorregir = await import("../../app/api/pos-ventas/venta/[id]/corregir/route.js");
  const rutaReporte = await import("../../app/api/reportes-ventas/general/route.js");
  const rutaAutorizar = await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  const rutaRevocar = await import("../../app/api/integraciones/azul-chat/vinculo/revocar/route.js");
  const { hashCodigoVinculo } = await import("../../lib/integraciones/vinculos/codigoVinculo.js");
  const { revertirVenta } = await import("../../lib/pos-ventas/reversionVenta.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const { fechaArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
  const { whereVentaComercial } = await import("../../lib/ventas/filtroVentaComercial.js");

  // Las sesiones, con la forma del payload de `app/api/login/route.js`.
  const sesion = ({ id, localId, permisos, esDeposito = false }) =>
    jwt.sign(
      { id, nombre: `CI ${id}`, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cookieVendedor = (u, esDeposito = false) => ({
    cookie: `erpazul_sesion=${sesion({ id: u.id, localId: u.localId, permisos: ["*"], esDeposito })}`,
    "content-type": "application/json",
  });

  // ── Ventas por la ruta real ─────────────────────────────────────────────
  const turnoA = await abrirTurnoDePrueba(c, { localId: localA.id, vendedorId: U.vendedorA.id });
  const turnoD = await abrirTurnoDePrueba(c, { localId: deposito.id, vendedorId: U.vendedorD.id });
  const pA = await crearProductoVendible(c, { grupoId: grupo.id, localId: localA.id, nombre: "Producto A", precioVenta: 10, precioCosto: 6, stock: 100000 });
  const pD = await crearProductoVendible(c, { grupoId: grupo.id, localId: deposito.id, nombre: "Producto D", precioVenta: 10, precioCosto: 6, stock: 100000 });
  const clienteFiado = await c.cliente.create({ data: { grupoId: grupo.id, localId: localA.id, nombre: "Cliente fiado" } });
  const clienteVinculadoA = await c.cliente.create({ data: { grupoId: grupo.id, localId: deposito.id, nombre: "Local A (interno)", localVinculadoId: localA.id } });

  let nTxn = 0;
  async function vender({ vendedor, local, turno, producto, total, pagos, clienteId = null, esDeposito = false }) {
    const res = await rutaCrear.POST(new Request("http://ci/api/pos-ventas/crear", {
      method: "POST",
      headers: cookieVendedor(vendedor, esDeposito),
      body: json({
        clientTxnId: `azul-chat-${++nTxn}`, localId: local.id, turnoId: turno.id, clienteId,
        formaPago: pagos.length > 1 ? "mixto" : pagos[0].medio.toLowerCase(), totalPantalla: total, pagos,
        items: [{ productoBaseId: producto.baseId, nombre: "Producto", precio: 10, cantidad: total / 10, precioCosto: 6, esServicio: false }],
      }),
    }));
    const r = await res.json().catch(() => ({}));
    if (res.status !== 200 || !r.ok) throw new Error(`crear venta ${nTxn}: ${res.status} ${r.error || json(r)}`);
    return r.ventaId;
  }
  const ventaA = (total, pagos, extra = {}) => vender({ vendedor: U.vendedorA, local: localA, turno: turnoA, producto: pA, total, pagos, ...extra });

  const V = {
    efectivo: await ventaA(2000, [{ medio: "EFECTIVO", monto: 2000 }]),
    mixta: await ventaA(2000, [{ medio: "EFECTIVO", monto: 500 }, { medio: "DEBITO", monto: 1500 }]),
    fiado: await ventaA(1000, [{ medio: "FIADO", monto: 1000 }], { clienteId: clienteFiado.id }),
    corregida: await ventaA(3000, [{ medio: "EFECTIVO", monto: 3000 }]),
    anulada: await ventaA(700, [{ medio: "EFECTIVO", monto: 700 }]),
    bordeAyer: await ventaA(100, [{ medio: "EFECTIVO", monto: 100 }]),
    bordeHoy: await ventaA(10, [{ medio: "EFECTIVO", monto: 10 }]),
    bordeAnteayer: await ventaA(40, [{ medio: "EFECTIVO", monto: 40 }]),
    depoComercial: await vender({ vendedor: U.vendedorD, local: deposito, turno: turnoD, producto: pD, total: 400, pagos: [{ medio: "EFECTIVO", monto: 400 }], esDeposito: true }),
    depoInterna: await vender({ vendedor: U.vendedorD, local: deposito, turno: turnoD, producto: pD, total: 5000, pagos: [{ medio: "EFECTIVO", monto: 5000 }], clienteId: clienteVinculadoA.id, esDeposito: true }),
  };
  const interna = await c.transferencia.findFirst({ where: { ventaId: V.depoInterna }, select: { id: true } });
  ok("la venta del depósito al cliente vinculado nació interna: tiene su remito", interna != null);
  const filaFiado = await c.venta.findUnique({ where: { id: V.fiado }, select: { esFiado: true, pagos: { select: { medio: true } } } });
  igual("el fiado quedó como lo escribe crear: esFiado y un tender FIADO", [filaFiado.esFiado, filaFiado.pagos.map((p) => p.medio)], [true, ["FIADO"]]);

  // La corrección, por su ruta: de $3000 en efectivo a $1000 por Mercado Pago.
  {
    const fila = await c.venta.findUnique({ where: { id: V.corregida }, select: { version: true } });
    const res = await rutaCorregir.POST(
      new Request(`http://ci/api/pos-ventas/venta/${V.corregida}/corregir`, {
        method: "POST", headers: cookieVendedor(U.vendedorA),
        body: json({
          motivo: "se cobró de más", idempotencyKey: "azul-chat-corr-1", version: fila.version,
          lineas: [{ productoBaseId: pA.baseId, cantidad: 100, precio: 10 }],
          pagos: [{ medio: "MERCADOPAGO", monto: 1000 }],
        }),
      }),
      { params: Promise.resolve({ id: String(V.corregida) }) }
    );
    const r = await res.json().catch(() => ({}));
    ok("la corrección se aplica por su ruta", res.status === 200 && r.ok !== false, `${res.status} ${r.error || ""} ${r.code || ""}`);
    const despues = await c.venta.findUnique({ where: { id: V.corregida }, select: { total: true, corregida: true, pagos: { select: { medio: true, monto: true } } } });
    igual("la venta corregida quedó con su importe y su medio nuevos",
      [Number(despues.total), despues.corregida, despues.pagos.map((p) => [p.medio, Number(p.monto)])],
      [1000, true, [["MERCADOPAGO", 1000]]]);
  }

  // La anulación, por el motor real.
  {
    const venta = await c.venta.findUnique({
      where: { id: V.anulada },
      select: {
        id: true, numero: true, total: true, esFiado: true, clienteId: true, localId: true, operadorId: true, turnoId: true, version: true, anuladaEn: true,
        turno: { select: { id: true, cierre: true } },
        pagos: { select: { medio: true, monto: true } },
        detalles: { select: { id: true, nombre: true, productoLocalId: true, cantidadStock: true, componentes: { select: { productoLocalId: true, cantidad: true } } } },
      },
    });
    await c.$transaction((tx) => revertirVenta(tx, { venta, grupoId: grupo.id, usuarioId: U.vendedorA.id, motivo: "prueba azul chat", versionEsperada: venta.version }));
    const fila = await c.venta.findUnique({ where: { id: V.anulada }, select: { anuladaEn: true } });
    ok("la venta anulada quedó marcada, no borrada", fila?.anuladaEn != null);
  }

  // Los bordes del día argentino. `ahora` se fija una vez para toda la prueba.
  const ahora = Date.now();
  const hoy = fechaArgentinaISO(new Date(ahora));
  const dia = (n) => fechaArgentinaISO(new Date(Date.parse(`${hoy}T12:00:00.000-03:00`) - n * 86400000));
  const ayer = dia(1);
  const anteayer = dia(2);
  await c.venta.update({ where: { id: V.bordeAyer }, data: { fecha: new Date(`${ayer}T23:59:59.999-03:00`) } });
  await c.venta.update({ where: { id: V.bordeHoy }, data: { fecha: new Date(`${hoy}T00:00:00.000-03:00`) } });
  await c.venta.update({ where: { id: V.bordeAnteayer }, data: { fecha: new Date(`${anteayer}T23:59:59.999-03:00`) } });
  // El resto se movió a la mitad de hoy: si la prueba corre a las 00:00:05, una
  // venta creada a las 23:59:59 caería ayer y los números esperados mentirían.
  await c.venta.updateMany({
    where: { id: { in: [V.efectivo, V.mixta, V.fiado, V.corregida, V.anulada, V.depoComercial, V.depoInterna] } },
    data: { fecha: new Date(`${hoy}T12:00:00.000-03:00`) },
  });
  ok("el borde de ayer cae a las 02:59:59.999 UTC de hoy: el error de la zona se vería",
    new Date(`${ayer}T23:59:59.999-03:00`).toISOString().slice(0, 10) === hoy);

  // ── El vínculo, por la ruta real del ERP ────────────────────────────────
  //
  // Cada persona autoriza a Azul Chat desde SU sesión. El código vuelve una vez
  // y es lo que Azul Chat manda después. `sinVinculoA` nunca autoriza.
  // La sesión lleva los permisos del ROL de la persona, como los firma el login.
  const cookieDe = async (u) => {
    const { rol } = await c.usuario.findUnique({ where: { id: u.id }, select: { rol: { select: { permisos: true } } } });
    return { cookie: `erpazul_sesion=${sesion({ id: u.id, localId: u.localId, permisos: rol.permisos })}`, "content-type": "application/json" };
  };
  const autorizarPor = async (u) => {
    const r = await rutaAutorizar.POST(new Request("http://ci/api/integraciones/azul-chat/vinculo/autorizar", { method: "POST", headers: await cookieDe(u) }));
    return { status: r.status, cacheControl: r.headers.get("cache-control"), ...(await r.json().catch(() => ({}))) };
  };
  const revocarPor = async (actor, cuerpo) => {
    const r = await rutaRevocar.POST(new Request("http://ci/api/integraciones/azul-chat/vinculo/revocar", {
      method: "POST", headers: await cookieDe(actor), body: cuerpo === undefined ? undefined : json(cuerpo),
    }));
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const CODIGO = {};
  for (const u of [U.adminGlobal, U.encargadoA, U.sinReportesA, U.adminEnX, U.gestorA]) {
    const r = await autorizarPor(u);
    if (r.status !== 200 || !r.codigoVinculo) throw new Error(`autorizar ${u.nombre}: ${r.status} ${json(r)}`);
    CODIGO[u.id] = r.codigoVinculo;
  }

  // ── La integración y el reporte ─────────────────────────────────────────
  //
  // Por defecto delega con el código del propio `usuarioId`; `vinculo` lo pisa.
  const pedirIntegracion = async ({ usuarioId, vinculo, grupoId, localId, periodo, capacidad = "ventas_resumen", extra = {}, cookie = null, firmar = true }) => {
    const delegacion = { usuarioId, vinculo: vinculo === undefined ? CODIGO[usuarioId] : vinculo };
    const cuerpo = json({ capacidad, delegacion, alcance: { grupoId, localId }, parametros: { periodo }, ...extra });
    const marca = String(Math.floor(ahora / 1000));
    const headers = new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca, "content-type": "application/json" });
    if (firmar) headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca, cuerpo }));
    if (cookie) headers.set("cookie", cookie);
    return atenderSolicitudAzulChat({ headers, cuerpo }, { entorno: ENTORNO, ahora });
  };
  const cookieAdminGrupo = `erpazul_sesion=${sesion({ id: U.adminGlobal.id, localId: null, permisos: ["*"] })}; erpazul_grupo_activo=${grupo.id}`;
  const pedirReporte = async ({ localId, desde, hasta }) => {
    const qs = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta, localId: String(localId) }).toString();
    const req = new Request(`http://ci/api/reportes-ventas/general?${qs}`, { headers: { cookie: cookieAdminGrupo } });
    req.nextUrl = new URL(req.url);
    const r = await rutaReporte.GET(req);
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const desgloseDeReporte = (rep) =>
    rep.desglosePago.map((d) => [d.formaPago.toUpperCase(), d.total.toFixed(2), d.cantidad]).sort((a, b) => a[0].localeCompare(b[0]));
  const desgloseDeIntegracion = (d) =>
    d.mediosDePago.map((m) => [m.medio, m.total, m.cantidadPagos]).sort((a, b) => a[0].localeCompare(b[0]));

  seccion("A. Misma semántica que el reporte del ERP");
  const periodos = [
    { nombre: "hoy", periodo: { tipo: "hoy" }, desde: hoy, hasta: hoy },
    { nombre: "ayer", periodo: { tipo: "ayer" }, desde: ayer, hasta: ayer },
    { nombre: "rango anteayer–hoy", periodo: { tipo: "rango", desde: anteayer, hasta: hoy }, desde: anteayer, hasta: hoy },
  ];
  const resultados = {};
  for (const local of [localA, deposito]) {
    for (const p of periodos) {
      const integ = await pedirIntegracion({ usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: local.id, periodo: p.periodo });
      const rep = await pedirReporte({ localId: local.id, desde: p.desde, hasta: p.hasta });
      const d = integ.cuerpo?.datos;
      resultados[`${local.nombre}|${p.nombre}`] = d;
      ok(`${local.nombre}, ${p.nombre}: los dos responden`, integ.status === 200 && rep.status === 200, json({ integ: integ.cuerpo, rep: rep.error }));
      if (!d || rep.status !== 200) continue;
      igual(`${local.nombre}, ${p.nombre}: misma cantidad y mismo total`,
        [d.cantidadVentas, d.totalVendido], [rep.resumen.cantidadVentas, rep.resumen.totalBruto]);
      igual(`${local.nombre}, ${p.nombre}: mismo desglose por medio`, desgloseDeIntegracion(d), desgloseDeReporte(rep));
      igual(`${local.nombre}, ${p.nombre}: el período informado es el pedido`, [d.periodo.desde, d.periodo.hasta, d.periodo.zonaHoraria], [p.desde, p.hasta, "America/Argentina/Cordoba"]);
    }
  }

  seccion("B. Los números, escritos a mano");
  {
    const h = resultados[`${localA.nombre}|hoy`];
    // efectivo 2000 + mixta 2000 + fiado 1000 + corregida 1000 + borde de hoy 10.
    igual("A hoy: cinco ventas por $6010 — sin la anulada", [h?.cantidadVentas, h?.totalVendido], [5, "6010.00"]);
    igual("A hoy: el mixto se reparte, FIADO aparte, la corrección en Mercado Pago",
      h?.mediosDePago.map((m) => [m.medio, m.total, m.cantidadPagos]),
      [["EFECTIVO", "2510.00", 3], ["DEBITO", "1500.00", 1], ["MERCADOPAGO", "1000.00", 1], ["FIADO", "1000.00", 1]]);
    ok("FIADO no se suma al efectivo: el efectivo es 2000 + 500 + 10", h?.mediosDePago.find((m) => m.medio === "EFECTIVO")?.total === "2510.00");
    igual("A hoy: advierte que el día está en curso", h?.advertencias.map((a) => a.codigo), ["DIA_EN_CURSO"]);
    const a = resultados[`${localA.nombre}|ayer`];
    igual("A ayer: solo la de las 23:59:59.999 de ayer", [a?.cantidadVentas, a?.totalVendido, a?.advertencias.length], [1, "100.00", 0]);
    const r = resultados[`${localA.nombre}|rango anteayer–hoy`];
    igual("A anteayer–hoy: las siete, con la de anteayer al límite", [r?.cantidadVentas, r?.totalVendido], [7, "6150.00"]);
    const d = resultados[`${deposito.nombre}|hoy`];
    igual("Depósito hoy: solo la comercial, la interna no entra", [d?.cantidadVentas, d?.totalVendido], [1, "400.00"]);
    ok("la respuesta no trae productos, detalles, comisiones ni ganancia",
      h && !("topProductos" in h) && !("detalles" in h) && !json(h).includes("comision") && !json(h).includes("ganancia"), json(Object.keys(h || {})));
  }

  seccion("C. Contraprueba: sin el filtro comercial, los números cambian");
  {
    const rango = { gte: new Date(`${hoy}T00:00:00.000-03:00`), lte: new Date(`${hoy}T23:59:59.999-03:00`) };
    const crudaA = await c.venta.count({ where: { localId: localA.id, fecha: rango } });
    const comercialA = await c.venta.count({ where: whereVentaComercial({ localId: localA.id, fecha: rango }) });
    igual("A hoy: la consulta cruda cuenta la anulada (6), la comercial no (5)", [crudaA, comercialA], [6, 5]);
    const crudaD = await c.venta.aggregate({ where: { localId: deposito.id, fecha: rango }, _sum: { total: true } });
    igual("Depósito hoy: la cruda suma la interna ($5400), la comercial no", Number(crudaD._sum.total), 5400);
  }

  seccion("D. Autorización contra el ERP de ahora");
  const rechazo = async (titulo, args, codigo) => {
    const r = await pedirIntegracion({ periodo: { tipo: "hoy" }, ...args });
    ok(`${titulo}: ${codigo}`, r.status >= 400 && r.cuerpo?.codigo === codigo && r.cuerpo?.datos === undefined, json({ s: r.status, c: r.cuerpo }));
  };
  {
    const r = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("el encargado de A consulta su local", [r.status, r.cuerpo?.datos?.totalVendido], [200, "6010.00"]);
  }
  await rechazo("encargado de A pidiendo B, de su mismo grupo", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localB.id }, "FUERA_DE_ALCANCE");
  await rechazo("encargado de A pidiendo X, de otro grupo", { usuarioId: U.encargadoA.id, grupoId: grupo2.id, localId: localX.id }, "FUERA_DE_ALCANCE");
  await rechazo("encargado de A pidiendo el depósito", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: deposito.id }, "FUERA_DE_ALCANCE");
  // Desde el vínculo, un inactivo no llega a la pregunta de `activo`: no se
  // pudo vincular (se prueba en F). El inactivo VINCULADO es el de más abajo,
  // desactivado después de autorizar.
  await rechazo("usuario inactivo, que nunca se pudo vincular", { usuarioId: U.inactivoA.id, grupoId: grupo.id, localId: localA.id }, "VINCULO_INEXISTENTE");
  await rechazo("usuario vinculado sin reportes.ver", { usuarioId: U.sinReportesA.id, grupoId: grupo.id, localId: localA.id }, "SIN_PERMISO");
  // Un vínculo de un usuario que no existe no puede existir —FK RESTRICT y la
  // app no borra usuarios—, así que se usa el código de otro: lo frena el vínculo.
  await rechazo("usuario que no existe, con el código de otro", { usuarioId: 999999, vinculo: CODIGO[U.adminGlobal.id], grupoId: grupo.id, localId: localA.id }, "VINCULO_DE_OTRO_USUARIO");
  await rechazo("grupo manipulado: A con el grupo dos", { usuarioId: U.adminGlobal.id, grupoId: grupo2.id, localId: localA.id }, "GRUPO_LOCAL_INCONSISTENTE");
  await rechazo("local que no existe", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: 999999 }, "LOCAL_SIN_GRUPO");
  await rechazo("admin con local fijo en X pidiendo A, de otro grupo", { usuarioId: U.adminEnX.id, grupoId: grupo.id, localId: localA.id }, "FUERA_DE_ALCANCE");
  {
    const r = await pedirIntegracion({ usuarioId: U.adminEnX.id, grupoId: grupo2.id, localId: localX.id, periodo: { tipo: "hoy" } });
    igual("admin con local fijo en X consulta X, sin ventas", [r.status, r.cuerpo?.datos?.cantidadVentas, r.cuerpo?.datos?.totalVendido], [200, 0, "0.00"]);
  }
  await rechazo("capacidad fuera del catálogo", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: localA.id, capacidad: "ejecutar_endpoint" }, "CAPACIDAD_FUERA_DE_CATALOGO");
  await rechazo("un `sql` colado en el cuerpo", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: localA.id, extra: { sql: "select 1" } }, "PEDIDO_INVALIDO");

  // Permiso quitado EN VIVO: la sesión JWT del encargado lo seguiría teniendo
  // ocho horas; la integración lo ve en la próxima pregunta.
  await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO].filter((p) => p !== "reportes.ver") } });
  await rechazo("permiso quitado al rol hace un instante", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id }, "SIN_PERMISO");
  await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  {
    const r = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    ok("permiso devuelto: el MISMO vínculo vuelve a servir, sin volver a autorizar", r.status === 200, json(r));
  }
  await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: false } });
  await rechazo("usuario VINCULADO desactivado hace un instante", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id }, "USUARIO_INACTIVO");
  await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: true } });

  seccion("E. La puerta no usa la sesión del ERP");
  const cookieAdminValida = `erpazul_sesion=${sesion({ id: U.adminGlobal.id, localId: null, permisos: ["*"] })}; erpazul_grupo_activo=${grupo.id}; erpazul_contexto_activo=${encodeURIComponent(json({ localId: localB.id }))}`;
  await rechazo("sin firma, con una cookie de admin VÁLIDA", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: localA.id, cookie: cookieAdminValida, firmar: false }, "FIRMA_INVALIDA");
  await rechazo("con firma y cookie de admin, delegando en el encargado de A, pidiendo B", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localB.id, cookie: cookieAdminValida }, "FUERA_DE_ALCANCE");
  {
    const r = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    ok("y sin ninguna cookie, firmado, el encargado de A consulta su local", r.status === 200 && r.cuerpo?.datos?.local?.id === localA.id, json(r));
  }

  seccion("F. El vínculo: autorizar, delegar, revocar");
  await rechazo("usuario activo, con reportes.ver, que NUNCA autorizó", { usuarioId: U.sinVinculoA.id, vinculo: null, grupoId: grupo.id, localId: localA.id }, "VINCULO_INEXISTENTE");
  await rechazo("el mismo, con un código inventado con la forma correcta", { usuarioId: U.sinVinculoA.id, vinculo: `vin1_${"A".repeat(43)}`, grupoId: grupo.id, localId: localA.id }, "VINCULO_INEXISTENTE");
  {
    const r = await autorizarPor(U.inactivoA);
    igual("un usuario inactivo no puede autorizar", [r.status, r.codigo, r.codigoVinculo], [403, "USUARIO_INACTIVO", undefined]);
    const c1 = await autorizarPor(U.sinVinculoA);
    ok("la respuesta que trae el código no se guarda en ningún caché", c1.cacheControl === "no-store", String(c1.cacheControl));
    // Y se revoca enseguida, para que siga siendo "el que nunca autorizó" en lo que sigue.
    await revocarPor(U.sinVinculoA);
  }
  await rechazo("el código del encargado de A, delegando como el admin global", { usuarioId: U.adminGlobal.id, vinculo: CODIGO[U.encargadoA.id], grupoId: grupo.id, localId: localA.id }, "VINCULO_DE_OTRO_USUARIO");
  await rechazo("el código del admin global, delegando como el encargado de A", { usuarioId: U.encargadoA.id, vinculo: CODIGO[U.adminGlobal.id], grupoId: grupo.id, localId: localB.id }, "VINCULO_DE_OTRO_USUARIO");

  // Revocar el propio: corta en la próxima consulta.
  {
    const r = await revocarPor(U.encargadoA);
    igual("el encargado revoca su propio vínculo", [r.status, r.revocado], [200, true]);
    await rechazo("vínculo recién revocado: corta de inmediato", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id }, "VINCULO_REVOCADO");
    const otra = await revocarPor(U.encargadoA);
    igual("revocar de nuevo no falla: no había vigente", [otra.status, otra.revocado], [200, false]);
    const viejo = CODIGO[U.encargadoA.id];
    const nuevo = await autorizarPor(U.encargadoA);
    ok("volver a autorizar entrega un código NUEVO", nuevo.status === 200 && nuevo.codigoVinculo && nuevo.codigoVinculo !== viejo);
    CODIGO[U.encargadoA.id] = nuevo.codigoVinculo;
    const r2 = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("con el código nuevo, consulta", [r2.status, r2.cuerpo?.datos?.totalVendido], [200, "6010.00"]);
    await rechazo("el código viejo sigue muerto", { usuarioId: U.encargadoA.id, vinculo: viejo, grupoId: grupo.id, localId: localA.id }, "VINCULO_REVOCADO");
  }

  // Reautorizar con un vínculo vigente revoca el anterior.
  {
    const antes = CODIGO[U.adminEnX.id];
    const r = await autorizarPor(U.adminEnX);
    CODIGO[U.adminEnX.id] = r.codigoVinculo;
    await rechazo("reautorizar revoca el código anterior", { usuarioId: U.adminEnX.id, vinculo: antes, grupoId: grupo2.id, localId: localX.id }, "VINCULO_REVOCADO");
    const vigentes = await c.vinculoIntegracion.count({ where: { usuarioId: U.adminEnX.id, revocadoEn: null } });
    igual("y queda un solo vínculo vigente", vigentes, 1);
  }

  // Revocar el de OTRO: la regla de dar de baja.
  {
    const sinPermiso = await revocarPor(U.sinReportesA, { usuarioId: U.adminEnX.id });
    igual("sin gestión de usuarios no se revoca el de otro", [sinPermiso.status, sinPermiso.codigo], [403, "SIN_PERMISO"]);
    const fuera = await revocarPor(U.gestorA, { usuarioId: U.adminEnX.id });
    igual("el gestor del local A no revoca a uno del local X", [fuera.status, fuera.codigo], [403, "FUERA_DE_ALCANCE"]);
    const dentro = await revocarPor(U.gestorA, { usuarioId: U.sinReportesA.id });
    igual("el gestor del local A revoca a uno de su local", [dentro.status, dentro.revocado], [200, true]);
    const porAdmin = await revocarPor(U.adminGlobal, { usuarioId: U.adminEnX.id });
    igual("el admin revoca a uno de otro grupo", [porAdmin.status, porAdmin.revocado], [200, true]);
    const fila = await c.vinculoIntegracion.findFirst({ where: { usuarioId: U.adminEnX.id }, orderBy: { id: "desc" } });
    igual("la revocación dice quién la hizo", fila?.revocadoPorId, U.adminGlobal.id);
    await rechazo("revocado por el admin: Azul Chat ya no puede", { usuarioId: U.adminEnX.id, grupoId: grupo2.id, localId: localX.id }, "VINCULO_REVOCADO");
    const malo = await revocarPor(U.encargadoA, { usuarioId: U.adminEnX.id, permisos: ["*"] });
    igual("revocar no acepta claves de más", [malo.status, malo.codigo], [400, "PEDIDO_INVALIDO"]);
  }

  // Dos autorizaciones simultáneas: una sola queda vigente.
  {
    const rs = await Promise.all([autorizarPor(U.gestorA), autorizarPor(U.gestorA), autorizarPor(U.gestorA)]);
    const vigentes = await c.vinculoIntegracion.count({ where: { usuarioId: U.gestorA.id, revocadoEn: null } });
    ok(`tres autorizaciones a la vez: un solo vínculo vigente, y ninguna respuesta 500 (${rs.map((r) => r.status).join(", ")})`,
      vigentes === 1 && rs.every((r) => r.status === 200 || r.status === 409), json({ vigentes, s: rs.map((r) => r.status) }));
  }

  seccion("G. Lo que garantiza la base");
  {
    const columnas = (await c.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'VinculoIntegracion' ORDER BY column_name`
    )).map((x) => x.column_name);
    igual("las columnas son exactamente éstas: ni código, ni token, ni secreto, ni cookie",
      columnas, ["aplicacion", "autorizadoEn", "codigoHash", "id", "revocadoEn", "revocadoPorId", "usuarioId"]);
    const filas = await c.$queryRawUnsafe(`SELECT row_to_json(v)::text AS t FROM "VinculoIntegracion" v`);
    const todo = filas.map((f) => f.t).join("\n");
    const secretos = [...Object.values(CODIGO), SECRETO, process.env.AUTH_SECRET, "eyJ", "erpazul_sesion"];
    ok("ninguna fila contiene un código, un secreto, un JWT ni una cookie", secretos.every((s) => !todo.includes(s)), `${filas.length} filas`);
    const fila = await c.vinculoIntegracion.findFirst({ where: { usuarioId: U.encargadoA.id, revocadoEn: null } });
    igual("lo guardado es el SHA-256 del código", fila?.codigoHash, hashCodigoVinculo(CODIGO[U.encargadoA.id]));

    const falla = async (titulo, fn, patron) => {
      try {
        await fn();
        ok(titulo, false, "la base lo aceptó");
      } catch (e) {
        ok(titulo, patron.test(String(e?.message || e)), String(e?.message || e).slice(0, 160));
      }
    };
    const id = fila.id;
    await falla("un vínculo no se borra", () => c.$executeRawUnsafe(`DELETE FROM "VinculoIntegracion" WHERE id = $1`, id), /no se borra/);
    await falla("no se cambia su código", () => c.$executeRawUnsafe(`UPDATE "VinculoIntegracion" SET "codigoHash" = repeat('0', 64) WHERE id = $1`, id), /solo se revoca/);
    await falla("no se cambia de dueño", () => c.$executeRawUnsafe(`UPDATE "VinculoIntegracion" SET "usuarioId" = $2, "revocadoEn" = now(), "revocadoPorId" = $2 WHERE id = $1`, id, U.adminGlobal.id), /no cambia lo que se autorizó/);
    const revocado = await c.vinculoIntegracion.findFirst({ where: { usuarioId: U.adminEnX.id, revocadoEn: { not: null } } });
    await falla("un revocado no se des-revoca", () => c.$executeRawUnsafe(`UPDATE "VinculoIntegracion" SET "revocadoEn" = NULL, "revocadoPorId" = NULL WHERE id = $1`, revocado.id), /solo se revoca/);
    await falla("un revocado no se vuelve a revocar", () => c.$executeRawUnsafe(`UPDATE "VinculoIntegracion" SET "revocadoEn" = now() + interval '1 hour' WHERE id = $1`, revocado.id), /solo se revoca/);
    await falla("el código en claro no entra como hash", () => c.vinculoIntegracion.create({ data: { usuarioId: U.sinVinculoA.id, aplicacion: "AZUL_CHAT", codigoHash: `vin1_${"B".repeat(43)}`, revocadoEn: new Date(), revocadoPorId: U.sinVinculoA.id } }), /codigoHash_check/);
    await falla("revocado sin quién no entra", () => c.vinculoIntegracion.create({ data: { usuarioId: U.sinVinculoA.id, aplicacion: "AZUL_CHAT", codigoHash: "c".repeat(64), revocadoEn: new Date() } }), /revocacion_check/);
    await falla("un segundo vínculo vigente para el mismo usuario no entra", () => c.vinculoIntegracion.create({ data: { usuarioId: U.encargadoA.id, aplicacion: "AZUL_CHAT", codigoHash: "d".repeat(64) } }), /Unique constraint|vigente_key/);
    await falla("un vínculo de un usuario que no existe no entra", () => c.vinculoIntegracion.create({ data: { usuarioId: 999999, aplicacion: "AZUL_CHAT", codigoHash: "e".repeat(64) } }), /Foreign key|usuarioId_fkey/);
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
