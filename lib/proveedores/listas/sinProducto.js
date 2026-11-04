// lib/proveedores/listas/sinProducto.js
//
// PAQUETE 3 DE UNA LISTA: LOS RENGLONES QUE NO TIENEN PRODUCTO (Emanuel,
// 2026-11-04).
//
// Los dos paquetes que ya existían arrancan de TUS productos: "Tus productos de
// Dab" y "Pueden ser de Dab". Un renglón de la lista que no es de ninguno de
// tus productos solo aparecía en el buscador de la hoja de vincular. Este
// paquete los muestra uno por uno, como vinieron en la lista, con la tarjeta y
// la hoja «Qué producto es» de la recepción: se busca en el catálogo y se
// vincula, y si no existe se crea.
//
// ── EL `where` VIVE EN `puedenSer.js`, Y ESTE MÓDULO NO IMPORTA NADA ──────
//
// `filasSinProductoWhere` está pegado a `porConfirmarWhere`, que es su
// complemento. Acá no se importa: la pantalla usa este módulo, y `puedenSer.js`
// arrastra Prisma —un `import` de él desde acá metía `node:async_hooks` en el
// navegador y la pantalla no compilaba—. Lo de acá es puro y lo puede usar
// cualquiera de los dos lados.

/** Los campos de la fila que usan la tarjeta, la hoja y la precarga del alta. */
export const CAMPOS_FILA_SIN_PRODUCTO = Object.freeze({
  id: true,
  codigoCrudo: true,
  codigoNormalizado: true,
  descripcionProveedor: true,
  codigoBarraProveedor: true,
  precioConIva: true,
  unidadesPorBulto: true,
  costoMaestroPropuesto: true,
  costoUnitarioCalculado: true,
});

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * La fila, como la manda `GET sin-producto` a la pantalla: los campos de
 * `CAMPOS_FILA_SIN_PRODUCTO` con los Decimal de Prisma pasados a número.
 * Los candados arman sus fixtures con esta misma función.
 */
export function filaSinProductoParaLaPantalla(f) {
  const salida = {};
  for (const c of Object.keys(CAMPOS_FILA_SIN_PRODUCTO)) salida[c] = f?.[c] ?? null;
  salida.precioConIva = numero(salida.precioConIva);
  salida.costoMaestroPropuesto = numero(salida.costoMaestroPropuesto);
  salida.costoUnitarioCalculado = numero(salida.costoUnitarioCalculado);
  return salida;
}

/**
 * Cuántas tarjetas se dibujan de una vez. Una lista de un proveedor grande trae
 * cientos de renglones que no compramos, y dibujarlos todos en un teléfono es
 * esperar a que termine antes de poder tocar nada. El buscador mira todos.
 */
export const TARJETAS_POR_TANDA = 50;

/** "Sin producto en tu catálogo", el título del paquete. */
export const TITULO_SIN_PRODUCTO = "Sin producto en tu catálogo";

/** La línea gris debajo del botón del paquete 3, y arriba de su pantalla. */
export function explicacionSinProducto(proveedor) {
  return `Renglones de la lista de ${proveedor || "este proveedor"} que no están vinculados a ningún producto tuyo.`;
}

/** El aviso de abajo al vincular: a dónde se fue la tarjeta. */
export function textoVinculado(nombre) {
  return `${nombre || "El producto"} quedó vinculado y pasó a su paquete.`;
}

/** Lo que se busca en el buscador: el código o la descripción, sin mayúsculas. */
export function filaCoincideConLaBusqueda(fila, buscar) {
  const q = String(buscar ?? "").trim().toLowerCase();
  if (!q) return true;
  return [fila?.codigoCrudo, fila?.codigoNormalizado, fila?.descripcionProveedor, fila?.codigoBarraProveedor]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}
