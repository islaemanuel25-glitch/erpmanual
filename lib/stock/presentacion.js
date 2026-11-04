// lib/stock/presentacion.js
//
// Helpers de PRESENTACIÓN de stock (cómo mostrar unidades/bultos/piezas en la
// tabla de Stock Locales). Extraídos de components/stock_locales/TablaStock.jsx
// SIN cambiar comportamiento. Son funciones puras (no tocan reglas de inventario;
// StockLocal.cantidad sigue en UNIDADES, la presentación solo formatea).

import { esFiambreFijo, fromUnidades, sueltosParaCongelar } from "@/lib/conversiones/stock";
import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";

// "1 bulto", "2 bultos", "-1 bulto": solo la palabra, en singular cuando el
// valor absoluto es uno. No toca el número ni el signo. Es la única regla del
// singular para los bultos de stock: la usan este archivo, la tabla y el modal de
// ajuste de Stock Locales, y el Valor del Stock a través de
// `presentacionCantidadStock`.
export function textoDeBultos(bultos) {
  return `${bultos} ${palabraDeBultos(bultos)}`;
}

// La palabra sola, para quien dibuja el número en su propio nodo (la tabla).
export function palabraDeBultos(bultos) {
  return Math.abs(Number(bultos)) === 1 ? "bulto" : "bultos";
}

// ── EL STOCK EN TRES NIVELES (tercer nivel de empaque, tanda 7) ───────────
//
// La regla de Emanuel: el stock nunca se muestra en la unidad más chica pelada.
// En el depósito, "1 cartón"; en el local, "10 atados", y si se abrió uno, "9
// atados y 15 sueltos". El suelto aparece solo como RESTO: "15 sueltos" solo
// cuando no llega a un atado entero; "200 sueltos" no se escribe nunca.
//
// Los nombres salen del producto: `nombreBulto` ("cartón") y `nombreUnidad`
// ("atado"), en singular. Vacíos, el bulto es "bulto" —la palabra de hoy— y la
// unidad "unidad". El escalón de abajo es siempre "suelto". El plural se arma
// acá (`pluralDe`).
//
// Solo escribe algo para un producto con sueltos. Para todos los demás devuelve
// null y cada superficie sigue con el texto de siempre: hasta que la ficha cargue
// el dato (tanda 9), nada de lo que se ve cambia.

const NOMBRE_BULTO_SIN_DATO = "bulto";
const NOMBRE_UNIDAD_SIN_DATO = "unidad";
const NOMBRE_SUELTO = "suelto";

const VOCALES = "aeiouáéó";
const DESACENTUAR = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/**
 * El plural en castellano de un nombre en singular: "cartón" → "cartones",
 * "atado" → "atados", "caja" → "cajas", "unidad" → "unidades", "pack" → "packs".
 * Si el nombre tiene varias palabras ("pack de 10") se pluraliza la primera.
 */
export function pluralDe(nombre) {
  const texto = String(nombre ?? "").trim();
  if (!texto) return texto;
  const [primera, ...resto] = texto.split(/\s+/);
  const fin = primera.slice(-1).toLowerCase();
  let plural;
  if (VOCALES.includes(fin)) plural = `${primera}s`;
  else if (fin === "z") plural = `${primera.slice(0, -1)}ces`;
  else if ("sx".includes(fin)) plural = primera;
  else if ("lrndj".includes(fin)) {
    // "cartón" → "cartones": la tilde de la última sílaba se va con el plural.
    const penultima = primera.slice(-2, -1);
    const base = DESACENTUAR[penultima] ? `${primera.slice(0, -2)}${DESACENTUAR[penultima]}${fin}` : primera;
    plural = `${base}es`;
  } else plural = `${primera}s`;
  return [plural, ...resto].join(" ");
}

const palabraPara = (n, singular) => (Math.abs(Number(n)) === 1 ? singular : pluralDe(singular));
const nombreDe = (valor, sinDato) => (typeof valor === "string" && valor.trim() ? valor.trim() : sinDato);

/**
 * El nombre de la unidad de un producto con sueltos ("atado"), o el de siempre
 * si no lo tiene cargado. El mismo default que usa el texto en tres niveles,
 * definido una sola vez.
 */
export function nombreDeLaUnidad(p) {
  return nombreDe(p?.nombreUnidad, NOMBRE_UNIDAD_SIN_DATO);
}

/** "a", "a y b", "a, b y c". */
function enumerar(partes) {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/**
 * EL STOCK DE UN PRODUCTO CON SUELTOS, ESCRITO EN SUS TRES NIVELES. Null si el
 * producto no tiene sueltos: el que llama sigue con su texto de siempre.
 *
 * @param {object} p  el ítem: `stock` (en unidades de stock), `factorPack`,
 *   `unidadMedida`, `sueltosPorUnidad`, `nombreUnidad`, `nombreBulto`.
 * @param {boolean} esDeposito  en el depósito un pack o cajón se escribe en
 *   bultos; en un local, en unidades y sueltos.
 */
export function textoDeStockEnTresNiveles(p, esDeposito) {
  const n = sueltosParaCongelar({ sueltos_por_unidad: p?.sueltosPorUnidad, unidad_medida: p?.unidadMedida });
  if (n === null) return null;

  const conBulto = esPackDeposito(p ?? {}, esDeposito);
  const total = Number(p?.stock || 0);
  const { bultos, sueltas, sueltos } = fromUnidades({
    unidades: total,
    factorPack: conBulto ? p.factorPack : 1,
    sueltosPorUnidad: n,
  });

  const bulto = nombreDe(p?.nombreBulto, NOMBRE_BULTO_SIN_DATO);
  const unidad = nombreDe(p?.nombreUnidad, NOMBRE_UNIDAD_SIN_DATO);
  const partes = [
    bultos !== 0 ? `${Math.abs(bultos)} ${palabraPara(bultos, bulto)}` : null,
    sueltas !== 0 ? `${Math.abs(sueltas)} ${palabraPara(sueltas, unidad)}` : null,
    sueltos !== 0 ? `${Math.abs(sueltos)} ${palabraPara(sueltos, NOMBRE_SUELTO)}` : null,
  ].filter(Boolean);

  // Cero se dice en el escalón con que se cuenta la ubicación: "0 cartones" en
  // el depósito, "0 atados" en el local.
  if (partes.length === 0) return `0 ${pluralDe(conBulto ? bulto : unidad)}`;
  return `${total < 0 ? "-" : ""}${enumerar(partes)}`;
}

// Etiqueta de cantidad formateada. opts: { esFiambreFijo, esDeposito }.
export function formatCantidad(valor, unidadMedida, opts = {}) {
  const n = Number(valor || 0);
  if (opts.esFiambreFijo && opts.esDeposito) return `${Math.round(n)} pzs`;
  if (unidadMedida === "kg") return `${n.toFixed(3)} kg`;
  return `${Math.round(n)} uds`;
}

// ¿En el depósito este producto se muestra en bultos+sueltas (pack/cajón con factor)?
export function esPackDeposito(p, esDeposito) {
  if (!esDeposito) return false;
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  return f > 1 && (u === "pack" || u === "cajon");
}

// La presentación COMPLETA de la existencia, compartida por escritorio y
// móvil. `StockLocal.cantidad` siempre llega en unidades físicas; en depósito,
// un pack/cajón se desglosa en bultos + unidades sueltas para que 45 unidades
// de un Pack x10 se lean como "4 bultos + 5 uds".
//
// Se devuelven también las partes porque la tabla resalta los bultos con
// <strong>. La tarjeta solo necesita `texto`, pero las dos superficies toman la
// decisión de escala en este único lugar.
export function presentacionCantidadStock(p, esDeposito) {
  // Un producto con sueltos se escribe en tres niveles, en las dos superficies.
  const tres = textoDeStockEnTresNiveles(p, esDeposito);
  if (tres !== null) return { esDesglose: false, bultos: 0, sueltas: 0, texto: tres };

  if (esPackDeposito(p, esDeposito)) {
    const { bultos, sueltas } = fromUnidades({
      unidades: Number(p?.stock || 0),
      factorPack: p?.factorPack,
    });

    if (bultos !== 0 || sueltas !== 0) {
      // Las partes por separado: la tarjeta del celular las dibuja una por
      // renglón ("-3 bultos" arriba, "-8 uds" abajo) y la tabla las une con " + ".
      const partes = [
        bultos !== 0 ? textoDeBultos(bultos) : null,
        sueltas !== 0 ? `${sueltas} uds` : null,
      ].filter(Boolean);
      return {
        esDesglose: true,
        bultos,
        sueltas,
        partes,
        texto: partes.join(" + "),
      };
    }
  }

  const esFiambre = esFiambreFijoItem(p);
  return {
    esDesglose: false,
    bultos: 0,
    sueltas: 0,
    texto: formatCantidad(p?.stock, p?.unidadMedida, {
      esFiambreFijo: esFiambre,
      esDeposito,
    }),
  };
}

// Los límites en depósito pack se guardan en unidades, pero la tabla de
// escritorio los muestra en bultos. La tarjeta usa esta misma conversión para
// no comparar "4 bultos + 5 uds" contra un mínimo engañoso de "60".
export function formatLimiteStock(valor, p, esDeposito) {
  if (valor === null || valor === undefined) return null;
  // Con sueltos, el límite se escribe como el stock: "2 atados", nunca "40".
  const tres = textoDeStockEnTresNiveles({ ...p, stock: valor }, esDeposito);
  if (tres !== null) return tres;
  if (esPackDeposito(p, esDeposito)) {
    return String(fromUnidades({
      unidades: Number(valor),
      factorPack: p?.factorPack,
    }).bultos);
  }
  return formatCantidad(valor, p?.unidadMedida, {
    esFiambreFijo: esFiambreFijoItem(p),
    esDeposito,
  });
}

// Etiqueta de unidad en vista DEPÓSITO.
export function getUnidadDeposito(p) {
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  if (!u || u === "unidad") return f > 1 ? `Pack x${f}` : "Unidad";
  if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
  if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
  if (u === "kg") {
    // Era otra copia inline del mismo concepto, con el borde combinado por OR y
    // además con `pesoEsFijo` truthy en vez de `=== true`. Delega en la única.
    if (esFiambreFijoItem(p)) return "Pieza";
    return "Kg";
  }
  if (u === "lt") return "Litro";
  return u.charAt(0).toUpperCase() + u.slice(1);
}

// Etiqueta de unidad en vista LOCAL.
export function getUnidadLocal(p) {
  const u = p.unidadMedida;
  if (u === "kg") return "Kg";
  return "Unidad";
}

// Presentación de depósito (para mostrar como subtítulo en vista local).
export function getPresentacionDeposito(p) {
  const u = p.unidadMedida;
  const f = Number(p.factorPack || 1);
  if (f <= 1) return null;
  if (u === "pack") return `Pack x${f}`;
  if (u === "cajon") return `Cajón x${f}`;
  if (u === "unidad") return `Pack x${f}`;
  return null;
}

// Fiambre fijo a partir de un item del listado.
//
// AHORA DELEGA en esFiambreFijo() de lib/conversiones/stock.js, que es la única
// definición. Lo único que hace acá es traducir los nombres: el item del listado
// viene en camelCase (`unidadMedida`) y el predicado espera la forma de
// ProductoBase (`unidad_medida`).
//
// ── QUÉ CAMBIÓ Y A QUIÉN LE CAMBIA ─────────────────────────────────────────
//
// Antes esta función combinaba el borde con OR y la de la lib lo prioriza, así
// que diferían en un caso: modoVentaDeposito="PESO" junto con pesoEsFijo=true.
// Ese producto se MOSTRABA en piezas y se DESCONTABA en kilos — la pantalla
// decía una cosa y el motor hacía otra.
//
// Ahora la pantalla sigue al motor. En erpazul_al eso alcanza a UN producto,
// "Albondigas Caseras x Caja", que pasa a mostrarse en kilos. El dato guardado
// no se toca: lo que se corrige es que la pantalla mentía.
export function esFiambreFijoItem(p) {
  return esFiambreFijo(baseDeItem(p));
}

// La unidad física de la fila del listado en esta ubicación —PIEZA, KG o
// UNIDAD—, con la misma traducción de nombres que `esFiambreFijoItem`. Es la que
// usan los modales de ajuste y de límites para rotular y validar, así que la
// pieza sale del mismo predicado que la tabla y la tarjeta.
export function unidadFisicaDeItem(p, esDeposito) {
  return unidadFisicaDeStock(baseDeItem(p), esDeposito);
}

function baseDeItem(p) {
  return {
    unidad_medida: p.unidadMedida,
    modoCompraProveedor: p.modoCompraProveedor,
    pesoReferenciaKg: p.pesoReferenciaKg,
    modoVentaDeposito: p.modoVentaDeposito,
    pesoEsFijo: p.pesoEsFijo,
  };
}
