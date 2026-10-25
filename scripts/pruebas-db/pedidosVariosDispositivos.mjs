// PRUEBA DE BASE: VARIAS PERSONAS ARMANDO EL PEDIDO DEL MISMO LOCAL A LA VEZ.
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs scripts/pruebas-db/pedidosVariosDispositivos.mjs
//
// El escenario de Emanuel (2026-10-25): tres celulares, o celular y
// computadora, del mismo local, cada uno con SU sesión, cargando productos en
// el pedido al mismo tiempo, también con el pedido enviado y sumando. Llama a
// los HANDLERS reales —`set-cantidad`, `carrito`, `solicitar`,
// `sumar-al-enviado` y, del lado del depósito, `detalle/editar`— con tres
// cuentas distintas del mismo local (Ana, Beto y Caro), cada una con su PIN, y
// cuenta qué queda guardado. "A la vez" es `Promise.all`: las llamadas salen
// juntas, como dos toques en dos celulares, y se repite VUELTAS veces porque
// una carrera no sale siempre.
//
//   1. A carga X y B carga Y casi a la vez → ¿quedan los dos?
//   2. A y B cambian la cantidad del MISMO producto → ¿qué queda?
//   3. A tiene la pantalla abierta de antes, B agrega algo, A cambia otra
//      cosa → ¿lo de B sobrevive? (y ¿A lo ve al releer?)
//   4. A envía mientras B sigue cargando → ¿lo de B va al pedido enviado,
//      queda en un borrador nuevo o se pierde? Y con el depósito ya
//      preparando: ¿B recibe el aviso, o se guarda en silencio?
//   5. Lo mismo en modo sumar: A y B confirman "Agregar al pedido" a la vez.
//
// Lo escrito directo es la siembra —un grupo propio por caso, con su local, su
// depósito, las tres cuentas y sus operadoras, y los productos del depósito—,
// como lo dejan Locales, Usuarios y Productos. Todo lo del pedido va por sus
// rutas. Cada corrida siembra grupos nuevos: no toca lo que ya había.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const c = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");

const VUELTAS = Number(process.env.VUELTAS_CARRERA || 20);

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
const anotar = (t) => console.log(`  · ${t}`);

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "prueba-sesiones-pedidos-0123456789abcdef";

const R = {
  carrito: await import("../../app/api/pedidos/carrito/route.js"),
  setCantidad: await import("../../app/api/pedidos/set-cantidad/route.js"),
  sumar: await import("../../app/api/pedidos/sumar-al-enviado/route.js"),
  solicitar: await import("../../app/api/pos-transferencias/solicitar/route.js"),
  cancelar: await import("../../app/api/pos-transferencias/cancelar/route.js"),
  editar: await import("../../app/api/pos-transferencias/detalle/editar/route.js"),
};
const B = "http://ci/api";
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

const marca = Date.now();
const rolEnc =
  (await c.rol.findUnique({ where: { nombre: "ENCARGADO" } })) ??
  (await c.rol.create({ data: { nombre: "ENCARGADO", esSistema: true, permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } }));
const rolAdmin =
  (await c.rol.findUnique({ where: { nombre: "Admin" } })) ??
  (await c.rol.create({ data: { nombre: "Admin", esSistema: true, permisos: ["*"] } }));

function sesionDe(usuario, localId, rolNombre = "ENCARGADO", permisos = rolEnc.permisos) {
  return `erpazul_sesion=${jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rolId: usuario.rolId, rolNombre, permisos, esDuenoLocal: false, localId, esDeposito: false },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  )}`;
}

let grupos = 0;
/**
 * Un local con su depósito, tres personas del local —cada una con su cuenta,
 * su sesión y su PIN— y una del depósito, que es quien prepara.
 */
async function armarLocal(nombreGrupo, productos) {
  grupos += 1;
  const g = await c.grupo.create({ data: { nombre: `${nombreGrupo} ${marca}` } });
  await c.configuracionGrupo.create({ data: { grupoId: g.id } });
  const local = await c.local.create({ data: { nombre: `Mini ${nombreGrupo} ${marca}` } });
  const deposito = await c.local.create({ data: { nombre: `Depósito ${nombreGrupo} ${marca}`, es_deposito: true } });
  await c.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await c.grupoDeposito.create({ data: { grupoId: g.id, localId: deposito.id } });
  for (const l of [local, deposito]) await c.configuracionLocal.create({ data: { localId: l.id } });

  const persona = async (nombre) => {
    const cuenta = await c.usuario.create({
      data: { nombre: `Cuenta ${nombre}`, email: `${nombre.toLowerCase()}-${grupos}-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: local.id },
    });
    const op = await c.operadorLocal.create({ data: { nombre, pinHash: "x", localId: local.id } });
    const s = `${sesionDe(cuenta, local.id)}; erpazul_operador_activo=${jwt.sign(
      { operadorId: op.id, nombre, localId: local.id, _tipo: "operador", emitidoEn: Date.now() },
      process.env.AUTH_SECRET
    )}`;
    return {
      nombre,
      cuentaId: cuenta.id,
      fijar: (id, cantidad, unidad = "UNIDAD") => pedir(R.setCantidad, "POST", `${B}/pedidos/set-cantidad`, s, { productoLocalId: id, cantidad, unidad }),
      carrito: () => pedir(R.carrito, "GET", `${B}/pedidos/carrito`, s),
      solicitar: (posId) => pedir(R.solicitar, "POST", `${B}/pos-transferencias/solicitar`, s, { posId }),
      sumar: (posId, cambios) => pedir(R.sumar, "POST", `${B}/pedidos/sumar-al-enviado`, s, { posId, cambios }),
    };
  };
  const [A, Bp, C] = [await persona("Ana"), await persona("Beto"), await persona("Caro")];

  const ids = {};
  for (const [i, nombre] of productos.entries()) {
    const b = await c.productoBase.create({
      data: { grupoId: g.id, nombre, codigo_barra: `78${marca}`.slice(0, 10) + String(grupos * 10 + i).padStart(3, "0"), unidad_medida: "unidad", precio_costo: 600, precio_venta: 1000, redondeo_100: false, activo: true },
    });
    ids[nombre] = (await c.productoLocal.create({ data: { localId: deposito.id, baseId: b.id, activo: true, precio_costo: 600, precio_venta: 1000 } })).id;
  }

  const cuentaDepo = await c.usuario.create({
    data: { nombre: "Cuenta Depósito", email: `deposito-${grupos}-${marca}@ci.local`, passwordHash: "x", rolId: rolEnc.id, localId: deposito.id },
  });
  const sDepo = sesionDe(cuentaDepo, deposito.id);
  const preparar = (detalleId, preparado) => pedir(R.editar, "POST", `${B}/pos-transferencias/detalle/editar`, sDepo, { detalleId, preparado });

  const cuentaAdmin = await c.usuario.create({
    data: { nombre: "Admin", email: `admin-${grupos}-${marca}@ci.local`, passwordHash: "x", rolId: rolAdmin.id, localId: null },
  });
  const sAdmin = sesionDe(cuentaAdmin, null, "Admin", ["*"]);
  // Para dejar el par limpio entre vueltas, también con el pedido empezado.
  const limpiarPar = async () => {
    const vivos = await c.posTransferencia.findMany({
      where: { origenId: deposito.id, destinoId: local.id, estado: { in: ["Borrador", "Preparando", "Solicitado"] } },
      select: { id: true },
    });
    for (const { id } of vivos) await pedir(R.cancelar, "POST", `${B}/pos-transferencias/cancelar`, sAdmin, { posId: id });
  };

  const lineas = async (posId) =>
    Object.fromEntries(
      (await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: posId }, select: { productoId: true, sugerido: true } })).map((l) => [l.productoId, Number(l.sugerido)])
    );
  const cuantasLineas = (posId, productoId) => c.posTransferenciaDetalle.count({ where: { posTransferenciaId: posId, productoId } });
  const vivosDelPar = () =>
    c.posTransferencia.findMany({
      where: { origenId: deposito.id, destinoId: local.id, estado: { in: ["Borrador", "Preparando", "Solicitado"] }, canceladoAt: null },
      select: { id: true, estado: true },
      orderBy: { id: "asc" },
    });

  return { A, B: Bp, C, ids, preparar, limpiarPar, lineas, cuantasLineas, vivosDelPar };
}

const resumen = {};

try {
  // ── 1 ────────────────────────────────────────────────────────────────────
  seccion(`1. Tres personas cargan productos distintos a la vez (${VUELTAS} vueltas)`);
  {
    const L = await armarLocal("Grupo varios 1", ["X", "Y", "Z"]);
    let quedanLosTres = 0;
    let unSoloPedido = 0;
    const malas = [];
    for (let v = 1; v <= VUELTAS; v++) {
      const [a, b, cc] = await Promise.all([L.A.fijar(L.ids.X, v), L.B.fijar(L.ids.Y, v + 1), L.C.fijar(L.ids.Z, v + 2)]);
      const vivos = await L.vivosDelPar();
      if (vivos.length === 1) unSoloPedido += 1;
      const ls = vivos.length ? await L.lineas(vivos[0].id) : {};
      if (ls[L.ids.X] === v && ls[L.ids.Y] === v + 1 && ls[L.ids.Z] === v + 2) quedanLosTres += 1;
      else malas.push({ v, ls, vivos, r: [a.status, b.status, cc.status] });
      await L.limpiarPar();
    }
    anotar(`quedan los tres: ${quedanLosTres}/${VUELTAS}; un solo pedido del local: ${unSoloPedido}/${VUELTAS}`);
    resumen[1] = { quedanLosTres, unSoloPedido, vueltas: VUELTAS };
    ok("1: en todas las vueltas quedan los tres productos, cada uno con lo suyo", quedanLosTres === VUELTAS, json(malas.slice(0, 3)));
    ok("1: y en un solo pedido compartido, nunca uno por persona", unSoloPedido === VUELTAS);
  }

  // ── 2 ────────────────────────────────────────────────────────────────────
  seccion(`2. Dos personas cambian el MISMO producto a la vez (${VUELTAS} vueltas)`);
  {
    const L = await armarLocal("Grupo varios 2", ["X", "W"]);
    let unaLinea = 0;
    let valorDeAlguno = 0;
    let otroIntacto = 0;
    const visto = {};
    for (let v = 1; v <= VUELTAS; v++) {
      await L.C.fijar(L.ids.W, 9); // un renglón que nadie de los dos toca
      await L.A.fijar(L.ids.X, 1);
      await Promise.all([L.A.fijar(L.ids.X, 3), L.B.fijar(L.ids.X, 7)]);
      const [p] = await L.vivosDelPar();
      const ls = await L.lineas(p.id);
      if ((await L.cuantasLineas(p.id, L.ids.X)) === 1) unaLinea += 1;
      if ([3, 7].includes(ls[L.ids.X])) valorDeAlguno += 1;
      if (ls[L.ids.W] === 9) otroIntacto += 1;
      visto[ls[L.ids.X]] = (visto[ls[L.ids.X]] ?? 0) + 1;
      await L.limpiarPar();
    }
    anotar(`valor que quedó: ${json(visto)} (3 = el de Ana, 7 = el de Beto)`);
    resumen[2] = { unaLinea, valorDeAlguno, otroIntacto, visto, vueltas: VUELTAS };
    ok("2: el producto queda en UNA línea", unaLinea === VUELTAS);
    ok("2: con el valor de uno de los dos —el último que llegó—, nunca una mezcla", valorDeAlguno === VUELTAS, json(visto));
    ok("2: el renglón que ninguno tocó sigue intacto", otroIntacto === VUELTAS);
  }

  // ── 3 ────────────────────────────────────────────────────────────────────
  seccion("3. A tiene la pantalla de antes, B agrega, A cambia otra cosa");
  {
    const L = await armarLocal("Grupo varios 3", ["X", "Y", "Z"]);
    await L.A.fijar(L.ids.X, 2);
    const loQueVeA = await L.A.carrito(); // la pantalla de A, abierta desde antes
    await L.B.fijar(L.ids.Y, 4); // B agrega
    await L.A.fijar(L.ids.Z, 1); // A, con su pantalla vieja, cambia otra cosa
    await L.A.fijar(L.ids.X, 5); // y una más sobre lo que sí veía
    const [p] = await L.vivosDelPar();
    const ls = await L.lineas(p.id);
    anotar(`A veía ${json(loQueVeA.cuerpo.items.map((i) => [i.nombre, i.sugerido]))}; en la base: ${json(ls)}`);
    const releido = await L.A.carrito();
    resumen[3] = { base: ls, aVeiaAntes: loQueVeA.cuerpo.items.length, aVeAlReleer: releido.cuerpo.items.length };
    ok("3: lo de B sobrevive a lo que hizo A con su pantalla vieja", ls[L.ids.Y] === 4, json(ls));
    ok("3: y lo de A también", ls[L.ids.Z] === 1 && ls[L.ids.X] === 5, json(ls));
    ok("3: A lo ve en cuanto relee el carrito", releido.cuerpo.items.some((i) => i.productoLocalId === L.ids.Y), json(releido.cuerpo.items));
  }

  // ── 4 ────────────────────────────────────────────────────────────────────
  seccion(`4. A envía mientras B sigue cargando (${VUELTAS} vueltas)`);
  {
    const L = await armarLocal("Grupo varios 4", ["X", "Y", "W"]);
    const destino = { alEnviado: 0, borradorNuevo: 0, perdido: 0 };
    let borradoresAlLado = 0;
    for (let v = 1; v <= VUELTAS; v++) {
      const r0 = await L.A.fijar(L.ids.X, 2);
      const posId = r0.cuerpo.posId;
      const [env, carga] = await Promise.all([L.A.solicitar(posId), L.B.fijar(L.ids.Y, 3)]);
      if (!env.cuerpo.ok) throw new Error(`no se pudo enviar: ${json(env)}`);
      const vivos = await L.vivosDelPar();
      const enviado = vivos.find((x) => x.estado === "Solicitado");
      const otros = vivos.filter((x) => x.estado !== "Solicitado");
      const enElEnviado = enviado ? (await L.lineas(enviado.id))[L.ids.Y] === 3 : false;
      let enOtro = false;
      for (const o of otros) if ((await L.lineas(o.id))[L.ids.Y] === 3) enOtro = true;
      if (enElEnviado) destino.alEnviado += 1;
      else if (enOtro) destino.borradorNuevo += 1;
      else destino.perdido += 1;
      if (otros.length) borradoresAlLado += 1;
      if (!carga.cuerpo.ok) anotar(`vuelta ${v}: la carga de B contestó ${carga.status} ${json(carga.cuerpo)}`);
      await L.limpiarPar();
    }
    anotar(`lo de B: ${json(destino)}; vueltas con un borrador al lado del enviado: ${borradoresAlLado}`);
    resumen[4] = { ...destino, borradoresAlLado, vueltas: VUELTAS };
    ok("4: lo que B carga mientras A envía va al MISMO pedido enviado, siempre", destino.alEnviado === VUELTAS, json(destino));
    ok("4: nunca queda un borrador al lado del enviado", borradoresAlLado === 0);

    // Y si el depósito ya lo empezó: B, con su pantalla vieja, carga otra cosa.
    const r0 = await L.A.fijar(L.ids.X, 2);
    await L.A.solicitar(r0.cuerpo.posId);
    const [linea] = await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: r0.cuerpo.posId }, select: { id: true } });
    ok("4b: el depósito empieza a preparar", (await L.preparar(linea.id, 2)).cuerpo.ok === true);
    const tarde = await L.B.fijar(L.ids.W, 1);
    anotar(`4b: B carga con el pedido empezado → ${tarde.status} ${json(tarde.cuerpo)}`);
    const vivos = await L.vivosDelPar();
    let guardadoW = false;
    for (const o of vivos) if ((await L.lineas(o.id))[L.ids.W] != null) guardadoW = true;
    resumen["4b"] = { status: tarde.status, error: tarde.cuerpo.error, guardado: guardadoW };
    ok("4b: B recibe un aviso claro (409 con el motivo)", tarde.status === 409 && /preparando/i.test(tarde.cuerpo.error || ""), json(tarde));
    ok("4b: y no se guarda en silencio en ningún lado", !guardadoW && vivos.length === 1, json(vivos));
    await L.limpiarPar();
  }

  // ── 5 ────────────────────────────────────────────────────────────────────
  seccion(`5. Modo sumar: A y B confirman "Agregar al pedido" a la vez (${VUELTAS} vueltas)`);
  {
    const L = await armarLocal("Grupo varios 5", ["X", "Y", "Z", "W"]);
    let losDos = 0;
    let mismoProducto = { 5: 0, 9: 0, otro: 0 };
    let intacto = 0;
    let unSoloPedido = 0;
    for (let v = 1; v <= VUELTAS; v++) {
      await L.C.fijar(L.ids.W, 6);
      const r0 = await L.A.fijar(L.ids.X, 2);
      const posId = r0.cuerpo.posId;
      await L.A.solicitar(posId);
      // Productos distintos.
      const [a, b] = await Promise.all([
        L.A.sumar(posId, [{ productoLocalId: L.ids.Y, cantidad: 1, unidad: "UNIDAD" }]),
        L.B.sumar(posId, [{ productoLocalId: L.ids.Z, cantidad: 2, unidad: "UNIDAD" }]),
      ]);
      // El mismo producto.
      await Promise.all([
        L.A.sumar(posId, [{ productoLocalId: L.ids.X, cantidad: 5, unidad: "UNIDAD" }]),
        L.B.sumar(posId, [{ productoLocalId: L.ids.X, cantidad: 9, unidad: "UNIDAD" }]),
      ]);
      const ls = await L.lineas(posId);
      if (a.cuerpo.ok && b.cuerpo.ok && ls[L.ids.Y] === 1 && ls[L.ids.Z] === 2) losDos += 1;
      const x = ls[L.ids.X];
      mismoProducto[[5, 9].includes(x) ? x : "otro"] += 1;
      if (ls[L.ids.W] === 6) intacto += 1;
      if ((await L.vivosDelPar()).length === 1) unSoloPedido += 1;
      await L.limpiarPar();
    }
    anotar(`productos distintos, quedan los dos: ${losDos}/${VUELTAS}; el mismo producto quedó en ${json(mismoProducto)}`);
    resumen[5] = { losDos, mismoProducto, intacto, unSoloPedido, vueltas: VUELTAS };
    ok("5: productos distintos confirmados a la vez: quedan los dos", losDos === VUELTAS);
    ok("5: el mismo producto: queda el valor de uno de los dos, nunca otro", mismoProducto.otro === 0, json(mismoProducto));
    ok("5: lo que ninguno tocó sigue intacto, y es un solo pedido", intacto === VUELTAS && unSoloPedido === VUELTAS);

    // Con el depósito empezado, los dos confirman: aviso y nada escrito.
    const r0 = await L.A.fijar(L.ids.X, 2);
    const posId = r0.cuerpo.posId;
    await L.A.solicitar(posId);
    const [linea] = await c.posTransferenciaDetalle.findMany({ where: { posTransferenciaId: posId }, select: { id: true } });
    await L.preparar(linea.id, 2);
    const [a, b] = await Promise.all([
      L.A.sumar(posId, [{ productoLocalId: L.ids.Y, cantidad: 1, unidad: "UNIDAD" }]),
      L.B.sumar(posId, [{ productoLocalId: L.ids.Z, cantidad: 1, unidad: "UNIDAD" }]),
    ]);
    const ls = await L.lineas(posId);
    resumen["5b"] = { a: a.status, b: b.status, lineas: ls };
    ok("5b: con el depósito preparando, los dos reciben el aviso", a.status === 409 && b.status === 409, json([a, b]));
    ok("5b: y no se escribe nada", ls[L.ids.Y] == null && ls[L.ids.Z] == null, json(ls));
    await L.limpiarPar();
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

console.log(`\nRESUMEN ${json(resumen)}`);
console.log(`\n${pasadas} pasadas, ${fallas.length} fallas`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
