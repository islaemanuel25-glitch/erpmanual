// QUE UN PRODUCTO QUEDE ASOCIADO AL PROVEEDOR QUE LO TRAJO.
//
// ── POR QUÉ HACE FALTA ────────────────────────────────────────────────────
//
// El buscador de la hoja busca, por defecto, entre lo que se le compra al
// proveedor. Para un producto que el proveedor trae POR PRIMERA VEZ eso no
// alcanza: no está en su universo y no aparecería nunca. Por eso hay una salida
// explícita —"Buscar en todo el catálogo"— y por eso, al vincular algo que vino
// de ahí, el producto tiene que quedar asociado: si no, la próxima factura
// vuelve a obligar a salir del universo para el mismo producto.
//
// ── CUÁL ES EL MECANISMO, Y POR QUÉ NO ES EL QUE PARECÍA ──────────────────
//
// El universo se define con las TRES RELACIONES de `ProductoBase`
// —`proveedor_id`, `proveedor2_id`, `proveedor3_id`—, que es lo que mira
// `productoDelProveedorWhere`. Llenar la primera libre era lo que este módulo
// iba a hacer, y es la afirmación más fuerte: "a este proveedor se le compra
// esto".
//
// NO SE HACE, y el motivo es un candado que existe desde antes y tiene razón:
// ninguna ruta de pedido escribe sobre `ProductoBase`, salvo recibir. Los datos
// del producto se editan en editar producto y no como efecto lateral de otra
// cosa — así fue como los costos se filtraban al catálogo sin que nadie lo
// pidiera. Escribir la relación desde vincular habría abierto esa puerta otra
// vez, por una razón buena, que es como se abren siempre.
//
// EL MECANISMO QUE SÍ SE USA ES EL ALIAS, y ya existía: `vincular` escribe
// `ProductoCodigoProveedor`, el catálogo del proveedor suma las bases con un
// código vinculado activo —`baseIdsVinculados`— y la cascada las reconoce solas
// por `ALIAS_DESCRIPCION`. O sea que el producto aparece en la búsqueda normal
// la próxima vez, que es lo que hacía falta, sin tocar su ficha.
//
// Lo que queda acá es la pregunta —¿este producto ya es de este proveedor?— y
// el texto de lo que pasó. La decisión de llenar la relación, si algún día hace
// falta, es de Emanuel y va por editar producto.
//
// Módulo puro: sin Prisma. Decide QUÉ escribir; quien escribe es la ruta.

/** Las tres relaciones, en el orden en que se llenan. */
export const RELACIONES_DE_PROVEEDOR = Object.freeze([
  "proveedor_id",
  "proveedor2_id",
  "proveedor3_id",
]);

/** ¿Este producto ya se le compra a este proveedor? */
export function yaEsDelProveedor(base, proveedorId) {
  const id = Number(proveedorId);
  if (!Number.isFinite(id)) return false;
  return RELACIONES_DE_PROVEEDOR.some((campo) => Number(base?.[campo]) === id);
}

/** Lo que se le dice a la persona, que es distinto en cada caso. */
export function textoDeLaAsociacion(resultado, proveedorNombre = "este proveedor") {
  // Solo se dice algo cuando el producto NO era de este proveedor: ahí es donde
  // la persona necesita saber que la próxima vez no va a tener que salir del
  // universo. Si ya era suyo, no cambió nada y decirlo sería ruido.
  if (resultado?.accion === "POR_ALIAS") {
    return (
      `Este producto no figuraba entre los de ${proveedorNombre}: quedó guardado el nombre con ` +
      "el que lo factura, así que la próxima vez lo va a encontrar sin salir del proveedor."
    );
  }
  return null;
}
