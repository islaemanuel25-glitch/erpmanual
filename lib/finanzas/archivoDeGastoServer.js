// lib/finanzas/archivoDeGastoServer.js
//
// LA FOTO O EL ARCHIVO DEL TICKET DE UN GASTO. Opcional.
//
// Es la MISMA subida que el remito de un proveedor, no una parecida: los mismos
// límites y la misma validación (`evaluarTanda`, `LIMITES_COMPROBANTE`), el
// mismo almacén con su centinela (`inspeccionarAlmacen`, `exigirAlmacen`) y el
// mismo nombre de archivo saneado (`nombreDeArchivo`). Lo único propio es la
// fila —`GastoArchivo`— y quién puede subirla o verla.
//
// ── QUIÉN ────────────────────────────────────────────────────────────────
//
//   · Finanzas: con el alcance de Gastos. Ver pide `finanzas.ver` y el gasto
//     en su alcance; subir, además, el permiso de registrar gastos.
//   · El cajero, desde "Pagar" del POS: con `pos.usar`, SOLO el gasto que él
//     acaba de registrar en su ubicación. Ni el de otro, ni otra ubicación.
//
// ── A DIFERENCIA DEL COMPROBANTE, NO VENCE ───────────────────────────────
//
// La foto de un comprobante vive siete días porque se lee y se tira. La del
// ticket de un gasto es el respaldo del gasto: no tiene vencimiento.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { checkPerm } from "@/lib/authorize";
import {
  exigirAlmacen,
  inspeccionarAlmacen,
  traducirErrorDeEscritura,
  AlmacenNoDisponible,
} from "@/lib/compras-proveedor/comprobante/almacenDisco";
import { evaluarTanda, queHacer } from "@/lib/compras-proveedor/comprobante/subida";
import { PERMISO_PAGAR_DESDE_EL_POS } from "./gastosServer";

export const ERROR_SIN_ARCHIVO_DE_GASTO = "Este gasto no tiene foto ni archivo.";
export const ERROR_ARCHIVO_NO_DISPONIBLE = "No se pudo abrir el archivo del gasto.";
export const ERROR_GASTO_AJENO = "Ese gasto no es tuyo.";

/** Un rechazo con status, para que la ruta lo conteste con sus palabras. */
export class ErrorArchivoDeGasto extends Error {
  constructor(mensaje, status = 400, extra = null) {
    super(mensaje);
    this.name = "ErrorArchivoDeGasto";
    this.status = status;
    this.extra = extra;
  }
}

/**
 * ¿Este cajero puede tocar este gasto desde el POS? Solo el que registró él,
 * en la ubicación que está operando.
 */
export function esGastoDelCajero(gasto, { session, localId }) {
  return (
    checkPerm(session, PERMISO_PAGAR_DESDE_EL_POS).ok &&
    Boolean(gasto) &&
    Number(gasto.creadoPorId) === Number(session?.id) &&
    Number(gasto.localId) === Number(localId)
  );
}

/**
 * GUARDA UN ARCHIVO. El gasto ya está leído y autorizado por quien llama.
 *
 * La fila se crea SIN ubicación y se completa cuando el archivo está escrito,
 * como en el comprobante: si la escritura falla queda una fila que admite no
 * tener archivo, nunca una que promete uno inexistente.
 *
 * @param {object} db
 * @param {object} args
 * @param {{id:number}} args.gasto
 * @param {File} args.archivo  el del FormData
 */
export async function guardarArchivoDeGasto(db, { gasto, archivo }) {
  const almacen = await inspeccionarAlmacen();
  if (!almacen.ok) {
    throw new ErrorArchivoDeGasto(almacen.motivo, 503, {
      queHacer: "Avisá: el procedimiento está en docs/RUNBOOK-VOLUMEN-COMPROBANTES.md.",
    });
  }
  if (!archivo || typeof archivo.arrayBuffer !== "function") {
    throw new ErrorArchivoDeGasto(ERROR_SIN_ARCHIVO_DE_GASTO);
  }
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const leido = {
    nombre: archivo.name,
    tamano: bytes.length,
    mime: archivo.type,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
  const tanda = evaluarTanda([leido]);
  const veredicto = tanda.resultados?.[0];
  if (!tanda.ok) {
    const codigo = tanda.codigo || veredicto?.codigo;
    throw new ErrorArchivoDeGasto(tanda.error || veredicto?.error, 400, { codigo, queHacer: queHacer(codigo) });
  }

  const ultimo = await db.gastoArchivo.findFirst({
    where: { gastoId: gasto.id },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });
  const orden = (ultimo?.orden ?? 0) + 1;
  const fila = await db.gastoArchivo.create({
    data: {
      gastoId: gasto.id,
      orden,
      nombre: String(leido.nombre || "ticket").slice(0, 200),
      mime: leido.mime || null,
      tamano: leido.tamano,
      hash: leido.hash,
    },
    select: { id: true },
  });

  let destino = null;
  try {
    destino = await exigirAlmacen({
      comprobanteId: fila.id,
      proveedorNombre: "gasto",
      puntoVenta: "gasto",
      numero: gasto.id,
      orden,
      extension: String(leido.nombre || "").split(".").pop() || "jpg",
    });
    await writeFile(destino.rutaAbsoluta, bytes);
  } catch (e) {
    const traducido = traducirErrorDeEscritura(e, destino?.directorio ?? null);
    if (traducido instanceof AlmacenNoDisponible) throw new ErrorArchivoDeGasto(traducido.motivo, 503);
    throw traducido;
  }
  const guardado = await db.gastoArchivo.update({
    where: { id: fila.id },
    data: { ubicacion: destino.rutaAbsoluta },
    select: { id: true, orden: true, nombre: true, mime: true, tamano: true },
  });
  return guardado;
}

/** Los bytes de un archivo del gasto, por su orden. */
export async function leerArchivoDeGasto(db, { gastoId, orden = 1 }) {
  const archivo = await db.gastoArchivo.findUnique({
    where: { gastoId_orden: { gastoId, orden } },
    select: { ubicacion: true, mime: true, nombre: true },
  });
  if (!archivo?.ubicacion) throw new ErrorArchivoDeGasto(ERROR_SIN_ARCHIVO_DE_GASTO, 404);
  try {
    const bytes = await readFile(archivo.ubicacion);
    return { bytes, mime: archivo.mime || "application/octet-stream", nombre: archivo.nombre || "ticket" };
  } catch {
    throw new ErrorArchivoDeGasto(ERROR_ARCHIVO_NO_DISPONIBLE, 410, {
      queHacer: "Avisá: puede que el almacén no esté montado.",
    });
  }
}
