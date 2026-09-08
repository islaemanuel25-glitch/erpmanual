// PRUEBAS DE BASE DEL COBRO CON MODALIDADES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/modalidadesCobro.mjs
//
// ── POR QUÉ ESTE ARCHIVO Y NO MÁS SECCIONES EN `mediosCobro.mjs` ───────────
//
// Aquél prueba la CONFIGURACIÓN: qué botones tiene un local, qué se puede
// guardar, qué rechaza la base. Su fixture es un grupo, dos locales y un usuario.
//
// Esto prueba el COBRO de punta a punta: la ruta real de crear venta, con turno
// abierto, productos, stock y contador de numeración. Es otro fixture entero y
// otra pregunta. Mezclarlos habría dejado un archivo donde no se sabe qué se está
// ejerciendo, y donde un rojo no dice si falló la configuración o el cobro.
//
// ── LO QUE NINGÚN CANDADO PUEDE HACER ─────────────────────────────────────
//
// Los candados de `lib/pos-ventas/modalidadesDeMedio.test.mjs` prueban las
// decisiones sobre datos escritos a mano. Acá se ejercen los ARGUMENTOS de
// Prisma contra Postgres —incluidas las cinco columnas nuevas de `VentaPago` y
// las cuatro de `Venta`—, los dos índices únicos parciales, y lo único que
// realmente contesta si un 409 dejó basura: contar filas después.
//
// NO se corre contra producción. `clientePrisma.mjs` en nivel ESCRITURA exige
// host local y NODE_ENV distinto de production, y aborta con código 2 si no.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;

const { mediosDelLocal } = await import("../../lib/pos-ventas/mediosCobroServidor.js");
const { totalesPorOpcionDeCobro } = await import("../../lib/ofertas/previewPos.js");

const rutaMedio = await import("../../app/api/medios-cobro/[id]/route.js");
const rutaModalidades = await import("../../app/api/medios-cobro/[id]/modalidades/route.js");
const rutaModalidad = await import("../../app/api/medios-cobro/[id]/modalidades/[modalidadId]/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };

function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

/** Los importes se comparan en centavos enteros, nunca con === sobre flotantes. */
const igualPlata = (t, o, e) => {
  const a = Math.round(Number(o) * 100);
  const b = Math.round(Number(e) * 100);
  ok(t, a === b, a === b ? "" : `esperado $${e}, obtenido $${o}`);
};

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, grupoId) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI", email: `ci${usuarioId}@l`, localId, grupoId, permisos: ["*"] },
    SECRETO,
    { expiresIn: "1h" }
  );

const pedido = (url, { metodo = "GET", cuerpo, sesion } = {}) =>
  new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const params = (id, modalidadId) => ({
  params: Promise.resolve({ id: String(id), modalidadId: modalidadId == null ? undefined : String(modalidadId) }),
});

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-modalidades-${Date.now()}`;
const creado = { grupoId: null, localAId: null, localBId: null, usuarioId: null, rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["*"] } });
  creado.rolId = rol.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  await prisma.configuracionGrupo.create({
    data: { grupoId: grupo.id, comisionDebito: 7, comisionCredito: 10, comisionMercadopago: 5 },
  });

  const localA = await prisma.local.create({ data: { nombre: `${marca}-A` } });
  const localB = await prisma.local.create({ data: { nombre: `${marca}-B` } });
  creado.localAId = localA.id; creado.localBId = localB.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });
  for (const localId of [localA.id, localB.id]) {
    // El gate de operador es de otro módulo: se apaga explícitamente en vez de
    // esquivarlo con un voucher fabricado.
    await prisma.configuracionLocal.create({
      data: { localId, exigirOperador: false, allowNegativeStock: true },
    });
  }

  const usuario = await prisma.usuario.create({
    data: { nombre: "CI", email: `${marca}@l`, passwordHash: "x", rolId: rol.id, localId: localA.id },
  });
  creado.usuarioId = usuario.id;

  // Un producto de $1.000 que cuesta $600. Los porcentajes de esta corrida están
  // elegidos para que los totales sean enteros exactos y un error de redondeo se
  // vea a simple vista.
  const base = await prisma.productoBase.create({
    data: {
      grupoId: grupo.id, nombre: `${marca}-producto`, unidad_medida: "unidad",
      precio_costo: 600, precio_venta: 1000, redondeo_100: false,
    },
  });
  const pl = await prisma.productoLocal.create({
    data: { localId: localA.id, baseId: base.id, nombre: "Producto de prueba" },
  });
  await prisma.stockLocal.create({ data: { localId: localA.id, productoId: pl.id, cantidad: 1000 } });

  const turno = await prisma.turno.create({
    data: { localId: localA.id, vendedorId: usuario.id, montoInicial: 0 },
  });

  return {
    grupo, localA, localB, usuario, turno,
    producto: { baseId: base.id, productoLocalId: pl.id },
    sesionA: token(usuario.id, localA.id, grupo.id),
    sesionB: token(usuario.id, localB.id, grupo.id),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const locales = [creado.localAId, creado.localBId].filter(Boolean);
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: locales } } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: locales } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: locales } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: locales } } });
  await prisma.turno.deleteMany({ where: { localId: { in: locales } } });
  await prisma.medioCobroLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.recargoPagoLocal.deleteMany({ where: { localId: { in: locales } } });
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

async function correr(f) {
  const { grupo, localA, localB, turno, producto, sesionA, sesionB } = f;

  let nVenta = 0;
  const item = {
    productoBaseId: producto.baseId,
    nombre: "Producto de prueba",
    precio: 1000,
    cantidad: 1,
    precioCosto: 600,
    esServicio: false,
    importeBaseServicio: null,
    subtotalFijado: null,
  };
  const cobrar = async (cuerpo, sesion = sesionA) =>
    leer(
      await rutaCrearVenta.POST(
        pedido("http://ci/api/pos-ventas/crear", {
          metodo: "POST",
          sesion,
          cuerpo: {
            clientTxnId: `${marca}-${(nVenta += 1)}`,
            localId: localA.id,
            turnoId: turno.id,
            items: [item],
            ...cuerpo,
          },
        })
      )
    );
  const ventasDelLocal = () => prisma.venta.count({ where: { localId: localA.id } });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. Alta de una modalidad sobre un medio que todavía es un DEFAULT");

  igual("el local arranca sin ninguna fila de medios",
    await prisma.medioCobroLocal.count({ where: { localId: localA.id } }), 0);

  const alta1 = await leer(
    await rutaModalidades.POST(
      pedido("http://ci/api/medios-cobro/defecto:MERCADOPAGO/modalidades", {
        metodo: "POST", sesion: sesionA,
        cuerpo: { nombre: "Crédito 1 pago", tipoContable: "CREDITO", recargoPct: 4, comisionPct: 3, orden: 1 },
      }),
      params("defecto:MERCADOPAGO")
    )
  );
  ok("se puede agregar una modalidad a un medio por defecto", alta1.ok === true, alta1.error);

  // LOS CUATRO, no solo Mercado Pago. Materializar solo el pedido dejaría al
  // local con una sola fila y el POS se quedaría sin los otros tres botones.
  const trasAlta = await prisma.medioCobroLocal.findMany({
    where: { localId: localA.id }, orderBy: { orden: "asc" }, select: { id: true, tipoContable: true },
  });
  igual("se materializaron LOS CUATRO medios por defecto",
    trasAlta.map((m) => m.tipoContable), ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"]);

  const medioMP = trasAlta.find((m) => m.tipoContable === "MERCADOPAGO");
  const medioCredito = trasAlta.find((m) => m.tipoContable === "CREDITO");
  const modalidadCreada = await prisma.medioCobroModalidadLocal.findFirst({
    where: { medioCobroLocalId: medioMP.id },
  });
  ok("y la modalidad colgó del medio correcto", modalidadCreada != null);
  igual("con el recargo y la comisión que se pidieron",
    [Number(modalidadCreada.recargoPct), Number(modalidadCreada.comisionPct)], [4, 3]);
  const modUnPago = modalidadCreada.id;

  const alta2 = await leer(
    await rutaModalidades.POST(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades`, {
        metodo: "POST", sesion: sesionA,
        cuerpo: { nombre: "Crédito cuotas", tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7, orden: 2 },
      }),
      params(medioMP.id)
    )
  );
  ok("y una segunda del MISMO tipo contable", alta2.ok === true, alta2.error);
  const modCuotas = alta2.modalidadId;

  const lista = await leer(
    await rutaModalidades.GET(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades`, { sesion: sesionA }),
      params(medioMP.id)
    )
  );
  igual("el listado devuelve las dos, en orden",
    lista.modalidades?.map((m) => m.nombre), ["Crédito 1 pago", "Crédito cuotas"]);
  igual("y avisa que con dos hay que elegir", lista.requiereModalidad, true);

  // El medio "Crédito" queda SIN modalidades, con su propio recargo y su propia
  // comisión: es el caso de "medio configurable sin modalidades" y el que prueba
  // que "Crédito · Banco" no se confunde con "Mercado Pago · Crédito".
  const cfgCredito = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioCredito.id}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { recargoPct: 6, comisionPct: 9 },
      }),
      params(medioCredito.id)
    )
  );
  ok("el medio Crédito guarda su recargo y su comisión", cfgCredito.ok === true, cfgCredito.error);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. Editar, desactivar y borrar una modalidad");

  const renombrada = await leer(
    await rutaModalidad.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades/${modCuotas}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { nombre: "Crédito en cuotas" },
      }),
      params(medioMP.id, modCuotas)
    )
  );
  ok("se puede renombrar", renombrada.ok === true, renombrada.error);
  igual("y el cambio quedó",
    (await prisma.medioCobroModalidadLocal.findUnique({ where: { id: modCuotas } })).nombre,
    "Crédito en cuotas");

  // Una tercera para ejercer desactivar y borrar sin tocar las dos que se usan
  // para cobrar más abajo.
  const tercera = await leer(
    await rutaModalidades.POST(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades`, {
        metodo: "POST", sesion: sesionA,
        cuerpo: { nombre: "QR / saldo", tipoContable: "MERCADOPAGO", recargoPct: 1, orden: 3 },
      }),
      params(medioMP.id)
    )
  );
  const modQR = tercera.modalidadId;

  await leer(
    await rutaModalidad.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades/${modQR}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { activo: false },
      }),
      params(medioMP.id, modQR)
    )
  );
  igual("desactivar la saca del POS sin perder la fila",
    (await prisma.medioCobroModalidadLocal.findUnique({ where: { id: modQR } }))?.activo, false);

  const borrada = await leer(
    await rutaModalidad.DELETE(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades/${modQR}`, {
        metodo: "DELETE", sesion: sesionA,
      }),
      params(medioMP.id, modQR)
    )
  );
  ok("y borrar la elimina de verdad", borrada.ok === true, borrada.error);
  igual("no queda la fila",
    await prisma.medioCobroModalidadLocal.count({ where: { id: modQR } }), 0);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Aislamiento: otro local, otro padre");

  const ajenaLocal = await leer(
    await rutaModalidad.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades/${modUnPago}`, {
        metodo: "PATCH", sesion: sesionB, cuerpo: { recargoPct: 0 },
      }),
      params(medioMP.id, modUnPago)
    )
  );
  igual("desde otro local, la modalidad no existe", ajenaLocal.status, 404);
  igual("y NO se le cambió el recargo",
    Number((await prisma.medioCobroModalidadLocal.findUnique({ where: { id: modUnPago } })).recargoPct), 4);

  const ajenoPadre = await leer(
    await rutaModalidad.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioCredito.id}/modalidades/${modUnPago}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { recargoPct: 0 },
      }),
      params(medioCredito.id, modUnPago)
    )
  );
  igual("colgada de otro padre, tampoco existe", ajenoPadre.status, 404);

  const listaAjena = await leer(
    await rutaModalidades.GET(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades`, { sesion: sesionB }),
      params(medioMP.id)
    )
  );
  igual("ni se pueden listar desde otro local", listaAjena.status, 404);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. Cobrar con una modalidad");

  const medios = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  const carrito = [{ productoLocalId: producto.productoLocalId, productoBaseId: producto.baseId, nombre: "Producto de prueba", cantidad: 1, precio: 1000 }];
  const preview = totalesPorOpcionDeCobro({ carrito, medios });

  igualPlata("preview de Crédito 1 pago (4 %)", preview[`mod:${modUnPago}`]?.total, 1040);
  igualPlata("preview de Crédito en cuotas (8 %)", preview[`mod:${modCuotas}`]?.total, 1080);
  ok("las dos modalidades tienen preview PROPIO aunque compartan CREDITO",
    preview[`mod:${modUnPago}`]?.total !== preview[`mod:${modCuotas}`]?.total);
  igualPlata("y el medio Crédito, sin modalidades, tiene el suyo", preview[`medio:${medioCredito.id}`]?.total, 1060);

  const ventaA = await cobrar({
    formaPago: "credito",
    totalPantalla: 1040,
    pagos: [{ medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: 1040 }],
  });
  ok("la venta con modalidad se registra", ventaA.ok === true, ventaA.error);
  igualPlata("el backend cobra EXACTAMENTE el total del preview", ventaA.breakdown?.total, 1040);
  igualPlata("con el recargo de la modalidad y no el del tipo contable", ventaA.breakdown?.recargoPagoPct, 4);

  const filaA = await prisma.venta.findUnique({
    where: { id: ventaA.ventaId },
    include: { pagos: true },
  });
  igual("la venta congela QUÉ modalidad impuso el recargo",
    [filaA.recargoPagoMedioCobroLocalId, filaA.recargoPagoMedioNombre,
     filaA.recargoPagoModalidadId, filaA.recargoPagoModalidadNombre],
    [medioMP.id, "Mercado Pago", modUnPago, "Crédito 1 pago"]);
  igual("y el tipo contable del ganador sigue donde estaba", filaA.recargoPagoMedio, "CREDITO");

  igual("el tender congela los cinco campos de identidad",
    [filaA.pagos[0].medio, filaA.pagos[0].medioCobroLocalId, filaA.pagos[0].medioNombre,
     filaA.pagos[0].procesador, filaA.pagos[0].modalidadId, filaA.pagos[0].modalidadNombre],
    ["CREDITO", medioMP.id, "Mercado Pago", "MERCADOPAGO", modUnPago, "Crédito 1 pago"]);
  igualPlata("con la comisión DE LA MODALIDAD", filaA.pagos[0].comisionPct, 3);
  igualPlata("su importe", filaA.pagos[0].comision, 31.2);
  igualPlata("y su neto", filaA.pagos[0].neto, 1008.8);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. Pago mixto entre DOS modalidades del mismo tipo contable");

  const ventaB = await cobrar({
    formaPago: "credito",
    totalPantalla: 1080,
    pagos: [
      { medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: 500 },
      { medioCobroLocalId: medioMP.id, modalidadId: modCuotas, monto: 580 },
    ],
  });
  ok("la venta mixta se registra", ventaB.ok === true, ventaB.error);
  igualPlata("manda el recargo MÁS ALTO de las dos", ventaB.breakdown?.recargoPagoPct, 8);
  igualPlata("aplicado sobre la venta completa, sin prorratear", ventaB.breakdown?.total, 1080);

  const filaB = await prisma.venta.findUnique({
    where: { id: ventaB.ventaId },
    include: { pagos: { orderBy: { monto: "asc" } } },
  });
  igual("quedaron DOS tenders", filaB.pagos.length, 2);
  igual("los dos con medio CREDITO", filaB.pagos.map((p) => p.medio), ["CREDITO", "CREDITO"]);
  igual("y los distingue la modalidad", filaB.pagos.map((p) => p.modalidadId), [modUnPago, modCuotas]);
  igual("cada uno con SU comisión", filaB.pagos.map((p) => Number(p.comisionPct)), [3, 7]);
  igual("y su importe", filaB.pagos.map((p) => Number(p.comision)), [15, 40.6]);
  igual("la venta dice cuál de las dos ganó",
    [filaB.recargoPagoModalidadId, filaB.recargoPagoModalidadNombre],
    [modCuotas, "Crédito en cuotas"]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("6. Un medio SIN modalidades: la condición de siempre, con identidad");

  const ventaC = await cobrar({
    formaPago: "credito",
    totalPantalla: 1060,
    pagos: [{ medioCobroLocalId: medioCredito.id, monto: 1060 }],
  });
  ok("se registra", ventaC.ok === true, ventaC.error);
  igualPlata("con el recargo de RecargoPagoLocal", ventaC.breakdown?.recargoPagoPct, 6);

  const pagoC = await prisma.ventaPago.findFirst({ where: { ventaId: ventaC.ventaId } });
  igual("congela el medio, su nombre y su procesador",
    [pagoC.medioCobroLocalId, pagoC.medioNombre, pagoC.procesador],
    [medioCredito.id, "Crédito", "BANCO"]);
  igual("y SOLO la modalidad queda en null", [pagoC.modalidadId, pagoC.modalidadNombre], [null, null]);
  igualPlata("con la comisión propia del medio", pagoC.comisionPct, 9);
  ok("así 'Crédito · Banco' NO se confunde con 'Mercado Pago · Crédito'",
    pagoC.medio === filaA.pagos[0].medio && pagoC.medioNombre !== filaA.pagos[0].medioNombre);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("7. El cliente no es autoridad de nada");

  const ventaD = await cobrar({
    formaPago: "credito",
    totalPantalla: 1040,
    pagos: [
      {
        medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: 1040,
        // Todo lo que un navegador podría inventar desde la consola.
        recargoPct: 0, comisionPct: 0, medio: "EFECTIVO", tipoContable: "EFECTIVO",
        procesador: "OTRO", medioNombre: "Regalo", modalidadNombre: "Gratis",
      },
    ],
  });
  ok("la venta entra", ventaD.ok === true, ventaD.error);
  const pagoD = await prisma.ventaPago.findFirst({ where: { ventaId: ventaD.ventaId } });
  igualPlata("el recargo enviado por el cliente se ignora", ventaD.breakdown?.recargoPagoPct, 4);
  igualPlata("la comisión enviada por el cliente se ignora", pagoD.comisionPct, 3);
  igual("el tipo contable enviado por el cliente se ignora", pagoD.medio, "CREDITO");
  igual("el procesador enviado por el cliente se ignora", pagoD.procesador, "MERCADOPAGO");
  igual("y los nombres se releen de la configuración",
    [pagoD.medioNombre, pagoD.modalidadNombre], ["Mercado Pago", "Crédito 1 pago"]);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("8. Identidades que no se pueden cobrar");

  const antesDeLosRechazos = await ventasDelLocal();

  const otroLocal = await cobrar({
    formaPago: "credito", totalPantalla: 1040,
    pagos: [{ medioCobroLocalId: 999999, monto: 1040 }],
  });
  igual("un medio de otro local no existe", otroLocal.status, 404);
  igual("y se dice por qué", otroLocal.code, "MEDIO_INEXISTENTE");

  const modAjena = await cobrar({
    formaPago: "credito", totalPantalla: 1060,
    pagos: [{ medioCobroLocalId: medioCredito.id, modalidadId: modUnPago, monto: 1060 }],
  });
  igual("una modalidad de otro padre no existe", modAjena.status, 404);
  igual("y se dice por qué", modAjena.code, "MODALIDAD_INEXISTENTE");

  await prisma.medioCobroModalidadLocal.update({ where: { id: modUnPago }, data: { activo: false } });
  const inactiva = await cobrar({
    formaPago: "credito", totalPantalla: 1040,
    pagos: [{ medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: 1040 }],
  });
  igual("una modalidad desactivada mientras el POS estaba abierto se rechaza", inactiva.status, 409);
  igual("con un conflicto que se entiende", inactiva.code, "MODALIDAD_INACTIVA");
  await prisma.medioCobroModalidadLocal.update({ where: { id: modUnPago }, data: { activo: true } });

  const legacyAmbiguo = await cobrar({ formaPago: "mercadopago", totalPantalla: 1000 });
  igual("un POS viejo NO puede cobrar por Mercado Pago salteando las modalidades", legacyAmbiguo.status, 409);
  igual("y se le dice que refresque", legacyAmbiguo.code, "MODALIDAD_REQUERIDA");

  igual("ninguno de los cuatro rechazos creó una venta",
    await ventasDelLocal(), antesDeLosRechazos);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("9. Lo legacy inequívoco sigue funcionando exactamente igual");

  const ventaEfectivo = await cobrar({ formaPago: "efectivo", totalPantalla: 1000 });
  ok("una venta legacy en efectivo se registra", ventaEfectivo.ok === true, ventaEfectivo.error);
  igualPlata("sin recargo", ventaEfectivo.breakdown?.total, 1000);
  const pagoEfectivo = await prisma.ventaPago.findFirst({ where: { ventaId: ventaEfectivo.ventaId } });
  igual("y sin identidad inventada: los cinco en null",
    [pagoEfectivo.medioCobroLocalId, pagoEfectivo.medioNombre, pagoEfectivo.procesador,
     pagoEfectivo.modalidadId, pagoEfectivo.modalidadNombre],
    [null, null, null, null, null]);

  const ventaLegacyCredito = await cobrar({
    formaPago: "credito", totalPantalla: 1060,
    pagos: [{ medio: "CREDITO", monto: 1060 }],
  });
  ok("y un crédito legacy también, aunque Mercado Pago tenga modalidades CREDITO adentro",
    ventaLegacyCredito.ok === true, ventaLegacyCredito.error);
  igualPlata("con el recargo del tipo contable, que es lo que siempre hizo",
    ventaLegacyCredito.breakdown?.recargoPagoPct, 6);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("10. TOTAL_DESACTUALIZADO cuando cambia una modalidad");

  // 1. El POS vio 1040 con la modalidad al 4 %.
  const totalQueVioElCajero = 1040;

  // 2. El admin la sube a 9 % mientras el carrito está abierto.
  await leer(
    await rutaModalidad.PATCH(
      pedido(`http://ci/api/medios-cobro/${medioMP.id}/modalidades/${modUnPago}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { recargoPct: 9 },
      }),
      params(medioMP.id, modUnPago)
    )
  );

  const antesDelChoque = await ventasDelLocal();
  const pagosAntes = await prisma.ventaPago.count({ where: { venta: { localId: localA.id } } });

  // 3. El POS manda su selección con el total viejo.
  const desactualizado = await cobrar({
    formaPago: "credito",
    totalPantalla: totalQueVioElCajero,
    pagos: [{ medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: totalQueVioElCajero }],
  });

  igual("la venta se RECHAZA", desactualizado.status, 409);
  igual("con el código que el POS sabe leer", desactualizado.code, "TOTAL_DESACTUALIZADO");
  igualPlata("y se responde el total nuevo, releído de la modalidad", desactualizado.totalEsperado, 1090);
  igualPlata("con el porcentaje nuevo en el desglose", desactualizado.breakdown?.recargoPagoPct, 9);
  igual("y quién lo impone, con las mismas palabras que quedarían en la venta",
    [desactualizado.breakdown?.recargoPagoMedioNombre, desactualizado.breakdown?.recargoPagoModalidadNombre],
    ["Mercado Pago", "Crédito 1 pago"]);
  igualPlata("NO se acepta el total que mandó el navegador", desactualizado.totalPantalla, 1040);

  igual("no se creó ninguna Venta", await ventasDelLocal(), antesDelChoque);
  igual("ni ningún VentaPago",
    await prisma.ventaPago.count({ where: { venta: { localId: localA.id } } }), pagosAntes);

  // 4. Y con el total nuevo a la vista, la venta entra.
  const reintento = await cobrar({
    formaPago: "credito",
    totalPantalla: 1090,
    pagos: [{ medioCobroLocalId: medioMP.id, modalidadId: modUnPago, monto: 1090 }],
  });
  ok("confirmando el número nuevo, la venta se registra", reintento.ok === true, reintento.error);
  igualPlata("por el importe correcto", reintento.breakdown?.total, 1090);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("11. El preview y el backend dan el MISMO número");

  const mediosFinales = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  const previewFinal = totalesPorOpcionDeCobro({ carrito, medios: mediosFinales });

  for (const [clave, esperado] of [
    [`mod:${modUnPago}`, { modalidadId: modUnPago }],
    [`mod:${modCuotas}`, { modalidadId: modCuotas }],
    [`medio:${medioCredito.id}`, { modalidadId: null }],
  ]) {
    const p = previewFinal[clave];
    const cobrada = await cobrar({
      formaPago: "credito",
      totalPantalla: p.total,
      pagos: [{ medioCobroLocalId: p.medioCobroLocalId, modalidadId: esperado.modalidadId, monto: p.total }],
    });
    ok(`${p.modalidadNombre || p.medioNombre}: la venta entra con el total del preview`,
      cobrada.ok === true, cobrada.error);
    igualPlata(`${p.modalidadNombre || p.medioNombre}: preview === backend`, cobrada.breakdown?.total, p.total);
  }

  // Y una modalidad que el POS no ofrece no puede tener preview: el botón padre
  // de Mercado Pago abre el selector, no cobra.
  igual("el medio con modalidades no aparece como opción cobrable",
    previewFinal[`medio:${medioMP.id}`], undefined);
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
try {
  if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }
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
