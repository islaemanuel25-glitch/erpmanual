// "PUEDEN SER DE DAB": EL PAQUETE 2 DE UNA LISTA (Emanuel, 2026-10-24).
//
// La revisión se separa en dos paquetes. El 1, "Tus productos de Dab", son los
// productos que ya tienen a Dab en alguno de sus tres lugares. El 2 son
// productos tuyos de OTRO proveedor, o sin proveedor, que se parecen a un
// renglón de la lista que no encontró ninguno del paquete 1.
//
// Hasta acá el 2 se calculaba al tocar «Buscar en el resto de mis productos»,
// en la ruta `posibles`. Ahora se calcula SOLO —al leer la lista, al volver a
// conciliar y al deshacer una aceptación— y se GUARDA
// (`ProductoQuePuedeSerDeLaLista`). El cálculo es el que estaba en la ruta,
// mudado acá tal cual: las mismas reglas.
//
// ── QUÉ SE CRUZA CON QUÉ ──────────────────────────────────────────────────
//
// Los renglones de ESTA lista que quedaron sin vincular, con código, contra
// los productos activos que VE la ubicación donde se subió la lista
// (`alcanceDeLaListaWhere`: un exclusivo de otro local nunca) y que NO tienen
// ningún vínculo con este proveedor: ni en sus tres lugares, ni por un código.
// Se dejan afuera además los combos —no tienen costo propio— y los renglones
// que ya son la sugerencia "¿Es …?" de un producto del paquete 1: esa pregunta
// ya está hecha en su tarjeta. El parecido, el umbral, el empate y los «No»
// son los de esa misma sugerencia (`posiblesDelProveedor`).
//
// ── LA PROPUESTA NO ES LA ACEPTACIÓN ──────────────────────────────────────
//
// Una fila de acá es la propuesta y nada más. «✓ Sí» u «Otro» la ACEPTAN
// (`ProductoSumadoALaLista`) sin borrarla; «No» la borra. «Por confirmar» es la
// propuesta sin aceptar y con el renglón todavía libre (`porConfirmarWhere`), y
// «Confirmados» es lo sumado a la lista. Son dos hechos y se leen juntos.

import { alcanceDeLaListaWhere, productoSinElProveedorWhere } from "./cargaErp.js";
import { clavesDeCodigo } from "./normalizarCodigo.js";
import { esImportacionAbierta } from "./persistencia.js";
import { claveDeRechazo, posiblesDelProveedor, sugerenciasDeRenglones } from "./vincularConUnaFila.js";

/** Los renglones, con lo que hace falta para cruzarlos. */
const CAMPOS_RENGLON = {
  id: true,
  codigoCrudo: true,
  codigoNormalizado: true,
  descripcionProveedor: true,
  precioConIva: true,
  unidadesPorBulto: true,
  productoBaseId: true,
};

/**
 * Las propuestas de una lista, sin guardar: `[{ producto, puntaje, renglon }]`.
 *
 * @param db            el cliente de Prisma (o el de una transacción)
 * @param grupoId       el grupo de la lista
 * @param importacionId la lista
 * @param proveedorId   su proveedor
 * @param localId       la ubicación donde se subió (`localOperativoId`)
 */
export async function calcularPuedenSer(db, { grupoId, importacionId, proveedorId, localId }) {
  const [libres, delProveedor, porCodigo, rechazos, conRenglon] = await Promise.all([
    db.importacionListaFila.findMany({
      where: { importacionId, productoBaseId: null, aplicada: false },
      select: CAMPOS_RENGLON,
      orderBy: { filaExcel: "asc" },
    }),
    db.productoBase.findMany({
      where: alcanceDeLaListaWhere({ grupoId, localId, proveedorId }),
      select: { id: true, nombre: true },
    }),
    db.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId, activo: true },
      select: { productoBaseId: true },
    }),
    db.renglonQueNoEsElProducto.findMany({
      where: { grupoId, proveedorId },
      select: { productoBaseId: true, codigoInterno: true },
    }),
    db.importacionListaFila.findMany({
      where: { importacionId, productoBaseId: { not: null } },
      select: { productoBaseId: true },
    }),
  ]);

  // ── LOS QUE YA TIENEN VÍNCULO CON ESTE PROVEEDOR, AFUERA ──────────────
  const conVinculo = new Set([...delProveedor.map((p) => p.id), ...porCodigo.map((c) => c.productoBaseId)]);

  // ── LOS RENGLONES QUE YA SON "¿ES …?" DE UN PRODUCTO DEL PAQUETE 1 ─────
  // Con la misma cuenta que la ruta del resultado: si acá se propusiera ese
  // renglón para otro producto, las dos preguntas competirían por él.
  const yaEnLaLista = new Set(conRenglon.map((f) => f.productoBaseId));
  const sinRenglon = delProveedor.filter((p) => !yaEnLaLista.has(p.id));
  const sugeridos = new Set([...sugerenciasDeRenglones({ filas: libres, productos: sinRenglon }).values()].map((s) => s.id));
  const renglones = libres.filter((f) => !sugeridos.has(f.id) && clavesDeCodigo(f.codigoNormalizado ?? f.codigoCrudo).normalizado);

  // El resto de lo que VE la ubicación de la lista: un exclusivo de otro local
  // no se propone nunca.
  const catalogo = await db.productoBase.findMany({
    where: {
      AND: [alcanceDeLaListaWhere({ grupoId, localId }), { es_combo: false, id: { notIn: [...conVinculo] } }],
    },
    select: { id: true, nombre: true },
  });

  return posiblesDelProveedor({
    filas: renglones.map((f) => ({ ...f, codigoNormalizado: clavesDeCodigo(f.codigoNormalizado ?? f.codigoCrudo).normalizado })),
    productos: catalogo,
    rechazos: new Set(rechazos.map((r) => claveDeRechazo(r.productoBaseId, r.codigoInterno))),
  });
}

/**
 * Calcula y GUARDA las propuestas de una lista: reemplaza las que había y anota
 * cuándo (`puedenSerCalculadoEn`). En una transacción: una lista nunca queda
 * con la mitad de las propuestas.
 *
 * @returns cuántas propuestas quedaron
 */
export async function recalcularPuedenSer(db, { grupoId, importacionId }) {
  const cab = await db.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId },
    select: { id: true, proveedorId: true, localOperativoId: true },
  });
  if (!cab) return 0;
  const posibles = await calcularPuedenSer(db, {
    grupoId,
    importacionId,
    proveedorId: cab.proveedorId,
    localId: cab.localOperativoId,
  });
  const ahora = new Date();
  const escribir = async (tx) => {
    await tx.productoQuePuedeSerDeLaLista.deleteMany({ where: { importacionId } });
    if (posibles.length > 0) {
      await tx.productoQuePuedeSerDeLaLista.createMany({
        data: posibles.map(({ producto, puntaje, renglon }) => ({
          grupoId,
          importacionId,
          productoBaseId: producto.id,
          filaId: renglon.id,
          puntaje,
          calculadoEn: ahora,
        })),
      });
    }
    await tx.importacionListaProveedor.update({ where: { id: importacionId }, data: { puedenSerCalculadoEn: ahora } });
  };
  // Adentro de una transacción ajena se escribe con ella; si no, con una propia.
  if (typeof db.$transaction === "function") await db.$transaction(escribir);
  else await escribir(db);
  return posibles.length;
}

/**
 * Lo mismo, sin frenar a quien llama: leer o reconciliar una lista no puede
 * caerse porque falló el paquete 2. Si falla, se dice en el log y la marca
 * queda en null, así que la próxima lectura lo vuelve a intentar
 * (`asegurarPuedenSer`): no queda calculado a medias ni viejo en silencio.
 */
export async function intentarRecalcularPuedenSer(db, { grupoId, importacionId }) {
  try {
    return { ok: true, cantidad: await recalcularPuedenSer(db, { grupoId, importacionId }) };
  } catch (e) {
    console.error("[listas/puedenSer] no se pudo calcular el paquete 2", importacionId, e);
    await db.importacionListaProveedor
      .update({ where: { id: importacionId }, data: { puedenSerCalculadoEn: null } })
      .catch(() => {});
    return { ok: false };
  }
}

/**
 * Una lista abierta que nunca se calculó —de antes de esto, o un cálculo que
 * falló— se calcula al leerla. Cerrada no: ya no se le suma nada.
 */
export async function asegurarPuedenSer(db, cab) {
  if (!cab || cab.puedenSerCalculadoEn || !esImportacionAbierta(cab.estado)) return;
  await intentarRecalcularPuedenSer(db, { grupoId: cab.grupoId, importacionId: cab.id });
}

/**
 * «POR CONFIRMAR»: la propuesta sin aceptar, con el renglón todavía libre, y
 * de un producto que sigue sin vínculo con el proveedor. El único `where` de la
 * pregunta: lo usan el resultado y el listado, así que el número del botón y
 * las tarjetas no pueden decir cosas distintas.
 */
export function porConfirmarWhere({ importacionId, proveedorId }) {
  return {
    importacionId,
    fila: { productoBaseId: null, aplicada: false },
    productoBase: {
      AND: [
        { sumadoEnListas: { none: { importacionId } } },
        // Null-seguro: `{ NOT: productoDelProveedorWhere }` deja afuera a todo
        // producto con un lugar vacío (ver `productoSinElProveedorWhere`).
        productoSinElProveedorWhere(proveedorId),
        { codigosProveedor: { none: { proveedorId, activo: true } } },
      ],
    },
  };
}
