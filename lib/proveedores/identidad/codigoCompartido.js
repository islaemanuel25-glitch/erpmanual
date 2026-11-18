// lib/proveedores/identidad/codigoCompartido.js
//
// UN CÓDIGO DEL PROVEEDOR COMPARTIDO ENTRE VARIANTES DE UN PRODUCTO.
//
// ── EL CASO (Dab, 2026-11-18) ─────────────────────────────────────────────
//
// Dab usa el mismo código para los aromas de un producto: el 2530 es
// "GIGANTE LIMPIADOR LIMON 900CC" en su lista y "GIGANTE LIMPIADOR CITRONELA
// 900CC" en su factura. Un vínculo por el código solo ataría los dos aromas a
// un mismo producto, y la próxima lista le pondría el precio del Limón al
// Citronela.
//
// Decisión de Emanuel: cuando un mismo código aparece con nombres de variantes
// distintas (`difierenEnVariante`), el vínculo se guarda por código + texto —el
// par de texto, `claveDeAlias`, que ya existe—, no por el código solo. Y el par
// de texto manda sobre el código cuando dicen productos distintos: así el 2530
// Citronela y el 2530 Limón quedan cada uno con su producto, en las boletas
// (`buscarCandidatos`) y en las listas (`vincularFilaConCatalogo`).
//
// Medido ese día sobre las listas guardadas y los papeles: 8 códigos con
// variantes distintas —los Ramen Cup y los Tatín de Arcor, los Gigante de
// Dab—.

import { clavesDeCodigo } from "../listas/normalizarCodigo.js";
import { claveDeAlias } from "./servicioIdentidad.js";
import { difierenEnVariante } from "../../productos/variantes.js";

/** El código como se comparan dos códigos del mismo proveedor: sin ceros adelante. */
export function claveDelCodigo(codigo) {
  const k = clavesDeCodigo(codigo);
  return k.sinCeros || k.normalizado || null;
}

/** ¿Algún otro nombre conocido para este código es otra variante? */
export function codigoCompartidoEntreVariantes({ texto, otrosTextos = [] } = {}) {
  if (!String(texto ?? "").trim()) return false;
  return (otrosTextos ?? []).some((t) => difierenEnVariante(texto, t));
}

/**
 * EL PAR DE TEXTO QUE MANDA SOBRE EL CÓDIGO, o null.
 *
 * Un par de texto (`TXT:…`) activo con exactamente este nombre, que apunta a
 * un producto distinto del que encontró el código: es el que se guardó a
 * propósito para una variante, y gana. Solo los pares de texto: un vínculo de
 * código que guarda su descripción no cuenta, porque no se escribió para
 * distinguir el nombre.
 */
export function parDeTextoQueManda({ texto, vinculos = [], productoDelCodigo = null } = {}) {
  const clave = claveDeAlias(texto);
  if (!clave) return null;
  const pares = (vinculos ?? []).filter(
    (v) => v?.activo !== false && v?.codigoInterno === clave && Number(v?.productoBaseId) !== Number(productoDelCodigo)
  );
  const productos = new Set(pares.map((v) => Number(v.productoBaseId)));
  return productos.size === 1 ? pares[0] : null;
}

/**
 * LOS OTROS NOMBRES CONOCIDOS PARA UN CÓDIGO DEL PROVEEDOR: los renglones de
 * sus listas sin cancelar, sus vínculos de código (la descripción y el nombre
 * del producto) y los renglones de sus papeles. Para la ruta de vincular.
 *
 * @param prisma  el cliente o una transacción
 */
export async function otrosNombresDelCodigo(prisma, { grupoId, proveedorId, codigo, excluirLineaId = null } = {}) {
  const clave = claveDelCodigo(codigo);
  if (!clave || !proveedorId) return [];
  const mismo = (c) => claveDelCodigo(c) === clave;
  const [filas, vinculos, lineas] = await Promise.all([
    prisma.importacionListaFila.findMany({
      where: { importacion: { grupoId, proveedorId, estado: { not: "CANCELADA" } }, codigoNormalizado: { endsWith: clave } },
      select: { codigoNormalizado: true, descripcionProveedor: true },
    }),
    prisma.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId, activo: true, codigoInterno: { endsWith: clave } },
      select: { codigoInterno: true, descripcionProveedor: true, productoBase: { select: { nombre: true } } },
    }),
    prisma.comprobanteLinea.findMany({
      where: {
        codigoProveedor: { endsWith: clave },
        comprobante: { grupoId, proveedorId },
        ...(excluirLineaId ? { id: { not: excluirLineaId } } : {}),
      },
      select: { codigoProveedor: true, textoCrudo: true },
      take: 200,
    }),
  ]);
  return [
    ...filas.filter((f) => mismo(f.codigoNormalizado)).map((f) => f.descripcionProveedor),
    ...vinculos.filter((v) => mismo(v.codigoInterno)).flatMap((v) => [v.descripcionProveedor, v.productoBase?.nombre]),
    ...lineas.filter((l) => mismo(l.codigoProveedor)).map((l) => l.textoCrudo),
  ].filter((t) => String(t ?? "").trim());
}
