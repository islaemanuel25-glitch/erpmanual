// AZUL CHAT · `cajas_resumen` CONTRA POSTGRESQL (Tanda 7A).
//
//   DATABASE_URL=postgresql://…@localhost:5432/postgres AUTH_SECRET=… \
//     node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatCajasResumen.mjs
//
// Con `AZUL_CHAT_FIXTURE_SALIDA=<ruta>` además escribe ahí el fixture para Azul
// Chat: pedidos y respuestas REALES de la puerta, con el token enmascarado.
//
// Lo que los candados de `lib/integraciones/azul-chat/cajasResumen.test.mjs` no
// pueden probar, porque vive en la base (regla 2 de CLAUDE.md): que cada
// consulta, tal como está escrita, devuelve lo que el ERP muestra.
//
//   A. un día con dos turnos operativos y una caja sin turno: el orden, las
//      cajas de cada uno y "Sin turno asignado" al final;
//   B. el estado de cada caja: correcta, falta, sobra, abierta; las diferencias
//      de dos cajas del mismo turno NO se compensan y el turno no lleva una;
//   C. lo digital no es efectivo, el fiado va aparte y no cobrado, la anulada
//      no cuenta (contraprueba: está en la base);
//   D. los retiros con su "a quién": el destino del cierre directo, el
//      proveedor del pago, el beneficiario del gasto; null donde el ERP no lo
//      registra (retiro de recaudación, cierre por el circuito nuevo, Caja −);
//   E. la verificación de Tesorería, aparte de la diferencia de caja;
//   F. las MISMAS piezas que las pantallas: el cobro por medio coincide con la
//      lectura de Tesorería, la diferencia con la guardada al cerrar, el
//      esperado de la caja abierta con `calcularEsperadoDeTurno`, y la suma de
//      los turnos con `ventas_resumen` del día;
//   G. el turno operativo pedido por nombre o id, uno que no existe, y "ayer"
//      sin cajas;
//   H. la puerta: sin `tesoreria.ver` no entra, un parámetro de más se rechaza,
//      y `mi_alcance` la anuncia solo a quien la puede usar;
//   I. ninguna consulta escribe (huella de las tablas).
//
// Los hechos van por el camino real: las cajas se abren, venden, retiran y
// cierran por las rutas del POS (el cierre con destino, por el cierre directo
// `turnos/cerrar`, que es la ruta que lo pide); la caja sin turno se abre por la
// ruta ANTES de que el local tenga turnos —el modo legado de la apertura—; los
// pagos salen por `registrarPagoProveedor` y `crearGasto`; la anulación por
// `revertirVenta`; la verificación por su ruta; la delegación por autorizar y
// canjear. Lo escrito directo es SOLO configuración: los dos turnos operativos
// del catálogo (con la ventana de todo el día de las pruebas de turno operativo,
// para que la prueba no dependa de la hora), el cliente del fiado y el pedido
// a proveedor del que nace la deuda.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { crearProductoVendible } = await import("./fixturePos.mjs");

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
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}

const NOMBRE = "erpazul_azul_chat_cajas_resumen";
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

// Secretos de ESTA prueba, inventados acá; distintos entre sí.
const SECRETO = "prueba-azul-chat-cajas-resumen-0123456789abcdef";
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-erp-cajas-resumen-0123456789abcdef";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };
const SALIDA_FIXTURE = process.env.AZUL_CHAT_FIXTURE_SALIDA || null;

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(sinQuery(urlPrueba));
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra ─────────────────────────────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const local = await c.local.create({ data: { nombre: "Local Centro" } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await c.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });

  const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
  const PERMISOS_POS = ["pos.usar", "pos.cerrar_sin_conteo"];
  const PERMISOS_FIN = ["finanzas.ver", "finanzas.gastos.registrar", "finanzas.pagos_proveedores.registrar"];
  const PERMISOS_TESORERIA = ["tesoreria.ver", "tesoreria.verificar_efectivo"];
  const rolCaja = await c.rol.create({ data: { nombre: "CI caja", permisos: [...PERMISOS_POS, ...PERMISOS_FIN] } });
  const rolTesoreria = await c.rol.create({ data: { nombre: "CI tesorería", permisos: PERMISOS_TESORERIA } });
  const rolEncargado = await c.rol.create({ data: { nombre: "CI encargado", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const usuario = (nombre, rolId) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId: local.id, activo: true } });
  const U = {
    caja: await usuario("cuenta-del-mostrador", rolCaja.id),
    tesoreria: await usuario("tesorera", rolTesoreria.id),
    encargado: await usuario("encargado", rolEncargado.id),
  };
  const producto = await crearProductoVendible(c, { grupoId: grupo.id, localId: local.id, nombre: "Producto", precioVenta: 1000, precioCosto: 600, stock: 100000 });
  // ESCRITO DIRECTO: datos maestros, no hechos de caja.
  const clienteFiado = await c.cliente.create({ data: { grupoId: grupo.id, localId: local.id, nombre: "Cliente fiado" } });
  const proveedor = await c.proveedor.create({ data: { nombre: "Panadería La Espiga" } });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
  const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
  const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");
  const { crearCuentaPorPagarDesdeCompra, registrarPagoProveedor } = await import("../../lib/finanzas/pagosProveedoresServer.js");
  const { crearGasto, categoriasDeGasto } = await import("../../lib/finanzas/gastosServer.js");
  const { revertirVenta } = await import("../../lib/pos-ventas/reversionVenta.js");
  const { leerTesoreria, rangoDeTesoreria, whereVentasDeTesoreria } = await import("../../lib/tesoreria/lecturaTesoreriaServer.js");
  const { calcularEsperadoDeTurno } = await import("../../lib/caja/arqueoServer.js");
  const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
  const { atenderCanje } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const { armarCajasResumen } = await import("../../lib/integraciones/azul-chat/cajasResumen.js");
  const rutaAutorizar = await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
  const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
  const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
  const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
  const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  const rutaCierreIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
  const rutaCierreConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  const rutaCerrarDirecto = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
  const rutaVerificar = await import("../../app/api/finanzas/tesoreria/verificaciones/route.js");

  const sesion = ({ id, nombre, localId, permisos }) =>
    jwt.sign(
      { id, nombre, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cookieDe = async (u) => {
    const fila = await c.usuario.findUnique({ where: { id: u.id }, select: { nombre: true, localId: true, rol: { select: { permisos: true } } } });
    return `erpazul_sesion=${sesion({ id: u.id, nombre: fila.nombre, localId: fila.localId, permisos: fila.rol.permisos })}`;
  };
  const sesionCaja = sesion({ id: U.caja.id, nombre: U.caja.nombre, localId: local.id, permisos: PERMISOS_POS });
  const BASE = "http://ci/api/pos-ventas";
  const leer = async (r) => {
    const res = await r;
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const pedidoPos = (url, quien, cuerpo) => {
    const cookie = [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
    const req = new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: json(cuerpo ?? {}) });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    return req;
  };
  const conToken = (t) => ({ params: Promise.resolve({ token: t }) });

  /** Un desglose de billetes que suma exactamente `monto` (múltiplo de 100). */
  function desgloseDe(monto) {
    const d = {};
    let resto = monto;
    for (const { valor } of DENOMINACIONES) {
      const n = Math.floor(resto / valor);
      if (n > 0) { d[valor] = n; resto -= n * valor; }
    }
    if (resto !== 0) throw new Error(`desgloseDe: ${monto} no es múltiplo de 100`);
    return d;
  }

  let n = 0;
  const clave = () => `cajas-resumen-${(n += 1)}`;

  // ── Las cajas, por las rutas del POS ────────────────────────────────────
  async function nuevaCaja(nombreOperador, { fondo = 1000, turnoOperativoId } = {}) {
    const op = await c.operadorLocal.create({ data: { nombre: nombreOperador, pinHash: "x" } });
    await c.operadorEnLocal.create({ data: { operadorId: op.id, localId: local.id } });
    const quien = { sesion: sesionCaja, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: local.id }) };
    const cuerpo = { montoInicial: fondo, ...(turnoOperativoId ? { turnoOperativoId } : {}) };
    const r = await leer(rutaAbrir.POST(pedidoPos(`${BASE}/turnos/abrir`, quien, cuerpo)));
    requerir(`abre la caja de ${nombreOperador}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id };
  }
  async function vender(caja, formaPago, monto, extra = {}) {
    const r = await leer(rutaCrear.POST(pedidoPos(`${BASE}/crear`, caja.quien, {
      clientTxnId: clave(), localId: local.id, clienteId: null, turnoId: caja.turnoId, formaPago,
      esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
      items: [itemCrearPayload({ productoBaseId: producto.baseId, nombre: "P", precio: 1000, cantidad: monto / 1000, precioCosto: 600 })],
      ...extra,
    })));
    requerir(`vende ${formaPago} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
    return r.ventaId ?? r.venta?.id;
  }
  async function retirar(caja, cambio, contado) {
    const ini = await leer(rutaRetiroIniciar.POST(pedidoPos(`${BASE}/retiros/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
    requerir("inicia el retiro", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    const tok = ini.retiro?.token ?? ini.preparacion?.token ?? ini.token;
    const fin = await leer(rutaRetiroConfirmar.POST(pedidoPos(`${BASE}/retiros/${tok}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(tok)));
    requerir("confirma el retiro", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
  }
  async function cerrar(caja, cambio, contado) {
    const ini = await leer(rutaCierreIniciar.POST(pedidoPos(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: desgloseDe(cambio) })));
    requerir("inicia el cierre", ini.ok === true, `${ini.status} ${ini.error ?? ""}`);
    const fin = await leer(rutaCierreConfirmar.POST(pedidoPos(`${BASE}/cierres/${ini.cierre.token}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(contado) }), conToken(ini.cierre.token)));
    requerir("confirma el cierre", fin.ok === true, `${fin.status} ${fin.error ?? ""}`);
  }
  const mover = async (caja, tipo, monto, motivo) => {
    const r = await leer(rutaMovimiento.POST(pedidoPos(`${BASE}/caja-movimientos/crear`, caja.quien, { turnoId: caja.turnoId, tipo, monto, motivo })));
    requerir(`Caja ${tipo} $${monto}`, r.ok === true, `${r.status} ${r.error ?? ""}`);
  };

  // S · la caja SIN TURNO: se abre por la ruta mientras el local todavía no
  // tiene turnos operativos (modo legado de la apertura).
  const S = await nuevaCaja("Sofía");
  await vender(S, "EFECTIVO", 20000);
  await vender(S, "DEBITO", 3000);
  await cerrar(S, 1000, 20000); // cajón 21.000 = esperado: correcta
  requerir("la caja de Sofía quedó sin turno operativo", (await c.turno.findUnique({ where: { id: S.turnoId } })).turnoOperativoId === null);

  // ESCRITO DIRECTO: el catálogo de turnos del local, con la ventana de todo el
  // día que usan las pruebas de turno operativo (los dos se pueden abrir a
  // cualquier hora y con la fecha de hoy).
  const todoElDia = { horaInicioReconocimiento: "00:00", horaFinReconocimiento: "01:00" };
  const manana = await c.turnoOperativo.create({ data: { localId: local.id, nombre: "Mañana", orden: 0, ...todoElDia } });
  const tarde = await c.turnoOperativo.create({ data: { localId: local.id, nombre: "Tarde", orden: 1, ...todoElDia } });

  // M1 · Ana, Mañana: digital, fiado, una anulada, retiro de recaudación, pago a
  // proveedor desde la caja; cierra correcta y Tesorería la verifica.
  const M1 = await nuevaCaja("Ana", { turnoOperativoId: manana.id });
  await vender(M1, "EFECTIVO", 50000);
  await vender(M1, "DEBITO", 8000);
  await vender(M1, "MERCADOPAGO", 7000);
  await vender(M1, "FIADO", 3000, { esFiado: true, clienteId: clienteFiado.id });
  const anulada = await vender(M1, "EFECTIVO", 4000);
  {
    const venta = await c.venta.findUnique({
      where: { id: anulada },
      select: {
        id: true, numero: true, total: true, esFiado: true, clienteId: true, localId: true, operadorId: true, turnoId: true, version: true, anuladaEn: true,
        turno: { select: { id: true, cierre: true } },
        pagos: { select: { medio: true, monto: true } },
        detalles: { select: { id: true, nombre: true, productoLocalId: true, cantidadStock: true, componentes: { select: { productoLocalId: true, cantidad: true } } } },
      },
    });
    await c.$transaction((tx) => revertirVenta(tx, { venta, grupoId: grupo.id, usuarioId: U.caja.id, motivo: "prueba cajas_resumen", versionEsperada: venta.version }));
  }
  await retirar(M1, 21000, 30000); // cajón 51.000: se llevan 30.000 y quedan 21.000
  const pedidoPan = await c.pedidoProveedor.create({ data: { grupoId: grupo.id, depositoId: local.id, proveedorId: proveedor.id, estado: "RECIBIDO" } });
  const { cuenta: cuentaPan } = await c.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, { pedidoProveedorId: pedidoPan.id, localGastoId: local.id, total: 5000, usuarioId: U.caja.id })
  );
  await c.$transaction((tx) =>
    registrarPagoProveedor(tx, {
      cuentaId: cuentaPan.id, monto: 5000, medio: "EFECTIVO", turnoId: M1.turnoId,
      localOrigenId: local.id, localOperativoId: local.id, usuarioId: U.caja.id, idempotencyKey: clave(),
    })
  );
  await cerrar(M1, 1000, 15000); // cajón 16.000 = esperado: correcta

  // M2 · Bruno, Mañana: Caja − y Caja +; cierra con FALTANTE de $1.000.
  const M2 = await nuevaCaja("Bruno", { turnoOperativoId: manana.id });
  await vender(M2, "EFECTIVO", 10000);
  await mover(M2, "RETIRO", 2000, "Compra de bolsas");
  await mover(M2, "INGRESO", 500, "Cambio que trajo el encargado");
  await cerrar(M2, 1000, 7500); // esperado 9.500, contado 8.500

  // M3 · Carla, Mañana: SOBRANTE de $1.000. Con el faltante de Bruno suman
  // cero: no se compensan.
  const M3 = await nuevaCaja("Carla", { turnoOperativoId: manana.id });
  await vender(M3, "EFECTIVO", 5000);
  await cerrar(M3, 1000, 6000); // esperado 6.000, contado 7.000

  // T1 · Diego, Tarde: cierre directo con destino y quien recibe; faltan $500.
  const T1 = await nuevaCaja("Diego", { turnoOperativoId: tarde.id });
  await vender(T1, "EFECTIVO", 12000);
  await vender(T1, "CREDITO", 4000);
  {
    const r = await leer(rutaCerrarDirecto.POST(pedidoPos(`${BASE}/turnos/cerrar`, T1.quien, {
      turnoId: T1.turnoId, montoRealEfectivo: 12500, efectivoRetirado: 11500, fondoDejado: 1000,
      destinoRetiro: "Caja fuerte", recibidoPor: "Encargada Laura",
    })));
    requerir("cierre directo con destino", r.ok === true, `${r.status} ${r.error ?? ""}`);
  }

  // T2 · Eva, Tarde: queda ABIERTA, con un gasto pagado desde la caja.
  const T2 = await nuevaCaja("Eva", { fondo: 2000, turnoOperativoId: tarde.id });
  await vender(T2, "EFECTIVO", 9000);
  await vender(T2, "MERCADOPAGO", 1000);
  {
    const sesionFin = { id: U.caja.id, esAdmin: false, permisos: PERMISOS_FIN, localId: local.id };
    const categoria = (await categoriasDeGasto(c)).find((x) => x.nombre === "Servicios") ?? (await categoriasDeGasto(c))[0];
    await c.$transaction((tx) =>
      crearGasto(tx, {
        session: sesionFin, grupoId: grupo.id, localId: local.id, localOperativoId: local.id,
        categoriaId: categoria.id, concepto: "Arreglo de canilla", beneficiario: "Plomero Juan", total: 1500, fecha: hoyArgentinaISO(),
        idempotencyKey: clave(), pagoInicial: { monto: 1500, medio: "EFECTIVO", turnoId: T2.turnoId },
      })
    );
  }

  // La verificación de Tesorería de las dos entregas de Ana, por su ruta.
  {
    // Las entregas, por sus vínculos: la de recaudación desde su ArqueoCaja y
    // la de cierre desde el Turno.
    const recaudacion = await c.arqueoCaja.findMany({ where: { turnoId: M1.turnoId, cajaMovimientoRetiroId: { not: null } }, select: { cajaMovimientoRetiroId: true } });
    const { retiroCierreMovimientoId } = await c.turno.findUnique({ where: { id: M1.turnoId }, select: { retiroCierreMovimientoId: true } });
    const ids = [...recaudacion.map((a) => a.cajaMovimientoRetiroId), retiroCierreMovimientoId].filter((x) => x != null);
    requerir("Ana tiene dos entregas vinculadas", ids.length === 2, json(ids));
    const req = new Request("http://ci/api/finanzas/tesoreria/verificaciones", {
      method: "POST",
      headers: { cookie: await cookieDe(U.tesoreria), "content-type": "application/json" },
      body: json({ cajaMovimientoIds: ids, importeVerificado: 45000, idempotencyKey: clave() }),
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(req.url), configurable: true });
    const r = await leer(rutaVerificar.POST(req));
    requerir("Tesorería verifica las entregas de Ana", r.status === 201, `${r.status} ${r.codigo ?? ""} ${r.error ?? ""}`);
  }

  // ── La delegación y la puerta reales ────────────────────────────────────
  const firmadas = (cuerpo, { marca = String(Math.floor(Date.now() / 1000)) } = {}) => {
    const headers = new Headers({ "content-type": "application/json", [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca });
    headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca, cuerpo }));
    return headers;
  };
  const vincular = async (u) => {
    const a = await leer(rutaAutorizar.POST(new Request("http://ci/api/integraciones/azul-chat/vinculo/autorizar", { method: "POST", headers: { cookie: await cookieDe(u) } })));
    if (a.status !== 200 || !a.codigoCanje) throw new Error(`autorizar ${u.nombre}: ${a.status} ${json(a)}`);
    const cuerpo = json({ codigo: a.codigoCanje });
    const k = aRespuestaPublica(await atenderCanje({ headers: firmadas(cuerpo), cuerpo }, { db: c, limitador: null, entorno: ENTORNO }));
    if (k.status !== 200) throw new Error(`canjear ${u.nombre}: ${k.status} ${json(k.cuerpo)}`);
    return k.cuerpo.datos.tokenDelegacion;
  };
  const TOKEN = {};
  for (const u of [U.tesoreria, U.encargado]) TOKEN[u.id] = await vincular(u);

  const consultar = async ({ capacidad = "cajas_resumen", usuario: u = U.tesoreria, parametros = { periodo: { tipo: "hoy" } }, ahora = Date.now() }) => {
    const pedido = capacidad === "mi_alcance"
      ? { capacidad, delegacion: { token: TOKEN[u.id] }, parametros }
      : { capacidad, delegacion: { token: TOKEN[u.id] }, alcance: { grupoId: grupo.id, localId: local.id }, parametros };
    const cuerpo = json(pedido);
    const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo, { marca: String(Math.floor(ahora / 1000)) }), cuerpo }, { entorno: ENTORNO, ahora, limitador: null }));
    return { ...r, pedido: { ...pedido, delegacion: { token: "<token>" } } };
  };

  const huella = async () =>
    (await c.$queryRawUnsafe(`
      SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
        SELECT 'T' || row_to_json(t)::text AS x FROM "Turno" t
        UNION ALL SELECT 'M' || row_to_json(m)::text FROM "CajaMovimiento" m
        UNION ALL SELECT 'V' || row_to_json(v)::text FROM "Venta" v
        UNION ALL SELECT 'A' || row_to_json(a)::text FROM "ArqueoCaja" a
        UNION ALL SELECT 'E' || row_to_json(e)::text FROM "VerificacionEfectivo" e
        UNION ALL SELECT 'G' || row_to_json(g)::text FROM "DelegacionIntegracion" g
      ) q`))[0].h;
  const antes = await huella();

  const hoy = await consultar({});
  requerir("hoy: 200", hoy.status === 200, `${hoy.status} ${json(hoy.cuerpo)}`);
  const D = hoy.cuerpo.datos;
  const turnoDe = (nombre) => D.turnosOperativos.find((t) => t.turnoOperativo.nombre === nombre);
  const cajaDe = (caja) => D.turnosOperativos.flatMap((t) => t.cajas).find((x) => x.id === caja.turnoId);
  const medio = (lista, m) => lista.find((x) => x.medio === m)?.total ?? null;

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A. Turnos operativos y la caja sin turno al final");
  // ═════════════════════════════════════════════════════════════════════════
  igual("la forma de la respuesta", Object.keys(D), ["capacidad", "version", "local", "grupoId", "periodo", "turnoOperativoPedido", "turnosOperativos", "advertencias"]);
  igual("Mañana, Tarde y Sin turno asignado, en ese orden",
    D.turnosOperativos.map((t) => [t.turnoOperativo.id, t.turnoOperativo.nombre, t.sinTurnoAsignado]),
    [[manana.id, "Mañana", false], [tarde.id, "Tarde", false], [null, "Sin turno asignado", true]]);
  igual("las cajas de cada turno, por apertura",
    D.turnosOperativos.map((t) => t.cajas.map((x) => x.operador)),
    [["Ana", "Bruno", "Carla"], ["Diego", "Eva"], ["Sofía"]]);
  igual("el período es el día argentino de hoy", [D.periodo.tipo, D.periodo.fecha], ["hoy", hoyArgentinaISO()]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("B. Estado y diferencia de cada caja, sin compensar");
  // ═════════════════════════════════════════════════════════════════════════
  igual("Ana correcta, Bruno falta 1.000, Carla sobra 1.000, Diego falta 500, Eva abierta, Sofía correcta",
    [M1, M2, M3, T1, T2, S].map((x) => [cajaDe(x).estado, cajaDe(x).diferencia]),
    [
      ["CORRECTA", { monto: "0.00", tipo: "NINGUNA" }],
      ["CON_DIFERENCIA", { monto: "1000.00", tipo: "FALTA" }],
      ["CON_DIFERENCIA", { monto: "1000.00", tipo: "SOBRA" }],
      ["CON_DIFERENCIA", { monto: "500.00", tipo: "FALTA" }],
      ["ABIERTA", null],
      ["CORRECTA", { monto: "0.00", tipo: "NINGUNA" }],
    ]);
  igual("esperado y contado de Bruno: 9.500 y 8.500", [cajaDe(M2).efectivoEsperado, cajaDe(M2).efectivoContado], ["9500.00", "8500.00"]);
  igual("el turno no lleva diferencia ni contado: son de cada caja", Object.keys(turnoDe("Mañana").totales), ["cantidadVentas", "totalVendido", "ventasEfectivo", "ventasPorMedio", "ventasNoCobradas"]);
  ok("ningún total de turno nombra una diferencia", !json(D.turnosOperativos.map((t) => t.totales)).includes("diferencia"));
  igual("Diego: retiro y fondo del cierre", [cajaDe(T1).efectivoRetiradoCierre, cajaDe(T1).fondoDejadoCierre, cajaDe(T1).montoInicial], ["11500.00", "1000.00", "1000.00"]);
  igual("Eva abierta: sin cierre, contado ni diferencia", [cajaDe(T2).cierre, cajaDe(T2).efectivoContado, cajaDe(T2).diferencia], [null, null, null]);
  igual("ninguna advertencia de suma que no cierra", D.advertencias.map((a) => a.codigo), ["DIA_EN_CURSO"]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C. Digital no es efectivo, fiado aparte, anulada afuera");
  // ═════════════════════════════════════════════════════════════════════════
  const ana = cajaDe(M1);
  igual("Ana: efectivo 50.000; débito 8.000 y Mercado Pago 7.000 aparte",
    [ana.ventasEfectivo, medio(ana.ventasPorMedio, "DEBITO"), medio(ana.ventasPorMedio, "MERCADOPAGO")], ["50000.00", "8000.00", "7000.00"]);
  igual("las etiquetas del ERP", ana.ventasPorMedio.map((m) => m.etiqueta), ["Efectivo", "Débito", "Mercado Pago"]);
  igual("el fiado aparte y no cobrado", ana.ventasNoCobradas.map((m) => [m.medio, m.total, m.cobrado]), [["FIADO", "3000.00", false]]);
  igual("4 ventas y $68.000: la anulada no cuenta", [ana.cantidadVentas, ana.totalVendido], [4, "68000.00"]);
  igual("CONTRAPRUEBA: la anulada está en la base", await c.venta.count({ where: { turnoId: M1.turnoId } }), 5);
  igual("el esperado de Ana no lleva lo digital: 1.000 + 50.000 − 30.000 − 5.000", ana.efectivoEsperado, "16000.00");
  igual("Mañana: 6 ventas por $83.000 y el efectivo de las tres cajas",
    [turnoDe("Mañana").totales.cantidadVentas, turnoDe("Mañana").totales.totalVendido, turnoDe("Mañana").totales.ventasEfectivo], [6, "83000.00", "65000.00"]);
  igual("Tarde: 4 ventas por $26.000 con crédito y Mercado Pago",
    [turnoDe("Tarde").totales.cantidadVentas, turnoDe("Tarde").totales.totalVendido, medio(turnoDe("Tarde").totales.ventasPorMedio, "CREDITO"), medio(turnoDe("Tarde").totales.ventasPorMedio, "MERCADOPAGO")],
    [4, "26000.00", "4000.00", "1000.00"]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("D. Retiros con su motivo y a quién");
  // ═════════════════════════════════════════════════════════════════════════
  const resumenRetiro = (r) => [r.tipo, r.monto, r.aQuien, r.recibidoPor];
  igual("Ana: recaudación sin destino, pago al proveedor, cierre sin destino",
    ana.retiros.map(resumenRetiro),
    [["RETIRO_RECAUDACION", "30000.00", null, null], ["PAGO_PROVEEDOR", "5000.00", "Panadería La Espiga", null], ["RETIRO_CIERRE", "15000.00", null, null]]);
  ok("cada retiro con su hora, motivo y quién lo registró", ana.retiros.every((r) => r.hora && r.motivo && r.registradoPor === "cuenta-del-mostrador"), json(ana.retiros));
  igual("Diego: el cierre directo con su destino y quien recibe", cajaDe(T1).retiros.map(resumenRetiro), [["RETIRO_CIERRE", "11500.00", "Caja fuerte", "Encargada Laura"]]);
  igual("Bruno: Caja − con su motivo, a quién no registrado", cajaDe(M2).retiros.map((r) => [r.tipo, r.monto, r.motivo, r.aQuien]).slice(0, 1), [["RETIRO_MANUAL", "2000.00", "Compra de bolsas", null]]);
  igual("Bruno: el Caja + es un ingreso", cajaDe(M2).ingresos.map((i) => [i.monto, i.motivo]), [["500.00", "Cambio que trajo el encargado"]]);
  igual("Eva: el gasto pagado desde la caja, al beneficiario", cajaDe(T2).retiros.map(resumenRetiro), [["PAGO_GASTO", "1500.00", "Plomero Juan", null]]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("E. Verificación de Tesorería, aparte de la caja");
  // ═════════════════════════════════════════════════════════════════════════
  igual("Ana verificada, Bruno falta verificar, Eva no entregó nada",
    [cajaDe(M1).verificacionTesoreria, cajaDe(M2).verificacionTesoreria, cajaDe(T2).verificacionTesoreria], ["VERIFICADA", "FALTA_VERIFICAR", "NO_APLICA"]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("F. Las mismas piezas que las pantallas");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const { fechaInicio, fechaFin } = await rangoDeTesoreria(c, { localId: local.id, rangoFijo: { desde: hoyArgentinaISO(), hasta: hoyArgentinaISO() } });
    const lectura = await leerTesoreria(c, { localId: local.id, fechaInicio, fechaFin });
    const cobradosTesoreria = lectura.cajas.map((x) => [x.turnoId, x.cobradoPorMedio.map((m) => [m.medio, m.montoDeclarado.toFixed(2)])]);
    const cobradosCapacidad = lectura.cajas.map((x) => [x.turnoId, D.turnosOperativos.flatMap((t) => t.cajas).find((y) => y.id === x.turnoId).ventasPorMedio.map((m) => [m.medio, m.total])]);
    igual("el cobro por medio de cada caja es el de Tesorería", cobradosCapacidad, cobradosTesoreria);
    igual("las mismas cajas que Tesorería", D.turnosOperativos.flatMap((t) => t.cajas.map((x) => x.id)).sort((a, b) => a - b), lectura.cajas.map((x) => x.turnoId));
    const guardadas = await c.turno.findMany({ where: { localId: local.id, cierre: { not: null } }, select: { id: true, diferenciaEfectivo: true } });
    const firmada = (x) => (x.diferencia.tipo === "FALTA" ? -1 : 1) * Number(x.diferencia.monto);
    igual("la diferencia informada es la guardada al cerrar",
      guardadas.map((t) => [t.id, firmada(cajaDe({ turnoId: t.id }))]).sort(), guardadas.map((t) => [t.id, Number(t.diferenciaEfectivo)]).sort());
    const t2 = await c.turno.findUnique({ where: { id: T2.turnoId }, select: { id: true, montoInicial: true } });
    const vivo = await calcularEsperadoDeTurno(t2, c);
    igual("Eva abierta: el esperado es el de calcularEsperadoDeTurno (2.000 + 9.000 − 1.500)", [cajaDe(T2).efectivoEsperado, Number(vivo.efectivoEsperado).toFixed(2)], ["9500.00", "9500.00"]);
    const vr = await consultar({ capacidad: "ventas_resumen", parametros: { periodo: { tipo: "hoy" } } });
    // ventas_resumen pide reportes.ver; la tesorera no lo tiene. Se compara contra
    // la función real con la misma base, sin la puerta.
    const { ventasResumen } = await import("../../lib/integraciones/azul-chat/ventasResumen.js");
    const v = await ventasResumen({ localId: local.id, grupoId: grupo.id }, { periodo: { tipo: "hoy" } }, { db: c });
    const sumaTurnos = D.turnosOperativos.reduce((s, t) => s + Math.round(Number(t.totales.totalVendido) * 100), 0) / 100;
    igual("la suma de los turnos es ventas_resumen del día", [sumaTurnos.toFixed(2), D.turnosOperativos.reduce((s, t) => s + t.totales.cantidadVentas, 0)], [v.datos.totalVendido, v.datos.cantidadVentas]);
    igual("y la puerta no le da ventas_resumen a quien no tiene reportes.ver", vr.status, 403);
    // CONTRAPRUEBA: sin el filtro comercial del `where` compartido, la anulada entra.
    const conAnulada = await c.venta.count({ where: { localId: local.id, OR: whereVentasDeTesoreria({ localId: local.id, fechaInicio, fechaFin }).OR } });
    const sinAnulada = await c.venta.count({ where: whereVentasDeTesoreria({ localId: local.id, fechaInicio, fechaFin }) });
    igual("CONTRAPRUEBA: el where de Tesorería es el que saca la anulada", conAnulada - sinAnulada, 1);
    // CONTRAPRUEBA: sin el esperado vivo, la caja abierta no tendría esperado.
    const sinVivo = armarCajasResumen({
      local: { id: local.id, nombre: local.nombre, activo: true }, grupoId: grupo.id,
      pedido: { tipo: "hoy", dia: hoyArgentinaISO(), hoy: hoyArgentinaISO() }, lectura,
      turnos: await c.turno.findMany({ where: { id: T2.turnoId }, select: { id: true, apertura: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true, montoInicial: true, montoEsperadoEfectivo: true, montoRealEfectivo: true, efectivoRetiradoCierre: true, fondoDejadoCierre: true, destinoRetiroCierre: true, recibidoPorCierre: true, turnoOperativoId: true, fechaOperativa: true, turnoOperativo: { select: { nombre: true, orden: true } } } }),
      inicioDelDia: fechaInicio,
    });
    igual("CONTRAPRUEBA: sin calcularEsperadoDeTurno, Eva queda sin esperado", sinVivo.turnosOperativos[0].cajas[0].efectivoEsperado, null);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("G. Filtro por turno operativo y un día sin cajas");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const porNombre = await consultar({ parametros: { periodo: { tipo: "hoy" }, turnoOperativo: "tarde" } });
    igual("«tarde» (sin mayúscula): solo Tarde, con Diego y Eva",
      [porNombre.status, porNombre.cuerpo.datos?.turnoOperativoPedido, porNombre.cuerpo.datos?.turnosOperativos.map((t) => [t.turnoOperativo.nombre, t.cajas.map((x) => x.operador)])],
      [200, { id: tarde.id, nombre: "Tarde" }, [["Tarde", ["Diego", "Eva"]]]]);
    const porId = await consultar({ parametros: { periodo: { tipo: "fecha", fecha: hoyArgentinaISO() }, turnoOperativo: manana.id } });
    igual("por id: solo Mañana", porId.cuerpo.datos?.turnosOperativos.map((t) => t.turnoOperativo.nombre), ["Mañana"]);
    const noExiste = await consultar({ parametros: { periodo: { tipo: "hoy" }, turnoOperativo: "Noche" } });
    igual("un turno que el local no tiene: 400 con sus nombres", [noExiste.status, noExiste.cuerpo.codigo, /Mañana, Tarde/.test(noExiste.cuerpo.error ?? "")], [400, "TURNO_OPERATIVO_INVALIDO", true]);
    const ayer = await consultar({ parametros: { periodo: { tipo: "ayer" } } });
    igual("ayer no hubo cajas: lista vacía, sin advertencia de día en curso", [ayer.status, ayer.cuerpo.datos?.turnosOperativos, ayer.cuerpo.datos?.advertencias], [200, [], []]);
    const ayerTarde = await consultar({ parametros: { periodo: { tipo: "ayer" } , turnoOperativo: "Tarde" } });
    igual("ayer, Tarde: el turno aparece sin cajas", ayerTarde.cuerpo.datos?.turnosOperativos.map((t) => [t.turnoOperativo.nombre, t.cajas.length, t.totales.totalVendido]), [["Tarde", 0, "0.00"]]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("H. La puerta: permiso, parámetros y anuncio");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const sinPermiso = await consultar({ usuario: U.encargado });
    // SIN_PERMISO adentro; desde afuera, NO_AUTORIZADO (respuestaPublica.js).
    igual("el encargado (sin tesoreria.ver) no entra", [sinPermiso.status, sinPermiso.cuerpo.codigo], [403, "NO_AUTORIZADO"]);
    const deMas = await consultar({ parametros: { periodo: { tipo: "hoy" }, localId: 999 } });
    igual("un parámetro de más se rechaza", deMas.status, 400);
    const anuncio = async (u) => {
      const r = await consultar({ capacidad: "mi_alcance", usuario: u, parametros: {} });
      return r.cuerpo.datos.locales.find((l) => l.id === local.id)?.capacidades ?? [];
    };
    ok("mi_alcance la anuncia a la tesorera", (await anuncio(U.tesoreria)).includes("cajas_resumen"));
    ok("y no al encargado", !(await anuncio(U.encargado)).includes("cajas_resumen"));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("I. Ninguna consulta escribe");
  // ═════════════════════════════════════════════════════════════════════════
  igual("la huella de cajas, ventas, verificaciones y delegaciones no cambió", await huella(), antes);

  // ═════════════════════════════════════════════════════════════════════════
  if (SALIDA_FIXTURE) {
    seccion("Fixture para Azul Chat");
    // Lo que contesta la puerta real, para que Azul Chat copie el contrato de
    // acá y no lo escriba de memoria. El token va enmascarado.
    const ahora = Date.now();
    const intercambio = async (args) => {
      const r = await consultar({ ...args, ahora });
      return { pedido: r.pedido, respuesta: { status: r.status, cuerpo: r.cuerpo } };
    };
    const fixture = {
      _origen: null,
      ahora: new Date(ahora).toISOString(),
      dia: {
        hoy: await intercambio({}),
        turnoTarde: await intercambio({ parametros: { periodo: { tipo: "hoy" }, turnoOperativo: "Tarde" } }),
        ayerSinCajas: await intercambio({ parametros: { periodo: { tipo: "ayer" } } }),
      },
      rechazos: {
        turnoInexistente: await intercambio({ parametros: { periodo: { tipo: "hoy" }, turnoOperativo: "Noche" } }),
        periodoInvalido: await intercambio({ parametros: { periodo: { tipo: "rango", desde: "2026-01-01", hasta: "2026-01-02" } } }),
        sinPermiso: await intercambio({ usuario: U.encargado }),
      },
      miAlcance: {
        tesoreria: await intercambio({ capacidad: "mi_alcance", parametros: {} }),
        encargado: await intercambio({ capacidad: "mi_alcance", usuario: U.encargado, parametros: {} }),
      },
    };
    const texto = json(fixture);
    ok("el fixture no lleva ningún token real", !Object.values(TOKEN).some((t) => texto.includes(t)));
    fixture._origen = {
      generadoPor: "scripts/pruebas-db/azulChatCajasResumen.mjs",
      commit: process.env.FIXTURE_COMMIT || null,
      nota: "Pedidos y respuestas reales de la puerta del ERP (atenderSolicitudAzulChat) contra una base descartable. Un día con dos turnos operativos, cajas correctas, con falta y con sobra, una abierta y una sin turno asignado. No se edita a mano: se regenera.",
    };
    fs.writeFileSync(SALIDA_FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`  · escrito ${SALIDA_FIXTURE}`);
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
