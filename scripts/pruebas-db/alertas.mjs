// PRUEBAS DE BASE DE LAS ALERTAS DE OFERTAS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/alertas.mjs
//
// ── QUÉ SE EJERCE ──────────────────────────────────────────────────────────
//
// Las dos alertas, contra PostgreSQL de verdad:
//
//   · CAMBIO DE COSTO — por EVENTO. Se escribe el costo con un escritor REAL —la
//     ruta `productos/editar/[id]`, no un `prisma.update` de conveniencia— y se
//     exige que la oferta quede en REVISAR y salga la notificación SIN que nadie
//     abra la pantalla de Ofertas.
//
//   · VENCIMIENTO — desde la apertura del POS, con la ruta que el POS pide al
//     montar.
//
// ── POR QUÉ SE LLAMA A LAS RUTAS Y NO A LOS HELPERS ────────────────────────
//
// Porque lo que se quiere probar es la COSTURA. Llamar a `ejecutarBarrido`
// directo probaría que el barrido funciona —eso ya lo prueban los candados— y no
// probaría lo único nuevo: que una escritura de costo hecha por donde se hace de
// verdad termina disparándolo.
//
// ── LA PARTE QUE ESTE ARCHIVO NO PUEDE PROBAR, Y CÓMO SE RESUELVE ──────────
//
// El disparo por evento vive en un `after()` de Next, que solo corre dentro de
// un request real: llamando al handler de la ruta desde Node, `after()` no se
// ejecuta. Así que acá se ejerce en dos mitades, y las dos importan:
//
//   1. que la ruta real escriba el costo y que el BUFFER de auditoría registre
//      el cambio —que es de donde sale la señal—;
//   2. que sobre ese buffer, `programarRevisionPorCosto` decida correr el
//      barrido y que el barrido produzca la revisión y el aviso.
//
// La costura que queda sin ejercer es la línea de `after()` en `lib/auth.js`.
// Está dicho acá para que nadie lea un verde como si cubriera eso también.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;

const { estadoOferta, ESTADO_OFERTA } = await import("../../lib/ofertas/estados.js");
const { ejecutarBarrido, _reiniciarAcelerador, MINUTOS_ENTRE_BARRIDOS } =
  await import("../../lib/ofertas/barrido.js");
const { ubicacionesConCostoCambiado, cambioElCosto } =
  await import("../../lib/ofertas/disparadorCosto.js");
const { ofertasVigentesPorProductoLocal } = await import("../../lib/ofertas/servidor.js");
const { seedAuditoria } = await import("../../lib/auditoria/contexto.js");

const rutaEditarProducto = await import("../../app/api/productos/editar/[id]/route.js");
const rutaRecargos = await import("../../app/api/recargos-pago/route.js");

// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";

function seccion(t) {
  seccionActual = t;
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 66 - t.length))}`);
}
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);
const igualPlata = (t, o, e) =>
  ok(t, Math.round(Number(o) * 100) === Math.round(Number(e) * 100), `esperado $${e}, obtenido $${o}`);

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, grupoId, permisos = ["*"]) =>
  jwt.sign({ id: usuarioId, nombre: "CI", email: `ci${usuarioId}@local`, localId, grupoId, permisos }, SECRETO, {
    expiresIn: "1h",
  });

function pedido(url, { metodo = "GET", cuerpo, sesion } = {}) {
  return new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

const marca = `ci-alertas-${Date.now()}`;
const creado = { grupoId: null, localAId: null, localBId: null, usuarioId: null, cajeroId: null, rolId: null, rolCajeroId: null };
const enHoras = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

/** Cuenta las notificaciones de un tipo para una oferta. */
async function avisos(tipo, ofertaId) {
  return prisma.notificacion.count({
    where: { grupoId: creado.grupoId, tipo, entidadTipo: "Oferta", entidadId: ofertaId },
  });
}

/**
 * Escribe el costo POR LA RUTA REAL y devuelve lo que el buffer de auditoría
 * registró, que es la señal de la que vive el disparo por evento.
 *
 * El store se siembra a mano porque fuera de un request no hay ALS: es lo mismo
 * que hace `lib/auth.js` con `seedAuditoria` al principio de cada handler.
 */
async function editarCostoPorLaRuta({ baseId, costo, sesion, grupoId, localId }) {
  const store = seedAuditoria({ usuarioId: creado.usuarioId, grupoId, localId });
  store.__auditBuffer = new Map();
  const r = await leer(
    await rutaEditarProducto.PUT(
      pedido(`http://ci/api/productos/editar/${baseId}`, {
        metodo: "PUT",
        sesion,
        cuerpo: { precio_costo: costo },
      }),
      params(baseId)
    )
  );
  return { respuesta: r, store };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["*"] } });
  // Un CAJERO de verdad: solo `pos.usar`. Es el que prueba que disparar el
  // barrido no regala permisos.
  const rolCajero = await prisma.rol.create({ data: { nombre: `${marca}-cajero`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id;
  creado.rolCajeroId = rolCajero.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  await prisma.configuracionGrupo.create({ data: { grupoId: grupo.id } });

  // ── LOCAL A ES EL DEPÓSITO, Y NO ES UN DETALLE ─────────────────────────
  //
  // El COSTO MAESTRO se administra desde el depósito: `resolverRutaEdicion`
  // manda a `override` a cualquier ubicación que no lo sea, y entonces
  // `productos/editar` rechaza el cambio de ficha maestra con un 403.
  //
  // La primera corrida real falló justo ahí, con las tres afirmaciones del
  // cambio de costo en rojo. El fixture tenía dos locales comunes y ningún
  // depósito, o sea un grupo que en el sistema real no existe: nadie podía
  // tocar un costo. Se corrige montando el grupo como se monta de verdad —un
  // depósito que administra el catálogo y un local que vende— en vez de
  // esquivar el permiso escribiendo el costo directo en la base.
  const localA = await prisma.local.create({ data: { nombre: `${marca}-deposito`, es_deposito: true } });
  const localB = await prisma.local.create({ data: { nombre: `${marca}-local` } });
  creado.localAId = localA.id;
  creado.localBId = localB.id;
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });
  for (const localId of [localA.id, localB.id]) {
    await prisma.configuracionLocal.create({ data: { localId, exigirOperador: false } });
  }

  const usuario = await prisma.usuario.create({
    data: { nombre: "CI", email: `${marca}@local`, passwordHash: "x", rolId: rol.id, localId: localA.id },
  });
  const cajero = await prisma.usuario.create({
    data: { nombre: "Cajero", email: `${marca}-cajero@local`, passwordHash: "x", rolId: rolCajero.id, localId: localA.id },
  });
  creado.usuarioId = usuario.id;
  creado.cajeroId = cajero.id;

  // Productos: uno en oferta en A, uno en oferta en B, y uno SIN oferta.
  const productos = {};
  for (const [clave, datos] of Object.entries({
    conOfertaA: { nombre: "Con oferta A", venta: 1000, costo: 650, local: localA.id },
    conOfertaB: { nombre: "Con oferta B", venta: 900, costo: 600, local: localB.id },
    sinOferta: { nombre: "Sin oferta", venta: 500, costo: 300, local: localA.id },
    porVencer: { nombre: "Por vencer", venta: 700, costo: 400, local: localA.id },
    finalizada: { nombre: "De oferta finalizada", venta: 800, costo: 450, local: localA.id },
  })) {
    const base = await prisma.productoBase.create({
      data: {
        grupoId: grupo.id,
        nombre: `${marca}-${datos.nombre}`,
        unidad_medida: "unidad",
        precio_costo: datos.costo,
        precio_venta: datos.venta,
        redondeo_100: false,
        // ── EL DUEÑO DEL COSTO ES EL DEPÓSITO ──────────────────────────
        //
        // Todos son productos DEL DEPÓSITO (catálogo compartido), que es el
        // caso normal: `lib/productos/propiedadCosto.js` dice que el costo de
        // un producto de depósito solo lo administra el depósito. Por eso las
        // ediciones de costo de estas pruebas van con la sesión de local A.
        creadoEnLocalId: localA.id,
      },
    });
    const pl = await prisma.productoLocal.create({
      data: { localId: datos.local, baseId: base.id, nombre: datos.nombre },
    });
    productos[clave] = { baseId: base.id, productoLocalId: pl.id, localId: datos.local, ...datos };
  }

  /** Una oferta publicada y vigente sobre un producto. */
  const ofertaSobre = async (p, { nombre, inicio = -1, fin = 48, finalizada = false } = {}) =>
    prisma.oferta.create({
      data: {
        grupoId: grupo.id,
        localId: p.localId,
        nombre,
        condicionPago: "CUALQUIER_MEDIO",
        inicioEn: enHoras(inicio),
        finEn: enHoras(fin),
        publicadaEn: new Date(),
        ...(finalizada ? { finalizadaEn: new Date() } : {}),
        lineas: {
          create: {
            productoLocalId: p.productoLocalId,
            productoBaseId: p.baseId,
            precioOferta: Math.round(p.venta * 0.9),
            precioNormalReferencia: p.venta,
            costoReferencia: p.costo,
          },
        },
      },
      include: { lineas: true },
    });

  return {
    grupo,
    localA,
    localB,
    productos,
    ofertaA: await ofertaSobre(productos.conOfertaA, { nombre: "Oferta del local A" }),
    ofertaB: await ofertaSobre(productos.conOfertaB, { nombre: "Oferta del local B" }),
    // Nace LEJOS del vencimiento (48 h). La sección 9 le corre el `finEn` a
    // dentro de las 24 h, que es lo que pasa en la vida real cuando el tiempo
    // avanza. Si naciera "por vencer", los barridos de las secciones 1 a 8 ya
    // habrían emitido su aviso y la sección 9 no podría afirmar nada sobre el
    // momento en que se emite — la primera corrida real falló exactamente ahí.
    ofertaPorVencer: await ofertaSobre(productos.porVencer, { nombre: "Por vencer", fin: 48 }),
    ofertaFinalizada: await ofertaSobre(productos.finalizada, { nombre: "Finalizada", finalizada: true }),
    sesionA: token(usuario.id, localA.id, grupo.id),
    sesionCajero: token(cajero.id, localA.id, grupo.id, ["pos.usar"]),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const locales = [creado.localAId, creado.localBId].filter(Boolean);
  await prisma.notificacion.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.ofertaEvento.deleteMany({ where: { oferta: { localId: { in: locales } } } });
  await prisma.ofertaLinea.deleteMany({ where: { oferta: { localId: { in: locales } } } });
  await prisma.oferta.deleteMany({ where: { localId: { in: locales } } });
  await prisma.recargoPagoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [creado.usuarioId, creado.cajeroId].filter(Boolean) } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionGrupo.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: locales } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: { in: [creado.rolId, creado.rolCajeroId].filter(Boolean) } } });
}

// ═══════════════════════════════════════════════════════════════════════════

const TIPO_REVISAR = "OFERTA_REVISAR";
const TIPO_POR_VENCER = "OFERTA_POR_VENCER";

async function correr(f) {
  const { grupo, localA, localB, productos, ofertaA, ofertaB, ofertaPorVencer, ofertaFinalizada, sesionA, sesionCajero } = f;
  const P = productos;

  // Un solo llamador del barrido para el camino "por evento": lee el buffer y
  // corre lo mismo que correría el `after()` de `lib/auth.js`.
  const revisarComoLoHariaElEvento = async (store) => {
    const { locales, base } = ubicacionesConCostoCambiado(store);
    if (locales.length === 0 && !base) return { corrio: false };
    const localIds = base ? [localA.id, localB.id] : locales;
    const r = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds, forzar: true });
    return { corrio: true, ...r };
  };

  // ─────────────────────────────────────────────────────────────────────────
  seccion("1. Cambio de costo por un escritor REAL, sin abrir Ofertas");

  const { respuesta, store } = await editarCostoPorLaRuta({
    baseId: P.conOfertaA.baseId, costo: 820, sesion: sesionA, grupoId: grupo.id, localId: localA.id,
  });
  ok("la ruta de edición de producto responde ok", respuesta.ok === true, respuesta.error);

  const costoGuardado = await prisma.productoBase.findUnique({
    where: { id: P.conOfertaA.baseId }, select: { precio_costo: true },
  });
  igualPlata("el costo quedó en $820 en la base", costoGuardado.precio_costo, 820);

  const detectado = ubicacionesConCostoCambiado(store);
  ok("el buffer de auditoría detectó el cambio de costo", detectado.base === true || detectado.locales.length > 0,
     JSON.stringify(detectado));

  const ev1 = await revisarComoLoHariaElEvento(store);
  ok("el evento dispara el barrido", ev1.corrio === true);
  ok("y marca al menos una línea", ev1.marcadas >= 1, JSON.stringify(ev1));

  const traEvento = await prisma.oferta.findUnique({ where: { id: ofertaA.id }, include: { lineas: true } });
  igual("la oferta quedó en REVISAR sin que nadie abriera la pantalla", estadoOferta(traEvento), ESTADO_OFERTA.REVISAR);
  igualPlata("el costo de referencia ANTERIOR se conserva", traEvento.lineas[0].costoReferencia, 650);
  igualPlata("y se guardó el costo actual detectado", traEvento.lineas[0].costoAlDetectar, 820);
  igualPlata("el precio de oferta NO se movió solo", traEvento.lineas[0].precioOferta, 900);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("2. Exactamente una notificación");
  igual("una sola notificación de revisión", await avisos(TIPO_REVISAR, ofertaA.id), 1);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("3. Guardar el MISMO costo no notifica");

  const { store: store2 } = await editarCostoPorLaRuta({
    baseId: P.conOfertaA.baseId, costo: 820, sesion: sesionA, grupoId: grupo.id, localId: localA.id,
  });
  const detectado2 = ubicacionesConCostoCambiado(store2);
  ok("guardar $820 sobre $820 NO cuenta como cambio",
     detectado2.base === false && detectado2.locales.length === 0, JSON.stringify(detectado2));

  const ev2 = await revisarComoLoHariaElEvento(store2);
  ok("y por lo tanto el barrido ni se dispara", ev2.corrio === false);
  igual("cero notificaciones nuevas", await avisos(TIPO_REVISAR, ofertaA.id), 1);

  // Y aunque el barrido corra igual (la pantalla de Ofertas, por ejemplo),
  // tampoco duplica: la marca ya está puesta y no hay transición.
  const forzado = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds: [localA.id], forzar: true });
  igual("un barrido forzado tampoco marca de nuevo", forzado.marcadas, 0);
  igual("ni duplica la notificación", await avisos(TIPO_REVISAR, ofertaA.id), 1);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("4. Confirmar la revisión");

  const rutaRevisar = await import("../../app/api/ofertas/[id]/revisar/route.js");
  const confirmada = await leer(
    await rutaRevisar.POST(
      pedido(`http://ci/api/ofertas/${ofertaA.id}/revisar`, {
        metodo: "POST", sesion: sesionA, cuerpo: { lineaIds: [traEvento.lineas[0].id] },
      }),
      params(ofertaA.id)
    )
  );
  ok("confirmar responde ok", confirmada.ok === true, confirmada.error);

  const traConfirmar = await prisma.oferta.findUnique({ where: { id: ofertaA.id }, include: { lineas: true } });
  igualPlata("la referencia pasó a $820", traConfirmar.lineas[0].costoReferencia, 820);
  ok("la marca se levantó", traConfirmar.lineas[0].revisionPendienteDesde == null);
  igual("ya no está en REVISAR", estadoOferta(traConfirmar), ESTADO_OFERTA.ACTIVA);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("5. Un cambio POSTERIOR es un evento nuevo");

  const { store: store3 } = await editarCostoPorLaRuta({
    baseId: P.conOfertaA.baseId, costo: 850, sesion: sesionA, grupoId: grupo.id, localId: localA.id,
  });
  const ev3 = await revisarComoLoHariaElEvento(store3);
  ok("el barrido vuelve a dispararse", ev3.corrio === true);
  igual("y marca de nuevo", ev3.marcadas, 1);

  const traSegundo = await prisma.oferta.findUnique({ where: { id: ofertaA.id }, include: { lineas: true } });
  igual("la oferta vuelve a REVISAR", estadoOferta(traSegundo), ESTADO_OFERTA.REVISAR);
  igualPlata("contra la referencia NUEVA de $820", traSegundo.lineas[0].costoReferencia, 820);
  igualPlata("y con el costo actual de $850", traSegundo.lineas[0].costoAlDetectar, 850);
  igual("hay una SEGUNDA notificación", await avisos(TIPO_REVISAR, ofertaA.id), 2);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("6. Dos locales: el cambio no toca la oferta ajena");

  const antesB = await prisma.oferta.findUnique({ where: { id: ofertaB.id }, include: { lineas: true } });
  ok("la oferta del local B sigue sin marcar", antesB.lineas[0].revisionPendienteDesde == null);
  igual("y no tiene ninguna notificación", await avisos(TIPO_REVISAR, ofertaB.id), 0);
  igual("el local B sigue ACTIVA", estadoOferta(antesB), ESTADO_OFERTA.ACTIVA);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("7. Producto sin oferta: no genera basura");

  const notifAntes = await prisma.notificacion.count({ where: { grupoId: grupo.id } });
  const { store: storeSin } = await editarCostoPorLaRuta({
    baseId: P.sinOferta.baseId, costo: 999, sesion: sesionA, grupoId: grupo.id, localId: localA.id,
  });
  const evSin = await revisarComoLoHariaElEvento(storeSin);
  ok("el barrido corre (el costo cambió de verdad)", evSin.corrio === true);
  igual("pero no marca ninguna línea", evSin.marcadas, 0);
  igual("y no crea ni una notificación", await prisma.notificacion.count({ where: { grupoId: grupo.id } }), notifAntes);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("8. Oferta finalizada: no vuelve al trabajo diario");

  const { store: storeFin } = await editarCostoPorLaRuta({
    baseId: P.finalizada.baseId, costo: 700, sesion: sesionA, grupoId: grupo.id, localId: localA.id,
  });
  await revisarComoLoHariaElEvento(storeFin);
  const traFin = await prisma.oferta.findUnique({ where: { id: ofertaFinalizada.id }, include: { lineas: true } });
  ok("la línea de una oferta finalizada NO se marca", traFin.lineas[0].revisionPendienteDesde == null);
  igual("sigue FINALIZADA", estadoOferta(traFin), ESTADO_OFERTA.FINALIZADA);
  igual("y no genera notificación", await avisos(TIPO_REVISAR, ofertaFinalizada.id), 0);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("9. Vencimiento: el POS lo dispara al abrir");

  _reiniciarAcelerador();
  igual("mientras faltan 48 h no hay aviso", await avisos(TIPO_POR_VENCER, ofertaPorVencer.id), 0);

  // Pasa el tiempo: ahora termina dentro de las 24 h. Se corre `finEn` en vez de
  // mover el reloj porque el barrido consulta la base con `now()` y un reloj
  // falso no llegaría hasta el WHERE.
  await prisma.oferta.update({ where: { id: ofertaPorVencer.id }, data: { finEn: enHoras(10) } });

  const barridoPos = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds: [localA.id] });
  ok("el barrido del POS corre", barridoPos.salteado !== true);
  igual("y avisa que la oferta vence dentro de las 24 h", await avisos(TIPO_POR_VENCER, ofertaPorVencer.id), 1);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("10. Abrir el POS de nuevo no duplica");

  // Sin acelerador, para probar la idempotencia del barrido y no la del reloj:
  // son dos defensas distintas y hay que ver las dos.
  const otraVez = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds: [localA.id], forzar: true });
  igual("no emite un aviso nuevo", await avisos(TIPO_POR_VENCER, ofertaPorVencer.id), 1);
  igual("y no marca nada de más", otraVez.avisos, 0);

  // Y el acelerador, que es la otra mitad: evita el trabajo, no solo el aviso.
  const acelerado = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds: [localA.id] });
  ok(`el acelerador saltea la corrida dentro de los ${MINUTOS_ENTRE_BARRIDOS} minutos`, acelerado.salteado === true);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("11. Renovar: la vigencia nueva puede volver a avisar");

  // Se corre la ventana de la oferta: es lo que hace una renovación. El aviso
  // viejo quedó fuera de la ventana nueva, así que no la bloquea.
  const nuevoFin = enHoras(20);
  await prisma.oferta.update({
    where: { id: ofertaPorVencer.id },
    data: { inicioEn: enHoras(-1), finEn: nuevoFin },
  });
  const traRenovar = await ejecutarBarrido(prisma, { grupoId: grupo.id, localIds: [localA.id], forzar: true });
  igual("la vigencia nueva produce un aviso nuevo", await avisos(TIPO_POR_VENCER, ofertaPorVencer.id), 2);
  ok("el barrido lo informa", traRenovar.avisos >= 1, JSON.stringify(traRenovar));

  // ─────────────────────────────────────────────────────────────────────────
  seccion("12. Un cajero sin ofertas.ver dispara, pero no ve nada");

  _reiniciarAcelerador();
  const respuestaCajero = await leer(
    await rutaRecargos.GET(pedido(`http://ci/api/recargos-pago?localId=${localA.id}`, { sesion: sesionCajero }))
  );
  ok("el cajero PUEDE leer los recargos (los necesita para cobrar)", respuestaCajero.ok === true, respuestaCajero.error);

  const rutaListar = await import("../../app/api/ofertas/listar/route.js");
  const listadoCajero = await leer(
    await rutaListar.GET(pedido("http://ci/api/ofertas/listar", { sesion: sesionCajero }))
  );
  igual("pero NO puede listar ofertas", listadoCajero.ok, false);
  igual("y le contesta 403", listadoCajero.status, 403);

  const rutaBarridoRuta = await import("../../app/api/ofertas/barrido/route.js");
  const barridoCajero = await leer(
    await rutaBarridoRuta.POST(pedido("http://ci/api/ofertas/barrido", { metodo: "POST", sesion: sesionCajero }))
  );
  igual("ni llamar al barrido por su ruta", barridoCajero.ok, false);
  igual("también 403", barridoCajero.status, 403);

  // Y las notificaciones que él provocó exigen el permiso que no tiene.
  const notifs = await prisma.notificacion.findMany({
    where: { grupoId: grupo.id, entidadTipo: "Oferta" },
    select: { permisoRequerido: true, alcance: true, localId: true },
  });
  ok("hay notificaciones de ofertas para revisar", notifs.length > 0);
  ok(
    "TODAS exigen ofertas.ver",
    notifs.every((n) => n.permisoRequerido === "ofertas.ver"),
    JSON.stringify([...new Set(notifs.map((n) => n.permisoRequerido))])
  );
  ok(
    "TODAS son de alcance LOCAL y del local correcto",
    notifs.every((n) => n.alcance === "LOCAL" && [localA.id, localB.id].includes(n.localId))
  );

  // ─────────────────────────────────────────────────────────────────────────
  seccion("13. Una oferta vencida no se cobra, haya avisado o no");

  const vencida = await prisma.oferta.create({
    data: {
      grupoId: grupo.id,
      localId: localA.id,
      nombre: "Vencida sin aviso",
      condicionPago: "CUALQUIER_MEDIO",
      inicioEn: enHoras(-48),
      finEn: enHoras(-1),
      publicadaEn: new Date(),
      lineas: {
        create: {
          productoLocalId: P.sinOferta.productoLocalId,
          productoBaseId: P.sinOferta.baseId,
          precioOferta: 400,
          precioNormalReferencia: 500,
          costoReferencia: 300,
        },
      },
    },
  });
  igual("no se emitió ningún aviso para ella", await avisos(TIPO_POR_VENCER, vencida.id), 0);
  const vigentes = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P.sinOferta.productoLocalId],
  });
  ok(
    "y NO se aplica igual: la ventana server-side manda",
    vigentes[P.sinOferta.productoLocalId] == null,
    JSON.stringify(vigentes)
  );

  // ─────────────────────────────────────────────────────────────────────────
  seccion("El detector de cambio de costo, en sus bordes");

  ok("650 → 820 es un cambio",
     cambioElCosto({ modelo: "ProductoBase", antes: { precio_costo: 650 }, despues: { precio_costo: 820 } }));
  ok("650 → '650.00' NO es un cambio (Decimal contra número)",
     !cambioElCosto({ modelo: "ProductoBase", antes: { precio_costo: 650 }, despues: { precio_costo: "650.00" } }));
  ok("un producto recién creado no es un cambio",
     !cambioElCosto({ modelo: "ProductoBase", antes: null, despues: { precio_costo: 820 } }));
  ok("otro modelo no cuenta",
     !cambioElCosto({ modelo: "Usuario", antes: { precio_costo: 1 }, despues: { precio_costo: 2 } }));
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
try {
  if (!SECRETO) {
    console.error("ABORTADO: falta AUTH_SECRET.");
    process.exit(2);
  }
  console.log("Montando fixtures…");
  await correr(await montar());
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err?.message || err}`);
  console.error(err);
} finally {
  await desmontar().catch((e) => console.error("Limpieza incompleta:", e.message));
  await prisma.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  console.log("");
  for (const f of fallas) console.log(`  ✗ ${f}`);
  codigo = 1;
}
process.exit(codigo);
