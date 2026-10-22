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
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { writeFileSync } from "node:fs";

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

  if (process.env.ESCRIBIR_FIXTURE_PEDIDOS) {
    writeFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", `${JSON.stringify(lectura, null, 2)}\n`);
    console.log("  · fixture escrito");
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
