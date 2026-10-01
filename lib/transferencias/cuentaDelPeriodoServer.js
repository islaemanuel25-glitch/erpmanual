// lib/transferencias/cuentaDelPeriodoServer.js
//
// LAS CONSULTAS DE LA CUENTA DE UN LOCAL. La aritmética es de `cuentaDelPeriodo`
// (`bloquesPorLocal.js`, pura); acá vive lo que toca la base.
//
// ── POR QUÉ EL `select` VIVE ACÁ Y YA NO EN LA RUTA ───────────────────────
//
// Lo leen dos módulos: el tablero de Transferencias y el "Pago a depósito" de
// Finanzas. Escrito en cada uno, el día que alguien recortara uno de los dos el
// importe saldría mal de un solo lado, sin quejarse: el defecto de la #97 y el
// de la #198 eran exactamente eso. Uno solo, compartido, y el candado
// `formaDelSelect.test.mjs` lo lee en ESTE archivo.
//
// ── EL "PAGO A DEPÓSITO" ES TRANSFERENCIAS, NO FINANZAS ───────────────────
//
// Finanzas no consulta `Transferencia` ni valoriza líneas: llama a
// `resumenDePagoADeposito`, que es esta misma cuenta en el criterio de
// recepción. No lee ventas, ni pagos, ni movimientos de caja, ni los Libros: la
// mercadería recibida se reconoce por la transferencia y por nada más.

import { getRangoArgentina, fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";

import { cuentaDelPeriodo, fechaDeRecepcion, importeDeLaTransferenciaCentavos } from "./bloquesPorLocal.js";
import { desdeCentavos } from "./agregadosPeriodo.js";
import {
  CRITERIO_CUENTA,
  ESTADOS_PENDIENTES_DE_RECEPCION,
  ESTADO_RECIBIDA,
} from "./criterioDeCuenta.js";

/**
 * LO QUE HAY QUE TRAER DE CADA TRANSFERENCIA PARA VALORIZARLA Y MOSTRARLA.
 *
 * `origen.es_deposito` lo exige `origenEsDepositoDe`: el fiambre de pieza fija
 * se valoriza distinto según salga del depósito, y sin la columna la cuenta no
 * se puede hacer. Los cuatro del fiambre en `base` y los cinco del snapshot en
 * la línea, por la #97 y la #198.
 */
export const SELECT_TRANSFERENCIA_DE_LA_CUENTA = Object.freeze({
  id: true,
  estado: true,
  fechaEnvio: true,
  fechaRecepcion: true,
  createdAt: true,
  destinoId: true,
  origen: { select: { id: true, nombre: true, es_deposito: true } },
  destino: { select: { id: true, nombre: true } },
  detalle: {
    select: {
      cantidad: true,
      recibido: true,
      recibidoUnidadesSueltas: true,
      precioCosto: true,
      unidadEnviada: true,
      // El snapshot de presentación: la cuenta parte de la presentación
      // REGISTRADA y no de una reconstrucción que hoy coincide.
      presentacionEnvio: true,
      cantidadPresentada: true,
      factorPresentacion: true,
      sueltasEnviadas: true,
      pesoPiezaKg: true,
      // Los dos del avance de revisión, que son de la pantalla de
      // Transferencias: cuántas líneas hay que revisar y cuántas van.
      agregadoEnRecepcion: true,
      revisadoEnRecepcion: true,
      productoId: true,
      producto: {
        select: {
          precio_costo: true,
          nombre: true,
          base: {
            select: {
              precio_costo: true,
              unidad_medida: true,
              factor_pack: true,
              nombre: true,
              // Los cuatro del fiambre de pieza fija. Sin ellos el
              // predicado contesta "no es fiambre" y el importe sale mal
              // sin quejarse: es el defecto de la #97.
              pesoEsFijo: true,
              pesoReferenciaKg: true,
              modoVentaDeposito: true,
              modoCompraProveedor: true,
            },
          },
        },
      },
    },
  },
});

/**
 * EL `where` DEL CRITERIO DE RECEPCIÓN para un local y un rango.
 *
 * Trae dos cosas en una consulta, las mismas dos que `cuentaDelPeriodo`
 * separa después:
 *
 *   · las `Recibida` con `fechaRecepcion` dentro del rango;
 *   · las `Enviada` y `Recibiendo` que ya habían salido al terminar el rango
 *     —por `fechaEnvio`, o `createdAt` si falta, que es `fechaDeCorte`—. Sin
 *     piso: una transferencia sin confirmar de hace un mes sigue pendiente, y
 *     es justamente la que hay que ver.
 *
 * Las dos, solo con origen en un depósito y destino en el local: el depósito
 * no se paga a sí mismo y un local no recibe lo de otro.
 */
export function whereDeRecepcion({ destinoId, rango }) {
  const { fechaInicio, fechaFin } = getRangoArgentina(rango.desde, rango.hasta);
  return {
    destinoId: Number(destinoId),
    origen: { es_deposito: true },
    OR: [
      { estado: ESTADO_RECIBIDA, fechaRecepcion: { gte: fechaInicio, lte: fechaFin } },
      {
        estado: { in: [...ESTADOS_PENDIENTES_DE_RECEPCION] },
        OR: [{ fechaEnvio: { lte: fechaFin } }, { fechaEnvio: null, createdAt: { lte: fechaFin } }],
      },
    ],
  };
}

/**
 * LAS FILAS Y LA CUENTA DEL CRITERIO DE RECEPCIÓN.
 *
 * La pantalla de Transferencias necesita las filas para dibujarlas; Finanzas,
 * solo los números (`resumenDePagoADeposito`). Las dos pasan por acá, así que
 * el total que ve cada una es el mismo cálculo sobre la misma consulta.
 */
export async function leerCuentaPorRecepcion(db, { destinoId, rango }) {
  const filas = await db.transferencia.findMany({
    where: whereDeRecepcion({ destinoId, rango }),
    orderBy: [{ fechaRecepcion: "desc" }, { id: "desc" }],
    select: SELECT_TRANSFERENCIA_DE_LA_CUENTA,
  });
  return cuentaDelPeriodo({
    transferencias: filas,
    rango,
    criterio: CRITERIO_CUENTA.RECEPCION,
    destinoId,
  });
}

/**
 * EL "PAGO A DEPÓSITO" DE UN LOCAL EN UN RANGO, solo los números.
 *
 * Es lo que consume Finanzas. Ni filas ni líneas: el detalle es de
 * Transferencias y se abre allá.
 */
export async function resumenDePagoADeposito(db, { destinoId, rango }) {
  const cuenta = await leerCuentaPorRecepcion(db, { destinoId, rango });
  return {
    criterio: cuenta.criterio,
    total: cuenta.aPagar,
    cantidadTransferencias: cuenta.cantidad,
    pendientes: {
      total: cuenta.pendientes.importe,
      cantidadTransferencias: cuenta.pendientes.cantidad,
    },
  };
}

/**
 * EL "PAGO A DEPÓSITO" DE UN LOCAL, CON SU LISTADO DE RECIBIDAS.
 *
 * Es `resumenDePagoADeposito` más la lista de las transferencias reconocidas, y
 * sale de la MISMA consulta y la MISMA cuenta: `leerCuentaPorRecepcion` ya trae
 * las `reconocidas` valorizadas, y acá solo se las mapea a lo mínimo que una
 * vista financiera muestra —número, fecha de recepción e importe— sin una
 * segunda consulta ni una segunda valorización.
 *
 * El importe de cada una es `importeDeLaTransferenciaCentavos`, la MISMA puerta
 * canónica con la que se sumó el total: la lista no puede dar un número distinto
 * del agregado. Las LÍNEAS no viajan: el detalle operativo —productos,
 * cantidades, diferencias— es de Transferencias y se abre allá.
 *
 * Las pendientes van solo como agregado, igual que en `resumenDePagoADeposito`:
 * son estado de hoy, cambian, y detallarlas invitaría a operarlas desde
 * Finanzas.
 */
export async function detalleDePagoADeposito(db, { destinoId, rango }) {
  const cuenta = await leerCuentaPorRecepcion(db, { destinoId, rango });
  return {
    criterio: cuenta.criterio,
    total: cuenta.aPagar,
    cantidadTransferencias: cuenta.cantidad,
    pendientes: {
      total: cuenta.pendientes.importe,
      cantidadTransferencias: cuenta.pendientes.cantidad,
    },
    // Solo lo financiero de cada reconocida. El importe sale de la puerta
    // canónica, en pesos, como el total.
    recibidas: cuenta.transferencias.map((t) => ({
      id: t.id,
      fechaRecepcion: t.fechaRecepcion ?? null,
      importe: desdeCentavos(importeDeLaTransferenciaCentavos(t, "detalleDePagoADeposito")),
    })),
  };
}

/**
 * EL PRIMER DÍA CON UNA RECEPCIÓN CONFIRMADA de este local, en ISO argentino.
 *
 * Es el tope hacia atrás de la navegación en el criterio de recepción: antes de
 * ese día está probado que no se reconoció nada. `null` si nunca recibió.
 */
export async function primeraRecepcion(db, { destinoId }) {
  const primera = await db.transferencia.findFirst({
    where: {
      destinoId: Number(destinoId),
      origen: { es_deposito: true },
      estado: ESTADO_RECIBIDA,
      fechaRecepcion: { not: null },
    },
    orderBy: { fechaRecepcion: "asc" },
    select: { fechaRecepcion: true },
  });
  const f = fechaDeRecepcion(primera);
  return f ? fechaArgentinaISO(f) : null;
}
