// lib/compras-proveedor/comprobante/lector/renglonesQueNoCierran.js
//
// CADA RENGLÓN CON LO SUYO: CANTIDAD × PRECIO × (1 − BONIF) = SU IMPORTE.
//
// ── EL CASO (Emanuel, 2026-11-05, Ayala Gauna / Kangoo) ──────────────────
//
// Factura de 14 renglones, la foto apaisada. El lector devolvió 13: se comió
// "ALF MK MOUSSE BCO TRIPLE" y corrió los importes de los vecinos —el OREO
// quedó con el importe del TITA y el TITA con el del OREO o el MK—. La suma no
// cerró por $57.289,97 y nadie supo por qué: la puerta mira la SUMA del papel,
// no cada fila, y el conteo de renglones solo avisa si el lector admite ver
// más de los que transcribió.
//
// Lo que un renglón corrido no puede hacer es cerrar su propia cuenta: 18 ×
// $1.278,91 × 0,9 no da $10.965,74. Esta es esa cuenta, fila por fila.
//
// ── QUÉ HACE CON LO QUE ENCUENTRA ─────────────────────────────────────────
//
// La da. No decide ningún costo —el costo es el `costoFinal` de cada renglón,
// que da el modelo (#165)— ni deja un papel sin cerrar: un papel que cierra la
// suma con un renglón que no cumple sigue cerrando, con el renglón marcado. Lo
// que sí hace es pedir que se vuelva a leer: es un motivo de escalada al
// modelo grande (`escalada.js`), que recibe la lista de filas para mirarlas de
// nuevo en la foto (`instruccionesInterpretadas`).
//
// ── POR QUÉ NO ES LA REGLA QUE SE BORRÓ EN #165 ───────────────────────────
//
// La coherencia cantidad × precio de antes DECIDÍA: dejaba el papel mal leído.
// Se borró porque hay papeles donde la cuenta no da por cómo vienen —el precio
// impreso con IVA y el importe sin, un descuento que no está en su columna—.
// Por eso acá un renglón no cumple solo si además se aparta de lo que hacen
// los demás renglones del MISMO papel: si todos dan el mismo factor, es el
// formato del papel y no un renglón corrido.
//
// Módulo puro: sin red, sin base.

/** Cuánto puede apartarse un renglón del factor del papel y seguir siendo "el formato". */
export const FACTOR_DEL_PAPEL_PCT = 0.5;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * La tolerancia de un renglón, en pesos: el precio impreso viene redondeado al
 * centavo, así que cada unidad puede traer medio centavo de diferencia, más un
 * centavo de redondeo del importe. 18 × $1.278,91 × 0,9 = $20.718,34 contra
 * $20.718,28 impresos: seis centavos, adentro.
 */
export function toleranciaDelRenglon(cantidad) {
  return Math.abs(Number(cantidad) || 0) * 0.005 + 0.01;
}

/** Lo que el renglón da con sus tres números, o null si le falta alguno. */
function cuentaDelRenglon(l) {
  const cantidad = num(l?.cantidad);
  const precio = num(l?.netoUnitario ?? l?.precioImpreso);
  const importe = num(l?.subtotalImpreso ?? l?.importeImpreso);
  const bonif = num(l?.bonificacion) ?? 0;
  if (cantidad === null || precio === null || importe === null) return null;
  if (!(cantidad > 0) || !(precio > 0) || !(importe > 0)) return null;
  return { cantidad, precio, importe, bonif, esperado: cantidad * precio * (1 - bonif / 100) };
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * LOS RENGLONES QUE NO CIERRAN SU PROPIA CUENTA.
 *
 * @param lectura  normalizada por `normalizarLectura` (o la cruda del modelo:
 *                 se aceptan los dos nombres de cada campo)
 * @returns `[{ indice, descripcion, cantidad, precio, bonif, importe, esperado,
 *          diferencia }]`, vacío si todos cierran o no hay con qué mirar.
 */
export function renglonesQueNoCierran(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const conCuenta = lineas
    .map((l, indice) => ({ l, indice, c: l?.tipo && l.tipo !== "MERCADERIA" ? null : cuentaDelRenglon(l) }))
    .filter((x) => x.c);
  if (!conCuenta.length) return [];

  // El factor del papel: lo que da la mayoría de sus renglones. 1 en una
  // factura común; otro número si el papel imprime los precios de otra forma.
  // Con menos de tres renglones no hay mayoría —con uno, la mediana es él
  // mismo y nunca se marcaría—: se mide contra 1, que es la factura común.
  const factorDelPapel = conCuenta.length >= 3 ? mediana(conCuenta.map((x) => x.c.importe / x.c.esperado)) : 1;

  // ── UN DESCUENTO QUE EL LECTOR NO ANOTÓ NO ES UN RENGLÓN CORRIDO ───────
  //
  // Las lecturas de antes del 2026-11-05 no traen la bonificación: el esquema
  // no la pedía. Medido sobre las boletas reales de los candados —Secco, CCU,
  // DYSSA, Das—: renglones bien leídos que no cierran porque su descuento del
  // 5 al 27 % no está en la lectura. Sin la bonificación en el papel, un
  // renglón se marca solo si lo que trae NO puede ser un descuento: un importe
  // MAYOR que cantidad × precio, o el importe de OTRA fila (el OREO de Ayala
  // Gauna con los $10.965,74 del TITA). Con la bonificación leída, la cuenta
  // es estricta.
  const hayBonifEnElPapel = lineas.some((l) => num(l?.bonificacion) !== null);
  const cerca = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
  // Otra fila con OTRA cantidad o precio: tres renglones iguales de Secco
  // —10 × $10.800,22 por $93.961,90 cada uno— comparten el importe sin que
  // ninguno esté corrido.
  const esDeOtraFila = (c, indice) =>
    conCuenta.some(
      (o) =>
        o.indice !== indice &&
        (o.c.cantidad !== c.cantidad || o.c.precio !== c.precio) &&
        (cerca(c.importe, o.c.esperado) || cerca(c.importe, o.c.importe))
    );

  return conCuenta
    .filter(({ c, indice }) => {
      const noCierra = Math.abs(c.esperado - c.importe) > toleranciaDelRenglon(c.cantidad);
      const comoLosDemas = Math.abs(c.importe / c.esperado / factorDelPapel - 1) * 100 <= FACTOR_DEL_PAPEL_PCT;
      const noPuedeSerUnDescuento = hayBonifEnElPapel || c.importe > c.esperado || esDeOtraFila(c, indice);
      return noCierra && !comoLosDemas && noPuedeSerUnDescuento;
    })
    .map(({ l, indice, c }) => ({
      indice,
      descripcion: l?.descripcion ?? null,
      cantidad: c.cantidad,
      precio: c.precio,
      bonif: c.bonif,
      importe: c.importe,
      esperado: Math.round(c.esperado * 100) / 100,
      diferencia: Math.round((c.importe - c.esperado) * 100) / 100,
    }));
}

/**
 * LA LISTA PARA EL LECTOR QUE VUELVE A LEER: qué filas mirar de nuevo y por
 * qué, con sus números. Null si no hay ninguna.
 */
export function textoDeRenglonesQueNoCierran(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const filas = lista.map(
    (r) =>
      `«${r.descripcion ?? "sin descripción"}»: ${r.cantidad} × ${r.precio}` +
      (r.bonif ? ` × (1 − ${r.bonif} %)` : "") +
      ` da ${r.esperado} y el importe leído es ${r.importe}`
  );
  return (
    "En la lectura del otro lector estos renglones NO cierran su propia cuenta —cantidad × precio × " +
    "(1 − bonificación) tiene que dar el importe impreso de ESA fila—: " +
    filas.join("; ") +
    ". Es la marca de una fila salteada o de números tomados de la fila de al lado. Volvé a leer " +
    "esas filas en la foto, y las de alrededor, columna por columna: puede faltar un renglón entre " +
    "ellas, y dos renglones con precios casi iguales son dos renglones."
  );
}
