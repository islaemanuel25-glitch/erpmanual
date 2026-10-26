// lib/compras-proveedor/comprobante/filasCorridas.js
//
// ¿EL PAPEL SE LEYÓ CORRIDO UNA FILA? Y SI ES ASÍ, ACOMODARLO.
//
// ── EL CASO (Mauro #298, 2026-10-26) ──────────────────────────────────────
//
// El catálogo de Mauro trae filas en $0 —lo que no se mandó— entre las que sí.
// En el bloque M.CRAFTED el lector salteó los números de la fila en $0 y le
// dejó su NOMBRE a los números de la de abajo, y así cinco filas seguidas:
// «M.CRAFTED 20 BOX CONV» con los 10 u y $40.500 de BOX RED, BOX RED con los de
// CORAL, CORAL con los de UVA, UVA con los de KS RED, KS RED con los de CONV KS
// —cuyo nombre no transcribió—. Medido en `LlamadaLector` 95 y 96: Flash y el
// modelo grande devolvieron lo mismo.
//
// Los importes solo se movieron de lugar, así que la suma cerraba en
// $2.026.100 y la puerta lo dio por bueno. LA SUMA CERRANDO NO PRUEBA QUE LA
// LECTURA ESTÉ BIEN: prueba que no falta ni sobra plata.
//
// ── LO QUE SÍ LO DELATA: EL PEDIDO ────────────────────────────────────────
//
// Con pedido hecho, cada fila del papel dice qué producto es y cuánto vino, y
// el pedido dice cuánto se encargó y a qué precio. Una fila corrida tiene la
// cantidad y el precio de su vecina: no coincide con su producto, y SÍ con el
// de al lado. Eso es lo que se prueba, con la MISMA cuenta que muestra la
// pantalla (`analizarLineas` + `filasDeConciliacion`): ningún criterio nuevo de
// "coincide".
//
//   · Se buscan productos seguidos que no coinciden con la cantidad pedida.
//   · Se prueba correr los números del bloque una fila abajo o arriba. La fila
//     que queda sin números es la que no se mandó; los números que quedan sin
//     nombre van al producto del pedido que nadie reclama y con el que
//     coinciden, si hay UNO solo.
//   · Si así todo el bloque coincide con el pedido en cantidad y en precio, se
//     acomoda. Si no, y correr explica al menos dos filas, se avisa "Puede que
//     el papel se haya leído corrido" y ese bloque no propone costos.
//
// Por qué el aviso pide esa evidencia y no salta con dos diferencias seguidas
// cualquiera: un proveedor que manda de menos dos productos seguidos no es un
// papel corrido, y frenarle los costos sería castigar una recepción que está
// bien leída. Lo que distingue un corrimiento es que los números de una fila
// le calzan a la de al lado.
//
// Módulo puro: sin Prisma, sin React y sin red. Quien llama le pasa cómo se
// analiza una fila y cómo se concilian todas.

import { diferenciaDeCantidad, esFilaDeEnvase } from "../estadoDeLineaFacturada.js";

/**
 * Los números de una fila del papel: lo que se mueve cuando se acomoda. El
 * nombre, el código y el vínculo con el producto se quedan en su fila.
 */
export const NUMEROS_DE_LA_FILA = Object.freeze([
  "cantidad",
  "netoUnitario",
  "subtotalImpreso",
  "subtotalCorregido",
  "costoFinalRenglon",
  "pesoKg",
  "bonificacionPct",
  "descuento",
  "internoUnitario",
  "ivaPct",
  "enQueViene",
]);

/**
 * Lo que alguien decidió sobre los números de una fila. Con otros números esas
 * decisiones ya no valen: se vuelven a tomar.
 */
export const DECISIONES_SOBRE_LOS_NUMEROS = Object.freeze({
  unidadElegida: null,
  revisadoEnRecepcion: false,
  revisadoEnRecepcionPorId: null,
  revisadoEnRecepcionAt: null,
  costoFinalUnitario: null,
  costoPrevioAplicacion: null,
  precioPedidoPrevio: null,
  claseDiferencia: null,
  diferenciaPct: null,
});

/** Hasta cuántas filas seguidas se prueban juntas. */
const VENTANA_MAXIMA = 8;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const numerosDe = (l) => Object.fromEntries(NUMEROS_DE_LA_FILA.map((k) => [k, l?.[k] ?? null]));

/**
 * ¿ESTA FILA COINCIDE CON EL PEDIDO? Cantidad exacta y precio dentro de la
 * variación normal del proveedor, los dos contra la línea del pedido a la que
 * la pantalla la ató.
 */
export function filaCoincideConElPedido(fila, { variacionPct = 10 } = {}) {
  if (fila?.pedidoDetalleId == null || esFilaDeEnvase(fila)) return false;
  if (diferenciaDeCantidad(fila) !== 0) return false;
  const papel = num(fila?.costoFactura);
  const erp = num(fila?.costoCatalogo);
  if (papel === null || erp === null || erp === 0) return false;
  return Math.abs(papel / erp - 1) * 100 <= Number(variacionPct);
}

/** ¿La cantidad no da con la pedida, o el producto no estaba en el pedido? */
function cantidadQueNoDa(fila) {
  if (esFilaDeEnvase(fila)) return false;
  if (fila?.pedidoDetalleId == null) return true;
  const dif = diferenciaDeCantidad(fila);
  return dif !== null && dif !== 0;
}

/**
 * Los números de la ventana corridos una fila. `sentido` +1: los de cada fila
 * bajan a la siguiente; −1: suben a la anterior. La fila que queda sin números
 * —la que no se mandó— pasa a llevar los que quedaron sin nombre, atados al
 * producto del pedido `huerfano`.
 */
export function lineasCorridas(lineas, { desde, hasta, sentido, huerfano }) {
  const nuevas = lineas.map((l) => ({ ...l }));
  const sinNombre = sentido > 0 ? lineas[hasta] : lineas[desde];
  const sinNumeros = sentido > 0 ? desde : hasta;
  for (let k = desde; k <= hasta; k++) {
    if (k === sinNumeros) continue;
    nuevas[k] = { ...lineas[k], ...numerosDe(lineas[k - sentido]), ...DECISIONES_SOBRE_LOS_NUMEROS };
  }
  nuevas[sinNumeros] = {
    ...lineas[sinNumeros],
    ...numerosDe(sinNombre),
    ...DECISIONES_SOBRE_LOS_NUMEROS,
    // El nombre que el lector no transcribió: el del producto del pedido con el
    // que coinciden esos números, que es el único que nadie más reclama.
    textoCrudo: huerfano.nombre,
    codigoProveedor: null,
    productoLocalId: huerfano.productoLocalId,
    pedidoDetalleId: huerfano.id,
  };
  return { lineas: nuevas, sinNumeros, textoQueSeFue: lineas[sinNumeros]?.textoCrudo ?? null };
}

/**
 * ¿EL PAPEL SE LEYÓ CORRIDO? Y SI ES ASÍ, ¿CÓMO SE ACOMODA?
 *
 * @param lineas          las del comprobante, en orden, con la forma de `ComprobanteLinea`
 * @param filasDe         (lineas) → las filas de conciliación de esas líneas, en el mismo orden
 * @param lineasDelPedido las del pedido, como las arma `aplanarDetalles`
 * @param variacionPct    la variación normal del proveedor
 * @returns `{ acomodo, sospechosas }`:
 *   · `acomodo`: `{ desde, hasta, sentido, lineas, sinNumeros, textoQueSeFue,
 *     huerfano }` con las líneas ya acomodadas, o null;
 *   · `sospechosas`: los `id` de las líneas del bloque que puede estar corrido
 *     y no se pudo acomodar. Vacío si no hay nada que avisar.
 */
export function revisarCorrimiento({ lineas = [], filasDe, lineasDelPedido = [], variacionPct = 10 } = {}) {
  const nada = { acomodo: null, sospechosas: [] };
  const n = lineas.length;
  if (n < 2 || typeof filasDe !== "function") return nada;

  const coincide = (f) => filaCoincideConElPedido(f, { variacionPct });
  const filas = filasDe(lineas);
  const noDa = filas.map(cantidadQueNoDa);
  const hayDosSeguidas = noDa.some((x, i) => x && noDa[i + 1]);
  if (!hayDosSeguidas) return nada;
  const buenasAntes = filas.filter(coincide).length;

  const reclamados = (sinNumeros) =>
    new Set(filas.filter((f, i) => i !== sinNumeros && f.pedidoDetalleId != null).map((f) => f.pedidoDetalleId));

  const aceptados = [];
  // Para el aviso: ¿correr explica filas aunque no alcance para acomodar?
  const explicadasPorCorrer = new Set();

  for (let desde = 0; desde < n; desde++) {
    for (let hasta = desde + 1; hasta < Math.min(n, desde + VENTANA_MAXIMA); hasta++) {
      if (!noDa.slice(desde, hasta + 1).some(Boolean)) continue;
      for (const sentido of [1, -1]) {
        const sinNumeros = sentido > 0 ? desde : hasta;
        const libres = lineasDelPedido.filter((d) => !reclamados(sinNumeros).has(d.id));
        // Las filas que coinciden con los números de la vecina, sin mirar todavía
        // a dónde van los que quedan sin nombre.
        const parcial = lineasCorridas(lineas, { desde, hasta, sentido, huerfano: { id: null, nombre: null } });
        const filasParciales = filasDe(parcial.lineas);
        for (let k = desde; k <= hasta; k++) {
          if (k !== sinNumeros && coincide(filasParciales[k]) && !coincide(filas[k])) explicadasPorCorrer.add(k);
        }
        const enLaVentana = (fs) => fs.slice(desde, hasta + 1).every((f, i) => desde + i === sinNumeros || coincide(f));
        if (!enLaVentana(filasParciales)) continue;

        const quienes = [];
        for (const huerfano of libres) {
          const prueba = lineasCorridas(lineas, { desde, hasta, sentido, huerfano });
          const fs = filasDe(prueba.lineas);
          if (!coincide(fs[sinNumeros]) || !enLaVentana(fs)) continue;
          quienes.push({ ...prueba, huerfano, buenas: fs.filter(coincide).length });
        }
        // Dos productos del pedido que explican igual los números sin nombre no
        // se adivinan.
        if (quienes.length === 1 && quienes[0].buenas > buenasAntes + 1) {
          aceptados.push({ desde, hasta, sentido, ...quienes[0] });
        }
      }
    }
  }

  if (aceptados.length) {
    const mejor = Math.max(...aceptados.map((a) => a.buenas));
    const empatados = aceptados
      .filter((a) => a.buenas === mejor)
      .sort((a, b) => a.hasta - a.desde - (b.hasta - b.desde));
    const masChica = empatados[0].hasta - empatados[0].desde;
    const iguales = empatados.filter((a) => a.hasta - a.desde === masChica);
    if (iguales.length === 1) {
      const { buenas, ...acomodo } = iguales[0];
      return { acomodo, sospechosas: [] };
    }
  }

  // Sin acomodo posible: se avisa solo si correr explica al menos dos filas,
  // que es lo que separa un papel corrido de un proveedor que mandó de menos.
  if (explicadasPorCorrer.size < 2) return nada;
  const desde = Math.max(0, Math.min(...explicadasPorCorrer) - 1);
  const hasta = Math.min(n - 1, Math.max(...explicadasPorCorrer) + 1);
  const sospechosas = [];
  for (let k = desde; k <= hasta; k++) if (noDa[k] || explicadasPorCorrer.has(k)) sospechosas.push(lineas[k].id);
  return { acomodo: null, sospechosas };
}
