// lib/proveedores/altaEnUbicacion.js
//
// DAR DE ALTA UN PROVEEDOR DESDE UNA UBICACIÓN: qué se crea y qué se reusa.
//
// ── POR QUÉ ES UN MÓDULO PURO ──────────────────────────────────────────────
//
// Porque la decisión tiene un modo de fallar que no se ve mirando la pantalla:
// pisar los datos globales de un proveedor que ya existe. `Proveedor` no tiene
// `grupoId` y su `cuit` es único en TODA la base, así que la fila que un local
// encuentra por CUIT puede ser la que otro grupo usa todos los días. Escribirle
// el nombre o el teléfono que vino en el cuerpo le cambiaría el proveedor a
// todos, y el que lo hizo vería una pantalla que dice "listo".
//
// Acá se decide crear o reusar, y se declara qué campos NO se tocan al reusar.
// Sin base de datos y sin HTTP, así que las dos ramas se pueden ejercer.

/**
 * El CUIT tal como se va a guardar y buscar, o `null` si no vino.
 *
 * ── SE TRIMEA, Y ES UN CAMBIO CHICO PERO REAL ──────────────────────────────
 *
 * La ruta guardaba `cuit || null` sin recortar. Un espacio al final producía una
 * fila que el único no considera duplicada y que ninguna búsqueda posterior
 * encuentra: exactamente el segundo `Proveedor` que esta tanda existe para
 * evitar. Se recorta en los DOS lados —al buscar y al guardar— porque recortar
 * en uno solo los desincroniza.
 *
 * NO se normaliza más que eso. Sacarle los guiones convertiría "20-123-4" y
 * "201234" en el mismo proveedor, y las filas que ya están guardadas con guiones
 * dejarían de casar con su propia búsqueda. Unificar el formato del CUIT es otra
 * tanda y necesita decidir qué se hace con lo que ya está cargado.
 *
 * Una cadena vacía es `null` y no "": `null` significa "este proveedor no
 * declara CUIT", y con `@unique` sobre la columna, dos cadenas vacías chocarían
 * entre sí mientras dos nulos conviven.
 */
export function cuitParaBuscar(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

/**
 * LOS CAMPOS GLOBALES DE `Proveedor`. Al reusar, NINGUNO se escribe.
 *
 * Están enumerados para que un candado pueda comprobar que la rama de reuso no
 * los nombra. La lista es la de los datos que describen al proveedor en sí
 * —los que ve cualquier ubicación— y no incluye `creadoEnLocalId`, que es un
 * hecho de origen y tampoco se toca por otro motivo: reescribirlo le cambiaría
 * el origen a un proveedor que se dio de alta en otro lado.
 */
export const CAMPOS_GLOBALES = Object.freeze([
  "nombre",
  "cuit",
  "telefono",
  "email",
  "direccion",
  "dias_pedido",
  "activo",
  "creadoEnLocalId",
]);

export const ACCION = Object.freeze({
  CREAR: "CREAR",
  REUSAR: "REUSAR",
});

/**
 * ¿Se crea un `Proveedor` nuevo o se reusa el que ya está?
 *
 * @param {object} args
 * @param {string|null} args.cuitPedido  el CUIT ya pasado por `cuitParaBuscar`
 * @param {object|null} args.existente   la fila encontrada por ese CUIT, o null
 *
 * ── LOS TRES CASOS, Y EL TERCERO ES EL QUE DUELE ──────────────────────────
 *
 * · Hay CUIT y existe una fila con ese CUIT → **REUSAR**. Se asocia a la
 *   ubicación y no se le toca un solo campo global.
 * · Hay CUIT y no existe → **CREAR**.
 * · **NO hay CUIT → CREAR, y no hay forma de saber si es un duplicado.** El
 *   único de la base es sobre el CUIT: sin él, dos ubicaciones que den de alta
 *   "Panadería" van a producir dos filas de `Proveedor` distintas. No se
 *   deduplica por NOMBRE a propósito: dos proveedores pueden llamarse parecido,
 *   y unir por texto la fila de uno con la de otro es peor que tener dos.
 *   Queda declarado como límite conocido, no tapado.
 */
export function decidirAltaDeProveedor({ cuitPedido = null, existente = null } = {}) {
  if (cuitPedido && existente && existente.id) {
    return {
      accion: ACCION.REUSAR,
      proveedorId: Number(existente.id),
      motivo: "Ya existe un proveedor con ese CUIT: se asocia a la ubicación sin tocar sus datos.",
    };
  }
  if (cuitPedido) {
    return {
      accion: ACCION.CREAR,
      proveedorId: null,
      motivo: "No hay ningún proveedor con ese CUIT.",
    };
  }
  return {
    accion: ACCION.CREAR,
    proveedorId: null,
    motivo:
      "Sin CUIT no se puede saber si el proveedor ya existe: el único de la base es sobre el CUIT.",
  };
}

/**
 * EL NOMBRE DEL ÚNICO COMPUESTO, escrito UNA vez.
 *
 * Es el `name` de `@@unique([grupoId, localId, proveedorId])` en el schema, y
 * Prisma lo usa como clave del `where` de un `upsert`. Escribirlo a mano en la
 * ruta lo dejaría desincronizado el día que el schema lo renombre: el candado lo
 * compara contra el schema, así que un rename se ve en rojo en vez de explotar
 * contra Postgres.
 */
export const CLAVE_ASOCIACION = "proveedor_unico_por_ubicacion";

/**
 * El `where` de la asociación, por su único compuesto.
 *
 * Los tres campos se pasan por `Number` porque un id que llegó como texto —de
 * una query, de un JSON— produciría un `where` que no matchea ninguna fila y un
 * `upsert` que inserta un duplicado en vez de actualizar. La base lo frenaría
 * con el único, pero convertiría una operación idempotente en un error.
 */
export function claveAsociacion({ grupoId, localId, proveedorId } = {}) {
  return {
    [CLAVE_ASOCIACION]: {
      grupoId: Number(grupoId),
      localId: Number(localId),
      proveedorId: Number(proveedorId),
    },
  };
}

/**
 * ¿Esta alta tiene que producir además una asociación con una ubicación?
 *
 * Solo cuando hay contexto de ubicación. Un administrador que da de alta un
 * proveedor SIN contexto activo —el camino que existía antes de esta tanda—
 * sigue creando la fila global y ninguna asociación, que es exactamente lo que
 * hacía. Si asociara al azar, le habilitaría el proveedor a una ubicación que
 * nadie eligió.
 */
export function correspondeAsociar({ grupoId = null, localId = null } = {}) {
  return Number.isInteger(Number(grupoId)) && Number(grupoId) > 0
    && Number.isInteger(Number(localId)) && Number(localId) > 0;
}
