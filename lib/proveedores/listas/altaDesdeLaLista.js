// lib/proveedores/listas/altaDesdeLaLista.js
//
// LO QUE EL ALTA DE PRODUCTO RECIBE PRECARGADO CUANDO SE CREA DESDE UN RENGLÓN
// DE UNA LISTA DE PRECIOS DEL PROVEEDOR.
//
// Es la HERMANA de `lib/compras-proveedor/altaDesdeElPapel.js`, no una versión
// parecida: el formulario es el mismo (`ModalProductoFinal` → `FormProducto`),
// la ruta es la misma (`/api/productos/crear`) y la regla es la misma —se
// precarga lo que el sistema ya sabe y nada más—. Lo único distinto es de
// dónde sale cada dato: allá de un renglón del papel, acá de una
// `ImportacionListaFila` ya leída y conciliada.
//
// Emanuel, 2026-11-04: "tiene que ser EXACTAMENTE IGUAL a la recepción". Por eso
// lo de la recepción no se toca y esto vive del lado de listas.
//
//   · nombre      — `descripcionProveedor`, lo que dice la lista;
//   · proveedor   — el de la importación;
//   · código de barras — `codigoBarraProveedor` si la lista lo trae. Si no,
//                   vacío: el producto se crea sin código y se carga después.
//                   Inventarlo está prohibido;
//   · bulto       — `unidadesPorBulto` mayor que 1: "Pack" con ese factor,
//                   igual que la recepción con el bulto del papel;
// Lo que NO se precarga, y por qué:
//
//   · costo       — SIEMPRE VACÍO desde este circuito (Emanuel, 2026-11-05).
//                   Ni `costoMaestroPropuesto` ni `costoUnitarioCalculado`,
//                   multiplicados o no, y menos `precioConIva` crudo. Una
//                   fila sin producto solo los trae si TUVO producto —la
//                   soltaron, o el producto se borró— y entonces son el costo
//                   calculado contra la ficha de OTRO producto: con la lista
//                   por bulto, × el UxB, quedaba varias veces más alto. Y por
//                   el alta entraba sin pasar por el control de rango de la
//                   lista. La persona carga el costo; la lista lo controla
//                   después, como a cualquier producto.
//   · venta       — el alta solo la calcula con un margen cargado, y un alta
//                   nueva no trae margen: queda vacía.
//   · SKU         — el alta no asigna ninguno.
//   · código del proveedor — el alta no tiene ese campo editable: se MUESTRA
//                   fijo (`codigoDelProveedorParaElAltaDesdeLaLista`) y lo
//                   guarda el vínculo que se hace al volver, por
//                   `servicioIdentidad`, en `filas/[filaId]/vincular`.
//
// Módulo puro: sin React, sin Prisma y sin red.

/** Un número finito o null. Los Decimal de Prisma llegan como string. */
function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** El bulto de la lista, si es un bulto de verdad (más de una unidad). */
export function bultoDeLaFila(fila) {
  const n = numero(fila?.unidadesPorBulto);
  return n !== null && Number.isInteger(n) && n > 1 ? n : null;
}

/**
 * El `initialData` del alta: sin `id`, así el formulario sigue siendo un alta.
 * Lo que no se sabe no va, y el formulario lo deja vacío como en cualquier alta.
 * `precio_costo` no va NUNCA: ver el encabezado.
 */
export function precargaDelAltaDesdeLaLista({ fila, proveedorId }) {
  const precarga = {};
  const nombre = String(fila?.descripcionProveedor ?? "").trim();
  if (nombre) precarga.nombre = nombre;
  if (Number(proveedorId) > 0) precarga.proveedor_id = Number(proveedorId);
  const barra = String(fila?.codigoBarraProveedor ?? "").trim();
  if (barra) precarga.codigo_barra = barra;
  const bulto = bultoDeLaFila(fila);
  if (bulto !== null) {
    precarga.unidad_medida = "pack";
    precarga.factor_pack = bulto;
  }
  return precarga;
}

/**
 * El código que el proveedor le da al producto, tal como quedó normalizado en
 * la fila: el alta lo muestra fijo y el vínculo lo guarda al crear. Null si no
 * trae.
 */
export function codigoDelProveedorParaElAltaDesdeLaLista(fila) {
  const codigo = String(fila?.codigoNormalizado ?? fila?.codigoCrudo ?? "").trim();
  return codigo || null;
}

/**
 * LA FILA DE LA LISTA CON LA FORMA QUE LEE LA TARJETA DE LA RECEPCIÓN.
 *
 * `TarjetaLineaFactura` se usa TAL CUAL. Una línea sin producto ni línea de
 * pedido es, para ella, "sin vincular": dibuja el nombre, "Todavía no se sabe
 * qué producto es", «Corregir» y el total. La tarjeta no tiene un renglón para
 * el código, así que el código va adelante del nombre —es lo primero que se
 * coteja contra la lista— y el precio del renglón es el importe del pie.
 */
export function filaParaLaTarjetaDeRecepcion(fila) {
  const codigo = String(fila?.codigoCrudo ?? "").trim();
  const descripcion = String(fila?.descripcionProveedor ?? "").trim();
  return {
    lineaId: fila?.id ?? null,
    filaId: fila?.id ?? null,
    textoCrudo: [codigo, descripcion].filter(Boolean).join(" · ") || null,
    productoLocalId: null,
    pedidoDetalleId: null,
    importeDelPapel: numero(fila?.precioConIva),
  };
}
