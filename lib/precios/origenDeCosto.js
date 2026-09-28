// lib/precios/origenDeCosto.js
//
// POR QUÉ CAMBIÓ UN COSTO: EL CONTRATO DE ORÍGENES PARA EL LIBRO DE COSTOS.
//
// El Libro de Costos todavía no existe. Cuando exista, lo van a escribir
// triggers sobre `ProductoBase` y `ProductoLocal`, que ven QUÉ costo quedó pero
// no POR QUÉ. Esta PR deja declarado el porqué en cada escritor que lo puede
// declarar sin cambiar su estructura, para que el libro nazca con la causa
// desde el primer día. Hoy nadie lee estas configuraciones: declarar no cambia
// ni un valor ni una escritura.
//
// El mecanismo es el del libro físico —`lib/libros/origenDeTransaccion.js`—, con
// sus propias configuraciones para que un origen de stock y uno de costo
// declarados en la misma transacción no se pisen.
//
// ── LA DIFERENCIA CON EL LIBRO FÍSICO, Y ES A PROPÓSITO ────────────────────
//
// `declararOrigenDeStock` RECHAZA una declaración mal hecha. Ésta la DESCARTA y
// avisa por consola: la escritura sigue y queda como SIN_ORIGEN. El origen es
// metadata, y una compra o una lista de proveedor no se pueden caer por su
// metadata. Que un escritor declare bien lo prueban los candados, no la
// producción.
//
// ── LA LISTA ES CERRADA ────────────────────────────────────────────────────
//
// A diferencia del libro físico, acá no vale cualquier identificador: vale uno
// de `ORIGEN_COSTO`. Cada uno sale de un escritor que existe hoy —el censo está
// en `origenDeCosto.test.mjs`, y se pone rojo si aparece uno nuevo sin
// clasificar—. Un nombre nuevo se agrega junto con su escritor, nunca antes.
//
// ── LO QUE QUEDA SIN_ORIGEN, Y POR QUÉ ─────────────────────────────────────
//
// Tres escritores escriben costo con el cliente raíz, en sentencias sueltas y
// sin transacción, y ahí un `set_config` local muere antes de la escritura.
// Declarar exigiría envolverlos en una transacción, y eso cambia su atomicidad:
// hoy una falla a mitad deja lo que ya se escribió. No se tocan en esta PR.
//
//   - el editor de producto (`app/api/productos/editar/[id]/route.js`): la
//     base, la propagación a las ubicaciones, la alineación del dueño y el
//     override de un local;
//   - el autocompletado de ProductoLocal faltantes al listar stock
//     (`app/api/stock_locales/listar/route.js`);
//   - los ProductoLocal de la importación desde stock
//     (`app/api/stock_locales/importar/route.js`): sus bases sí declaran.
//
// `propagarCostoALocales` y `actualizarCostoRealProducto` no declaran: heredan
// el origen de quien los llama. Por eso la propagación del editor queda
// SIN_ORIGEN y la de una compra queda COMPRA_PROVEEDOR.
//
// Tampoco declaran las bajas —`productos/eliminar` y el reset operativo— ni los
// cambios de escala —factor de pack, unidad, peso—, que el Libro también va a
// versionar: están fuera del censo de esta PR, que es el de `precio_costo`.

// Relativo y no con `@/`: lo importan piezas que también corren sin el cargador
// de alias, como `lib/combos/service.js`.
import { motivoDeClienteInvalido, escribirOrigenEnTransaccion } from "../libros/origenDeTransaccion.js";

/** Las configuraciones de PostgreSQL que va a leer el trigger del Libro de Costos. */
export const CONFIG_COSTO_ORIGEN = "erpazul.costo_origen";
export const CONFIG_COSTO_ORIGEN_REF = "erpazul.costo_origen_ref";

/**
 * Lo que va a escribir el trigger cuando nadie declaró. Es un valor válido e
 * informativo: el costo quedó registrado igual, lo que falta es la causa.
 */
export const SIN_ORIGEN_COSTO = "SIN_ORIGEN";

/**
 * Los orígenes, uno por escritor real. La referencia que acompaña a cada uno
 * está dicha al lado; si no se dice, va vacía.
 */
export const ORIGEN_COSTO = Object.freeze({
  // Cierre de la recepción de un pedido a proveedor: el costo real que decidió
  // el dueño, su propagación a las ubicaciones y el ProductoLocal que se crea
  // cuando compra un local. Referencia: el id del pedido.
  COMPRA_PROVEEDOR: "COMPRA_PROVEEDOR",
  // Aplicar una lista de proveedor. Referencia: el id de la importación.
  LISTA_PROVEEDOR_APLICAR: "LISTA_PROVEEDOR_APLICAR",
  // Revertir una lista de proveedor aplicada. Referencia: el id de la importación.
  LISTA_PROVEEDOR_REVERTIR: "LISTA_PROVEEDOR_REVERTIR",
  // Actualización masiva de precios desde productos.
  ACTUALIZACION_MASIVA_PRECIOS: "ACTUALIZACION_MASIVA_PRECIOS",
  // Importar productos desde planilla (altas y actualizaciones).
  IMPORTACION_PRODUCTOS: "IMPORTACION_PRODUCTOS",
  // Importar productos desde la pantalla de stock (solo las bases: ver el
  // censo, sus ProductoLocal se escriben fuera de la transacción).
  IMPORTACION_STOCK: "IMPORTACION_STOCK",
  // Alta de un producto desde el módulo de productos.
  ALTA_PRODUCTO: "ALTA_PRODUCTO",
  // Alta de un producto desde la pantalla de stock.
  ALTA_PRODUCTO_DESDE_STOCK: "ALTA_PRODUCTO_DESDE_STOCK",
  // Alta y edición de combos: su costo es la suma de los componentes. La
  // edición lleva de referencia el id del ProductoLocal del combo.
  COMBO_ALTA: "COMBO_ALTA",
  COMBO_EDICION: "COMBO_EDICION",
  // El ProductoLocal del destino que se crea al ENVIAR una transferencia.
  // Referencia: `venta:<id>` o `pos:<id>`, según de dónde salga.
  ALTA_POR_TRANSFERENCIA_ENVIO: "ALTA_POR_TRANSFERENCIA_ENVIO",
  // El ProductoLocal del destino que se crea al CONFIRMAR una recepción.
  // Referencia: el id de la transferencia.
  ALTA_POR_TRANSFERENCIA_RECEPCION: "ALTA_POR_TRANSFERENCIA_RECEPCION",
  // Los ProductoLocal que un local hereda del depósito de su grupo.
  // Referencia: el id del local que hereda.
  HERENCIA_DEL_DEPOSITO: "HERENCIA_DEL_DEPOSITO",
  // Promover un producto exclusivo al depósito: las ubicaciones que se crean.
  // Referencia: el id del ProductoBase.
  PROMOCION_A_DEPOSITO: "PROMOCION_A_DEPOSITO",
});

const VALIDOS = new Set(Object.values(ORIGEN_COSTO));

/** Por qué este origen no sirve, o null si es uno del contrato. */
export function motivoDeOrigenDeCostoInvalido(origen) {
  if (!VALIDOS.has(origen)) {
    return `El origen de costo tiene que ser uno de ORIGEN_COSTO: recibí ${JSON.stringify(origen)}`;
  }
  return null;
}

/**
 * Le dice al futuro trigger del Libro de Costos por qué van a cambiar costos en
 * ESTA transacción. Va con el `tx` de `prisma.$transaction`, antes de escribir.
 *
 * NUNCA lanza por una declaración mal hecha: la descarta, avisa y devuelve
 * false, y la escritura sigue como SIN_ORIGEN. Un error de la base sí se
 * propaga, como el de cualquier otra sentencia de la transacción.
 *
 * @param {object} tx
 * @param {{ origen: string, referencia?: string|number|null }} declaracion
 * @returns {Promise<boolean>} si quedó declarado
 */
export async function declararOrigenDeCosto(tx, { origen, referencia = null } = {}) {
  const motivo = motivoDeClienteInvalido(tx, "declararOrigenDeCosto") ?? motivoDeOrigenDeCostoInvalido(origen);
  if (motivo) {
    console.warn(`[origenDeCosto] no se declaró, queda ${SIN_ORIGEN_COSTO}: ${motivo}`);
    return false;
  }
  await escribirOrigenEnTransaccion(tx, {
    claveOrigen: CONFIG_COSTO_ORIGEN,
    claveReferencia: CONFIG_COSTO_ORIGEN_REF,
    origen,
    referencia,
  });
  return true;
}
