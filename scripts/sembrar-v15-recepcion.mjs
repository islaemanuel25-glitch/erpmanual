// SIEMBRA LA BASE DESCARTABLE CON LA QUE SE VERIFICA LA RECEPCIÓN MÓVIL V15.
//
//   DATABASE_URL=postgresql://…@localhost:5432/erpazul_v15 \
//     node --import ./scripts/alias-loader.mjs scripts/sembrar-v15-recepcion.mjs
//
// El `--import` NO es opcional desde el 2026-09-14: la siembra calcula el
// período cerrado con la misma función que la pantalla, y ésa resuelve un alias
// `@/`. Sin el loader aborta al importar. El motivo largo está abajo.
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

// ── SE CORRE CON EL LOADER DE ALIAS, Y NO ES UN CAPRICHO ─────────────────
//
// Esta línea importa el MISMO `rangoDelPeriodoCerrado` que usa la pantalla, y
// ese módulo resuelve `@/lib/fechas/rangoArgentina`. Sin el loader el alias no
// existe fuera de Next y la siembra aborta al importar.
//
// La alternativa era calcular acá la semana anterior a mano, y eso es
// exactamente lo que la regla 1 prohíbe: una función parecida al lado de la que
// decide. Si el corte cambia de definición, la siembra tiene que moverse con
// él, o la base de pruebas queda sembrando en un período que la pantalla no
// mira — y entonces las afirmaciones del arnés se vuelven inalcanzables sin
// ponerse rojas.
//
// Va DESPUÉS de la fábrica de Prisma a propósito: la fábrica tiene que
// importarse antes que cualquier cosa que arrastre a `@prisma/client`. Éste no
// lo arrastra —`periodoDePago` es aritmética de fechas— y aun así el orden se
// respeta, porque el día que alguien agregue un import acá el orden ya está bien.
import {
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  rangoDelPeriodoCerrado,
} from "../lib/transferencias/periodoDePago.js";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

/** Lo que el arnés espera encontrar. Si cambia, cambia el comando de la corrida. */
export const SEMBRADO = Object.freeze({
  grupo: "Grupo V15",
  deposito: "Depósito V15",
  destino: "Local V15",
  // ── EL SEGUNDO LOCAL NO RECIBE NADA, Y ÉSE ES EL PUNTO ─────────────────
  //
  // Existe para que la lista de trabajo tenga un local SIN MOVIMIENTO que
  // mostrar. Con un solo local sembrado, la corrección del 2026-09-13 —que
  // todos los locales del grupo aparecen, tengan o no transferencias— no se
  // puede ejercer: el caso que arregla no ocurre en la base de pruebas.
  //
  // Es la forma del dato REAL: en producción hay cuatro locales y uno solo con
  // movimiento en la semana. Sembrar solo el que recibe habría dejado el
  // candado del navegador probando el caso que nunca falla.
  //
  // No entra en ninguna transferencia, así que el arnés de recepción no lo ve.
  destinoSinMovimiento: "Local V15 sin movimiento",
  // ── EL LOCAL QUE NO OPERA POR TRANSFERENCIA ────────────────────────────
  //
  // Existe en el grupo y está activo, pero NO tiene cliente vinculado: al que
  // no tiene ese vínculo se le VENDE y nada más. Es el caso del local recién
  // cargado, y tiene que quedar FUERA de la lista de trabajo y de los destinos.
  //
  // Sin él, ese filtro no se podría ejercer en el navegador: los otros dos
  // locales sembrados sí operan, así que el caso nunca ocurriría.
  destinoSinVinculo: "Local V15 sin vínculo",
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
    // El local sin movimiento entra en la limpieza como los otros dos: si
    // quedara de una corrida anterior, la siembra siguiente lo encontraría
    // duplicado y la lista mostraría dos locales con el mismo nombre.
    where: {
      nombre: {
        in: [
          SEMBRADO.deposito,
          SEMBRADO.destino,
          SEMBRADO.destinoSinMovimiento,
          SEMBRADO.destinoSinVinculo,
        ],
      },
    },
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
  // Los clientes vinculados a esos locales. Van ANTES que los locales: el
  // vínculo es `onDelete: SetNull`, así que borrar el local dejaría la ficha
  // huérfana en la base de pruebas y la siembra siguiente crearía otra al lado.
  await prisma.cliente.deleteMany({ where: { grupoId: grupoViejo.id } });
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
// El local que existe y no recibe nada. Ver el porqué en `SEMBRADO`.
const sinMovimiento = await prisma.local.create({
  data: { nombre: SEMBRADO.destinoSinMovimiento, tipo: "local", es_deposito: false },
});
// Y el que NO opera por transferencia: se queda sin cliente vinculado.
const sinVinculo = await prisma.local.create({
  data: { nombre: SEMBRADO.destinoSinVinculo, tipo: "local", es_deposito: false },
});
await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: destino.id } });
await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: sinMovimiento.id } });
await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: sinVinculo.id } });

// ── LOS CLIENTES VINCULADOS, QUE SON LO QUE DICE QUE UN LOCAL OPERA ───────
//
// `Cliente.localVinculadoId` es el criterio: sin ese vínculo, al local se le
// VENDE y no aparece en transferencias. Los dos primeros lo tienen; el tercero
// no, a propósito.
//
// Sin esto el sembrado dejaría el tablero VACÍO —ningún local operaría— y el
// arnés se caería sin decir por qué.
for (const local of [destino, sinMovimiento]) {
  await prisma.cliente.create({
    data: {
      grupoId: grupo.id,
      nombre: `Cliente de ${local.nombre}`,
      localVinculadoId: local.id,
    },
  });
}

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
  // ── EL PACK ROTO: CERO BULTOS ENTEROS Y UNA SUELTA ───────────────────
  //
  // El depósito rompió un pack y despachó suelto, así que esta línea SALIÓ POR
  // UNIDAD aunque el producto se compre en pack. El costo es el del PACK —8880,
  // igual que la línea real de producción— así que la unidad vale 1480 y los dos
  // números se distinguen: si la pantalla mostrara el precio equivocado, se ve.
  //
  // Es la combinación que el sembrado NO tenía: las cuatro líneas de arriba
  // tienen `sueltasEnviadas: 0`, y la que se llama "sueltas" las tiene del lado
  // RECIBIDO. Por eso el arnés no podía ver ni este caso ni el defecto que dejó
  // 6 packs contados sobre un envío sin packs —`INC-0008`—.
  //
  // El nombre NO lleva la palabra "pack" a propósito: el arnés afirma que la
  // tarjeta y el panel de esta línea no dicen "PACK" en ningún lado, y el nombre
  // del producto se dibuja adentro de la tarjeta. Con "V15 PackRoto PACK" esa
  // afirmación habría dado rojo por el nombre y no por el defecto.
  { clave: "packRoto", nombre: "V15 Bulto Roto", unidad_medida: "pack", factor_pack: 6, costo: 8880 },
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
  {
    // EL PACK ROTO, sin contar: cero packs enteros y una unidad suelta. La
    // cantidad física es 1 —0 × 6 + 1—, que es la que el origen puso en tránsito.
    //
    // Sin contar a propósito: lo que hay que poder medir es cómo ABRE el panel,
    // y con un conteo cargado esa pregunta ya estaría contestada por lo guardado.
    clave: "packRoto",
    cantidad: 1, presentacionEnvio: "PACK", cantidadPresentada: 0,
    factorPresentacion: 6, sueltasEnviadas: 1, precioCosto: 8880,
    recibido: null, recibidoUnidadesSueltas: null,
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

// ── 5 · UNA TRANSFERENCIA YA RECIBIDA, DE OTRO DÍA ───────────────────────
//
// Existe para dos cosas que sin ella no se pueden ejercer en el navegador:
//
//   · el AGRUPADO POR DÍA. Con un solo remito hay una sola banda, y "se agrupan
//     por día" se afirmaría sobre el caso que no puede fallar. Ésta va con
//     fecha de AYER, así que la lista tiene dos bandas y se puede comprobar que
//     la más reciente va primero.
//   · la RECIBIDA QUE SE ABRE, que es el defecto principal de esta vuelta. La
//     otra está `Enviada`, así que su control es "Recibir" y nunca mostraría el
//     camino al detalle.
//
// Llega CON UNA DIFERENCIA a propósito —se recibieron 5 de 6 packs— para que el
// conteo de la cabecera tenga algo que contar y no se afirme siempre sobre cero.
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const recibida = await prisma.transferencia.create({
  data: {
    origenId: deposito.id,
    destinoId: destino.id,
    estado: "Recibida",
    fechaEnvio: AYER,
    fechaRecepcion: AYER,
    creadaPor: usuario.id,
    // La columna se escribe como la escribiría `confirmar-recepcion`. La
    // pantalla NO la usa —cuenta las líneas— y se pone igual para que el dato
    // de prueba tenga la forma del dato real.
    tieneDiferencias: true,
  },
});

for (const l of [
  { clave: "coincide", cantidad: 10, recibido: 10, precioCosto: 500 },
  // 6 PACK x24: salieron 144 y llegaron 120. Una línea con diferencia.
  { clave: "faltante", cantidad: 144, recibido: 5, precioCosto: 8000,
    presentacionEnvio: "PACK", cantidadPresentada: 6, factorPresentacion: 24 },
]) {
  await prisma.transferenciaDetalle.create({
    data: {
      transferenciaId: recibida.id,
      productoId: local[l.clave].id,
      cantidad: l.cantidad,
      recibido: l.recibido,
      precioCosto: l.precioCosto,
      unidadEnviada: "UNIDAD",
      presentacionEnvio: l.presentacionEnvio ?? null,
      cantidadPresentada: l.cantidadPresentada ?? null,
      factorPresentacion: l.factorPresentacion ?? null,
      revisadoEnRecepcion: true,
      revisadoEnRecepcionPorId: usuario.id,
      revisadoEnRecepcionAt: AYER,
      fechaRecepcion: AYER,
      confirmadoPorId: usuario.id,
    },
  });
}

// ── 6 · DOS TRANSFERENCIAS EN EL PERÍODO CERRADO ─────────────────────────
//
// ── POR QUÉ HIZO FALTA AGREGARLAS ────────────────────────────────────────
//
// Las dos de arriba son de HOY y de AYER, así que caen en el período EN CURSO.
// Hasta la segunda vuelta eso alcanzaba, porque la pantalla mostraba el período
// en curso. Desde la tercera muestra el CERRADO —la pregunta es cuánto hay que
// cobrar, y eso se contesta con el período terminado— y con esta base el bloque
// habría salido siempre vacío.
//
// Y ahí está el daño, que no es que falte una foto: las afirmaciones del arnés
// sobre el agrupado por día, sobre la recibida con diferencia y sobre el
// buscador quedarían mirando una lista que nunca tiene filas. No se pondrían
// rojas: se volverían INALCANZABLES, que es el defecto que más se repite en
// este proyecto y el que no avisa.
//
// ── LAS FECHAS SALEN DE LA PUERTA, NO DE UNA RESTA ───────────────────────
//
// "Hace ocho días" NO sirve: si la siembra corre justo el día del corte, ocho
// días atrás cae en el período anterior al cerrado y las filas se van de la
// pantalla. Se le pregunta a `rangoDelPeriodoCerrado` cuál es el período con el
// corte POR DEFECTO —que es el que tienen los dos locales recién sembrados, sin
// acuerdo— y se siembra adentro.
//
// Van al mediodía argentino: el filtro de la ruta arma los bordes del rango en
// hora de Argentina, y las 15:00 UTC quedan lejos de los dos extremos. A
// medianoche UTC la fila caería en el día anterior acá y podría irse del rango.
const CERRADO = rangoDelPeriodoCerrado({
  unidad: UNIDADES.SEMANA,
  diaDeCorte: DIA_DE_CORTE_POR_DEFECTO,
});
const mediodiaDe = (iso) => new Date(`${iso}T15:00:00.000Z`);

// Dos DÍAS distintos adentro del período, para que el agrupado tenga dos bandas
// que agrupar. El último día del período y el anterior: los dos están adentro
// siempre, porque un período de semana tiene siete.
const ultimoDiaISO = CERRADO.hasta;
const anteriorISO = (() => {
  const d = new Date(`${CERRADO.hasta}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

/**
 * Una transferencia con dos líneas. `recibido` en `null` la deja SIN RECIBIR
 * —y con eso el total del período queda abierto, que es el aviso que hay que
 * poder ver—; con número, llega recibida.
 */
async function sembrarEnElCerrado({ iso, estado, recibidoDelSegundo }) {
  const fecha = mediodiaDe(iso);
  const recibida = estado === "Recibida";
  const t = await prisma.transferencia.create({
    data: {
      origenId: deposito.id,
      destinoId: destino.id,
      estado,
      fechaEnvio: fecha,
      fechaRecepcion: recibida ? fecha : null,
      creadaPor: usuario.id,
      // Se escribe como la escribiría `confirmar-recepcion`. La pantalla NO la
      // usa —cuenta las líneas— y se pone igual para que el dato de prueba
      // tenga la forma del dato real.
      tieneDiferencias: recibida ? recibidoDelSegundo !== 6 : false,
    },
  });
  for (const l of [
    { clave: "coincide", cantidad: 10, recibido: recibida ? 10 : null, precioCosto: 500 },
    // 6 PACK x24. Si llegan 5, la línea tiene diferencia y hay algo que contar.
    {
      clave: "faltante",
      cantidad: 144,
      recibido: recibida ? recibidoDelSegundo : null,
      precioCosto: 8000,
      presentacionEnvio: "PACK",
      cantidadPresentada: 6,
      factorPresentacion: 24,
    },
  ]) {
    await prisma.transferenciaDetalle.create({
      data: {
        transferenciaId: t.id,
        productoId: local[l.clave].id,
        cantidad: l.cantidad,
        recibido: l.recibido,
        precioCosto: l.precioCosto,
        unidadEnviada: "UNIDAD",
        presentacionEnvio: l.presentacionEnvio ?? null,
        cantidadPresentada: l.cantidadPresentada ?? null,
        factorPresentacion: l.factorPresentacion ?? null,
        revisadoEnRecepcion: recibida,
        revisadoEnRecepcionPorId: recibida ? usuario.id : null,
        revisadoEnRecepcionAt: recibida ? fecha : null,
        fechaRecepcion: recibida ? fecha : null,
        confirmadoPorId: recibida ? usuario.id : null,
      },
    });
  }
  return t;
}

// La del último día llega RECIBIDA y con una diferencia: es la que se puede
// abrir y la que le da algo que contar a la cabecera.
const cerradaRecibida = await sembrarEnElCerrado({
  iso: ultimoDiaISO,
  estado: "Recibida",
  recibidoDelSegundo: 5,
});
// La del día anterior queda SIN RECIBIR, y eso es lo que mantiene el total del
// período ABIERTO. Sin una así, el aviso de "todavía puede cambiar" no se puede
// fotografiar nunca.
const cerradaPendiente = await sembrarEnElCerrado({
  iso: anteriorISO,
  estado: "Enviada",
  recibidoDelSegundo: null,
});

log("");
log("SEMBRADO LISTO");
log(`  fuera del remito: ${PRODUCTOS.find((p) => p.fueraDelRemito).nombre}`);
log(`  transferencia : ${transferencia.id}`);
log(`  período cerrado: ${CERRADO.desde} → ${CERRADO.hasta} (corte por defecto)`);
log(`    recibida con diferencia: ${cerradaRecibida.id}  (${ultimoDiaISO})`);
log(`    sin recibir            : ${cerradaPendiente.id}  (${anteriorISO})`);
log(`  usuario       : ${usuario.id}  (${SEMBRADO.usuario})`);
log(`  local destino : ${destino.id}  (${SEMBRADO.destino})`);
log(`  local en cero : ${sinMovimiento.id}  (${SEMBRADO.destinoSinMovimiento}) — sin transferencias, a propósito`);
log(`  local sin vínculo: ${sinVinculo.id}  (${SEMBRADO.destinoSinVinculo}) — SIN cliente vinculado: no opera por transferencia`);
log(`  local origen  : ${deposito.id}  (${SEMBRADO.deposito})`);
log("");
log("  Los arneses se corren con estos números:");
log(`    recepción: --transferencia ${transferencia.id} --usuario ${usuario.id} --local ${destino.id}`);
log(
  `    tablero  : --usuario ${usuario.id} --deposito ${deposito.id} --local ${destino.id} --recibida-cerrada ${cerradaRecibida.id}`
);

await prisma.$disconnect();
