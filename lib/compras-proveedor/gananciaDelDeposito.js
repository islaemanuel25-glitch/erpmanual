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
// ── EL FIAMBRE QUEDA AFUERA, Y SE DICE ────────────────────────────────────
//
// `subtotalLinea` —la fórmula económica única del módulo— valoriza el fiambre
// por KILO, y los kilos no están en el papel: se cuentan al recibir, pesando.
// Multiplicar piezas por un costo por kilo daría un número inventado, así que
// esas líneas no entran y el pie lo informa en vez de esconderlas.
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

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Por qué una línea no entra en la cuenta. `null` = entra. */
export function motivoFueraDeLaCuenta(fila) {
  if (fila?.esFiambre === true) return "FIAMBRE";
  if (!sePuedeCompararElPrecio(fila)) return "SIN_PRECIO_INTERNO";
  if (num(cantidadEnEscalaDelPedido(fila)) === null) return "SIN_CANTIDAD";
  return null;
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
  const lista = Array.isArray(filas) ? filas : [];
  const r = {
    facturado: 0,
    interno: 0,
    ganancia: 0,
    porcentaje: null,
    total: lista.length,
    enLaCuenta: 0,
    afuera: 0,
    sinPrecioInterno: 0,
    fiambre: 0,
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
      if (motivo === "FIAMBRE") r.fiambre += 1;
      else r.sinPrecioInterno += 1;
      continue;
    }
    const cantidad = num(cantidadEnEscalaDelPedido(fila));
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
  if (r.fiambre > 0) partes.push(`${r.fiambre} de fiambre, que se valoriza al pesarlo`);
  return partes.join(" · ");
}
