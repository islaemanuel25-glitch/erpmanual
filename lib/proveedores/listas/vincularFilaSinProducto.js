// lib/proveedores/listas/vincularFilaSinProducto.js
//
// VINCULAR UN RENGLÓN DE LA LISTA QUE NO TIENE PRODUCTO A UNO DEL CATÁLOGO.
//
// Es la pregunta de «Qué producto es» de la recepción, hecha sobre una lista:
// dada una FILA sin producto, a cuál del catálogo corresponde. La contesta una
// persona —eligiendo uno que ya existe, o creándolo en el momento— y la ruta
// `filas/[filaId]/vincular` escribe la respuesta.
//
// Las otras dos combinaciones ya tenían su ruta y no se tocan:
//   · `otra-fila`: la fila está atada al producto equivocado;
//   · `productos/[productoBaseId]/en-la-lista`: el producto no tiene renglón.
//
// ── EL CÓDIGO SE ESCRIBE POR `servicioIdentidad`, NO A MANO ───────────────
//
// Es la memoria que comparten listas y recepción: lo que se confirma acá lo
// reconoce la próxima factura, y al revés. `filasDeIdentidad` arma la fila
// —código y alias, con la confirmación de quién la decidió— y
// `persistirIdentidad` la guarda respetando lo que ya está: una persona que
// confirma pisa una deducción, y una fila que ya existía se actualiza en vez de
// duplicarse (la clave es grupo + proveedor + código).
//
// ── EL VEREDICTO LO DA `conciliarFila`, EL MISMO MOTOR ────────────────────
//
// Con un índice que tiene solo el código recién guardado: el mismo armado que
// usa `en-la-lista`. Si acá se calculara un costo propio, este renglón tendría
// un número que no salió del mismo lugar que los demás.
//
// Módulo puro: la ruta lee y escribe, esto decide.

import { filasDeIdentidad, METODO_DETECCION } from "@/lib/proveedores/identidad/servicioIdentidad";
import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "@/lib/proveedores/listas/conciliarLista";
import { filaAPersistir } from "@/lib/proveedores/listas/persistencia";
import { filaParaElMotor, productoParaElMotor } from "@/lib/proveedores/listas/vincularConUnaFila";

/** Por qué no se vincula. Cada uno con su status HTTP. */
export const RECHAZO_VINCULO = Object.freeze({
  FILA_APLICADA: "FILA_APLICADA",
  DE_OTRO_PRODUCTO: "DE_OTRO_PRODUCTO",
  SIN_CODIGO: "SIN_CODIGO",
});

/** El código con el que el proveedor nombra este renglón, o null. */
export function codigoDeLaFila(fila) {
  const c = String(fila?.codigoNormalizado ?? "").trim() || String(fila?.codigoCrudo ?? "").trim();
  return c || null;
}

/**
 * ¿SE PUEDE VINCULAR ESTA FILA A ESTE PRODUCTO?
 *
 *   · aplicada: su costo ya se escribió en otro lado; moverla dejaría ese costo
 *     sin nada que lo explique. Se deshace primero, que es otra acción;
 *   · ya de otro producto: esta ruta es para las filas SIN producto. Cambiar
 *     de producto es «No es este producto» (`otra-fila`);
 *   · ya de ESTE producto: no es un error. Se contesta que ya estaba y no se
 *     escribe nada, así un segundo toque no duplica nada;
 *   · sin código: no hay con qué reconocerla la próxima vez.
 *
 * @returns `{ ok: true, yaEstaba, codigo }` o `{ ok: false, codigo, status, error }`
 */
export function decidirVinculoDeLaFila({ fila, productoBaseId }) {
  if (fila?.aplicada === true) {
    return {
      ok: false,
      rechazo: RECHAZO_VINCULO.FILA_APLICADA,
      status: 409,
      error: "Ese renglón ya se aplicó. Para moverlo, primero deshacé la aplicación.",
    };
  }
  const actual = fila?.productoBaseId ?? null;
  if (actual !== null && Number(actual) === Number(productoBaseId)) {
    return { ok: true, yaEstaba: true, codigo: codigoDeLaFila(fila) };
  }
  if (actual !== null) {
    return {
      ok: false,
      rechazo: RECHAZO_VINCULO.DE_OTRO_PRODUCTO,
      status: 409,
      error: "Ese renglón ya está vinculado a otro producto. Para cambiarlo, usá «No es este producto».",
    };
  }
  const codigo = codigoDeLaFila(fila);
  if (!codigo) {
    return {
      ok: false,
      rechazo: RECHAZO_VINCULO.SIN_CODIGO,
      status: 409,
      error: "Ese renglón de la lista no tiene código, así que no se puede vincular.",
    };
  }
  return { ok: true, yaEstaba: false, codigo };
}

/**
 * Las filas de `ProductoCodigoProveedor` que deja el vínculo, armadas por
 * `servicioIdentidad`: código y alias, confirmados por quien vinculó.
 *
 * Sin `unidadesPorPresentacion` a propósito: el UxB de una lista es el bulto
 * logístico, no la presentación que factura el proveedor, y la recepción lee
 * ese campo para convertir cantidades.
 */
export function identidadDelVinculo({ grupoId, proveedorId, productoBaseId, fila, usuarioId, ahora }) {
  return filasDeIdentidad({
    grupoId,
    proveedorId,
    productoBaseId,
    codigoProveedor: codigoDeLaFila(fila),
    descripcionProveedor: fila?.descripcionProveedor ?? null,
    metodoDeteccion: METODO_DETECCION.MANUAL,
    confirmadaPorUsuarioId: usuarioId ?? null,
    confirmadaEn: usuarioId ? ahora : null,
  });
}

/** El renglón con su veredicto recalculado por el motor, contra este producto. */
export function reconciliarLaFila({ fila, producto, codigo, config, contexto, ahora }) {
  return conciliarFila({
    fila: filaParaElMotor(fila, { vinculadoEn: ahora }),
    indice: indexarCodigosProveedor([{ id: 0, productoBaseId: producto.id, codigoInterno: codigo, activo: true }]),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map([[producto.id, productoParaElMotor(producto)]]),
    contexto,
    config,
  });
}

/**
 * Los campos del renglón que lo LEÍDO del archivo dejó, y que el vínculo no
 * cambia. `filaParaElMotor` no los lleva —el motor no los necesita para
 * decidir—, así que `filaAPersistir` los devolvería en null o en cero: guardar
 * eso borraría el tamaño (`contenidoMl`), el descuento y las otras columnas de
 * precio, que sin el archivo no se recuperan.
 */
const CAMPOS_DEL_ARCHIVO = Object.freeze([
  "filaExcel",
  "hojaNombre",
  "codigoCrudo",
  "codigoNormalizado",
  "codigoComparableSinCeros",
  "codigoBarraProveedor",
  "descripcionProveedor",
  "categoriaCruda",
  "unidadProveedor",
  "unidadesPorBulto",
  "contenidoMl",
  "precioSinIva",
  "descuentoPct",
  "preciosPorColumna",
]);

/** Lo que se escribe en la fila: el veredicto, sin tocar lo leído del archivo. */
export function datosDeLaFilaVinculada(recalculada, { ahora }) {
  const datos = { ...filaAPersistir(recalculada), vinculadoEn: ahora };
  for (const c of CAMPOS_DEL_ARCHIVO) delete datos[c];
  return datos;
}
