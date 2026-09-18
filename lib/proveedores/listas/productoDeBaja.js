// lib/proveedores/listas/productoDeBaja.js
//
// UN PRODUCTO DADO DE BAJA NO PARTICIPA DE UNA LISTA DE PROVEEDOR.
//
// ── EL DEFECTO, MEDIDO EN PRODUCCIÓN EL 2026-09-18 ─────────────────────────
//
// El módulo de listas no miraba `activo` en NINGUNA de sus consultas: ni la
// ficha maestra ni la del local, ni al conciliar ni al aplicar. Resultado: 11
// productos dados de baja —7 de Arcor y 4 de Myf— aparecían en cada importación
// de su proveedor, repartidos entre "no vino en la lista" y "sin código del
// proveedor", ensuciando la pantalla donde se decide qué hacer con cada uno.
//
// Y dos de ellos —MOGUL EXTREME ARANDANO X8 y Mogul extreme mini gusanitos 50g—
// conservaban su vínculo de código de proveedor ACTIVO. Nunca llegaron a
// machear porque Arcor todavía no mandó esos códigos, pero nada lo impedía: el
// vínculo estaba vivo, el producto estaba en el universo, y el camino que
// escribe el costo tampoco miraba `activo`. La próxima lista de Arcor que los
// trajera les habría movido el costo.
//
// ── POR QUÉ ES UN ARCHIVO PROPIO Y NO VIVE EN `cargaErp.js` ────────────────
//
// Porque acá adentro no hay una sola consulta: son tres funciones PURAS, y una
// de ellas —`productoEstaDeBaja`— la necesita `aplicacion.js`, que es un módulo
// puro que terminan importando componentes de cliente.
//
// Se intentó primero ponerlas en `cargaErp.js`, al lado del predicado del
// universo, y **el build se cayó**: `cargaErp.js` importa el cliente de Prisma y
// con él el interceptor de auditoría, que arrastra `next/server`. Nada de eso
// existe en el bundle del navegador. Es el mismo acoplamiento que esos archivos
// ya documentan en sus encabezados, encontrado por el camino de al lado.
//
// La regla que queda: **un predicado puro no vive en el módulo que habla con la
// base.** Si las dos cosas conviven, el día que alguien lo importe desde el
// cliente se entera con un build roto y no con un error legible.

/**
 * EL UNIVERSO PIDE QUE EL PRODUCTO ESTÉ VIVO.
 *
 * ── QUÉ CUENTA COMO DADO DE BAJA, Y POR QUÉ SON DOS CONDICIONES ────────────
 *
 * Un producto está de baja si su ficha MAESTRA está inactiva, o si tiene fichas
 * por local y NINGUNA está activa. Son dos hechos distintos y hacen falta los
 * dos: apagar la maestra es la baja del catálogo, y apagar la última ficha local
 * es la baja de hecho —el producto ya no existe en ninguna caja, aunque la
 * maestra siga prendida—.
 *
 * **Un producto SIN ninguna ficha por local NO está de baja.** Es el recién
 * creado en el depósito que todavía no bajó a ningún local, y sacarlo del
 * universo lo haría invisible justo cuando hay que cargarle el primer costo. Por
 * eso la condición mira "tiene fichas Y ninguna activa", no "no tiene ninguna
 * activa".
 *
 * **La baja se evalúa GLOBAL y no por local, a propósito.** Un producto apagado
 * en Mini el 7 pero vivo en el depósito sigue participando: el costo que la
 * lista escribe es el de la ficha maestra, que es de todos. Si se filtrara por
 * el local de la importación, una baja en un solo local le congelaría el costo
 * al resto.
 *
 * @returns fragmento de `where` para ProductoBase.
 */
export function productoActivoWhere() {
  return {
    activo: true,
    NOT: {
      AND: [{ locales: { some: {} } }, { locales: { none: { activo: true } } }],
    },
  };
}

/**
 * La misma regla dada vuelta, para filtrar FILAS por el estado de su producto.
 *
 * `productoActivoWhere` dice quién entra; ésta dice quién sobra. No se puede
 * usar `NOT: productoActivoWhere()` sobre la relación porque una fila sin
 * producto vinculado —`productoBaseId` en null— no tiene qué evaluar y tiene que
 * quedarse: son las filas "no lo tenés", que son la mitad del trabajo.
 *
 * @returns fragmento de `where` para ImportacionListaFila.
 */
export function filaConProductoDeBajaWhere() {
  return {
    productoBase: {
      is: {
        OR: [
          { activo: false },
          { AND: [{ locales: { some: {} } }, { locales: { none: { activo: true } } }] },
        ],
      },
    },
  };
}

/**
 * La misma regla, pero para decidir sobre un producto YA LEÍDO.
 *
 * El `where` de arriba sirve para no traerlo; éste sirve para rechazarlo en el
 * momento de escribir, que es cuando de verdad importa. Son los dos lados del
 * mismo hecho y tienen que existir los dos: entre conciliar una lista y
 * aplicarla pasan días, y en el medio alguien puede dar de baja el producto.
 * Filtrar al conciliar no protege a la fila que ya quedó conciliada.
 *
 * **Falla CERRADO**: un producto que no llegó, o que llegó sin el campo
 * `activo`, se trata como dado de baja. Es a propósito — si una consulta se
 * olvida de traer el dato, lo que pasa es que no se escribe un costo, no que se
 * escriba sin haber mirado—. El precio de eso es que **todo el que llame a
 * `revalidarFila` tiene que seleccionar `activo` y `locales`**; los dos que hay
 * hoy lo hacen, y sus fixtures también.
 *
 * @param base fila de ProductoBase con `activo` y su colección `locales`.
 */
export function productoEstaDeBaja(base) {
  if (!base) return true;
  if (base.activo !== true) return true;
  const locales = base.locales;
  if (!Array.isArray(locales) || locales.length === 0) return false;
  return !locales.some((l) => l?.activo === true);
}
