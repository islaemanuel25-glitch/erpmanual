// lib/proveedores/listas/configuraciones/generico.js
//
// LA CONFIGURACIÓN DE UN PROVEEDOR CUALQUIERA.
//
// La de Arcor traduce tres unidades comerciales —UN, DI, BU— que vienen escritas
// en una columna de SU archivo. Ningún otro proveedor manda esa columna, y el
// sistema se vende para que cada cliente suba las listas de los suyos.
//
// ── QUÉ REEMPLAZA AL VETO POR UNIDAD ────────────────────────────────────────
//
// El rango, que es de lo que se trata el cuadrado. En Arcor, si el archivo dice
// "BU" y el producto guarda por unidad suelta, la fila se veta antes de calcular
// nada: el archivo AFIRMA una presentación y esa afirmación es incompatible.
//
// Acá el archivo no afirma nada. Las dos lecturas posibles —el precio tal cual y
// el precio por el factor del bulto— se ofrecen las dos, y elige la que cae
// adentro del aumento esperado. Si ninguna cae, la fila queda para revisar; si
// caen las dos, también. Nunca se elige por el nombre de una columna.
//
// Por eso `resolverCostoMaestro` acá no veta por unidad: no hay unidad que vetar,
// y vetar por una que no se sabe sería inventarla. Lo único que sigue vetando es
// lo que no depende del proveedor —un producto que guarda por kilo, por ejemplo—
// y eso lo decide el motor antes de llegar acá.
//
// Módulo puro: sin BD, sin Next.

import { round2, requiereConversionABulto, factorValido, aplicarRecargo } from "../calculoCosto.js";
import { aplicarImpuestoAdicional } from "../configuracionProveedor.js";
import { lecturasDeFila } from "../decisionDeLista.js";

export const PROVEEDOR_GENERICO = "GENERICO";

/**
 * El costo del precio tal cual, sin vetar por una unidad que el archivo no dice.
 *
 * Devuelve SIEMPRE una lectura utilizable cuando hay precio. Quién elige entre
 * las lecturas es `costoDeLaFila`, con el rango.
 */
function resolverCostoMaestro({ precioConRecargo }) {
  const p = Number(precioConRecargo);
  if (!Number.isFinite(p) || p <= 0) {
    return { costoMaestro: null, factorAplicado: null, motivo: null };
  }
  return { costoMaestro: round2(p), factorAplicado: 1, motivo: null };
}

/**
 * Las lecturas posibles de una fila genérica.
 *
 * Son las mismas dos que arma `decisionDeLista` para elegir la columna de la
 * lista, y salen del MISMO módulo a propósito: si la elección de columna mirara
 * unas lecturas y el costo de la fila mirara otras, la pantalla podría prometer
 * un costo que el motor después no aplica. Ya pasó una vez en este módulo, con
 * el armado del bulto, y el comentario que quedó en `aplicacion.js` lo dice con
 * todas las letras.
 *
 * LA CANTIDAD SALE DEL CATÁLOGO y solo si el producto es un bulto. La del
 * archivo —una columna de unidades, o el "12X500" del nombre— entra únicamente
 * cuando el catálogo no tiene ninguna, y viaja marcada como tal.
 */
function lecturasPosibles({ fila, base, recargoPct, impuestoAdicionalPct }) {
  const precio = aplicarImpuestoAdicional(
    aplicarRecargo(Number(fila?.precioConIva), Number(recargoPct ?? 0)),
    impuestoAdicionalPct
  );
  if (precio === null || !Number.isFinite(precio) || precio <= 0) return [];

  const delCatalogo = requiereConversionABulto(base) && factorValido(base?.factor_pack)
    ? Number(base.factor_pack)
    : null;

  return lecturasDeFila({
    fila: {
      factorPack: delCatalogo,
      cantidadDelArchivo: delCatalogo === null ? fila?.unidadesPorBulto ?? null : null,
    },
    precio: round2(precio),
  });
}

/** La configuración de un proveedor sin formato propio. */
export const CONFIG_GENERICA = {
  proveedor: PROVEEDOR_GENERICO,

  /** Qué campo de la fila leída es el precio de partida. */
  precioBase: "precioConIva",

  /**
   * Debajo de este importe un precio de lista deja de ser creíble.
   *
   * Un peso, el mismo que Arcor. No es un número de estilo: las cuatro listas
   * reales tienen filas con "$ 0,00" y con "0,01", y sin piso esas filas entran
   * al motor como precios y compiten por explicar la lista.
   */
  pisoPrecioCreible: 1,

  /**
   * No hay lista de unidades admitidas: el archivo no trae unidad comercial.
   *
   * Está escrito y en null a propósito, y no ausente. Una clave que falta se lee
   * como un olvido; una clave en null con este comentario al lado dice que la
   * pregunta se hizo y la respuesta es que no aplica.
   */
  unidadesAdmitidas: null,

  resolverCostoMaestro,
  lecturasPosibles,
};
