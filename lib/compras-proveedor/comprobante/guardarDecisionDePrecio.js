// EL ÚNICO ESCRITOR DE UNA DECISIÓN DE PRECIO.
//
// Las dos respuestas —aceptar el de la factura, dejar el propio— se guardan por
// acá y por ningún otro lado. Son la MISMA decisión con distinto valor, así que
// escribirlas en dos lugares distintos daría dos criterios para lo mismo: uno
// guardaría los precios comparados y el otro se olvidaría, y la decisión que se
// olvide de un número no se puede vencer cuando ese número cambia.
//
// Recibe el cliente —`prisma` o la transacción— porque aceptar un precio
// escribe además en la línea del pedido, y las dos cosas tienen que entrar o no
// entrar juntas: una decisión guardada sobre un costo que no se escribió haría
// que la próxima factura no pregunte por algo que nunca pasó.

/**
 * @param db     prisma o el `tx` de una transacción
 * @param datos  grupoId, proveedorId, productoBaseId, decision, los dos precios
 *               comparados, de qué renglón salió y quién decidió
 */
export function guardarDecisionDePrecio(
  db,
  {
    grupoId,
    proveedorId,
    productoBaseId,
    decision,
    precioFacturado,
    precioPropio,
    costoMaestroObservado,
    comprobanteLineaId = null,
    usuarioId = null,
  } = {}
) {
  // SIN LO OBSERVADO NO SE GUARDA. Una decisión nueva en NULL se leería igual
  // que una histórica —vencida siempre— y la hoja preguntaría sin fin sobre algo
  // que se acaba de contestar. Mejor que el error salga acá, donde se ve.
  if (costoMaestroObservado == null || !Number.isFinite(Number(costoMaestroObservado))) {
    throw new Error("Falta el costo del catálogo contra el que se decidió.");
  }
  const cuando = new Date();
  return db.decisionDePrecioProveedor.upsert({
    where: {
      decision_precio_unica_por_proveedor: { grupoId, proveedorId, productoBaseId },
    },
    create: {
      grupoId,
      proveedorId,
      productoBaseId,
      decision,
      precioFacturado,
      precioPropio,
      costoMaestroObservado,
      comprobanteLineaId,
      decididaPorUsuarioId: usuarioId,
      decididaEn: cuando,
    },
    // LA DE AHORA GANA SOBRE LA VIEJA, con sus dos precios. Es la misma regla
    // que el alias del producto: si alguien vuelve a decidir sobre este
    // producto, lo que vale es lo último que dijo — y los precios viejos no se
    // conservan porque ya no describen ninguna comparación viva.
    update: {
      decision,
      precioFacturado,
      precioPropio,
      costoMaestroObservado,
      comprobanteLineaId,
      decididaPorUsuarioId: usuarioId,
      decididaEn: cuando,
    },
  });
}
