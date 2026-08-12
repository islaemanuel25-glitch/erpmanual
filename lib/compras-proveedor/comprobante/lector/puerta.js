// lib/compras-proveedor/comprobante/lector/puerta.js
//
// LA VERIFICACIÓN ARITMÉTICA ES EL CANDADO DE LA LECTURA.
//
// TODA lectura pasa por acá antes de mostrarse. No hay un camino que muestre lo
// que devolvió el modelo sin verificarlo, y eso es lo único que separa "un
// número que leyó una máquina" de "un número en el que se puede confiar".
//
// ── POR QUÉ ALCANZA CON LA ARITMÉTICA ──────────────────────────────────────
//
// Un modelo de visión no falla como falla un OCR. No devuelve un carácter raro:
// devuelve un número plausible. Un 3 que era un 8, un dígito de menos, dos
// dígitos cambiados de orden — todos se leen perfectamente bien y ninguno se ve
// mal a simple vista.
//
// Lo que un número inventado NO puede hacer es cerrar la cuenta. La suma de las
// líneas, más el IVA según la receta, más el interno, más las percepciones,
// tiene que dar el total impreso al pie DENTRO DE UN CENTAVO. Un dígito mal en
// cualquier renglón rompe esa igualdad por mucho más que un centavo.
//
// Por eso el candado no pregunta "¿leíste bien?" —que es lo que el modelo no
// puede contestar honestamente— sino "¿cierra?", que es aritmética y no opinión.
//
// ── SI NO CIERRA, NO SE PROPONE NADA ───────────────────────────────────────
//
// El comprobante queda en MAL_LEIDO y de ahí no sale ninguna propuesta de costo.
// No es "mostralo con una advertencia": una propuesta de costo con un cartel al
// lado se acepta igual, porque el que la mira ya venía a aceptarla.
//
// MAL_LEIDO es distinto de DIFIERE, y la diferencia importa: en DIFIERE el PAPEL
// no cierra —el proveedor se equivocó, o hay un redondeo raro— y eso es
// información real que se muestra con la diferencia a la vista. En MAL_LEIDO lo
// que no cierra es la LECTURA. Un solo estado para los dos haría que un invento
// se leyera como un dato del proveedor.

import { verificarComprobante, aCentavos, TOLERANCIA_CENTAVOS } from "../impuestos.js";
import { lecturaUtilizable } from "./contrato.js";

/**
 * LA SEGUNDA ECUACIÓN, Y SIN ELLA EL CANDADO CASI NO ATRAPABA NADA.
 *
 * `verificarComprobante` suma los SUBTOTALES IMPRESOS —"el impreso manda", que
 * es correcto para su trabajo y está medido contra las dos facturas reales—. La
 * consecuencia, que no se ve leyendo: el PRECIO UNITARIO no entra en esa cuenta.
 * Si el modelo lee bien el subtotal y mal el unitario, el comprobante cierra
 * perfecto.
 *
 * Y el unitario es exactamente el número que después se convierte en costo.
 *
 * MEDIDO el 2026-08-11 sobre las dos facturas reales, con 125 lecturas mal
 * hechas del tipo que comete un modelo de visión: sin esta comprobación se
 * colaban 103, el 82 %. No es un detalle fino: era el candado casi entero.
 *
 * La ecuación es independiente de la del pie: cantidad × unitario tiene que dar
 * el subtotal impreso. Un dígito mal en el unitario la rompe por mucho más que
 * la tolerancia, aunque el pie siga cerrando.
 *
 * La tolerancia es de un centavo por línea, y no es arbitraria: en la factura de
 * DAS dos de las tres líneas difieren un centavo de verdad, porque el proveedor
 * redondea el unitario antes de multiplicar. Ese centavo es real y no puede
 * marcarse como error.
 */
export function verificarCoherenciaDeLineas(lineas, tolerancia = TOLERANCIA_CENTAVOS) {
  const incoherentes = [];
  (Array.isArray(lineas) ? lineas : []).forEach((l, i) => {
    // Sin subtotal impreso no hay segunda ecuación: el subtotal se calcula desde
    // el unitario y compararlos sería comparar un número contra sí mismo.
    if (l?.subtotalImpreso === null || l?.subtotalImpreso === undefined) return;
    if (l?.cantidad === null || l?.netoUnitario === null) return;
    const calculado = aCentavos(l.netoUnitario) * Number(l.cantidad);
    const impreso = aCentavos(l.subtotalImpreso);
    const dif = Math.round(calculado - impreso);
    if (Math.abs(dif) > tolerancia) {
      incoherentes.push({
        indice: i,
        linea: i + 1,
        cantidad: l.cantidad,
        netoUnitario: l.netoUnitario,
        subtotalImpreso: l.subtotalImpreso,
        diferenciaCentavos: dif,
      });
    }
  });
  return { ok: incoherentes.length === 0, incoherentes };
}

/** Los estados que puede dejar la puerta. Son los del enum de Prisma. */
export const ESTADO = Object.freeze({
  CARGADO: "CARGADO",
  MAL_LEIDO: "MAL_LEIDO",
});

/**
 * Pasa una lectura por la verificación y decide qué queda guardado.
 *
 * Función PURA: no toca la base ni el disco. Devuelve qué escribir, y el que
 * llama escribe. Así el criterio se puede ejercer con las dos facturas reales
 * sin ningún servicio de por medio — que es exactamente lo que hace
 * `cobertura.test.mjs`.
 *
 * @param {object} lectura   ya normalizada por `normalizarLectura`
 * @param {object} receta    la receta del proveedor con la que se leyó
 * @param {number} recetaVersion
 */
export function pasarPorLaPuerta({ lectura, receta, recetaVersion = null } = {}) {
  const util = lecturaUtilizable(lectura);
  if (!util.ok) {
    return {
      cierra: false,
      estado: ESTADO.MAL_LEIDO,
      proponeCostos: false,
      porque: util.porque,
      diferenciaCentavos: null,
      verificacion: null,
      aGuardar: camposComunes(lectura, receta, recetaVersion, ESTADO.MAL_LEIDO, null),
    };
  }

  const verificacion = verificarComprobante({
    lineas: lectura.lineas.map((l) => ({
      cantidad: l.cantidad,
      netoUnitario: l.netoUnitario,
      subtotalImpreso: l.subtotalImpreso,
      internoUnitario: l.internoUnitario ?? 0,
    })),
    pie: piePlano(lectura.pie),
    receta,
  });

  // LAS DOS ECUACIONES TIENEN QUE CERRAR. La del pie sola dejaba pasar el 82 %
  // de las lecturas mal hechas, porque no mira el precio unitario — ver el
  // comentario de `verificarCoherenciaDeLineas`.
  const coherencia = verificarCoherenciaDeLineas(lectura.lineas);
  const cierra = verificacion.cierra === true && coherencia.ok;
  const estado = cierra ? ESTADO.CARGADO : ESTADO.MAL_LEIDO;

  return {
    cierra,
    estado,
    // La única puerta hacia una propuesta de costo. Si no cierra, no pasa.
    proponeCostos: cierra,
    porque: cierra ? null : porqueNoCierra(verificacion, coherencia),
    diferenciaCentavos: verificacion.diferenciaCentavos,
    lineasIncoherentes: coherencia.incoherentes,
    verificacion,
    aGuardar: camposComunes(lectura, receta, recetaVersion, estado, verificacion),
  };
}

/** El motivo, nombrando la línea cuando se sabe cuál es. */
function porqueNoCierra(verificacion, coherencia) {
  if (!coherencia.ok) {
    const cuales = coherencia.incoherentes
      .map((x) => `la ${x.linea} (${x.cantidad} × $${x.netoUnitario} no da $${x.subtotalImpreso})`)
      .join(", ");
    return (
      `El precio por unidad no coincide con el subtotal impreso en ${cuales}. ` +
      `Es la marca de un dígito mal leído en el precio. No se propone ningún costo ` +
      `desde este comprobante.`
    );
  }
  return (
    `La cuenta no cierra: ${describirDiferencia(verificacion.diferenciaCentavos)}. ` +
    `Puede ser un dígito mal leído. No se propone ningún costo desde este comprobante.`
  );
}

function piePlano(pie) {
  const p = pie || {};
  const porNombre = {};
  for (const perc of p.percepciones || []) {
    if (perc?.nombre) porNombre[`perc${perc.nombre}`] = perc.importe;
  }
  return { neto: p.neto, iva: p.iva, interno: p.interno, total: p.total, ...porNombre };
}

function describirDiferencia(centavos) {
  if (!Number.isFinite(centavos)) return "no se pudo calcular la diferencia";
  const pesos = Math.abs(centavos) / 100;
  const signo = centavos > 0 ? "de más" : "de menos";
  return `sobran $${pesos.toFixed(2)} ${signo} contra el total impreso (tolerancia: ${TOLERANCIA_CENTAVOS} centavo)`;
}

/**
 * Lo que se guarda pase lo que pase.
 *
 * El consumo y el modelo se guardan TAMBIÉN cuando la lectura salió mal. Es
 * cuando más importa: una lectura fallida consumió igual, y si solo se
 * registraran las buenas, el costo medido saldría más bajo que el real
 * justamente en los meses en que el lector anduvo peor.
 */
function camposComunes(lectura, receta, recetaVersion, estado, verificacion) {
  const l = lectura || {};
  return {
    estado,
    modeloLectura: l.modelo ?? null,
    leidoEn: null, // lo pone el que escribe, con su reloj
    tokensEntrada: l.consumo?.tokensEntrada ?? null,
    tokensSalida: l.consumo?.tokensSalida ?? null,
    costoMicroUsd: l.consumo?.costoMicroUsd ?? 0,
    // La receta se copia, igual que `parserVersion` en las listas: dentro de
    // seis meses, mirando un comprobante viejo, hay que poder explicar el
    // resultado aunque la receta haya cambiado diez veces desde entonces.
    recetaVersion,
    recetaUsada: receta ?? null,
    diferenciaCentavos: verificacion?.diferenciaCentavos ?? null,
    // ── EL PIE SE GUARDA SIEMPRE, CIERRE O NO ────────────────────────────
    //
    // Estaba adentro del bloque que solo corría al cerrar, y eso dejaba sin
    // datos justo el caso que hay que diagnosticar. El 2026-08-12, con el
    // comprobante de Mauro en MAL_LEIDO, hubo que reconstruir el total del papel
    // desde `diferenciaCentavos` haciendo la cuenta al revés, porque los cuatro
    // campos del pie estaban en null.
    //
    // Son números leídos del papel, no una afirmación del sistema. Guardarlos
    // no dice que la lectura sea buena: dice qué se leyó, que es exactamente lo
    // que hace falta para saber si falló la lectura o la receta.
    netoLeido: l.pie?.neto ?? null,
    ivaLeido: l.pie?.iva ?? null,
    internoLeido: l.pie?.interno ?? null,
    totalLeido: l.pie?.total ?? null,

    // LA IDENTIDAD SÍ SIGUE ATADA AL CIERRE, y por un motivo distinto: va al
    // índice único, así que un número sacado de una lectura que no cierra
    // bloquearía el número verdadero cuando alguien lo cargue bien.
    ...(estado === ESTADO.CARGADO
      ? {
          tipo: l.identidad?.tipo ?? null,
          puntoVenta: l.identidad?.puntoVenta ?? null,
          numero: l.identidad?.numero ?? null,
          fecha: l.identidad?.fecha ?? null,
          cuitLeido: l.identidad?.cuit ?? null,
        }
      : {}),
  };
}
