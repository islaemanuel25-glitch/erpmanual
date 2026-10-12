// AZUL CHAT · `stock_consulta` CONTRA POSTGRESQL (Tanda 8A).
//
//   DATABASE_URL=postgresql://…@localhost:5432/postgres AUTH_SECRET=… \
//     node --import ./scripts/alias-loader.mjs scripts/pruebas-db/azulChatStockConsulta.mjs
//
// Con `AZUL_CHAT_FIXTURE_SALIDA=<ruta>` además escribe ahí el fixture para Azul
// Chat: pedidos y respuestas REALES de la puerta, con el token enmascarado.
//
// Lo que los candados de `lib/integraciones/azul-chat/stockConsulta.test.mjs` no
// pueden probar, porque vive en la base (regla 2 de CLAUDE.md): que cada
// consulta, tal como está escrita, devuelve lo que muestra la pantalla Stock
// Locales.
//
//   A. la búsqueda por nombre, por código de barras y sin coincidencias, en el
//      orden del buscador del ERP; el corte en 10 con `hayMas`; el inactivo
//      afuera;
//   B. la cantidad, la unidad y la equivalencia, comparadas fila por fila contra
//      lo que devuelve `/api/stock_locales/listar` dibujado con la pieza de la
//      pantalla: en el local en unidades y kg, en el depósito el pack en
//      "bultos + uds";
//   C. el mínimo: solo con límites ajustados, y `bajoMinimo` igual al
//      `faltante` del listado;
//   D. bajo_minimo: los mismos productos que el filtro "Faltantes" del listado,
//      el total igual a la card "Bajo mínimo" de `/api/stock_locales/resumen`,
//      por mayor faltante relativo; en el depósito, sin ningún mínimo ajustado,
//      STOCK_MINIMO_NO_DISPONIBLE;
//   E. la puerta: sin `stock.ver` no entra, un parámetro de más o un texto corto
//      se rechazan, y `mi_alcance` la anuncia solo a quien la puede usar;
//   F. ninguna consulta escribe (huella de las tablas).
//
// Los hechos van por el camino real: la existencia y los límites se cargan por
// `/api/stock_locales/ajustar` (modo ajuste y modo límites), la ruta de los
// modales de la pantalla; la delegación por autorizar y canjear. Lo escrito
// directo es SOLO configuración: los productos (ficha base y producto del
// local), como los da de alta el catálogo.
//
// Base descartable PROPIA, creada y borrada acá. Nivel ESCRITURA: host local y
// NODE_ENV distinto de production. No toca ninguna otra base.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");

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

const NOMBRE = "erpazul_azul_chat_stock_consulta";
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
const SECRETO = "prueba-azul-chat-stock-consulta-0123456789abcdef";
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-erp-stock-consulta-0123456789abcdef";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: process.env.AUTH_SECRET };
const SALIDA_FIXTURE = process.env.AZUL_CHAT_FIXTURE_SALIDA || null;

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  aplicarMigraciones(sinQuery(urlPrueba));
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra: configuración y catálogo ───────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Grupo uno" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const local = await c.local.create({ data: { nombre: "Local Centro" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito Central", es_deposito: true } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [local, deposito]) await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });

  const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, CAJERO } = await import("../../lib/rbac/systemRoles.js");
  const rolEncargado = await c.rol.create({ data: { nombre: "CI encargado", permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } });
  const rolCajero = await c.rol.create({ data: { nombre: "CI cajero", permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] } });
  requerir("el ENCARGADO trae stock.ver y stock.editar; el CAJERO no trae stock.ver",
    DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("stock.ver") && DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("stock.editar") && !DEFAULT_PERMISOS_SISTEMA[CAJERO].includes("stock.ver"));
  const usuario = (nombre, rolId, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre}@ci.local`, passwordHash: "x", rolId, localId, activo: true } });
  const U = {
    encargado: await usuario("encargado-centro", rolEncargado.id, local.id),
    deposito: await usuario("encargado-deposito", rolEncargado.id, deposito.id),
    cajero: await usuario("cajero-centro", rolCajero.id, local.id),
  };

  // ESCRITO DIRECTO: el catálogo (ficha base y producto del local), como lo da
  // de alta Productos. La existencia y los límites NO: van por la ruta.
  async function alta(donde, { nombre, codigo = null, unidad = "unidad", factor = null, activo = true }) {
    const base = await c.productoBase.create({
      data: { grupoId: grupo.id, nombre, codigo_barra: codigo, unidad_medida: unidad, factor_pack: factor, precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
    });
    return c.productoLocal.create({ data: { localId: donde.id, baseId: base.id, nombre, activo } });
  }
  const P = {
    lecheEntera: await alta(local, { nombre: "Leche Entera La Serenísima", codigo: "7790001000012" }),
    lecheDescremada: await alta(local, { nombre: "Leche Descremada", codigo: "7790001000029" }),
    dulce: await alta(local, { nombre: "Dulce de Leche Serenísima", codigo: "7790001000036" }),
    lecheVieja: await alta(local, { nombre: "Leche Larga Vida (discontinuada)", activo: false }),
    queso: await alta(local, { nombre: "Queso Cremoso", unidad: "kg" }),
    cerveza: await alta(local, { nombre: "Cerveza Quilmes 1 L", unidad: "pack", factor: 12, codigo: "7790070000016" }),
  };
  const alfajores = [];
  for (let i = 1; i <= 12; i += 1) alfajores.push(await alta(local, { nombre: `Alfajor Havanna ${String(i).padStart(2, "0")}` }));
  const cervezaDepo = await c.productoLocal.create({ data: { localId: deposito.id, baseId: P.cerveza.baseId, nombre: "Cerveza Quilmes 1 L", activo: true } });

  // ── La aplicación, contra ESTA base ─────────────────────────────────────
  process.env.DATABASE_URL = urlPrueba;
  process.env.AZUL_CHAT_INTEGRACION_SECRET = SECRETO;
  const { atenderCanje } = await import("../../lib/integraciones/vinculos/canje.js");
  const { aRespuestaPublica } = await import("../../lib/integraciones/azul-chat/respuestaPublica.js");
  const { atenderSolicitudAzulChat } = await import("../../lib/integraciones/azul-chat/servidor.js");
  const { firmarSolicitud, CABECERAS } = await import("../../lib/integraciones/azul-chat/autenticacionAplicacion.js");
  const { presentacionCantidadStock, getUnidadLocal, getUnidadDeposito } = await import("../../lib/stock/presentacion.js");
  const rutaAutorizar = await import("../../app/api/integraciones/azul-chat/vinculo/autorizar/route.js");
  const rutaAjustar = await import("../../app/api/stock_locales/ajustar/route.js");
  const rutaListar = await import("../../app/api/stock_locales/listar/route.js");
  const rutaResumen = await import("../../app/api/stock_locales/resumen/route.js");

  const cookieDe = async (u) => {
    const fila = await c.usuario.findUnique({ where: { id: u.id }, select: { nombre: true, localId: true, local: { select: { es_deposito: true } }, rol: { select: { permisos: true } } } });
    const token = jwt.sign(
      { id: u.id, nombre: fila.nombre, email: `ci-${u.id}@ci.local`, rolId: null, rolNombre: null, permisos: fila.rol.permisos, esDuenoLocal: false, localId: fila.localId, esDeposito: fila.local?.es_deposito === true },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
    return `erpazul_sesion=${token}`;
  };
  const leer = async (r) => {
    const res = await r;
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const pedidoErp = async (url, u, { metodo = "GET", cuerpo } = {}) => {
    const req = new Request(url, { method: metodo, headers: { cookie: await cookieDe(u), "content-type": "application/json" }, ...(cuerpo ? { body: json(cuerpo) } : {}) });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    return req;
  };

  // ── La existencia y los límites, por la ruta de los modales ─────────────
  const ajustar = async (u, cuerpo, titulo) => {
    const r = await leer(rutaAjustar.POST(await pedidoErp("http://ci/api/stock_locales/ajustar", u, { metodo: "POST", cuerpo })));
    requerir(titulo, r.status === 200 && r.ok === true, `${r.status} ${json(r)}`);
  };
  const fijar = (u, pl, cantidad) => ajustar(u, { productoLocalId: pl.id, modo: "ajuste", tipo: "fijar", cantidad }, `fijar ${cantidad} en ${pl.nombre}`);
  const limites = (u, pl, nuevoMin) => ajustar(u, { productoLocalId: pl.id, modo: "limites", nuevoMin, nuevoMax: "" }, `mínimo ${nuevoMin} en ${pl.nombre}`);

  await fijar(U.encargado, P.lecheEntera, 24);
  await fijar(U.encargado, P.lecheDescremada, 3);
  await fijar(U.encargado, P.dulce, 1);
  await fijar(U.encargado, P.queso, "2.350");
  await fijar(U.encargado, P.cerveza, 30);
  for (const [i, a] of alfajores.entries()) await fijar(U.encargado, a, i + 1);
  await fijar(U.deposito, cervezaDepo, 30);
  // Mínimos: dos por debajo, uno por encima y uno en el borde (igual no falta).
  await limites(U.encargado, P.lecheEntera, 10); // 24 ≥ 10
  await limites(U.encargado, P.lecheDescremada, 10); // 3 < 10: falta 70 %
  await limites(U.encargado, P.dulce, 4); // 1 < 4: falta 75 %
  await limites(U.encargado, alfajores[4], 5); // 5 = 5: no falta

  // El listado del depósito CREA, al abrirse, los productos del grupo que le
  // faltan (su guard self-healing). Se abre una vez ANTES de tomar la huella,
  // como lo haría la pantalla, para comparar contra el mismo universo.
  const listar = async (u, query = "") => leer(rutaListar.GET(await pedidoErp(`http://ci/api/stock_locales/listar?${query}`, u)));
  await listar(U.deposito);

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
  for (const u of Object.values(U)) TOKEN[u.id] = await vincular(u);

  const consultar = async ({ capacidad = "stock_consulta", usuario: u = U.encargado, donde = local, parametros = { modo: "bajo_minimo" }, ahora = Date.now() }) => {
    const pedido = capacidad === "mi_alcance"
      ? { capacidad, delegacion: { token: TOKEN[u.id] }, parametros }
      : { capacidad, delegacion: { token: TOKEN[u.id] }, alcance: { grupoId: grupo.id, localId: donde.id }, parametros };
    const cuerpo = json(pedido);
    const r = aRespuestaPublica(await atenderSolicitudAzulChat({ headers: firmadas(cuerpo, { marca: String(Math.floor(ahora / 1000)) }), cuerpo }, { entorno: ENTORNO, ahora, limitador: null }));
    return { ...r, pedido: { ...pedido, delegacion: { token: "<token>" } } };
  };
  const buscar = (texto, extra = {}) => consultar({ parametros: { modo: "producto", texto }, ...extra });

  const huella = async () =>
    (await c.$queryRawUnsafe(`
      SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
        SELECT 'S' || row_to_json(s)::text AS x FROM "StockLocal" s
        UNION ALL SELECT 'P' || row_to_json(p)::text FROM "ProductoLocal" p
        UNION ALL SELECT 'B' || row_to_json(b)::text FROM "ProductoBase" b
        UNION ALL SELECT 'A' || row_to_json(a)::text FROM "AuditoriaStock" a
        UNION ALL SELECT 'G' || row_to_json(g)::text FROM "DelegacionIntegracion" g
      ) q`))[0].h;
  const antes = await huella();

  // Lo que la pantalla dibuja para un ítem del listado, con sus piezas.
  const comoLaPantalla = (item, esDeposito) => ({
    unidad: esDeposito ? getUnidadDeposito(item) : getUnidadLocal(item),
    equivalencia: presentacionCantidadStock(item, esDeposito).texto,
    bajoMinimo: item.limitesConfigurados && item.stockMin !== null ? item.faltante : null,
  });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A. La búsqueda: nombre, código, ninguna, el corte en 10");
  // ═════════════════════════════════════════════════════════════════════════
  const leche = await buscar("leche");
  requerir("leche: 200", leche.status === 200, `${leche.status} ${json(leche.cuerpo)}`);
  const L = leche.cuerpo.datos;
  igual("la forma de la respuesta", Object.keys(L), ["capacidad", "version", "local", "grupoId", "modo", "texto", "productos", "hayMas"]);
  // Las dos que empiezan con "leche" empatan en el ranking y quedan en el orden
  // del catálogo; el dulce, que la nombra en una palabra del medio, después.
  igual("las tres leches activas, en el orden del buscador; la discontinuada no",
    L.productos.map((p) => p.nombre), ["Leche Entera La Serenísima", "Leche Descremada", "Dulce de Leche Serenísima"]);
  igual("sin más coincidencias", L.hayMas, false);
  const codigo = await buscar("7790001000029");
  igual("por código de barras: una sola", codigo.cuerpo.datos?.productos.map((p) => [p.nombre, p.codigo]), [["Leche Descremada", "7790001000029"]]);
  const ninguna = await buscar("fernet");
  igual("sin coincidencias: lista vacía", [ninguna.status, ninguna.cuerpo.datos?.productos, ninguna.cuerpo.datos?.hayMas], [200, [], false]);
  const muchas = await buscar("alfajor");
  igual("12 alfajores: 10 y hayMas", [muchas.cuerpo.datos?.productos.length, muchas.cuerpo.datos?.hayMas], [10, true]);
  {
    // El buscador del ERP con la MISMA base: mismo orden.
    const { buscarCatalogoLocal } = await import("../../lib/productos/buscarCatalogoLocal.js");
    const b = await buscarCatalogoLocal(c, { localId: local.id, q: "leche", soloActivos: true });
    igual("el orden es el de buscarCatalogoLocal", L.productos.map((p) => p.productoId), b.items.map((i) => i.productoLocalId));
    const sinFiltro = await buscarCatalogoLocal(c, { localId: local.id, q: "leche" });
    ok("CONTRAPRUEBA: sin soloActivos el buscador sí trae la discontinuada", sinFiltro.items.some((i) => i.productoLocalId === P.lecheVieja.id));
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("B. Cantidad, unidad y equivalencia: lo que dibuja la pantalla");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const listado = await listar(U.encargado, "page=1");
    requerir("el listado del local: 200", listado.status === 200, json(listado));
    const todos = [...(await listar(U.encargado, "page=1")).items];
    const pagina2 = await listar(U.encargado, "page=2");
    todos.push(...(pagina2.items ?? []));
    const deLaPantalla = new Map(todos.map((i) => [i.id, i]));
    const revisadas = [];
    for (const texto of ["leche", "queso", "cerveza", "alfajor"]) {
      for (const p of (await buscar(texto)).cuerpo.datos.productos) {
        const item = deLaPantalla.get(p.productoId);
        revisadas.push([p.nombre, json([p.unidad, p.equivalencia, p.bajoMinimo]) === json(Object.values(comoLaPantalla(item, false))), Number(p.cantidad) === item.stock]);
      }
    }
    igual("cada fila: unidad, equivalencia, bajo mínimo y cantidad iguales a la del listado", revisadas.filter(([, a, b]) => !a || !b), []);
    ok(`(${revisadas.length} filas comparadas)`, revisadas.length >= 15);
    const queso = (await buscar("queso")).cuerpo.datos.productos[0];
    igual("el queso: kilos con tres decimales", [queso.cantidad, queso.unidad, queso.equivalencia], ["2.350", "Kg", "2.350 kg"]);
    const cerveza = (await buscar("cerveza")).cuerpo.datos.productos[0];
    igual("la cerveza en el local: unidades, que es como vende el POS del local", [cerveza.cantidad, cerveza.unidad, cerveza.equivalencia], ["30.000", "Unidad", "30 uds"]);
  }
  {
    const depo = await buscar("cerveza", { usuario: U.deposito, donde: deposito });
    requerir("la cerveza en el depósito: 200", depo.status === 200, `${depo.status} ${json(depo.cuerpo)}`);
    const p = depo.cuerpo.datos.productos[0];
    igual("en el depósito el pack se lee en bultos + unidades", [p.cantidad, p.unidad, p.equivalencia, depo.cuerpo.datos.local.esDeposito], ["30.000", "Pack x12", "2 bultos + 6 uds", true]);
    const item = (await listar(U.deposito, "q=cerveza")).items.find((i) => i.id === p.productoId);
    igual("y es lo que dibuja la pantalla del depósito", [p.unidad, p.equivalencia], [comoLaPantalla(item, true).unidad, comoLaPantalla(item, true).equivalencia]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C. El mínimo, solo ajustado");
  // ═════════════════════════════════════════════════════════════════════════
  igual("leches: mínimo y bajo mínimo; el dulce falta, la entera no",
    L.productos.map((p) => [p.nombre, p.stockMinimo, p.bajoMinimo]),
    [["Leche Entera La Serenísima", "10.00", false], ["Leche Descremada", "10.00", true], ["Dulce de Leche Serenísima", "4.00", true]]);
  igual("un producto sin límites ajustados: null, no cero", (await buscar("queso")).cuerpo.datos.productos[0].stockMinimo, null);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("D. Bajo mínimo: el filtro Faltantes y la card");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const bm = await consultar({});
    requerir("bajo_minimo: 200", bm.status === 200, `${bm.status} ${json(bm.cuerpo)}`);
    const B = bm.cuerpo.datos;
    igual("por mayor faltante relativo: dulce (75 %) y descremada (70 %)", B.productos.map((p) => p.nombre), ["Dulce de Leche Serenísima", "Leche Descremada"]);
    igual("el alfajor en el borde (5 = 5) no falta", B.productos.some((p) => p.nombre.startsWith("Alfajor")), false);
    const faltantes = await listar(U.encargado, "faltantes=true");
    igual("los mismos que el filtro Faltantes del listado", B.productos.map((p) => p.productoId).sort(), faltantes.items.map((i) => i.id).sort());
    const resumen = await leer(rutaResumen.GET(await pedidoErp("http://ci/api/stock_locales/resumen", U.encargado)));
    const card = resumen.estados?.find((e) => e.id === "bajo-minimo");
    igual("el total es el número de la card Bajo mínimo", [B.total, B.hayMas], [card?.cantidad ?? card?.total ?? card?.valor ?? json(card), false]);
    const noDisponible = await consultar({ usuario: U.deposito, donde: deposito });
    igual("el depósito sin ningún mínimo ajustado: STOCK_MINIMO_NO_DISPONIBLE",
      [noDisponible.status, noDisponible.cuerpo.codigo, noDisponible.cuerpo.error], [409, "STOCK_MINIMO_NO_DISPONIBLE", "Ningún producto de este local tiene el stock mínimo ajustado."]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("E. La puerta: permiso, parámetros y anuncio");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const sinPermiso = await consultar({ usuario: U.cajero });
    igual("el cajero (sin stock.ver) no entra", [sinPermiso.status, sinPermiso.cuerpo.codigo], [403, "NO_AUTORIZADO"]);
    const deMas = await consultar({ parametros: { modo: "producto", texto: "leche", localId: deposito.id } });
    igual("un parámetro de más se rechaza", [deMas.status, deMas.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"]);
    const corto = await buscar("l");
    igual("un texto de una letra se rechaza", [corto.status, corto.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"]);
    const ajeno = await consultar({ usuario: U.encargado, donde: deposito });
    igual("el encargado del local no consulta el depósito", [ajeno.status, ajeno.cuerpo.codigo], [403, "NO_AUTORIZADO"]);
    const anuncio = async (u) => {
      const r = await consultar({ capacidad: "mi_alcance", usuario: u, parametros: {} });
      return Object.fromEntries(r.cuerpo.datos.locales.map((l) => [l.id, l.capacidades.includes("stock_consulta")]));
    };
    igual("mi_alcance la anuncia al encargado en su local", await anuncio(U.encargado), { [local.id]: true });
    igual("y al del depósito en el depósito", await anuncio(U.deposito), { [deposito.id]: true });
    igual("y no al cajero", await anuncio(U.cajero), { [local.id]: false });
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("F. Ninguna consulta escribe");
  // ═════════════════════════════════════════════════════════════════════════
  igual("la huella de stock, productos, auditoría y delegaciones no cambió", await huella(), antes);

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
      producto: {
        variasCoincidencias: await intercambio({ parametros: { modo: "producto", texto: "leche" } }),
        unaPorCodigo: await intercambio({ parametros: { modo: "producto", texto: "7790001000029" } }),
        ninguna: await intercambio({ parametros: { modo: "producto", texto: "fernet" } }),
        hayMas: await intercambio({ parametros: { modo: "producto", texto: "alfajor" } }),
        enUnidadesYKg: await intercambio({ parametros: { modo: "producto", texto: "queso" } }),
        enUnidadesEnElLocal: await intercambio({ parametros: { modo: "producto", texto: "cerveza" } }),
        enBultosEnElDeposito: await intercambio({ usuario: U.deposito, donde: deposito, parametros: { modo: "producto", texto: "cerveza" } }),
      },
      bajoMinimo: {
        conFaltantes: await intercambio({}),
        stockMinimoNoDisponible: await intercambio({ usuario: U.deposito, donde: deposito }),
      },
      rechazos: {
        textoCorto: await intercambio({ parametros: { modo: "producto", texto: "l" } }),
        modoInvalido: await intercambio({ parametros: { modo: "todo" } }),
        sinPermiso: await intercambio({ usuario: U.cajero }),
      },
      miAlcance: {
        encargado: await intercambio({ capacidad: "mi_alcance", parametros: {} }),
        cajero: await intercambio({ capacidad: "mi_alcance", usuario: U.cajero, parametros: {} }),
      },
    };
    const texto = json(fixture);
    ok("el fixture no lleva ningún token real", !Object.values(TOKEN).some((t) => texto.includes(t)));
    ok("el fixture no lleva precios ni costos", !/precio|costo|margen/i.test(texto));
    fixture._origen = {
      generadoPor: "scripts/pruebas-db/azulChatStockConsulta.mjs",
      commit: process.env.FIXTURE_COMMIT || null,
      nota: "Pedidos y respuestas reales de la puerta del ERP (atenderSolicitudAzulChat) contra una base descartable. Un local con leches (dos con mínimo ajustado y faltantes), un queso en kg, una cerveza pack x12 y doce alfajores; un depósito con la misma cerveza en bultos y sin ningún mínimo ajustado. No se edita a mano: se regenera.",
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
