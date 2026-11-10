// PARTIR UN PDF DE VARIAS PÁGINAS EN HOJAS, UNA POR COMPROBANTE.
//
// Lo que decide —qué es un PDF, cómo se parte— está en `hojasDelPdf.js`. Esto
// escribe: los archivos de cada hoja en el volumen y sus filas en la base, igual
// que la subida cuando llegan fotos sueltas (`comprobantes/subir`). Arcor #582,
// 2026-11-10: cuatro facturas en un PDF.
//
// ── QUÉ QUEDA DÓNDE ───────────────────────────────────────────────────────
//
// La página 1 se queda en el comprobante que se está leyendo: es el que la
// pantalla tiene en la mano. Cada página siguiente pasa a un comprobante nuevo
// de la misma recepción, con la misma fecha de subida para que la agrupación de
// hojas (`agruparLasHojasDelPapel`, que ordena por subida) las vea juntas y en
// orden. Después de leer, las que no traen total se juntan con la que sigue.
//
// ── EN QUÉ ORDEN SE ESCRIBE ───────────────────────────────────────────────
//
// Como la subida: la fila del archivo se crea sin ubicación y se completa
// cuando el archivo está escrito. El PDF entero se borra recién cuando todas
// las hojas quedaron escritas y apuntadas: si algo falla en el medio, el
// original sigue ahí y se puede volver a leer.

import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

import { exigirAlmacen } from "./almacenDisco.js";

const hashDe = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** El nombre de una hoja, para que se reconozca de qué PDF salió. */
export function nombreDeLaHoja(nombre, hoja, total) {
  return `${String(nombre || "papel.pdf")} (hoja ${hoja} de ${total})`;
}

/**
 * @param prisma
 * @param comprobante  `{ id, grupoId, proveedorId, pedidoId, localOperativoId,
 *                     usuarioId, venceEn, createdAt }`
 * @param archivo      el único archivo del comprobante: `{ id, nombre, ubicacion }`
 * @param hojas        los PDF de una página, de `partirPdfEnHojas`
 * @param proveedorNombre  para el nombre del archivo
 * @returns `{ hojasNuevas: [comprobanteId] }`, las páginas 2 en adelante
 */
export async function separarHojasDelPdf(prisma, { comprobante, archivo, hojas, proveedorNombre = null }) {
  const total = hojas.length;
  const escribir = async ({ comprobanteId, hoja, bytes }) => {
    const destino = await exigirAlmacen({ comprobanteId, proveedorNombre, puntoVenta: `hoja${hoja}`, orden: 1, extension: "pdf" });
    await writeFile(destino.rutaAbsoluta, bytes);
    return destino.rutaAbsoluta;
  };

  const hojasNuevas = [];
  for (let i = 1; i < total; i++) {
    const bytes = hojas[i];
    const nuevo = await prisma.comprobanteProveedor.create({
      data: {
        grupoId: comprobante.grupoId,
        proveedorId: comprobante.proveedorId,
        pedidoId: comprobante.pedidoId,
        localOperativoId: comprobante.localOperativoId,
        usuarioId: comprobante.usuarioId,
        estado: "PENDIENTE_LECTURA",
        venceEn: comprobante.venceEn,
        createdAt: comprobante.createdAt,
      },
      select: { id: true },
    });
    const fila = await prisma.comprobanteArchivo.create({
      data: {
        comprobanteId: nuevo.id,
        orden: 1,
        nombre: nombreDeLaHoja(archivo.nombre, i + 1, total),
        tamano: bytes.length,
        mime: "application/pdf",
        hash: hashDe(bytes),
      },
      select: { id: true },
    });
    const ubicacion = await escribir({ comprobanteId: nuevo.id, hoja: i + 1, bytes });
    await prisma.comprobanteArchivo.update({ where: { id: fila.id }, data: { ubicacion } });
    hojasNuevas.push(nuevo.id);
  }

  const primera = hojas[0];
  const ubicacion = await escribir({ comprobanteId: comprobante.id, hoja: 1, bytes: primera });
  await prisma.comprobanteArchivo.update({
    where: { id: archivo.id },
    data: {
      ubicacion,
      nombre: nombreDeLaHoja(archivo.nombre, 1, total),
      tamano: primera.length,
      hash: hashDe(primera),
    },
  });
  // El PDF entero ya está repartido en sus hojas.
  if (archivo.ubicacion && archivo.ubicacion !== ubicacion) await unlink(archivo.ubicacion).catch(() => {});
  return { hojasNuevas };
}
