// EL TEXTO DE UN PEDIDO, EN SUS DOS VERSIONES, DE UN SOLO ARMADOR.
//
// ── LOS PRECIOS NO VAN AL PROVEEDOR ───────────────────────────────────────
//
// Hasta el 2026-09-19 esto armaba UN texto y llevaba costo unitario, subtotal
// por línea y total estimado — y ese texto era el que se le mandaba al
// proveedor. Eso es decirle con qué número esperás que te facture: si tu costo
// guardado quedó alto, te factura alto y tenías la respuesta escrita en el
// pedido.
//
// Ahora son dos documentos:
//
//   · EL DEL PROVEEDOR — número, fecha, proveedor, depósito y la lista numerada
//     con producto, cantidad y unidad. Nada de dinero. Las notas siguen yendo.
//   · LA PREFACTURA — lo mismo MÁS el costo unitario, el subtotal de cada línea
//     y el total estimado. Es para adentro, para controlar la factura.
//
// ── Y SALEN DEL MISMO ARMADOR, QUE ES LA MITAD DEL ASUNTO ─────────────────
//
// Dos armadores en paralelo no se rompen el día que se escriben: se rompen el
// día que uno cambia. Si mañana el pedido suma el nombre del local que pide y
// solo se agrega en uno, el proveedor recibe un documento y adentro se controla
// contra otro — y la diferencia aparece discutiendo una factura, no acá.
//
// Así que hay UNA función que arma y un booleano que decide si se escribe el
// dinero. Los dos nombres exportados son dos llamadas a esa función.
//
// ── EL DEFAULT DEL BOOLEANO ES `false`, A PROPÓSITO ───────────────────────
//
// Olvidarse de pasarlo tiene que dar el documento SIN precios. Al revés, un
// llamador nuevo que no sabe del parámetro le manda los costos al proveedor y
// nada falla: el texto se copia, se ve bien y dice de más.

import { cantidadParaElProveedor } from "./cantidadParaElProveedor.js";

const FORMATO = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ── POR QUÉ NO USA `lib/moneda.js` ───────────────────────────────────────
//
// Porque la prefactura tiene que salir CARÁCTER POR CARÁCTER como salía antes de
// partir el documento en dos, y ése es el requisito de esta tanda: su contenido
// no cambia. `formatearMoneda` da el mismo formato para un número normal, pero
// no para los bordes —devuelve una raya cuando no hay valor, y acá una línea sin
// costo no escribe el tramo del dinero en vez de escribir una raya—, así que
// cambiarlo sería un cambio de contenido colado de paso.
//
// Queda anotado: cuando la prefactura se rediseñe, ahí se unifica con el
// formateador del kit y se compara el antes contra el después.
function fmtPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return FORMATO.format(v);
}

function fmtFecha(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Los datos de una línea, leídos una sola vez y con los mismos nombres.
 *
 *  `unidadMedida` y `factorPack` salen de la ficha del producto y son lo que
 *  permite escribirle al proveedor la conversión en vez de "40 BULTO". Ya
 *  venían en la respuesta de `/api/compras-proveedor/obtener`: no hubo que
 *  pedir un dato nuevo, solo leerlo. */
function leerLinea(det) {
  return {
    nombre: det?.producto?.base?.nombre || "Sin nombre",
    sku: det?.producto?.base?.sku || null,
    cantidad: Number(det?.cantidad) || 0,
    unidad: det?.unidad || "BULTO",
    costo: Number(det?.precioCosto) || 0,
    unidadMedida: det?.producto?.base?.unidad_medida || null,
    factorPack: Number(det?.producto?.base?.factor_pack) || 0,
  };
}

/**
 * Cuántos renglones tiene el pedido.
 *
 * Es la cuenta que va en el encabezado del modal —"4 productos"— y sale de acá
 * para que ese número y el de la lista no se puedan separar.
 */
export function cantidadDeProductos(pedido) {
  return (pedido?.detalles || []).length;
}

/**
 * El total estimado: la suma de cantidad × costo de las líneas que TIENEN costo.
 *
 * Una línea sin costo cargado no suma cero: no suma. Y si ninguna tiene costo el
 * total es 0, que es lo que hace que la prefactura no escriba el renglón del
 * total en vez de escribir "$0,00" — un pedido sin costos cargados no vale cero,
 * no se sabe cuánto vale.
 *
 * Se exporta porque el modal muestra el mismo número, y dos sumas del mismo
 * dinero escritas en dos lados es como empiezan las que no coinciden.
 */
export function totalEstimadoDelPedido(pedido) {
  let total = 0;
  for (const det of pedido?.detalles || []) {
    const { cantidad, costo } = leerLinea(det);
    if (costo > 0) total += cantidad * costo;
  }
  return total;
}

/**
 * El armador. Uno solo, y `conPrecios` es lo único que separa los dos
 * documentos.
 *
 * @param {object} pedido tal como lo devuelve /api/compras-proveedor/obtener.
 * @param {{ conPrecios?: boolean }} [opciones]
 * @returns {string} texto plano listo para compartir.
 */
function armarTexto(pedido, { conPrecios = false } = {}) {
  if (!pedido) return "";

  const lineas = [];
  const fecha = fmtFecha(pedido.fechaConfirmado || pedido.createdAt);
  const proveedorNombre = pedido.proveedor?.nombre || "—";

  // Los asteriscos son NEGRITA DE WHATSAPP y por eso están: es el medio por el
  // que este texto se manda. No son decoración del título.
  lineas.push(`*Pedido #${pedido.id}* — ${fecha}`);
  lineas.push(`Proveedor: ${proveedorNombre}`);
  if (pedido.deposito?.nombre) {
    lineas.push(`Depósito: ${pedido.deposito.nombre}`);
  }
  lineas.push("");

  (pedido.detalles || []).forEach((det, i) => {
    const { nombre, sku, cantidad, unidad, costo, unidadMedida, factorPack } = leerLinea(det);

    let linea = `${i + 1}. ${nombre}`;
    if (sku) linea += ` (${sku})`;
    // LA CANTIDAD VA CONVERTIDA EN EL DOCUMENTO DEL PROVEEDOR, no en nuestro
    // vocabulario: "40 BULTO" no le dice nada a quien lo recibe, porque no sabe
    // si el bulto trae 12, 24 o 30. Ver `cantidadParaElProveedor`, que es el
    // mismo módulo que usa el PDF.
    //
    // LA PREFACTURA SIGUE EN BULTOS, y es a propósito: es para adentro y se
    // controla contra una factura que viene en bultos, con un costo POR BULTO
    // al lado. Convertirla a unidades obligaría a dividir para comparar cada
    // renglón con el papel, que es el error que esa comparación tiene que
    // atajar. Es el mismo criterio que ya separa los dos documentos.
    linea += conPrecios
      ? `: ${cantidad} ${unidad}`
      : `: ${cantidadParaElProveedor({ cantidad, unidad, unidadMedida, factorPack })}`;

    if (conPrecios && costo > 0) {
      linea += ` × $${fmtPrecio(costo)} = $${fmtPrecio(cantidad * costo)}`;
    }

    lineas.push(linea);
  });

  if (conPrecios) {
    const total = totalEstimadoDelPedido(pedido);
    if (total > 0) {
      lineas.push("");
      lineas.push(`*Total estimado: $${fmtPrecio(total)}*`);
    }
  }

  if (pedido.notas) {
    lineas.push("");
    lineas.push(`Notas: ${pedido.notas}`);
  }

  return lineas.join("\n");
}

/** El texto que se le manda al proveedor. Sin una sola cifra de dinero. */
export function textoParaElProveedor(pedido) {
  return armarTexto(pedido, { conPrecios: false });
}

/** El texto de la prefactura, para adentro. Con costos y total. */
export function textoDeLaPrefactura(pedido) {
  return armarTexto(pedido, { conPrecios: true });
}
