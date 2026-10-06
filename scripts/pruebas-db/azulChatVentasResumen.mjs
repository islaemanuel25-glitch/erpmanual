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
//   F. el VÍNCULO y su DELEGACIÓN por las rutas reales del ERP: sin delegación
//      no entra, el token de A no se puede usar como B, revocar corta en la
//      próxima consulta, reautorizar mata el token viejo, quién puede revocar a
//      otro, y tres autorizaciones simultáneas dejan uno solo vigente;
//   G. lo que garantiza la BASE sobre el vínculo: las columnas, que no se guarda
//      ningún secreto, el trigger que solo deja revocar, los CHECK, el índice
//      parcial y la FK;
//   H. la RUTA HTTP real, POST /api/integraciones/azul-chat/consultar: la firma
//      sobre los bytes, la configuración que la apaga, el JSON canónico, el
//      tipo de contenido, el tope, los códigos públicos que no dejan enumerar,
//      que nada interno sale, que la base queda IDÉNTICA (huella de todas las
//      tablas) y el cupo;
//   I. el CANJE por su ruta real, POST /vinculo/canjear: una vez, la misma
//      solicitud firmada repetida, cinco canjes a la vez, vencido, revocado,
//      persona inactiva, inexistente — todos indistinguibles —, la firma
//      obligatoria, sin usuarioId, los registros sin código ni token, el cupo;
//   J. `mi_alcance` contra roles y grupos reales, con el alcance cambiado EN
//      VIVO: el local que se saca desaparece de la lista y `ventas_resumen` de
//      ese local falla en la misma pregunta; sin escribir nada;
//   K. lo que garantiza la BASE sobre la delegación: columnas, CHECK, índices
//      únicos, el trigger del canje (revocado, vencido, reloj de la base), la
//      inmutabilidad, y canje contra revocación a la vez;
//   L. la MIGRACIÓN sobre una base que ya tenía vínculos del contrato anterior.
//
// Las ventas entran por `/api/pos-ventas/crear`, la corrección por
// `/api/pos-ventas/venta/[id]/corregir`, la anulación por el motor real
// (`revertirVenta`) y la venta interna por `crear` desde el depósito a un cliente
// vinculado. Lo escrito directo es: la HORA de tres ventas, para ponerlas en los
// bordes del día argentino (`crear` siempre fecha "ahora"); y, en K y L, filas
// de vínculo con una `autorizadoEn` vieja, porque la ruta siempre autoriza
// "ahora" y el trigger no deja cambiarla — es la única forma de tener un código
// vencido en la base, y lo que se prueba es justamente lo que la base hace con él.
//
// Bases descartables PROPIAS, creadas y borradas acá. Nivel ESCRITURA: host
// local y NODE_ENV distinto de production. No toca ninguna otra base.

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
const NOMBRE_MIGRACION = "erpazul_azul_chat_migracion";
const urlDe = (nombre) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${nombre}`;
  return u.toString();
};
const urlPrueba = urlDe(NOMBRE);
const sinQuery = (url) => {
  const u = new URL(url);
  u.search = "";
  return u.toString();
};
const MIGRACION_DELEGACION = "20261006150000_delegacion_integracion";

// El secreto de la integración solo existe en esta prueba, y es distinto del de
// las sesiones a propósito.
const SECRETO = "prueba-azul-chat-0123456789abcdef0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };

let c = null;
let cMig = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  const urlPsql = sinQuery(urlPrueba);
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
  const rutaCanjear = await import("../../app/api/integraciones/azul-chat/vinculo/canjear/route.js");
  const { hashCodigoVinculo, hashTokenDelegacion, generarCodigoVinculo, generarTokenDelegacion, VIDA_CODIGO_CANJE_MS } = await import("../../lib/integraciones/vinculos/codigoVinculo.js");
  const { atenderCanje, MAX_CANJES_POR_MINUTO } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const rutaConsultar = await import("../../app/api/integraciones/azul-chat/consultar/route.js");
  const { MAX_POR_USUARIO } = await import("../../lib/integraciones/azul-chat/limitador.js");
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

  // ── El vínculo y la delegación, por las rutas reales del ERP ─────────────
  //
  // Cada persona autoriza a Azul Chat desde SU sesión. El código vuelve una vez,
  // y Azul Chat lo CANJEA por un token, que es lo que manda después.
  // `sinVinculoA` nunca autoriza. La sesión lleva los permisos del ROL de la
  // persona, como los firma el login.
  //
  // Las rutas leen el secreto de `process.env` y la hora del reloj, como en
  // producción.
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
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
  /** Cabeceras firmadas para un cuerpo, con la marca de ahora. */
  const firmadas = (cuerpo, { secreto = SECRETO, marca = String(Math.floor(Date.now() / 1000)), sinFirma = false, extra = {} } = {}) => {
    const headers = new Headers({ "content-type": "application/json", [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca, ...extra });
    if (!sinFirma) headers.set(CABECERAS.firma, firmarSolicitud({ secreto, aplicacion: "azul-chat", marca, cuerpo }));
    return headers;
  };
  /** Un POST a la ruta real del canje. Devuelve estado, cabeceras, texto crudo y cuerpo. */
  const URL_CANJE = "http://ci/api/integraciones/azul-chat/vinculo/canjear";
  const canjearPorRuta = async (cuerpoObj, opciones = {}) => {
    const cuerpo = typeof cuerpoObj === "string" ? cuerpoObj : json(cuerpoObj);
    const r = await rutaCanjear.POST(new Request(URL_CANJE, { method: "POST", headers: firmadas(cuerpo, opciones), body: cuerpo }));
    const texto = await r.text();
    let cuerpoResp = null;
    try { cuerpoResp = JSON.parse(texto); } catch { /* lo mira el que llama */ }
    return { status: r.status, headers: r.headers, texto, cuerpo: cuerpoResp };
  };
  // El canje de PREPARACIÓN va por la puerta del canje sin cupo, como
  // `pedirIntegracion` va sin cupo: el cupo de la ruta real se ejerce en I y no
  // tiene que gastarse armando el fixture.
  const canjearSinCupo = async (codigo) => {
    const cuerpo = json({ codigo });
    const r = aRespuestaPublica(await atenderCanje({ headers: firmadas(cuerpo), cuerpo }, { db: c, limitador: null, entorno: ENTORNO }));
    return r;
  };
  const vincular = async (u) => {
    const a = await autorizarPor(u);
    if (a.status !== 200 || !a.codigoCanje) throw new Error(`autorizar ${u.nombre}: ${a.status} ${json(a)}`);
    const k = await canjearSinCupo(a.codigoCanje);
    if (k.status !== 200 || !k.cuerpo?.datos?.tokenDelegacion) throw new Error(`canjear ${u.nombre}: ${k.status} ${json(k.cuerpo)}`);
    if (k.cuerpo.datos.usuarioId !== u.id) throw new Error(`el canje de ${u.nombre} devolvió otro usuario`);
    CODIGO[u.id] = a.codigoCanje;
    return k.cuerpo.datos.tokenDelegacion;
  };
  const CODIGO = {};
  const TOKEN = {};
  for (const u of [U.adminGlobal, U.encargadoA, U.sinReportesA, U.adminEnX, U.gestorA]) TOKEN[u.id] = await vincular(u);

  // ── La integración y el reporte ─────────────────────────────────────────
  //
  // Por defecto delega con el token de `usuarioId` —que NO viaja: elige qué
  // token usar—; `token` lo pisa. `delegacionExtra` agrega claves a la
  // delegación, para probar que no se aceptan.
  const pedirIntegracion = async ({ usuarioId, token, grupoId, localId, periodo, capacidad = "ventas_resumen", extra = {}, delegacionExtra = {}, cookie = null, firmar = true }) => {
    const delegacion = { token: token === undefined ? TOKEN[usuarioId] : token, ...delegacionExtra };
    const conAlcance = capacidad !== "mi_alcance" || grupoId !== undefined;
    const parametros = capacidad === "mi_alcance" ? {} : { periodo };
    const cuerpo = json({ capacidad, delegacion, ...(conAlcance ? { alcance: { grupoId, localId } } : {}), parametros, ...extra });
    const marca = String(Math.floor(ahora / 1000));
    const headers = new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca, "content-type": "application/json" });
    if (firmar) headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca, cuerpo }));
    if (cookie) headers.set("cookie", cookie);
    // Sin limitador: A–G prueban la puerta, no el cupo. El cupo es el de la
    // ruta real, que se ejerce en H.
    return atenderSolicitudAzulChat({ headers, cuerpo }, { entorno: ENTORNO, ahora, limitador: null });
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
  await rechazo("usuario inactivo, que nunca se pudo vincular: no tiene token", { usuarioId: U.inactivoA.id, grupoId: grupo.id, localId: localA.id }, "DELEGACION_INEXISTENTE");
  await rechazo("usuario vinculado sin reportes.ver", { usuarioId: U.sinReportesA.id, grupoId: grupo.id, localId: localA.id }, "SIN_PERMISO");
  // El usuario sale del token: un `usuarioId` en el cuerpo, de quien sea, ni
  // siquiera se lee — es una clave de más.
  await rechazo("el token del admin, con un usuarioId de otro agregado", { usuarioId: U.adminGlobal.id, delegacionExtra: { usuarioId: U.encargadoA.id }, grupoId: grupo.id, localId: localA.id }, "PEDIDO_INVALIDO");
  await rechazo("el código humano usado como token", { token: CODIGO[U.adminGlobal.id], grupoId: grupo.id, localId: localA.id }, "DELEGACION_INEXISTENTE");
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

  seccion("F. El vínculo y su delegación: autorizar, canjear, delegar, revocar");
  await rechazo("usuario activo, con reportes.ver, que NUNCA autorizó: sin token", { usuarioId: U.sinVinculoA.id, token: null, grupoId: grupo.id, localId: localA.id }, "DELEGACION_INEXISTENTE");
  await rechazo("el mismo, con un token inventado con la forma correcta", { usuarioId: U.sinVinculoA.id, token: `del1_${"A".repeat(43)}`, grupoId: grupo.id, localId: localA.id }, "DELEGACION_INEXISTENTE");
  {
    const r = await autorizarPor(U.inactivoA);
    igual("un usuario inactivo no puede autorizar", [r.status, r.codigo, r.codigoCanje], [403, "USUARIO_INACTIVO", undefined]);
    const c1 = await autorizarPor(U.sinVinculoA);
    ok("la respuesta que trae el código no se guarda en ningún caché", c1.cacheControl === "no-store", String(c1.cacheControl));
    igual("autorizar devuelve el código, cuándo se autorizó y cuándo vence: 10 minutos",
      [typeof c1.codigoCanje, Date.parse(c1.venceEn) - Date.parse(c1.autorizadoEn)], ["string", VIDA_CODIGO_CANJE_MS]);
    ok("autorizar no devuelve el token ni nada del rol", !("tokenDelegacion" in c1) && !json(c1).includes("permisos"), json(Object.keys(c1)));
    // Un código autorizado y SIN canjear no sirve para consultar: no es un token.
    await rechazo("un código recién autorizado, sin canjear, usado para consultar", { token: c1.codigoCanje, grupoId: grupo.id, localId: localA.id }, "DELEGACION_INEXISTENTE");
    // Y se revoca enseguida, para que siga siendo "el que nunca autorizó" en lo que sigue.
    await revocarPor(U.sinVinculoA);
  }
  {
    // 14. El token de A no sirve como B: no hay dónde poner a B.
    const r = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("13. el token del encargado de A consulta su local", [r.status, r.cuerpo?.datos?.local?.id], [200, localA.id]);
    await rechazo("14. el token del encargado de A, nombrando al admin global", { usuarioId: U.encargadoA.id, delegacionExtra: { usuarioId: U.adminGlobal.id }, grupoId: grupo.id, localId: localB.id }, "PEDIDO_INVALIDO");
    await rechazo("14b. el token del encargado de A pidiendo B, que el admin sí podría ver", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localB.id }, "FUERA_DE_ALCANCE");
  }

  // Revocar el propio: corta en la próxima consulta.
  {
    const r = await revocarPor(U.encargadoA);
    igual("el encargado revoca su propio vínculo", [r.status, r.revocado], [200, true]);
    await rechazo("15. vínculo recién revocado: su token corta de inmediato", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id }, "VINCULO_REVOCADO");
    const otra = await revocarPor(U.encargadoA);
    igual("revocar de nuevo no falla: no había vigente", [otra.status, otra.revocado], [200, false]);
    const viejo = TOKEN[U.encargadoA.id];
    const codigoViejo = CODIGO[U.encargadoA.id];
    TOKEN[U.encargadoA.id] = await vincular(U.encargadoA);
    ok("volver a autorizar y canjear entrega un código y un token NUEVOS", CODIGO[U.encargadoA.id] !== codigoViejo && TOKEN[U.encargadoA.id] !== viejo);
    const r2 = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("con el token nuevo, consulta", [r2.status, r2.cuerpo?.datos?.totalVendido], [200, "6010.00"]);
    await rechazo("el token viejo sigue muerto", { token: viejo, grupoId: grupo.id, localId: localA.id }, "VINCULO_REVOCADO");
  }

  // 16. Reautorizar con un vínculo vigente revoca el anterior y su delegación,
  // AUNQUE el código nuevo todavía no se haya canjeado.
  {
    const antes = TOKEN[U.adminEnX.id];
    const r = await autorizarPor(U.adminEnX);
    await rechazo("16. reautorizar, sin canjear todavía, ya invalida el token anterior", { token: antes, grupoId: grupo2.id, localId: localX.id }, "VINCULO_REVOCADO");
    const k = await canjearSinCupo(r.codigoCanje);
    TOKEN[U.adminEnX.id] = k.cuerpo?.datos?.tokenDelegacion;
    CODIGO[U.adminEnX.id] = r.codigoCanje;
    const vigentes = await c.vinculoIntegracion.count({ where: { usuarioId: U.adminEnX.id, revocadoEn: null } });
    igual("y queda un solo vínculo vigente", vigentes, 1);
    const ok2 = await pedirIntegracion({ usuarioId: U.adminEnX.id, grupoId: grupo2.id, localId: localX.id, periodo: { tipo: "hoy" } });
    igual("el token del vínculo nuevo consulta", ok2.status, 200);
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
    const secretos = [...Object.values(CODIGO), ...Object.values(TOKEN), SECRETO, process.env.AUTH_SECRET, "eyJ", "erpazul_sesion"];
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

  seccion("H. La ruta HTTP real: POST /api/integraciones/azul-chat/consultar");
  // La ruta lee el secreto de `process.env` y la hora del reloj, como en producción.
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const URL_RUTA = "http://ci/api/integraciones/azul-chat/consultar";
  // `usuarioId` elige de quién es el token; no viaja.
  const cuerpoDe = ({ usuarioId, token, grupoId = grupo.id, localId = localA.id, periodo = { tipo: "hoy" }, capacidad = "ventas_resumen", extra = {} }) =>
    json({ capacidad, delegacion: { token: token === undefined ? TOKEN[usuarioId] : token }, alcance: { grupoId, localId }, parametros: { periodo }, ...extra });
  /**
   * Un POST a la ruta real. `cuerpo` es lo que viaja; `firmado` es lo que se
   * firmó (por defecto, lo mismo). Devuelve estado, cabeceras y el TEXTO crudo.
   */
  const postear = async ({ cuerpo, firmado = cuerpo, secreto = SECRETO, marca = String(Math.floor(Date.now() / 1000)), tipo = "application/json", sinFirma = false, extraHeaders = {} }) => {
    const headers = new Headers({ "content-type": tipo, [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca, ...extraHeaders });
    if (!sinFirma) headers.set(CABECERAS.firma, firmarSolicitud({ secreto, aplicacion: "azul-chat", marca, cuerpo: firmado }));
    const r = await rutaConsultar.POST(new Request(URL_RUTA, { method: "POST", headers, body: cuerpo }));
    const texto = await r.text();
    let cuerpoResp = null;
    try { cuerpoResp = JSON.parse(texto); } catch { /* lo mira el que llama */ }
    return { status: r.status, headers: r.headers, texto, cuerpo: cuerpoResp };
  };
  const respuestas = [];
  const esperar = async (titulo, args, status, codigo) => {
    const r = await postear(args);
    respuestas.push(r);
    ok(`${titulo}: ${status}${codigo ? ` ${codigo}` : ""}`, r.status === status && (codigo ? r.cuerpo?.codigo === codigo : true) && r.cuerpo?.datos === undefined, `${r.status} ${r.texto.slice(0, 160)}`);
    return r;
  };

  // La huella de TODA la base: si una consulta escribiera algo, cambia.
  const tablas = (await c.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  )).map((t) => t.tablename);
  const huella = async () => {
    const partes = [];
    for (const t of tablas) {
      const [f] = await c.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS h FROM "${t}" x`);
      partes.push(`${t}:${f.n}:${f.h}`);
    }
    return partes.join("\n");
  };
  const huellaAntes = await huella();

  {
    const cuerpo = cuerpoDe({ usuarioId: U.encargadoA.id });
    const r = await postear({ cuerpo });
    respuestas.push(r);
    igual("1. firmada y válida: 200", [r.status, r.cuerpo?.ok], [200, true]);
    const servicio = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("2. la ruta devuelve exactamente lo del servicio probado", r.cuerpo?.datos, servicio.cuerpo?.datos);
    igual("2b. y el éxito es { ok, datos }, nada más", Object.keys(r.cuerpo || {}).sort(), ["datos", "ok"]);
    igual("las cabeceras: JSON, sin caché, nosniff, sin CORS ni cookies",
      [r.headers.get("content-type")?.startsWith("application/json"), r.headers.get("cache-control"), r.headers.get("x-content-type-options"), r.headers.get("access-control-allow-origin"), r.headers.get("set-cookie")],
      [true, "no-store", "nosniff", null, null]);
  }
  const valido = cuerpoDe({ usuarioId: U.encargadoA.id });
  await esperar("3. firmada con otro secreto", { cuerpo: valido, secreto: "otro-secreto-cualquiera-0123456789abcdefgh" }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("4. el cuerpo cambiado después de firmar (otro local)", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, localId: localB.id }), firmado: valido }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("4b. un espacio agregado después de firmar", { cuerpo: valido + " ", firmado: valido }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("5. marca vencida (301 s atrás)", { cuerpo: valido, marca: String(Math.floor(Date.now() / 1000) - 301) }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("6. marca en el futuro (301 s adelante)", { cuerpo: valido, marca: String(Math.floor(Date.now() / 1000) + 301) }, 401, "SOLICITUD_NO_AUTENTICADA");
  {
    const vencida = await postear({ cuerpo: valido, marca: String(Math.floor(Date.now() / 1000) - 301) });
    const mala = await postear({ cuerpo: valido, secreto: "otro-secreto-cualquiera-0123456789abcdefgh" });
    igual("firma mala y marca vencida salen idénticas: no se dice en qué falló", vencida.texto, mala.texto);
  }

  // Fallo seguro de la configuración: se cambia el entorno y se restituye.
  for (const [titulo, valor] of [["7. sin secreto", undefined], ["8. secreto de 31 caracteres", "x".repeat(31)], ["9. secreto igual a AUTH_SECRET", process.env.AUTH_SECRET]]) {
    if (valor === undefined) delete process.env.AZUL_CHAT_INTEGRACION_SECRET;
    else process.env.AZUL_CHAT_INTEGRACION_SECRET = valor;
    // Firmado con el valor configurado: aun así, apagada.
    await esperar(`${titulo}, aunque la firma corresponda`, { cuerpo: valido, secreto: valor ?? SECRETO }, 503, "INTEGRACION_NO_DISPONIBLE");
    process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  }

  const sinVinculo = await esperar("10. token de delegación que no existe", { cuerpo: cuerpoDe({ token: `del1_${"Z".repeat(43)}` }) }, 403, "VINCULO_NO_VALIDO");
  {
    const conCodigo = await postear({ cuerpo: cuerpoDe({ token: CODIGO[U.adminGlobal.id] }) });
    const sinToken = await postear({ cuerpo: cuerpoDe({ token: null }) });
    const revocado = await postear({ cuerpo: cuerpoDe({ usuarioId: U.sinReportesA.id }) });
    respuestas.push(conCodigo, sinToken, revocado);
    ok("token inexistente, código humano en lugar del token, sin token y token revocado: respuestas IDÉNTICAS",
      [conCodigo, sinToken, revocado].every((r) => r.status === sinVinculo.status && r.texto === sinVinculo.texto),
      json([conCodigo.texto, sinToken.texto, revocado.texto]));
  }
  await esperar("11. vínculo revocado", { cuerpo: cuerpoDe({ usuarioId: U.sinReportesA.id }) }, 403, "VINCULO_NO_VALIDO");
  await esperar("14. local de otro grupo con el grupo propio", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localX.id }) }, 403, "NO_AUTORIZADO");
  await esperar("14b. local fuera de su alcance", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, localId: localB.id }) }, 403, "NO_AUTORIZADO");
  await esperar("14c. grupo manipulado", { cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id, grupoId: grupo2.id, localId: localA.id }) }, 403, "NO_AUTORIZADO");
  await esperar("15. capacidad desconocida", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, capacidad: "ejecutar_sql" }) }, 403, "CAPACIDAD_NO_DISPONIBLE");
  await esperar("16. una clave de más", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, extra: { where: { localId: { gt: 0 } } } }) }, 400, "SOLICITUD_INVALIDA");
  {
    // El token del encargado repetido con el del admin: JSON.parse se quedaría con el del admin.
    const repetido = valido.replace(`"token":"${TOKEN[U.encargadoA.id]}"`, `"token":"${TOKEN[U.encargadoA.id]}","token":"${TOKEN[U.adminGlobal.id]}"`);
    ok("16b. (la clave repetida está de verdad en el cuerpo)", repetido !== valido);
    await esperar("16b. claves repetidas, firmadas", { cuerpo: repetido }, 400, "SOLICITUD_INVALIDA");
  }
  await esperar("16c. JSON con espacios, firmado", { cuerpo: JSON.stringify(JSON.parse(valido), null, 1) }, 400, "SOLICITUD_INVALIDA");
  await esperar("17. Content-Type text/plain", { cuerpo: valido, tipo: "text/plain" }, 415, "TIPO_DE_CONTENIDO_INVALIDO");
  await esperar("17b. Content-Type de formulario", { cuerpo: valido, tipo: "application/x-www-form-urlencoded" }, 415, "TIPO_DE_CONTENIDO_INVALIDO");
  await esperar("18. cuerpo vacío", { cuerpo: "" }, 400, "SOLICITUD_INVALIDA");
  await esperar("19. cuerpo de 4097 bytes", { cuerpo: "x".repeat(4097) }, 413, "CUERPO_DEMASIADO_GRANDE");
  await esperar("20. JSON roto, firmado", { cuerpo: valido.slice(0, -1) }, 400, "SOLICITUD_INVALIDA");
  await esperar("20b. período inválido", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, periodo: { tipo: "semana" } }) }, 400, "PERIODO_INVALIDO");

  const jwtAdmin = sesion({ id: U.adminGlobal.id, localId: null, permisos: ["*"] });
  await esperar("21. sin firma, con la cookie de sesión de un admin válida", { cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id }), sinFirma: true, extraHeaders: { cookie: `erpazul_sesion=${jwtAdmin}; erpazul_grupo_activo=${grupo.id}` } }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("21b. firmada, con cookie de admin, delegando en el encargado de A, pidiendo B", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id, localId: localB.id }), extraHeaders: { cookie: `erpazul_sesion=${jwtAdmin}` } }, 403, "NO_AUTORIZADO");
  await esperar("22. sin firma, con Authorization: Bearer <JWT del ERP>", { cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id }), sinFirma: true, extraHeaders: { authorization: `Bearer ${jwtAdmin}` } }, 401, "SOLICITUD_NO_AUTENTICADA");
  await esperar("22b. el JWT del ERP puesto en lugar de la firma", { cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id }), sinFirma: true, extraHeaders: { [CABECERAS.firma]: jwtAdmin } }, 401, "SOLICITUD_NO_AUTENTICADA");
  ok("la ruta no exporta otros métodos: Next contesta 405", rutaConsultar.GET === undefined && rutaConsultar.PUT === undefined && rutaConsultar.DELETE === undefined && typeof rutaConsultar.POST === "function");

  // 25. Concurrencia: diez a la vez, todas iguales.
  {
    const rs = await Promise.all(Array.from({ length: 10 }, () => postear({ cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id }) })));
    respuestas.push(...rs);
    ok("25. diez consultas válidas a la vez: todas 200 y con los mismos datos",
      rs.every((r) => r.status === 200 && json(r.cuerpo?.datos) === json(rs[0].cuerpo?.datos)) && rs[0].cuerpo?.datos?.totalVendido === "6010.00",
      json(rs.map((r) => r.status)));
  }

  igual("24. la base quedó idéntica después de todas las consultas, válidas y rechazadas", await huella(), huellaAntes);

  // 23. Nada interno sale por la ruta.
  {
    const todo = respuestas.map((r) => r.texto).join("\n");
    const fugas = [SECRETO, process.env.AUTH_SECRET, ...Object.values(CODIGO), ...Object.values(TOKEN), jwtAdmin, "prisma", "Prisma", "SELECT", " at ", "stack", "Invalid `", "USUARIO_INEXISTENTE", "VINCULO_REVOCADO", "DELEGACION_INEXISTENTE", "SIN_PERMISO", "FUERA_DE_ALCANCE", "codigoHash", "tokenHash"]
      .filter((f) => f && todo.includes(f));
    ok(`23. ninguna de las ${respuestas.length} respuestas trae secretos, códigos de vínculo, JWT, Prisma, SQL, stack ni códigos internos`, fugas.length === 0, json(fugas));
    ok("ninguna respuesta pone cookies ni abre CORS", respuestas.every((r) => !r.headers.get("set-cookie") && !r.headers.get("access-control-allow-origin")));
    ok("toda respuesta es JSON y sin caché", respuestas.every((r) => r.cuerpo && r.headers.get("cache-control") === "no-store"));
  }

  // 12 y 13: cambian la base a propósito, por eso van después de la huella.
  await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: false } });
  await esperar("12. usuario vinculado y desactivado", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id }) }, 403, "NO_AUTORIZADO");
  await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: true } });
  await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO].filter((p) => p !== "reportes.ver") } });
  await esperar("13. permiso retirado al rol", { cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id }) }, 403, "NO_AUTORIZADO");
  await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  {
    const r = await postear({ cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id }) });
    igual("13b. permiso devuelto: vuelve a 200 con el mismo vínculo", r.status, 200);
  }

  // El cupo de la ruta: el usuario se queda sin lugar, con Retry-After.
  {
    let primero429 = null;
    for (let i = 0; i < MAX_POR_USUARIO + 1 && !primero429; i++) {
      const r = await postear({ cuerpo: cuerpoDe({ usuarioId: U.adminGlobal.id }) });
      if (r.status === 429) primero429 = r;
    }
    ok("el cupo por usuario corta con 429 y Retry-After",
      primero429?.cuerpo?.codigo === "LIMITE_EXCEDIDO" && Number(primero429?.headers.get("retry-after")) > 0,
      primero429 ? primero429.texto : "nunca devolvió 429");
    const otro = await postear({ cuerpo: cuerpoDe({ usuarioId: U.encargadoA.id }) });
    igual("y otro usuario sigue teniendo su cupo", otro.status, 200);
  }

  // Un rechazo esperado, para comparar después.
  const falla = async (titulo, fn, patron) => {
    try {
      await fn();
      ok(titulo, false, "la base lo aceptó");
    } catch (e) {
      ok(titulo, patron.test(String(e?.message || e)), String(e?.message || e).slice(0, 200));
    }
  };

  seccion("I. El canje por su ruta real: POST /api/integraciones/azul-chat/vinculo/canjear");
  // Todo lo que la ruta escriba en la consola durante esta sección se guarda
  // para el punto 25: no puede llevar ni el código, ni el token, ni sus hashes.
  const registrado = [];
  const consolaOriginal = { warn: console.warn, error: console.error };
  console.warn = (...a) => registrado.push(a.map(String).join(" "));
  console.error = (...a) => registrado.push(a.map(String).join(" "));
  const canjes = [];
  const sensibles = [];
  try {
    // 4. Un canje válido.
    const a1 = await autorizarPor(U.sinVinculoA);
    sensibles.push(a1.codigoCanje, hashCodigoVinculo(a1.codigoCanje));
    const k1 = await canjearPorRuta({ codigo: a1.codigoCanje });
    canjes.push(k1);
    const t1 = k1.cuerpo?.datos?.tokenDelegacion;
    sensibles.push(t1, t1 && hashTokenDelegacion(t1));
    igual("4. el código válido se canjea: 200 con la identidad mínima",
      [k1.status, Object.keys(k1.cuerpo?.datos || {}).sort(), k1.cuerpo?.datos?.usuarioId],
      [200, ["autorizadoEn", "canjeadoEn", "tokenDelegacion", "usuarioId", "vinculoId"], U.sinVinculoA.id]);
    igual("la respuesta del canje: sin caché, nosniff, sin cookies, sin CORS",
      [k1.headers.get("cache-control"), k1.headers.get("x-content-type-options"), k1.headers.get("set-cookie"), k1.headers.get("access-control-allow-origin")],
      ["no-store", "nosniff", null, null]);
    const fila = await c.delegacionIntegracion.findFirst({ where: { vinculo: { codigoHash: hashCodigoVinculo(a1.codigoCanje) } } });
    igual("12. lo guardado es el SHA-256 del token, nada más", fila?.tokenHash, hashTokenDelegacion(t1));
    const consulta = await pedirIntegracion({ token: t1, grupoId: grupo.id, localId: localA.id, periodo: { tipo: "hoy" } });
    igual("13. el token recién canjeado consulta, como la persona del vínculo", [consulta.status, consulta.cuerpo?.datos?.local?.id], [200, localA.id]);

    // 5 y replay. La MISMA solicitud firmada, repetida dentro de la ventana.
    const marca = String(Math.floor(Date.now() / 1000));
    const repetida = await canjearPorRuta({ codigo: a1.codigoCanje }, { marca });
    const repetida2 = await canjearPorRuta({ codigo: a1.codigoCanje }, { marca });
    canjes.push(repetida, repetida2);
    igual("5. el segundo canje del mismo código falla", [repetida.status, repetida.cuerpo?.codigo], [403, "CODIGO_NO_VALIDO"]);
    ok("replay: la misma solicitud firmada, idéntica byte a byte, tampoco da otro token", repetida2.texto === repetida.texto && !repetida2.cuerpo?.datos);
    igual("y hay UNA delegación para ese vínculo", await c.delegacionIntegracion.count({ where: { vinculo: { codigoHash: hashCodigoVinculo(a1.codigoCanje) } } }), 1);

    // 6. Cinco canjes del mismo código a la vez: exactamente uno gana.
    const a2 = await autorizarPor(U.sinVinculoA);
    sensibles.push(a2.codigoCanje);
    await rechazo("reautorizar invalidó el token del canje anterior", { token: t1, grupoId: grupo.id, localId: localA.id }, "VINCULO_REVOCADO");
    const cinco = await Promise.all(Array.from({ length: 5 }, () => canjearPorRuta({ codigo: a2.codigoCanje })));
    canjes.push(...cinco);
    for (const k of cinco) if (k.cuerpo?.datos?.tokenDelegacion) sensibles.push(k.cuerpo.datos.tokenDelegacion);
    const ganadores = cinco.filter((k) => k.status === 200);
    const perdedores = cinco.filter((k) => k.status !== 200);
    ok(`6. cinco canjes a la vez: exactamente uno gana (${cinco.map((k) => k.status).join(", ")})`,
      ganadores.length === 1 && perdedores.every((k) => k.status === 403 && k.cuerpo?.codigo === "CODIGO_NO_VALIDO"), json(cinco.map((k) => k.texto.slice(0, 80))));
    igual("y la base tiene una sola delegación de ese vínculo", await c.delegacionIntegracion.count({ where: { vinculo: { codigoHash: hashCodigoVinculo(a2.codigoCanje) } } }), 1);
    TOKEN[U.sinVinculoA.id] = ganadores[0]?.cuerpo?.datos?.tokenDelegacion;

    // Vencido: un vínculo autorizado hace más de 10 minutos. La ruta de
    // autorizar siempre fecha "ahora" y el trigger no deja cambiar la fecha,
    // así que la fila se escribe directo, con una persona que no tiene otro.
    const vencido = await c.usuario.create({ data: { nombre: "canje-vencido", email: "canje-vencido@ci.local", passwordHash: "x", rolId: rolEncargado.id, localId: localA.id, activo: true } });
    const codigoVencido = generarCodigoVinculo();
    sensibles.push(codigoVencido);
    await c.vinculoIntegracion.create({ data: { usuarioId: vencido.id, aplicacion: "AZUL_CHAT", codigoHash: hashCodigoVinculo(codigoVencido), autorizadoEn: new Date(Date.now() - VIDA_CODIGO_CANJE_MS - 1000) } });
    const kVencido = await canjearPorRuta({ codigo: codigoVencido });

    // Revocado: autorizado y revocado antes de canjear.
    const aR = await autorizarPor(U.gestorA);
    sensibles.push(aR.codigoCanje);
    await revocarPor(U.gestorA);
    const kRevocado = await canjearPorRuta({ codigo: aR.codigoCanje });

    // Persona inactiva: el código no se gasta — cuando vuelve a estar activa, canjea.
    const aI = await autorizarPor(U.sinReportesA);
    sensibles.push(aI.codigoCanje);
    await c.usuario.update({ where: { id: U.sinReportesA.id }, data: { activo: false } });
    const kInactivo = await canjearPorRuta({ codigo: aI.codigoCanje });
    await c.usuario.update({ where: { id: U.sinReportesA.id }, data: { activo: true } });
    const kReactivado = await canjearPorRuta({ codigo: aI.codigoCanje });
    canjes.push(kReactivado);
    igual("una persona inactiva no canjea, y el código no se gasta: reactivada, canjea", [kInactivo.status, kReactivado.status], [403, 200]);
    TOKEN[U.sinReportesA.id] = kReactivado.cuerpo?.datos?.tokenDelegacion;
    sensibles.push(TOKEN[U.sinReportesA.id]);

    // Inexistente, mal escrito, y un token en lugar de un código.
    const kInexistente = await canjearPorRuta({ codigo: generarCodigoVinculo() });
    const kMalEscrito = await canjearPorRuta({ codigo: "hola" });
    const kToken = await canjearPorRuta({ codigo: t1 });
    const fallidos = { usado: repetida, perdedorConcurrente: perdedores[0], vencido: kVencido, revocado: kRevocado, inactivo: kInactivo, inexistente: kInexistente, malEscrito: kMalEscrito, tokenComoCodigo: kToken };
    canjes.push(...Object.values(fallidos));
    ok("7. usado, perdedor de la carrera, vencido, revocado, persona inactiva, inexistente, mal escrito y token-como-código: IDÉNTICOS",
      Object.values(fallidos).every((k) => k && k.status === 403 && k.texto === repetida.texto),
      json(Object.fromEntries(Object.entries(fallidos).map(([n, k]) => [n, `${k?.status} ${k?.texto?.slice(0, 60)}`]))));

    // 8 y 9. Sin la firma no hay canje, traiga lo que traiga.
    const aF = await autorizarPor(U.gestorA);
    sensibles.push(aF.codigoCanje);
    const jwtAdmin = sesion({ id: U.adminGlobal.id, localId: null, permisos: ["*"] });
    const sinFirma = await canjearPorRuta({ codigo: aF.codigoCanje }, { sinFirma: true, extra: { cookie: `erpazul_sesion=${jwtAdmin}`, authorization: `Bearer ${jwtAdmin}` } });
    const jwtDeFirma = await canjearPorRuta({ codigo: aF.codigoCanje }, { sinFirma: true, extra: { [CABECERAS.firma]: jwtAdmin } });
    const otroSecreto = await canjearPorRuta({ codigo: aF.codigoCanje }, { secreto: "otro-secreto-cualquiera-0123456789abcdefgh" });
    canjes.push(sinFirma, jwtDeFirma, otroSecreto);
    igual("8 y 9. sin firma (con cookie y Bearer de admin), con el JWT en lugar de la firma, o con otro secreto: 401",
      [sinFirma, jwtDeFirma, otroSecreto].map((k) => `${k.status} ${k.cuerpo?.codigo}`), Array(3).fill("401 SOLICITUD_NO_AUTENTICADA"));

    // 10. Sin usuarioId: el código identifica la autorización.
    const conUsuario = await canjearPorRuta({ codigo: aF.codigoCanje, usuarioId: U.adminGlobal.id });
    const conEspacios = await canjearPorRuta(`{ "codigo": "${aF.codigoCanje}" }`);
    const textoPlano = await rutaCanjear.POST(new Request(URL_CANJE, { method: "POST", headers: (() => { const h = firmadas(json({ codigo: aF.codigoCanje })); h.set("content-type", "text/plain"); return h; })(), body: json({ codigo: aF.codigoCanje }) }));
    const enorme = await canjearPorRuta("x".repeat(4097));
    canjes.push(conUsuario, conEspacios);
    igual("10. con usuarioId, o JSON no canónico: 400; tipo de contenido: 415; 4097 bytes: 413",
      [conUsuario.status, conEspacios.status, textoPlano.status, enorme.status], [400, 400, 415, 413]);
    igual("ninguno de esos intentos gastó el código: todavía no tiene delegación",
      await c.delegacionIntegracion.count({ where: { vinculo: { codigoHash: hashCodigoVinculo(aF.codigoCanje) } } }), 0);
    ok("la ruta del canje solo exporta POST", rutaCanjear.GET === undefined && rutaCanjear.PUT === undefined && typeof rutaCanjear.POST === "function");

    // 15. El cupo del canje.
    let primero429 = null;
    for (let i = 0; i < MAX_CANJES_POR_MINUTO + 1 && !primero429; i++) {
      const k = await canjearPorRuta({ codigo: generarCodigoVinculo() });
      if (k.status === 429) primero429 = k;
    }
    ok("15. el canje tiene cupo: 429 con Retry-After", primero429?.cuerpo?.codigo === "LIMITE_EXCEDIDO" && Number(primero429?.headers.get("retry-after")) > 0, primero429?.texto ?? "nunca devolvió 429");
  } finally {
    console.warn = consolaOriginal.warn;
    console.error = consolaOriginal.error;
  }
  {
    const todo = registrado.join("\n");
    const fugas = [...sensibles, SECRETO].filter((s) => s && todo.includes(s));
    ok(`25. los ${registrado.length} renglones que escribió la ruta no llevan código, token, sus hashes ni el secreto`, registrado.length > 0 && fugas.length === 0, `${fugas.length} fugas`);
    const respuestasCanje = canjes.map((k) => k?.texto ?? "").join("\n");
    const internos = ["CANJE_", "prisma", "Prisma", "SELECT", "codigoHash", "tokenHash", "venció", "revocado", "inactiv"].filter((f) => respuestasCanje.includes(f));
    ok("ninguna respuesta del canje dice el motivo interno, Prisma ni SQL", internos.length === 0, json(internos));
  }

  seccion("J. mi_alcance contra roles y grupos reales, con el alcance cambiado en vivo");
  const alcanceDe = async (usuarioId) => {
    const r = await pedirIntegracion({ usuarioId, capacidad: "mi_alcance" });
    return { status: r.status, codigo: r.cuerpo?.codigo, datos: r.cuerpo?.datos, ids: (r.cuerpo?.datos?.locales || []).map((l) => l.id).sort((x, y) => x - y) };
  };
  const ordenar = (xs) => [...xs].sort((x, y) => x - y);
  // El admin de X quedó revocado en F, a propósito: se vuelve a vincular.
  TOKEN[U.adminEnX.id] = await vincular(U.adminEnX);
  {
    const antes = await huella();
    const enc = await alcanceDe(U.encargadoA.id);
    igual("20. el encargado de A: su local, con su grupo real y su nombre", [enc.status, enc.datos?.alcance, enc.datos?.usuario, enc.datos?.locales],
      [200, { modo: "LOCAL" }, { id: U.encargadoA.id, nombre: "encargado-a" }, [{ id: localA.id, nombre: "Local A", grupoId: grupo.id, esDeposito: false, activo: true }]]);
    const glob = await alcanceDe(U.adminGlobal.id);
    igual("21. el admin global: todo local y depósito con grupo, como grupo-activo/set", [glob.datos?.alcance, glob.ids], [{ modo: "GLOBAL" }, ordenar([deposito.id, localA.id, localB.id, localX.id])]);
    const deposito1 = glob.datos?.locales.find((l) => l.id === deposito.id);
    igual("el depósito sale marcado y con el grupo que la puerta acepta", [deposito1?.esDeposito, deposito1?.grupoId], [true, grupo.id]);
    const enX = await alcanceDe(U.adminEnX.id);
    igual("el admin con local fijo en X: los de su grupo", [enX.datos?.alcance, enX.ids], [{ modo: "GRUPO", grupoId: grupo2.id }, [localX.id]]);
    const sinRep = await alcanceDe(U.sinReportesA.id);
    igual("sin reportes.ver, mi_alcance igual responde: no pide permiso propio", [sinRep.status, sinRep.ids], [200, [localA.id]]);
    await rechazo("pero ventas_resumen sigue pidiendo el suyo", { usuarioId: U.sinReportesA.id, grupoId: grupo.id, localId: localA.id }, "SIN_PERMISO");
    // Todo lo que mi_alcance devolvió, la puerta lo deja consultar.
    for (const l of glob.datos?.locales || []) {
      const r = await pedirIntegracion({ usuarioId: U.adminGlobal.id, grupoId: l.grupoId, localId: l.id, periodo: { tipo: "hoy" } });
      ok(`lo que mi_alcance lista, ventas_resumen lo acepta: ${l.nombre}`, r.status === 200, json(r.cuerpo));
    }
    igual("23. mi_alcance (y ventas_resumen) no escribieron nada: la base, idéntica", await huella(), antes);
  }
  {
    const viaRuta = await postear({ cuerpo: json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.encargadoA.id] }, parametros: {} }) });
    igual("mi_alcance por la ruta real: 200 con { ok, datos }", [viaRuta.status, viaRuta.cuerpo?.datos?.capacidad], [200, "mi_alcance"]);
    const conAlcance = await postear({ cuerpo: json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.encargadoA.id] }, alcance: { grupoId: grupo2.id, localId: localX.id }, parametros: {} }) });
    igual("mi_alcance con un local elegido por el cliente: 400", [conAlcance.status, conAlcance.cuerpo?.codigo], [400, "SOLICITUD_INVALIDA"]);
  }
  {
    // 19. Le cambian el local al encargado: con el MISMO token, la lista y la puerta cambian a la vez.
    await c.usuario.update({ where: { id: U.encargadoA.id }, data: { localId: localB.id } });
    const despues = await alcanceDe(U.encargadoA.id);
    igual("19. el encargado pasa a B: mi_alcance trae B y ya no A", despues.ids, [localB.id]);
    await rechazo("19b. y ventas_resumen de A falla en la misma pregunta", { usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localA.id }, "FUERA_DE_ALCANCE");
    const deB = await pedirIntegracion({ usuarioId: U.encargadoA.id, grupoId: grupo.id, localId: localB.id, periodo: { tipo: "hoy" } });
    igual("19c. y la de B responde", deB.status, 200);
    await c.usuario.update({ where: { id: U.encargadoA.id }, data: { localId: localA.id } });

    // Un administrador saca B de su grupo: desaparece de la lista y deja de poder consultarse.
    const filaB = await c.grupoLocal.findFirst({ where: { localId: localB.id } });
    await c.grupoLocal.delete({ where: { id: filaB.id } });
    const sinB = await alcanceDe(U.adminGlobal.id);
    ok("el local que se saca del grupo desaparece de mi_alcance", !sinB.ids.includes(localB.id), json(sinB.ids));
    await rechazo("y ventas_resumen de ese local falla aunque Azul Chat lo tuviera guardado", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: localB.id }, "LOCAL_SIN_GRUPO");
    await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });

    // 18. Le sacan el comodín al admin global: pasa de GLOBAL a nada.
    await c.usuario.update({ where: { id: U.adminGlobal.id }, data: { rolId: rolEncargado.id } });
    const sinComodin = await alcanceDe(U.adminGlobal.id);
    igual("18. sin el comodín y sin local fijo: alcance NINGUNO, sin locales", [sinComodin.datos?.alcance, sinComodin.ids], [{ modo: "NINGUNO" }, []]);
    await rechazo("18b. y ventas_resumen de A, que un minuto antes respondía, falla", { usuarioId: U.adminGlobal.id, grupoId: grupo.id, localId: localA.id }, "FUERA_DE_ALCANCE");
    await c.usuario.update({ where: { id: U.adminGlobal.id }, data: { rolId: rolAdmin.id } });
    igual("devuelto el rol, vuelve todo, con el mismo token", (await alcanceDe(U.adminGlobal.id)).ids.length, 4);

    // 17. Desactivado: ni mi_alcance.
    await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: false } });
    igual("17. usuario desactivado: tampoco mi_alcance", (await alcanceDe(U.encargadoA.id)).codigo, "USUARIO_INACTIVO");
    await c.usuario.update({ where: { id: U.encargadoA.id }, data: { activo: true } });
  }

  seccion("K. Lo que garantiza la base sobre la delegación");
  {
    const columnas = (await c.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'DelegacionIntegracion' ORDER BY column_name`
    )).map((x) => x.column_name);
    igual("las columnas son exactamente éstas: ni token, ni código, ni usuario, ni permisos", columnas, ["canjeadoEn", "id", "tokenHash", "vinculoId"]);
    const filas = await c.$queryRawUnsafe(`SELECT row_to_json(d)::text AS t FROM "DelegacionIntegracion" d`);
    const todo = filas.map((f) => f.t).join("\n");
    const claros = [...Object.values(TOKEN), ...Object.values(CODIGO), ...sensibles.filter((s) => typeof s === "string" && /^(vin1|del1)_/.test(s)), SECRETO];
    ok(`ninguna de las ${filas.length} delegaciones contiene un token ni un código en claro`, filas.length > 0 && claros.every((s) => !s || !todo.includes(s)));

    // Un vínculo recién autorizado, todavía sin canjear, para ejercer el insert.
    const a = await autorizarPor(U.gestorA);
    const v = await c.vinculoIntegracion.findUnique({ where: { codigoHash: hashCodigoVinculo(a.codigoCanje) } });
    await falla("el token en claro no entra como hash", () => c.delegacionIntegracion.create({ data: { vinculoId: v.id, tokenHash: generarTokenDelegacion() } }), /tokenHash_check/);
    const fechada = await c.delegacionIntegracion.create({ data: { vinculoId: v.id, tokenHash: "a".repeat(64), canjeadoEn: new Date("2000-01-01T00:00:00Z") } });
    ok("canjeadoEn lo pone la base: no se puede fechar un canje hacia atrás", Math.abs(fechada.canjeadoEn.getTime() - Date.now()) < 60_000, fechada.canjeadoEn.toISOString());
    await falla("un segundo canje del mismo vínculo no entra: índice único", () => c.delegacionIntegracion.create({ data: { vinculoId: v.id, tokenHash: "b".repeat(64) } }), /Unique constraint|vinculoId_key/);
    await falla("un token repetido no entra: índice único", async () => {
      const b = await autorizarPor(U.sinReportesA);
      const vb = await c.vinculoIntegracion.findUnique({ where: { codigoHash: hashCodigoVinculo(b.codigoCanje) } });
      await c.delegacionIntegracion.create({ data: { vinculoId: vb.id, tokenHash: "a".repeat(64) } });
    }, /Unique constraint|tokenHash_key/);
    await falla("una delegación no se edita", () => c.$executeRawUnsafe(`UPDATE "DelegacionIntegracion" SET "tokenHash" = repeat('c', 64) WHERE id = $1`, fechada.id), /no se edita ni se borra/);
    await falla("una delegación no se borra", () => c.$executeRawUnsafe(`DELETE FROM "DelegacionIntegracion" WHERE id = $1`, fechada.id), /no se edita ni se borra/);
    await falla("no se canjea un vínculo que no existe", () => c.$executeRawUnsafe(`INSERT INTO "DelegacionIntegracion" ("vinculoId", "tokenHash") VALUES (999999, repeat('d', 64))`), /vínculo existente|foreign key/i);
    // Revocado y vencido, directo contra la base: lo que la app ya mira, la base lo exige igual.
    const aRev = await autorizarPor(U.gestorA);
    const vRev = await c.vinculoIntegracion.findUnique({ where: { codigoHash: hashCodigoVinculo(aRev.codigoCanje) } });
    await revocarPor(U.gestorA);
    await falla("no se canjea un vínculo revocado", () => c.delegacionIntegracion.create({ data: { vinculoId: vRev.id, tokenHash: "e".repeat(64) } }), /vínculo revocado/);
    const vencidoV = await c.vinculoIntegracion.findFirst({ where: { usuario: { nombre: "canje-vencido" } } });
    await falla("no se canjea un código vencido", () => c.delegacionIntegracion.create({ data: { vinculoId: vencidoV.id, tokenHash: "f".repeat(64) } }), /venció/);

    // 30. Canje contra revocación, a la vez: gane quien gane, el ERP manda.
    const resultados = [];
    for (let i = 0; i < 5; i++) {
      const aC = await autorizarPor(U.gestorA);
      const [k] = await Promise.all([canjearSinCupo(aC.codigoCanje), revocarPor(U.gestorA)]);
      const token = k.cuerpo?.datos?.tokenDelegacion;
      const consulta = token ? await pedirIntegracion({ token, capacidad: "mi_alcance" }) : null;
      resultados.push(token ? `canjeó y la consulta da ${consulta.cuerpo?.codigo ?? consulta.status}` : `no canjeó (${k.cuerpo?.codigo})`);
      ok(`30. canje y revocación a la vez, vuelta ${i + 1}: ningún token sobrevive a la revocación`, !token || consulta.cuerpo?.codigo === "VINCULO_REVOCADO", resultados.at(-1));
    }
    console.log(`    (resultados de la carrera: ${resultados.join("; ")})`);
  }

  seccion("L. La migración, sobre una base que ya tenía vínculos del contrato anterior");
  {
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE_MIGRACION}" WITH (FORCE)`);
    await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE_MIGRACION}"`);
    const urlMig = urlDe(NOMBRE_MIGRACION);
    const previas = aplicarMigraciones(sinQuery(urlMig), { hasta: MIGRACION_DELEGACION });
    cMig = await crearClientePrisma({ nivel: ESCRITURA, url: urlMig });
    const rol = await cMig.rol.create({ data: { nombre: "rol previo", permisos: ["reportes.ver"] } });
    const persona = await cMig.usuario.create({ data: { nombre: "previa", email: "previa@ci.local", passwordHash: "x", rolId: rol.id } });
    const otra = await cMig.usuario.create({ data: { nombre: "previa-2", email: "previa2@ci.local", passwordHash: "x", rolId: rol.id } });
    // Un vínculo vigente de hace tres días (con el código permanente de antes) y uno revocado.
    const codigoViejo = generarCodigoVinculo();
    const hace3dias = new Date(Date.now() - 3 * 86400000);
    await cMig.vinculoIntegracion.create({ data: { usuarioId: persona.id, aplicacion: "AZUL_CHAT", codigoHash: hashCodigoVinculo(codigoViejo), autorizadoEn: hace3dias } });
    await cMig.vinculoIntegracion.create({ data: { usuarioId: otra.id, aplicacion: "AZUL_CHAT", codigoHash: "1".repeat(64), autorizadoEn: hace3dias, revocadoEn: new Date(hace3dias.getTime() + 1000), revocadoPorId: otra.id } });
    const antes = (await cMig.$queryRawUnsafe(`SELECT row_to_json(v)::text AS t FROM "VinculoIntegracion" v ORDER BY id`)).map((f) => f.t);

    aplicarMigraciones(sinQuery(urlMig), { solo: [MIGRACION_DELEGACION] });
    ok(`28. la migración se aplica sobre ${previas} migraciones previas y vínculos existentes, sin errores`, true);
    const despues = (await cMig.$queryRawUnsafe(`SELECT row_to_json(v)::text AS t FROM "VinculoIntegracion" v ORDER BY id`)).map((f) => f.t);
    igual("los vínculos existentes quedan intactos, byte a byte", despues, antes);
    igual("la tabla nueva nace vacía: no hay backfill", await cMig.delegacionIntegracion.count(), 0);
    const triggers = (await cMig.$queryRawUnsafe(
      `SELECT tgname FROM pg_trigger WHERE tgrelid IN ('"DelegacionIntegracion"'::regclass, '"VinculoIntegracion"'::regclass) AND NOT tgisinternal ORDER BY tgname`
    )).map((t) => t.tgname);
    igual("29. los triggers: los dos nuevos, y el del vínculo sin tocar", triggers, ["DelegacionIntegracion_canje_valido", "DelegacionIntegracion_inmutable", "VinculoIntegracion_solo_se_revoca"]);
    const viejo = await cMig.vinculoIntegracion.findFirst({ where: { usuarioId: persona.id } });
    const cuerpo = json({ codigo: codigoViejo });
    const r = await atenderCanje({ headers: firmadas(cuerpo), cuerpo }, { db: cMig, limitador: null, entorno: ENTORNO });
    igual("el código permanente de antes NO se puede canjear: venció hace días", [r.status, r.cuerpo.codigo], [403, "CANJE_CODIGO_VENCIDO"]);
    await falla("ni directo contra la base", () => cMig.delegacionIntegracion.create({ data: { vinculoId: viejo.id, tokenHash: "2".repeat(64) } }), /venció/);
    await falla("y el trigger del vínculo sigue vivo: no se borra", () => cMig.$executeRawUnsafe(`DELETE FROM "VinculoIntegracion" WHERE id = $1`, viejo.id), /no se borra/);
  }
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  if (c) await c.$disconnect().catch(() => {});
  if (cMig) await cMig.$disconnect().catch(() => {});
  try {
    const { default: prismaApp } = await import("../../lib/prisma.js");
    await prismaApp.$disconnect();
  } catch {
    // la app no llegó a construir su cliente
  }
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE_MIGRACION}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
