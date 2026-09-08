// LAS DOS PIEZAS MÍNIMAS QUE UNA PRUEBA NECESITA PARA QUE EL POS PUEDA COBRAR.
//
// ── POR QUÉ ESTÁN ACÁ Y NO COPIADAS EN CADA FIXTURE ────────────────────────
//
// `scripts/pruebas-db/modalidadesCobro.mjs` ya armaba un producto vendible y un
// turno abierto para poder ejercer la ruta de crear venta. El runner visual
// necesita exactamente lo mismo —`prisma/seed.js` no crea ningún producto— y la
// salida fácil era escribir un segundo armado al lado.
//
// Dos armados del mismo escenario no se rompen el día que se escriben: se rompen
// el día que uno cambia. Si mañana un producto necesita otro campo para que
// `buscar-producto` lo devuelva, la copia que no se toque va a seguir sembrando
// un producto que la pantalla no encuentra, y el rojo va a parecer de la UI.
//
// ── SOLO INFRAESTRUCTURA DE PRUEBA ─────────────────────────────────────────
//
// Nada de acá entra a `prisma/seed.js`. El seed produce el escenario base del
// runner y de cualquier entorno que lo corra; los datos de una prueba viven en
// la prueba, y por eso estos dos helpers reciben el cliente en vez de crearlo.

/**
 * UN PRODUCTO QUE EL POS PUEDE ENCONTRAR Y VENDER.
 *
 * Los campos no son decorativos: `buscar-producto` filtra por `activo` en el
 * producto del local Y en su ficha base, así que un producto sembrado sin los
 * dos no aparece en la búsqueda y el rojo se lee como un defecto de la pantalla.
 * El stock se crea porque sin fila el listado lo informa en cero y, según la
 * configuración del local, lo marca como no disponible para venta.
 *
 * @returns {Promise<{baseId:number, productoLocalId:number}>}
 */
export async function crearProductoVendible(db, {
  grupoId,
  localId,
  nombre,
  precioVenta = 1000,
  precioCosto = 600,
  stock = 1000,
}) {
  const base = await db.productoBase.create({
    data: {
      grupoId: Number(grupoId),
      nombre,
      unidad_medida: "unidad",
      precio_costo: precioCosto,
      precio_venta: precioVenta,
      redondeo_100: false,
      activo: true,
    },
  });
  const productoLocal = await db.productoLocal.create({
    data: { localId: Number(localId), baseId: base.id, nombre, activo: true },
  });
  await db.stockLocal.create({
    data: { localId: Number(localId), productoId: productoLocal.id, cantidad: stock },
  });
  return { baseId: base.id, productoLocalId: productoLocal.id };
}

/**
 * UN TURNO ABIERTO, que es lo que habilita el cobro.
 *
 * Sin turno el POS ni siquiera dibuja el panel: redirige a la pantalla de
 * apertura. O sea que una sonda sin esto no mide la pantalla de cobro, mide otra
 * — y la foto saldría igual de convincente.
 *
 * Es idempotente: si el local ya tiene uno abierto lo devuelve, porque abrir dos
 * turnos a la vez es un estado que la aplicación no produce.
 */
export async function abrirTurnoDePrueba(db, { localId, vendedorId, montoInicial = 0 }) {
  const abierto = await db.turno.findFirst({
    where: { localId: Number(localId), cierre: null },
    orderBy: { id: "desc" },
  });
  if (abierto) return abierto;

  return db.turno.create({
    data: { localId: Number(localId), vendedorId: Number(vendedorId), montoInicial },
  });
}
