// PRUEBA DE BASE: ENVIAR Y CANCELAR UN PEDIDO, POR SUS RUTAS REALES.
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs scripts/pruebas-db/pedidosEnviarCancelar.mjs
//
// Llama a los HANDLERS que usa `app/modulos/pedidos/page.jsx` con la cuenta de un
// encargado firmada como la firma el login, con y sin el PIN de su operadora,
// contra la base de la URL (la de desarrollo, `erpazul_al`):
//
//   1. el carrito se arma con `set-cantidad`, como lo arma la pantalla;
//   2. solicitar SIN operario: 428 con `needsOperador`, y el pedido sigue en
//      Borrador con sus líneas —el carrito no se pierde—;
//   3. solicitar con PIN: Solicitado, y `/api/pedidos/carrito` lo devuelve en
//      `pendiente` —es lo que la pantalla vuelve a leer después del envío—;
//   4. cancelar SIN operario: 428 con `needsOperador`, y sigue Solicitado;
//   5. cancelar con PIN: Cancelado, y el carrito ya no tiene pendiente.
//
// Lo escrito directo es la siembra —un grupo propio con su local, su depósito,
// la cuenta, la operadora y dos productos del depósito—, como lo dejan Locales,
// Usuarios y Productos. Todo lo del pedido va por sus rutas. Cada corrida siembra
// un grupo nuevo: no toca lo que ya había en la base.
//
// Con ESCRIBIR_FIXTURE_PEDIDOS=1 deja las respuestas tal cual en
// `app/modulos/pedidos/enviarCancelar.fixture.json`, que es lo que leen los
// candados de la pantalla (`app/modulos/pedidos/enviarCancelar.test.mjs`).
// ACTUALIZA solo las claves que produjo esta corrida y deja las demás: las del
// recorrido con líneas repetidas (sección 7) son de la ruta de ANTES del
// bloqueo y con la de hoy ya no se pueden producir.
//
// ── RUTA_ANTES_DEL_BLOQUEO=1 ──────────────────────────────────────────────
// Para correr con `app/api/pedidos/set-cantidad/route.js` de antes del bloqueo
// (la de e4505d0, puesta a mano en el árbol) y medir las carreras como eran. Le
// cambia a las secciones 7 y 8 lo que esperan: con la ruta de antes, las dos
// carreras SÍ dan duplicados y borradores nuevos. Y deja en la base un borrador
// con líneas repetidas DE VERDAD —hechas por la ruta, no escritas a mano— en un
// grupo "Grupo duplicados viejos", que la sección 8 de la corrida normal usa
// para probar que la ruta de hoy los deja en una línea.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ANTES = process.env.RUTA_ANTES_DEL_BLOQUEO === "1";

const c = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");

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
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-pedidos-0123456789abcdef";

// Las respuestas tal cual las devuelven las rutas, sin el status (que el
// candado reconstruye de `status` aparte).
const lectura = {};
const guardar = (clave, r) => {
  lectura[clave] = r;
};

try {
  // ── Siembra: un grupo propio con un local y su depósito ─────────────────
  const marca = Date.now();
  const grupo = await c.grupo.create({ data: { nombre: `Grupo pedidos ${marca}` } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const mini = await c.local.create({ data: { nombre: `Mini pedidos ${marca}` } });
  const depo = await c.local.create({ data: { nombre: `Depósito pedidos ${marca}`, es_deposito: true } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: mini.id } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: depo.id } });
  // exigirOperador sin escribir: null es "obligatorio", como en una instalación.
  for (const l of [mini, depo]) await c.configuracionLocal.create({ data: { localId: l.id } });

  const rolEnc =
    (await c.rol.findUnique({ where: { nombre: "ENCARGADO" } })) ??
    (await c.rol.create({ data: { nombre: "ENCARGADO", esSistema: true, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } }));
  const cuenta = await c.usuario.create({
    data: { nombre: "Cuenta Mini", email: `pedidos-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: mini.id },
  });
  const ana = await c.operadorLocal.create({ data: { nombre: "Ana", pinHash: "x", localId: mini.id } });

  // Dos categorías propias: el filtro de la pantalla las lista por nombre.
  const bebidas = await c.categoria.create({ data: { nombre: `Bebidas ${marca}` } });
  const almacen = await c.categoria.create({ data: { nombre: `Almacén ${marca}` } });
  const delDeposito = async (nombre, codigo_barra, categoria_id, extra = {}) => {
    const b = await c.productoBase.create({
      data: { grupoId: grupo.id, nombre, codigo_barra, unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, categoria_id, ...extra },
    });
    const pl = await c.productoLocal.create({ data: { localId: depo.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
    await c.stockLocal.create({ data: { localId: depo.id, productoId: pl.id, cantidad: 50 } });
    return pl.id;
  };
  const coca = await delDeposito("Coca 2L", `77${marca}1`.slice(0, 13), bebidas.id);
  const yerba = await delDeposito("Yerba 1kg", `77${marca}2`.slice(0, 13), almacen.id);
  // Un pack de 6: la ficha lo hace salir por bulto (`defaultModoEnvio`).
  // Y con foto, como la deja Productos: la tarjeta la dibuja; las otras dos
  // no tienen y llevan la inicial.
  const agua = await delDeposito("Agua x6", `77${marca}3`.slice(0, 13), bebidas.id, {
    unidad_medida: "pack",
    factor_pack: 6,
    imagen_url: "/uploads/productos/agua-x6.jpg",
  });

  // ── La aplicación ───────────────────────────────────────────────────────
  const R = {
    me: await import("../../app/api/me/route.js"),
    operadorMe: await import("../../app/api/operador/me/route.js"),
    operadorListar: await import("../../app/api/operador/listar/route.js"),
    opciones: await import("../../app/api/pedidos/opciones/route.js"),
    catalogo: await import("../../app/api/pedidos/catalogo/route.js"),
    carrito: await import("../../app/api/pedidos/carrito/route.js"),
    setCantidad: await import("../../app/api/pedidos/set-cantidad/route.js"),
    solicitar: await import("../../app/api/pos-transferencias/solicitar/route.js"),
    cancelar: await import("../../app/api/pos-transferencias/cancelar/route.js"),
    historial: await import("../../app/api/pedidos/historial/route.js"),
    detalle: await import("../../app/api/pedidos/historial/[id]/route.js"),
  };

  const permisos = rolEnc.permisos;
  const sesion = `erpazul_sesion=${jwt.sign(
    { id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, rolId: cuenta.rolId, rolNombre: "ENCARGADO", permisos, esDuenoLocal: false, localId: mini.id, esDeposito: false },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  )}`;
  const pin = `erpazul_operador_activo=${jwt.sign({ operadorId: ana.id, nombre: ana.nombre, localId: mini.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
  const S = { sinPin: sesion, conPin: `${sesion}; ${pin}` };

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
  const B = "http://ci/api";
  const carrito = (s) => pedir(R.carrito, "GET", `${B}/pedidos/carrito`, s);
  const estadoDe = async (id) => (await c.posTransferencia.findUnique({ where: { id }, select: { estado: true } }))?.estado;
  const lineasDe = (id) => c.posTransferenciaDetalle.count({ where: { posTransferenciaId: id } });

  ok("el ENCARGADO tiene ver, editar y solicitar pedidos", ["pedidos.ver", "pedidos.editar", "pedidos.solicitar"].every((p) => permisos.includes(p)), json(permisos));

  seccion("0. Lo que la pantalla lee al entrar");
  {
    const me = await pedir(R.me, "GET", `${B}/me`, S.conPin);
    guardar("me", me);
    ok("/api/me contesta el perfil", me.status === 200 && me.cuerpo.ok === true, json(me));
    const opMe = await pedir(R.operadorMe, "GET", `${B}/operador/me`, S.conPin);
    guardar("operadorMeConPin", opMe);
    ok("/api/operador/me con PIN: Ana", opMe.cuerpo.ok === true && opMe.cuerpo.operador?.operadorId === ana.id, json(opMe));
    const opSin = await pedir(R.operadorMe, "GET", `${B}/operador/me`, S.sinPin);
    guardar("operadorMeSinPin", opSin);
    ok("/api/operador/me sin PIN: nadie", opSin.cuerpo.ok === false && opSin.cuerpo.operador === null, json(opSin));
    // Lo que lista el modal del PIN cuando se levanta.
    const lista = await pedir(R.operadorListar, "GET", `${B}/operador/listar`, S.sinPin);
    guardar("operadorListar", lista);
    ok("/api/operador/listar trae a Ana", lista.cuerpo.ok === true && lista.cuerpo.items?.some((o) => o.id === ana.id), json(lista));
    const op = await pedir(R.opciones, "GET", `${B}/pedidos/opciones`, S.conPin);
    guardar("opciones", op);
    ok("opciones del local", op.status === 200 && op.cuerpo.ok === true, json(op));
    const cat = await pedir(R.catalogo, "GET", `${B}/pedidos/catalogo?page=1&pageSize=50`, S.conPin);
    guardar("catalogo", cat);
    ok("el catálogo trae los tres del depósito", cat.status === 200 && cat.cuerpo.items?.length === 3, json(cat));
    const aguaEnCat = cat.cuerpo.items?.find((i) => i.productoLocalId === agua);
    ok("el pack sale por bulto de 6", aguaEnCat?.modoEnvio === "SOLO_BULTO" && aguaEnCat?.factorPack === 6, json(aguaEnCat));
    ok("el catálogo trae la foto del agua y ninguna de las otras dos",
      aguaEnCat?.imagenUrl === "/uploads/productos/agua-x6.jpg" && cat.cuerpo.items.filter((i) => i.imagenUrl).length === 1,
      json(cat.cuerpo.items.map((i) => [i.nombre, i.imagenUrl])));
    ok("las dos categorías están en las opciones", [bebidas.id, almacen.id].every((id) => op.cuerpo.categorias?.some((k) => k.id === id)), json(op.cuerpo.categorias));
    // Lo que contesta el catálogo filtrado por categoría, como lo pide la
    // pantalla: página, tamaño y la categoría, nada más.
    const catBebidas = await pedir(R.catalogo, "GET", `${B}/pedidos/catalogo?page=1&pageSize=50&categoriaId=${bebidas.id}`, S.conPin);
    guardar("catalogoBebidas", catBebidas);
    ok("filtrado por Bebidas: la coca y el agua", catBebidas.cuerpo.total === 2 && catBebidas.cuerpo.items?.every((i) => i.productoLocalId !== yerba), json(catBebidas));
    // La página de entrada: el carrito de un local que todavía no pidió nada,
    // y sus pedidos anteriores, como los pide la pantalla (los últimos cuatro:
    // tres más el que pueda estar en curso).
    const vacio = await carrito(S.conPin);
    guardar("carritoVacio", vacio);
    ok("al entrar, sin pedido en curso", vacio.cuerpo.ok && vacio.cuerpo.items.length === 0 && vacio.cuerpo.pendiente === null, json(vacio));
    const hist = await pedir(R.historial, "GET", `${B}/pedidos/historial?page=1&pageSize=4`, S.conPin);
    guardar("historialVacio", hist);
    ok("al entrar, sin pedidos anteriores", hist.cuerpo.ok && hist.cuerpo.items.length === 0, json(hist));
  }

  seccion("1. El carrito, como lo arma la pantalla");
  let posId = null;
  {
    // La yerba queda AFUERA del pedido: en la lista no lleva ✕.
    for (const [p, cant, unidad] of [[coca, 3, "UNIDAD"], [agua, 2, "BULTO"]]) {
      const r = await pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, S.conPin, { productoLocalId: p, cantidad: cant, unidad });
      ok(`set-cantidad ${p} → ${cant} ${unidad}`, r.status === 200 && r.cuerpo.ok === true, json(r));
      guardar(`setCantidad_${unidad}`, r);
      posId = r.cuerpo.posId;
    }
    const k = await carrito(S.conPin);
    guardar("carritoBorrador", k);
    ok("el carrito tiene las dos líneas y ningún pendiente", k.cuerpo.itemCount === 2 && k.cuerpo.pendiente === null && k.cuerpo.posId === posId, json(k));
    const aguaEnCarrito = k.cuerpo.items?.find((i) => i.productoLocalId === agua);
    ok("el agua se guardó en bultos", aguaEnCarrito?.unidadSugerida === "BULTO" && aguaEnCarrito?.sugerido === 2, json(aguaEnCarrito));
    ok("el carrito también trae la foto", aguaEnCarrito?.imagenUrl === "/uploads/productos/agua-x6.jpg", json(aguaEnCarrito));
  }

  seccion("2. Solicitar sin operario");
  {
    const r = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, S.sinPin, { posId });
    guardar("solicitarSinOperador", r);
    ok("428 con needsOperador", r.status === 428 && r.cuerpo.ok === false && r.cuerpo.needsOperador === true, json(r));
    ok("el pedido sigue en Borrador con sus dos líneas", (await estadoDe(posId)) === "Borrador" && (await lineasDe(posId)) === 2);
    const k = await carrito(S.sinPin);
    ok("y el carrito sigue entero", k.cuerpo.itemCount === 2 && k.cuerpo.pendiente === null, json(k));
  }

  seccion("3. Solicitar con PIN");
  {
    const r = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, S.conPin, { posId });
    guardar("solicitado", r);
    ok("ok y Solicitado", r.status === 200 && r.cuerpo.ok === true && r.cuerpo.item?.estado === "Solicitado", json(r));
    const k = await carrito(S.conPin);
    guardar("carritoPendiente", k);
    ok(
      "el carrito lo devuelve en pendiente, sin borrador",
      k.cuerpo.ok === true && k.cuerpo.pendiente?.posId === posId && k.cuerpo.itemCount === 0 && k.cuerpo.posId === null,
      json(k)
    );
  }

  seccion("4. Cancelar sin operario");
  {
    const r = await pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, S.sinPin, { posId });
    guardar("cancelarSinOperador", r);
    ok("428 con needsOperador", r.status === 428 && r.cuerpo.ok === false && r.cuerpo.needsOperador === true, json(r));
    ok("y sigue Solicitado", (await estadoDe(posId)) === "Solicitado");
  }

  seccion("5. Cancelar con PIN");
  {
    const r = await pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, S.conPin, { posId });
    guardar("cancelado", r);
    ok("ok", r.status === 200 && r.cuerpo.ok === true, json(r));
    ok("y quedó Cancelado", (await estadoDe(posId)) === "Cancelado");
    const k = await carrito(S.conPin);
    guardar("carritoTrasCancelar", k);
    ok("el carrito ya no tiene pendiente", k.cuerpo.ok === true && k.cuerpo.pendiente === null && k.cuerpo.itemCount === 0, json(k));
  }

  seccion("6. Cuántos por página: 25, 50, 100, inválido y sin valor");
  {
    // Un grupo aparte con 120 productos del depósito: con los tres de arriba
    // cualquier tamaño trae los tres en una página y no se distingue nada.
    const g = await c.grupo.create({ data: { nombre: `Grupo paginado ${marca}` } });
    await c.configuracionGrupo.create({ data: { grupoId: g.id } });
    const local = await c.local.create({ data: { nombre: `Mini paginado ${marca}` } });
    const deposito = await c.local.create({ data: { nombre: `Depósito paginado ${marca}`, es_deposito: true } });
    await c.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
    await c.grupoDeposito.create({ data: { grupoId: g.id, localId: deposito.id } });
    for (const l of [local, deposito]) await c.configuracionLocal.create({ data: { localId: l.id } });
    const otra = await c.usuario.create({
      data: { nombre: "Cuenta paginado", email: `paginado-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: local.id },
    });
    const TOTAL = 120;
    for (let i = 1; i <= TOTAL; i++) {
      const n = String(i).padStart(3, "0");
      const b = await c.productoBase.create({
        data: { grupoId: g.id, nombre: `Producto ${n}`, codigo_barra: `78${marca}${n}`.slice(0, 13) + n, unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
      });
      await c.productoLocal.create({ data: { localId: deposito.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } });
    }
    const s = `erpazul_sesion=${jwt.sign(
      { id: otra.id, nombre: otra.nombre, email: otra.email, rolId: otra.rolId, rolNombre: "ENCARGADO", permisos, esDuenoLocal: false, localId: local.id, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
    const catalogo = (qs) => pedir(R.catalogo, "GET", `${B}/pedidos/catalogo?${qs}`, s);
    const resumen = (r) => ({ status: r.status, items: r.cuerpo.items?.length, total: r.cuerpo.total, pageSize: r.cuerpo.pageSize, totalPages: r.cuerpo.totalPages, page: r.cuerpo.page });

    // Lo que la pantalla de este local lee al entrar, para montarla entera: su
    // perfil, su operadora con PIN, sus opciones y su carrito (vacío).
    const bea = await c.operadorLocal.create({ data: { nombre: "Bea", pinHash: "x", localId: local.id } });
    const pinBea = `erpazul_operador_activo=${jwt.sign({ operadorId: bea.id, nombre: bea.nombre, localId: local.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
    guardar("paginadoMe", await pedir(R.me, "GET", `${B}/me`, s));
    guardar("paginadoOperadorMe", await pedir(R.operadorMe, "GET", `${B}/operador/me`, `${s}; ${pinBea}`));
    guardar("paginadoOpciones", await pedir(R.opciones, "GET", `${B}/pedidos/opciones`, s));
    guardar("paginadoCarrito", await carrito(s));

    const casos = [
      ["paginado25", "page=1&pageSize=25", 25, 25, 5],
      ["paginado50", "page=1&pageSize=50", 50, 50, 3],
      ["paginado100", "page=1&pageSize=100", 100, 100, 2],
      ["paginadoInvalido", "page=1&pageSize=30", 50, 50, 3],
      ["paginadoSinValor", "page=1", 50, 50, 3],
    ];
    for (const [clave, qs, tamano, items, paginas] of casos) {
      const r = await catalogo(qs);
      guardar(clave, r);
      const v = resumen(r);
      console.log(`  · ${qs.padEnd(22)} → ${v.items} productos, ${v.totalPages} páginas de ${v.pageSize}, total ${v.total}`);
      ok(`${qs}: ${items} productos, ${paginas} páginas de ${tamano}`, v.status === 200 && v.items === items && v.pageSize === tamano && v.totalPages === paginas && v.total === TOTAL, json(v));
    }
    // La página 2 de 50, para que la pantalla pueda estar en otra página antes
    // de cambiar el tamaño.
    guardar("paginado50p2", await catalogo("page=2&pageSize=50"));
    // La última de 100 trae los 20 que sobran, y los nombres siguen en orden.
    const ultima = await catalogo("page=2&pageSize=100");
    ok("la página 2 de 100 trae los 20 que quedan, del 101 al 120",
      ultima.cuerpo.items?.length === 20 && ultima.cuerpo.items[0].nombre === "Producto 101" && ultima.cuerpo.items.at(-1).nombre === "Producto 120",
      json(resumen(ultima)));
    // Otros inválidos: todos dan 50, como hoy.
    for (const malo of ["abc", "0", "-25", "50abc", "1000", "25.5", ""]) {
      const r = await catalogo(`page=1&pageSize=${encodeURIComponent(malo)}`);
      ok(`pageSize="${malo}" da 50`, r.cuerpo.pageSize === 50 && r.cuerpo.items?.length === 50, json(resumen(r)));
    }
  }

  /**
   * Un local aparte con su depósito, la cuenta de un encargado y su operadora,
   * y los productos pedidos en el depósito. Devuelve las sesiones (sin y con
   * PIN), los ids de los productos por nombre y `fijar`, que llama a
   * `set-cantidad` como la pantalla.
   */
  async function armarLocal(nombreGrupo, productos) {
    const g = await c.grupo.create({ data: { nombre: `${nombreGrupo} ${marca}` } });
    await c.configuracionGrupo.create({ data: { grupoId: g.id } });
    const local = await c.local.create({ data: { nombre: `Mini ${nombreGrupo} ${marca}` } });
    const deposito = await c.local.create({ data: { nombre: `Depósito ${nombreGrupo} ${marca}`, es_deposito: true } });
    await c.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
    await c.grupoDeposito.create({ data: { grupoId: g.id, localId: deposito.id } });
    for (const l of [local, deposito]) await c.configuracionLocal.create({ data: { localId: l.id } });
    const cuentaLocal = await c.usuario.create({
      data: { nombre: `Cuenta ${nombreGrupo}`, email: `${nombreGrupo.replace(/\W+/g, "-").toLowerCase()}-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: local.id },
    });
    const operadora = await c.operadorLocal.create({ data: { nombre: "Caro", pinHash: "x", localId: local.id } });
    const ids = {};
    // Un producto es su nombre, o `{ nombre, extra }` con campos de la ficha
    // (un pack que sale por bulto, por ejemplo).
    for (const [i, producto] of productos.entries()) {
      const { nombre, extra = {} } = typeof producto === "string" ? { nombre: producto } : producto;
      const b = await c.productoBase.create({
        data: { grupoId: g.id, nombre, codigo_barra: `79${marca}`.slice(0, 10) + String(i).padStart(3, "0"), unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true, ...extra },
      });
      ids[nombre] = (await c.productoLocal.create({ data: { localId: deposito.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } })).id;
    }
    const s = sesionDe(cuentaLocal, local.id);
    const sPin = `${s}; erpazul_operador_activo=${jwt.sign({ operadorId: operadora.id, nombre: operadora.nombre, localId: local.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
    const fijar = (id, cantidad, unidad = "UNIDAD") => pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, sPin, { productoLocalId: id, cantidad, unidad });
    return { local, deposito, s, sPin, ids, fijar };
  }
  function sesionDe(usuario, localId) {
    return `erpazul_sesion=${jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rolId: usuario.rolId, rolNombre: "ENCARGADO", permisos, esDuenoLocal: false, localId, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
  }
  const lineasDelProducto = (posId, productoId) =>
    c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: posId, productoId }, select: { id: true, sugerido: true } });

  seccion(`7. El recorrido del celular: cargar, tocar el último dos veces, revisar y enviar${ANTES ? " (RUTA DE ANTES)" : ""}`);
  {
    // Un local aparte, como un pedido de verdad: varios productos cargados uno
    // por uno y el ÚLTIMO tocado dos veces seguidas con el + —dos pedidos a
    // `set-cantidad` que viajan juntos, como dos toques rápidos en el celular—.
    //
    // Con la ruta de ANTES del bloqueo eso dejaba dos líneas del mismo
    // producto, y estas respuestas —las que guarda el fixture— son de esa
    // ruta: los candados de la pantalla las usan para probar que un pedido viejo
    // con líneas repetidas se ve bien. Con la ruta de hoy queda una sola, y no
    // se guarda nada: el fixture conserva las de antes.
    const guardar7 = ANTES ? guardar : () => {};
    const { sPin, ids, fijar } = await armarLocal("Grupo recorrido", ["9 DE ORO AGRIDULCE", "ARROZ 1KG", "FIDEOS MOÑO", "GALLETITAS AGUA", "LECHE 1L"]);

    guardar7("recorridoMe", await pedir(R.me, "GET", `${B}/me`, sPin));
    guardar7("recorridoOperadorMe", await pedir(R.operadorMe, "GET", `${B}/operador/me`, sPin));
    guardar7("recorridoOpciones", await pedir(R.opciones, "GET", `${B}/pedidos/opciones`, sPin));
    guardar7("recorridoCarritoVacio", await carrito(sPin));
    guardar7("recorridoCatalogo", await pedir(R.catalogo, "GET", `${B}/pedidos/catalogo?page=1&pageSize=50`, sPin));

    // Cargar varios, uno por uno.
    for (const nombre of ["ARROZ 1KG", "FIDEOS MOÑO", "GALLETITAS AGUA", "LECHE 1L"]) await fijar(ids[nombre], 2);
    // Y el último: dos toques al + seguidos, sin esperar la respuesta del primero.
    // Es una carrera y no sale siempre: se repite —volviendo a 0 entre
    // intentos, como lo haría la ✕— hasta que quedan dos líneas, y se cuenta.
    const ORO = ids["9 DE ORO AGRIDULCE"];
    let posId = null;
    let filas = [];
    let intentos = 0;
    let maximo = 0;
    while (intentos < 10) {
      intentos += 1;
      const [uno, dos] = await Promise.all([fijar(ORO, 1), fijar(ORO, 2)]);
      ok(`intento ${intentos}: los dos toques contestan ok`, uno.cuerpo.ok && dos.cuerpo.ok, json([uno, dos]));
      posId = dos.cuerpo.posId;
      filas = await lineasDelProducto(posId, ORO);
      maximo = Math.max(maximo, filas.length);
      if (ANTES ? filas.length === 2 : intentos === 10) break;
      // Con la ruta de antes, `set-cantidad` con 0 borraba UNA línea; con una
      // sola, el producto sale.
      await fijar(ORO, 0);
    }
    console.log(`  · filas de "9 DE ORO AGRIDULCE" en el pedido #${posId}: ${filas.length} → ${json(filas.map((f) => Number(f.sugerido)))} (intento ${intentos})`);
    if (ANTES) {
      ok("con la ruta de antes, dos toques rápidos dejan dos líneas del mismo producto", filas.length === 2, `${filas.length} línea(s) en ${intentos} intentos`);
    } else {
      ok("con el bloqueo, dos toques rápidos dejan UNA línea, en los diez intentos", maximo === 1, `hubo ${maximo} línea(s)`);
    }
    guardar7("recorridoFilasDuplicadas", { posId, filas: filas.length, intentos });

    // Revisar: lo que trae "Ver mi pedido".
    const revision = await carrito(sPin);
    guardar7("recorridoRevision", revision);
    console.log(`  · Ver mi pedido trae ${revision.cuerpo.items.length} líneas para ${new Set(revision.cuerpo.items.map((i) => i.productoLocalId)).size} productos`);

    // Confirmar y enviar.
    const enviado = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, sPin, { posId });
    guardar7("recorridoSolicitado", enviado);
    ok("se envía", enviado.status === 200 && enviado.cuerpo.ok === true, json(enviado));
    const despues = await carrito(sPin);
    guardar7("recorridoTrasEnviar", despues);
    const nombres = despues.cuerpo.pendiente?.items.map((i) => i.nombre) ?? [];
    console.log(`  · el pedido enviado trae ${nombres.length} líneas: ${json(nombres)}`);
  }

  seccion(`8. Las carreras con el bloqueo${ANTES ? " (RUTA DE ANTES: se miden como eran)" : ""}`);
  {
    // ── 8a. DOS TOQUES AL + SOBRE UN PRODUCTO EN 0, 25 VECES ──────────────
    // Un producto nuevo por vez, así cada carrera arranca en 0 de verdad: sin
    // línea, que es cuando los dos pedidos la creaban.
    const VECES = 25;
    const nombres = Array.from({ length: VECES }, (_, i) => `PRODUCTO ${String(i + 1).padStart(2, "0")}`);
    const L = await armarLocal(ANTES ? "Grupo duplicados viejos" : "Grupo carrera", nombres);
    let duplicados = 0;
    let posCarrera = null;
    const cantidades = [];
    for (const nombre of nombres) {
      const [uno, dos] = await Promise.all([L.fijar(L.ids[nombre], 1), L.fijar(L.ids[nombre], 2)]);
      posCarrera = dos.cuerpo.posId ?? uno.cuerpo.posId;
      const filas = await lineasDelProducto(posCarrera, L.ids[nombre]);
      if (filas.length > 1) duplicados += 1;
      if (filas.length === 1) cantidades.push(Number(filas[0].sugerido));
    }
    const borradores = await c.posTransferencia.count({ where: { origenId: L.deposito.id, destinoId: L.local.id, estado: "Borrador" } });
    console.log(`  · 8a: ${duplicados} de ${VECES} carreras dejaron el producto dos veces; ${borradores} borrador(es) para el par`);
    guardar(ANTES ? "carreraAntesDelBloqueo" : "carreraConBloqueo", { veces: VECES, duplicados, borradores });
    if (ANTES) {
      ok("8a con la ruta de antes: la carrera da duplicados", duplicados > 0, `${duplicados} de ${VECES}`);
      // Se deja así a propósito: es el borrador viejo de la 8c.
      console.log(`  · queda en la base el borrador #${posCarrera} con líneas repetidas, para la 8c de la corrida normal`);
    } else {
      ok(`8a: ${VECES} carreras, cero duplicados`, duplicados === 0, `${duplicados} de ${VECES}`);
      ok("8a: un solo borrador para el par", borradores === 1, `${borradores}`);
      ok("8a: cada línea quedó con la cantidad de uno de los dos toques", cantidades.length === VECES && cantidades.every((n) => n === 1 || n === 2), json(cantidades));
    }

    // ── 8b. UNA CANTIDAD QUE VIAJA JUNTO CON EL ENVÍO, 20 VECES ──────────
    // El borrador con un producto, y en el mismo instante: enviar y mandar la
    // cantidad de otro. Después se cancela lo enviado —por su ruta— para la
    // vuelta siguiente.
    const E = await armarLocal("Grupo envio", ["ACEITE", "AZUCAR"]);
    const VUELTAS = 20;
    let nuevos = 0;
    let conflictos = 0;
    let entraronAntes = 0;
    for (let i = 0; i < VUELTAS; i++) {
      const base = await E.fijar(E.ids.ACEITE, 1);
      const posId = base.cuerpo.posId;
      const [envio, cantidad] = await Promise.all([
        pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, E.sPin, { posId }),
        E.fijar(E.ids.AZUCAR, 3),
      ]);
      ok(`8b vuelta ${i + 1}: el envío sale`, envio.cuerpo.ok === true, json(envio));
      const borradoresAhora = await c.posTransferencia.count({ where: { origenId: E.deposito.id, destinoId: E.local.id, estado: { in: ["Borrador", "Preparando"] } } });
      if (borradoresAhora > 0) nuevos += 1;
      if (cantidad.status === 409) conflictos += 1;
      else if (cantidad.cuerpo.ok && cantidad.cuerpo.posId === posId) entraronAntes += 1;
      if (i === 0 && ANTES) guardar("envioCarreraAntes", cantidad);
      // Limpiar para la vuelta siguiente: cancelar lo enviado y, si la ruta de
      // antes abrió un borrador, vaciarlo.
      await pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, E.sPin, { posId });
      if (borradoresAhora > 0) {
        await E.fijar(E.ids.AZUCAR, 0);
        await E.fijar(E.ids.ACEITE, 0);
      }
    }
    // Con la regla de hoy, una cantidad que llega detrás del envío entra al
    // pedido enviado: "entró" cuenta las dos, antes y después de enviarse.
    console.log(`  · 8b: ${nuevos} de ${VUELTAS} vueltas abrieron un borrador nuevo; ${conflictos} contestaron 409; ${entraronAntes} entraron al pedido`);
    guardar(ANTES ? "envioAntesDelBloqueo" : "envioConBloqueo", { vueltas: VUELTAS, nuevos, conflictos, entraronAntes });
    if (!ANTES) {
      ok("8b: ningún borrador nuevo al lado del pedido enviado", nuevos === 0, `${nuevos} de ${VUELTAS}`);
      ok("8b: en cada vuelta la cantidad entró al mismo pedido, enviado o no", entraronAntes === VUELTAS && conflictos === 0, json({ conflictos, entraronAntes }));
    }

    // ── 8c. EL BORRADOR VIEJO CON LÍNEAS REPETIDAS ───────────────────────
    // Lo dejó la ruta de antes, de verdad, en una corrida con
    // RUTA_ANTES_DEL_BLOQUEO=1. Se busca el último, y con la ruta de hoy se le
    // cambia la cantidad a un producto repetido y se le saca otro.
    if (!ANTES) {
      const [viejo] = await c.$queryRaw`
        SELECT d."posTransferenciaId" AS "posId", p."destinoId" AS "localId"
        FROM "PosTransferenciaDetalle" d
        JOIN "PosTransferencia" p ON p.id = d."posTransferenciaId"
        JOIN "Local" l ON l.id = p."destinoId"
        WHERE p.estado = 'Borrador' AND l.nombre LIKE 'Mini Grupo duplicados viejos%'
        GROUP BY d."posTransferenciaId", p."destinoId"
        HAVING COUNT(*) > COUNT(DISTINCT d."productoId")
        ORDER BY d."posTransferenciaId" DESC
        LIMIT 1`;
      ok("8c: hay un borrador viejo con líneas repetidas (si no, correr antes con RUTA_ANTES_DEL_BLOQUEO=1 y la ruta de antes)", !!viejo);
      if (viejo) {
        const posId = Number(viejo.posId);
        const repetidos = await c.$queryRaw`
          SELECT "productoId" FROM "PosTransferenciaDetalle" WHERE "posTransferenciaId" = ${posId}
          GROUP BY "productoId" HAVING COUNT(*) > 1 ORDER BY "productoId"`;
        ok("8c: con al menos dos productos repetidos", repetidos.length >= 2, `${repetidos.length}`);
        const cuenta = await c.usuario.findFirst({ where: { localId: Number(viejo.localId) } });
        const s = sesionDe(cuenta, Number(viejo.localId));
        const [cambiar, sacar] = repetidos.map((r) => Number(r.productoId));
        const antesCambiar = (await lineasDelProducto(posId, cambiar)).length;
        const r1 = await pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, s, { productoLocalId: cambiar, cantidad: 5, unidad: "UNIDAD" });
        const despuesCambiar = await lineasDelProducto(posId, cambiar);
        console.log(`  · 8c: borrador viejo #${posId}: el producto ${cambiar} tenía ${antesCambiar} líneas; con 5 quedan ${despuesCambiar.length} → ${json(despuesCambiar.map((f) => Number(f.sugerido)))}`);
        ok("8c: cambiar la cantidad deja UNA línea, con la cantidad nueva", r1.cuerpo.ok && despuesCambiar.length === 1 && Number(despuesCambiar[0].sugerido) === 5, json(despuesCambiar));
        const antesSacar = (await lineasDelProducto(posId, sacar)).length;
        const r2 = await pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, s, { productoLocalId: sacar, cantidad: 0, unidad: "UNIDAD" });
        const despuesSacar = await lineasDelProducto(posId, sacar);
        console.log(`  · 8c: el producto ${sacar} tenía ${antesSacar} líneas; con 0 quedan ${despuesSacar.length}`);
        ok("8c: ponerlo en 0 (la ✕) saca TODAS sus líneas", r2.cuerpo.ok && despuesSacar.length === 0, json(despuesSacar));
        guardar("borradorViejoConRepetidos", {
          posId,
          cambiar: { antes: antesCambiar, despues: despuesCambiar.length, cantidad: Number(despuesCambiar[0]?.sugerido ?? 0) },
          sacar: { antes: antesSacar, despues: despuesSacar.length },
        });
      }
    }
  }

  if (!ANTES) {
    seccion("9. Sumar al pedido enviado, hasta que el depósito lo empieza");
    // ── CONTRAPRUEBA_DEPOSITO=editar | enviar ─────────────────────────────
    // Para correr con esa ruta del depósito SIN el bloqueo (sacado a mano del
    // árbol): la carrera correspondiente tiene que poder dejar líneas tarde.
    const CONTRA = process.env.CONTRAPRUEBA_DEPOSITO || "";
    const VUELTAS = Number(process.env.VUELTAS_CARRERA || 25);
    const editar = await import("../../app/api/pos-transferencias/detalle/editar/route.js");
    const enviar = await import("../../app/api/pos-transferencias/enviar/route.js");
    const { flushAuditoria } = await import("../../lib/auditoria/interceptor.js");
    const { default: prismaApp } = await import("../../lib/prisma.js");

    const P = await armarLocal("Grupo sumar", ["ACEITE", "ARROZ", "FIDEOS", "GALLETITAS", "LECHE"]);
    // Siembra: stock en el depósito, para que el despacho pase, y la cuenta
    // de un encargado del depósito, que es quien lo prepara.
    for (const id of Object.values(P.ids)) await c.stockLocal.create({ data: { localId: P.deposito.id, productoId: id, cantidad: 1000 } });
    const cuentaDepo = await c.usuario.create({
      data: { nombre: "Cuenta Depósito", email: `deposito-sumar-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: P.deposito.id },
    });
    const sDepo = sesionDe(cuentaDepo, P.deposito.id);
    const preparar = (detalleId, preparado) =>
      pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepo, { detalleId, preparado });
    const despachar = (posId) => pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, sDepo, { posId });
    const solicitar = (posId) => pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, P.sPin, { posId });
    const cancelar = (posId) => pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, P.sPin, { posId });
    // Siembra: un admin sin local, como lo deja Usuarios. Es el único que
    // cancela un pedido que el depósito ya empezó (sección 10).
    const rolAdmin =
      (await c.rol.findUnique({ where: { nombre: "Admin" } })) ??
      (await c.rol.create({ data: { nombre: "Admin", esSistema: true, permisos: ["*"] } }));
    const cuentaAdmin = await c.usuario.create({
      data: { nombre: "Admin pedidos", email: `admin-pedidos-${marca}@ci.local`, passwordHash: "x", rolId: rolAdmin.id, localId: null },
    });
    const sAdmin = `erpazul_sesion=${jwt.sign(
      { id: cuentaAdmin.id, nombre: cuentaAdmin.nombre, email: cuentaAdmin.email, rolId: rolAdmin.id, rolNombre: "Admin", permisos: ["*"], esDuenoLocal: false, localId: null, esDeposito: false },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    )}`;
    const cancelarComo = (sesion, posId) => pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, sesion, { posId });
    // Para dejar el par limpio entre vueltas, también con el pedido empezado.
    const limpiar = (posId) => cancelarComo(sAdmin, posId);
    const lineasDelPedido = async (posId) =>
      Object.fromEntries(
        (await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: posId }, select: { productoId: true, sugerido: true } })).map((l) => [l.productoId, Number(l.sugerido)])
      );
    const borradoresDelPar = () =>
      c.posTransferencia.count({ where: { origenId: P.deposito.id, destinoId: P.local.id, estado: { in: ["Borrador", "Preparando"] } } });
    // Un pedido enviado con un producto: el punto de partida de cada vuelta.
    const enviarUno = async (id, cantidad) => {
      const r = await P.fijar(id, cantidad);
      const s = await solicitar(r.cuerpo.posId);
      if (!s.cuerpo.ok) throw new Error(`no se pudo enviar: ${json(s)}`);
      return r.cuerpo.posId;
    };

    // ── 9a. ENVIAR, SUMAR, CAMBIAR Y SACAR ─────────────────────────────────
    const { ACEITE, ARROZ, FIDEOS, GALLETITAS, LECHE } = P.ids;
    await P.fijar(ACEITE, 2);
    await P.fijar(ARROZ, 3);
    const r0 = await P.fijar(FIDEOS, 1);
    const posId = r0.cuerpo.posId;
    ok("9a: se envía", (await solicitar(posId)).cuerpo.ok === true);
    const enviado = await carrito(P.sPin);
    guardar("sumarCarritoEnviado", enviado);
    ok("9a: el carrito trae el pendiente sin empezar", enviado.cuerpo.pendiente?.posId === posId && enviado.cuerpo.pendiente?.depositoEmpezo === false, json(enviado.cuerpo.pendiente));
    const sumar = await P.fijar(GALLETITAS, 4);
    guardar("sumarSetCantidad", sumar);
    const cambiar = await P.fijar(ARROZ, 5);
    const sacar = await P.fijar(FIDEOS, 0);
    ok("9a: sumar, cambiar y sacar contestan ok, sobre el pedido enviado",
      [sumar, cambiar, sacar].every((r) => r.status === 200 && r.cuerpo.ok && r.cuerpo.posId === posId), json([sumar, cambiar, sacar]));
    const lineas = await lineasDelPedido(posId);
    console.log(`  · 9a: pedido #${posId} queda con ${json(lineas)}`);
    ok("9a: las líneas del Solicitado son ACEITE 2, ARROZ 5 y GALLETITAS 4, sin FIDEOS",
      json(lineas) === json({ [ACEITE]: 2, [ARROZ]: 5, [GALLETITAS]: 4 }), json(lineas));
    ok("9a: sigue Solicitado", (await estadoDe(posId)) === "Solicitado");
    ok("9a: no se creó ningún borrador", (await borradoresDelPar()) === 0);
    guardar("sumarCarritoTrasSumar", await carrito(P.sPin));

    // ── 9b. EL RASTRO EN LA BITÁCORA ───────────────────────────────────────
    // La ruta corre adentro del contexto de un request —el mismo
    // AsyncLocalStorage que siembra `getUsuarioSession`— y el flush se llama a
    // mano: en un script no hay `after()` que lo dispare.
    const auditado = async (fn) => {
      const store = {};
      const r = await globalThis.__auditoriaALS.run(store, fn);
      await flushAuditoria(globalThis.__auditoriaRefs.base, store);
      return r;
    };
    const desde = new Date();
    await auditado(() => P.fijar(LECHE, 1));
    await auditado(() => P.fijar(LECHE, 3));
    await auditado(() => P.fijar(LECHE, 0));
    const rastro = await prismaApp.auditoriaBitacora.findMany({
      where: { entidadId: String(posId), entidad: "Transferencia POS", createdAt: { gte: desde } },
      orderBy: { id: "asc" },
      select: { accion: true, usuarioId: true, operadorId: true, cambios: true },
    });
    const resumen = rastro.map((f) => ({ accion: f.accion, campos: (f.cambios?.[0]?.campos || []).map((x) => `${x.label}:${x.antes}→${x.despues}`) }));
    console.log(`  · 9b: ${rastro.length} filas: ${json(resumen)}`);
    ok("9b: tres filas, una por agregar, cambiar y sacar, como pos_transferencia.editar",
      rastro.length === 3 && rastro.every((f) => f.accion === "pos_transferencia.editar"), json(resumen));
    ok("9b: con la cuenta que lo hizo", rastro.every((f) => f.usuarioId != null), json(rastro.map((f) => [f.usuarioId, f.operadorId])));
    console.log(`  · 9b: operadora en el rastro: ${json(rastro.map((f) => f.operadorId))}`);
    guardar("sumarBitacora", resumen);

    // ── 9c. EL QUE QUEDA VACÍO SIGUE ENVIADO ───────────────────────────────
    // Otro local, para no tocar el pedido de arriba.
    const V = await armarLocal("Grupo vacio", ["YERBA"]);
    const rv = await V.fijar(V.ids.YERBA, 2);
    await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, V.sPin, { posId: rv.cuerpo.posId });
    const vacio = await V.fijar(V.ids.YERBA, 0);
    ok("9c: sacar el único producto contesta ok con 0 productos", vacio.cuerpo.ok && vacio.cuerpo.itemCount === 0, json(vacio));
    ok("9c: y el pedido sigue Solicitado, vacío", (await estadoDe(rv.cuerpo.posId)) === "Solicitado" && (await lineasDe(rv.cuerpo.posId)) === 0);
    guardar("sumarEnviadoVacio", await carrito(V.sPin));

    // ── 9d. EL DEPÓSITO LO EMPIEZA, Y DESDE AHÍ 409 ────────────────────────
    const lineaAceite = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: posId, productoId: ACEITE } });
    const prep = await preparar(lineaAceite.id, 2);
    ok("9d: el depósito prepara una línea", prep.cuerpo.ok === true, json(prep));
    const empezado = await carrito(P.sPin);
    guardar("empezadoCarrito", empezado);
    ok("9d: el carrito lo da por empezado", empezado.cuerpo.pendiente?.depositoEmpezo === true, json(empezado.cuerpo.pendiente));
    const tarde = await P.fijar(GALLETITAS, 7);
    guardar("empezadoSetCantidad", tarde);
    ok("9d: set-cantidad da 409 con el mensaje", tarde.status === 409 && tarde.cuerpo.error === "El depósito ya está preparando tu pedido. Ya no se puede cambiar.", json(tarde));
    ok("9d: y no tocó nada", json(await lineasDelPedido(posId)) === json(lineas));
    ok("9d: ni abrió un borrador", (await borradoresDelPar()) === 0);
    const canc = await cancelar(posId);
    guardar("empezadoCancelar", canc);
    ok("9d: el local ya no lo puede cancelar: 409 con el mensaje",
      canc.status === 409 && canc.cuerpo.error === "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local.", json(canc));
    ok("9d: y sigue Solicitado", (await estadoDe(posId)) === "Solicitado");
    guardar("empezadoCarritoTrasCancelar", await carrito(P.sPin));
    ok("9d: el admin lo cancela", (await limpiar(posId)).cuerpo.ok === true);

    // Y despachar sin nadie al lado: sale entero, y después el local ya no
    // tiene pedido enviado —lo que cargue va a uno nuevo—.
    {
      const pid = await enviarUno(ACEITE, 2);
      await P.fijar(ARROZ, 3);
      const dep = await despachar(pid);
      ok("9d: despachar sin carrera sale con las dos líneas", dep.cuerpo.ok === true && dep.cuerpo.totalItems === 2 && (await estadoDe(pid)) === "Enviado", json(dep));
      const nuevo = await P.fijar(LECHE, 1);
      ok("9d: lo que el local carga después va a un pedido nuevo", nuevo.cuerpo.ok && nuevo.cuerpo.posId !== pid, json(nuevo));
      await P.fijar(LECHE, 0);
    }

    // ── 9e. CARRERA: EL DEPÓSITO PREPARA MIENTRAS EL LOCAL CAMBIA ─────────
    // Los dos sobre la MISMA línea. `set-cantidad` pone preparado en 0 al
    // escribir, así que si escribe DESPUÉS de que el depósito empezó, borra lo
    // preparado: esa es la línea tarde, y se ve en la base.
    {
      let antes = 0, conflictos = 0, tardes = 0, otras = 0;
      for (let i = 0; i < VUELTAS; i++) {
        const pid = await enviarUno(ACEITE, 2);
        const linea = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pid, productoId: ACEITE } });
        const [dep, loc] = await Promise.all([preparar(linea.id, 2), P.fijar(ACEITE, 5)]);
        const fin = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pid, productoId: ACEITE } });
        const preparado = Number(fin.preparado);
        if (dep.cuerpo.ok && loc.cuerpo.ok && preparado === 0) tardes += 1;
        else if (dep.cuerpo.ok && loc.status === 409 && preparado === 2) conflictos += 1;
        else if (dep.cuerpo.ok && loc.cuerpo.ok && preparado === 2 && Number(fin.sugerido) === 5) antes += 1;
        else otras += 1;
        await limpiar(pid);
      }
      console.log(`  · 9e: ${VUELTAS} vueltas — ${antes} el local entró antes, ${conflictos} 409, ${tardes} TARDE (preparado borrado), ${otras} otras`);
      guardar(CONTRA === "editar" ? "carreraPrepararSinBloqueo" : "carreraPreparar", { vueltas: VUELTAS, antes, conflictos, tardes, otras });
      if (CONTRA === "editar") ok("9e CONTRAPRUEBA: sin el bloqueo en preparar, hay líneas tarde", tardes > 0, `${tardes}`);
      else ok("9e: cero líneas tarde", tardes === 0 && otras === 0, json({ tardes, otras }));
    }

    // ── 9f. CARRERA: EL DEPÓSITO DESPACHA MIENTRAS EL LOCAL SUMA ──────────
    // Tarde es una línea que quedó en el pedido despachado sin viajar: más
    // líneas en el pedido que ítems en lo que salió.
    {
      let antes = 0, despues = 0, cambio = 0, rechazos = 0, tardes = 0, otras = 0;
      for (let i = 0; i < VUELTAS; i++) {
        const pid = await enviarUno(ACEITE, 2);
        // El despacho hace varias lecturas antes de su transacción, y una
        // cantidad que sale junto con él llega siempre en ese hueco. Se la
        // demora un poco más en cada vuelta para que caiga también adentro de
        // la transacción y después.
        const [dep, loc] = await Promise.all([
          despachar(pid),
          new Promise((r) => setTimeout(r, (i % 13) * 4)).then(() => P.fijar(ARROZ, 3)),
        ]);
        const enPedido = (await c.posTransferenciaDetalle.count({ where: { posTransferenciaId: pid, sugerido: { gt: 0 } } }));
        const estado = await estadoDe(pid);
        if (dep.cuerpo.ok && enPedido > dep.cuerpo.totalItems) tardes += 1;
        else if (dep.cuerpo.ok && loc.cuerpo.ok && loc.cuerpo.posId === pid && dep.cuerpo.totalItems === 2) antes += 1;
        else if (dep.cuerpo.ok && loc.cuerpo.ok && loc.cuerpo.posId !== pid) despues += 1;
        else if (dep.status === 409 && estado === "Solicitado") cambio += 1;
        // El local esperó el bloqueo de la fila mientras se despachaba: al
        // entrar el pedido ya no está sin empezar, y contesta 409.
        else if (dep.cuerpo.ok && loc.status === 409 && enPedido === dep.cuerpo.totalItems) rechazos += 1;
        else {
          otras += 1;
          console.log(`  · 9f vuelta ${i + 1} sin clasificar: ${json({ dep, loc: loc.cuerpo, pid, enPedido, estado })}`);
        }
        if (dep.status === 409 && !lectura.despacharPedidoCambio) guardar("despacharPedidoCambio", dep);
        // Dejar el par limpio: lo que quedó enviado se cancela, y lo que abrió
        // un borrador nuevo se saca.
        if (estado === "Solicitado") await limpiar(pid);
        if (loc.cuerpo.posId !== pid) await P.fijar(ARROZ, 0);
      }
      console.log(`  · 9f: ${VUELTAS} vueltas — ${antes} el local sumó antes y viajó, ${despues} fue a un pedido nuevo, ${cambio} el despacho pidió volver a abrir, ${rechazos} 409 al local, ${tardes} TARDE (quedó sin viajar), ${otras} otras`);
      guardar(CONTRA === "enviar" ? "carreraDespacharSinBloqueo" : "carreraDespachar", { vueltas: VUELTAS, antes, despues, cambio, rechazos, tardes, otras });
      if (CONTRA === "enviar") ok("9f CONTRAPRUEBA: sin el bloqueo en despachar, hay líneas tarde", tardes > 0, `${tardes}`);
      else ok("9f: cero líneas tarde", tardes === 0 && otras === 0, json({ tardes, otras }));
    }

    seccion("10. Cancelar: el local no cancela lo que el depósito empezó");
    {
      // 10a. Sin empezar, el local cancela como siempre.
      const pa = await enviarUno(ACEITE, 2);
      const ca = await cancelar(pa);
      guardar("cancelarSinEmpezar", ca);
      ok("10a: el local cancela un pedido sin empezar", ca.cuerpo.ok === true && (await estadoDe(pa)) === "Cancelado", json(ca));

      // 10b. Empezado: 409 al local, y el pedido sigue.
      const pb = await enviarUno(ACEITE, 2);
      const lb = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pb, productoId: ACEITE } });
      ok("10b: el depósito lo empieza", (await preparar(lb.id, 2)).cuerpo.ok === true);
      const cb = await cancelar(pb);
      guardar("cancelarEmpezadoLocal", cb);
      ok("10b: el local recibe 409 con el mensaje",
        cb.status === 409 && cb.cuerpo.error === "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local.", json(cb));
      ok("10b: y el pedido sigue Solicitado, con lo preparado", (await estadoDe(pb)) === "Solicitado");

      // 10c. Desde el lado del depósito. Decía: un usuario del depósito no
      // puede (403, la ruta solo dejaba al local destino o a un admin sin
      // local). Desde el 2026-10-23 el depósito ORIGEN de este pedido sí, con el
      // permiso de enviar, empezado o no (sección 15). El admin sin local, como
      // antes, sobre otro pedido empezado.
      const opDepo = await c.operadorLocal.create({ data: { nombre: "Dani", pinHash: "x", localId: P.deposito.id } });
      const sDepoPin = `${sDepo}; erpazul_operador_activo=${jwt.sign({ operadorId: opDepo.id, nombre: opDepo.nombre, localId: P.deposito.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
      const cd = await cancelarComo(sDepoPin, pb);
      guardar("cancelarEmpezadoDeposito", cd);
      console.log(`  · 10c: un usuario del depósito cancela el empezado: ${cd.status} ${json(cd.cuerpo)}`);
      ok("10c: el depósito de este pedido cancela el empezado", cd.cuerpo.ok === true && (await estadoDe(pb)) === "Cancelado", json(cd));
      // Si no pudo, el rojo ya quedó anotado: se saca con el admin para que lo
      // que sigue (que necesita al local sin un pedido pendiente) se pueda medir.
      if ((await estadoDe(pb)) === "Solicitado") await cancelarComo(sAdmin, pb);
      const pc = await enviarUno(ACEITE, 2);
      const lc = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pc, productoId: ACEITE } });
      ok("10c: el depósito empieza otro", (await preparar(lc.id, 2)).cuerpo.ok === true);
      const cadm = await cancelarComo(sAdmin, pc);
      guardar("cancelarEmpezadoAdmin", cadm);
      ok("10c: el admin sin local cancela el empezado", cadm.cuerpo.ok === true && (await estadoDe(pc)) === "Cancelado", json(cadm));

      // 10d. CARRERA: el local cancela en el mismo instante en que el
      // depósito empieza. Tarde = un pedido Cancelado con algo preparado: se
      // canceló después de empezado (o se preparó uno ya cancelado).
      let cancelo = 0, rechazo = 0, tardes = 0, otras = 0;
      for (let i = 0; i < VUELTAS; i++) {
        const pid = await enviarUno(ACEITE, 2);
        const linea = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pid, productoId: ACEITE } });
        const [dep, loc] = await Promise.all([preparar(linea.id, 2), cancelar(pid)]);
        const estado = await estadoDe(pid);
        const preparado = Number((await c.posTransferenciaDetalle.findFirst({ where: { id: linea.id } })).preparado);
        if (estado === "Cancelado" && preparado > 0) tardes += 1;
        else if (estado === "Cancelado" && loc.cuerpo.ok && !dep.cuerpo.ok) cancelo += 1;
        else if (estado === "Solicitado" && dep.cuerpo.ok && loc.status === 409) rechazo += 1;
        else {
          otras += 1;
          console.log(`  · 10d vuelta ${i + 1} sin clasificar: ${json({ dep, loc, estado, preparado })}`);
        }
        if (!dep.cuerpo.ok && dep.status === 409 && !lectura.prepararCanceladoEnElMedio) guardar("prepararCanceladoEnElMedio", dep);
        if (estado === "Solicitado") await limpiar(pid);
      }
      console.log(`  · 10d: ${VUELTAS} vueltas — ${cancelo} el local canceló antes, ${rechazo} 409 al local, ${tardes} TARDE (cancelado ya empezado), ${otras} otras`);
      guardar(CONTRA === "cancelar" ? "carreraCancelarSinBloqueo" : "carreraCancelar", { vueltas: VUELTAS, cancelo, rechazo, tardes, otras });
      if (CONTRA === "cancelar") ok("10d CONTRAPRUEBA: sin el bloqueo en cancelar, hay pedidos cancelados ya empezados", tardes > 0, `${tardes}`);
      else ok("10d: cero pedidos cancelados después de empezados", tardes === 0 && otras === 0, json({ tardes, otras }));
    }

    seccion("11. La página de entrada de un local con pedidos anteriores");
    {
      // El local de la sección 9 ya despachó varios (9f). Uno enviado ahora,
      // en curso: el historial lo trae primero, y la entrada lo deja afuera de
      // "Pedidos anteriores" porque es el de la tarjeta.
      const pid = await enviarUno(ACEITE, 2);
      await P.fijar(ARROZ, 3);
      const k = await carrito(P.sPin);
      guardar("entradaEnviadoCarrito", k);
      const h = await pedir(R.historial, "GET", `${B}/pedidos/historial?page=1&pageSize=4`, P.sPin);
      guardar("entradaHistorial", h);
      console.log(`  · 11: historial → ${json(h.cuerpo.items?.map((i) => [i.posId, i.estado, i.itemCount]))}`);
      ok("11: el historial trae el en curso primero y tres más", h.cuerpo.items?.length === 4 && h.cuerpo.items[0].posId === pid && k.cuerpo.pendiente?.posId === pid, json(h.cuerpo.items?.map((i) => i.posId)));
      ok("11: con estado, fecha y cantidad de líneas", h.cuerpo.items.every((i) => i.estado && (i.solicitadoAt || i.createdAt) && Number.isInteger(i.itemCount)));
      await limpiar(pid);
    }

    seccion("12. Sumar al pedido enviado con confirmación: todos los cambios juntos, o ninguno");
    {
      const sumarRuta = await import("../../app/api/pedidos/sumar-al-enviado/route.js");
      const sumar = (posId, cambios) => pedir(sumarRuta, "POST", `${B}/pedidos/sumar-al-enviado`, P.sPin, { posId, cambios });
      const TRES = [
        { productoLocalId: ARROZ, cantidad: 3, unidad: "UNIDAD" },
        { productoLocalId: GALLETITAS, cantidad: 4, unidad: "UNIDAD" },
        { productoLocalId: ACEITE, cantidad: 5, unidad: "UNIDAD" },
      ];

      // 12a. Enviado. Los tres cambios de la pantalla quedan en la pantalla:
      // mientras no se confirma no viaja nada (eso lo afirman los candados de
      // la pantalla, que cuentan los pedidos a la red). Acá: el pedido
      // guardado sigue igual hasta la confirmación.
      const pid = await enviarUno(ACEITE, 2);
      const antes = await lineasDelPedido(pid);
      guardar("sumarModoCarrito", await carrito(P.sPin));
      ok("12a: sin confirmar, el pedido guardado no cambió", json(await lineasDelPedido(pid)) === json(antes) && json(antes) === json({ [ACEITE]: 2 }), json(antes));

      // 12b. Confirmar: los tres entran juntos, con su rastro en la bitácora.
      const desde = new Date();
      const store = {};
      const r = await globalThis.__auditoriaALS.run(store, () => sumar(pid, TRES));
      await flushAuditoria(globalThis.__auditoriaRefs.base, store);
      guardar("sumarConfirmado", r);
      ok("12b: confirmar contesta ok con los tres", r.status === 200 && r.cuerpo.ok && r.cuerpo.aplicados === 3, json(r));
      const despues = await lineasDelPedido(pid);
      console.log(`  · 12b: pedido #${pid} → ${json(despues)}`);
      ok("12b: entraron los tres juntos", json(despues) === json({ [ACEITE]: 5, [ARROZ]: 3, [GALLETITAS]: 4 }), json(despues));
      ok("12b: sigue Solicitado y sin borrador al lado", (await estadoDe(pid)) === "Solicitado" && (await borradoresDelPar()) === 0);
      guardar("sumarConfirmadoCarrito", await carrito(P.sPin));
      const rastro = await prismaApp.auditoriaBitacora.findMany({
        where: { entidadId: String(pid), entidad: "Transferencia POS", createdAt: { gte: desde } },
        select: { accion: true, entidadNombre: true, cambios: true },
      });
      const lineasDelRastro = (rastro[0]?.cambios || []).map((c) => c.campos.map((x) => `${x.label}:${x.antes}→${x.despues}`));
      console.log(`  · 12b: bitácora: ${rastro.length} fila(s), ${json(rastro.map((f) => f.entidadNombre))}, ${json(lineasDelRastro)}`);
      ok("12b: una fila para la confirmación, con un cambio por cada línea",
        rastro.length === 1 && rastro[0].accion === "pos_transferencia.editar" && rastro[0].cambios.length === 3 && rastro[0].entidadNombre === `Transferencia POS #${pid}`,
        json(rastro));
      guardar("sumarConfirmadoBitacora", lineasDelRastro);
      await limpiar(pid);

      // 12c. El depósito lo empieza entre medio: 409 y no entra ninguno.
      const p2 = await enviarUno(ACEITE, 2);
      const l2 = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: p2, productoId: ACEITE } });
      ok("12c: el depósito lo empieza", (await preparar(l2.id, 2)).cuerpo.ok === true);
      const r2 = await sumar(p2, TRES);
      guardar("sumarEmpezado", r2);
      ok("12c: 409 con el mensaje", r2.status === 409 && r2.cuerpo.error === "El depósito ya está preparando tu pedido. Ya no se puede cambiar.", json(r2));
      ok("12c: y no entró ninguno", json(await lineasDelPedido(p2)) === json({ [ACEITE]: 2 }), json(await lineasDelPedido(p2)));
      guardar("sumarEmpezadoCarrito", await carrito(P.sPin));
      await limpiar(p2);

      // 12d. Un producto inválido en la lista: no entra ninguno.
      const p3 = await enviarUno(ACEITE, 2);
      const r3 = await sumar(p3, [TRES[0], { productoLocalId: 999999999, cantidad: 1, unidad: "UNIDAD" }]);
      ok("12d: uno inválido rechaza todos", r3.status === 404 && json(await lineasDelPedido(p3)) === json({ [ACEITE]: 2 }), json(r3));
      await limpiar(p3);

      // 12e. CARRERA: confirmar los cambios en el mismo instante en que el
      // depósito prepara. Los cambios tocan la línea que se prepara —el aceite
      // pasa a 5, y escribir una cantidad pone lo preparado en 0—, así que una
      // confirmación que entra DESPUÉS de empezado borra lo preparado: esa es
      // la línea tarde. Y todo o nada: los otros dos entran con ella o no entra
      // ninguno.
      let antesDep = 0, rechazos = 0, tardes = 0, parciales = 0, otras = 0;
      for (let i = 0; i < VUELTAS; i++) {
        const pv = await enviarUno(ACEITE, 2);
        const lv = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pv, productoId: ACEITE } });
        // La confirmación valida los tres productos antes de bloquear, y el
        // depósito llegaba siempre primero. Se lo demora un poco más en cada
        // vuelta para que caiga de los dos lados.
        const [dep, loc] = await Promise.all([
          new Promise((ok) => setTimeout(ok, (i % 13) * 3)).then(() => preparar(lv.id, 2)),
          sumar(pv, TRES),
        ]);
        const fin = await c.posTransferenciaDetalle.findFirst({ where: { id: lv.id } });
        const otros = await c.posTransferenciaDetalle.count({ where: { posTransferenciaId: pv, productoId: { in: [ARROZ, GALLETITAS] } } });
        const preparado = Number(fin.preparado);
        if (otros !== 0 && otros !== 2) parciales += 1;
        else if (dep.cuerpo.ok && loc.cuerpo.ok && preparado === 0) tardes += 1;
        else if (dep.cuerpo.ok && loc.status === 409 && preparado === 2 && otros === 0) rechazos += 1;
        else if (dep.cuerpo.ok && loc.cuerpo.ok && preparado === 2 && Number(fin.sugerido) === 5 && otros === 2) antesDep += 1;
        else {
          otras += 1;
          console.log(`  · 12e vuelta ${i + 1} sin clasificar: ${json({ dep: dep.status, loc, preparado, otros })}`);
        }
        await limpiar(pv);
      }
      console.log(`  · 12e: ${VUELTAS} vueltas — ${antesDep} los cambios entraron antes, ${rechazos} 409 sin escribir nada, ${tardes} TARDE (preparado borrado), ${parciales} a medias, ${otras} otras`);
      guardar(CONTRA === "sumar" ? "carreraSumarSinBloqueo" : "carreraSumar", { vueltas: VUELTAS, antes: antesDep, rechazos, tardes, parciales, otras });
      if (CONTRA === "sumar") ok("12e CONTRAPRUEBA: sin el bloqueo en sumar-al-enviado, hay líneas tarde", tardes > 0, `${tardes}`);
      else ok("12e: cero líneas tarde, cero a medias", tardes === 0 && parciales === 0 && otras === 0, json({ tardes, parciales, otras }));

      // 12f. En el local de los tres productos —el que monta la pantalla—: el
      // pedido enviado, la confirmación de dos cambios y el carrito después.
      const m = (await pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, S.conPin, { productoLocalId: coca, cantidad: 3, unidad: "UNIDAD" })).cuerpo.posId;
      await pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, S.conPin, { productoLocalId: agua, cantidad: 2, unidad: "BULTO" });
      ok("12f: el local principal envía", (await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, S.conPin, { posId: m })).cuerpo.ok === true);
      const mc = [
        { productoLocalId: yerba, cantidad: 1, unidad: "UNIDAD" },
        { productoLocalId: coca, cantidad: 5, unidad: "UNIDAD" },
      ];
      const ms = await pedir(sumarRuta, "POST", `${B}/pedidos/sumar-al-enviado`, S.conPin, { posId: m, cambios: mc });
      guardar("mainSumado", ms);
      ok("12f: los dos cambios entran", ms.cuerpo.ok && ms.cuerpo.aplicados === 2, json(ms));
      const mt = await carrito(S.conPin);
      guardar("mainTrasSumar", mt);
      ok("12f: el carrito los trae, sin empezar", mt.cuerpo.pendiente?.depositoEmpezo === false && mt.cuerpo.pendiente.items.length === 3, json(mt.cuerpo.pendiente));
      await limpiar(m);
    }

    seccion("13. El historial de un local con pedidos en todos los estados");
    {
      // Un local propio: en camino, recibido, cancelado, y uno enviado que
      // después el depósito empieza. Todo por las rutas: el envío del local,
      // el despacho del depósito, la recepción del local (revisar cada línea y
      // confirmar) y la cancelación.
      const H = await armarLocal("Grupo historial", ["ACEITE", "ARROZ", "FIDEOS"]);
      for (const id of Object.values(H.ids)) await c.stockLocal.create({ data: { localId: H.deposito.id, productoId: id, cantidad: 1000 } });
      const cuentaDepoH = await c.usuario.create({
        data: { nombre: "Depósito historial", email: `deposito-historial-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: H.deposito.id },
      });
      const sDepoH = sesionDe(cuentaDepoH, H.deposito.id);
      const solicitarH = (posId) => pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, H.sPin, { posId });
      const despacharH = (posId) => pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, sDepoH, { posId });
      const historialH = (qs = "page=1&pageSize=50") => pedir(R.historial, "GET", `${B}/pedidos/historial?${qs}`, H.sPin);
      const enviarH = async (cargas) => {
        let posId = null;
        for (const [nombre, cantidad] of cargas) posId = (await H.fijar(H.ids[nombre], cantidad)).cuerpo.posId;
        const s = await solicitarH(posId);
        if (!s.cuerpo.ok) throw new Error(`no se pudo enviar: ${json(s)}`);
        return posId;
      };

      // En camino: enviado y despachado.
      const pCamino = await enviarH([["ACEITE", 2]]);
      const dCamino = await despacharH(pCamino);
      ok("13: el depósito despacha el primero", dCamino.cuerpo.ok === true, json(dCamino));

      // Recibido: enviado, despachado y recibido por el local.
      const pRecibido = await enviarH([["ARROZ", 3], ["FIDEOS", 1]]);
      const dRecibido = await despacharH(pRecibido);
      const tRecibido = dRecibido.cuerpo.item?.id;
      const revisarRuta = await import("../../app/api/transferencias/revisar-producto/route.js");
      const confirmarRuta = await import("../../app/api/transferencias/confirmar-recepcion/route.js");
      for (const d of await c.transferenciaDetalle.findMany({ where: { transferenciaId: tRecibido }, select: { id: true, cantidad: true } })) {
        const r = await pedir(revisarRuta, "POST", `${B}/transferencias/revisar-producto`, H.sPin, { transferenciaId: tRecibido, detalleId: d.id, recibido: Number(d.cantidad), motivoPrincipal: null });
        ok(`13: el local revisa la línea ${d.id}`, r.cuerpo.ok === true, json(r));
      }
      const conf = await pedir(confirmarRuta, "POST", `${B}/transferencias/confirmar-recepcion`, H.sPin, { transferenciaId: tRecibido });
      ok("13: el local confirma la recepción", conf.cuerpo.ok === true, json(conf).slice(0, 300));

      // Cancelado: enviado y cancelado por el local.
      const pCancelado = await enviarH([["FIDEOS", 4]]);
      ok("13: el local cancela uno", (await pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, H.sPin, { posId: pCancelado })).cuerpo.ok === true);

      // Enviado sin empezar, y después empezado.
      const pEnCurso = await enviarH([["ACEITE", 1], ["ARROZ", 2]]);
      guardar("historialConEnviado", await historialH());
      guardar("historialCarritoEnviado", await carrito(H.sPin));
      const lEnCurso = await c.posTransferenciaDetalle.findFirst({ where: { posTransferenciaId: pEnCurso, productoId: H.ids.ACEITE } });
      const prepH = await pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepoH, { detalleId: lEnCurso.id, preparado: 1 });
      ok("13: el depósito empieza el último", prepH.cuerpo.ok === true, json(prepH));

      const h = await historialH();
      guardar("historialTodos", h);
      guardar("historialCarrito", await carrito(H.sPin));
      const porId = Object.fromEntries((h.cuerpo.items || []).map((i) => [i.posId, i]));
      console.log(`  · 13: historial → ${json(h.cuerpo.items?.map((i) => [i.posId, i.estado, i.transferenciaEstado, i.itemCount]))}`);
      ok("13: trae los cuatro, el más nuevo arriba", json(h.cuerpo.items?.map((i) => i.posId)) === json([pEnCurso, pCancelado, pRecibido, pCamino]), json(h.cuerpo.items?.map((i) => i.posId)));
      ok("13: el cancelado está, como Cancelado", porId[pCancelado]?.estado === "Cancelado", json(porId[pCancelado]));
      ok("13: el recibido trae su transferencia Recibida", porId[pRecibido]?.estado === "Enviado" && porId[pRecibido]?.transferenciaEstado === "Recibida", json(porId[pRecibido]));
      ok("13: el en camino trae su transferencia Enviada", porId[pCamino]?.estado === "Enviado" && porId[pCamino]?.transferenciaEstado === "Enviada", json(porId[pCamino]));
      ok("13: el en curso sigue Solicitado", porId[pEnCurso]?.estado === "Solicitado");
      // Los que se piden por estado siguen andando, y "Cancelado" también.
      const soloCancelados = await historialH("page=1&pageSize=50&estado=Cancelado");
      ok("13: ?estado=Cancelado trae solo el cancelado", json(soloCancelados.cuerpo.items?.map((i) => i.posId)) === json([pCancelado]), json(soloCancelados.cuerpo));
      guardar("historialIds", { pEnCurso, pCancelado, pRecibido, pCamino, tRecibido, localId: H.local.id });

      // El detalle de cada uno (`/api/pedidos/historial/[id]`), como lo pide
      // la pantalla: Next le pasa el id en `params`, que es una promesa.
      {
      const detalle = async (id, cookie) => {
        const url = `${B}/pedidos/historial/${id}`;
        const req = new Request(url, { method: "GET", headers: { cookie } });
        Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
        const r = await R.detalle.GET(req, { params: Promise.resolve({ id: String(id) }) });
        return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
      };
      const dRecibido = await detalle(pRecibido, H.sPin);
      const dCancelado = await detalle(pCancelado, H.sPin);
      const dCamino = await detalle(pCamino, H.sPin);
      const dEnCurso = await detalle(pEnCurso, H.sPin);
      console.log(`  · 13: detalle del recibido → ${json({ ...dRecibido.cuerpo.pedido, items: dRecibido.cuerpo.pedido?.items?.map((i) => [i.nombre, i.sugerido, i.unidadSugerida]) })}`);
      ok("13: el detalle del recibido, con su transferencia Recibida y su fecha", dRecibido.status === 200 && dRecibido.cuerpo.pedido?.transferencia?.id === tRecibido && dRecibido.cuerpo.pedido.transferencia.estado === "Recibida" && !!dRecibido.cuerpo.pedido.transferencia.fechaRecepcion, json(dRecibido));
      ok("13: el detalle del recibido trae sus dos productos con la forma del carrito", dRecibido.cuerpo.pedido?.items?.length === 2 && dRecibido.cuerpo.pedido.items.every((i) => i.productoLocalId && i.nombre && "imagenUrl" in i && "modoEnvio" in i), json(dRecibido.cuerpo.pedido?.items));
      ok("13: el detalle del cancelado, con la fecha en que se canceló", dCancelado.status === 200 && dCancelado.cuerpo.pedido?.estado === "Cancelado" && !!dCancelado.cuerpo.pedido.canceladoAt && dCancelado.cuerpo.pedido.transferencia === null, json(dCancelado));
      ok("13: el detalle del en camino", dCamino.status === 200 && dCamino.cuerpo.pedido?.transferencia?.estado === "Enviada", json(dCamino));
      ok("13: el detalle del en curso dice que el depósito lo empezó", dEnCurso.status === 200 && dEnCurso.cuerpo.pedido?.estado === "Solicitado" && dEnCurso.cuerpo.pedido.depositoEmpezo === true, json(dEnCurso));
      // Otro local no lo puede abrir: ni el de otro grupo, ni el principal, ni
      // el depósito del grupo (que no es un local).
      const deOtro = await detalle(pRecibido, P.sPin);
      const delPrincipal = await detalle(pRecibido, S.conPin);
      const delDepositoH = await detalle(pRecibido, sDepoH);
      const inexistente = await detalle(999999999, H.sPin);
      console.log(`  · 13: detalle ajeno → otro local ${deOtro.status}, principal ${delPrincipal.status}, depósito ${delDepositoH.status}, inexistente ${inexistente.status}`);
      ok("13: otro local no abre el detalle (404)", deOtro.status === 404 && !deOtro.cuerpo.pedido, json(deOtro));
      ok("13: el local principal tampoco (404)", delPrincipal.status === 404 && !delPrincipal.cuerpo.pedido, json(delPrincipal));
      ok("13: el depósito no ve el historial de un local (403)", delDepositoH.status === 403, json(delDepositoH));
      ok("13: uno que no existe, 404", inexistente.status === 404, json(inexistente));
      guardar("detalleRecibido", dRecibido);
      guardar("detalleCancelado", dCancelado);
      guardar("detalleCamino", dCamino);
      guardar("detalleEnCurso", dEnCurso);
      guardar("detalleDeOtroLocal", deOtro);
      }

      // Un historial largo, de verdad: el local de la sección 9 hizo decenas de
      // pedidos en las carreras. Todas sus páginas de a 50, como las pide la
      // pantalla.
      const largo = [await pedir(R.historial, "GET", `${B}/pedidos/historial?page=1&pageSize=50`, P.sPin)];
      for (let p = 2; p <= largo[0].cuerpo.totalPages; p++) {
        largo.push(await pedir(R.historial, "GET", `${B}/pedidos/historial?page=${p}&pageSize=50`, P.sPin));
      }
      console.log(`  · 13: historial largo → ${largo[0].cuerpo.total} pedidos en ${largo.length} páginas de 50`);
      ok("13: el historial largo pasa de 50", largo[0].cuerpo.total > 50 && largo.length >= 2, json({ total: largo[0].cuerpo.total }));
      guardar("historialLargo", largo);
    }

    seccion("14. El depósito prepara un pedido: revisar, corregir, agregar y enviar");
    {
      // El lado del depósito, por sus rutas de siempre (`/api/pos-transferencias`).
      // Un local propio pide cinco renglones —uno por bulto— y el depósito los
      // decide como la pantalla del celular: "va completo" en dos, uno a menos,
      // uno a 0 y un producto que el local no pidió. Después lo envía y el local
      // empieza a recibirlo, para tener tarjetas REALES de la recepción.
      const { vaCompleto, NO_HAY } = await import("../../lib/pedidos/revisionDeLinea.js");
      const RD = {
        solicitados: await import("../../app/api/pos-transferencias/solicitados/route.js"),
        detalle: await import("../../app/api/pos-transferencias/detalle/route.js"),
        agregarItem: await import("../../app/api/pos-transferencias/agregarItem/route.js"),
        recepcion: await import("../../app/api/transferencias/detalle/route.js"),
        revisar: await import("../../app/api/transferencias/revisar-producto/route.js"),
      };
      const D = await armarLocal("Grupo depósito", [
        "ACEITE", "ARROZ", "FIDEOS", "YERBA",
        { nombre: "AGUA X6", extra: { unidad_medida: "pack", factor_pack: 6 } },
        "AZUCAR", "SAL",
      ]);
      for (const id of Object.values(D.ids)) await c.stockLocal.create({ data: { localId: D.deposito.id, productoId: id, cantidad: 1000 } });
      // El cliente del depósito vinculado al local, como lo deja Clientes: es lo
      // que hace que el local sea destino de una transferencia
      // (`lib/transferencias/destinosDeTransferencia.js`).
      const grupoIdD = (await c.grupoLocal.findFirst({ where: { localId: D.local.id }, select: { grupoId: true } })).grupoId;
      await c.cliente.create({ data: { grupoId: grupoIdD, localId: D.deposito.id, nombre: `${D.local.nombre} (interno)`, localVinculadoId: D.local.id } });
      const cuentaDepoD = await c.usuario.create({
        data: { nombre: "Depósito Marta", email: `deposito-prepara-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: D.deposito.id },
      });
      // Con su operaria y el PIN puesto, como trabaja un depósito de verdad: sin
      // operario, la app lo manda a /bloqueo-operador.
      const operariaDepo = await c.operadorLocal.create({ data: { nombre: "Marta", pinHash: "x", localId: D.deposito.id } });
      const sDepo = `${sesionDe(cuentaDepoD, D.deposito.id)}; erpazul_operador_activo=${jwt.sign({ operadorId: operariaDepo.id, nombre: operariaDepo.nombre, localId: D.deposito.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
      const solicitadosD = () => pedir(RD.solicitados, "GET", `${B}/pos-transferencias/solicitados`, sDepo);
      const detalleD = (posId) => pedir(RD.detalle, "GET", `${B}/pos-transferencias/detalle?posId=${posId}`, sDepo);
      // Cada escritura del depósito queda anotada con lo que se mandó y lo que
      // contestó la ruta: el arnés de la pantalla de preparar contesta con
      // ESTAS respuestas, no con unas escritas a mano.
      const escrituras = [];
      const editarD = async (body) => {
        const r = await pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepo, body);
        escrituras.push({ ruta: "/api/pos-transferencias/detalle/editar", cuerpo: body, respuesta: r });
        return r;
      };
      const lineaDe = (det, nombre) => det.cuerpo.item.detalles.find((d) => d.productoNombre === nombre);
      const deEste = (sol, posId) => (sol.cuerpo.items || []).find((i) => i.id === posId);
      const solicitarD = async () => {
        const carritoD = await carrito(D.sPin);
        const r = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, D.sPin, { posId: carritoD.cuerpo.posId });
        if (!r.cuerpo.ok) throw new Error(`no se pudo enviar: ${json(r)}`);
        return carritoD.cuerpo.posId;
      };

      // ── El local pide cinco renglones, uno por bulto ──────────────────────
      for (const [nombre, cantidad, unidad] of [["ACEITE", 2], ["ARROZ", 3], ["FIDEOS", 1], ["YERBA", 4], ["AGUA X6", 2, "BULTO"]]) {
        const r = await D.fijar(D.ids[nombre], cantidad, unidad);
        ok(`14: el local pide ${cantidad} ${nombre}`, r.cuerpo.ok === true, json(r));
      }
      const p1 = await solicitarD();

      const solNuevo = await solicitadosD();
      guardar("depositoSolicitadosNuevo", solNuevo);
      const nuevo = deEste(solNuevo, p1);
      console.log(`  · 14: en la entrada → ${json(nuevo)}`);
      ok("14: el depósito lo ve en la entrada, Nuevo, con sus 5 renglones", nuevo?.depositoEmpezo === false && nuevo.revisados === 0 && nuevo.itemCount === 5 && nuevo.destinoNombre === D.local.nombre, json(nuevo));
      const detNuevo = await detalleD(p1);
      guardar("depositoDetalleNuevo", detNuevo);
      ok("14: el detalle trae los 5, ninguno revisado", detNuevo.cuerpo.item?.detalles?.length === 5 && detNuevo.cuerpo.item.detalles.every((d) => d.revisadoEn === null && d.preparado === 0), json(detNuevo.cuerpo.item?.detalles));
      const agua = lineaDe(detNuevo, "AGUA X6");
      // El local la pidió por bulto; el detalle del depósito le deduce "MIXTO"
      // (no usa `defaultModoEnvio` como el carrito). Por eso la pantalla lee la
      // unidad pedida y no el modo: ver `lib/pedidos/revisionDeLinea.js`.
      ok("14: el agua se pidió por bulto", agua?.unidadSugerida === "BULTO" && agua.factorPack === 6, json(agua));
      ok("14: el detalle le deduce MIXTO al pack", agua?.modoEnvio === "MIXTO", json(agua));

      // ── Primero una línea a 0: eso solo ya lo empieza ─────────────────────
      const yerba0 = await editarD({ detalleId: lineaDe(detNuevo, "YERBA").detalleId, preparado: 0, unidadPreparada: "UNIDAD" });
      ok("14: la yerba va 0, decidido", yerba0.cuerpo.ok === true && yerba0.cuerpo.item.preparado === 0 && yerba0.cuerpo.item.revisadoEn != null, json(yerba0));
      const solTrasCero = deEste(await solicitadosD(), p1);
      ok("14: con una línea en 0 ya está empezado, 1 de 5", solTrasCero?.depositoEmpezo === true && solTrasCero.revisados === 1, json(solTrasCero));
      const localTarde = await D.fijar(D.ids.ACEITE, 5);
      ok("14: el local ya no puede cambiarlo (409)", localTarde.status === 409, json(localTarde));

      // ── El agua, corregida a 1 bulto y 3 sueltas, como la guarda la hoja ──
      // Un número y una unidad: 9 UNIDAD. Después va completo (la corrección
      // queda en `escrituras`, para la hoja de la pantalla).
      const aguaSueltas = await editarD({ detalleId: lineaDe(detNuevo, "AGUA X6").detalleId, preparado: 9, unidadPreparada: "UNIDAD" });
      ok("14: el agua, 1 bulto y 3 sueltas: 9 UNIDAD", aguaSueltas.cuerpo.ok === true && aguaSueltas.cuerpo.item.preparado === 9 && aguaSueltas.cuerpo.item.unidadPreparada === "UNIDAD", json(aguaSueltas));
      guardar("depositoDetalleAguaConSueltas", await detalleD(p1));

      // ── Va completo en dos, uno a menos, y uno que no pidió ───────────────
      for (const nombre of ["ACEITE", "AGUA X6"]) {
        const l = lineaDe(detNuevo, nombre);
        const r = await editarD({ detalleId: l.detalleId, ...vaCompleto(l) });
        ok(`14: ${nombre} va completo`, r.cuerpo.ok === true && r.cuerpo.item.preparado === l.sugerido && r.cuerpo.item.unidadPreparada === l.unidadSugerida, json(r));
      }
      // ── Volver a pendiente (2026-10-28): el aceite, y de nuevo completo ───
      // Lo que manda la hoja de la pantalla. El local no puede (el pedido está
      // Solicitado, como escribir lo preparado); el depósito sí, y la línea
      // queda como recién pedida: sin decidir, sin cantidad y sin unidad.
      const aceiteNuevo = lineaDe(detNuevo, "ACEITE");
      const localPendiente = await pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, D.sPin, { detalleId: aceiteNuevo.detalleId, pendiente: true });
      ok("14: el local no puede volver a pendiente una línea (403)", localPendiente.status === 403 && localPendiente.cuerpo.ok === false, json(localPendiente));
      const aceitePendiente = await editarD({ detalleId: aceiteNuevo.detalleId, pendiente: true });
      ok("14: el aceite vuelve a pendiente", aceitePendiente.cuerpo.ok === true && aceitePendiente.cuerpo.item.preparado === 0 && aceitePendiente.cuerpo.item.revisadoEn === null && aceitePendiente.cuerpo.item.unidadPreparada === null, json(aceitePendiente));
      const solTrasPendiente = deEste(await solicitadosD(), p1);
      ok("14: la entrada lo cuenta sin revisar: 2 de 5", solTrasPendiente?.revisados === 2, json(solTrasPendiente));
      // "No hay" (2026-10-28): el aceite en 0 decidido, y de vuelta a pendiente.
      const aceiteNoHay = await editarD({ detalleId: aceiteNuevo.detalleId, ...NO_HAY });
      ok("14: no hay aceite: revisado en 0", aceiteNoHay.cuerpo.ok === true && aceiteNoHay.cuerpo.item.preparado === 0 && aceiteNoHay.cuerpo.item.revisadoEn != null, json(aceiteNoHay));
      ok("14: la entrada lo cuenta revisado: 3 de 5", deEste(await solicitadosD(), p1)?.revisados === 3);
      ok("14: el aceite sin \"no hay\" vuelve a pendiente", (await editarD({ detalleId: aceiteNuevo.detalleId, pendiente: true })).cuerpo.item?.revisadoEn === null);
      ok("14: el aceite va completo otra vez", (await editarD({ detalleId: aceiteNuevo.detalleId, ...vaCompleto(aceiteNuevo) })).cuerpo.ok === true);
      const arroz = await editarD({ detalleId: lineaDe(detNuevo, "ARROZ").detalleId, preparado: 1, unidadPreparada: "UNIDAD" });
      ok("14: el arroz va 1 de 3", arroz.cuerpo.ok === true && arroz.cuerpo.item.preparado === 1, json(arroz));
      // Buscar en el catálogo del depósito lo que el local no pidió, como la
      // pantalla (la lógica de `BuscadorManual`).
      const buscarRuta = await import("../../app/api/pos-transferencias/buscarProductos/route.js");
      const buscado = await pedir(buscarRuta, "GET", `${B}/pos-transferencias/buscarProductos?q=AZUC&origenId=${D.deposito.id}`, sDepo);
      guardar("depositoBuscarAzucar", buscado);
      ok("14: buscar 'AZUC' en el depósito encuentra el azúcar", (buscado.cuerpo.items || []).some((p) => p.productoLocalId === D.ids.AZUCAR), json(buscado.cuerpo).slice(0, 300));
      const azucar = await pedir(RD.agregarItem, "POST", `${B}/pos-transferencias/agregarItem`, sDepo, { posId: p1, productoLocalId: D.ids.AZUCAR, cantidad: 1, tipo: "manual" });
      escrituras.push({ ruta: "/api/pos-transferencias/agregarItem", cuerpo: { posId: p1, productoLocalId: D.ids.AZUCAR, cantidad: 1, tipo: "manual" }, respuesta: azucar });
      ok("14: el depósito agrega azúcar, que el local no pidió", azucar.cuerpo.ok === true && azucar.cuerpo.item.sugerido === 0 && azucar.cuerpo.item.preparado === 1, json(azucar));

      const detTrabajando = await detalleD(p1);
      guardar("depositoDetalleTrabajando", detTrabajando);
      const solTrabajando = await solicitadosD();
      guardar("depositoSolicitadosTrabajando", solTrabajando);
      const trabajando = deEste(solTrabajando, p1);
      ok("14: en la entrada, Preparando · 5 de 6", trabajando?.depositoEmpezo === true && trabajando.revisados === 5 && trabajando.itemCount === 6, json(trabajando));
      ok("14: el fideo es el único sin revisar", json(detTrabajando.cuerpo.item.detalles.filter((d) => d.revisadoEn == null && d.preparado === 0).map((d) => d.productoNombre)) === json(["FIDEOS"]), json(detTrabajando.cuerpo.item.detalles));

      const fideos = lineaDe(detTrabajando, "FIDEOS");
      ok("14: el fideo va completo", (await editarD({ detalleId: fideos.detalleId, ...vaCompleto(fideos) })).cuerpo.ok === true);
      const detListo = await detalleD(p1);
      guardar("depositoDetalleListo", detListo);

      // ── Enviar: la transferencia lleva lo decidido, y la yerba no viaja ────
      const envio = await pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, sDepo, { posId: p1 });
      guardar("depositoEnviar", envio);
      ok("14: se envía", envio.cuerpo.ok === true, json(envio).slice(0, 400));
      const pendienteEnviado = await pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepo, { detalleId: fideos.detalleId, pendiente: true });
      ok("14: enviado, ya no se vuelve a pendiente", pendienteEnviado.status === 400 && pendienteEnviado.cuerpo.ok === false, json(pendienteEnviado));
      const tId = envio.cuerpo.item?.id;
      // `cantidad`, `cantidadPresentada` y la unidad en que salió. Este camino
      // guarda la cantidad en la unidad preparada: 2 BULTO es 2, no 12.
      const lineasT = await c.transferenciaDetalle.findMany({
        where: { transferenciaId: tId },
        include: { producto: { include: { base: { select: { nombre: true } } } } },
        orderBy: { id: "asc" },
      });
      const viajo = Object.fromEntries(
        lineasT.map((l) => [l.producto?.base?.nombre ?? l.producto?.nombre, [Number(l.cantidad), Number(l.cantidadPresentada ?? l.cantidad), l.unidadEnviada]])
      );
      console.log(`  · 14: la transferencia #${tId} lleva → ${json(viajo)}`);
      // Por producto, sin depender del orden de las líneas: comparar el JSON de
      // un objeto armado en el orden en que vinieron daba rojo según el orden.
      const ordenado = (o) => json(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      ok("14: la transferencia lleva aceite 2, arroz 1, fideos 1, agua 2 bultos y azúcar 1; sin yerba",
        ordenado(viajo) === ordenado({ ACEITE: [2, 2, "UNIDAD"], ARROZ: [1, 1, "UNIDAD"], FIDEOS: [1, 1, "UNIDAD"], "AGUA X6": [2, 2, "BULTO"], AZUCAR: [1, 1, "UNIDAD"] }),
        json(viajo));
      const solTrasEnviar = await solicitadosD();
      guardar("depositoSolicitadosTrasEnviar", solTrasEnviar);
      ok("14: la entrada ya no lo muestra", !deEste(solTrasEnviar, p1), json(solTrasEnviar.cuerpo.items?.map((i) => i.id)));

      // ── La recepción del local, para las tarjetas reales de la recepción ──
      const recAntes = await pedir(RD.recepcion, "GET", `${B}/transferencias/detalle?id=${tId}`, D.sPin);
      guardar("recepcionAntes", recAntes);
      ok("14: el local ve la transferencia para recibir", recAntes.cuerpo.ok === true && (recAntes.cuerpo.item?.items?.length ?? 0) === 5, json(recAntes).slice(0, 300));
      const lineaRec = (nombre) => recAntes.cuerpo.item.items.find((d) => d.nombre === nombre);
      const coincide = lineaRec("ACEITE");
      const rCoincide = await pedir(RD.revisar, "POST", `${B}/transferencias/revisar-producto`, D.sPin, { transferenciaId: tId, detalleId: coincide.id, recibido: Number(coincide.cantidad), motivoPrincipal: null });
      ok("14: el local da el aceite por coincidente", rCoincide.cuerpo.ok === true, json(rCoincide).slice(0, 300));
      const falta = lineaRec("ARROZ");
      const rFalta = await pedir(RD.revisar, "POST", `${B}/transferencias/revisar-producto`, D.sPin, { transferenciaId: tId, detalleId: falta.id, recibido: 0, motivoPrincipal: "Faltante" });
      ok("14: el local corrige el arroz a 0, Faltante", rFalta.cuerpo.ok === true, json(rFalta).slice(0, 300));
      const recDespues = await pedir(RD.recepcion, "GET", `${B}/transferencias/detalle?id=${tId}`, D.sPin);
      guardar("recepcionRevisada", recDespues);

      // ── El otro caso: el local suma antes de que el depósito empiece ──────
      ok("14b: el local pide aceite", (await D.fijar(D.ids.ACEITE, 1)).cuerpo.ok === true);
      const p2 = await solicitarD();
      const antesDeSumar = await detalleD(p2);
      guardar("depositoDetalleAntesDeSumar", antesDeSumar);
      const suma = await D.fijar(D.ids.SAL, 2);
      ok("14b: sin empezar, el local suma sal", suma.cuerpo.ok === true, json(suma));
      const trasSumar = await detalleD(p2);
      guardar("depositoDetalleTrasSumar", trasSumar);
      ok("14b: al volver a leer, la sal aparece sin revisar", antesDeSumar.cuerpo.item.detalles.length === 1 && trasSumar.cuerpo.item.detalles.length === 2 && lineaDe(trasSumar, "SAL")?.revisadoEn === null, json(trasSumar.cuerpo.item?.detalles));
      const solSumado = await solicitadosD();
      guardar("depositoSolicitadosSumado", solSumado);
      ok("14b: en la entrada sigue Nuevo, ahora con 2", deEste(solSumado, p2)?.depositoEmpezo === false && deEste(solSumado, p2)?.itemCount === 2, json(deEste(solSumado, p2)));
      // Quitar (la computadora) devuelve la línea a "sin decidir": no queda como
      // un "va 0" que no viajaría.
      const quitarRuta = await import("../../app/api/pos-transferencias/detalle/quitar/route.js");
      const sal = lineaDe(trasSumar, "SAL");
      ok("14b: el depósito prepara la sal", (await editarD({ detalleId: sal.detalleId, ...vaCompleto(sal) })).cuerpo.ok === true);
      const quitada = await pedir(quitarRuta, "POST", `${B}/pos-transferencias/detalle/quitar`, sDepo, { detalleId: sal.detalleId });
      const salQuitada = lineaDe(await detalleD(p2), "SAL");
      ok("14b: quitada, la sal vuelve a sin decidir", quitada.cuerpo.accion === "devuelto_a_sugerido" && salQuitada?.preparado === 0 && salQuitada.revisadoEn === null, json({ quitada, salQuitada }));

      // ── 14c. Por peso (2026-10-28): el depósito carga KILOS, y viajan kilos ─
      // El local pide 2 salametros (en unidades: es de pieza) y 2 kg de queso
      // (a granel). El depósito pesa el salametro —1,853 kg, con los gramos—,
      // corrige el queso a 1,85 y lo deja completo, y envía.
      // Un local y un depósito propios: el de arriba tiene un pedido sin
      // empezar, y lo que pidiera el local caería en ése.
      const W = await armarLocal("Grupo peso", [
        // De pieza con su peso de referencia, y el depósito lo guarda por kilo.
        { nombre: "SALAMETRO", extra: { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 0.9, modoVentaDeposito: "PESO" } },
        { nombre: "QUESO", extra: { unidad_medida: "kg" } },
      ]);
      for (const id of Object.values(W.ids)) await c.stockLocal.create({ data: { localId: W.deposito.id, productoId: id, cantidad: 1000 } });
      const grupoIdW = (await c.grupoLocal.findFirst({ where: { localId: W.local.id }, select: { grupoId: true } })).grupoId;
      await c.cliente.create({ data: { grupoId: grupoIdW, localId: W.deposito.id, nombre: `${W.local.nombre} (interno)`, localVinculadoId: W.local.id } });
      const cuentaDepoW = await c.usuario.create({
        data: { nombre: "Depósito Peso", email: `deposito-peso-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: W.deposito.id },
      });
      const operariaW = await c.operadorLocal.create({ data: { nombre: "Marta", pinHash: "x", localId: W.deposito.id } });
      const sDepoW = `${sesionDe(cuentaDepoW, W.deposito.id)}; erpazul_operador_activo=${jwt.sign({ operadorId: operariaW.id, nombre: operariaW.nombre, localId: W.deposito.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
      const editarW = async (body) => {
        const r = await pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepoW, body);
        escrituras.push({ ruta: "/api/pos-transferencias/detalle/editar", cuerpo: body, respuesta: r });
        return r;
      };
      ok("14c: el local pide 2 SALAMETRO", (await W.fijar(W.ids.SALAMETRO, 2)).cuerpo.ok === true);
      ok("14c: el local pide 2 QUESO", (await W.fijar(W.ids.QUESO, 2)).cuerpo.ok === true);
      const carritoW = await carrito(W.sPin);
      const solW = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, W.sPin, { posId: carritoW.cuerpo.posId });
      ok("14c: el local lo envía", solW.cuerpo.ok === true, json(solW));
      const p3 = carritoW.cuerpo.posId;
      const detPeso = await pedir(RD.detalle, "GET", `${B}/pos-transferencias/detalle?posId=${p3}`, sDepoW);
      guardar("depositoDetallePeso", detPeso);
      const salametro = lineaDe(detPeso, "SALAMETRO");
      const queso = lineaDe(detPeso, "QUESO");
      ok("14c: los dos se cargan en kilos; el salametro es de pieza y el queso no", salametro?.seCargaEnKilos === true && salametro.esFiambre === true && queso?.seCargaEnKilos === true && queso.esFiambre === false, json({ salametro, queso }));
      ok("14c: lo que no es por peso no se carga en kilos", lineaDe(trasSumar, "ACEITE")?.seCargaEnKilos === false, json(lineaDe(trasSumar, "ACEITE")));
      // "No hay" también para lo que se pesa: el mismo 0 decidido. Después se pesa.
      const salametroNoHay = await editarW({ detalleId: salametro.detalleId, ...NO_HAY });
      ok("14c: no hay salametro: revisado en 0", salametroNoHay.cuerpo.ok === true && salametroNoHay.cuerpo.item.preparado === 0 && salametroNoHay.cuerpo.item.revisadoEn != null, json(salametroNoHay));
      const pesado = await editarW({ detalleId: salametro.detalleId, preparado: 1.853, unidadPreparada: "UNIDAD" });
      ok("14c: el salametro pesado guarda los gramos: 1,853", pesado.cuerpo.ok === true && pesado.cuerpo.item.preparado === 1.853, json(pesado));
      const quesoMenos = await editarW({ detalleId: queso.detalleId, preparado: 1.85, unidadPreparada: "UNIDAD" });
      ok("14c: el queso corregido a 1,85", quesoMenos.cuerpo.ok === true && quesoMenos.cuerpo.item.preparado === 1.85, json(quesoMenos));
      ok("14c: el queso va completo: 2 kg", (await editarW({ detalleId: queso.detalleId, ...vaCompleto(queso) })).cuerpo.ok === true);
      const stockDePeso = async () =>
        Object.fromEntries((await c.stockLocal.findMany({ where: { localId: W.deposito.id, productoId: { in: [W.ids.SALAMETRO, W.ids.QUESO] } } })).map((s) => [s.productoId, Number(s.cantidad)]));
      const stockAntesPeso = await stockDePeso();
      const envioPeso = await pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, sDepoW, { posId: p3 });
      ok("14c: se envía", envioPeso.cuerpo.ok === true, json(envioPeso).slice(0, 400));
      const tPeso = envioPeso.cuerpo.item?.id;
      const lineasPeso = await c.transferenciaDetalle.findMany({
        where: { transferenciaId: tPeso },
        include: { producto: { include: { base: { select: { nombre: true } } } } },
        orderBy: { id: "asc" },
      });
      const stockTrasPeso = await stockDePeso();
      // Lo que quedó en la base, tal cual: lo lee el candado del servidor
      // (`lib/pedidos/preparacionPorPeso.test.mjs`).
      const viajePeso = {
        lineas: lineasPeso.map((l) => ({
          nombre: l.producto?.base?.nombre,
          cantidad: Number(l.cantidad),
          cantidadPresentada: Number(l.cantidadPresentada),
          unidadEnviada: l.unidadEnviada,
          presentacionEnvio: l.presentacionEnvio,
        })),
        stockDelDeposito: {
          SALAMETRO: { antes: stockAntesPeso[W.ids.SALAMETRO], despues: stockTrasPeso[W.ids.SALAMETRO] },
          QUESO: { antes: stockAntesPeso[W.ids.QUESO], despues: stockTrasPeso[W.ids.QUESO] },
        },
      };
      guardar("depositoViajePeso", viajePeso);
      const viajaKg = (n, kg) => viajePeso.lineas.some((l) => l.nombre === n && l.cantidad === kg && l.cantidadPresentada === kg && l.presentacionEnvio === "KG" && l.unidadEnviada === "UNIDAD");
      ok("14c: la transferencia lleva 1,853 KG de salametro y 2 KG de queso", viajaKg("SALAMETRO", 1.853) && viajaKg("QUESO", 2) && viajePeso.lineas.length === 2, json(viajePeso.lineas));
      ok("14c: el stock del depósito baja en kilos", Math.abs(viajePeso.stockDelDeposito.SALAMETRO.antes - viajePeso.stockDelDeposito.SALAMETRO.despues - 1.853) < 1e-9 && viajePeso.stockDelDeposito.QUESO.antes - viajePeso.stockDelDeposito.QUESO.despues === 2, json(viajePeso.stockDelDeposito));
      const recPeso = await pedir(RD.recepcion, "GET", `${B}/transferencias/detalle?id=${tPeso}`, W.sPin);
      guardar("recepcionPeso", recPeso);
      ok("14c: el local la ve para recibir, en KG", recPeso.cuerpo.ok === true && (recPeso.cuerpo.item?.items || []).every((d) => d.presentacionEnvio === "KG"), json(recPeso).slice(0, 400));
      // ── Lo que leen las pantallas del depósito al entrar ─────────────────
      // El depósito y un admin (permiso "*", sin local), firmados como el login.
      const opcionesRuta = await import("../../app/api/pos-transferencias/opciones/route.js");
      const sAdmin = `erpazul_sesion=${jwt.sign(
        { id: cuentaDepoD.id, nombre: "Admin pruebas", email: cuentaDepoD.email, rolId: cuentaDepoD.rolId, rolNombre: "ADMIN", permisos: ["*"], esDuenoLocal: false, localId: null, esDeposito: false },
        process.env.AUTH_SECRET,
        { expiresIn: "1h" }
      )}`;
      const meDepo = await pedir(R.me, "GET", `${B}/me`, sDepo);
      const opcionesDepo = await pedir(opcionesRuta, "GET", `${B}/pos-transferencias/opciones`, sDepo);
      guardar("depositoMe", meDepo);
      guardar("depositoOpciones", opcionesDepo);
      guardar("depositoOperadorMe", await pedir(R.operadorMe, "GET", `${B}/operador/me`, sDepo));
      const opcionesLocal = await pedir(opcionesRuta, "GET", `${B}/pos-transferencias/opciones`, D.sPin);
      guardar("depositoOpcionesDelLocal", opcionesLocal);
      ok("14: un local entra en modo local", opcionesLocal.cuerpo.modo === "local", json(opcionesLocal.cuerpo).slice(0, 200));
      ok("14: el depósito entra en modo depósito, con su local de destino", opcionesDepo.cuerpo.modo === "deposito" && opcionesDepo.cuerpo.destinos?.some((l) => l.id === D.local.id), json(opcionesDepo.cuerpo).slice(0, 300));
      const meAdmin = await pedir(R.me, "GET", `${B}/me`, sAdmin);
      const opcionesAdmin = await pedir(opcionesRuta, "GET", `${B}/pos-transferencias/opciones`, sAdmin);
      const solAdmin = await pedir(RD.solicitados, "GET", `${B}/pos-transferencias/solicitados`, sAdmin);
      ok("14: el admin entra en modo admin y ve el pedido de este local", opcionesAdmin.cuerpo.modo === "admin" && !!deEste(solAdmin, p2), json({ modo: opcionesAdmin.cuerpo.modo, pedidos: solAdmin.cuerpo.items?.length }));
      console.log(`  · 14: el admin ve ${solAdmin.cuerpo.items?.length} pedidos y ${opcionesAdmin.cuerpo.grupos?.length} grupos`);
      guardar("depositoAdminMe", meAdmin);
      // El admin ve TODOS los grupos y TODOS los pedidos de la base: con las
      // corridas acumuladas son cientos. Se guardan los diez más nuevos de cada
      // uno, tal cual vinieron, más el de este grupo si no estaba entre ellos.
      const grupoD = opcionesAdmin.cuerpo.grupos?.find((g) => g.locales?.some((l) => l.id === D.local.id));
      const ultimosGrupos = (opcionesAdmin.cuerpo.grupos || []).slice(0, 10);
      guardar("depositoAdminOpciones", { ...opcionesAdmin, cuerpo: { ...opcionesAdmin.cuerpo, grupos: ultimosGrupos.includes(grupoD) ? ultimosGrupos : [grupoD, ...ultimosGrupos].filter(Boolean) } });
      guardar("depositoAdminSolicitados", { ...solAdmin, cuerpo: { ...solAdmin.cuerpo, items: (solAdmin.cuerpo.items || []).slice(0, 10) } });
      guardar("depositoEscrituras", escrituras);

      // ── El 409 de enviar, de verdad: el local suma mientras sale ──────────
      // `enviar` lee las líneas para validar el stock AFUERA de su transacción
      // y las vuelve a leer adentro, con el bloqueo. Si el local sumó en el
      // medio, no despacha una lista vieja: 409. Se larga el envío y, sin
      // esperarlo, el local suma —el pedido no está empezado, así que puede—.
      //
      // Es una carrera de verdad y a veces el envío gana (el 2026-10-23 pasó):
      // entonces sale ese pedido, el local arma otro y se prueba de nuevo, hasta
      // diez veces. Lo que se afirma es que, cuando el local suma en el medio,
      // el envío NO despacha la lista vieja.
      let envio409 = null;
      let pCarrera = p2;
      let intentos = 0;
      for (; intentos < 10; intentos++) {
        const enviando = pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, sDepo, { posId: pCarrera });
        const sumaEnElMedio = D.fijar(D.ids.SAL, 3 + intentos);
        const [r] = await Promise.all([enviando, sumaEnElMedio]);
        if (r.status === 409) {
          envio409 = r;
          break;
        }
        ok(`14b: el envío ganó la vuelta ${intentos + 1} y salió entero`, r.cuerpo.ok === true, json(r).slice(0, 200));
        // Lo que el local sumó cuando ya había salido fue a un borrador nuevo:
        // ése se envía para la vuelta siguiente.
        ok("14b: el local arma otro", (await D.fijar(D.ids.ACEITE, 1)).cuerpo.ok === true);
        pCarrera = (await carrito(D.sPin)).cuerpo.posId;
        await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, D.sPin, { posId: pCarrera });
      }
      console.log(`  · 14b: enviar con el local sumando en el medio → ${envio409?.status} en el intento ${intentos + 1}`);
      guardar("depositoEnviarMientrasElLocalSuma", envio409);
      guardar("depositoDetalleTrasElCambio", await detalleD(pCarrera));
      ok("14b: enviar con el local sumando en el medio da 409, y no sale", envio409?.status === 409 && (await c.posTransferencia.findUnique({ where: { id: pCarrera }, select: { estado: true } })).estado === "Solicitado", json(envio409));
      guardar("depositoIds", { p1, p2, transferenciaId: tId, local: D.local.nombre, deposito: D.deposito.nombre, pidio: "Cuenta Grupo depósito" });
    }

    seccion("15. El depósito cancela un pedido de local, empezado o no");
    {
      // Regla de Emanuel (2026-10-23): el depósito ORIGEN cancela un pedido
      // Solicitado, empezado o no; el local sigue sin poder cancelar uno
      // empezado; nadie de otro depósito ni de otro local puede; uno ya enviado
      // se maneja desde la transferencia. Y lo preparado no movió stock: se mide
      // el stock antes y después de cada cancelación.
      const RC = {
        detalle: await import("../../app/api/pos-transferencias/detalle/route.js"),
        solicitados: await import("../../app/api/pos-transferencias/solicitados/route.js"),
        opciones: await import("../../app/api/pos-transferencias/opciones/route.js"),
      };
      const C = await armarLocal("Grupo cancela depósito", ["ACEITE", "ARROZ", { nombre: "AGUA X6", extra: { unidad_medida: "pack", factor_pack: 6 } }]);
      for (const id of Object.values(C.ids)) await c.stockLocal.create({ data: { localId: C.deposito.id, productoId: id, cantidad: 1000 } });
      const grupoC = (await c.grupoLocal.findFirst({ where: { localId: C.local.id }, select: { grupoId: true } })).grupoId;
      await c.cliente.create({ data: { grupoId: grupoC, localId: C.deposito.id, nombre: `${C.local.nombre} (interno)`, localVinculadoId: C.local.id } });
      // Dos personas del depósito, cada una con su PIN: una cancela y otra envía.
      const deDeposito = async (nombre, deposito) => {
        const u = await c.usuario.create({
          data: { nombre, email: `${nombre.toLowerCase().replace(/\W+/g, "-")}-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: deposito.id },
        });
        const op = await c.operadorLocal.create({ data: { nombre, pinHash: "x", localId: deposito.id } });
        const s = `${sesionDe(u, deposito.id)}; erpazul_operador_activo=${jwt.sign({ operadorId: op.id, nombre: op.nombre, localId: deposito.id, _tipo: "operador", emitidoEn: Date.now() }, process.env.AUTH_SECRET)}`;
        return { u, s };
      };
      const marta = await deDeposito("Marta cancela", C.deposito);
      const lucas = await deDeposito("Lucas envía", C.deposito);
      // Otro grupo: su depósito y su local no son de este pedido.
      const O = await armarLocal("Grupo otro depósito", ["ACEITE"]);
      const otroDepo = await deDeposito("Otro depósito", O.deposito);

      const cancelarC = (s, posId) => pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, s, { posId });
      const enviarC = (s, posId) => pedir(enviar, "POST", `${B}/pos-transferencias/enviar`, s, { posId });
      const editarC = (s, body) => pedir(editar, "POST", `${B}/pos-transferencias/detalle/editar`, s, body);
      const detalleC = (posId) => pedir(RC.detalle, "GET", `${B}/pos-transferencias/detalle?posId=${posId}`, marta.s);
      const solicitadosC = () => pedir(RC.solicitados, "GET", `${B}/pos-transferencias/solicitados`, marta.s);
      const pedirC = async (cargas) => {
        for (const [nombre, cantidad, unidad] of cargas) {
          const r = await C.fijar(C.ids[nombre], cantidad, unidad);
          if (!r.cuerpo.ok) throw new Error(`no se pudo cargar ${nombre}: ${json(r)}`);
        }
        const car = await carrito(C.sPin);
        const r = await pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, C.sPin, { posId: car.cuerpo.posId });
        if (!r.cuerpo.ok) throw new Error(`no se pudo enviar: ${json(r)}`);
        return car.cuerpo.posId;
      };
      const empezar = async (posId) => {
        const l = (await detalleC(posId)).cuerpo.item.detalles[0];
        const r = await editarC(marta.s, { detalleId: l.detalleId, preparado: l.sugerido, unidadPreparada: l.unidadSugerida });
        if (!r.cuerpo.ok) throw new Error(`no se pudo empezar: ${json(r)}`);
      };
      /** El stock del depósito y del local, producto por producto. */
      const stock = async () =>
        json(
          (await c.stockLocal.findMany({ where: { localId: { in: [C.deposito.id, C.local.id] } }, select: { localId: true, productoId: true, cantidad: true }, orderBy: [{ localId: "asc" }, { productoId: "asc" }] }))
            .map((s) => [s.localId, s.productoId, Number(s.cantidad)])
        );
      const pedidoDe = (id) => c.posTransferencia.findUnique({ where: { id }, select: { estado: true, canceladoPorUserId: true, canceladoAt: true } });
      const transferenciasDe = (id) => c.transferencia.count({ where: { posTransferenciaId: id } });

      // ── Lo que lee la pantalla de preparar de este depósito ───────────────
      guardar("depositoCancelarMe", await pedir(R.me, "GET", `${B}/me`, marta.s));
      guardar("depositoCancelarOperadorMe", await pedir(R.operadorMe, "GET", `${B}/operador/me`, marta.s));
      guardar("depositoCancelarOpciones", await pedir(RC.opciones, "GET", `${B}/pos-transferencias/opciones`, marta.s));

      // ── a. Sin empezar: el depósito cancela ───────────────────────────────
      const pa = await pedirC([["ACEITE", 2]]);
      const stockA = await stock();
      const ca = await cancelarC(marta.s, pa);
      guardar("depositoCancelarSinEmpezar", ca);
      const ea = await pedidoDe(pa);
      ok("15a: el depósito cancela uno sin empezar", ca.status === 200 && ca.cuerpo.ok === true && ea.estado === "Cancelado", json({ ca, ea }));
      ok("15a: queda quién lo canceló y cuándo", ea.canceladoPorUserId === marta.u.id && !!ea.canceladoAt, json(ea));
      ok("15a: el stock no cambió", (await stock()) === stockA);

      // ── b. Empezado: el local no, otro depósito no, otro local no; el depósito sí
      const pb = await pedirC([["ACEITE", 2], ["AGUA X6", 1, "BULTO"]]);
      await empezar(pb);
      const stockB = await stock();
      guardar("depositoCancelarDetalle", await detalleC(pb));
      guardar("depositoCancelarSolicitados", await solicitadosC());
      const cbLocal = await cancelarC(C.sPin, pb);
      guardar("depositoCancelarElLocalEmpezado", cbLocal);
      ok("15b: el local no cancela uno empezado (409, como hoy)", cbLocal.status === 409 && cbLocal.cuerpo.error === "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local.", json(cbLocal));
      const cbOtroDepo = await cancelarC(otroDepo.s, pb);
      ok("15b: un usuario de OTRO depósito no puede (403)", cbOtroDepo.status === 403, json(cbOtroDepo));
      const cbOtroLocal = await cancelarC(O.sPin, pb);
      ok("15b: un usuario de otro local no puede (403)", cbOtroLocal.status === 403, json(cbOtroLocal));
      ok("15b: y sigue Solicitado", (await pedidoDe(pb)).estado === "Solicitado");
      const cb = await cancelarC(marta.s, pb);
      guardar("depositoCancelarEmpezado", cb);
      ok("15b: el depósito cancela el empezado", cb.status === 200 && cb.cuerpo.ok === true && (await pedidoDe(pb)).estado === "Cancelado", json(cb));
      ok("15b: el stock no cambió (lo preparado no lo movió)", (await stock()) === stockB, json({ antes: stockB, despues: await stock() }));
      ok("15b: no hay transferencia", (await transferenciasDe(pb)) === 0);
      const solDespues = await solicitadosC();
      guardar("depositoCancelarSolicitadosDespues", solDespues);
      ok("15b: ya no está en Pedidos de locales", !(solDespues.cuerpo.items || []).some((s) => s.id === pb), json(solDespues.cuerpo.items?.map((s) => s.id)));
      const otraVez = await cancelarC(marta.s, pb);
      ok("15b: cancelarlo otra vez da 404, como siempre", otraVez.status === 404, json(otraVez));

      // ── Lo que ve el local ────────────────────────────────────────────────
      guardar("depositoCanceloMeDelLocal", await pedir(R.me, "GET", `${B}/me`, C.sPin));
      guardar("depositoCanceloOperadorDelLocal", await pedir(R.operadorMe, "GET", `${B}/operador/me`, C.sPin));
      guardar("depositoCanceloOpcionesDelLocal", await pedir(R.opciones, "GET", `${B}/pedidos/opciones`, C.sPin));
      guardar("depositoCanceloCatalogoDelLocal", await pedir(R.catalogo, "GET", `${B}/pedidos/catalogo?page=1&pageSize=50`, C.sPin));
      const carritoLocal = await carrito(C.sPin);
      guardar("depositoCanceloCarritoDelLocal", carritoLocal);
      ok("15: el local ya no tiene un pedido en curso", carritoLocal.cuerpo.pendiente === null && (carritoLocal.cuerpo.items || []).length === 0, json(carritoLocal.cuerpo));
      const histLocal = await pedir(R.historial, "GET", `${B}/pedidos/historial?page=1&pageSize=50`, C.sPin);
      guardar("depositoCanceloHistorialDelLocal", histLocal);
      ok("15: en su historial, los dos cancelados", json(histLocal.cuerpo.items?.map((i) => [i.posId, i.estado])) === json([[pb, "Cancelado"], [pa, "Cancelado"]]), json(histLocal.cuerpo.items?.map((i) => [i.posId, i.estado])));
      const nuevo = await C.fijar(C.ids.ARROZ, 1);
      ok("15: y puede hacer un pedido nuevo", nuevo.cuerpo.ok === true && nuevo.cuerpo.posId !== pb && nuevo.cuerpo.posId !== pa, json(nuevo));
      await C.fijar(C.ids.ARROZ, 0);

      // ── c. Ya enviado: se maneja desde la transferencia ───────────────────
      const pcc = await pedirC([["ARROZ", 1]]);
      await empezar(pcc);
      ok("15c: Lucas lo envía", (await enviarC(lucas.s, pcc)).cuerpo.ok === true);
      const stockC = await stock();
      const ccc = await cancelarC(marta.s, pcc);
      guardar("depositoCancelarYaEnviado", ccc);
      ok("15c: cancelar uno enviado da 409, con el mensaje", ccc.status === 409 && ccc.cuerpo.error === "El pedido ya se envió. Se maneja desde la transferencia.", json(ccc));
      ok("15c: sigue Enviado, con su transferencia, y el stock no cambió", (await pedidoDe(pcc)).estado === "Enviado" && (await transferenciasDe(pcc)) === 1 && (await stock()) === stockC);

      // ── d. CARRERA: Marta cancela mientras Lucas envía ────────────────────
      // Las dos rutas toman el bloqueo del par y la fila: una pasa primero y la
      // otra encuentra el pedido ya decidido. Nunca las dos: cancelado Y con
      // transferencia. Y si ganó la cancelación, el stock no se movió.
      const VUELTAS = 20;
      const carrera = { vueltas: VUELTAS, cancelo: 0, envio: 0, ambas: 0, ninguna: 0, stockMovidoAlCancelar: 0, enviarDijoCancelado: 0, enviarDijoElLocalCambio: 0, respuestas: {} };
      for (let i = 0; i < VUELTAS; i++) {
        const p = await pedirC([["ACEITE", 1]]);
        await empezar(p);
        const antes = await stock();
        // El envío arranca primero. `enviar` valida el stock ANTES de tomar el
        // bloqueo, así que largadas juntas gana casi siempre la cancelación, y
        // con una demora de unos milisegundos gana casi siempre el envío. Las
        // vueltas pares salen juntas y las impares con demora (de 2 a 38 ms): la
        // carrera cae de los dos lados, y el mensaje del envío que perdió se mide
        // más de una vez (con todas demoradas, 1 de 20).
        const envia = enviarC(lucas.s, p);
        await new Promise((r) => setTimeout(r, i % 2 === 0 ? 0 : i * 2));
        const [rc, re] = await Promise.all([cancelarC(marta.s, p), envia]);
        const e = await pedidoDe(p);
        const t = await transferenciasDe(p);
        // Con el mensaje: lo que lee el que perdió.
        const clave = `cancelar ${rc.status}${rc.cuerpo.error ? ` "${rc.cuerpo.error}"` : ""} / enviar ${re.status}${re.cuerpo.error ? ` "${re.cuerpo.error}"` : ""}`;
        carrera.respuestas[clave] = (carrera.respuestas[clave] || 0) + 1;
        // El envío que perdió: qué le dijo la ruta (2026-10-23, "Este pedido
        // se canceló." y nunca "El local cambió…", que es falso).
        if (!re.cuerpo.ok) {
          if (re.status === 409 && re.cuerpo.error === "Este pedido se canceló.") carrera.enviarDijoCancelado++;
          if (/El local cambió/.test(re.cuerpo.error || "")) carrera.enviarDijoElLocalCambio++;
          if (!lectura.depositoEnviarPerdioContraCancelar) guardar("depositoEnviarPerdioContraCancelar", re);
        }
        if (e.estado === "Cancelado" && t > 0) carrera.ambas++;
        else if (e.estado === "Cancelado") {
          carrera.cancelo++;
          if ((await stock()) !== antes) carrera.stockMovidoAlCancelar++;
        } else if (e.estado === "Enviado" && t === 1) carrera.envio++;
        else carrera.ninguna++;
      }
      console.log(`  · 15d: carrera cancelar contra enviar → ${json(carrera)}`);
      guardar("depositoCarreraCancelarEnviar", carrera);
      ok("15d: nunca quedan las dos cosas (cancelado y con transferencia)", carrera.ambas === 0, json(carrera));
      ok("15d: cada vuelta terminó en una de las dos", carrera.cancelo + carrera.envio === VUELTAS && carrera.ninguna === 0, json(carrera));
      ok("15d: ninguna cancelación movió stock", carrera.stockMovidoAlCancelar === 0, json(carrera));
      ok("15d: el envío que perdió dice \"Este pedido se canceló.\", cada vez", carrera.cancelo > 0 && carrera.enviarDijoCancelado === carrera.cancelo, json(carrera));
      ok("15d: y nunca \"El local cambió…\"", carrera.enviarDijoElLocalCambio === 0, json(carrera));

      // ── e. Enviar uno que ya estaba cancelado: lo mismo, no un 404 mudo ───
      const pe = await pedirC([["ACEITE", 1]]);
      await empezar(pe);
      await cancelarC(marta.s, pe);
      const ee = await enviarC(lucas.s, pe);
      guardar("depositoEnviarYaCancelado", ee);
      ok("15e: enviar uno ya cancelado da 409 \"Este pedido se canceló.\"", ee.status === 409 && ee.cuerpo.error === "Este pedido se canceló.", json(ee));
      const eeAjeno = await enviarC(otroDepo.s, pe);
      ok("15e: a otro depósito no se le dice que se canceló", eeAjeno.status === 404, json(eeAjeno));
      guardar("depositoCancelarIds", { pa, pb, pcc, local: C.local.nombre, deposito: C.deposito.nombre });
    }
  }

  if (process.env.ESCRIBIR_FIXTURE_PEDIDOS) {
    const RUTA_FIXTURE = "app/modulos/pedidos/enviarCancelar.fixture.json";
    const previo = existsSync(RUTA_FIXTURE) ? JSON.parse(readFileSync(RUTA_FIXTURE, "utf8")) : {};
    // De la regla de 9e2f438 —el pedido enviado no se tocaba—: ya no las
    // produce la ruta, y un candado montado sobre ellas probaría lo que no pasa.
    for (const vieja of ["setCantidadConPedidoEnviado", "setCantidadConPedidoEnviadoCarrera", "carritoConPedidoEnviadoEnvio"]) delete previo[vieja];
    // Lo del depósito (sección 14) va a su propio archivo, al lado de sus
    // pantallas: `app/modulos/pos-transferencias/deposito.fixture.json`.
    const delDeposito = (k) => k.startsWith("deposito") || k.startsWith("recepcion");
    const deLaSeccion = (soloDeposito) => Object.fromEntries(Object.entries(lectura).filter(([k]) => delDeposito(k) === soloDeposito));
    writeFileSync(RUTA_FIXTURE, `${JSON.stringify({ ...previo, ...deLaSeccion(false) }, null, 2)}\n`);
    writeFileSync("app/modulos/pos-transferencias/deposito.fixture.json", `${JSON.stringify(deLaSeccion(true), null, 2)}\n`);
    console.log("  · fixtures escritos");
  }
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  await c.$disconnect().catch(() => {});
  try {
    const { default: prismaApp } = await import("../../lib/prisma.js");
    await prismaApp.$disconnect();
  } catch {
    // la app no llegó a construir su cliente
  }
}

console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
