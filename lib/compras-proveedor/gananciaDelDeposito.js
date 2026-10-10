// LA GANANCIA DEL DEPÓSITO SOBRE UNA FACTURA.
//
// ── LA REGLA DE NEGOCIO ───────────────────────────────────────────────────
//
// El precio que factura el proveedor y el precio interno del ERP son dos cosas
// distintas, y LA DIFERENCIA ENTRE LOS DOS ES LA GANANCIA DEL DEPÓSITO: es el
// margen con el que el depósito le vende a los locales. Hasta acá la pantalla
// mostraba el total de la factura y nada más, así que saber cuánto se gana en
// una compra pedía hacer la cuenta a mano, renglón por renglón.
//
// ── HAY DOS SUMAS DE LÍNEAS PARECIDAS, Y NO SON LA MISMA ──────────────────
//
// Se van a confundir, así que quedan escritas juntas:
//
//   1. LA QUE ESTÁ PROHIBIDA — sumar las líneas para VERIFICAR LA LECTURA
//      contra el total impreso del papel. Vive en `verificarComprobante`
//      (`comprobante/impuestos.js`) y ahí la suma se compara contra un número
//      que el papel trae impreso. Cuando ese total NO viene impreso y alguien
//      lo rellena con la suma de las líneas, la verificación compara la cuenta
//      contra sí misma: cierra siempre, con cero de diferencia, y el
//      comprobante queda habilitado para escribir costos. Ese agujero está
//      documentado en CLAUDE.md y no se toca.
//
//   2. LA DE ACÁ — sumar las líneas para saber CUÁNTO SE PAGA y CUÁNTO SE
//      GANA. No verifica nada, no se compara contra el papel y no habilita
//      ninguna escritura: es aritmética sobre las líneas que ya se leyeron.
//      Que el papel de Mauro no traiga total impreso no impide esta cuenta.
//
// La diferencia en una línea: la primera pregunta "¿la lectura es fiel?" y se
// contesta contra el papel; la segunda pregunta "¿cuánto gano?" y se contesta
// contra el precio interno.
//
// ── EL PRECIO INTERNO ES EL MISMO QUE COMPARA LA HOJA, POR REUSO ──────────
//
// No se elige acá qué línea tiene los dos precios: se pregunta con
// `sePuedeCompararElPrecio`, la misma función que decide si la hoja muestra las
// dos opciones o el aviso. Si mañana ese criterio cambia, este total cambia con
// él. Escrito al lado —"tiene costoFactura y costoCatalogo"— serían dos
// criterios, y el día que uno se mueva el pie diría un número que ninguna línea
// respalda.
//
// Y por eso una línea con el precio ya aceptado aporta CERO a la ganancia: al
// aceptar, el interno pasó a ser el de la factura y los dos números son el
// mismo. No hay nada especial que programar para ese caso — sale solo de usar
// los mismos dos precios que muestra la hoja.
//
// ── SOLO QUEDA AFUERA EL QUE TODAVÍA NO SE PESÓ ──────────────────────────
//
// Un producto que se mide en KILOS se valoriza por kilo, y multiplicar piezas
// por un costo por kilo daría un número inventado. Pero eso no quiere decir que
// los kilos falten: **el papel puede traerlos impresos**, y en el de Paty vienen
// en tres de los cuatro —el salame bastón, el salame picado fino y el queso
// danbo—. Esos tres se valorizan con los kilos del papel y entran en la cuenta
// como cualquier otro.
//
// El único que queda afuera es aquel cuyo papel NO trae los kilos: ahí se pesan
// al recibir y recién entonces hay número. Antes quedaban afuera los cuatro,
// porque el criterio miraba si el producto ERA fiambre en vez de mirar si los
// kilos ESTABAN — y la pantalla del #242 decía "4 de fiambre" sobre un papel
// que traía tres de esos cuatro pesados y escritos.
//
// Módulo puro: sin React y sin Prisma.

import {
  cantidadEnEscalaDelPedido,
  sePuedeCompararElPrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
// El mismo criterio de "cuántos productos hay acá" que usa la pantalla del
// pedido recibido. Escribir otro al lado sería tener dos, que es el defecto que
// este módulo ya pagó cuatro veces.
import { cuantosProductos } from "@/lib/compras-proveedor/loQueEntro";
import { unidadesFisicasDe } from "@/lib/transferencias/recepcion";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Por qué una línea no entra en la cuenta. `null` = entra. */
export function motivoFueraDeLaCuenta(fila) {
  // NO "es fiambre": "le faltan los kilos". Lo decide `netoQueFacturaElProveedor`
  // mirando el producto y el papel, y viaja en la fila — acá no se vuelve a
  // deducir, que es cómo aparecen dos criterios para la misma pregunta.
  if (fila?.faltanKilos === true) return "SIN_KILOS";
  if (!sePuedeCompararElPrecio(fila)) return "SIN_PRECIO_INTERNO";
  if (num(cantidadEnEscalaDelPedido(fila)) === null) return "SIN_CANTIDAD";
  return null;
}

/**
 * CON CUÁNTO SE VALORIZA UN RENGLÓN.
 *
 * Por kilo, los kilos del papel. Por pieza, la cantidad en la escala del
 * pedido, que es la de siempre. Es el mismo criterio que decide el precio —la
 * unidad la manda el producto— y por eso los dos números del pie salen en la
 * misma escala que los dos precios de la fila.
 */
export function cuantoSeValoriza(fila) {
  if (fila?.porKilo === true) {
    // ── LO QUE ENTRÓ MANDA SOBRE LO QUE DIJO EL PAPEL ──────────────────
    //
    // En un pedido ya cerrado, los kilos que entraron al stock son los que
    // alguien pesó; el papel es lo que el proveedor declaró. Mientras no se
    // cerró son el mismo número, así que esto no cambia la recepción.
    const pesados = num(fila?.kgRecibidos);
    if (pesados !== null && pesados > 0) return pesados;
    const kilos = num(fila?.peso);
    if (kilos !== null && kilos > 0) return kilos;
  }

  // ── Y EN LA ESCALA DEL COSTO CONTRA EL QUE SE MULTIPLICA ─────────────
  //
  // `costoCatalogo` viene en la unidad del DEPÓSITO —lo convierte
  // `costoDelCatalogoEnLaUnidadDelDeposito` antes de armar la fila— y
  // `cantidadRecibida` está en la escala de la LÍNEA DEL PEDIDO, que es la
  // misma. Multiplicarlo por la cantidad del papel compara dos escalas.
  //
  // El caso, medido sobre el pedido 242 ya recibido: la Hamburguesa Paty tiene
  // la línea del pedido en escala UNIDAD con 90 y su costo del catálogo es el
  // del BULTO de 30 —$61.703—. Valorizar 90 × 61.703 daba **$5.553.270** de un
  // renglón que vale $185.109, y por eso la pantalla del pedido recibido decía
  // "A tus precios vale $6.247.322" donde la recepción había dicho $879.161.
  //
  // Con lo recibido: 3 × $61.703 = $185.109. La suma de los once renglones da
  // $879.161, que es exactamente lo que mostró la recepción antes de cerrar.
  const recibida = num(fila?.cantidadRecibida);

  // ── Y LAS SUELTAS SON PARTE DE LO RECIBIDO ───────────────────────────
  //
  // Solo existen cuando la hoja contó en bultos —`vaPorPack`—, así que
  // `cantidadRecibida` está en bultos y el costo es el de un bulto: una suelta
  // vale 1/factor de bulto. Sin esto, 2 bultos + 3 sueltas se valorizaban como
  // 2 bultos, y 0 bultos + 3 sueltas caía a la cantidad del PAPEL. La cuenta
  // física es `unidadesFisicasDe`, la misma que mueve el stock.
  const sueltas = num(fila?.unidadesSueltas);
  const factor = num(fila?.factorPack);
  if (sueltas !== null && sueltas > 0 && factor !== null && factor > 1) {
    const fisicas = unidadesFisicasDe({
      cantidad: recibida ?? 0,
      sueltas,
      unidad: "BULTO",
      factorPack: factor,
    });
    if (fisicas !== null) return fisicas / factor;
  }

  if (recibida !== null && recibida > 0) return recibida;
  return cantidadEnEscalaDelPedido(fila);
}

/**
 * Los tres números del pie, y cuántas líneas los respaldan.
 *
 * `facturado` e `interno` se valorizan con LA MISMA CANTIDAD —la de la factura,
 * en la escala del pedido— y con los dos precios que la hoja compara. Que sea
 * la misma cantidad de los dos lados es lo que hace que la resta sea una
 * ganancia y no una diferencia de escalas.
 */
export function gananciaDelDeposito(filas = []) {
  // Los envases a precio simbólico no son mercadería: ni se ganan ni quedan
  // "afuera de la cuenta" por falta de precio. Ver `comprobante/envase.js`.
  const lista = (Array.isArray(filas) ? filas : []).filter((f) => f?.envase !== true);
  const r = {
    facturado: 0,
    interno: 0,
    ganancia: 0,
    porcentaje: null,
    total: lista.length,
    enLaCuenta: 0,
    afuera: 0,
    sinPrecioInterno: 0,
    sinKilos: 0,
  };

  // ── LA PLATA SE SUMA POR RENGLÓN; EL TEXTO CUENTA PRODUCTOS ────────────
  //
  // Son dos preguntas distintas y las dos tienen que ser verdad. Un producto
  // que viene en dos renglones aporta DOS veces a la plata —son dos partidas
  // facturadas— y es UN producto cuando se lo nombra en pantalla. Por eso los
  // contadores de renglones se conservan y al lado se guardan los de producto,
  // con el mismo criterio que usa la pantalla del pedido recibido.
  const dentro = [];

  for (const fila of lista) {
    const motivo = motivoFueraDeLaCuenta(fila);
    if (motivo) {
      r.afuera += 1;
      if (motivo === "SIN_KILOS") r.sinKilos += 1;
      else r.sinPrecioInterno += 1;
      continue;
    }
    // ── CON CUÁNTO SE VALORIZA: LO DICE LA UNIDAD DEL PRODUCTO ──────────
    //
    // Un producto por kilo se valoriza con LOS KILOS DEL PAPEL, no con las
    // piezas. Los dos precios de la fila ya están por kilo —`costoFactura` es
    // el subtotal dividido por los kilos, y `costoCatalogo` es el costo por
    // kilo del catálogo— así que el multiplicador tiene que ser el mismo, o la
    // resta compara dos escalas y deja de ser una ganancia.
    //
    // Y sale redondo: kilos × (subtotal ÷ kilos) es exactamente el subtotal del
    // papel. Por eso la Factura del pie da la suma de los subtotales impresos.
    const cantidad = num(cuantoSeValoriza(fila));
    r.enLaCuenta += 1;
    dentro.push(fila);
    r.facturado += cantidad * num(fila.costoFactura);
    r.interno += cantidad * num(fila.costoCatalogo);
  }

  r.productos = cuantosProductos(lista);
  r.productosEnLaCuenta = cuantosProductos(dentro);

  r.ganancia = r.interno - r.facturado;
  // ── EL PORCENTAJE VA SOBRE EL INTERNO, COMO EL DE CADA LÍNEA ───────────
  //
  // La tarjeta de una línea dice "bajó 15,0 %" y ese porcentaje se calcula
  // sobre el precio interno —`porcentajeDelPrecio`—. Si el pie usara la factura
  // como base, una factura de una sola línea mostraría 15,0 arriba y 17,6 abajo
  // sobre el mismo renglón, y no hay forma de que quien mira sepa cuál creer.
  r.porcentaje = r.interno === 0 ? null : (r.ganancia / r.interno) * 100;
  return r;
}

/** Cuántos productos respaldan el número, en un renglón y sin adornos. */
export function textoDeLaCuenta(r) {
  if (!r || r.total === 0) return "Sin productos leídos.";
  // Los dos números son de PRODUCTO y no de renglón, porque la palabra que
  // llevan al lado es "productos". Decir 15 sobre 14 distintos sería falso, y
  // es el defecto que ya apareció en la tarjeta del papel.
  if (r.enLaCuenta === 0) return `Ninguno de los ${r.productos} productos tiene los dos precios.`;
  const partes = [`${r.productosEnLaCuenta} de ${r.productos} productos en la cuenta`];
  if (r.sinPrecioInterno > 0) partes.push(`${r.sinPrecioInterno} sin precio interno`);
  if (r.sinKilos > 0)
    partes.push(
      `${r.sinKilos} ${r.sinKilos === 1 ? "espera" : "esperan"} que lo peses: el papel no trae los kilos`
    );
  return partes.join(" · ");
}
