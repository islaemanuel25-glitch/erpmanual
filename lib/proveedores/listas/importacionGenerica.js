// lib/proveedores/listas/importacionGenerica.js
//
// DE LA TABLA DE UN ARCHIVO CUALQUIERA A LAS FILAS QUE EL MOTOR YA SABE CONCILIAR.
//
// ── LO QUE ESTE MÓDULO AGREGA, Y LO QUE NO ──────────────────────────────────
//
// Agrega UNA cosa que el motor de siempre no tiene: decidir QUÉ COLUMNA del
// archivo es el precio, y si ese precio lleva aplicado el descuento del renglón.
// Arcor no necesita esa decisión porque su archivo tiene una sola columna de
// precio con nombre conocido; un archivo cualquiera trae hasta seis.
//
// No agrega nada más. El vínculo con el catálogo lo resuelve
// `vincularFilaConCatalogo`, que es la misma función que usa `conciliarFila`; el
// costo de cada fila lo resuelve `costoDeLaFila`, que es el mismo de siempre; y
// las filas que salen de acá entran a `conciliarLista` como si las hubiera
// parseado el lector de Arcor.
//
// ── POR QUÉ LA COLUMNA SE DECIDE ACÁ Y NO ADENTRO DE `conciliarLista` ───────
//
// Porque es una decisión DE LA LISTA y `conciliarLista` trabaja fila por fila.
// Una fila sola no puede decir cuál de las seis columnas es el precio: siempre
// hay una que le queda linda a su costo viejo. Lo que lo decide es que la misma
// columna le quede bien a las novecientas.
//
// Módulo puro: sin BD, sin Next. Recibe la tabla y el catálogo ya cargados.

import {
  indexarCodigosProveedor,
  indexarCodigosBarra,
  vincularFilaConCatalogo,
  baseParaHelpers,
} from "./conciliarLista.js";
import { decidirLista, MOTIVO_LISTA, TEXTO_MOTIVO_LISTA } from "./decisionDeLista.js";
import { clavesDeCodigo } from "./normalizarCodigo.js";
import { requiereConversionABulto, factorValido } from "./calculoCosto.js";
import {
  numeroDeLista,
  descuentoDeLista,
  cantidadDeLista,
  cantidadEnNombre,
} from "./lectura/numeroDeLista.js";

/**
 * Las filas del archivo, con el mapa de columnas aplicado.
 *
 * Una fila por renglón de datos, con todos los precios candidatos adentro. Es lo
 * que necesita la decisión de la lista: el precio definitivo todavía no se sabe.
 *
 * @param tabla  { titulos, filas: [{ pagina, y, valores }] }
 * @param mapeo  { codigo, codigoBarra, descripcion, cantidad, descuento, precios }
 */
export function filasDelArchivo({ tabla, mapeo, hojaNombre = null } = {}) {
  const filas = tabla?.filas ?? [];
  const precios = Array.isArray(mapeo?.precios) ? mapeo.precios : [];

  return filas.map((f, i) => {
    const celda = (indice) =>
      indice === null || indice === undefined ? "" : String(f.valores?.[indice] ?? "").trim();

    const descripcion = celda(mapeo?.descripcion);
    const porColumna = {};
    for (const c of precios) porColumna[c] = numeroDeLista(f.valores?.[c]);

    // LA CANTIDAD DEL ARCHIVO ES UNA CANDIDATA, NUNCA UN DATO CIERTO.
    //
    // Sale de la columna de unidades si el archivo la trae, y si no del "12X500"
    // del nombre. Las dos son pistas: la que manda es el `factor_pack` del
    // catálogo, y eso lo decide el que costea, no este módulo.
    const deLaColumna = mapeo?.cantidad === null || mapeo?.cantidad === undefined
      ? null
      : cantidadDeLista(f.valores?.[mapeo.cantidad]);
    const unidadesPorBulto = deLaColumna ?? cantidadEnNombre(descripcion);

    const crudo = celda(mapeo?.codigo);
    const claves = clavesDeCodigo(crudo);

    return {
      // ── EL NÚMERO DE FILA ES SECUENCIAL Y NO LA COORDENADA ───────────────
      //
      // `(importacionId, hojaNombre, filaExcel)` es único en la base, y la
      // primera versión de esto ponía acá la Y del renglón dentro de la página:
      // en un PDF de seis hojas esa Y se repite seis veces, y la importación
      // entera se caía al insertar el segundo lote. El error no señalaba a esto
      // —decía "este archivo ya fue importado"— así que hay que dejarlo escrito.
      //
      // Dónde está la fila se conserva igual, en `hojaNombre`: "Página 3" para un
      // PDF, el nombre de la hoja para una planilla. Es lo que el usuario usa
      // para encontrarla, y el número secuencial es lo que la identifica.
      filaExcel: i + 1,
      pagina: f.pagina ?? 1,
      hojaNombre: hojaNombre ?? (f.pagina ? `Página ${f.pagina}` : ""),
      renglonEnLaPagina: f.y ?? null,
      codigoCrudo: crudo,
      codigoNormalizado: claves.normalizado,
      codigoComparableSinCeros: claves.sinCeros || null,
      descripcionProveedor: descripcion,
      // El archivo no dice qué unidad comercial cotiza: eso es lo que distingue a
      // un proveedor cualquiera de Arcor. Queda en null y no se inventa.
      unidadProveedor: null,
      unidadesPorBulto,
      codigoBarraProveedor: celda(mapeo?.codigoBarra) || null,
      descuentoPct: mapeo?.descuento === null || mapeo?.descuento === undefined
        ? null
        : descuentoDeLista(f.valores?.[mapeo.descuento]),
      // Todos los precios candidatos. El definitivo lo escribe `aplicarEleccion`.
      preciosPorColumna: porColumna,
      precioSinIva: null,
      precioConIva: null,
      categoriaCruda: null,
    };
  });
}

/**
 * LA DECISIÓN DE LA LISTA: qué columna es el precio.
 *
 * @param filas            las de `filasDelArchivo`
 * @param productos        el catálogo, como lo devuelve `cargarDatosDeConciliacion`
 * @param codigosProveedor los vínculos guardados
 * @param columnasDePrecio los índices candidatos, en orden de preferencia
 * @param config           { rango, recargoPct, impuestoAdicionalPct, pisoPrecioCreible }
 *
 * @returns { eleccion, motivoLista, textoMotivoLista, opciones, resumen, vinculos }
 */
export function decidirColumnaDeLaLista({
  filas = [],
  productos = [],
  codigosProveedor = [],
  columnasDePrecio = [],
  config = {},
} = {}) {
  const indice = indexarCodigosProveedor(codigosProveedor);
  const indiceBarra = indexarCodigosBarra(productos);
  const productosPorId = new Map(productos.map((p) => [p.productoBaseId, p]));

  // El vínculo se resuelve UNA vez y se devuelve: la ruta lo necesita después
  // para contar cuántas filas no están en el catálogo, y volver a calcularlo
  // sería pagarlo dos veces y arriesgar que las dos cuentas no coincidan.
  const vinculos = new Map();
  const paraDecidir = filas.map((fila, i) => {
    const v = vincularFilaConCatalogo({ fila, indice, indiceBarra, productosPorId });
    vinculos.set(i, v);
    const producto = v.producto;
    return {
      clave: i,
      codigo: fila.codigoNormalizado || fila.codigoCrudo || "",
      precios: fila.preciosPorColumna ?? {},
      descuentoPct: fila.descuentoPct ?? null,
      cantidadDelArchivo: fila.unidadesPorBulto ?? null,
      costoActual: producto?.precioCostoActual ?? null,
      // El factor solo cuenta cuando el producto ES un bulto. Multiplicar el
      // precio por el `factor_pack` de un producto que se guarda suelto daría el
      // costo de una caja entera escrito como si fuera el de una unidad.
      factorPack: producto && requiereConversionABulto(baseParaHelpers(producto)) && factorValido(producto.factorPack)
        ? Number(producto.factorPack)
        : null,
    };
  });

  const decision = decidirLista({ filas: paraDecidir, columnasDePrecio, config });

  return {
    eleccion: decision.eleccion,
    motivoLista: decision.motivoLista,
    textoMotivoLista: decision.motivoLista ? TEXTO_MOTIVO_LISTA[decision.motivoLista] : null,
    opciones: decision.opciones,
    resumen: decision.resumen,
    filas: decision.filas,
    vinculos,
  };
}

/**
 * Escribe en cada fila el precio de la columna elegida.
 *
 * A partir de acá la fila tiene la misma forma que una de Arcor y entra a
 * `conciliarLista` sin que el motor sepa de dónde vino.
 *
 * EL DESCUENTO SE APLICA ACÁ Y NO EN EL RECARGO. Es parte del precio que el
 * proveedor factura —lo que dice el papel menos lo que bonifica—, mientras que el
 * recargo y el impuesto son lo que se le suma después. Escribirlo en
 * `precioConIva` hace que todo lo que sigue —el recargo, el impuesto, las dos
 * lecturas, el rango— opere sobre el número correcto sin enterarse.
 */
export function aplicarEleccion({ filas = [], eleccion } = {}) {
  if (!eleccion) return filas.map((f) => ({ ...f, precioConIva: null }));
  return filas.map((f) => {
    const crudo = Number(f.preciosPorColumna?.[eleccion.columna]);
    if (!Number.isFinite(crudo)) return { ...f, precioConIva: null };
    let precio = crudo;
    if (eleccion.conDescuento) {
      const d = Number(f.descuentoPct);
      if (Number.isFinite(d) && d > 0 && d <= 100) precio = precio * (1 - d / 100);
    }
    return { ...f, precioConIva: Math.round(precio * 100) / 100, descuentoAplicado: eleccion.conDescuento };
  });
}

/**
 * CUÁNTOS PRODUCTOS EXPLICA LA COLUMNA QUE SE USÓ.
 *
 * ── POR QUÉ NO ALCANZA CON MIRAR `decision.eleccion` ───────────────────────
 *
 * Porque `decision.eleccion` es lo que el MOTOR habría elegido, y es null
 * justamente cuando el motor no pudo decidir — que es el caso en que una persona
 * eligió la columna a mano. Ahí el respaldo de la columna usada existe, está
 * medido y estaba tirado: la opción correspondiente lo tiene.
 *
 * Devuelve `{ explicadas, comparables }`, los dos en null si la columna usada no
 * figura entre las opciones medidas (no debería pasar, y si pasa es mejor no
 * decir nada que decir un número de otra columna).
 */
export function respaldoDe(opciones = [], eleccion = null) {
  if (!eleccion) return { explicadas: null, comparables: null };
  const suya = opciones.find(
    (o) => o.columna === eleccion.columna && o.conDescuento === (eleccion.conDescuento === true)
  );
  return {
    explicadas: suya?.explicadas ?? null,
    comparables: suya?.comparables ?? null,
  };
}

/**
 * ¿LA COLUMNA CON LA QUE SE LEYÓ EXPLICA POCO?
 *
 * "Poco" es menos de la MITAD de los productos comparables. No es el mismo
 * umbral con el que el motor decide —ése son dos tercios, `MAYORIA_MINIMA`— y
 * son dos preguntas distintas a propósito: aquél decide si puede elegir solo,
 * éste decide si vale la pena avisar. Entre la mitad y los dos tercios hay una
 * franja en la que el motor no se anima pero la columna igual explica la mayoría,
 * y ahí un cartel de alarma sería ruido.
 *
 * Con `comparables` en 0 o en null devuelve false: sin productos con los que
 * comparar no hay nada que afirmar, y avisar ahí sería alarmar sobre una
 * medición que no se hizo.
 */
export const LA_MITAD = 0.5;

export function explicaPoco({ explicadas, comparables } = {}) {
  const e = Number(explicadas);
  const c = Number(comparables);
  if (!Number.isFinite(e) || !Number.isFinite(c) || c <= 0) return false;
  return e / c < LA_MITAD;
}

export { MOTIVO_LISTA };
