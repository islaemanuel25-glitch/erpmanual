// AZUL CHAT · `transferencias_eventos` CONTRA POSTGRESQL.
//
//   DATABASE_URL=postgresql://…@localhost:5432/postgres AUTH_SECRET=… \
//     node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatTransferenciasEventos.mjs
//
// Lo que los candados de `lib/integraciones/azul-chat/transferenciasEventos.test.mjs`
// no pueden probar, porque vive en la base: que la consulta de Prisma, tal como
// está escrita, hace lo que dice contra PostgreSQL (regla 2 de CLAUDE.md).
//
//   A. dos recepciones con el MISMO fechaRecepcion no se pierden, aun cortando
//      la página entre ellas — y la CONTRAPRUEBA: sin el desempate por id, la
//      misma consulta pierde una;
//   B. una transferencia posterior por id pero anterior por fecha sale en su
//      lugar por fecha;
//   C/D. una recepción recién confirmada no sale dentro de los 60 s; pasado el
//      margen sale una sola vez;
//   E. una Recibida histórica sin fechaRecepcion no se publica;
//   F. Enviada, Recibiendo y Cancelada no se publican, aunque tengan datos
//      parciales;
//   G. un id reutilizado (como después de reset-operativo) da otra eventoId;
//   H/I. quitar transferencias.ver o mover a la persona de local, EN VIVO, con
//      la misma delegación, corta la capacidad en la consulta siguiente;
//   J. un local fuera del alcance se rechaza, no devuelve una lista vacía;
//   1B. lo que `mi_alcance` anuncia en cada local (`capacidades`) sigue en vivo
//      al permiso y al local: se apaga y se prende con el rol, y el local sale y
//      vuelve con el alcance, con la misma delegación;
//   y además: paginación completa sin duplicados, lineasConDiferencia igual al
//   tablero, la capacidad no escribe nada (huella de las tablas), y mi_alcance,
//   ventas_resumen, la firma y el canje siguen andando.
//
// Las transferencias se crean con `crearTransferencia` —el servicio real del
// envío— y se reciben por las RUTAS reales `revisar-producto` y
// `confirmar-recepcion`. La delegación sale de las rutas reales de autorizar y
// canjear. Lo escrito directo es SOLO lo que la aplicación no produce a pedido,
// y está marcado donde ocurre: dos recepciones en el mismo milisegundo, una
// Recibida histórica sin fecha, datos parciales en estados no recibidos y el id
// reutilizado de un reset.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

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

const NOMBRE = "erpazul_azul_chat_transferencias";
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
const SECRETO = "prueba-azul-chat-transferencias-0123456789abcdef";
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-erp-transferencias-0123456789abcdef";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };

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
  const rolSinVer = await c.rol.create({ data: { nombre: "CI sin transferencias", permisos: ["pos.usar"] } });
  const usuario = (nombre, rolId, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId, activo: true } });
  const U = {
    encA: await usuario("encargado-a", rolEncargado.id, localA.id),
    encB: await usuario("encargado-b", rolEncargadoB.id, localB.id),
    sinVerA: await usuario("sin-ver-a", rolSinVer.id, localA.id),
    movil: await usuario("movil", rolEncargado.id, localA.id),
    inactivo: await usuario("inactivo", rolEncargado.id, localA.id),
  };

  const producto = await crearProductoVendible(c, { grupoId: grupo.id, localId: deposito.id, nombre: "Producto D", precioVenta: 10, precioCosto: 6, stock: 100000 });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const rutaRevisar = await import("../../app/api/transferencias/revisar-producto/route.js");
  const rutaConfirmar = await import("../../app/api/transferencias/confirmar-recepcion/route.js");
  const rutaGuardar = await import("../../app/api/transferencias/guardar-recepcion/route.js");
  const rutaTablero = await import("../../app/api/transferencias/tablero/route.js");
  const rutaAutorizar = await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  const rutaConsultar = await import("../../app/api/integraciones/azul-chat/consultar/route.js");
  const { crearTransferencia, DESCONTAR_Y_TRANSITO } = await import("../../lib/transferencias/crearTransferencia.js");
  const { atenderCanje } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const { whereEventos, ORDEN_EVENTOS, MARGEN_DE_VISIBILIDAD_MS } = await import("../../lib/integraciones/azul-chat/transferenciasEventos.js");

  // Las sesiones, con la forma del payload del login.
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

  // ── Transferencias por el camino real ───────────────────────────────────
  const productoLocalOrigen = await c.productoLocal.findUnique({ where: { id: producto.productoLocalId }, include: { base: true } });

  /** Una transferencia ENVIADA desde el depósito, por `crearTransferencia`. */
  const enviar = async (destino, cantidades = [10]) =>
    c.$transaction(async (tx) => {
      const { transferencia } = await crearTransferencia({
        tx,
        origenId: deposito.id,
        destinoId: destino.id,
        creadoPorId: U.encA.id,
        politicaStockOrigen: DESCONTAR_Y_TRANSITO,
        items: cantidades.map((cantidad) => ({
          baseId: producto.baseId,
          productoLocalOrigenId: producto.productoLocalId,
          cantidad,
          unidadEnviada: "UNIDAD",
          factorPack: 1,
          productoLocalOrigen,
        })),
      });
      return transferencia;
    });

  /** Recibir en el destino por las rutas reales: revisar cada línea y confirmar. */
  const RECEPTOR = { [localA.id]: U.encA, [localB.id]: U.encB };
  const recibir = async (t, recibidos = null) => {
    const receptor = RECEPTOR[t.destinoId];
    const cookie = `erpazul_sesion=${sesion({ id: receptor.id, localId: t.destinoId, permisos: ["transferencias.recibir", "transferencias.ver"] })}`;
    const dets = await c.transferenciaDetalle.findMany({ where: { transferenciaId: t.id }, orderBy: { id: "asc" } });
    for (const [i, d] of dets.entries()) {
      const recibido = recibidos ? recibidos[i] : Number(d.cantidad);
      const r = await leer(pedir(rutaRevisar, "http://ci/api/transferencias/revisar-producto", {
        cookie,
        cuerpo: { transferenciaId: t.id, detalleId: d.id, recibido, motivoPrincipal: recibido !== Number(d.cantidad) ? "Faltante" : null },
      }));
      if (r.status !== 200) throw new Error(`revisar #${t.id}: ${r.status} ${json(r)}`);
    }
    const r = await leer(pedir(rutaConfirmar, "http://ci/api/transferencias/confirmar-recepcion", { cookie, cuerpo: { transferenciaId: t.id } }));
    if (r.status !== 200) throw new Error(`confirmar #${t.id}: ${r.status} ${json(r)}`);
    return c.transferencia.findUnique({ where: { id: t.id }, select: { id: true, estado: true, fechaRecepcion: true, tieneDiferencias: true } });
  };

  // ── La delegación por las rutas reales ──────────────────────────────────
  const firmadas = (cuerpo, { marca = String(Math.floor(Date.now() / 1000)), sinFirma = false } = {}) => {
    const headers = new Headers({ "content-type": "application/json", [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: marca });
    if (!sinFirma) headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca, cuerpo }));
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
  for (const u of Object.values(U)) TOKEN[u.id] = await vincular(u);

  /** La integración por la puerta real (servidor.js: cargador y ejecutor de verdad), sin cupo. */
  const eventos = async ({ usuario: u, local = localA, grupoId = grupo.id, parametros = {}, ahora = Date.now() + 2 * MARGEN_DE_VISIBILIDAD_MS, capacidad = "transferencias_eventos", extra = {} }) => {
    const cuerpo = json({ capacidad, delegacion: { token: TOKEN[u.id] }, alcance: { grupoId, localId: local.id }, parametros, ...extra });
    const r = await atenderSolicitudAzulChat({ headers: firmadas(cuerpo, { marca: String(Math.floor(ahora / 1000)) }), cuerpo }, { entorno: ENTORNO, ahora, limitador: null });
    return aRespuestaPublica(r);
  };
  /** Todas las páginas desde `desde`, como haría Azul Chat. */
  const recorrer = async ({ usuario: u = U.encA, local = localA, desde, limite, ahora }) => {
    const vistos = [];
    let cursor = desde;
    for (let vueltas = 0; vueltas < 200; vueltas++) {
      const parametros = { ...(cursor ? { desde: cursor } : {}), ...(limite ? { limite } : {}) };
      const r = await eventos({ usuario: u, local, parametros, ...(ahora ? { ahora } : {}) });
      if (r.status !== 200) throw new Error(`eventos: ${r.status} ${json(r.cuerpo)}`);
      vistos.push(...r.cuerpo.datos.eventos);
      cursor = r.cuerpo.datos.siguiente;
      if (!r.cuerpo.datos.hayMas) return { vistos, cursor };
    }
    throw new Error("la paginación no termina");
  };
  const ids = (vistos) => vistos.map((e) => e.transferenciaId);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Recepciones reales: qué publica la capacidad");
  // ═════════════════════════════════════════════════════════════════════════

  const r1 = await recibir(await enviar(localA, [10, 10, 10]), [7, 12, 10]); // dos líneas con diferencia
  const r2 = await recibir(await enviar(localA, [5]));                      // sin diferencia
  const rB = await recibir(await enviar(localB, [4]));                      // en el local B
  igual("las confirmadas quedan Recibida con fecha", [r1.estado, r2.estado, r1.fechaRecepcion != null], ["Recibida", "Recibida", true]);

  const todo = await recorrer({});
  igual("7/9. local A ve SUS dos recepciones, en orden de fecha", ids(todo.vistos), [r1.id, r2.id]);
  const e1 = todo.vistos.find((e) => e.transferenciaId === r1.id);
  igual("la forma del evento", Object.keys(e1), ["tipo", "eventoId", "transferenciaId", "fechaRecepcion", "origen", "destino", "tieneDiferencias", "lineasConDiferencia"]);
  igual("el evento: tipo, clave y fecha de la base", [e1.tipo, e1.eventoId, e1.fechaRecepcion], ["TRANSFERENCIA_RECIBIDA", `TRANSFERENCIA_RECIBIDA:${r1.id}:${r1.fechaRecepcion.toISOString()}`, r1.fechaRecepcion.toISOString()]);
  igual("origen y destino reales", [e1.origen, e1.destino], [{ id: deposito.id, nombre: "Depósito", esDeposito: true }, { id: localA.id, nombre: "Local A" }]);
  igual("las diferencias: la columna de la confirmación y 2 líneas", [e1.tieneDiferencias, e1.lineasConDiferencia], [true, 2]);
  const e2 = todo.vistos.find((e) => e.transferenciaId === r2.id);
  igual("sin diferencias: false y 0", [e2.tieneDiferencias, e2.lineasConDiferencia], [false, 0]);

  // lineasConDiferencia es el MISMO número que muestra la pantalla de Transferencias.
  {
    // La sesión real del encargado de A, como abre la pantalla (`transferenciasAlcance.mjs`).
    const req = new Request(`http://ci/api/transferencias/tablero?unidad=SEMANA&desplazamiento=0&criterio=RECEPCION`, { headers: { cookie: await cookieDe(U.encA) } });
    const tab = await rutaTablero.GET(req).then((x) => x.json()).catch((e) => ({ caida: String(e) }));
    // Cada transferencia que el tablero devuelve, esté en el bloque que esté.
    const delTablero = [];
    const recorrerJson = (v) => {
      if (Array.isArray(v)) return v.forEach(recorrerJson);
      if (v && typeof v === "object") {
        if (typeof v.id === "number" && "lineasConDiferencia" in v) delTablero.push([v.id, v.lineasConDiferencia]);
        Object.values(v).forEach(recorrerJson);
      }
    };
    recorrerJson(tab);
    const deR1 = delTablero.filter(([id]) => id === r1.id);
    ok("el tablero del ERP dice lo mismo para la misma transferencia", deR1.length > 0 && deR1.every(([, n]) => n === e1.lineasConDiferencia), json({ delTablero, ok: tab?.ok, error: tab?.error }));
  }

  const deB = await recorrer({ usuario: U.encB, local: localB });
  igual("9. local B ve solo la suya; A no ve la de B ni B las de A", ids(deB.vistos), [rB.id]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C/D. El margen de 60 s, con recepciones de verdad");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const base = await recorrer({ ahora: Date.now() + 2 * MARGEN_DE_VISIBILIDAD_MS });
    const nueva = await recibir(await enviar(localA, [3]));
    const fecha = nueva.fechaRecepcion.getTime();
    const dentro = await recorrer({ desde: base.cursor, ahora: fecha + 30_000 });
    igual("C. confirmada hace 30 s: todavía no sale", ids(dentro.vistos), []);
    const borde = await recorrer({ desde: base.cursor, ahora: fecha + MARGEN_DE_VISIBILIDAD_MS });
    igual("D. justo a los 60 s sale", ids(borde.vistos), [nueva.id]);
    const despues = await recorrer({ desde: borde.cursor, ahora: fecha + 10 * MARGEN_DE_VISIBILIDAD_MS });
    igual("D. y no vuelve a salir", ids(despues.vistos), []);
    const desdeCero = await recorrer({});
    igual("una sola vez en el recorrido completo", desdeCero.vistos.filter((e) => e.transferenciaId === nueva.id).length, 1);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A/B. El cursor contra PostgreSQL");
  // ═════════════════════════════════════════════════════════════════════════
  {
    // ESCRITO DIRECTO, y es lo único de esta sección: dos confirmaciones reales
    // no caen en el mismo milisegundo a pedido. Se reciben de verdad y después
    // se lleva su fecha al MISMO instante, que es el caso que hay que ejercer.
    const misma = new Date(Date.now() - 3600_000);
    const g1 = await recibir(await enviar(localA, [1]));
    const g2 = await recibir(await enviar(localA, [1]));
    const g3 = await recibir(await enviar(localA, [1]));
    await c.transferencia.updateMany({ where: { id: { in: [g1.id, g2.id, g3.id] } }, data: { fechaRecepcion: misma } });

    // B: la de id MÁS ALTO con la fecha MÁS VIEJA.
    const tardia = await recibir(await enviar(localA, [1]));
    await c.transferencia.update({ where: { id: tardia.id }, data: { fechaRecepcion: new Date(misma.getTime() - 60_000) } });

    const anteriorAMisma = { fechaRecepcion: new Date(misma.getTime() - 120_000).toISOString(), transferenciaId: 1 };
    for (const limite of [1, 2, 3, 50]) {
      const { vistos } = await recorrer({ desde: anteriorAMisma, limite });
      const primeros = ids(vistos).slice(0, 4);
      igual(`A/B (página de ${limite}): la tardía primero, después las tres del mismo instante por id`, primeros, [tardia.id, g1.id, g2.id, g3.id]);
      ok(`12 (página de ${limite}): ninguna clave repetida`, new Set(vistos.map((e) => e.eventoId)).size === vistos.length);
    }

    // CONTRAPRUEBA: la misma consulta SIN el desempate por id, con el cursor
    // parado en la primera del instante, pierde las otras dos. Si esto no
    // perdiera nada, el fixture no estaría ejerciendo el caso.
    const hasta = new Date(Date.now() + MARGEN_DE_VISIBILIDAD_MS);
    const desde = { fecha: misma, transferenciaId: g1.id };
    const correcta = await c.transferencia.findMany({ where: whereEventos({ localId: localA.id, desde, hasta }), orderBy: ORDEN_EVENTOS, select: { id: true } });
    const sinDesempate = await c.transferencia.findMany({
      where: { destinoId: localA.id, estado: "Recibida", fechaRecepcion: { not: null, lte: hasta, gt: misma } },
      orderBy: ORDEN_EVENTOS,
      select: { id: true },
    });
    const correctaIds = correcta.map((x) => x.id);
    ok("A. con el desempate, después de la primera del instante vienen las otras dos", correctaIds.includes(g2.id) && correctaIds.includes(g3.id), json(correctaIds));
    ok("A. CONTRAPRUEBA: sin el desempate se pierden", !sinDesempate.some((x) => x.id === g2.id || x.id === g3.id), json(sinDesempate));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("E/F. Solo Recibida con fecha");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const antes = await recorrer({});
    // E — ESCRITO DIRECTO: una Recibida histórica sin fecha no la produce la
    // aplicación de hoy (la fecha la escribe la misma transacción); puede
    // existir de antes. Se toma una recepción real y se le borra la fecha.
    const historica = await recibir(await enviar(localA, [2]));
    await c.transferencia.update({ where: { id: historica.id }, data: { fechaRecepcion: null } });

    // F — Enviada, Recibiendo (por la ruta real de guardar) y Cancelada, con
    // datos parciales ESCRITOS DIRECTO: una fecha de recepción que esos estados
    // nunca tienen, para que el filtro de estado sea lo único que las deje afuera.
    const enviada = await enviar(localA, [2]);
    const recibiendo = await enviar(localA, [2]);
    const detR = await c.transferenciaDetalle.findFirst({ where: { transferenciaId: recibiendo.id } });
    const g = await leer(pedir(rutaGuardar, "http://ci/api/transferencias/guardar-recepcion", {
      cookie: `erpazul_sesion=${sesion({ id: U.encA.id, localId: localA.id, permisos: ["transferencias.recibir", "transferencias.ver"] })}`,
      cuerpo: { transferenciaId: recibiendo.id, items: [{ id: detR.id, recibido: 1, motivoPrincipal: "Faltante" }] },
    }));
    const cancelada = await enviar(localA, [2]);
    await c.transferencia.update({ where: { id: cancelada.id }, data: { estado: "Cancelada", canceladaEn: new Date(), canceladaPorId: U.encA.id, motivoCancelacion: "CI" } });
    const pasado = new Date(Date.now() - 7200_000);
    await c.transferencia.updateMany({ where: { id: { in: [enviada.id, recibiendo.id, cancelada.id] } }, data: { fechaRecepcion: pasado } });
    const estados = await c.transferencia.findMany({ where: { id: { in: [enviada.id, recibiendo.id, cancelada.id] } }, select: { estado: true }, orderBy: { id: "asc" } });
    igual("los tres quedaron en su estado (guardar dejó Recibiendo)", [g.status, estados.map((x) => x.estado)], [200, ["Enviada", "Recibiendo", "Cancelada"]]);

    const despues = await recorrer({});
    igual("E/F/8. ninguno de los cuatro aparece: el recorrido es el mismo de antes", ids(despues.vistos), ids(antes.vistos));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("G. Un id reutilizado da otra clave");
  // ═════════════════════════════════════════════════════════════════════════
  {
    // ESCRITO DIRECTO: reset-operativo borra las transferencias y reinicia la
    // secuencia. Acá se reproduce sobre UNA: se recuerda su clave, se borra con
    // sus dependencias de stock y se reinicia la secuencia para que la próxima
    // recepción real reciba el MISMO id.
    const vieja = await recibir(await enviar(localB, [1]));
    const claveVieja = (await recorrer({ usuario: U.encB, local: localB })).vistos.find((e) => e.transferenciaId === vieja.id)?.eventoId;
    const detalles = await c.transferenciaDetalle.findMany({ where: { transferenciaId: vieja.id }, select: { id: true } });
    let reutilizado = false;
    try {
      await c.$executeRawUnsafe(`DELETE FROM "AuditoriaStock" WHERE "transferenciaDetalleId" = ANY($1::int[])`, detalles.map((d) => d.id));
      await c.transferencia.delete({ where: { id: vieja.id } });
      await c.$executeRawUnsafe(`SELECT setval('"Transferencia_id_seq"', $1::int, false)`, vieja.id);
      reutilizado = true;
    } catch (e) {
      console.log(`  · la base no deja reproducir el reset sobre una sola fila (${e.message.split("\n")[0]}); G queda cubierto por el candado unitario`);
    }
    if (reutilizado) {
      const nueva = await recibir(await enviar(localB, [1]));
      const claveNueva = (await recorrer({ usuario: U.encB, local: localB })).vistos.find((e) => e.transferenciaId === nueva.id)?.eventoId;
      igual("G. la recepción nueva tiene el MISMO id", nueva.id, vieja.id);
      ok("G. y OTRA clave de evento", claveVieja && claveNueva && claveVieja !== claveNueva, `${claveVieja} / ${claveNueva}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("12. Paginación completa");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const referencia = ids((await recorrer({ limite: 100 })).vistos);
    for (const limite of [1, 2, 3, 7]) {
      const { vistos } = await recorrer({ limite });
      igual(`página de ${limite}: el mismo recorrido, sin saltos ni duplicados`, ids(vistos), referencia);
    }
    const esperado = (
      await c.transferencia.findMany({
        where: { destinoId: localA.id, estado: "Recibida", fechaRecepcion: { not: null } },
        orderBy: [{ fechaRecepcion: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    ).map((x) => x.id);
    igual("el recorrido es exactamente las Recibida con fecha del local A", referencia, esperado);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("13/14. Parámetros validados en el servidor");
  // ═════════════════════════════════════════════════════════════════════════
  for (const [titulo, parametros] of [
    ["limite 101", { limite: 101 }],
    ["limite 0", { limite: 0 }],
    ["usuarioId", { usuarioId: U.encB.id }],
    ["desde sin id", { desde: { fechaRecepcion: new Date().toISOString() } }],
  ]) {
    const r = await eventos({ usuario: U.encA, parametros });
    igual(`${titulo}: SOLICITUD_INVALIDA`, [r.status, r.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("H/I/J. La autorización, en vivo, con la misma delegación");
  // ═════════════════════════════════════════════════════════════════════════
  {
    // Lo que mi_alcance anuncia, por la puerta real: { localId: capacidades }.
    const anuncio = async (u) => {
      const cuerpo = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[u.id] }, parametros: {} });
      const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo), cuerpo }, { entorno: ENTORNO, limitador: null }));
      if (r.status !== 200) throw new Error(`mi_alcance: ${r.status} ${json(r.cuerpo)}`);
      return Object.fromEntries(r.cuerpo.datos.locales.map((l) => [l.id, l.capacidades]));
    };

    igual("3. sin transferencias.ver: NO_AUTORIZADO", (await eventos({ usuario: U.sinVerA })).cuerpo.codigo, "NO_AUTORIZADO");
    igual("1B-A. el ENCARGADO ve su local con transferencias_eventos (y ventas_resumen) anunciadas", await anuncio(U.encA), { [localA.id]: ["ventas_resumen", "transferencias_eventos"] });
    igual("1B-B. sin transferencias.ver ve su local igual, pero sin la capacidad", await anuncio(U.sinVerA), { [localA.id]: [] });

    igual("H. con el permiso, antes", (await eventos({ usuario: U.encA })).status, 200);
    await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO].filter((p) => p !== "transferencias.ver") } });
    igual("H. sin transferencias.ver, la misma delegación ya no sirve", (await eventos({ usuario: U.encA })).cuerpo.codigo, "NO_AUTORIZADO");
    igual("1B-C. y la próxima mi_alcance deja de anunciarla, con la misma delegación", await anuncio(U.encA), { [localA.id]: ["ventas_resumen"] });
    await c.rol.update({ where: { id: rolEncargado.id }, data: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
    igual("H. y devolverlo la reabre sin volver a vincular", (await eventos({ usuario: U.encA })).status, 200);
    igual("1B-D. y mi_alcance la vuelve a anunciar sin revincular", await anuncio(U.encA), { [localA.id]: ["ventas_resumen", "transferencias_eventos"] });

    igual("I. antes de moverla, la persona ve el local A", (await eventos({ usuario: U.movil })).status, 200);
    await c.usuario.update({ where: { id: U.movil.id }, data: { localId: localB.id } });
    igual("I. movida al B, el A queda afuera en la consulta siguiente", (await eventos({ usuario: U.movil, local: localA })).cuerpo.codigo, "NO_AUTORIZADO");
    igual("I. y el B entra", (await eventos({ usuario: U.movil, local: localB })).status, 200);
    igual("1B-E. mi_alcance ya no trae A: trae B, con sus capacidades", await anuncio(U.movil), { [localB.id]: ["ventas_resumen", "transferencias_eventos"] });
    await c.usuario.update({ where: { id: U.movil.id }, data: { localId: localA.id } });
    igual("1B-F. devuelta a A, A reaparece con las capacidades de hoy", await anuncio(U.movil), { [localA.id]: ["ventas_resumen", "transferencias_eventos"] });
    igual("1B-F. y la puerta la deja consultar A de nuevo", (await eventos({ usuario: U.movil, local: localA })).status, 200);
    await c.usuario.update({ where: { id: U.movil.id }, data: { localId: localB.id } });

    for (const [titulo, local, grupoId] of [["otro local del grupo", localB, grupo.id], ["otro grupo", localX, grupo2.id]]) {
      const r = await eventos({ usuario: U.encA, local, grupoId });
      igual(`J. ${titulo}: rechazo, no lista vacía`, [r.status, r.cuerpo.codigo, r.cuerpo.datos], [403, "NO_AUTORIZADO", undefined]);
    }
    igual("5. grupo inconsistente: NO_AUTORIZADO", (await eventos({ usuario: U.encA, local: localA, grupoId: grupo2.id })).cuerpo.codigo, "NO_AUTORIZADO");

    await c.usuario.update({ where: { id: U.inactivo.id }, data: { activo: false } });
    igual("2. persona inactiva: NO_AUTORIZADO", (await eventos({ usuario: U.inactivo })).cuerpo.codigo, "NO_AUTORIZADO");
    const r = await eventos({ usuario: U.encA, extra: {}, parametros: {} });
    igual("1. con delegación válida responde", r.status, 200);
    const sinDelegacion = aRespuestaPublica(await atenderSolicitudAzulChat(
      (() => {
        const cuerpo = json({ capacidad: "transferencias_eventos", delegacion: { token: "del1_" + "A".repeat(43) }, alcance: { grupoId: grupo.id, localId: localA.id }, parametros: {} });
        return { headers: firmadas(cuerpo), cuerpo };
      })(),
      { entorno: ENTORNO, limitador: null }
    ));
    igual("1. con una delegación inexistente: VINCULO_NO_VALIDO", sinDelegacion.cuerpo.codigo, "VINCULO_NO_VALIDO");
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("15. Solo lectura: la base queda idéntica");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const huella = async () =>
      (await c.$queryRawUnsafe(`
        SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
          SELECT 'T' || row_to_json(t)::text AS x FROM "Transferencia" t
          UNION ALL SELECT 'D' || row_to_json(d)::text FROM "TransferenciaDetalle" d
          UNION ALL SELECT 'S' || row_to_json(s)::text FROM "StockLocal" s
          UNION ALL SELECT 'U' || row_to_json(u)::text FROM "Usuario" u
          UNION ALL SELECT 'V' || row_to_json(v)::text FROM "VinculoIntegracion" v
          UNION ALL SELECT 'G' || row_to_json(g)::text FROM "DelegacionIntegracion" g
        ) q`))[0].h;
    const antes = await huella();
    await recorrer({ limite: 2 });
    await eventos({ usuario: U.encA, local: localB });
    await eventos({ usuario: U.encA, parametros: { limite: 101 } });
    igual("ninguna consulta escribió nada", await huella(), antes);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("16/17/18. Lo que ya existía sigue igual");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ma = await eventos({ usuario: U.encA, capacidad: "mi_alcance", extra: {} }).catch(() => null);
    // mi_alcance no acepta alcance: se pide con su forma propia.
    const cuerpoMa = json({ capacidad: "mi_alcance", delegacion: { token: TOKEN[U.encA.id] }, parametros: {} });
    const miAlcance = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpoMa), cuerpo: cuerpoMa }, { entorno: ENTORNO, limitador: null }));
    igual("16. mi_alcance responde, con la persona y su local", [miAlcance.status, miAlcance.cuerpo.datos?.alcance?.modo], [200, "LOCAL"]);
    ok("16. y con alcance en el cuerpo sigue rechazando", ma && ma.status === 400);

    const vr = await eventos({ usuario: U.encA, capacidad: "ventas_resumen", parametros: { periodo: { tipo: "hoy" } } });
    igual("17. ventas_resumen sigue con su permiso (el ENCARGADO lo tiene)", vr.status, 200);

    const cuerpo = json({ capacidad: "transferencias_eventos", delegacion: { token: TOKEN[U.encA.id] }, alcance: { grupoId: grupo.id, localId: localA.id }, parametros: {} });
    const sinFirma = await rutaConsultar.POST(new Request("http://ci/api/integraciones/azul-chat/consultar", { method: "POST", headers: firmadas(cuerpo, { sinFirma: true }), body: cuerpo }));
    igual("18. sin firma, por la ruta real: 401", sinFirma.status, 401);
    const conFirma = await rutaConsultar.POST(new Request("http://ci/api/integraciones/azul-chat/consultar", { method: "POST", headers: firmadas(cuerpo), body: cuerpo }));
    const datos = await conFirma.json();
    igual("18. con firma, por la ruta real: 200 y la capacidad", [conFirma.status, datos.datos?.capacidad], [200, "transferencias_eventos"]);
    ok("18. la ruta real aplica el margen con el reloj de verdad", typeof datos.datos?.hasta === "string" && Date.parse(datos.datos.hasta) <= Date.now() - MARGEN_DE_VISIBILIDAD_MS + 1000);
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
