// lib/productos/presentaciones.js
//
// EN QUÉ PRESENTACIÓN SE VENDE Y EN CUÁL SE COMPRA CADA PRODUCTO. Clasificación
// pura: recibe una fila ya resuelta —base + ProductoLocal mergeados— y contesta
// dos cosas independientes. No consulta Prisma, no depende de Next.
//
// ── UNA SOLA FUNCIÓN PARA CONTAR Y PARA FILTRAR ────────────────────────────
//
// Es la misma decisión que ya tomó `controlesCalidad.js` y por el mismo motivo:
// la card dice un número y el listado que esa card abre tiene que traer
// exactamente esa población. Con dos predicados escritos al lado, el día que uno
// cambie la pantalla dice "47" sobre una lista de 45 y nadie se entera hasta que
// alguien los cuenta a mano.
//
// Por eso acá vive la clasificación y de acá cuelgan los dos:
// `/api/productos/controles` cuenta y `/api/productos/listar` filtra, con esta
// misma función.
//
// ── LA VENTA NO SE REIMPLEMENTA: SALE DE `escalaDeVentaDe` ─────────────────
//
// `lib/precios/escalaDeVenta.js` ya contesta en qué escala se vende un producto,
// y su respuesta es la del POS —`modoSalidaDeVenta` es `calcularModoSalida`,
// movida tal cual desde `buscar-producto`—. Escribir acá una clasificación
// "parecida" habría sido inventar una segunda verdad sobre lo que se cobra en el
// mostrador.
//
// Lo único que este módulo agrega sobre esa respuesta es el NOMBRE OPERATIVO:
//
//   ESCALA_BULTO  → Pack     (pack y cajón son la misma categoría operativa)
//   ESCALA_UNIDAD → Unidad
//   ESCALA_KG     → Kg
//   ESCALA_PIEZA  → Pieza
//   ESCALA_IMPORTE → nada: el servicio no tiene presentación física
//
// "Pack" agrupa pack y cajón a propósito: el que mira estas cards quiere saber
// cuántos productos salen del mostrador en un envoltorio cerrado, y para esa
// pregunta un cajón y un pack son lo mismo. La distinción sigue existiendo en
// `unidad_medida`, que es donde importa.
//
// ── Y LA UBICACIÓN MANDA, QUE ES LO QUE HACE ÚTIL A ESTA PANTALLA ──────────
//
// Un fiambre de pieza fija se vende POR PIEZA en el depósito y POR KILO en un
// local: no es una propiedad del producto sino de dónde está parado el que
// pregunta. Por eso `presentacionDeVenta` recibe `esDeposito` y no lo adivina, y
// por eso clasificar leyendo solo `unidad_medida` —o solo `modo_envio`— daría
// una respuesta que el POS contradice.
//
// ── LA COMPRA ES OTRA PREGUNTA, Y NO SE MIRA `modo_pedido` ─────────────────
//
// `modo_pedido` gobierna cómo un LOCAL le pide al DEPÓSITO: es logística
// interna. Estas cards preguntan cómo se le compra AL PROVEEDOR, que es lo que
// gobiernan `unidad_medida` y `modoCompraProveedor`.
//
// La regla efectiva, leída del formulario que la escribe
// —`components/productos/FormProducto.jsx:1507-1519`—:
//
//   unidad_medida = unidad            → Compra por unidad
//   unidad_medida = pack | cajon      → Compra por pack
//   unidad_medida = kg + BULTO        → Compra por kg
//   unidad_medida = kg + UNIDAD       → Compra por pieza
//
// El enum se llama `ModoPedido` y sus valores son BULTO y UNIDAD, pero el
// formulario los presenta como "Por kg" y "Por pieza / barra", y solo los ofrece
// cuando el tipo de venta es Kg (`FormProducto.jsx:485`). Manda la regla
// efectiva y no el nombre aislado del enum: comprar "por pieza" significa que se
// ingresa una cantidad de piezas y hay un peso de referencia que las relaciona
// con kilos, que es otra cosa que comprar directamente por kg.
//
// ── QUIÉNES QUEDAN AFUERA, Y POR QUÉ NO ES LO MISMO EN LOS DOS GRUPOS ──────
//
// · Servicio de importe variable: afuera de las OCHO. No tiene presentación
//   física ni de venta ni de compra — el importe lo escribe el cajero.
//
// · Combo: se VENDE por unidad —es lo que ya contesta el POS, que lo mapea con
//   `unidadMedida: "unidad"` y `modoSalidaDefault: "UNIDAD"` en
//   `buscar-producto/route.js:497-500`— y NO se COMPRA: no se le compra un combo
//   a un proveedor, se arma con componentes que sí se compran. Contarlo en una
//   card de compra sumaría una unidad que ninguna factura va a traer.
//
// O sea que un combo suma en Venta y no suma en Compra, y eso es deliberado: las
// dos páginas del carrusel contestan preguntas distintas y no tienen por qué dar
// el mismo total.

import {
  escalaDeVentaDe,
  ESCALA_BULTO,
  ESCALA_UNIDAD,
  ESCALA_KG,
  ESCALA_PIEZA,
} from "@/lib/precios/escalaDeVenta";
import { esProductoServicio } from "@/lib/pos-ventas/servicios";

/** Los dos grupos. Dentro de cada uno solo puede haber una modalidad activa. */
export const GRUPO = {
  VENTA: "venta",
  COMPRA: "compra",
};

/**
 * Los identificadores. Viajan en la URL, así que son estables y llevan el grupo
 * adelante: de un id suelto se puede deducir a qué grupo pertenece sin tabla.
 */
export const PRESENTACION = {
  VENTA_PACK: "venta-pack",
  VENTA_UNIDAD: "venta-unidad",
  VENTA_KG: "venta-kg",
  VENTA_PIEZA: "venta-pieza",
  COMPRA_PACK: "compra-pack",
  COMPRA_UNIDAD: "compra-unidad",
  COMPRA_KG: "compra-kg",
  COMPRA_PIEZA: "compra-pieza",
};

/**
 * ── EL CATÁLOGO DE CARDS ───────────────────────────────────────────────────
 *
 * El orden importa y no es decorativo: el carrusel pagina de a cuatro en este
 * mismo orden, así que las cuatro de venta caen en la primera página y las
 * cuatro de compra en la segunda. Reordenar este array reordena la pantalla.
 *
 * `titulo` y `detalle` se leen juntos y tienen que ser inequívocos —"Venta" /
 * "por pack"—: una card que dijera solo "Pack" no distinguiría la página de
 * venta de la de compra en cuanto alguien deslice.
 *
 * NO HAY `detalleSano` NI `rol`, Y ESO ES LA DIFERENCIA CON "PARA REVISAR".
 * Aquellas cards son alertas: cuentan trabajo pendiente, y un cero es una buena
 * noticia que merece un tilde verde. Éstas CLASIFICAN: cero productos vendidos
 * por kg no es un logro ni un problema, es un dato. Pintarlo de verde con un
 * tilde afirmaría algo que nadie dijo.
 */
export const PRESENTACIONES = [
  { id: PRESENTACION.VENTA_PACK, grupo: GRUPO.VENTA, titulo: "Venta", detalle: "por pack" },
  { id: PRESENTACION.VENTA_UNIDAD, grupo: GRUPO.VENTA, titulo: "Venta", detalle: "por unidad" },
  { id: PRESENTACION.VENTA_KG, grupo: GRUPO.VENTA, titulo: "Venta", detalle: "por kg" },
  { id: PRESENTACION.VENTA_PIEZA, grupo: GRUPO.VENTA, titulo: "Venta", detalle: "por pieza" },
  { id: PRESENTACION.COMPRA_PACK, grupo: GRUPO.COMPRA, titulo: "Compra", detalle: "por pack" },
  { id: PRESENTACION.COMPRA_UNIDAD, grupo: GRUPO.COMPRA, titulo: "Compra", detalle: "por unidad" },
  { id: PRESENTACION.COMPRA_KG, grupo: GRUPO.COMPRA, titulo: "Compra", detalle: "por kg" },
  { id: PRESENTACION.COMPRA_PIEZA, grupo: GRUPO.COMPRA, titulo: "Compra", detalle: "por pieza" },
];

/** Los ids válidos, para validar lo que llegue por la URL. */
export const IDS_PRESENTACION = PRESENTACIONES.map((p) => p.id);

/** Los de cada grupo, en el orden del catálogo. */
export const IDS_VENTA = PRESENTACIONES.filter((p) => p.grupo === GRUPO.VENTA).map((p) => p.id);
export const IDS_COMPRA = PRESENTACIONES.filter((p) => p.grupo === GRUPO.COMPRA).map((p) => p.id);

/** ¿Este id existe? Un id inventado en la URL no puede filtrar nada. */
export const esPresentacionValida = (id) => IDS_PRESENTACION.includes(id);

/** A qué grupo pertenece un id. `null` si no es válido. */
export function grupoDePresentacion(id) {
  return PRESENTACIONES.find((p) => p.id === id)?.grupo ?? null;
}

/** ¿Es un id del grupo de venta? Valida antes de responder. */
export const esPresentacionDeVenta = (id) => grupoDePresentacion(id) === GRUPO.VENTA;

/** ¿Es un id del grupo de compra? */
export const esPresentacionDeCompra = (id) => grupoDePresentacion(id) === GRUPO.COMPRA;

/**
 * ¿Este producto es un combo?
 *
 * Se pregunta por el campo del schema y no por un flag derivado. La fila puede
 * venir en dos formas —la cruda de Prisma o la ya mergeada— y las dos lo llevan
 * con el mismo nombre.
 */
function esCombo(p) {
  return p?.es_combo === true || p?.esCombo === true;
}

/** El mapa de la escala de venta a la categoría operativa de estas cards. */
const PRESENTACION_POR_ESCALA = {
  [ESCALA_BULTO]: PRESENTACION.VENTA_PACK,
  [ESCALA_UNIDAD]: PRESENTACION.VENTA_UNIDAD,
  [ESCALA_KG]: PRESENTACION.VENTA_KG,
  [ESCALA_PIEZA]: PRESENTACION.VENTA_PIEZA,
};

/**
 * EN QUÉ PRESENTACIÓN SE VENDE, en la ubicación activa.
 *
 * @param {object} p            fila resuelta: base + ProductoLocal ya mergeados
 * @param {boolean} esDeposito  si la UBICACIÓN activa es el depósito
 * @returns {string|null} un id de `PRESENTACION.VENTA_*`, o `null` si no aplica
 */
export function presentacionDeVenta(p = {}, esDeposito = false) {
  // El servicio no tiene presentación física. `escalaDeVentaDe` ya lo contesta
  // con ESCALA_IMPORTE, que no está en el mapa — pero se pregunta antes igual,
  // para que la exclusión esté escrita y no dependa de que una tabla no tenga
  // una clave.
  if (esProductoServicio(p)) return null;

  // EL COMBO SE VENDE POR UNIDAD, Y NO SE DEDUCE DE SUS COLUMNAS. Un combo es un
  // `ProductoBase` con su propia `unidad_medida`, que el POS IGNORA: lo mapea con
  // `unidadMedida: "unidad"` y `modoSalidaDefault: "UNIDAD"`. Pasarle la fila
  // cruda a `escalaDeVentaDe` contestaría según esa columna y podría decir "por
  // pack" sobre algo que en el mostrador sale de a uno.
  if (esCombo(p)) return PRESENTACION.VENTA_UNIDAD;

  return PRESENTACION_POR_ESCALA[escalaDeVentaDe(p, esDeposito)] ?? null;
}

/**
 * EN QUÉ PRESENTACIÓN SE COMPRA AL PROVEEDOR.
 *
 * No recibe `esDeposito`: comprarle a un proveedor es una propiedad de la ficha
 * del producto y no de dónde esté parado el que mira. La ubicación cambia dónde
 * se ve el producto —eso lo resuelve el universo, no esta función— pero no
 * cambia en qué presentación entra.
 *
 * @param {object} p  fila resuelta: base + ProductoLocal ya mergeados
 * @returns {string|null} un id de `PRESENTACION.COMPRA_*`, o `null` si no aplica
 */
export function presentacionDeCompra(p = {}) {
  // Los dos que no se compran como producto físico. Ver el encabezado.
  if (esProductoServicio(p)) return null;
  if (esCombo(p)) return null;

  const unidad = String(p?.unidadMedida ?? p?.unidad_medida ?? "").toLowerCase();

  if (unidad === "unidad") return PRESENTACION.COMPRA_UNIDAD;
  if (unidad === "pack" || unidad === "cajon") return PRESENTACION.COMPRA_PACK;

  if (unidad === "kg") {
    // El default de la columna es BULTO —`modoCompraProveedor ModoPedido
    // @default(BULTO)`—, así que una fila sin el campo se lee como "por kg", que
    // es lo mismo que muestra el formulario al abrir un producto de kg sin tocar
    // nada. Solo UNIDAD saca de ahí.
    return String(p?.modoCompraProveedor ?? "").toUpperCase() === "UNIDAD"
      ? PRESENTACION.COMPRA_PIEZA
      : PRESENTACION.COMPRA_KG;
  }

  // Una unidad de medida que el enum no tenga no se clasifica. Devolver una
  // categoría por defecto metería el producto en una card que no le corresponde,
  // y ahí el total de la card dejaría de ser el de la lista que abre.
  return null;
}

/**
 * ¿Este producto está marcado por esta presentación?
 *
 * LA función. El contador la usa para sumar y el listado para filtrar, así que
 * los dos números no pueden separarse.
 *
 * @param {string} id           uno de PRESENTACION.*
 * @param {object} p            fila resuelta
 * @param {boolean} esDeposito  si la ubicación activa es el depósito
 */
export function marcadoPorPresentacion(id, p, esDeposito = false) {
  const grupo = grupoDePresentacion(id);
  // Un id desconocido no marca nada. Devolver `true` haría que una URL con
  // basura mostrara el catálogo entero como si fuera una categoría.
  if (grupo === GRUPO.VENTA) return presentacionDeVenta(p, esDeposito) === id;
  if (grupo === GRUPO.COMPRA) return presentacionDeCompra(p) === id;
  return false;
}

/**
 * Cuenta cuántos productos caen en cada presentación, en una sola pasada.
 *
 * Devuelve SIEMPRE las ocho claves, incluso en cero: una card que falte haría
 * que la pantalla no pudiera distinguir "ninguno" de "todavía no se calculó", y
 * el carrusel dejaría de tener dos páginas parejas.
 *
 * Se clasifica cada fila UNA vez por grupo y no una vez por card: preguntar las
 * ocho por producto multiplicaría por cuatro el trabajo para contestar lo mismo.
 */
export function contarPresentaciones(productos = [], esDeposito = false) {
  const conteo = Object.fromEntries(IDS_PRESENTACION.map((id) => [id, 0]));
  for (const p of productos) {
    const venta = presentacionDeVenta(p, esDeposito);
    if (venta !== null) conteo[venta] += 1;
    const compra = presentacionDeCompra(p);
    if (compra !== null) conteo[compra] += 1;
  }
  return conteo;
}
