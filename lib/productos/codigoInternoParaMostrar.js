// lib/productos/codigoInternoParaMostrar.js
//
// EL CÓDIGO DEL PROVEEDOR QUE MUESTRA LA TARJETA DE PRODUCTOS.
//
// Estaba escrito adentro de `productos/listar`: de los vínculos activos, el del
// proveedor principal, y si no el primero. No miraba qué era cada uno, y los
// vínculos por texto (`TXT:…`) viven en la misma columna: 67 productos
// mostraban una clave de texto como código, y el "GIGANTE CITRONELA 900cc" de
// Dab mostró "gigante limpiador citronela 900cc" encimado con el código de
// barras (2026-11-18). Los vínculos por texto siguen para el macheo; acá no.

import { esClaveDeAlias } from "@/lib/proveedores/identidad/servicioIdentidad";

/**
 * @param codigosProveedor  `[{ codigoInterno, proveedorId }]`, los activos
 * @param proveedorId       el proveedor principal del producto
 * @returns el código, o null si no tiene ninguno que sea un código
 */
export function codigoInternoParaMostrar({ codigosProveedor = [], proveedorId = null } = {}) {
  const cods = (codigosProveedor ?? []).filter((c) => c?.codigoInterno && !esClaveDeAlias(c.codigoInterno));
  if (cods.length === 0) return null;
  const principal = cods.find((c) => c.proveedorId === proveedorId);
  return (principal ?? cods[0]).codigoInterno ?? null;
}
