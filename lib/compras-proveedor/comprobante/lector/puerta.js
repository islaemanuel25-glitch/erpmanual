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
import { lecturaUtilizable, num } from "./contrato.js";

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
  /**
   * EL PAPEL NO TRAE TOTAL. No es lo mismo que haberlo leído mal.
   *
   * Emanuel recibe remitos y planillas de pedido además de facturas, así que
   * este caso es frecuente y no una excepción. Una planilla trae producto,
   * precio, cantidad e importe, y NADA al pie: ni neto, ni IVA, ni total.
   *
   * Contra eso la verificación no puede correr, porque no hay contra qué
   * comparar la suma. Marcarlo MAL_LEIDO afirmaría algo falso —que el modelo se
   * equivocó— cuando la lectura puede haber sido perfecta. Es la misma
   * distinción que ya separa MAL_LEIDO de DIFIERE: qué falló, la LECTURA o el
   * PAPEL. Acá no falló ninguno de los dos: el papel es de otra clase.
   *
   * No propone costos igual, y por el mismo motivo que MAL_LEIDO: sin la
   * ecuación cerrada, un número puede estar inventado y nadie lo sabría.
   */
  SIN_TOTAL: "SIN_TOTAL",
});

/**
 * ¿El papel trae un total contra el cual verificar?
 *
 * CERO CUENTA COMO AUSENTE, y es a propósito. El esquema de salida exige el
 * campo `total`, así que un modelo que no encuentra ninguno igual tiene que
 * poner algo, y pone 0 — medido con el papel de Mauro, que devolvió `total: 0`
 * y `neto: 0`. Tratar el 0 como un total real haría que la diferencia fuera el
 * comprobante entero y el estado dijera "mal leído".
 *
 * Y da lo mismo si el 0 vino porque el papel no trae total o porque el modelo no
 * lo encontró: en los dos casos no hay contra qué verificar, que es lo único que
 * este predicado decide. Cuál de las dos fue se dice en el texto, que le pide a
 * la persona que mire el papel.
 */
export function traeTotal(pie, hayTotalImpreso = null) {
  // EL BOOLEANO MANDA SOBRE EL NÚMERO, y ese es el punto entero.
  //
  // Un número se puede calcular sumando las líneas; un "¿lo ves impreso?" no.
  // Cuando el modelo dice que NO hay total, no importa qué número haya puesto en
  // el pie: ese número no salió del papel.
  //
  // Medido: obligado por el esquema a completar `total`, el modelo devolvió tres
  // veces seguidas la suma exacta de las líneas sobre un papel sin total, y las
  // tres cerraron con diferencia cero. La suma comparada contra sí misma cierra
  // siempre.
  if (hayTotalImpreso === false) return false;
  return Number(pie?.total) > 0;
}

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

  // ── EL PAPEL SIN TOTAL LLEGA ACÁ COMO "INUTILIZABLE", Y NO LO ES ─────
  //
  // `lecturaUtilizable` pide un total porque sin él no hay nada que verificar, y
  // eso es cierto. Pero "no hay con qué verificar" no es "se leyó mal": es
  // exactamente el caso que SIN_TOTAL vino a nombrar, y salía por este return
  // antes de llegar a él.
  //
  // Lo descubrió la medición contra el papel real, no los candados: los míos
  // armaban el pie con `total: 0`, que SÍ pasa esta puerta. Con el campo
  // realmente omitido —que es lo que devuelve el modelo cuando se le saca la
  // obligación de completarlo— el camino es otro. La forma del dato de prueba
  // tiene que ser la forma del dato real.
  //
  // Se exige además que el modelo diga VER que no hay total. Si dice que sí hay
  // uno y no lo trajo, eso SÍ es una lectura fallada y sigue siendo MAL_LEIDO.
  const sinTotalDeVerdad = !util.ok && util.motivo === "SIN_TOTAL" && lectura?.hayTotalImpreso === false;

  if (!util.ok && !sinTotalDeVerdad) {
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

  // Sin total no se corre: la diferencia contra un total que no existe sería el
  // comprobante entero y no significa nada.
  const verificacion = sinTotalDeVerdad
    ? null
    : verificarComprobante({
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
  // ── EL CONTEO CONTRA EL PAPEL ─────────────────────────────────────────
  //
  // Si el modelo se saltea una línea entera, la aritmética de esa línea NUNCA se
  // evalúa: las dos ecuaciones miran las líneas que llegaron, y una que no llegó
  // no rompe ninguna. Las dos pueden cerrar con la factura incompleta.
  //
  // Por eso hace falta un tercer control que no salga de los mismos datos:
  // cuántos renglones dice VER el modelo contra cuántos transcribió.
  const declaradas = Number(lectura.lineasEnElPapel);
  const faltanLineas =
    Number.isFinite(declaradas) && declaradas > lectura.lineas.length
      ? { declaradas, transcriptas: lectura.lineas.length, faltan: declaradas - lectura.lineas.length }
      : null;

  // ── SIN TOTAL NO SE VERIFICA, Y ESO NO ES HABER LEÍDO MAL ────────────
  //
  // Se decide ANTES que `cierra`, porque sin total la diferencia que calcula
  // `verificarComprobante` es el comprobante entero y no significa nada. La
  // coherencia de las líneas —cantidad × unitario = subtotal— SÍ se puede
  // comprobar sin pie, y se informa igual: es lo único verificable acá.
  const sinTotal = sinTotalDeVerdad || !traeTotal(lectura.pie, lectura.hayTotalImpreso);

  const cierra = !sinTotal && verificacion?.cierra === true && coherencia.ok;
  const estado = sinTotal ? ESTADO.SIN_TOTAL : cierra ? ESTADO.CARGADO : ESTADO.MAL_LEIDO;

  if (sinTotal) {
    return {
      cierra: false,
      estado,
      // No propone costos, igual que MAL_LEIDO y por el mismo motivo: sin la
      // ecuación cerrada un número puede estar inventado.
      proponeCostos: false,
      sinTotal: true,
      faltanLineas,
      avisoLineas: faltanLineas ? avisoDeLineasFaltantes(faltanLineas) : null,
      porque: porqueNoTraeTotal(coherencia),
      // NULA, no cero: no hay diferencia que informar. Un cero acá se leería
      // como "cierra perfecto", que es lo contrario de lo que pasa.
      diferenciaCentavos: null,
      lineasIncoherentes: coherencia.incoherentes,
      verificacion: null,
      aGuardar: camposComunes(lectura, receta, recetaVersion, estado, null),
    };
  }

  return {
    cierra,
    estado,
    // La única puerta hacia una propuesta de costo. Si no cierra, no pasa.
    proponeCostos: cierra,
    // SE INFORMA AUNQUE LA CUENTA CIERRE. Ese es el caso que importa: una
    // factura incompleta cuyas dos ecuaciones dan bien igual.
    faltanLineas,
    avisoLineas: faltanLineas ? avisoDeLineasFaltantes(faltanLineas) : null,
    porque: cierra ? null : porqueNoCierra(verificacion, coherencia, faltanLineas),
    diferenciaCentavos: verificacion.diferenciaCentavos,
    lineasIncoherentes: coherencia.incoherentes,
    verificacion,
    aGuardar: camposComunes(lectura, receta, recetaVersion, estado, verificacion),
  };
}

/**
 * El texto de un papel sin total.
 *
 * Dice las tres cosas, en este orden: qué pasó, por qué no se puede verificar, y
 * que no se propone ningún costo. Y deja abierta la otra posibilidad —que el
 * total exista y no se haya leído— porque desde los números NO SE PUEDE
 * distinguir, y hacerle creer a alguien que el papel no lo trae cuando sí lo
 * trae sería el mismo tipo de mentira que este estado vino a sacar.
 */
function porqueNoTraeTotal(coherencia) {
  const base =
    "Este papel no trae total. Sin un total impreso no hay contra qué comparar la suma de " +
    "las líneas, así que la lectura no se puede verificar y no se propone ningún costo desde " +
    "acá. Es lo normal en un remito o en una planilla de pedido. Si el papel SÍ tiene total y " +
    "no se leyó, volvé a leerlo.";

  // La coherencia de las líneas es lo único comprobable sin pie, y cuando falla
  // dice bastante: es la marca de un dígito mal leído en el precio.
  if (!coherencia.ok) {
    const cuales = coherencia.incoherentes
      .map((x) => `la ${x.linea} (${x.cantidad} × $${x.netoUnitario} no da $${x.subtotalImpreso})`)
      .join(", ");
    return (
      `${base} Además, el precio por unidad no coincide con el subtotal impreso en ${cuales}, ` +
      `que es la marca de un dígito mal leído.`
    );
  }
  return base;
}

/** El aviso de que faltan renglones, que se muestra cierre o no cierre. */
function avisoDeLineasFaltantes({ declaradas, transcriptas, faltan }) {
  const plural = faltan === 1 ? "" : "n";
  return (
    `El lector dice ver ${declaradas} renglones en el papel y transcribió ${transcriptas}: ` +
    `falta${plural} ${faltan}. Revisá el detalle contra la foto antes de dar esta lectura por ` +
    `buena, aunque la cuenta cierre.`
  );
}

/**
 * ¿La diferencia parece una línea que falta?
 *
 * UNA DIFERENCIA CHICA Y REDONDA ES SOSPECHA DE LÍNEA FALTANTE antes que de un
 * cargo al pie. Es más probable que falte una línea barata a que el proveedor
 * cobre un importe redondo: los cargos reales —flete, envases— rara vez dan
 * números tan limpios.
 *
 * Salió del comprobante de Mauro: con la receta corregida quedaban 2.000 pesos
 * exactos sobre 3,77 millones, y la explicación cómoda —"algún cargo al pie"—
 * era la menos probable de las dos.
 */
function pareceLineaFaltante(verificacion) {
  const dif = Math.abs(verificacion?.diferenciaCentavos ?? 0);
  const total = Math.abs(verificacion?.totalDeclaradoCentavos ?? 0);
  if (!dif || !total) return false;
  const esChica = dif / total < 0.02;
  const esRedonda = dif % 10000 === 0; // múltiplo de 100 pesos
  return esChica && esRedonda;
}

/** El motivo, nombrando la línea cuando se sabe cuál es. */
function porqueNoCierra(verificacion, coherencia, faltanLineas) {
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
  const sospecha =
    faltanLineas || pareceLineaFaltante(verificacion)
      ? " La diferencia es chica y redonda: antes que un cargo al pie, sospechá de un renglón " +
        "que no se leyó. Contá los del papel contra los de la lista."
      : "";

  return (
    `La cuenta no cierra: ${describirDiferencia(verificacion.diferenciaCentavos)}. ` +
    `Puede ser un dígito mal leído.${sospecha} No se propone ningún costo desde este comprobante.`
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
    // Cuántas dijo VER. Se guarda aunque coincida con las transcriptas: sin el
    // número, "coincidió" y "el lector no lo informó" se ven igual.
    // La conversión ESTRICTA, la misma que usa la normalización. Acá había una
    // propia —`Number.isFinite(Number(v))`— y `Number(null)` es 0, así que "el
    // lector no informó el conteo" se guardaba como CERO renglones en el papel:
    // justo el dato que existe para auditar este control. Cuarta vez que el cero
    // falsy muerde en el módulo, y la primera en la que además corrompía la
    // medición que iba a decidir si el control sirve.
    lineasEnElPapel: num(lectura?.lineasEnElPapel),
    // ── Y CUÁNTAS TRANSCRIBIÓ, EN SU PROPIA COLUMNA ──────────────────────
    //
    // Parece redundante —se pueden contar las filas de `ComprobanteLinea`— y no
    // lo es por dos motivos.
    //
    // Uno: esas filas cambian después. Vincular, excluir o corregir a mano las
    // toca, así que contarlas dentro de seis meses no dice cuántas transcribió
    // el modelo, dice cuántas quedaron.
    //
    // Dos, y es para lo que se agrega: `lineasEnElPapel` es OBLIGATORIO en el
    // esquema y DERIVABLE de `lineas.length`, o sea el único caso que quedó con
    // la forma del agujero del total. Lo único que lo defiende es el prompt, que
    // le pide expresamente que no lo saque de ahí. Guardando los dos números por
    // separado, dentro de veinte facturas se puede mirar si alguna vez
    // difirieron: si NUNCA difieren, el prompt no está funcionando y el control
    // es decorativo. Se sabrá con datos y no discutiendo.
    lineasTranscriptas: Array.isArray(l.lineas) ? l.lineas.length : null,
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
