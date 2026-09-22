// EL PRECIO DELATA LA ESCALA.
//
// ── LA REGLA, Y DE DÓNDE SALIÓ ────────────────────────────────────────────
//
// Regla de Emanuel. Si lo que va a entrar al stock, valuado al precio que el
// papel cobra por unidad, no da el subtotal del papel, entonces la cantidad
// está en OTRA escala — y una cantidad en otra escala no se puede ofrecer como
// buena.
//
// El caso: Hamburguesa Paty Clásica del pedido 242. El papel factura 90
// unidades por $185.110,67, o sea $2.056,79 cada una. La hoja de Corregir
// ofrecía 3 y decía "Entra al stock 3 unidades". Tres por $2.056,79 son $6.170:
// treinta veces menos de lo que el papel cobra. Los 3 eran BULTOS de 30 leídos
// como unidades sueltas.
//
// ── POR QUÉ ESTA VERIFICACIÓN Y NO OTRA ───────────────────────────────────
//
// Porque no hace falta saber CUÁL es la escala correcta para darse cuenta de
// que la que hay está mal. El papel trae dos números que se multiplican entre
// sí, y esa igualdad no se sostiene si la cantidad cambió de unidad. Es la
// misma idea que la segunda ecuación del lector: aritmética, no opinión.
//
// ── LO QUE ESTA FUNCIÓN NO JUZGA ──────────────────────────────────────────
//
// **La cantidad que una persona contó.** Que lleguen 2 cajones en vez de 3 es
// exactamente lo que la hoja existe para registrar, y ahí lo contado NO tiene
// que dar el subtotal del papel. Esto mira la cantidad que el sistema OFRECE
// como "lo que dice la factura": si esa no cuadra, lo que está mal es la
// lectura de la escala, no la mercadería.
//
// Módulo puro: sin React, sin Prisma y sin red.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Cuánto se le perdona a la igualdad.
 *
 * Un peso de piso, y medio por ciento del subtotal para los renglones grandes:
 * el papel redondea y el precio unitario impreso se multiplica. Es la misma
 * forma que la tolerancia del renglón del lector —un piso más algo proporcional—
 * y por el mismo motivo.
 *
 * Nada de esto tapa lo que hay que atrapar: un error de escala no es del 0,5 %,
 * es de un factor entero. El de la hamburguesa es de TREINTA veces.
 */
export const PISO_DE_TOLERANCIA = 1;
export const PORCENTAJE_DE_TOLERANCIA = 0.005;

/**
 * ¿LA CANTIDAD QUE SE VA A OFRECER CUADRA CON EL PRECIO DEL PAPEL?
 *
 * @param subtotal   el importe impreso del renglón
 * @param cantidad   las unidades que el papel dice haber facturado
 * @param fisicas    las que van a entrar al stock con la escala que se está usando
 * @param porKilo    si el depósito cuenta este producto por kilo
 * @param factorPack cuántas unidades trae un bulto de este producto
 *
 * @returns `{ cuadra, aplica, esperado, valuado, precioUnitario }`.
 *          `aplica: false` cuando falta un dato o cuando no corresponde mirar,
 *          y ahí `cuadra` es `true`: lo que no se puede comprobar no se acusa.
 */
export function laCantidadCuadraConElPrecio({
  subtotal,
  cantidad,
  fisicas,
  porKilo = false,
  factorPack = null,
} = {}) {
  const sub = num(subtotal);
  const cant = num(cantidad);
  const fis = num(fisicas);

  // ── CUÁNDO NO CORRESPONDE MIRAR ────────────────────────────────────────
  //
  // Sin subtotal impreso o sin cantidad del papel no hay igualdad que
  // comprobar. Y en un producto que el depósito cuenta POR KILO, lo que entra
  // al stock son kilos y lo que el papel cuenta son piezas: son dos magnitudes
  // distintas y compararlas daría un falso positivo en cada fiambre.
  if (sub === null || cant === null || fis === null || cant === 0 || porKilo) {
    return { aplica: false, cuadra: true, esperado: null, valuado: null, precioUnitario: null, subtotal: sub };
  }

  const precioUnitario = sub / cant;
  const valuado = fis * precioUnitario;
  const tolerancia = Math.max(PISO_DE_TOLERANCIA, Math.abs(sub) * PORCENTAJE_DE_TOLERANCIA);

  // ── EL PAPEL PUEDE CONTAR BULTOS, Y EL STOCK CUENTA UNIDADES ───────────
  //
  // Esta comprobación nació con la Hamburguesa del 242, donde el papel factura
  // 90 UNIDADES y la hoja ofrecía 3: ahí la cantidad del papel y lo que entra
  // al stock están en la misma escala y la igualdad vale directo.
  //
  // Pero el mismo papel trae el Queso Rallado facturado por BULTO: dice 6 y al
  // stock entran 120, porque el bulto trae 20. Valuar 120 al precio POR BULTO
  // da seis millones contra $122.714 y el control acusaba un renglón perfecto.
  // Medido: fue exactamente lo que frenó el cierre del 242 el 2026-09-22 a las
  // 10:22 y a las 10:23, con el mensaje "entrarían 120 unidades al stock y el
  // papel factura 6".
  //
  // Así que la igualdad se mira en las DOS escalas posibles, y alcanza con que
  // cierre en una: o el papel contó lo mismo que entra al stock, o contó bultos
  // de `factorPack`. Cualquier otra proporción sigue siendo un error de escala
  // —3 contra 90 no es ninguna de las dos— y se sigue acusando.
  const factor = num(factorPack);
  const hayFactor = factor !== null && factor > 1;
  const valuadoPorBulto = hayFactor ? (fis / factor) * precioUnitario : null;
  const cuadraDirecto = Math.abs(valuado - sub) <= tolerancia;
  const cuadraPorBulto = valuadoPorBulto !== null && Math.abs(valuadoPorBulto - sub) <= tolerancia;

  return {
    aplica: true,
    cuadra: cuadraDirecto || cuadraPorBulto,
    // Cuántas unidades físicas TENDRÍAN que entrar para que la cuenta cierre.
    // Es la respuesta que sirve: dice el número, no solo que está mal. Con
    // factor se dice el de la escala del stock, que es la que se está por
    // escribir.
    esperado: hayFactor ? cant * factor : cant,
    valuado: cuadraPorBulto ? valuadoPorBulto : valuado,
    precioUnitario: cuadraPorBulto ? precioUnitario / factor : precioUnitario,
    subtotal: sub,
  };
}

/**
 * EL AVISO, EN CASTELLANO Y CON LOS DOS NÚMEROS.
 *
 * Nombra la cuenta que no cierra en vez de decir "hay un problema": quien mira
 * tiene que poder comprobarla contra el papel que tiene en la mano.
 */
export function textoDeLaEscalaQueNoCuadra(r, { moneda = (v) => `$${v}` } = {}) {
  if (!r || !r.aplica || r.cuadra) return null;
  return (
    `La cantidad no cuadra con el precio del papel: ${moneda(r.precioUnitario)} por unidad ` +
    `daría ${moneda(r.valuado)} y el papel cobra ${moneda(r.subtotal)}. ` +
    `Tendrían que ser ${r.esperado}. Revisá si son bultos o unidades sueltas.`
  );
}
