// AZUL CHAT · `pedidos_eventos`, `envios_eventos` Y `cancelaciones_eventos`
// CONTRA POSTGRESQL (Tanda 4A).
//
//   DATABASE_URL=postgresql://…@localhost:5432/postgres AUTH_SECRET=… \
//     node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatEventosTanda4a.mjs
//
// Con `AZUL_CHAT_FIXTURE_SALIDA=<ruta>` además escribe ahí el fixture para Azul
// Chat: pedidos y respuestas REALES de las tres capacidades y de `mi_alcance`,
// por la puerta de verdad, con el token enmascarado.
//
// Lo que los candados de `lib/integraciones/azul-chat/eventosTanda4a.test.mjs`
// no pueden probar, porque vive en la base (regla 2 de CLAUDE.md): que cada
// consulta de Prisma, tal como está escrita, hace lo que dice contra
// PostgreSQL.
//
//   · A. dos eventos con la MISMA fecha no se pierden, aun cortando la página
//     entre ellos — y la CONTRAPRUEBA: sin el desempate por id, se pierden;
//   · B. un id mayor con fecha menor sale en su lugar por fecha;
//   · C/D. un evento recién producido no sale dentro de los 60 s; pasado el
//     margen sale una sola vez;
//   · sin la columna del hecho no hay evento (un Borrador, un remito o una
//     cancelación históricos sin fecha);
//   · el local A no ve los del B; el pedido cancelado (que se BORRA) deja de
//     estar; un remito cancelado sigue siendo un envío;
//   · cada capacidad pide SU permiso, en vivo, con la misma delegación, y
//     `mi_alcance` lo anuncia igual que la puerta;
//   · ninguna consulta escribe (huella de las tablas), y transferencias_eventos
//     sigue contestando.
//
// Los hechos se producen por el camino real: la solicitud por la RUTA
// `pos-transferencias/solicitar`, el envío por `crearTransferencia` —el servicio
// real del envío, el mismo que usa la prueba de transferencias_eventos— y la
// cancelación por la RUTA `transferencias/cancelar`. La delegación sale de las
// rutas reales de autorizar y canjear. Lo escrito directo es SOLO lo que la
// aplicación no produce a pedido, y está marcado donde ocurre: el borrador del
// pedido con su línea, el pedido que pasa a Enviado, eventos en el mismo
// milisegundo y filas históricas sin fecha.
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

const NOMBRE = "erpazul_azul_chat_eventos_4a";
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
const SECRETO = "prueba-azul-chat-eventos-4a-0123456789abcdef";
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-erp-eventos-4a-0123456789abcdef";
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
  for (const l of [deposito, localA, localB]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  }

  const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
  const rolEncargado = await c.rol.create({ data: { nombre: "CI encargado", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolEncargadoB = await c.rol.create({ data: { nombre: "CI encargado B", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolSoloTransferencias = await c.rol.create({ data: { nombre: "CI solo transferencias", permisos: ["transferencias.ver"] } });
  const rolSoloPedidos = await c.rol.create({ data: { nombre: "CI solo pedidos", permisos: ["pedidos.ver"] } });
  const rolDeposito = await c.rol.create({ data: { nombre: "CI depósito", permisos: ["transferencias.cancelar", "transferencias.ver", "pos_transferencias.enviar"] } });
  const usuario = (nombre, rolId, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId, activo: true } });
  const U = {
    encA: await usuario("encargado-a", rolEncargado.id, localA.id),
    encB: await usuario("encargado-b", rolEncargadoB.id, localB.id),
    soloTransfA: await usuario("solo-transferencias-a", rolSoloTransferencias.id, localA.id),
    soloPedidosA: await usuario("solo-pedidos-a", rolSoloPedidos.id, localA.id),
    dep: await usuario("deposito", rolDeposito.id, deposito.id),
  };

  const producto = await crearProductoVendible(c, { grupoId: grupo.id, localId: deposito.id, nombre: "Producto D", precioVenta: 10, precioCosto: 6, stock: 100000 });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const rutaSolicitar = await import("../../app/api/pos-transferencias/solicitar/route.js");
  const rutaCancelarPedido = await import("../../app/api/pos-transferencias/cancelar/route.js");
  const rutaCancelarTransferencia = await import("../../app/api/transferencias/cancelar/route.js");
  const rutaAutorizar = await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  const { crearTransferencia, DESCONTAR_Y_TRANSITO } = await import("../../lib/transferencias/crearTransferencia.js");
  const { atenderCanje } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const P = await import("../../lib/integraciones/azul-chat/pedidosEventos.js");
  const E = await import("../../lib/integraciones/azul-chat/enviosEventos.js");
  const X = await import("../../lib/integraciones/azul-chat/cancelacionesEventos.js");
  const MARGEN = P.MARGEN_DE_VISIBILIDAD_MS;

  const sesion = ({ id, localId, permisos }) =>
    jwt.sign(
      { id, nombre: `CI ${id}`, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cookieDe = async (u) => {
    const fila = await c.usuario.findUnique({ where: { id: u.id }, select: { localId: true, rol: { select: { permisos: true } } } });
    return `erpazul_sesion=${sesion({ id: u.id, localId: fila.localId, permisos: fila.rol.permisos })}`;
  };
  const pedir = (ruta, url, { metodo = "POST", cookie, cuerpo }) =>
    ruta[metodo](new Request(url, {
      method: metodo,
      headers: { cookie, "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : json(cuerpo),
    }));
  const leer = async (r) => {
    const res = await r;
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };

  // ── Los hechos, por el camino real ──────────────────────────────────────
  const ENCARGADO_DE = { [localA.id]: U.encA, [localB.id]: U.encB };

  /** Un pedido SOLICITADO del local `destino` al depósito, con `lineas` líneas. */
  const solicitarPedido = async (destino, lineas = 1) => {
    // ESCRITO DIRECTO: el borrador y sus líneas. Armar un pedido por las
    // pantallas es otro flujo (sugeridos, carrito); el HECHO que se publica es
    // la solicitud, y esa va por la ruta real.
    const pos = await c.posTransferencia.create({
      data: {
        origenId: deposito.id,
        destinoId: destino.id,
        usuarioId: ENCARGADO_DE[destino.id].id,
        estado: "Borrador",
        detalles: { create: Array.from({ length: lineas }, () => ({ productoId: producto.productoLocalId, sugerido: 1 })) },
      },
    });
    const cookie = `erpazul_sesion=${sesion({ id: ENCARGADO_DE[destino.id].id, localId: destino.id, permisos: ["pedidos.solicitar", "pedidos.ver"] })}`;
    const r = await leer(pedir(rutaSolicitar, "http://ci/api/pos-transferencias/solicitar", { cookie, cuerpo: { posId: pos.id } }));
    if (r.status !== 200) throw new Error(`solicitar #${pos.id}: ${r.status} ${json(r)}`);
    return c.posTransferencia.findUnique({ where: { id: pos.id }, select: { id: true, estado: true, solicitadoAt: true } });
  };

  /** Lo que haría `enviar` con el pedido: ESCRITO DIRECTO, para poder pedir otro al mismo depósito. */
  const despacharPedido = (pos) => c.posTransferencia.update({ where: { id: pos.id }, data: { estado: "Enviado" } });

  const productoLocalOrigen = await c.productoLocal.findUnique({ where: { id: producto.productoLocalId }, include: { base: true } });

  /** Un remito ENVIADO desde el depósito por `crearTransferencia`, opcionalmente de un pedido. */
  const enviar = async (destino, { lineas = 1, posTransferenciaId = null } = {}) =>
    c.$transaction(async (tx) => {
      const { transferencia } = await crearTransferencia({
        tx,
        origenId: deposito.id,
        destinoId: destino.id,
        creadoPorId: U.dep.id,
        posTransferenciaId,
        politicaStockOrigen: DESCONTAR_Y_TRANSITO,
        items: Array.from({ length: lineas }, () => ({
          baseId: producto.baseId,
          productoLocalOrigenId: producto.productoLocalId,
          cantidad: 1,
          unidadEnviada: "UNIDAD",
          factorPack: 1,
          productoLocalOrigen,
        })),
      });
      return transferencia;
    });

  /** Cancelar un remito por la ruta real, desde el depósito que lo envió. */
  const cancelarRemito = async (t) => {
    const cookie = `erpazul_sesion=${sesion({ id: U.dep.id, localId: deposito.id, permisos: ["transferencias.cancelar", "transferencias.ver"] })}`;
    const r = await leer(pedir(rutaCancelarTransferencia, "http://ci/api/transferencias/cancelar", { cookie, cuerpo: { transferenciaId: t.id, motivo: "Prueba de CI: el remito salió por error" } }));
    if (r.status !== 200) throw new Error(`cancelar #${t.id}: ${r.status} ${json(r)}`);
    return c.transferencia.findUnique({ where: { id: t.id }, select: { id: true, estado: true, canceladaEn: true, fechaEnvio: true } });
  };

  // ── La delegación por las rutas reales ──────────────────────────────────
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
  for (const u of [U.encA, U.encB, U.soloTransfA, U.soloPedidosA]) TOKEN[u.id] = await vincular(u);

  /** Una consulta por la puerta real (servidor.js), sin cupo. Devuelve también el pedido, para el fixture. */
  const consultar = async ({ capacidad, usuario: u = U.encA, local = localA, grupoId = grupo.id, parametros = {}, ahora = Date.now() + 2 * MARGEN }) => {
    const pedido = { capacidad, delegacion: { token: TOKEN[u.id] }, alcance: { grupoId, localId: local.id }, parametros };
    const cuerpo = json(pedido);
    const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo, { marca: String(Math.floor(ahora / 1000)) }), cuerpo }, { entorno: ENTORNO, ahora, limitador: null }));
    return { ...r, pedido: { ...pedido, delegacion: { token: "<token>" } } };
  };

  const CAPS = [
    { capacidad: "pedidos_eventos", mod: P, campoFecha: "fechaSolicitud", campoId: "pedidoId", columna: "solicitadoAt", tabla: "posTransferencia" },
    { capacidad: "envios_eventos", mod: E, campoFecha: "fechaEnvio", campoId: "transferenciaId", columna: "fechaEnvio", tabla: "transferencia" },
    { capacidad: "cancelaciones_eventos", mod: X, campoFecha: "fechaCancelacion", campoId: "transferenciaId", columna: "canceladaEn", tabla: "transferencia" },
  ];
  const CAP = Object.fromEntries(CAPS.map((k) => [k.capacidad, k]));

  /** Todas las páginas desde `desde`, como haría Azul Chat. */
  const recorrer = async (capacidad, { usuario: u = U.encA, local = localA, desde, limite, ahora } = {}) => {
    const vistos = [];
    let cursor = desde;
    for (let vueltas = 0; vueltas < 200; vueltas++) {
      const parametros = { ...(cursor ? { desde: cursor } : {}), ...(limite ? { limite } : {}) };
      const r = await consultar({ capacidad, usuario: u, local, parametros, ...(ahora ? { ahora } : {}) });
      if (r.status !== 200) throw new Error(`${capacidad}: ${r.status} ${json(r.cuerpo)}`);
      vistos.push(...r.cuerpo.datos.eventos);
      cursor = r.cuerpo.datos.siguiente;
      if (!r.cuerpo.datos.hayMas) return { vistos, cursor };
    }
    throw new Error("la paginación no termina");
  };
  const ids = (capacidad, vistos) => vistos.map((e) => e[CAP[capacidad].campoId]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("PEDIDO_SOLICITADO: lo que publica la capacidad");
  // ═════════════════════════════════════════════════════════════════════════

  const p1 = await solicitarPedido(localA, 3);
  igual("la ruta real lo deja Solicitado con su fecha", [p1.estado, p1.solicitadoAt != null], ["Solicitado", true]);
  const t1 = await enviar(localA, { lineas: 2, posTransferenciaId: p1.id });
  await despacharPedido(p1);
  const p2 = await solicitarPedido(localA, 1);
  const pB = await solicitarPedido(localB, 2);
  // ESCRITO DIRECTO: un Borrador nunca solicitado. No tiene solicitadoAt y no es un hecho.
  const borrador = await c.posTransferencia.create({ data: { origenId: deposito.id, destinoId: localA.id, usuarioId: U.encA.id, estado: "Borrador" } });

  const ped = await recorrer("pedidos_eventos");
  igual("A ve SUS dos pedidos solicitados, en orden de fecha; ni el Borrador ni el de B", ids("pedidos_eventos", ped.vistos), [p1.id, p2.id]);
  const ep1 = ped.vistos[0];
  igual("la forma del evento", Object.keys(ep1), ["tipo", "eventoId", "pedidoId", "fechaSolicitud", "origen", "lineas"]);
  igual("tipo, clave y fecha de la base", [ep1.tipo, ep1.eventoId, ep1.fechaSolicitud], ["PEDIDO_SOLICITADO", `PEDIDO_SOLICITADO:${p1.id}:${p1.solicitadoAt.toISOString()}`, p1.solicitadoAt.toISOString()]);
  igual("el origen es el depósito y las líneas son las del pedido", [ep1.origen, ep1.lineas], [{ id: deposito.id, nombre: "Depósito" }, 3]);
  igual("B ve solo el suyo", ids("pedidos_eventos", (await recorrer("pedidos_eventos", { usuario: U.encB, local: localB })).vistos), [pB.id]);
  ok("el Borrador no tiene solicitadoAt", (await c.posTransferencia.findUnique({ where: { id: borrador.id } })).solicitadoAt === null);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("TRANSFERENCIA_ENVIADA: lo que publica la capacidad");
  // ═════════════════════════════════════════════════════════════════════════

  const t2 = await enviar(localA, { lineas: 1 });
  const tB = await enviar(localB, { lineas: 1 });
  const env = await recorrer("envios_eventos");
  igual("A ve SUS dos remitos, en orden de fecha", ids("envios_eventos", env.vistos), [t1.id, t2.id]);
  const et1 = env.vistos[0];
  igual("la forma del evento", Object.keys(et1), ["tipo", "eventoId", "transferenciaId", "fechaEnvio", "origen", "lineas", "pedidoId"]);
  const fe1 = (await c.transferencia.findUnique({ where: { id: t1.id }, select: { fechaEnvio: true } })).fechaEnvio;
  igual("tipo, clave y fecha de la base", [et1.tipo, et1.eventoId, et1.fechaEnvio], ["TRANSFERENCIA_ENVIADA", `TRANSFERENCIA_ENVIADA:${t1.id}:${fe1.toISOString()}`, fe1.toISOString()]);
  igual("origen, líneas y el pedido del que viene", [et1.origen, et1.lineas, et1.pedidoId], [{ id: deposito.id, nombre: "Depósito" }, 2, p1.id]);
  igual("sin pedido: pedidoId null", env.vistos[1].pedidoId, null);
  igual("B ve solo el suyo", ids("envios_eventos", (await recorrer("envios_eventos", { usuario: U.encB, local: localB })).vistos), [tB.id]);
  igual("el ORIGEN no recibe el envío como evento", ids("envios_eventos", (await recorrer("envios_eventos", { usuario: U.encB, local: localB })).vistos).includes(t1.id), false);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("TRANSFERENCIA_CANCELADA: lo que publica la capacidad");
  // ═════════════════════════════════════════════════════════════════════════

  igual("antes de cancelar no hay cancelaciones", ids("cancelaciones_eventos", (await recorrer("cancelaciones_eventos")).vistos), []);
  const c2 = await cancelarRemito(t2);
  igual("la ruta real la deja Cancelada con su fecha", [c2.estado, c2.canceladaEn != null], ["Cancelada", true]);
  const can = await recorrer("cancelaciones_eventos");
  igual("A ve la cancelación de su remito", ids("cancelaciones_eventos", can.vistos), [t2.id]);
  const ec2 = can.vistos[0];
  igual("la forma del evento", Object.keys(ec2), ["tipo", "eventoId", "transferenciaId", "fechaCancelacion", "origen", "pedidoId"]);
  igual("tipo, clave y fecha de la base", [ec2.tipo, ec2.eventoId, ec2.fechaCancelacion], ["TRANSFERENCIA_CANCELADA", `TRANSFERENCIA_CANCELADA:${t2.id}:${c2.canceladaEn.toISOString()}`, c2.canceladaEn.toISOString()]);
  ok("ni el motivo ni quién canceló salen", !("motivo" in ec2) && !("canceladaPorId" in ec2) && !json(ec2).includes("Prueba de CI"));
  igual("un remito cancelado SIGUE siendo un envío", ids("envios_eventos", (await recorrer("envios_eventos")).vistos), [t1.id, t2.id]);
  igual("B no ve la cancelación de A", ids("cancelaciones_eventos", (await recorrer("cancelaciones_eventos", { usuario: U.encB, local: localB })).vistos), []);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Un pedido cancelado se MARCA (Tanda 9A): su solicitud sigue saliendo");
  // ═════════════════════════════════════════════════════════════════════════
  {
    // Hasta la 9A cancelar BORRABA el pedido y su PEDIDO_SOLICITADO dejaba de
    // salir. Desde la 9A lo marca: el pedido se solicitó igual, así que el
    // evento sigue. Es el cambio esperado (DEC-0013).
    const lineasAntes = await c.posTransferenciaDetalle.count({ where: { posTransferenciaId: p2.id } });
    // El permiso que pide la ruta para cancelar un pedido es `pedidos.editar`.
    const cookie = `erpazul_sesion=${sesion({ id: U.encA.id, localId: localA.id, permisos: ["pedidos.editar", "pedidos.ver"] })}`;
    const r = await leer(pedir(rutaCancelarPedido, "http://ci/api/pos-transferencias/cancelar", { cookie, cuerpo: { posId: p2.id } }));
    igual("la ruta real cancela el pedido", r.status, 200);
    const marcado = await c.posTransferencia.findUnique({ where: { id: p2.id }, select: { estado: true, canceladoAt: true, canceladoPorUserId: true, solicitadoAt: true } });
    igual("y lo MARCA, no lo borra", [marcado?.estado, marcado?.canceladoAt != null, marcado?.canceladoPorUserId], ["Cancelado", true, U.encA.id]);
    igual("con sus líneas intactas", await c.posTransferenciaDetalle.count({ where: { posTransferenciaId: p2.id } }), lineasAntes);
    igual("cancelado, su solicitud SIGUE saliendo", ids("pedidos_eventos", (await recorrer("pedidos_eventos")).vistos), [p1.id, p2.id]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C/D. El margen de 60 s, con hechos de verdad");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const base = {};
    for (const { capacidad } of CAPS) base[capacidad] = (await recorrer(capacidad)).cursor;
    const pn = await solicitarPedido(localA, 1);
    const tn = await enviar(localA);
    const cn = await cancelarRemito(tn);
    const fechas = {
      pedidos_eventos: [pn.id, pn.solicitadoAt.getTime()],
      envios_eventos: [tn.id, cn.fechaEnvio.getTime()],
      cancelaciones_eventos: [tn.id, cn.canceladaEn.getTime()],
    };
    for (const { capacidad } of CAPS) {
      const [id, fecha] = fechas[capacidad];
      const dentro = await recorrer(capacidad, { desde: base[capacidad], ahora: fecha + 30_000 });
      igual(`C. ${capacidad}: a los 30 s todavía no sale`, ids(capacidad, dentro.vistos), []);
      const borde = await recorrer(capacidad, { desde: base[capacidad], ahora: fecha + MARGEN });
      igual(`D. ${capacidad}: justo a los 60 s sale`, ids(capacidad, borde.vistos), [id]);
      const despues = await recorrer(capacidad, { desde: borde.cursor, ahora: fecha + 10 * MARGEN });
      igual(`D. ${capacidad}: y no vuelve a salir`, ids(capacidad, despues.vistos), []);
    }
    await despacharPedido(pn);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A/B. El cursor contra PostgreSQL, en las tres");
  // ═════════════════════════════════════════════════════════════════════════
  {
    // ESCRITO DIRECTO, y es lo único de esta sección: tres hechos reales no caen
    // en el mismo milisegundo a pedido. Se producen de verdad y después se
    // llevan al MISMO instante; y uno de id más alto, a una fecha más vieja.
    const misma = new Date(Date.now() - 3600_000);
    const tardia = new Date(misma.getTime() - 60_000);
    const producidos = { pedidos_eventos: [], envios_eventos: [], cancelaciones_eventos: [] };
    for (let i = 0; i < 4; i++) {
      const pn = await solicitarPedido(localA, 1);
      await despacharPedido(pn);
      producidos.pedidos_eventos.push(pn.id);
      const tn = await enviar(localA);
      producidos.envios_eventos.push(tn.id);
      await cancelarRemito(await enviar(localA)).then((x) => producidos.cancelaciones_eventos.push(x.id));
    }
    for (const { capacidad, columna, tabla, campoFecha, campoId } of CAPS) {
      const [g1, g2, g3, ultima] = producidos[capacidad];
      await c[tabla].updateMany({ where: { id: { in: [g1, g2, g3] } }, data: { [columna]: misma } });
      await c[tabla].update({ where: { id: ultima }, data: { [columna]: tardia } });
      const desde = { [campoFecha]: new Date(tardia.getTime() - 60_000).toISOString(), [campoId]: 1 };
      for (const limite of [1, 2, 3, 50]) {
        const { vistos } = await recorrer(capacidad, { desde, limite });
        igual(`A/B ${capacidad} (página de ${limite}): la tardía primero, después las tres del mismo instante por id`, ids(capacidad, vistos).slice(0, 4), [ultima, g1, g2, g3]);
        ok(`${capacidad} (página de ${limite}): ninguna clave repetida`, new Set(vistos.map((e) => e.eventoId)).size === vistos.length);
      }
      // CONTRAPRUEBA: la misma consulta SIN el desempate por id, parada en la
      // primera del instante, pierde las otras dos.
      const hasta = new Date(Date.now() + MARGEN);
      const desdeG1 = { fecha: misma, id: g1 };
      const correcta = (await c[tabla].findMany({ where: CAP[capacidad].mod.whereEventos({ localId: localA.id, desde: desdeG1, hasta }), orderBy: CAP[capacidad].mod.ORDEN_EVENTOS, select: { id: true } })).map((x) => x.id);
      const sinDesempate = (await c[tabla].findMany({ where: { destinoId: localA.id, [columna]: { not: null, lte: hasta, gt: misma } }, orderBy: CAP[capacidad].mod.ORDEN_EVENTOS, select: { id: true } })).map((x) => x.id);
      ok(`A ${capacidad}: con el desempate vienen las otras dos`, correcta.includes(g2) && correcta.includes(g3), json(correcta));
      ok(`A ${capacidad}: CONTRAPRUEBA, sin el desempate se pierden`, !sinDesempate.includes(g2) && !sinDesempate.includes(g3), json(sinDesempate));
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Sin la columna del hecho, no hay evento");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const antes = {};
    for (const { capacidad } of CAPS) antes[capacidad] = ids(capacidad, (await recorrer(capacidad)).vistos);
    // ESCRITO DIRECTO: filas históricas que la aplicación de hoy no produce —un
    // remito sin fechaEnvio y una Cancelada de antes de que existiera
    // canceladaEn—. Se producen de verdad y después se les borra la fecha.
    const sinEnvio = await enviar(localA);
    await c.transferencia.update({ where: { id: sinEnvio.id }, data: { fechaEnvio: null } });
    const sinCancelacion = await cancelarRemito(await enviar(localA));
    await c.transferencia.update({ where: { id: sinCancelacion.id }, data: { canceladaEn: null } });
    const despues = {};
    for (const { capacidad } of CAPS) despues[capacidad] = ids(capacidad, (await recorrer(capacidad)).vistos);
    igual("un remito sin fechaEnvio no es un envío publicado", despues.envios_eventos.includes(sinEnvio.id), false);
    igual("una Cancelada sin canceladaEn no es una cancelación publicada", despues.cancelaciones_eventos.includes(sinCancelacion.id), false);
    igual("los pedidos no cambiaron", despues.pedidos_eventos, antes.pedidos_eventos);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Paginación completa = exactamente las filas con la columna del hecho");
  // ═════════════════════════════════════════════════════════════════════════
  for (const { capacidad, columna, tabla } of CAPS) {
    const referencia = ids(capacidad, (await recorrer(capacidad, { limite: 100 })).vistos);
    for (const limite of [1, 3, 7]) igual(`${capacidad}, página de ${limite}: el mismo recorrido`, ids(capacidad, (await recorrer(capacidad, { limite })).vistos), referencia);
    const esperado = (await c[tabla].findMany({ where: { destinoId: localA.id, [columna]: { not: null } }, orderBy: [{ [columna]: "asc" }, { id: "asc" }], select: { id: true } })).map((x) => x.id);
    igual(`${capacidad}: el recorrido es exactamente lo de la base`, referencia, esperado);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Parámetros validados en el servidor");
  // ═════════════════════════════════════════════════════════════════════════
  for (const { capacidad } of CAPS) {
    for (const [titulo, parametros] of [["limite 101", { limite: 101 }], ["usuarioId", { usuarioId: U.encB.id }], ["localId", { localId: localB.id }], ["desde sin id", { desde: { fechaEnvio: new Date().toISOString() } }]]) {
      const r = await consultar({ capacidad, parametros });
      igual(`${capacidad} · ${titulo}: SOLICITUD_INVALIDA`, [r.status, r.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"]);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Permisos y alcance, en vivo, con la misma delegación");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const anuncio = async (u) => {
      const cuerpo = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[u.id] }, parametros: {} });
      const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo), cuerpo }, { entorno: ENTORNO, limitador: null }));
      if (r.status !== 200) throw new Error(`mi_alcance: ${r.status} ${json(r.cuerpo)}`);
      return Object.fromEntries(r.cuerpo.datos.locales.map((l) => [l.id, l.capacidades]));
    };
    // Tanda 8A: el ENCARGADO trae stock.ver, así que también stock_consulta.
    const TODAS = ["ventas_resumen", "transferencias_eventos", "pedidos_eventos", "envios_eventos", "cancelaciones_eventos", "stock_consulta"];
    igual("el ENCARGADO las ve anunciadas todas", await anuncio(U.encA), { [localA.id]: TODAS });
    igual("con solo transferencias.ver: recibidas, envíos y cancelaciones", await anuncio(U.soloTransfA), { [localA.id]: ["transferencias_eventos", "envios_eventos", "cancelaciones_eventos"] });
    igual("con solo pedidos.ver: pedidos", await anuncio(U.soloPedidosA), { [localA.id]: ["pedidos_eventos"] });
    // La puerta dice lo mismo que el anuncio.
    for (const [u, capacidad, status] of [
      [U.soloTransfA, "pedidos_eventos", 403],
      [U.soloTransfA, "envios_eventos", 200],
      [U.soloTransfA, "cancelaciones_eventos", 200],
      [U.soloPedidosA, "pedidos_eventos", 200],
      [U.soloPedidosA, "envios_eventos", 403],
      [U.soloPedidosA, "cancelaciones_eventos", 403],
    ]) {
      igual(`${u.nombre} → ${capacidad}`, (await consultar({ capacidad, usuario: u })).status, status);
    }
    // En vivo: quitar pedidos.ver al rol del encargado corta pedidos_eventos y su anuncio.
    await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO].filter((p) => p !== "pedidos.ver") } });
    igual("sin pedidos.ver, la misma delegación ya no ve pedidos", (await consultar({ capacidad: "pedidos_eventos" })).cuerpo.codigo, "NO_AUTORIZADO");
    igual("y mi_alcance deja de anunciarla", (await anuncio(U.encA))[localA.id].includes("pedidos_eventos"), false);
    igual("envíos sigue", (await consultar({ capacidad: "envios_eventos" })).status, 200);
    await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
    igual("devolverlo la reabre sin revincular", (await consultar({ capacidad: "pedidos_eventos" })).status, 200);
    for (const { capacidad } of CAPS) {
      for (const [titulo, local, grupoId] of [["otro local del grupo", localB, grupo.id], ["otro grupo", localX, grupo2.id]]) {
        const r = await consultar({ capacidad, local, grupoId });
        igual(`${capacidad} · ${titulo}: rechazo, no lista vacía`, [r.status, r.cuerpo.codigo, r.cuerpo.datos], [403, "NO_AUTORIZADO", undefined]);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Solo lectura: la base queda idéntica");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const huella = async () =>
      (await c.$queryRawUnsafe(`
        SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
          SELECT 'T' || row_to_json(t)::text AS x FROM "Transferencia" t
          UNION ALL SELECT 'D' || row_to_json(d)::text FROM "TransferenciaDetalle" d
          UNION ALL SELECT 'P' || row_to_json(p)::text FROM "PosTransferencia" p
          UNION ALL SELECT 'L' || row_to_json(l)::text FROM "PosTransferenciaDetalle" l
          UNION ALL SELECT 'S' || row_to_json(s)::text FROM "StockLocal" s
          UNION ALL SELECT 'U' || row_to_json(u)::text FROM "Usuario" u
          UNION ALL SELECT 'G' || row_to_json(g)::text FROM "DelegacionIntegracion" g
        ) q`))[0].h;
    const antes = await huella();
    for (const { capacidad } of CAPS) {
      await recorrer(capacidad, { limite: 2 });
      await consultar({ capacidad, local: localB });
      await consultar({ capacidad, parametros: { limite: 101 } });
    }
    igual("ninguna consulta escribió nada", await huella(), antes);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("transferencias_eventos sigue contestando");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const r = await consultar({ capacidad: "transferencias_eventos" });
    igual("200, con su forma de siempre", [r.status, Object.keys(r.cuerpo.datos ?? {})], [200, ["capacidad", "version", "local", "grupoId", "hasta", "eventos", "siguiente", "hayMas"]]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  if (SALIDA_FIXTURE) {
    seccion("Fixture para Azul Chat");
    // Lo que contesta la puerta real, para que Azul Chat copie el contrato de
    // acá y no lo escriba de memoria. Cada página es un pedido real con su
    // respuesta real; el token va enmascarado.
    const ahora = Date.now() + 2 * MARGEN;
    const intercambio = async (args) => {
      const r = await consultar({ ...args, ahora });
      return { pedido: r.pedido, respuesta: { status: r.status, cuerpo: r.cuerpo } };
    };
    const fixture = { _origen: null, ahora: new Date(ahora).toISOString() };
    for (const { capacidad } of CAPS) {
      const pagina1 = await intercambio({ capacidad, parametros: { limite: 2 } });
      const siguiente = pagina1.respuesta.cuerpo.datos.siguiente;
      fixture[capacidad] = {
        pagina1,
        pagina2: await intercambio({ capacidad, parametros: { limite: 2, desde: siguiente } }),
        vacia: await intercambio({ capacidad, local: localB, usuario: U.encB, parametros: { desde: (await recorrer(capacidad, { usuario: U.encB, local: localB })).cursor ?? siguiente } }),
        sinPermiso: await intercambio({ capacidad, usuario: capacidad === "pedidos_eventos" ? U.soloTransfA : U.soloPedidosA }),
        limiteFueraDeRango: await intercambio({ capacidad, parametros: { limite: 101 } }),
        // Todo el recorrido de A en una página: trae también los eventos con pedidoId.
        completa: await intercambio({ capacidad, parametros: { limite: 100 } }),
      };
    }
    const cuerpoMa = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.encA.id] }, parametros: {} });
    const ma = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpoMa), cuerpo: cuerpoMa }, { entorno: ENTORNO, limitador: null }));
    fixture.miAlcance = { encargado: { pedido: { capacidad: "mi_alcance", delegacion: { token: "<token>" }, parametros: {} }, respuesta: { status: ma.status, cuerpo: ma.cuerpo } } };
    const texto = json(fixture);
    ok("el fixture no lleva ningún token real", !Object.values(TOKEN).some((t) => texto.includes(t)));
    fixture._origen = {
      generadoPor: "scripts/pruebas-db/azulChatEventosTanda4a.mjs",
      commit: process.env.FIXTURE_COMMIT || null,
      nota: "Pedidos y respuestas reales de la puerta del ERP (atenderSolicitudAzulChat) contra una base descartable. No se edita a mano: se regenera.",
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
