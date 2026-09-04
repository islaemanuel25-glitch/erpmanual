// PRUEBAS DE BASE DEL MÓDULO DE OFERTAS Y RECARGOS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/ofertas.mjs
//
// ── QUÉ HACE ESTO QUE NINGÚN CANDADO PUEDE HACER ────────────────────────────
//
// Ejercer las CONSULTAS contra Postgres. CLAUDE.md lo dice con su caso al lado:
// una consulta de Prisma no la prueba ni el build ni la suite. El 2026-08-12
// tres rutas pedían una relación inexistente, el build compiló, los 3.071
// candados quedaron en verde y la pantalla se cayó en producción. Lo que Postgres
// valida son los ARGUMENTOS, así que esto encuentra ese error incluso con la base
// recién creada y vacía.
//
// Por eso acá se llaman los HANDLERS DE LAS RUTAS de verdad —no una reescritura
// parecida de lo que hacen—: lo que se quiere ejercer es el `select` exacto que
// va a correr en producción.
//
// ── DÓNDE CORRE Y DÓNDE NO ──────────────────────────────────────────────────
//
// Solo contra una base descartable. `scripts/lib/clientePrisma.mjs` en nivel
// ESCRITURA exige host local y NODE_ENV distinto de production, y aborta con
// código 2 si algo de eso falla. En la práctica esto vive en el job de CI
// (.github/workflows/verificacion.yml), sobre un PostgreSQL efímero del runner
// que se destruye al terminar.
//
// NO se corre contra producción ni contra la base de desarrollo de nadie: crea
// grupos, locales, productos y ventas, y al terminar borra todo lo que creó.

// LA FÁBRICA VA PRIMERO Y NO ES ESTÉTICA: `@prisma/client` carga el .env al
// importarse, y la fábrica distingue "la URL la puso el operador" de "la puso el
// archivo" capturándola antes de que eso ocurra. Cualquier import de acá arriba
// que arrastre Prisma pierde esa distinción en silencio.
import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;

// Los módulos de la app se importan DESPUÉS del cliente, por lo mismo de arriba.
const { ofertasVigentesPorProductoLocal, recargosDelLocal, referenciasDeProducto } =
  await import("../../lib/ofertas/servidor.js");
const { estadoOferta, ESTADO_OFERTA } = await import("../../lib/ofertas/estados.js");
const { calcularVentaComercial } = await import("../../lib/ofertas/motorVenta.js");
const { normalizarRecargos } = await import("../../lib/recargos-pago/recargoPago.js");
const { POS_APLICA_CONDICION_COMERCIAL } = await import("../../lib/ofertas/integracionPos.js");

const rutaOfertaCrear = await import("../../app/api/ofertas/crear/route.js");
const rutaOfertaLineas = await import("../../app/api/ofertas/[id]/lineas/route.js");
const rutaOfertaPublicar = await import("../../app/api/ofertas/[id]/publicar/route.js");
const rutaOfertaRevisar = await import("../../app/api/ofertas/[id]/revisar/route.js");
const rutaOfertaFinalizar = await import("../../app/api/ofertas/[id]/finalizar/route.js");
const rutaOfertaRenovar = await import("../../app/api/ofertas/[id]/renovar/route.js");
const rutaOfertaDetalle = await import("../../app/api/ofertas/[id]/route.js");
const rutaOfertaListar = await import("../../app/api/ofertas/listar/route.js");
const rutaBarrido = await import("../../app/api/ofertas/barrido/route.js");
const rutaRecargos = await import("../../app/api/recargos-pago/route.js");
const rutaBuscarProducto = await import("../../app/api/pos-ventas/buscar-producto/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";

function seccion(titulo) {
  seccionActual = titulo;
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 68 - titulo.length))}`);
}

function ok(afirmacion, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${afirmacion}`);
  } else {
    fallas.push(`[${seccionActual}] ${afirmacion}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${afirmacion}${detalle ? ` — ${detalle}` : ""}`);
  }
}

function igual(afirmacion, obtenido, esperado) {
  const iguales = JSON.stringify(obtenido) === JSON.stringify(esperado);
  ok(afirmacion, iguales, iguales ? "" : `esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

/** Los importes se comparan en centavos enteros, nunca con === sobre flotantes. */
function igualPlata(afirmacion, obtenido, esperado) {
  const a = Math.round(Number(obtenido) * 100);
  const b = Math.round(Number(esperado) * 100);
  ok(afirmacion, a === b, a === b ? "" : `esperado $${esperado}, obtenido $${obtenido}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PEDIDOS A LAS RUTAS
// ═══════════════════════════════════════════════════════════════════════════

const SECRETO = process.env.AUTH_SECRET;

function token(usuarioId, localId, grupoId) {
  return jwt.sign(
    { id: usuarioId, nombre: "Prueba CI", email: `ci${usuarioId}@local`, localId, grupoId, permisos: ["*"] },
    SECRETO,
    { expiresIn: "1h" }
  );
}

function pedido(url, { metodo = "GET", cuerpo, sesion } = {}) {
  return new Request(url, {
    method: metodo,
    headers: {
      cookie: `erpazul_sesion=${sesion}`,
      "content-type": "application/json",
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

async function leer(respuesta) {
  const cuerpo = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, ...cuerpo };
}

const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-ofertas-${Date.now()}`;
const creado = { grupoId: null, localAId: null, localBId: null, usuarioId: null, rolId: null };

function enHoras(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

async function montarFixtures() {
  const rol = await prisma.rol.create({
    data: { nombre: `${marca}-rol`, permisos: ["*"] },
  });
  creado.rolId = rol.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;

  await prisma.configuracionGrupo.create({
    data: {
      grupoId: grupo.id,
      // Comisiones bancarias explícitas: una de las afirmaciones es que el
      // recargo comercial y la comisión NO se pisan, y para verlo hacen falta
      // los dos distintos de cero y distintos entre sí.
      comisionDebito: 7,
      comisionCredito: 10,
      comisionMercadopago: 5,
    },
  });

  const localA = await prisma.local.create({ data: { nombre: `${marca}-localA` } });
  const localB = await prisma.local.create({ data: { nombre: `${marca}-localB` } });
  creado.localAId = localA.id;
  creado.localBId = localB.id;

  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });

  // Sin operador exigido: el gate de operador es de otro módulo y no es lo que
  // se está probando acá. Se apaga explícitamente en vez de esquivarlo.
  for (const localId of [localA.id, localB.id]) {
    await prisma.configuracionLocal.create({
      data: { localId, exigirOperador: false, allowNegativeStock: true },
    });
  }

  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Prueba CI",
      email: `${marca}@local`,
      passwordHash: "x",
      rolId: rol.id,
      localId: localA.id,
    },
  });
  creado.usuarioId = usuario.id;

  // Dos productos. El primero es el del ejemplo del pedido: vale $1.000 y cuesta
  // $700, así que una oferta de $900 deja $200 de ganancia de MERCADERÍA.
  const productos = {};
  for (const [clave, datos] of Object.entries({
    nueveDeOro: { nombre: "Nueve de Oro", venta: 1000, costo: 700 },
    otro: { nombre: "Producto sin oferta", venta: 500, costo: 300 },
  })) {
    const base = await prisma.productoBase.create({
      data: {
        grupoId: grupo.id,
        nombre: `${marca}-${datos.nombre}`,
        unidad_medida: "unidad",
        precio_costo: datos.costo,
        precio_venta: datos.venta,
        redondeo_100: false,
      },
    });
    const pl = await prisma.productoLocal.create({
      data: { localId: localA.id, baseId: base.id, nombre: datos.nombre },
    });
    await prisma.stockLocal.create({
      data: { localId: localA.id, productoId: pl.id, cantidad: 1000 },
    });
    productos[clave] = { baseId: base.id, productoLocalId: pl.id, ...datos };
  }

  const turno = await prisma.turno.create({
    data: { localId: localA.id, vendedorId: usuario.id, montoInicial: 0 },
  });

  return {
    grupo,
    localA,
    localB,
    usuario,
    productos,
    turno,
    sesionA: token(usuario.id, localA.id, grupo.id),
    sesionB: token(usuario.id, localB.id, grupo.id),
  };
}

async function desmontarFixtures() {
  // Orden inverso a las dependencias. La base es descartable igual, pero un
  // script que ensucia una base compartida es un script que alguien va a correr
  // donde no debe.
  if (!creado.grupoId) return;
  const locales = [creado.localAId, creado.localBId].filter(Boolean);
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: locales } } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: locales } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: locales } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: locales } } });
  await prisma.turno.deleteMany({ where: { localId: { in: locales } } });
  await prisma.ofertaEvento.deleteMany({ where: { oferta: { localId: { in: locales } } } });
  await prisma.ofertaLinea.deleteMany({ where: { oferta: { localId: { in: locales } } } });
  await prisma.oferta.deleteMany({ where: { localId: { in: locales } } });
  await prisma.recargoPagoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.notificacion.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.stockLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionGrupo.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: locales } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

// ═══════════════════════════════════════════════════════════════════════════
// LAS PRUEBAS
// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const { grupo, localA, localB, usuario, productos, turno, sesionA, sesionB } = f;
  const P1 = productos.nueveDeOro;
  const P2 = productos.otro;

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Ciclo de vida de una oferta");

  const creacion = await leer(
    await rutaOfertaCrear.POST(
      pedido("http://ci/api/ofertas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          nombre: "Oferta de prueba",
          condicionPago: "SOLO_EFECTIVO",
          inicioEn: enHoras(-1).toISOString(),
          finEn: enHoras(48).toISOString(),
          lineas: [{ productoLocalId: P1.productoLocalId, precioOferta: 900 }],
        },
      })
    )
  );
  ok("crear oferta responde ok", creacion.ok === true, creacion.error);
  const ofertaId = creacion.oferta?.id ?? creacion.id;
  ok("la oferta creada tiene id", Number.isInteger(ofertaId), JSON.stringify(creacion));

  const filaCreada = await prisma.oferta.findUnique({
    where: { id: ofertaId },
    include: { lineas: true },
  });
  ok("nace en BORRADOR (publicadaEn null)", filaCreada?.publicadaEn == null);
  igual("estado derivado = BORRADOR", estadoOferta(filaCreada), ESTADO_OFERTA.BORRADOR);
  igualPlata("la línea congeló el precio normal de HOY", filaCreada.lineas[0].precioNormalReferencia, 1000);
  igualPlata("la línea congeló el costo de HOY", filaCreada.lineas[0].costoReferencia, 700);
  igualPlata("el precio de oferta se guardó", filaCreada.lineas[0].precioOferta, 900);

  // Agregar una línea más por la ruta de líneas (PUT reemplaza el conjunto).
  const conLineas = await leer(
    await rutaOfertaLineas.PUT(
      pedido(`http://ci/api/ofertas/${ofertaId}/lineas`, {
        metodo: "PUT",
        sesion: sesionA,
        cuerpo: {
          lineas: [
            { productoLocalId: P1.productoLocalId, precioOferta: 900 },
            { productoLocalId: P2.productoLocalId, descuentoPct: 20 },
          ],
        },
      }),
      params(ofertaId)
    )
  );
  ok("agregar líneas responde ok", conLineas.ok === true, conLineas.error);
  const lineasGuardadas = await prisma.ofertaLinea.findMany({ where: { ofertaId } });
  igual("quedaron dos líneas", lineasGuardadas.length, 2);
  const lineaP2 = lineasGuardadas.find((l) => l.productoLocalId === P2.productoLocalId);
  igualPlata("el 20 % sobre $500 se guardó como precio $400", lineaP2.precioOferta, 400);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Publicar");

  ok(
    "el enclave de publicación está levantado",
    POS_APLICA_CONDICION_COMERCIAL === true,
    "POS_APLICA_CONDICION_COMERCIAL sigue en false: la publicación seguiría bloqueada"
  );

  const publicacion = await leer(
    await rutaOfertaPublicar.POST(
      pedido(`http://ci/api/ofertas/${ofertaId}/publicar`, { metodo: "POST", sesion: sesionA }),
      params(ofertaId)
    )
  );
  ok("publicar responde ok", publicacion.ok === true, publicacion.error);

  const publicada = await prisma.oferta.findUnique({ where: { id: ofertaId }, include: { lineas: true } });
  ok("publicadaEn quedó escrita", publicada.publicadaEn != null);
  igual("estado derivado = ACTIVA", estadoOferta(publicada), ESTADO_OFERTA.ACTIVA);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Consultar la oferta vigente");

  const vigentes = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P1.productoLocalId, P2.productoLocalId],
  });
  ok("la consulta de vigencia trae el producto ofertado", vigentes[P1.productoLocalId] != null);
  igualPlata("con el precio de oferta", vigentes[P1.productoLocalId].precioOferta, 900);
  igual("y con su condición de pago", vigentes[P1.productoLocalId].condicionPago, "SOLO_EFECTIVO");

  const listado = await leer(
    await rutaOfertaListar.GET(pedido("http://ci/api/ofertas/listar", { sesion: sesionA }))
  );
  ok("listar ofertas responde ok", listado.ok === true, listado.error);

  const detalle = await leer(
    await rutaOfertaDetalle.GET(
      pedido(`http://ci/api/ofertas/${ofertaId}`, { sesion: sesionA }),
      params(ofertaId)
    )
  );
  ok("el detalle de la oferta responde ok", detalle.ok === true, detalle.error);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Ventana de vigencia");

  const programada = await prisma.oferta.create({
    data: {
      grupoId: grupo.id,
      localId: localA.id,
      nombre: "Programada",
      condicionPago: "CUALQUIER_MEDIO",
      inicioEn: enHoras(24),
      finEn: enHoras(48),
      publicadaEn: new Date(),
      lineas: {
        create: {
          productoLocalId: P2.productoLocalId,
          productoBaseId: P2.baseId,
          precioOferta: 450,
          precioNormalReferencia: 500,
          costoReferencia: 300,
        },
      },
    },
    include: { lineas: true },
  });
  igual("una oferta que empieza mañana está PROGRAMADA", estadoOferta(programada), ESTADO_OFERTA.PROGRAMADA);

  const antesDeEmpezar = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P2.productoLocalId],
    ahora: enHoras(1),
  });
  ok(
    "una oferta programada NO aplica antes de su inicio",
    antesDeEmpezar[P2.productoLocalId]?.ofertaId !== programada.id
  );

  const yaEmpezada = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P2.productoLocalId],
    ahora: enHoras(25),
  });
  ok("y sí aplica una vez que empezó", yaEmpezada[P2.productoLocalId]?.ofertaId === programada.id);

  // El extremo final es ABIERTO: [inicio, fin). Se prueban los dos lados del
  // instante exacto, que es donde una comparación con <= se equivocaría.
  const unMsAntes = new Date(programada.finEn.getTime() - 1);
  const enElInstanteFinal = new Date(programada.finEn.getTime());

  const casiVencida = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P2.productoLocalId],
    ahora: unMsAntes,
  });
  ok("un milisegundo antes del final la oferta todavía aplica", casiVencida[P2.productoLocalId]?.ofertaId === programada.id);

  const vencida = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P2.productoLocalId],
    ahora: enElInstanteFinal,
  });
  ok(
    "en el instante EXACTO del final deja de aplicar",
    vencida[P2.productoLocalId]?.ofertaId !== programada.id
  );
  igual(
    "y su estado pasa a VENCIDA",
    estadoOferta(programada, enElInstanteFinal),
    ESTADO_OFERTA.VENCIDA
  );

  await prisma.oferta.delete({ where: { id: programada.id } });

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Condición de pago");

  const lineaMotor = {
    productoLocalId: P1.productoLocalId,
    nombre: "Nueve de Oro",
    cantidad: 9,
    precioNormal: 1000,
  };
  const soloEfectivo = { [P1.productoLocalId]: { ofertaId, ofertaNombre: "x", precioOferta: 900, condicionPago: "SOLO_EFECTIVO" } };
  const cualquierMedio = { [P1.productoLocalId]: { ofertaId, ofertaNombre: "x", precioOferta: 900, condicionPago: "CUALQUIER_MEDIO" } };

  igualPlata(
    "SOLO_EFECTIVO aplica pagando todo en efectivo",
    calcularVentaComercial({ lineas: [lineaMotor], ofertasPorProductoLocal: soloEfectivo, mediosUsados: ["EFECTIVO"] }).total,
    8100
  );
  igualPlata(
    "SOLO_EFECTIVO NO aplica con débito",
    calcularVentaComercial({ lineas: [lineaMotor], ofertasPorProductoLocal: soloEfectivo, mediosUsados: ["DEBITO"] }).total,
    9000
  );
  igualPlata(
    "SOLO_EFECTIVO NO aplica en un pago mixto que incluya efectivo",
    calcularVentaComercial({ lineas: [lineaMotor], ofertasPorProductoLocal: soloEfectivo, mediosUsados: ["EFECTIVO", "DEBITO"] }).total,
    9000
  );
  igualPlata(
    "CUALQUIER_MEDIO sí aplica con débito",
    calcularVentaComercial({ lineas: [lineaMotor], ofertasPorProductoLocal: cualquierMedio, mediosUsados: ["DEBITO"] }).total,
    8100
  );

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Recargos por local: aislamiento");

  const guardarA = await leer(
    await rutaRecargos.PUT(
      pedido("http://ci/api/recargos-pago", {
        metodo: "PUT",
        sesion: sesionA,
        cuerpo: { recargos: { EFECTIVO: 0, DEBITO: 5, CREDITO: 10, MERCADOPAGO: 5 } },
      })
    )
  );
  ok("guardar recargos del local A responde ok", guardarA.ok === true, guardarA.error);

  const recA = await recargosDelLocal(prisma, localA.id);
  const recB = await recargosDelLocal(prisma, localB.id);
  igual("local A: débito 5 %", Number(recA.DEBITO), 5);
  igual("local A: crédito 10 %", Number(recA.CREDITO), 10);
  igual("local A: Mercado Pago 5 %", Number(recA.MERCADOPAGO), 5);
  igual("local A: efectivo 0 %", Number(recA.EFECTIVO), 0);
  igual("local B NO heredó el débito del A", Number(recB.DEBITO), 0);
  igual("local B sin filas: todos en 0", Object.values(recB).every((p) => Number(p) === 0), true);

  const filasB = await prisma.recargoPagoLocal.count({ where: { localId: localB.id } });
  igual("y el local B efectivamente no tiene ninguna fila", filasB, 0);

  const lecturaB = await leer(
    await rutaRecargos.GET(pedido("http://ci/api/recargos-pago", { sesion: sesionB }))
  );
  ok("leer recargos del local B responde ok", lecturaB.ok === true, lecturaB.error);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Cambio de costo → REVISAR");

  await prisma.productoLocal.update({
    where: { id: P1.productoLocalId },
    data: { precio_costo: 820 },
  });

  const refs = await referenciasDeProducto(prisma, {
    localId: localA.id,
    productoLocalIds: [P1.productoLocalId],
  });
  igualPlata("el costo de la ubicación pisa al de la ficha", refs[P1.productoLocalId].costo, 820);

  const barrido = await leer(
    await rutaBarrido.POST(pedido("http://ci/api/ofertas/barrido", { metodo: "POST", sesion: sesionA }))
  );
  ok("el barrido responde ok", barrido.ok === true, barrido.error);
  ok("el barrido marcó al menos una línea", barrido.marcadas >= 1, JSON.stringify(barrido));

  const traRevision = await prisma.oferta.findUnique({ where: { id: ofertaId }, include: { lineas: true } });
  const lineaMarcada = traRevision.lineas.find((l) => l.productoLocalId === P1.productoLocalId);
  ok("la línea quedó marcada para revisar", lineaMarcada.revisionPendienteDesde != null);
  igualPlata("y guardó el costo al detectar", lineaMarcada.costoAlDetectar, 820);
  igual("el estado de la oferta pasa a REVISAR", estadoOferta(traRevision), ESTADO_OFERTA.REVISAR);

  const sigueVigente = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P1.productoLocalId],
  });
  ok(
    "una oferta en REVISAR SIGUE cobrándose: el aviso no cambia el precio",
    sigueVigente[P1.productoLocalId]?.precioOferta != null &&
      Math.round(Number(sigueVigente[P1.productoLocalId].precioOferta) * 100) === 90000
  );

  const aviso = await prisma.notificacion.findFirst({
    where: { grupoId: grupo.id, tipo: "OFERTA_REVISAR", entidadId: ofertaId },
  });
  ok("se emitió la notificación de revisión", aviso != null);
  ok("la notificación es del local, no del grupo entero", aviso?.localId === localA.id);

  // Segunda corrida: no puede volver a avisar de lo mismo.
  const barrido2 = await leer(
    await rutaBarrido.POST(pedido("http://ci/api/ofertas/barrido", { metodo: "POST", sesion: sesionA }))
  );
  igual("una segunda corrida del barrido no marca nada nuevo", barrido2.marcadas, 0);
  const avisosRevisar = await prisma.notificacion.count({
    where: { grupoId: grupo.id, tipo: "OFERTA_REVISAR", entidadId: ofertaId },
  });
  igual("y no duplica la notificación", avisosRevisar, 1);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Confirmar la revisión");

  const revision = await leer(
    await rutaOfertaRevisar.POST(
      pedido(`http://ci/api/ofertas/${ofertaId}/revisar`, {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: { ofertaLineaId: lineaMarcada.id },
      }),
      params(ofertaId)
    )
  );
  ok("confirmar la revisión responde ok", revision.ok === true, revision.error);

  const traConfirmar = await prisma.ofertaLinea.findUnique({ where: { id: lineaMarcada.id } });
  ok("la marca se levantó", traConfirmar.revisionPendienteDesde == null);
  igualPlata("y el costo de referencia pasó a ser el nuevo", traConfirmar.costoReferencia, 820);

  const traConfirmarOferta = await prisma.oferta.findUnique({ where: { id: ofertaId }, include: { lineas: true } });
  igual("la oferta vuelve a ACTIVA", estadoOferta(traConfirmarOferta), ESTADO_OFERTA.ACTIVA);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("La venta: el camino completo");

  // 1) BUSCAR EL PRODUCTO — la misma ruta que usa el POS.
  const busqueda = await leer(
    await rutaBuscarProducto.GET(
      pedido(`http://ci/api/pos-ventas/buscar-producto?q=Nueve&localId=${localA.id}`, { sesion: sesionA })
    )
  );
  ok("buscar-producto responde ok", busqueda.ok === true, busqueda.error);
  const itemBuscado = (busqueda.items || []).find((i) => i.productoLocalId === P1.productoLocalId);
  ok("el producto aparece en la búsqueda", itemBuscado != null);
  igualPlata("y viene con su precio NORMAL, no con el de oferta", itemBuscado?.precioVenta, 1000);
  ok("la búsqueda informa que hay una oferta", itemBuscado?.oferta != null);
  igualPlata("con el precio promocional", itemBuscado?.oferta?.precioOferta, 900);
  igual("y con su condición", itemBuscado?.oferta?.condicionPago, "SOLO_EFECTIVO");

  // 2) EL CARRITO Y EL PREVIEW — la misma función pura que usa la pantalla.
  const { totalesPorMedio } = await import("../../lib/ofertas/previewPos.js");
  const carrito = [
    {
      productoLocalId: P1.productoLocalId,
      productoBaseId: P1.baseId,
      nombre: "Nueve de Oro",
      cantidad: 9,
      precio: 1000,
      oferta: itemBuscado.oferta,
    },
  ];
  const preview = totalesPorMedio({ carrito, recargosPorMedio: recA });

  igualPlata("preview EFECTIVO", preview.EFECTIVO.total, 8100);
  igualPlata("preview DEBITO", preview.DEBITO.total, 9450);
  igualPlata("preview CREDITO", preview.CREDITO.total, 9900);
  igualPlata("preview MERCADOPAGO", preview.MERCADOPAGO.total, 9450);

  // 3) COBRAR EN EFECTIVO — y que el backend dé EXACTAMENTE el número del preview.
  const ventaEfectivo = await leer(
    await rutaCrearVenta.POST(
      pedido("http://ci/api/pos-ventas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          clientTxnId: `${marca}-efectivo`,
          localId: localA.id,
          turnoId: turno.id,
          formaPago: "efectivo",
          totalPantalla: preview.EFECTIVO.total,
          items: [
            {
              productoBaseId: P1.baseId,
              nombre: "Nueve de Oro",
              precio: 1000,
              cantidad: 9,
              precioCosto: 820,
              esServicio: false,
              importeBaseServicio: null,
              subtotalFijado: null,
            },
          ],
        },
      })
    )
  );
  ok("la venta en efectivo se registra", ventaEfectivo.ok === true, ventaEfectivo.error);
  igualPlata("el total del backend es el del preview", ventaEfectivo.breakdown?.total, 8100);
  igualPlata("y el descuento promocional quedó explícito", ventaEfectivo.breakdown?.descuentoPromocional, 900);

  ok(
    "el backend devuelve las líneas AUTORITATIVAS para el ticket",
    Array.isArray(ventaEfectivo.breakdown?.lineas) && ventaEfectivo.breakdown.lineas.length === 1,
    JSON.stringify(ventaEfectivo.breakdown?.lineas)
  );
  const lineaTicket = ventaEfectivo.breakdown.lineas[0];
  igualPlata("la línea del ticket trae el precio COBRADO", lineaTicket.precio, 900);
  igualPlata("y también el que habría costado sin oferta", lineaTicket.precioNormal, 1000);
  igualPlata(
    "el ticket cierra: cantidad × precio cobrado = subtotal",
    lineaTicket.precio * lineaTicket.cantidad,
    ventaEfectivo.breakdown.subtotal
  );
  igualPlata("y el subtotal es el total (sin descuentos ni recargo)", ventaEfectivo.breakdown.subtotal, 8100);

  const ventaGuardada = await prisma.venta.findUnique({
    where: { id: ventaEfectivo.ventaId },
    include: { detalles: true, pagos: true },
  });
  igualPlata("Venta.total persistido", ventaGuardada.total, 8100);
  igualPlata("Venta.descuentoPromocional persistido", ventaGuardada.descuentoPromocional, 900);
  igualPlata("VentaDetalle.precio = lo cobrado", ventaGuardada.detalles[0].precio, 900);
  igualPlata("VentaDetalle.precioNormal = el precio sin oferta", ventaGuardada.detalles[0].precioNormal, 1000);
  igual("VentaDetalle.ofertaId apunta a la oferta", ventaGuardada.detalles[0].ofertaId, ofertaId);
  igual("VentaDetalle.ofertaNombre quedó congelado", ventaGuardada.detalles[0].ofertaNombre, "Oferta de prueba");
  igualPlata("VentaDetalle.descuentoPromocional", ventaGuardada.detalles[0].descuentoPromocional, 900);
  igualPlata(
    "la ganancia de MERCADERÍA se calcula contra el precio vendido, no el normal",
    ventaGuardada.detalles[0].ganancia,
    8100 - 820 * 9
  );

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Venta con recargo (sin oferta aplicable)");

  const ventaDebito = await leer(
    await rutaCrearVenta.POST(
      pedido("http://ci/api/pos-ventas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          clientTxnId: `${marca}-debito`,
          localId: localA.id,
          turnoId: turno.id,
          formaPago: "debito",
          totalPantalla: preview.DEBITO.total,
          items: [
            {
              productoBaseId: P1.baseId,
              nombre: "Nueve de Oro",
              precio: 1000,
              cantidad: 9,
              precioCosto: 820,
              esServicio: false,
              importeBaseServicio: null,
              subtotalFijado: null,
            },
          ],
        },
      })
    )
  );
  ok("la venta con débito se registra", ventaDebito.ok === true, ventaDebito.error);
  igualPlata("la oferta SOLO_EFECTIVO no se aplicó", ventaDebito.breakdown?.subtotal, 9000);
  igualPlata("el recargo del 5 % se sumó", ventaDebito.breakdown?.recargoPagoImporte, 450);
  igualPlata("total = 9.000 + 450", ventaDebito.breakdown?.total, 9450);
  igual("y quedó registrado QUÉ medio impuso la condición", ventaDebito.breakdown?.recargoPagoMedio, "DEBITO");

  const debitoGuardada = await prisma.venta.findUnique({
    where: { id: ventaDebito.ventaId },
    include: { pagos: true },
  });
  igualPlata("Venta.totalAntesRecargo persistido aparte", debitoGuardada.totalAntesRecargo, 9000);
  igualPlata("Venta.recargoPagoImporte persistido", debitoGuardada.recargoPagoImporte, 450);

  // El recargo COMERCIAL y la comisión BANCARIA son dos números distintos y no
  // se pisan: el cliente pagó 9.450 y el banco se queda el 7 % de eso.
  const pagoDebito = debitoGuardada.pagos[0];
  igualPlata("el tender cobrado es el total con recargo", pagoDebito.monto, 9450);
  igualPlata("la comisión bancaria es el 7 % de lo cobrado", pagoDebito.comision, 661.5);
  igualPlata("el neto del comercio es lo cobrado menos la comisión", pagoDebito.neto, 9450 - 661.5);
  ok(
    "recargo comercial y comisión bancaria son números distintos",
    Math.round(Number(debitoGuardada.recargoPagoImporte) * 100) !== Math.round(Number(pagoDebito.comision) * 100)
  );

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Venta mixta: manda el recargo más alto");

  const totalMixto = preview.__paraMedios(["EFECTIVO", "CREDITO"]).total;
  igualPlata("el preview del par efectivo+crédito da 9.900", totalMixto, 9900);

  const ventaMixta = await leer(
    await rutaCrearVenta.POST(
      pedido("http://ci/api/pos-ventas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          clientTxnId: `${marca}-mixta`,
          localId: localA.id,
          turnoId: turno.id,
          formaPago: "mixto",
          totalPantalla: totalMixto,
          pagos: [
            { medio: "efectivo", monto: 4900 },
            { medio: "credito", monto: 5000 },
          ],
          items: [
            {
              productoBaseId: P1.baseId,
              nombre: "Nueve de Oro",
              precio: 1000,
              cantidad: 9,
              precioCosto: 820,
              esServicio: false,
              importeBaseServicio: null,
              subtotalFijado: null,
            },
          ],
        },
      })
    )
  );
  ok("la venta mixta se registra", ventaMixta.ok === true, ventaMixta.error);
  igualPlata("la oferta de solo efectivo se perdió al aparecer otro medio", ventaMixta.breakdown?.subtotal, 9000);
  igual("mandó el recargo MÁS ALTO de los medios presentes", ventaMixta.breakdown?.recargoPagoMedio, "CREDITO");
  igualPlata("crédito 10 % sobre 9.000", ventaMixta.breakdown?.recargoPagoImporte, 900);
  igualPlata("total = 9.900", ventaMixta.breakdown?.total, 9900);

  const mixtaGuardada = await prisma.venta.findUnique({
    where: { id: ventaMixta.ventaId },
    include: { pagos: true },
  });
  const sumaTenders = mixtaGuardada.pagos.reduce((a, p) => a + Number(p.monto), 0);
  igualPlata("los tenders suman EXACTAMENTE el total con recargo", sumaTenders, 9900);
  ok("el recargo NO se prorrateó por tender", mixtaGuardada.pagos.length === 2);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Discrepancia entre lo que vio el cajero y lo que calcula el backend");

  const desfasada = await leer(
    await rutaCrearVenta.POST(
      pedido("http://ci/api/pos-ventas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          clientTxnId: `${marca}-desfasada`,
          localId: localA.id,
          turnoId: turno.id,
          formaPago: "efectivo",
          // La pantalla mostró el precio sin oferta: quedó vieja.
          totalPantalla: 9000,
          items: [
            {
              productoBaseId: P1.baseId,
              nombre: "Nueve de Oro",
              precio: 1000,
              cantidad: 9,
              precioCosto: 820,
              esServicio: false,
              importeBaseServicio: null,
              subtotalFijado: null,
            },
          ],
        },
      })
    )
  );
  igual("la venta se RECHAZA en vez de registrar otro total", desfasada.ok, false);
  igual("con un código que el POS puede reconocer", desfasada.code, "TOTAL_DESACTUALIZADO");
  igualPlata("y le dice cuál es el total bueno", desfasada.totalEsperado, 8100);
  ok("no se creó ninguna venta con ese clientTxnId", (await prisma.venta.count({ where: { clientTxnId: `${marca}-desfasada` } })) === 0);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Eliminar / finalizar / renovar");

  const borrarUsada = await leer(
    await rutaOfertaDetalle.DELETE(
      pedido(`http://ci/api/ofertas/${ofertaId}`, { metodo: "DELETE", sesion: sesionA }),
      params(ofertaId)
    )
  );
  igual("una oferta YA USADA no se puede borrar", borrarUsada.ok, false);
  igual("y responde 409", borrarUsada.status, 409);
  ok("diciendo en cuántas líneas se aplicó", Number(borrarUsada.usos) >= 1, JSON.stringify(borrarUsada));

  const nuncaUsada = await leer(
    await rutaOfertaCrear.POST(
      pedido("http://ci/api/ofertas/crear", {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: {
          nombre: "Nunca usada",
          inicioEn: enHoras(72).toISOString(),
          finEn: enHoras(96).toISOString(),
          lineas: [{ productoLocalId: P2.productoLocalId, precioOferta: 480 }],
        },
      })
    )
  );
  const idNuncaUsada = nuncaUsada.oferta?.id ?? nuncaUsada.id;
  const borrada = await leer(
    await rutaOfertaDetalle.DELETE(
      pedido(`http://ci/api/ofertas/${idNuncaUsada}`, { metodo: "DELETE", sesion: sesionA }),
      params(idNuncaUsada)
    )
  );
  ok("una oferta que nunca se usó sí se borra", borrada.ok === true, borrada.error);
  igual("y deja de existir", await prisma.oferta.count({ where: { id: idNuncaUsada } }), 0);

  const finalizada = await leer(
    await rutaOfertaFinalizar.POST(
      pedido(`http://ci/api/ofertas/${ofertaId}/finalizar`, {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: { motivo: "prueba" },
      }),
      params(ofertaId)
    )
  );
  ok("finalizar responde ok", finalizada.ok === true, finalizada.error);

  const traFinalizar = await prisma.oferta.findUnique({ where: { id: ofertaId }, include: { lineas: true } });
  ok("finalizadaEn quedó escrita", traFinalizar.finalizadaEn != null);
  igual("estado = FINALIZADA", estadoOferta(traFinalizar), ESTADO_OFERTA.FINALIZADA);

  const traFinalizarVigencia = await ofertasVigentesPorProductoLocal(prisma, {
    localId: localA.id,
    productoLocalIds: [P1.productoLocalId],
  });
  ok("una oferta finalizada deja de cobrarse", traFinalizarVigencia[P1.productoLocalId] == null);

  const renovada = await leer(
    await rutaOfertaRenovar.POST(
      pedido(`http://ci/api/ofertas/${ofertaId}/renovar`, {
        metodo: "POST",
        sesion: sesionA,
        cuerpo: { inicioEn: enHoras(100).toISOString(), finEn: enHoras(200).toISOString() },
      }),
      params(ofertaId)
    )
  );
  ok("renovar responde ok", renovada.ok === true, renovada.error);
  const idRenovada = renovada.oferta?.id ?? renovada.id;
  const filaRenovada = await prisma.oferta.findUnique({ where: { id: idRenovada }, include: { lineas: true } });
  igual("la renovación apunta a la original", filaRenovada?.renovadaDesdeId, ofertaId);
  ok("y nace como borrador", filaRenovada?.publicadaEn == null);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Los snapshots sobreviven a la oferta");

  // La oferta ya está finalizada. El histórico de la venta tiene que seguir
  // diciendo lo que se cobró y por qué, sin recalcular nada de hoy.
  const detalleHistorico = await prisma.ventaDetalle.findFirst({
    where: { ventaId: ventaEfectivo.ventaId },
  });
  igualPlata("la línea vendida sigue diciendo el precio cobrado", detalleHistorico.precio, 900);
  igualPlata("y el precio normal de aquel día", detalleHistorico.precioNormal, 1000);
  igual("y el nombre de la oferta, congelado", detalleHistorico.ofertaNombre, "Oferta de prueba");

  const cuadra =
    Math.round(Number(detalleHistorico.precio) * Number(detalleHistorico.cantidad) * 100) ===
    Math.round(Number(ventaGuardada.subtotal) * 100);
  ok("la reimpresión cuadra: Σ (precio cobrado × cantidad) = subtotal de la venta", cuadra);
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
try {
  if (!SECRETO) {
    console.error("ABORTADO: falta AUTH_SECRET. Las rutas no pueden verificar la sesión de prueba.");
    process.exit(2);
  }
  console.log("Montando fixtures…");
  const f = await montarFixtures();
  await correr(f);
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err?.message || err}`);
  console.error(err);
} finally {
  await desmontarFixtures().catch((e) => console.error("Limpieza incompleta:", e.message));
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
