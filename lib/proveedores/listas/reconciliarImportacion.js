// VOLVER A CONCILIAR UNA IMPORTACIÓN QUE YA ESTÁ LEÍDA, SIN EL ARCHIVO.
//
// ── POR QUÉ EXISTE, Y POR QUÉ ES UNA SOLA FUNCIÓN ──────────────────────────
//
// Hay dos acciones que hacen exactamente esto con distinto destino:
//
//   pasar a actualizar   un control que se quiere aplicar, con un rango
//   pasar a controlar    una lista de actualizar que quedó con el rango en
//                        cero —la de Emanuel— y que en realidad era un control
//
// Las dos releen las filas persistidas, las vuelven a pasar por el motor con el
// modo y el rango nuevos, y reescriben el resultado. Escribir la segunda al lado
// de la primera sería la copia que este proyecto prohíbe: no se rompen el día
// que se escriben, se rompen el día que una cambia — y lo que cambiaría acá es
// qué campos se le pasan al motor, o sea qué costos se calculan.
//
// ── POR QUÉ NO HACE FALTA EL ARCHIVO ───────────────────────────────────────
//
// Porque las filas persistidas ya tienen todo lo que el motor consume: código,
// descripción, unidad, unidades por bulto y el precio con la columna elegida ya
// aplicada. Es el mismo round-trip que hace `vincular` para recalcular una fila
// sola, acá para todas.
//
// Recibe el cliente de Prisma en vez de importarlo: así se puede pasar el `tx`
// de una transacción de afuera, y así los candados pueden ejercerla sin base.

import { conciliarLista } from "./conciliarLista.js";
import { cargarDatosDeConciliacion } from "./cargaErp.js";
import { ESTADO_IMPORTACION, filasAPersistir, contadoresDeCabecera, enLotes } from "./persistencia.js";

const numero = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Los campos que el motor consume de una fila persistida, y ninguno más. */
export const CAMPOS_PARA_RECONCILIAR = {
  filaExcel: true,
  hojaNombre: true,
  codigoCrudo: true,
  codigoNormalizado: true,
  codigoComparableSinCeros: true,
  codigoBarraProveedor: true,
  descripcionProveedor: true,
  unidadProveedor: true,
  unidadesPorBulto: true,
  precioConIva: true,
  precioSinIva: true,
  categoriaCruda: true,
};

/**
 * Las filas persistidas, listas para volver a entrar al motor.
 *
 * ── LO CONFIRMADO A MANO NO SE ARRASTRA, Y ES DELIBERADO ──────────────────
 *
 * Una confirmación de lectura se tomó con el criterio del modo ANTERIOR, y el
 * rango congelado en la fila es el de entonces. Pasarlos al motor con el
 * criterio nuevo haría que una decisión tomada para una pregunta habilitara la
 * respuesta a otra.
 *
 * La memoria POR PRODUCTO Y PROVEEDOR sí sobrevive: vive en otras tablas, la
 * trae `cargarDatosDeConciliacion` y el motor la vuelve a aplicar.
 */
export function filasParaElMotor(persistidas = []) {
  return persistidas.map((f) => ({
    ...f,
    precioConIva: numero(f.precioConIva),
    precioSinIva: numero(f.precioSinIva),
    confirmadoEn: null,
    vinculadoEn: null,
    aumentoEsperadoMinPct: null,
    aumentoEsperadoMaxPct: null,
  }));
}

/**
 * Vuelve a conciliar una importación entera y reescribe sus filas.
 *
 * @param db          cliente de Prisma
 * @param cab         la cabecera, con proveedorId, parser, recargoPct e impuesto
 * @param cabecera    cómo va a QUEDAR: rango, impuesto y modo. Es el MISMO objeto
 *                    que se le pasa al motor y el que se persiste, igual que en
 *                    `importar`: no hay forma de que la cabecera diga un criterio
 *                    y el motor haya usado otro.
 * @param config      la configuración del parser, ya resuelta
 * @param alcance     { grupoId, localId, depositoLocalId }
 *
 * @returns { ok, resumen } o { ok: false, codigo }
 */
export async function reconciliarImportacion(db, { cab, cabecera, config, alcance, opcionesTx }) {
  const { grupoId, localId, depositoLocalId } = alcance;

  const persistidas = await db.importacionListaFila.findMany({
    where: { importacionId: cab.id },
    select: CAMPOS_PARA_RECONCILIAR,
    orderBy: { filaExcel: "asc" },
  });
  if (persistidas.length === 0) {
    return { ok: false, codigo: "SIN_FILAS" };
  }

  const { codigosProveedor, productos, lecturasRecordadas, productosQueNoSeCambian } =
    await cargarDatosDeConciliacion({ grupoId, proveedorId: cab.proveedorId, localId });

  const conciliacion = conciliarLista({
    filas: filasParaElMotor(persistidas),
    productos,
    codigosProveedor,
    contexto: {
      grupoId,
      proveedorId: cab.proveedorId,
      operandoEnLocalId: localId,
      depositoLocalId,
      cabecera,
      lecturasRecordadas,
      productosQueNoSeCambian,
    },
    config,
  });

  const contadores = contadoresDeCabecera(conciliacion);
  const nuevas = filasAPersistir(conciliacion);

  await db.$transaction(async (tx) => {
    // ── SE BORRAN Y SE REESCRIBEN, NO SE ACTUALIZAN UNA POR UNA ──────────
    //
    // Porque el motor no devuelve las filas emparejadas con sus ids: devuelve el
    // resultado de conciliar, en el mismo orden en que entraron. Actualizar por
    // posición sería atar la identidad de una fila a un índice de array, y el día
    // que el motor filtre una, todas las de abajo se escribirían con el veredicto
    // de su vecina.
    //
    // Se puede borrar sin perder nada mientras NADA SE HAYA APLICADO: no hay
    // `aplicada`, ni `costoAplicado`, ni autoría que valga. Quien llama tiene que
    // haberlo comprobado; las dos rutas que la usan lo hacen.
    await tx.importacionListaFila.deleteMany({ where: { importacionId: cab.id } });

    for (const lote of enLotes(nuevas, 500)) {
      await tx.importacionListaFila.createMany({
        data: lote.map((f) => ({ ...f, importacionId: cab.id })),
      });
    }

    await tx.importacionListaProveedor.update({
      where: { id: cab.id },
      data: {
        ...cabecera,
        umbralVariacionPct: cabecera.aumentoEsperadoMaxPct,
        // ── QUEDA CONCILIADA, NO EN BORRADOR ──────────────────────────────
        //
        // BORRADOR es el estado de una importación a la que todavía le faltan
        // filas: `esImportacionAbierta` lo deja AFUERA, así que una lista
        // recién reconciliada quedaba sin poder confirmarse, ni excluir una
        // fila, ni corregir un vínculo, y cada acción contestaba "esta lista
        // está cerrada". En `importar`, BORRADOR dura tres líneas, hasta que
        // entran las filas. Acá las filas ya entraron en esta transacción.
        estado: ESTADO_IMPORTACION.CONCILIADA,
        conciliadaEn: new Date(),
        ...contadores,
      },
    });
  }, opcionesTx);

  return { ok: true, resumen: conciliacion.resumen };
}
