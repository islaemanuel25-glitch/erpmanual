// SIEMBRA LA BASE DESCARTABLE CON LA QUE SE VERIFICA LA RECEPCIÓN MÓVIL V15.
//
//   DATABASE_URL=postgresql://…@localhost:5432/erpazul_v15 \
//     node scripts/sembrar-v15-recepcion.mjs
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────
//
// La verificación del V15 necesita un navegador tocando la pantalla de verdad:
// tocar "Coincide", mover el contador hasta que aparezca el motivo, elegirlo, y
// comprobar que el botón de abajo se destraba. Eso ESCRIBE —`revisar-producto`
// persiste— así que no puede correr contra producción.
//
// Y no puede correr contra `erpazul_revision`: esa base tiene otro linaje de
// migraciones —55 aplicadas, la última del 2026-08-02, contra las 10 del árbol—
// así que no tiene ni `revisadoEnRecepcion` ni `motivoPrincipal`. No está
// atrasada: es otra historia, y `migrate deploy` no la trae para acá.
//
// De ahí esta base: se crea vacía, se le aplican las migraciones del árbol, y se
// le siembra lo MÍNIMO para que la pantalla tenga algo real que mostrar.
//
// ── LAS CUATRO LÍNEAS SON CUATRO CASOS, NO CUATRO IGUALES ────────────────
//
// Cuatro líneas idénticas probarían cuatro veces lo mismo. Estas cubren los
// cuatro estados que el diseño distingue, y entre las dos reglas que hay que
// ejercer —el motivo obligatorio y el destrabe del cierre— no queda ninguna sin
// tocar:
//
//   1 · UNIDAD, 10 enviadas         → la secuencia toca "Coincide"
//   2 · PACK x24, 6 packs           → baja el contador  → FALTANTE con motivo
//   3 · CAJÓN x12, 5 cajones        → sube el contador  → SOBRANTE con motivo
//   4 · PACK x6, 4 packs + 3 sueltas→ ya nace con diferencia POR LAS SUELTAS
//
// La cuarta viene con la recepción ya cargada a propósito. Es el caso que un
// contador de un solo número no puede producir —6 packs y 1 suelta contra 6
// packs enviados es diferencia aunque los dos números de packs sean 6— y
// sembrarlo así lo pone en pantalla sin tener que encadenar un modal, que es lo
// que el arnés tiene documentado que le cuelga la corrida.
//
// ── IDEMPOTENTE ──────────────────────────────────────────────────────────
//
// Se puede correr las veces que haga falta: borra lo que sembró antes —por sus
// nombres, no por id— y lo vuelve a crear. Así la secuencia arranca siempre del
// mismo estado y una corrida no contamina a la siguiente.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

/** Lo que el arnés espera encontrar. Si cambia, cambia el comando de la corrida. */
export const SEMBRADO = Object.freeze({
  grupo: "Grupo V15",
  deposito: "Depósito V15",
  destino: "Local V15",
  rol: "Recepción V15",
  usuario: "v15@local",
});

const log = (...a) => console.log(...a);

// ── 1 · BORRAR LO DE LA CORRIDA ANTERIOR ─────────────────────────────────
//
// Por nombre y no por id: los ids cambian en cada siembra y borrar por id
// dejaría basura la segunda vez. El orden respeta las claves foráneas.
const grupoViejo = await prisma.grupo.findUnique({ where: { nombre: SEMBRADO.grupo } });
if (grupoViejo) {
  const locales = await prisma.local.findMany({
    where: { nombre: { in: [SEMBRADO.deposito, SEMBRADO.destino] } },
    select: { id: true },
  });
  const ids = locales.map((l) => l.id);
  await prisma.transferenciaDetalle.deleteMany({
    where: { transferencia: { origenId: { in: ids } } },
  });
  await prisma.transferencia.deleteMany({ where: { origenId: { in: ids } } });
  await prisma.stockLocal.deleteMany({ where: { localId: { in: ids } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: ids } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: grupoViejo.id } });
  await prisma.usuario.deleteMany({ where: { email: SEMBRADO.usuario } });
  await prisma.rol.deleteMany({ where: { nombre: SEMBRADO.rol } });
  await prisma.local.deleteMany({ where: { id: { in: ids } } });
  await prisma.grupo.delete({ where: { id: grupoViejo.id } });
  log("· limpieza de la siembra anterior: hecha");
}

// ── 2 · LA ESTRUCTURA MÍNIMA ─────────────────────────────────────────────
const grupo = await prisma.grupo.create({ data: { nombre: SEMBRADO.grupo } });

// ── EL LOCAL NO LLEVA `grupoId`: EL VÍNCULO ES UNA TABLA APARTE ──────────
//
// Y son DOS tablas, no una: `GrupoLocal` para los locales y `GrupoDeposito`
// para los depósitos. `getGrupoIdDeLocal` las consulta en ese orden, y si el
// vínculo falta devuelve null — con lo que `AuditoriaStock.grupoId`, que es
// obligatorio, hace fallar la confirmación adentro de la transacción.
const deposito = await prisma.local.create({
  data: { nombre: SEMBRADO.deposito, tipo: "deposito", es_deposito: true },
});
const destino = await prisma.local.create({
  data: { nombre: SEMBRADO.destino, tipo: "local", es_deposito: false },
});
await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: destino.id } });

// El rol lleva `["*"]` porque lo que se está verificando es la PANTALLA, no el
// sistema de permisos. El arnés además firma los permisos en el token.
const rol = await prisma.rol.create({ data: { nombre: SEMBRADO.rol, permisos: ["*"] } });

// El usuario tiene que EXISTIR en la base aunque el arnés firme la sesión a
// mano: `revisar-producto` escribe `revisadoEnRecepcionPorId`, que es una clave
// foránea. Sin la fila, la primera revisión falla con un error de integridad.
//
// El hash es de una clave que no se usa: el arnés no hace login, firma el JWT.
// Se guarda igual porque la columna es obligatoria.
const usuario = await prisma.usuario.create({
  data: {
    nombre: "Operador V15",
    email: SEMBRADO.usuario,
    passwordHash: "$2b$10$sinUsoPorqueElArnesFirmaElTokenAManoXXXXXXXXXXXXXXXXXXXXX",
    rolId: rol.id,
    localId: destino.id,
  },
});

// ── 3 · LOS CUATRO PRODUCTOS ─────────────────────────────────────────────
const PRODUCTOS = [
  { clave: "coincide", nombre: "V15 Coincide UNIDAD", unidad_medida: "unidad", factor_pack: null, costo: 500 },
  { clave: "faltante", nombre: "V15 Faltante PACK", unidad_medida: "pack", factor_pack: 24, costo: 5250 },
  { clave: "sobrante", nombre: "V15 Sobrante CAJON", unidad_medida: "cajon", factor_pack: 12, costo: 8400 },
  { clave: "sueltas", nombre: "V15 Sueltas PACK", unidad_medida: "pack", factor_pack: 6, costo: 1800 },
  // ── EL QUINTO NO VA EN EL REMITO, Y ÉSE ES EL PUNTO ──────────────────
  //
  // Está en el catálogo del origen y NO en la transferencia: es el único que
  // puede ejercer el camino del no declarado. Sin él, buscar cualquier cosa
  // daba "tampoco está en el catálogo" y la verificación del V16 no tenía con
  // qué probar que agregar desde el catálogo funciona.
  {
    clave: "noDeclarado",
    nombre: "V15 NoDeclarado KG",
    unidad_medida: "kg",
    factor_pack: null,
    costo: 10120,
    fueraDelRemito: true,
  },
];

const base = {};
for (const p of PRODUCTOS) {
  base[p.clave] = await prisma.productoBase.create({
    data: {
      grupoId: grupo.id,
      nombre: p.nombre,
      unidad_medida: p.unidad_medida,
      factor_pack: p.factor_pack,
      precio_costo: p.costo,
      precio_venta: p.costo,
      modoCompraProveedor: "BULTO",
      // `PESO` y no `UNIDAD`: el enum tiene dos valores, PIEZA y PESO. Ninguno
      // de estos cuatro productos es fiambre de pieza fija —`pesoEsFijo: false`
      // y sin `pesoReferenciaKg`— así que la rama de conversión por kilo no se
      // activa y el valor acá no cambia ninguna cuenta.
      modoVentaDeposito: "PESO",
      pesoEsFijo: false,
    },
  });
}

/** Una fila de catálogo por local, y stock suficiente en el origen. */
const local = {};
for (const p of PRODUCTOS) {
  for (const l of [deposito, destino]) {
    const fila = await prisma.productoLocal.create({
      data: { localId: l.id, baseId: base[p.clave].id, precio_costo: p.costo, precio_venta: p.costo },
    });
    if (l.id === deposito.id) {
      local[p.clave] = fila;
      // Stock holgado: el sobrante descuenta MÁS del origen al confirmar, y sin
      // margen la confirmación se rechazaría por stock insuficiente.
      await prisma.stockLocal.create({
        data: { localId: l.id, productoId: fila.id, cantidad: 10000, enTransito: 0 },
      });
    }
  }
}

// ── 4 · EL REMITO ────────────────────────────────────────────────────────
//
// "Enviada" y no "Recibiendo": es el estado en el que llega un remito al local,
// y el que la pantalla de recepción espera para dejar contar.
const transferencia = await prisma.transferencia.create({
  data: {
    origenId: deposito.id,
    destinoId: destino.id,
    estado: "Enviada",
    fechaEnvio: new Date(),
    creadaPor: usuario.id,
  },
});

/**
 * Las cuatro líneas. `cantidad` va SIEMPRE en unidades físicas —es la que
 * mantiene paridad con el descuento de stock— y el snapshot dice en qué
 * presentación salió. Las dos mitades juntas o ninguna: sin el snapshot, "6 PACK
 * x24" vuelve a leerse como 144 unidades sueltas.
 */
const LINEAS = [
  {
    clave: "coincide",
    cantidad: 10, presentacionEnvio: "UNIDAD", cantidadPresentada: 10,
    factorPresentacion: null, sueltasEnviadas: 0, precioCosto: 500,
    recibido: null, recibidoUnidadesSueltas: null,
  },
  {
    clave: "faltante",
    cantidad: 144, presentacionEnvio: "PACK", cantidadPresentada: 6,
    factorPresentacion: 24, sueltasEnviadas: 0, precioCosto: 5250,
    recibido: null, recibidoUnidadesSueltas: null,
  },
  {
    clave: "sobrante",
    cantidad: 60, presentacionEnvio: "CAJON", cantidadPresentada: 5,
    factorPresentacion: 12, sueltasEnviadas: 0, precioCosto: 8400,
    recibido: null, recibidoUnidadesSueltas: null,
  },
  {
    // La única que nace con recepción cargada: 4 packs de 6 son 24, más 3
    // sueltas son 27 contra 24 enviadas. Diferencia por las SUELTAS, que es lo
    // que un contador de un solo número no puede producir.
    clave: "sueltas",
    cantidad: 24, presentacionEnvio: "PACK", cantidadPresentada: 4,
    factorPresentacion: 6, sueltasEnviadas: 0, precioCosto: 1800,
    recibido: 4, recibidoUnidadesSueltas: 3,
  },
];

for (const l of LINEAS) {
  await prisma.transferenciaDetalle.create({
    data: {
      transferenciaId: transferencia.id,
      productoId: local[l.clave].id,
      cantidad: l.cantidad,
      recibido: l.recibido,
      recibidoUnidadesSueltas: l.recibidoUnidadesSueltas,
      precioCosto: l.precioCosto,
      unidadEnviada: "UNIDAD",
      presentacionEnvio: l.presentacionEnvio,
      cantidadPresentada: l.cantidadPresentada,
      factorPresentacion: l.factorPresentacion,
      sueltasEnviadas: l.sueltasEnviadas,
    },
  });
  // El origen ya despachó: la mercadería está en tránsito, no en la góndola.
  await prisma.stockLocal.update({
    where: { localId_productoId: { localId: deposito.id, productoId: local[l.clave].id } },
    data: { cantidad: { decrement: l.cantidad }, enTransito: { increment: l.cantidad } },
  });
}

log("");
log("SEMBRADO LISTO");
log(`  fuera del remito: ${PRODUCTOS.find((p) => p.fueraDelRemito).nombre}`);
log(`  transferencia : ${transferencia.id}`);
log(`  usuario       : ${usuario.id}  (${SEMBRADO.usuario})`);
log(`  local destino : ${destino.id}  (${SEMBRADO.destino})`);
log(`  local origen  : ${deposito.id}  (${SEMBRADO.deposito})`);
log("");
log("  El arnés se corre con esos tres números:");
log(`    --transferencia ${transferencia.id} --usuario ${usuario.id} --local ${destino.id}`);

await prisma.$disconnect();
