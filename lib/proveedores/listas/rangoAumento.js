// lib/proveedores/listas/rangoAumento.js
//
// EL RANGO DE AUMENTO ESPERADO como control de coherencia.
//
// ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
//
// El recargo comercial y el rango esperado son cosas separadas y NO se suman. El
// recargo construye el costo propuesto —precio del proveedor más 5 %—; el rango
// se usa después, comparando ese costo propuesto contra el costo que el producto
// ya tiene. Un rango de 10 a 20 % sigue siendo 10 a 20 % aunque el recargo sea
// 5: no se convierte en 15 a 25.
//
// ── PARA QUÉ SIRVE ──────────────────────────────────────────────────────────
//
// Es EVIDENCIA DE COHERENCIA, no una prueba. Cuando el precio del proveedor es
// por unidad y el producto podría ser esa unidad o un pack, las dos hipótesis
// dan costos muy distintos y una suele ser absurda: una caja de 21 alfajores que
// hoy vale $21.000 no puede pasar a costar $1.050. El porcentaje delata cuál es
// cuál.
//
// Lo que NUNCA hace: confirmar solo. Una fila no se aplica por caer dentro del
// rango, y una fila fuera del rango no se descarta ni se esconde. Todas quedan
// visibles y todas necesitan que una persona diga que sí.
//
// Módulo puro: sin BD, sin Next.

import { aCentavos } from "./calculoCosto.js";

/** Los estados en que puede quedar una variación. */
export const ESTADO_VARIACION = {
  ESPERADO: "ESPERADO",
  AUMENTO_BAJO: "AUMENTO_BAJO",
  AUMENTO_ALTO: "AUMENTO_ALTO",
  SIN_AUMENTO: "SIN_AUMENTO",
  DISMINUCION: "DISMINUCION",
  /** No hay costo previo con el que comparar. */
  SIN_REFERENCIA: "SIN_REFERENCIA",
};

export const TEXTO_ESTADO_VARIACION = {
  ESPERADO: "Aumento esperado",
  AUMENTO_BAJO: "Aumento bajo",
  AUMENTO_ALTO: "Aumento alto",
  SIN_AUMENTO: "Sin aumento",
  DISMINUCION: "Disminución",
  SIN_REFERENCIA: "Sin costo anterior para comparar",
};

/**
 * Token semántico del theme para cada estado. NO son colores: son nombres del
 * sistema, y quien cambie la paleta los cambia en un solo lugar.
 *
 * Disminución y costo igual comparten el tono de alarma: las dos significan que
 * una lista nueva no aumentó nada, que en la práctica es la señal de que la
 * interpretación está mal.
 */
export const TONO_ESTADO_VARIACION = {
  ESPERADO: "sunmi-text-success",
  AUMENTO_BAJO: "sunmi-text-warning",
  AUMENTO_ALTO: "sunmi-text-warning",
  SIN_AUMENTO: "sunmi-text-danger",
  DISMINUCION: "sunmi-text-danger",
  SIN_REFERENCIA: "sunmi-text-muted",
};

/** Los que llevan advertencia visualmente fuerte, no una nota al pie. */
export function esAlertaFuerte(estado) {
  return estado === ESTADO_VARIACION.DISMINUCION || estado === ESTADO_VARIACION.SIN_AUMENTO;
}

/**
 * ¿Este estado exige que la persona lo confirme explícitamente?
 *
 * Todo lo que no sea "esperado". Y "esperado" tampoco se confirma solo: exige la
 * misma acción de la persona, lo que cambia es que no lleva advertencia.
 */
export function exigeConfirmacionExplicita(estado) {
  return estado !== ESTADO_VARIACION.ESPERADO;
}

/** Arcor. Se puede cambiar por importación y queda guardado en la fila. */
export const RANGO_POR_DEFECTO = { minPct: 10, maxPct: 20 };

/** Un rango válido: dos números finitos, con el mínimo no mayor que el máximo. */
export function rangoValido({ minPct, maxPct } = {}) {
  const a = Number(minPct);
  const b = Number(maxPct);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a < 0 || b > 1000) return false;
  return a <= b;
}

/**
 * En qué estado cae una variación.
 *
 *   disminución        el costo baja
 *   sin aumento        el costo no se mueve
 *   aumento bajo       sube, pero menos que el mínimo esperado
 *   aumento esperado   entre el mínimo y el máximo, ambos incluidos
 *   aumento alto       más que el máximo
 *
 * La igualdad se mide en centavos, que es la unidad en la que el costo realmente
 * existe: 5.962,1600001 y 5.962,16 son el mismo costo.
 */
export function clasificarVariacion({ costoActual, costoNuevo, minPct, maxPct } = {}) {
  const nuevo = Number(costoNuevo);
  const actual = Number(costoActual);
  if (!Number.isFinite(nuevo) || nuevo <= 0 || !Number.isFinite(actual) || actual <= 0) {
    return { estado: ESTADO_VARIACION.SIN_REFERENCIA, variacionPct: null };
  }

  if (aCentavos(actual) === aCentavos(nuevo)) {
    return { estado: ESTADO_VARIACION.SIN_AUMENTO, variacionPct: 0 };
  }

  const variacionPct = ((nuevo - actual) / actual) * 100;
  const min = Number(minPct);
  const max = Number(maxPct);

  if (variacionPct < 0) return { estado: ESTADO_VARIACION.DISMINUCION, variacionPct };
  if (variacionPct > max) return { estado: ESTADO_VARIACION.AUMENTO_ALTO, variacionPct };
  if (variacionPct < min) return { estado: ESTADO_VARIACION.AUMENTO_BAJO, variacionPct };
  return { estado: ESTADO_VARIACION.ESPERADO, variacionPct };
}

/**
 * Qué tan lejos está una variación de lo esperado. Sirve para ORDENAR, no para
 * elegir.
 */
export function distanciaAlRango({ variacionPct, minPct, maxPct } = {}) {
  const v = Number(variacionPct);
  if (!Number.isFinite(v)) return Infinity;
  const min = Number(minPct);
  const max = Number(maxPct);
  if (v < min) return min - v;
  if (v > max) return v - max;
  return 0;
}

/**
 * Una hipótesis es ABSURDA cuando cambia el orden de magnitud del costo.
 *
 * No es "cara" ni "barata": es que no puede ser el mismo producto. Un costo que
 * se triplica o que se reduce a un tercio no es un aumento de lista, es una
 * interpretación equivocada. Estas hipótesis se muestran y se explican, pero no
 * pueden ser la recomendada.
 */
export function esAbsurda(variacionPct) {
  const v = Number(variacionPct);
  if (!Number.isFinite(v)) return false;
  return v > 200 || v < -66;
}

/**
 * Cuál de las hipótesis recomendar, si es que alguna.
 *
 *   · Una sola creíble y el resto absurdas → se recomienda esa.
 *   · Más de una creíble → AMBIGUA, decide la persona.
 *   · Ninguna creíble → REVISAR.
 *
 * El porcentaje descarta lo imposible; NO elige entre lo posible. Un 5 % contra
 * un 12 % son las dos creíbles y ahí no se recomienda nada, aunque una caiga
 * dentro del rango y la otra no.
 *
 * @param hipotesis  [{ clave, costoNuevo, ... }]
 * @returns { recomendada, resultado: "RECOMENDADA"|"AMBIGUA"|"REVISAR", evaluadas }
 */
export function recomendarHipotesis({ hipotesis = [], costoActual, minPct, maxPct } = {}) {
  const evaluadas = hipotesis.map((h) => {
    const c = clasificarVariacion({ costoActual, costoNuevo: h.costoNuevo, minPct, maxPct });
    return {
      ...h,
      ...c,
      distancia: distanciaAlRango({ variacionPct: c.variacionPct, minPct, maxPct }),
      absurda: esAbsurda(c.variacionPct),
    };
  });

  const creibles = evaluadas.filter((h) => !h.absurda && h.variacionPct !== null);

  if (creibles.length === 0) return { recomendada: null, resultado: "REVISAR", evaluadas };
  if (creibles.length === 1) return { recomendada: creibles[0].clave, resultado: "RECOMENDADA", evaluadas };
  return { recomendada: null, resultado: "AMBIGUA", evaluadas };
}

/**
 * La recomendación explicada, en una frase que se pueda leer sin saber nada del
 * modelo. Es lo que ve la persona antes de decidir.
 */
export function textoRecomendacion({ evaluadas = [], recomendada, resultado, baseTexto, money, pct } = {}) {
  const elegida = evaluadas.find((h) => h.clave === recomendada);
  const otras = evaluadas.filter((h) => h.clave !== recomendada);

  if (resultado === "REVISAR") {
    return "Ninguna interpretación da un costo creíble contra el que el producto tiene hoy. Puede ser que el producto vinculado no sea el correcto, o que el costo anterior esté mal. Revisalo antes de confirmar.";
  }
  if (resultado === "AMBIGUA" || !elegida) {
    return "Más de una interpretación da un resultado posible, así que el sistema no elige. Mirá los costos de cada una y decidí cuál corresponde.";
  }

  const partes = [`El proveedor cotiza ${baseTexto}.`];
  partes.push(
    elegida.multiplicador === 1
      ? `El producto del ERP es eso mismo, así que el costo propuesto es ${money(elegida.costoNuevo)}, ${pct(elegida.variacionPct)} sobre el costo actual.`
      : `El producto del ERP agrupa ${elegida.multiplicador}, así que el costo propuesto es ${money(elegida.costoNuevo)}, ${pct(elegida.variacionPct)} sobre el costo actual.`
  );
  const absurda = otras.find((h) => h.absurda);
  if (absurda) {
    partes.push(
      absurda.multiplicador === 1
        ? `Tomarlo como una unidad suelta dejaría el costo en ${money(absurda.costoNuevo)}, ${pct(absurda.variacionPct)}, que no puede ser.`
        : `Multiplicarlo por ${absurda.multiplicador} dejaría el costo en ${money(absurda.costoNuevo)}, ${pct(absurda.variacionPct)}, que no puede ser.`
    );
  }
  return partes.join(" ");
}
