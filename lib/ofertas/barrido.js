// lib/ofertas/barrido.js
//
// EL BARRIDO, EN UN SOLO LUGAR.
//
// Compara los costos de referencia congelados en las líneas contra los de hoy,
// marca lo que cambió, desmarca lo que volvió, y emite los avisos.
//
// ── POR QUÉ SALIÓ DE LA RUTA ───────────────────────────────────────────────
//
// Vivía entero dentro de `app/api/ofertas/barrido/route.js`. Mientras el único
// disparador era esa ruta, alcanzaba. Ahora hay tres:
//
//   1. la pantalla de Ofertas, que sigue llamando a la ruta;
//   2. CUALQUIER escritura que cambie un costo, por evento;
//   3. la apertura del POS, para el aviso de vencimiento.
//
// Un `route.js` de Next no puede exportar otra cosa que sus handlers, así que
// dejarlo ahí obligaba a reescribirlo en los otros dos. Tres copias de la regla
// que decide cuándo una oferta pide revisión no se rompen el día que se
// escriben: se rompen el día que una cambia.
//
// ── LO QUE SIGUE SIENDO CIERTO ─────────────────────────────────────────────
//
// Marca y desmarca líneas y crea notificaciones. NO toca un solo precio. El
// precio publicado en la góndola es un compromiso con quien entró al local por
// él; moverlo porque subió una factura es cambiarlo a espaldas de quien lo
// decidió. La decisión sigue siendo humana.

import { planDeRevision, resumenCambioDeCosto } from "./revision.js";
import { referenciasDeProducto } from "./servidor.js";
import { avisosDelBarrido, TIPO_NOTIFICACION, HORAS_AVISO_VENCIMIENTO } from "./notificaciones.js";
import { crearNotificacion } from "@/lib/notificaciones/crearNotificacion";

/**
 * CADA CUÁNTO PUEDE VOLVER A CORRER POR LA MISMA UBICACIÓN.
 *
 * Vive acá y no en el POS: si el número estuviera en un componente, cambiarlo
 * pediría tocar una pantalla, y el día que haya dos superficies que disparan el
 * barrido habría dos números que se pueden ir separando.
 *
 * Quince minutos sale de para qué sirve el disparo del POS: avisar de un
 * vencimiento dentro de una ventana de 24 horas. Correrlo cuatro veces por hora
 * es de sobra, y evita que abrir y cerrar la pantalla lo dispare cada vez.
 *
 * El disparo por CAMBIO DE COSTO no pasa por acá: ese es un evento y corre
 * siempre (`forzar: true`). Un costo que cambió y no se avisa porque hace diez
 * minutos corrió el barrido sería justo el caso que esto viene a resolver.
 */
export const MINUTOS_ENTRE_BARRIDOS = 15;

/**
 * Última corrida por ubicación. En memoria del proceso a propósito: es una
 * CACHÉ, no un hecho. Si el contenedor se reinicia, el peor caso es que el
 * barrido corra una vez de más — y el barrido es idempotente, así que una vez de
 * más no produce ni una marca ni un aviso duplicado. Guardarlo en la base sería
 * una escritura por apertura de POS para ahorrar una lectura.
 */
const ultimaCorrida = new Map();

/** ¿Le toca correr a esta ubicación, o corrió hace muy poco? */
export function correspondeCorrer(localId, { ahora = Date.now(), minutos = MINUTOS_ENTRE_BARRIDOS } = {}) {
  const previa = ultimaCorrida.get(Number(localId));
  if (previa == null) return true;
  return ahora - previa >= minutos * 60 * 1000;
}

/** Para los candados: deja el acelerador como estaba. */
export function _reiniciarAcelerador() {
  ultimaCorrida.clear();
}

/**
 * Corre el barrido para una o varias ubicaciones.
 *
 * @param {*} db cliente Prisma
 * @param {object} args
 * @param {number} args.grupoId
 * @param {number[]} args.localIds ubicaciones a barrer
 * @param {boolean} [args.forzar] saltear el acelerador (el disparo por evento)
 * @param {Date} [args.ahora]
 * @returns {Promise<{ofertas:number, marcadas:number, desmarcadas:number, avisos:number, salteado?:boolean}>}
 */
export async function ejecutarBarrido(db, { grupoId, localIds, forzar = false, ahora = new Date() } = {}) {
  const ids = [...new Set((localIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0 || !grupoId) {
    return { ofertas: 0, marcadas: 0, desmarcadas: 0, avisos: 0 };
  }

  const aBarrer = forzar ? ids : ids.filter((id) => correspondeCorrer(id));
  if (aBarrer.length === 0) {
    return { ofertas: 0, marcadas: 0, desmarcadas: 0, avisos: 0, salteado: true };
  }
  for (const id of aBarrer) ultimaCorrida.set(id, Date.now());

  // ── LO QUE SE MIRA, Y POR QUÉ ES BARATO ──────────────────────────────────
  //
  // Solo las ofertas que rigen o van a regir, de estas ubicaciones. Una
  // finalizada no tiene nada que revisar y una vencida tampoco: su precio ya no
  // se aplica. El costo del barrido lo fija la cantidad de LÍNEAS DE OFERTAS
  // VIVAS —decenas—, no el tamaño del catálogo. Por eso puede colgarse de la
  // apertura del POS sin convertirla en un escaneo del ERP.
  //
  // El índice `[localId, inicioEn, finEn]` de `Oferta` cubre este WHERE.
  const ofertas = await db.oferta.findMany({
    where: {
      localId: { in: aBarrer },
      finalizadaEn: null,
      publicadaEn: { not: null },
      finEn: { gt: ahora },
    },
    include: { lineas: true },
  });

  if (ofertas.length === 0) {
    return { ofertas: 0, marcadas: 0, desmarcadas: 0, avisos: 0 };
  }

  const todasLasLineas = ofertas.flatMap((o) => o.lineas);
  const localDeOferta = new Map(ofertas.map((o) => [o.id, o.localId]));

  // Las referencias se piden POR UBICACIÓN: un mismo productoLocalId pertenece a
  // un solo local, pero la consulta filtra por local y mezclarlos devolvería
  // vacío para los de la otra ubicación.
  const actuales = {};
  for (const localId of aBarrer) {
    const lineasDeEsta = ofertas
      .filter((o) => o.localId === localId)
      .flatMap((o) => o.lineas)
      .map((l) => l.productoLocalId);
    if (lineasDeEsta.length === 0) continue;
    Object.assign(actuales, await referenciasDeProducto(db, { localId, productoLocalIds: lineasDeEsta }));
  }

  // El costo de hoy, por línea. Una línea cuyo producto ya no está en el local
  // se queda afuera del mapa y `planDeRevision` no la toca en ninguna dirección:
  // sin costo actual no hay comparación que hacer.
  const costoPorLinea = {};
  for (const l of todasLasLineas) {
    const ref = actuales[l.productoLocalId];
    if (ref) costoPorLinea[l.id] = ref.costo;
  }

  const plan = planDeRevision(todasLasLineas, costoPorLinea);

  if (plan.marcar.length > 0) {
    // `costoAlDetectar` se escribe una por una y no con un updateMany porque
    // cada línea tiene su propio costo.
    await db.$transaction(
      plan.marcar.map((lineaId) =>
        db.ofertaLinea.update({
          where: { id: lineaId },
          data: { revisionPendienteDesde: ahora, costoAlDetectar: costoPorLinea[lineaId] },
        })
      )
    );
  }

  if (plan.desmarcar.length > 0) {
    // El costo volvió al de referencia —típicamente una carga equivocada que se
    // corrigió—. La marca se levanta sola: sin esto, un error de tipeo dejaría la
    // oferta en REVISAR para siempre.
    await db.ofertaLinea.updateMany({
      where: { id: { in: plan.desmarcar } },
      data: { revisionPendienteDesde: null, costoAlDetectar: null },
    });
  }

  // ── Avisos ───────────────────────────────────────────────────────────────
  const previas = await db.notificacion.findMany({
    where: {
      grupoId,
      tipo: TIPO_NOTIFICACION.POR_VENCER,
      entidadTipo: "Oferta",
      entidadId: { in: ofertas.map((o) => o.id) },
      createdAt: { gte: new Date(ahora.getTime() - HORAS_AVISO_VENCIMIENTO * 60 * 60 * 1000 * 2) },
    },
    select: { entidadId: true, createdAt: true },
  });

  const detalleLineas = {};
  for (const lineaId of plan.marcar) {
    const linea = todasLasLineas.find((l) => l.id === lineaId);
    const ref = actuales[linea.productoLocalId];
    detalleLineas[lineaId] = {
      nombre: ref?.nombre || `#${linea.productoLocalId}`,
      resumen: resumenCambioDeCosto({
        costoReferencia: linea.costoReferencia,
        costoActual: costoPorLinea[lineaId],
        precioOferta: linea.precioOferta,
        precioNormalReferencia: linea.precioNormalReferencia,
      }),
    };
  }

  const avisos = avisosDelBarrido({
    ofertas,
    lineasRecienMarcadas: plan.marcar,
    notificacionesPrevias: previas,
    detalleLineas,
    ahora,
  });

  for (const aviso of avisos) {
    await crearNotificacion({
      grupoId,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      href: `/modulos/ofertas/${aviso.ofertaId}`,
      entidadTipo: "Oferta",
      entidadId: aviso.ofertaId,
      // La oferta es de UN local: el aviso también. Un encargado de otra boca no
      // tiene por qué ver que a ésta le cambió un costo.
      alcance: "LOCAL",
      localId: localDeOferta.get(aviso.ofertaId),
      // Y dentro del local, SOLO quien puede ver ofertas.
      //
      // Es lo que hace que el disparo desde el POS sea inofensivo: un cajero con
      // `pos.usar` puede provocar técnicamente el barrido al abrir la pantalla,
      // y no por eso ve una sola de estas notificaciones ni gana acceso a nada
      // de Ofertas. Quien dispara y quién ve son dos preguntas distintas.
      permisoRequerido: "ofertas.ver",
    });
  }

  return {
    ofertas: ofertas.length,
    marcadas: plan.marcar.length,
    desmarcadas: plan.desmarcar.length,
    avisos: avisos.length,
  };
}
