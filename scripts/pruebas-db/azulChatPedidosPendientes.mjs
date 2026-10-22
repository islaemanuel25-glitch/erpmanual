// PEDIDOS: CANCELAR MARCA EN VEZ DE BORRAR, Y `pedidos_pendientes` CONTRA
// POSTGRESQL (Tanda 9A).
//
//   DATABASE_URL=postgresql://…@localhost:5432/postgres AUTH_SECRET=… \
//     node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatPedidosPendientes.mjs
//
// Con `AZUL_CHAT_FIXTURE_SALIDA=<ruta>` además escribe ahí el fixture para Azul
// Chat: pedidos y respuestas REALES de la puerta, con el token enmascarado.
//
// Lo que los candados de `lib/pedidos/sinCancelados.test.mjs` y
// `lib/integraciones/azul-chat/pedidosPendientes.test.mjs` no pueden probar,
// porque vive en la base (regla 2 de CLAUDE.md):
//
//   A. cancelar por la ruta real MARCA el pedido (estado, fecha, quién) y deja
//      sus líneas; las validaciones de siempre (solo Solicitado, permiso, local
//      propio, posId) siguen; uno ya cancelado da 404, como cuando se borraba;
//   B. cada lectura de pedidos, por su ruta, ve lo mismo que antes: el
//      cancelado no aparece donde antes no aparecía — carrito, historial,
//      solicitados (local y depósito), detalle, nueva, y las rutas que leen
//      sus líneas para escribir (editar, quitar, enviar, solicitar) dan 404;
//   C. rehacer: después de cancelar, el local arma y pide uno nuevo por el
//      carrito, igual que hoy;
//   D. `pedidos_eventos` sigue publicando el PEDIDO_SOLICITADO del cancelado
//      (el cambio esperado);
//   E. `pedidos_pendientes`: varios pendientes del más viejo al más nuevo, sin
//      el enviado, el cancelado ni el borrador; el de otro local no; ninguno;
//      la puerta (permiso, parámetros, alcance) y el anuncio de `mi_alcance`;
//   F. ninguna consulta de la capacidad escribe (huella de las tablas).
//
// Los hechos van por el camino real: el carrito por `pedidos/set-cantidad`,
// la solicitud por `pos-transferencias/solicitar`, la cancelación por
// `pos-transferencias/cancelar`, el despacho por `pos-transferencias/enviar`, y
// la delegación por autorizar y canjear. Lo escrito directo es SOLO lo que el
// carrito no arma: un pedido a un origen que no es el depósito del grupo (un
// local pidiéndole a otro), con su borrador y sus líneas, como hace la prueba de
// la 4A; y la configuración (locales, grupos, roles, productos).
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

const NOMBRE = "erpazul_azul_chat_pedidos_pendientes";
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
const SECRETO = "prueba-azul-chat-pedidos-pendientes-0123456789abcdef";
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-erp-pedidos-pendientes-0123456789abcdef";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };
const SALIDA_FIXTURE = process.env.AZUL_CHAT_FIXTURE_SALIDA || null;

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(sinQuery(urlPrueba));
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: configuración ──────────────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const localA = await c.local.create({ data: { nombre: "Local A" } });
  const localB = await c.local.create({ data: { nombre: "Local B" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [localA, localB]) await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  for (const l of [deposito, localA, localB]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  }

  const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
  const rolEncargado = await c.rol.create({ data: { nombre: "CI encargado", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolEncargadoB = await c.rol.create({ data: { nombre: "CI encargado B", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolSinPedidos = await c.rol.create({ data: { nombre: "CI sin pedidos", permisos: ["transferencias.ver", "pedidos.solicitar"] } });
  const rolDeposito = await c.rol.create({ data: { nombre: "CI depósito", permisos: ["pos_transferencias.ver", "pos_transferencias.enviar", "transferencias.ver"] } });
  const usuario = (nombre, rolId, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId, activo: true } });
  const U = {
    encA: await usuario("encargado-a", rolEncargado.id, localA.id),
    encB: await usuario("encargado-b", rolEncargadoB.id, localB.id),
    sinPedidosA: await usuario("sin-pedidos-a", rolSinPedidos.id, localA.id),
    dep: await usuario("deposito", rolDeposito.id, deposito.id),
  };

  const prodDep = await crearProductoVendible(c, { grupoId: grupo.id, localId: deposito.id, nombre: "Producto D", precioVenta: 10, precioCosto: 6, stock: 100000 });
  const prodDep2 = await crearProductoVendible(c, { grupoId: grupo.id, localId: deposito.id, nombre: "Producto E", precioVenta: 10, precioCosto: 6, stock: 100000 });
  // Lo que Local B tiene para que Local A le pida (un pedido entre locales).
  const prodB = await crearProductoVendible(c, { grupoId: grupo.id, localId: localB.id, nombre: "Producto B", precioVenta: 10, precioCosto: 6, stock: 1000 });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const R = {
    setCantidad: await import("../../app/api/pedidos/set-cantidad/route.js"),
    carrito: await import("../../app/api/pedidos/carrito/route.js"),
    historial: await import("../../app/api/pedidos/historial/route.js"),
    solicitar: await import("../../app/api/pos-transferencias/solicitar/route.js"),
    cancelar: await import("../../app/api/pos-transferencias/cancelar/route.js"),
    solicitados: await import("../../app/api/pos-transferencias/solicitados/route.js"),
    detalle: await import("../../app/api/pos-transferencias/detalle/route.js"),
    nueva: await import("../../app/api/pos-transferencias/nueva/route.js"),
    enviar: await import("../../app/api/pos-transferencias/enviar/route.js"),
    editar: await import("../../app/api/pos-transferencias/detalle/editar/route.js"),
    quitar: await import("../../app/api/pos-transferencias/detalle/quitar/route.js"),
    autorizar: await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js"),
  };
  const { atenderCanje } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const { MARGEN_DE_VISIBILIDAD_MS } = await import("../../lib/integraciones/azul-chat/pedidosEventos.js");

  const sesion = ({ id, localId, permisos }) =>
    jwt.sign(
      { id, nombre: `CI ${id}`, email: `ci-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cookieDe = async (u, permisos) => {
    const fila = await c.usuario.findUnique({ where: { id: u.id }, select: { localId: true, rol: { select: { permisos: true } } } });
    return `erpazul_sesion=${sesion({ id: u.id, localId: fila.localId, permisos: permisos ?? fila.rol.permisos })}`;
  };
  const llamar = async (ruta, { metodo = "POST", url = "http://ci/api", cookie, cuerpo }) => {
    const res = await ruta[metodo](new Request(url, {
      method: metodo,
      headers: { cookie, "content-type": "application/json" },
      body: cuerpo === undefined ? undefined : json(cuerpo),
    }));
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const get = (ruta, url, cookie) => llamar(ruta, { metodo: "GET", url, cookie });

  // ── Los hechos, por el camino real ──────────────────────────────────────
  /** El carrito del local: `set-cantidad` crea el borrador si no hay. */
  const alCarrito = async (u, productoLocalId, cantidad = 2) => {
    const r = await llamar(R.setCantidad, { cookie: await cookieDe(u), cuerpo: { productoLocalId, cantidad, unidad: "UNIDAD" } });
    if (r.status !== 200) throw new Error(`set-cantidad: ${r.status} ${json(r)}`);
    return r.posId;
  };
  const solicitar = async (u, posId) => llamar(R.solicitar, { cookie: await cookieDe(u), cuerpo: { posId } });
  const cancelar = async (u, posId, permisos) => llamar(R.cancelar, { cookie: await cookieDe(u, permisos), cuerpo: { posId } });
  const leerPedido = (id) =>
    c.posTransferencia.findUnique({ where: { id }, select: { id: true, estado: true, solicitadoAt: true, canceladoAt: true, canceladoPorUserId: true } });
  const lineasDe = (id) => c.posTransferenciaDetalle.count({ where: { posTransferenciaId: id } });

  /** Un pedido de Local A a Local B: ESCRITO DIRECTO el borrador (el carrito solo pide al depósito); la solicitud, por la ruta. */
  const pedidoEntreLocales = async (lineas = 1) => {
    const pos = await c.posTransferencia.create({
      data: {
        origenId: localB.id,
        destinoId: localA.id,
        usuarioId: U.encA.id,
        estado: "Borrador",
        detalles: { create: Array.from({ length: lineas }, () => ({ productoId: prodB.productoLocalId, sugerido: 1 })) },
      },
    });
    const r = await solicitar(U.encA, pos.id);
    if (r.status !== 200) throw new Error(`solicitar entre locales: ${r.status} ${json(r)}`);
    return pos.id;
  };

  // ── La delegación por las rutas reales ──────────────────────────────────
  const firmadas = (cuerpo, { marca = String(Math.floor(Date.now() / 1000)) } = {}) => {
    const headers = new Headers({ "content-type": "application/json", [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca });
    headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca, cuerpo }));
    return headers;
  };
  const vincular = async (u) => {
    const a = await llamar(R.autorizar, { cookie: await cookieDe(u) });
    if (a.status !== 200 || !a.codigoCanje) throw new Error(`autorizar ${u.nombre}: ${a.status} ${json(a)}`);
    const cuerpo = json({ codigo: a.codigoCanje });
    const k = aRespuestaPublica(await atenderCanje({ headers: firmadas(cuerpo), cuerpo }, { db: c, limitador: null, entorno: ENTORNO }));
    if (k.status !== 200) throw new Error(`canjear ${u.nombre}: ${k.status} ${json(k.cuerpo)}`);
    return k.cuerpo.datos.tokenDelegacion;
  };
  const TOKEN = {};
  for (const u of [U.encA, U.encB, U.sinPedidosA]) TOKEN[u.id] = await vincular(u);

  /** Una consulta por la puerta real (servidor.js), sin cupo. Devuelve también el pedido, para el fixture. */
  const consultar = async ({ capacidad = "pedidos_pendientes", usuario: u = U.encA, local = localA, parametros = {}, ahora = Date.now() + 2 * MARGEN_DE_VISIBILIDAD_MS } = {}) => {
    const pedido = { capacidad, delegacion: { token: TOKEN[u.id] }, alcance: { grupoId: grupo.id, localId: local.id }, parametros };
    const cuerpo = json(pedido);
    const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo, { marca: String(Math.floor(ahora / 1000)) }), cuerpo }, { entorno: ENTORNO, ahora, limitador: null }));
    return { ...r, pedido: { ...pedido, delegacion: { token: "<token>" } } };
  };
  const pendientes = async (args) => {
    const r = await consultar(args);
    if (r.status !== 200) throw new Error(`pedidos_pendientes: ${r.status} ${json(r.cuerpo)}`);
    return r.cuerpo.datos.pedidos;
  };

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A. Cancelar MARCA el pedido y deja sus líneas");
  // ═════════════════════════════════════════════════════════════════════════

  const p1 = await alCarrito(U.encA, prodDep.productoLocalId, 2);
  await alCarrito(U.encA, prodDep2.productoLocalId, 3);
  requerir("el carrito armó un borrador con dos líneas", (await lineasDe(p1)) === 2);
  // Validación de siempre: un Borrador no se cancela.
  const rBorrador = await cancelar(U.encA, p1);
  igual("un Borrador no se cancela: 409, y sigue como estaba", [rBorrador.status, (await leerPedido(p1)).estado], [409, "Borrador"]);
  requerir("solicitar por la ruta real", (await solicitar(U.encA, p1)).status === 200);

  // Lo que se ve ANTES de cancelar, para comparar.
  const historialAntes = await get(R.historial, "http://ci/api/pedidos/historial", await cookieDe(U.encA));
  const carritoAntes = await get(R.carrito, "http://ci/api/pedidos/carrito", await cookieDe(U.encA));
  igual("antes: el historial lo lista", historialAntes.items?.map((i) => i.id ?? i.posId), [p1]);
  igual("antes: el carrito lo avisa como pendiente", carritoAntes.pendiente?.posId, p1);
  const detalleIds = (await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: p1 }, select: { id: true }, orderBy: { id: "asc" } })).map((d) => d.id);

  // Validaciones de siempre, antes de la buena.
  igual("sin pedidos.editar: 403", (await cancelar(U.encA, p1, ["pedidos.ver"])).status, 403);
  igual("el encargado de OTRO local: 403", (await cancelar(U.encB, p1)).status, 403);
  igual("sin posId: 400", (await llamar(R.cancelar, { cookie: await cookieDe(U.encA), cuerpo: {} })).status, 400);
  igual("un posId que no existe: 404", (await cancelar(U.encA, 999999)).status, 404);
  igual("nada de eso lo tocó", (await leerPedido(p1)).estado, "Solicitado");

  const antesDeCancelar = Date.now();
  const rc = await cancelar(U.encA, p1);
  igual("la ruta real lo cancela, con la respuesta de siempre", [rc.status, rc.ok, rc.item, rc.error], [200, true, null, null]);
  const marcado = await leerPedido(p1);
  igual("lo MARCA: estado Cancelado y quién", [marcado.estado, marcado.canceladoPorUserId], ["Cancelado", U.encA.id]);
  ok("con la fecha de ahora", marcado.canceladoAt && marcado.canceladoAt.getTime() >= antesDeCancelar - 1000 && marcado.canceladoAt.getTime() <= Date.now() + 1000);
  ok("y conserva la fecha en que se solicitó", marcado.solicitadoAt != null);
  igual("sus líneas, intactas", (await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: p1 }, select: { id: true }, orderBy: { id: "asc" } })).map((d) => d.id), detalleIds);
  igual("cancelarlo otra vez: 404, como cuando ya no existía", (await cancelar(U.encA, p1)).status, 404);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("B. Cada lectura ve lo mismo que cuando se borraba");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ck = await cookieDe(U.encA);
    // El historial es la EXCEPCIÓN desde el 2026-10-22 (cd22aa3): el del celular
    // tiene el filtro "Cancelados", así que lo lista, como Cancelado. Ver las
    // excepciones de `lib/pedidos/sinCancelados.test.mjs`.
    const hist = await get(R.historial, "http://ci/api/pedidos/historial", ck);
    igual("historial: lo lista, como Cancelado", [hist.items?.map((i) => [i.posId, i.estado]), hist.total], [[[p1, "Cancelado"]], 1]);
    for (const [estado, cuantos] of [["Solicitado", 0], ["Enviado", 0], ["Cancelado", 1]]) {
      const h = await get(R.historial, `http://ci/api/pedidos/historial?estado=${estado}`, ck);
      igual(`historial con estado=${estado}: ${cuantos}`, h.items?.length, cuantos);
    }
    const car = await get(R.carrito, "http://ci/api/pedidos/carrito", ck);
    igual("carrito: sin pedido pendiente y sin borrador revivido", [car.pendiente ?? null, car.posId ?? car.carrito?.posId ?? null], [null, null]);
    igual("solicitados, desde el local: nada", (await get(R.solicitados, "http://ci/api/pos-transferencias/solicitados", ck)).items, []);
    igual("solicitados, desde el depósito: nada", (await get(R.solicitados, "http://ci/api/pos-transferencias/solicitados", await cookieDe(U.dep))).items, []);
    igual("detalle del pedido: 404", (await get(R.detalle, `http://ci/api/pos-transferencias/detalle?posId=${p1}`, ck)).status, 404);
    igual("nueva?posId del cancelado: 404", (await get(R.nueva, `http://ci/api/pos-transferencias/nueva?posId=${p1}`, ck)).status, 404);
    igual("solicitarlo de nuevo: 404", (await solicitar(U.encA, p1)).status, 404);
    igual("el depósito no lo puede enviar: 404", (await llamar(R.enviar, { cookie: await cookieDe(U.dep), cuerpo: { posId: p1 } })).status, 404);
    igual("editar una línea: 404", (await llamar(R.editar, { cookie: await cookieDe(U.dep), cuerpo: { detalleId: detalleIds[0], preparado: 1 } })).status, 404);
    igual("quitar una línea: 404", (await llamar(R.quitar, { cookie: await cookieDe(U.dep), cuerpo: { detalleId: detalleIds[0] } })).status, 404);
    igual("y nada de eso tocó las líneas", await lineasDe(p1), 2);
    ok("ni el pedido", (await leerPedido(p1)).estado === "Cancelado");
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C. Rehacer: el local vuelve a pedir igual que hoy");
  // ═════════════════════════════════════════════════════════════════════════
  const p2 = await alCarrito(U.encA, prodDep.productoLocalId, 4);
  ok("el carrito arma un borrador NUEVO, no revive el cancelado", p2 && p2 !== p1, `p1=${p1} p2=${p2}`);
  igual("el borrador nuevo tiene solo lo que se agregó ahora", await lineasDe(p2), 1);
  const rs2 = await solicitar(U.encA, p2);
  igual("y se solicita: el cancelado no bloquea al mismo depósito", rs2.status, 200);
  igual("el carrito avisa el pedido nuevo como pendiente", (await get(R.carrito, "http://ci/api/pedidos/carrito", await cookieDe(U.encA))).pendiente?.posId, p2);
  igual("el historial lista el nuevo arriba y el cancelado abajo", (await get(R.historial, "http://ci/api/pedidos/historial", await cookieDe(U.encA))).items?.map((i) => i.id ?? i.posId), [p2, p1]);
  igual("el depósito ve solo el nuevo en solicitados", (await get(R.solicitados, "http://ci/api/pos-transferencias/solicitados", await cookieDe(U.dep))).items?.map((i) => i.id), [p2]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("D. pedidos_eventos sigue publicando la solicitud del cancelado");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const r = await consultar({ capacidad: "pedidos_eventos", parametros: { limite: 100 } });
    igual("el cancelado y el nuevo, los dos se solicitaron", r.cuerpo.datos?.eventos?.map((e) => e.pedidoId), [p1, p2]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("E. pedidos_pendientes");
  // ═════════════════════════════════════════════════════════════════════════

  // El pedido a Local B, después del de depósito: es el más nuevo.
  const pB = await pedidoEntreLocales(2);
  // Un tercero que el depósito despacha por la ruta real: deja de estar pendiente.
  // Primero se despacha p2 (el carrito admite un Solicitado por depósito).
  const re = await llamar(R.enviar, { cookie: await cookieDe(U.dep), cuerpo: { posId: p2 } });
  igual("el depósito envía p2 por la ruta real", [re.status, (await leerPedido(p2)).estado], [200, "Enviado"]);
  const p3 = await alCarrito(U.encA, prodDep2.productoLocalId, 1);
  requerir("p3 solicitado", (await solicitar(U.encA, p3)).status === 200);
  // Un borrador abierto del local, que todavía no se pidió.
  const p4 = await alCarrito(U.encA, prodDep.productoLocalId, 1);
  requerir("p4 queda en borrador", (await leerPedido(p4)).estado === "Borrador");
  // Un pedido de Local B: no es de A.
  const pdeB = await alCarrito(U.encB, prodDep.productoLocalId, 1);
  requerir("el de B, solicitado", (await solicitar(U.encB, pdeB)).status === 200);

  const ahora = Date.now() + 2 * MARGEN_DE_VISIBILIDAD_MS;
  const rp = await consultar({ ahora });
  igual("200 con la forma del contrato", [rp.status, Object.keys(rp.cuerpo.datos ?? {})], [200, ["capacidad", "version", "local", "grupoId", "pedidos"]]);
  igual("capacidad, versión, local y grupo", [rp.cuerpo.datos.capacidad, rp.cuerpo.datos.version, rp.cuerpo.datos.local, rp.cuerpo.datos.grupoId], ["pedidos_pendientes", 1, { id: localA.id, nombre: "Local A" }, grupo.id]);
  const lista = rp.cuerpo.datos.pedidos;
  igual("solo los Solicitado de A, del más viejo al más nuevo: ni el cancelado, ni el enviado, ni el borrador, ni el de B", lista.map((p) => p.id), [pB, p3]);
  const filaB = await leerPedido(pB);
  igual("cada pedido: id, fecha, origen con nombre, líneas y antigüedad", lista[0], {
    id: pB,
    solicitadoAt: filaB.solicitadoAt.toISOString(),
    origen: { id: localB.id, nombre: "Local B" },
    lineas: 2,
    antiguedadHoras: Math.floor((ahora - filaB.solicitadoAt.getTime()) / 3600000),
  });
  igual("el del depósito, con su origen", [lista[1].origen, lista[1].lineas], [{ id: deposito.id, nombre: "Depósito" }, 1]);
  // La antigüedad, con un reloj de dos días y medio después.
  const tarde = await pendientes({ ahora: filaB.solicitadoAt.getTime() + 60.5 * 3600000 });
  igual("la antigüedad en horas completas", tarde[0].antiguedadHoras, 60);
  igual("B ve el suyo y no los de A", (await pendientes({ usuario: U.encB, local: localB })).map((p) => p.id), [pdeB]);

  // Cancelar el de B a A: deja de estar pendiente.
  igual("cancelar pB por la ruta real", (await cancelar(U.encA, pB)).status, 200);
  igual("cancelado, ya no está pendiente", (await pendientes()).map((p) => p.id), [p3]);

  // La puerta.
  igual("sin pedidos.ver: NO_AUTORIZADO", (await consultar({ usuario: U.sinPedidosA })).cuerpo.codigo, "NO_AUTORIZADO");
  igual("A pidiendo el local B: NO_AUTORIZADO", (await consultar({ local: localB })).cuerpo.codigo, "NO_AUTORIZADO");
  igual("un parámetro: SOLICITUD_INVALIDA", (await consultar({ parametros: { estado: "Cancelado" } })).cuerpo.codigo, "SOLICITUD_INVALIDA");
  {
    const cuerpoMa = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.encA.id] }, parametros: {} });
    const ma = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpoMa), cuerpo: cuerpoMa }, { entorno: ENTORNO, limitador: null }));
    igual("mi_alcance la anuncia al encargado", ma.cuerpo.datos?.locales?.find((l) => l.id === localA.id)?.capacidades?.includes("pedidos_pendientes"), true);
    const cuerpoSin = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.sinPedidosA.id] }, parametros: {} });
    const sin = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpoSin), cuerpo: cuerpoSin }, { entorno: ENTORNO, limitador: null }));
    igual("y no a quien no tiene pedidos.ver", sin.cuerpo.datos?.locales?.find((l) => l.id === localA.id)?.capacidades?.includes("pedidos_pendientes"), false);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("F. Solo lectura: la base queda idéntica");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const huella = async () =>
      (await c.$queryRawUnsafe(`
        SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
          SELECT 'P' || row_to_json(p)::text AS x FROM "PosTransferencia" p
          UNION ALL SELECT 'L' || row_to_json(l)::text FROM "PosTransferenciaDetalle" l
          UNION ALL SELECT 'T' || row_to_json(t)::text FROM "Transferencia" t
          UNION ALL SELECT 'S' || row_to_json(s)::text FROM "StockLocal" s
          UNION ALL SELECT 'U' || row_to_json(u)::text FROM "Usuario" u
          UNION ALL SELECT 'G' || row_to_json(g)::text FROM "DelegacionIntegracion" g
        ) q`))[0].h;
    const antes = await huella();
    await consultar();
    await consultar({ usuario: U.encB, local: localB });
    await consultar({ local: localB });
    await consultar({ parametros: { limite: 1 } });
    igual("ninguna consulta escribió nada", await huella(), antes);
  }

  // ═════════════════════════════════════════════════════════════════════════
  if (SALIDA_FIXTURE) {
    seccion("Fixture para Azul Chat");
    // Lo que contesta la puerta real, para que Azul Chat copie el contrato de
    // acá y no lo escriba de memoria. Cada caso es un pedido real con su
    // respuesta real; el token va enmascarado.
    //
    // Para "varios" se pide otra vez a Local B (el cancelado pB sigue sin
    // aparecer): A queda con dos pendientes y un cancelado afuera.
    const pB2 = await pedidoEntreLocales(3);
    // El reloj de la consulta, 26 h 30 min después: con el de ahora todas las
    // antigüedades saldrían en 0 y el fixture no mostraría el campo.
    const ahoraF = Date.now() + 26.5 * 3600000;
    const intercambio = async (args) => {
      const r = await consultar({ ...args, ahora: ahoraF });
      return { pedido: r.pedido, respuesta: { status: r.status, cuerpo: r.cuerpo } };
    };
    // Local B queda sin pendientes: se despacha el suyo.
    requerir("el depósito envía el de B", (await llamar(R.enviar, { cookie: await cookieDe(U.dep), cuerpo: { posId: pdeB } })).status === 200);
    const fixture = {
      _origen: null,
      ahora: new Date(ahoraF).toISOString(),
      // El cancelado que NO tiene que aparecer en `varios`.
      canceladoQueNoAparece: { id: pB, estado: (await leerPedido(pB)).estado },
      varios: await intercambio({}),
      ninguno: await intercambio({ usuario: U.encB, local: localB }),
      sinPermiso: await intercambio({ usuario: U.sinPedidosA }),
      conParametro: await intercambio({ parametros: { estado: "Cancelado" } }),
    };
    igual("fixture: varios, del más viejo al más nuevo, sin el cancelado", fixture.varios.respuesta.cuerpo.datos.pedidos.map((p) => p.id), [p3, pB2]);
    ok("fixture: el cancelado no aparece", !fixture.varios.respuesta.cuerpo.datos.pedidos.some((p) => p.id === pB));
    igual("fixture: ninguno", fixture.ninguno.respuesta.cuerpo.datos.pedidos, []);
    const texto = json(fixture);
    ok("el fixture no lleva ningún token real", !Object.values(TOKEN).some((t) => texto.includes(t)));
    fixture._origen = {
      generadoPor: "scripts/pruebas-db/azulChatPedidosPendientes.mjs",
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
