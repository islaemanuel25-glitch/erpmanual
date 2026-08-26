// EL PRECIO QUE EL PAPEL COBRA DE VERDAD POR UN RENGLÓN.
//
// ── EL DEFECTO QUE LE DIO ORIGEN ───────────────────────────────────────────
//
// El importador tomaba la columna "PRECIO" como el precio del papel. En una
// factura con bonificación esa columna es el precio de LISTA, no lo que se
// paga. Con 12 unidades a 8.168,94 y 14 % de bonificación, el renglón cierra en
// 87.045,75 — o sea 7.253,81 por unidad. El ERP se llevaba 8.168,94: un 12,6 %
// de más, escrito como si fuera el costo real.
//
// ── POR QUÉ EL SUBTOTAL MANDA, Y NO `precio × (1 − bonificación)` ──────────
//
// Porque el subtotal es lo que el proveedor DICE que cobra, y la multiplicación
// es lo que nosotros creemos que debería cobrar. Cuando difieren, el que tiene
// razón es el papel: puede haber una bonificación en cascada, un redondeo propio
// del proveedor, un ajuste por renglón o una segunda bonificación que la columna
// de porcentaje no muestra. En el ejemplo de arriba la multiplicación da
// 87.263,71 y el papel dice 87.045,75 — 217,96 de diferencia que no se explican
// con el 14 %.
//
// Por eso el orden es subtotal, después descuento, después precio impreso. No es
// una preferencia: cada escalón usa MENOS información del papel que el anterior.
//
// ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────────────
//
// No convierte escalas. El número que sale de acá está en la MISMA unidad en que
// el renglón expresa su cantidad, igual que el precio impreso, así que la receta
// del proveedor —`facturaPor`— se aplica después, sin cambios, en `precios.js`.
// Mezclar las dos cosas acá haría que un cambio de receta tuviera que tocar la
// aritmética del renglón.

import { TOLERANCIA_CENTAVOS, aCentavos, aPesos } from "../comprobante/impuestos.js";

/** De dónde salió el precio final. Se muestra en pantalla: no es un detalle. */
export const ORIGEN_PRECIO_PAPEL = Object.freeze({
  SUBTOTAL: "SUBTOTAL",
  DESCUENTO: "DESCUENTO",
  PRECIO_IMPRESO: "PRECIO_IMPRESO",
});

export const TEXTO_ORIGEN_PAPEL = Object.freeze({
  [ORIGEN_PRECIO_PAPEL.SUBTOTAL]: "Subtotal ÷ cantidad",
  [ORIGEN_PRECIO_PAPEL.DESCUENTO]: "Precio menos bonificación",
  [ORIGEN_PRECIO_PAPEL.PRECIO_IMPRESO]: "Precio impreso",
});

/**
 * Un número que sirve para calcular, o null.
 *
 * `null` y no 0: es la cuarta vez que el cero falsy muerde en este módulo de
 * compras. Un 0 en un importe se usa como si fuera un precio; un null se ve.
 */
const num = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Un porcentaje de bonificación creíble. Fuera de 0..100 no se interpreta. */
const porcentaje = (valor) => {
  const n = num(valor);
  if (n === null) return null;
  return n >= 0 && n <= 100 ? n : NaN;
};

/**
 * El precio efectivo de un renglón, con su origen y su motivo de revisión.
 *
 * @param cantidad          la del renglón, en la unidad de compra del renglón
 * @param precioImpreso     la columna PRECIO / PRECIO LISTA
 * @param bonificacionPct   la columna BONIF / DTO, en porcentaje (14 = 14 %)
 * @param subtotal          el importe del renglón tal como está impreso
 * @param haySubtotalImpreso  si el DOCUMENTO tiene columna de subtotal. Ver abajo.
 *
 * ── POR QUÉ `haySubtotalImpreso` ES UN PARÁMETRO APARTE ───────────────────
 *
 * Porque el subtotal se puede DERIVAR de los otros dos campos, y un campo
 * derivable que hay que completar es una orden de inventar. Ya pasó en el módulo
 * de comprobante con el total del pie: el modelo lo llenaba con la suma de las
 * líneas y la verificación comparaba la suma contra sí misma, cerrando siempre.
 *
 * Acá el daño sería peor y más callado: en una factura CON bonificación y SIN
 * columna de subtotal, un modelo que completa `subtotal = cantidad × precio`
 * hace que `subtotal ÷ cantidad` devuelva exactamente el precio de lista. O sea
 * que el defecto que este módulo existe para arreglar volvería, disfrazado de
 * arreglo y sin pasar nunca por el escalón del descuento.
 *
 * Un sí o un no sobre si la tabla TIENE esa columna no se puede calcular
 * multiplicando, y por eso sobrevive a que el modelo tenga ganas de completar.
 */
export function precioFinalDelRenglon({
  cantidad,
  precioImpreso,
  bonificacionPct,
  subtotal,
  haySubtotalImpreso = true,
} = {}) {
  const cant = num(cantidad);
  const precio = num(precioImpreso);
  const sub = num(subtotal);
  const bonif = porcentaje(bonificacionPct);

  const sinPrecio = (motivo) => ({
    precioFinal: null,
    origen: null,
    requiereRevision: true,
    motivo,
  });

  // ── 1. SUBTOTAL ÷ CANTIDAD ───────────────────────────────────────────────
  // Solo si el papel trae la columna. Un subtotal "presente" en un documento que
  // no la tiene es un número calculado por el lector, no leído.
  const subtotalUtilizable = haySubtotalImpreso === true && sub !== null;
  if (subtotalUtilizable) {
    if (cant === null || cant <= 0) {
      // Hay un importe de renglón pero no con qué repartirlo. Caer al precio de
      // lista acá sería volver al defecto exacto: usar la lista existiendo un
      // subtotal. Se pide revisión y se deja el precio en null.
      return sinPrecio(
        "El renglón trae subtotal pero la cantidad no sirve para dividir. Corregí la cantidad o escribí el precio final a mano."
      );
    }
    if (sub < 0) {
      return sinPrecio("El subtotal del renglón es negativo. Revisalo o escribí el precio final a mano.");
    }
    // Se redondea a centavo, que es la unidad en que el papel está expresado.
    // Sin redondear, 87.045,75 / 12 arrastra decimales que después la pantalla
    // muestra distinto de lo que guarda.
    const final = aPesos(Math.round(aCentavos(sub) / cant));
    return {
      precioFinal: final,
      origen: ORIGEN_PRECIO_PAPEL.SUBTOTAL,
      requiereRevision: false,
      motivo: null,
    };
  }

  // ── 2. PRECIO × (1 − DESCUENTO) ──────────────────────────────────────────
  // Es el respaldo, no el camino principal. Solo corre cuando no hay subtotal.
  if (Number.isNaN(bonif)) {
    return sinPrecio("La bonificación del renglón no se entiende. Revisala o escribí el precio final a mano.");
  }
  if (precio !== null && bonif !== null && bonif > 0) {
    const final = aPesos(Math.round(aCentavos(precio) * (1 - bonif / 100)));
    return {
      precioFinal: final,
      origen: ORIGEN_PRECIO_PAPEL.DESCUENTO,
      requiereRevision: false,
      motivo: null,
    };
  }

  // ── 3. EL PRECIO IMPRESO ─────────────────────────────────────────────────
  // El comportamiento anterior, intacto: sin subtotal y sin bonificación, la
  // columna de precio ES el precio.
  if (precio !== null) {
    if (precio < 0) {
      return sinPrecio("El precio impreso es negativo. Revisalo o escribí el precio final a mano.");
    }
    return {
      precioFinal: precio,
      origen: ORIGEN_PRECIO_PAPEL.PRECIO_IMPRESO,
      requiereRevision: false,
      motivo: null,
    };
  }

  // ── 4. NO HAY CON QUÉ ────────────────────────────────────────────────────
  // Sin precio no se inventa un cero: una línea sin precio del papel se resuelve
  // con el costo del sistema, y eso lo decide una persona en la pantalla.
  //
  // Pero HAY DOS CASOS distintos acá y confundirlos costaría plata. Un renglón
  // que no trae ningún dato de precio es normal —una planilla de pedido no los
  // trae— y no hay nada que revisar. Un renglón que trae una bonificación y NO
  // trae precio es otra cosa: consta que hay un descuento y no hay con qué
  // aplicarlo, así que dejarlo pasar en silencio es lo mismo que ignorarlo.
  if (bonif !== null && bonif > 0) {
    return sinPrecio(
      "El renglón tiene bonificación pero no se leyó el precio. Escribí el precio final a mano o revisá el renglón."
    );
  }
  return {
    precioFinal: null,
    origen: null,
    requiereRevision: false,
    motivo: null,
  };
}

/**
 * ¿La suma de los subtotales cierra contra el total impreso del documento?
 *
 * ── ESTO INFORMA, NO BLOQUEA ─────────────────────────────────────────────
 *
 * Es deliberado y es la diferencia con la verificación del módulo de
 * comprobante, que sí es una puerta. Allá el número decide si se escriben costos
 * sin que nadie mire; acá siempre hay una persona revisando renglón por renglón
 * antes de guardar, y el borrador no escribe ningún costo maestro. Un centavo de
 * diferencia no puede frenar a esa persona.
 *
 * ── LA TOLERANCIA ES POR RENGLÓN Y SE ACUMULA ────────────────────────────
 *
 * `TOLERANCIA_CENTAVOS` vale un centavo y viene de `comprobante/impuestos.js`,
 * donde está medida sobre facturas reales: el proveedor redondea el unitario
 * antes de multiplicar y el subtotal impreso difiere un centavo de verdad.
 *
 * Acá se compara una SUMA de subtotales, y cada uno se redondeó por su cuenta,
 * así que N renglones pueden acumular N centavos legítimos. Por eso la
 * tolerancia se multiplica por la cantidad de renglones sumados y no se copia el
 * "un centavo por comprobante" de la puerta — que es correcto allá porque compara
 * el pie contra el neto, no una suma de redondeos independientes.
 *
 * @returns cierra=null cuando no hay con qué preguntar. `null` y no `true`: "no
 *   se pudo verificar" y "verificado y da bien" son afirmaciones distintas, y la
 *   pantalla las dice distinto.
 */
export function verificarSumaDeSubtotales({
  subtotales = [],
  totalDocumento,
  hayTotalImpreso = true,
} = {}) {
  const validos = subtotales.map(num).filter((n) => n !== null);
  const total = num(totalDocumento);

  if (hayTotalImpreso !== true || total === null || !validos.length) {
    return {
      cierra: null,
      suma: validos.length ? aPesos(validos.reduce((a, b) => a + aCentavos(b), 0)) : null,
      total,
      diferencia: null,
      tolerancia: null,
      porque: "El documento no trae un total impreso con el que comparar.",
    };
  }

  const sumaCentavos = validos.reduce((acumulado, valor) => acumulado + aCentavos(valor), 0);
  const diferenciaCentavos = sumaCentavos - aCentavos(total);
  const tolerancia = TOLERANCIA_CENTAVOS * validos.length;

  return {
    cierra: Math.abs(diferenciaCentavos) <= tolerancia,
    suma: aPesos(sumaCentavos),
    total,
    diferencia: aPesos(diferenciaCentavos),
    tolerancia: aPesos(tolerancia),
    porque: null,
  };
}
