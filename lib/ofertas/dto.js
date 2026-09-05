// lib/ofertas/dto.js
//
// De la fila de Prisma a lo que la pantalla necesita. Función pura: recibe filas
// ya leídas y devuelve objetos. No consulta nada.
//
// Vive separado de las rutas porque acá está TODO lo derivado —el estado, el
// porcentaje de descuento, el margen, el conteo de líneas por revisar— y eso es
// justo lo que conviene poder ejercer con candados sin levantar Postgres.

import { estadoOferta, ESTADO_OFERTA, estaPorVencer } from "./estados.js";
import { descuentoPctDesdePrecios, margenOferta } from "./precio.js";
import { resumenCambioDeCosto } from "./revision.js";
import { CONDICION_PAGO_LABEL } from "./vigencia.js";

/**
 * Tarjeta de la lista. Es lo que se ve sin abrir la oferta, y por eso lleva el
 * conteo de líneas por revisar: el aviso "2 productos cambiaron de costo" tiene
 * que verse SIN entrar, o nadie entra.
 */
export function ofertaParaLista(oferta, ahora = new Date()) {
  if (!oferta) return null;
  const lineas = Array.isArray(oferta.lineas) ? oferta.lineas : [];
  const porRevisar = lineas.filter((l) => l.revisionPendienteDesde != null).length;

  return {
    id: oferta.id,
    nombre: oferta.nombre,
    localId: oferta.localId,
    localNombre: oferta.local?.nombre ?? null,
    estado: estadoOferta(oferta, ahora),
    condicionPago: oferta.condicionPago,
    condicionPagoLabel: CONDICION_PAGO_LABEL[oferta.condicionPago] || oferta.condicionPago,
    inicioEn: oferta.inicioEn,
    finEn: oferta.finEn,
    cantidadProductos: oferta._count?.lineas ?? lineas.length,
    lineasPorRevisar: porRevisar,
    requiereRevision: porRevisar > 0,
    porVencer: estaPorVencer({ ...oferta, lineas }, { ahora }),
    observaciones: oferta.observaciones ?? null,
    finalizadaEn: oferta.finalizadaEn ?? null,
    publicadaEn: oferta.publicadaEn ?? null,
    renovadaDesdeId: oferta.renovadaDesdeId ?? null,
  };
}

/**
 * Una línea abierta, con todo lo derivado que la persona necesita para decidir:
 * qué vale hoy, qué costaba cuando se cargó, cuánto es el descuento y cuánto
 * queda de margen. `precioActual` y `costoActual` entran por afuera porque salen
 * del producto, no de la oferta.
 */
export function lineaParaDetalle(linea, { precioActual = null, costoActual = null } = {}) {
  if (!linea) return null;

  const precioOferta = Number(linea.precioOferta);
  const precioNormalRef = Number(linea.precioNormalReferencia);
  const costoRef = Number(linea.costoReferencia);
  const costoHoy = costoActual != null ? Number(costoActual) : costoRef;

  const margenHoy = margenOferta(precioOferta, costoHoy);
  const necesitaRevision = linea.revisionPendienteDesde != null;

  return {
    id: linea.id,
    productoLocalId: linea.productoLocalId,
    productoBaseId: linea.productoBaseId,
    nombre: linea.productoLocal?.nombre || linea.productoLocal?.base?.nombre || linea.nombre || "",

    // Lo que se cobra y lo que se dejó de cobrar.
    precioOferta,
    descuentoPct: descuentoPctDesdePrecios(precioNormalRef, precioOferta),

    // Las fotos del momento de la carga o de la última revisión.
    precioNormalReferencia: precioNormalRef,
    costoReferencia: costoRef,

    // Lo que vale HOY. Puede diferir de las referencias, y esa diferencia ES el
    // aviso: por eso se muestran los dos y no solo el actual.
    precioNormalActual: precioActual != null ? Number(precioActual) : null,
    costoActual: costoHoy,

    margen: margenHoy.importe,
    margenPct: margenHoy.pct,
    margenNegativo: margenHoy.importe < 0,

    necesitaRevision,
    revisionPendienteDesde: linea.revisionPendienteDesde ?? null,
    revisadaEn: linea.revisadaEn ?? null,
    // El "de → a" completo, solo cuando hay algo que mirar. Si no, la pantalla
    // no tiene que dibujar un bloque vacío que parezca un problema.
    cambioDeCosto: necesitaRevision
      ? resumenCambioDeCosto({
          costoReferencia: costoRef,
          costoActual: linea.costoAlDetectar != null ? Number(linea.costoAlDetectar) : costoHoy,
          precioOferta,
          precioNormalReferencia: precioNormalRef,
        })
      : null,
  };
}

/** La oferta abierta: la tarjeta más sus líneas. */
export function ofertaParaDetalle(oferta, { actualesPorProductoLocal = {}, ahora = new Date() } = {}) {
  if (!oferta) return null;
  const base = ofertaParaLista(oferta, ahora);
  const lineas = (Array.isArray(oferta.lineas) ? oferta.lineas : []).map((l) => {
    const actual = actualesPorProductoLocal[l.productoLocalId] || {};
    return lineaParaDetalle(l, {
      precioActual: actual.precioNormal ?? null,
      costoActual: actual.costo ?? null,
    });
  });

  return {
    ...base,
    lineas,
    // Qué puede hacer la persona con esta oferta, decidido acá y no en la
    // pantalla: si cada botón decide por su cuenta cuándo mostrarse, terminan
    // habilitando cosas distintas.
    acciones: accionesDisponibles(base.estado),
  };
}

/**
 * Qué acciones tienen sentido en cada estado. Es una tabla y no una cadena de
 * `if` para que se pueda leer entera de un vistazo y para que agregar un estado
 * obligue a decir qué se puede hacer en él.
 */
export function accionesDisponibles(estado) {
  switch (estado) {
    case ESTADO_OFERTA.BORRADOR:
      // Todavía no rige: se puede tocar todo y se puede borrar sin consecuencias.
      return { editar: true, publicar: true, finalizar: false, renovar: false, eliminar: true };
    case ESTADO_OFERTA.PROGRAMADA:
      // Publicada pero sin empezar: se edita y se puede bajar antes de que rija.
      return { editar: true, publicar: false, finalizar: true, renovar: false, eliminar: true };
    case ESTADO_OFERTA.ACTIVA:
    case ESTADO_OFERTA.REVISAR:
      // Está rigiendo. Se puede editar —cambiar un precio de oferta es legítimo y
      // rige desde ese momento— pero no se borra: puede tener ventas colgando.
      return { editar: true, publicar: false, finalizar: true, renovar: false, eliminar: false };
    case ESTADO_OFERTA.VENCIDA:
      // Acá es donde se decide: renovar, modificar o finalizar. Las tres.
      return { editar: true, publicar: false, finalizar: true, renovar: true, eliminar: false };
    case ESTADO_OFERTA.FINALIZADA:
      // Archivada. Se puede duplicar para la próxima temporada y nada más.
      return { editar: false, publicar: false, finalizar: false, renovar: true, eliminar: false };
    default:
      // Un estado desconocido no habilita nada. Fallar hacia "no se toca".
      return { editar: false, publicar: false, finalizar: false, renovar: false, eliminar: false };
  }
}
