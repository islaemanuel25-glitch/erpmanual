// lib/compras-proveedor/comprobante/lector/lecturaInterpretada.js
//
// EL PAPEL LO INTERPRETA EL MODELO. EL CÓDIGO CONTROLA LA CUENTA.
//
// ── POR QUÉ (Emanuel, 2026-10-10: "seguimos de parche en parche") ─────────
//
// Cada proveedor nuevo rompió una regla de formato escrita para el anterior:
// los netos del pie sumados como cargos (#153), los packs intermedios (#155),
// los kilos de peso variable (#162), Secco con el IVA adentro del precio (#163).
// Y #163 no alcanzó en producción: Flash leyó los diez renglones de Secco BIEN
// —sumaban el total impreso— y el código les sumó un 21 % que no existe porque
// la receta genérica decía "IVA al pie". El modelo grande tampoco cerró: el
// esquema lo obligaba a separar "precio sin impuestos" de "total con IVA" en un
// papel que no discrimina IVA, y puso el número en el casillero equivocado.
//
// El problema no era el modelo: lo obligábamos a contestar dentro de un menú de
// formatos y el costo lo decidían reglas de formato en el código.
//
// ── EL DISEÑO NUEVO ───────────────────────────────────────────────────────
//
// El modelo devuelve el papel YA INTERPRETADO: por renglón, lo que el papel
// dice —código, descripción, cantidad, en qué viene, importe impreso— y el
// COSTO FINAL DEL RENGLÓN, con todo lo que le corresponde según ESE papel
// (IVA, percepciones, internos, bonificaciones, descuentos). Más una
// explicación en criollo de cómo lo leyó, que es la receta del proveedor.
//
// El código controla tres cosas y nada más sobre el formato:
//   · la suma de los costos finales tiene que dar el total impreso, con la
//     tolerancia del redondeo del proveedor —el pie es el juez—;
//   · cada renglón de mercadería trae cantidad y un costo final no negativo;
//   · el conteo de renglones vistos contra transcriptos, como siempre.
// Las reglas de NEGOCIO —macheo, packs, kilos, comparación contra el ERP,
// bonificados, envases— se aplican después sobre el costo final de cada
// renglón y no cambian.
//
// Módulo puro: sin red y sin base.

import { aCentavos, TOLERANCIA_TOTAL_CENTAVOS } from "../impuestos.js";
import { rotuloDelTipo } from "../explicacionPorTipo.js";

/** Qué es cada renglón. Lo dice el modelo mirando el papel. */
export const TIPO_RENGLON = Object.freeze({
  MERCADERIA: "MERCADERIA",
  /** Botellas de cambio, cajones, cargos simbólicos: suman al papel y no son producto. */
  ENVASE: "ENVASE",
  /**
   * Flete, servicio logístico, envío: suma al papel, no es producto, y SU COSTO
   * SE REPARTE entre la mercadería (`cargos.js`). Regla de Emanuel del
   * 2026-10-08: el costo lleva todo lo de la boleta. CCU #257, «300016 Servicio
   * Logístico».
   */
  CARGO: "CARGO",
});

/** El tipo que el modelo dio, o MERCADERIA si dio otra cosa o nada. */
export function tipoDelRenglon(linea) {
  const t = linea?.tipoRenglon ?? linea?.tipo ?? null;
  return t === TIPO_RENGLON.ENVASE || t === TIPO_RENGLON.CARGO ? t : TIPO_RENGLON.MERCADERIA;
}

/**
 * LA TOLERANCIA DEL TOTAL: el redondeo del proveedor, proporcional a los renglones.
 *
 * Cada costo final de renglón llega redondeado al centavo, y el proveedor
 * redondea además los impuestos de su pie sobre la suma: con muchos renglones
 * esos centavos se acumulan. Un centavo por renglón, y nunca menos que la de
 * siempre. El pie sigue siendo el juez: un dígito mal leído mueve pesos, no
 * centavos.
 */
export function toleranciaDelTotalCentavos(renglones) {
  const n = Number(renglones);
  return Math.max(TOLERANCIA_TOTAL_CENTAVOS, Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0);
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * EN UN PAPEL SIN IMPUESTOS, EL COSTO QUE EL LECTOR NO DIO ES EL IMPORTE.
 *
 * ── EL CASO (Mauro #298, 2026-10-26) ──────────────────────────────────────
 *
 * Las dos hojas del catálogo se leyeron bien —cantidad, precio de la unidad e
 * importe de los 19 productos— y el modelo no puso el `costoFinal` de ninguno:
 * el papel no lo imprime, y la instrucción le dice que lo que no está impreso
 * lo deje afuera. Con los 19 costos vacíos la cuenta no se podía hacer, la hoja
 * de Philips quedaba "mal leída" en vez de "sin total", la unión con la de
 * Lucky no se probaba nunca y la escala unidad contra pack no se deducía.
 *
 * Emanuel, sobre el papel: "no tiene impuestos: el importe de cada producto ya
 * es el costo final". Sin nada impreso que sumarle, lo que se paga por el
 * renglón es su importe.
 *
 * ── EL CRITERIO ES SI EL PAPEL TRAE IMPUESTOS, NO SU LETRA ────────────────
 *
 * Hasta el 2026-10-26 valía solo para el papel SIN FACTURA. Pero hay facturas
 * que no discriminan nada —la B, la C, la de consumidor final con IVA incluido;
 * CCU a veces factura así— y con esa regla quedaban con el costo vacío y "no
 * cierra", igual que Mauro. Regla de Emanuel: si el papel no muestra impuestos
 * aparte, ni por producto ni al pie, el importe es el costo final, sea A, B, C
 * o sin factura (`papelSinImpuestosImpresos`). Si los muestra, el costo sigue
 * siendo neto + IVA + percepciones + interno, como siempre.
 *
 * Solo completa lo que FALTA, y solo con un importe mayor que cero: un costo que
 * el modelo dio manda, y un importe en cero es una fila que no se mandó, no un
 * regalo. Si el pie trae algo que no es de ningún renglón —un descuento—, la
 * suma deja de dar el total y la puerta lo dice, como con cualquier lectura.
 * Y si el lector no leyó un IVA que estaba, la suma de los netos no da el total
 * impreso y la puerta tampoco deja pasar nada.
 *
 * @param linea        con `costoFinal` y `subtotalImpreso` (el importe)
 * @param sinImpuestos lo que dice `papelSinImpuestosImpresos` del papel entero
 * @returns el costo a completar, o null si no corresponde
 */
export function costoQueFaltaDelImporte(linea, sinImpuestos) {
  if (sinImpuestos !== true) return null;
  if (num(linea?.costoFinal) !== null) return null;
  const importe = num(linea?.subtotalImpreso);
  return importe !== null && importe > 0 ? importe : null;
}

/**
 * ¿EL PAPEL NO MUESTRA NINGÚN IMPUESTO APARTE? Ni por producto ni al pie.
 *
 * Mira lo que el papel imprime y se leyó: la alícuota de IVA o el interno de
 * cada producto —DYSSA—, y al pie el IVA, el interno, las percepciones y los
 * conceptos que suman —DAS lleva el IVA solo al pie—. Y la pregunta aparte que
 * se le hace al lector, `discriminaImpuestos`: si dijo que sí, el papel los
 * trae aunque no se hayan leído. Un descuento del pie no es un impuesto.
 *
 * Y una sola letra cuenta como prueba: la factura A discrimina el IVA siempre,
 * por ley. Lo guardado no conserva `discriminaImpuestos`, y una A con el IVA mal
 * leído no puede pasar por papel sin impuestos y costear al neto. La B, la C y
 * el papel sin letra se deciden por lo impreso.
 *
 * @param lectura la normalizada o la rearmada de lo guardado
 * @param letra   la del papel; en uno guardado sin cerrar no está en la identidad
 *                y la trae `recetaUsada.tipoComprobante`
 */
export function papelSinImpuestosImpresos(lectura, letra = lectura?.identidad?.tipo) {
  if (lectura?.discriminaImpuestos === true) return false;
  if (String(letra ?? lectura?.identidad?.tipo ?? "").trim().toUpperCase() === "A") return false;
  const positivo = (v) => (num(v) ?? 0) > 0;
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  if (lineas.some((l) => positivo(l?.alicuotaIva) || positivo(l?.internoUnitario))) return false;
  const pie = lectura?.pie ?? {};
  if (positivo(pie.iva) || positivo(pie.interno)) return false;
  if ((pie.percepciones ?? []).some((p) => positivo(p?.importe))) return false;
  if ((pie.conceptos ?? []).some((c) => c?.resta !== true && positivo(c?.importe))) return false;
  return true;
}

/**
 * ¿ESTA FILA ES UNA QUE NO SE MANDÓ? Importe en cero y sin cantidad.
 *
 * El lector las transcribe en su lugar para no correr las de abajo (ver "CADA
 * FILA ES UNA UNIDAD" en las instrucciones), y el sistema las descarta: no son
 * mercadería que llegó. Un renglón bonificado entero no es esto —trae su
 * cantidad—, y se queda.
 */
export function esFilaQueNoSeMando(linea) {
  const importe = num(linea?.subtotalImpreso ?? linea?.importeImpreso);
  const cantidad = num(linea?.cantidad);
  return importe === 0 && !(cantidad > 0);
}

/**
 * LA CUENTA DEL PAPEL: LA SUMA DE LOS COSTOS FINALES CONTRA EL TOTAL IMPRESO.
 *
 * Los envases y los cargos suman: están impresos y el proveedor los cobra. Lo que no hace
 * esta función es decidir nada de formato: no sabe qué es IVA ni qué es
 * percepción, y no le hace falta.
 *
 * @param lectura  la normalizada, con `costoFinal` y `tipo` en cada renglón
 * @returns `{ hayTotal, cierra, sumaCentavos, totalDeclaradoCentavos,
 *            diferenciaCentavos, toleranciaCentavos, invalidos, lineas }`
 */
export function verificarLecturaInterpretada(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const invalidos = [];
  const deCadaUna = lineas.map((l, i) => {
    const tipo = tipoDelRenglon(l);
    const costo = num(l?.costoFinal);
    const cantidad = num(l?.cantidad);
    if (costo === null || costo < 0) {
      invalidos.push({ indice: i, linea: i + 1, nombre: l?.descripcion ?? null, porque: "SIN_COSTO_FINAL" });
    } else if (tipo === TIPO_RENGLON.MERCADERIA && !(cantidad > 0)) {
      invalidos.push({ indice: i, linea: i + 1, nombre: l?.descripcion ?? null, porque: "SIN_CANTIDAD" });
    }
    return { indice: i, tipo, cantidad, costoFinalCentavos: costo === null ? null : aCentavos(costo) };
  });

  const sumaCentavos = deCadaUna.reduce((a, l) => a + (l.costoFinalCentavos ?? 0), 0);
  const total = num(lectura?.pie?.total);
  // CERO CUENTA COMO AUSENTE: medido con la planilla de Mauro, un modelo que no
  // encuentra total pone 0, y un 0 tomado por total haría de la diferencia el
  // comprobante entero. Y el booleano manda sobre el número: si dice que no
  // VE un total impreso, el número no salió del papel.
  const hayTotal = total !== null && total > 0 && lectura?.hayTotalImpreso !== false;
  const totalDeclaradoCentavos = hayTotal ? aCentavos(total) : null;
  const diferenciaCentavos = hayTotal ? sumaCentavos - totalDeclaradoCentavos : null;
  const toleranciaCentavos = toleranciaDelTotalCentavos(lineas.length);
  const cierra =
    hayTotal && lineas.length > 0 && invalidos.length === 0 && Math.abs(diferenciaCentavos) <= toleranciaCentavos;

  return {
    interpretada: true,
    hayTotal,
    cierra,
    sumaCentavos,
    totalDeclaradoCentavos,
    totalCalculadoCentavos: sumaCentavos,
    diferenciaCentavos,
    toleranciaCentavos,
    invalidos,
    lineas: deCadaUna,
  };
}

/**
 * ¿EL LECTOR VIO MÁS PRODUCTOS DE LOS QUE TRANSCRIBIÓ?
 *
 * Es el conteo contra el papel: `lineasEnElPapel` —lo que dice ver— contra lo
 * transcripto. UNA sola pregunta para la puerta, la escalada, el reintento de
 * la lectura y la pantalla de la explicación: eran cuatro comparaciones
 * escritas cada una a su manera.
 *
 * ── CON UN TOTAL IMPRESO QUE CIERRA AL CENTAVO, NO FALTA NADA ─────────────
 *
 * Un producto con importe que no se transcribió deja la suma corta contra el
 * total, así que si cierra, lo que el lector contó de más son productos con
 * importe en cero: no se mandaron y no son esperados. Es el catálogo de Mauro
 * #298 (2026-10-26): la hoja de Lucky trae 4 con importe y el lector contó las
 * 24 filas impresas, y avisaba "transcribió 4" sobre una hoja completa. Sin
 * total —o sin cerrar— no hay con qué saberlo, y el aviso sigue.
 *
 * @returns `{ declaradas, transcriptas, faltan }` o null
 */
export function renglonesQueFaltan(lectura, verificacion = verificarLecturaInterpretada(lectura)) {
  if (verificacion?.hayTotal && verificacion?.cierra) return null;
  const declaradas = Number(lectura?.lineasEnElPapel);
  const transcriptas = Array.isArray(lectura?.lineas) ? lectura.lineas.length : 0;
  if (lectura?.lineasEnElPapel == null || !Number.isFinite(declaradas) || declaradas <= transcriptas) return null;
  return { declaradas, transcriptas, faltan: declaradas - transcriptas };
}

/** Por qué no cierra, dicho como el resto de los carteles. */
export function porqueNoCierraInterpretada(v, { moneda = (x) => `$${x}` } = {}) {
  if (v?.invalidos?.length) {
    const uno = v.invalidos[0];
    const nombre = uno.nombre ? `«${uno.nombre}»` : `número ${uno.linea}`;
    const falta = uno.porque === "SIN_CANTIDAD" ? "la cantidad" : "el costo final";
    const otros = v.invalidos.length > 1 ? ` (y ${v.invalidos.length - 1} más)` : "";
    return `Al producto ${nombre}${otros} le falta ${falta}. No se propone ningún costo desde este comprobante.`;
  }
  return (
    `Los costos de los productos suman ${moneda(v.sumaCentavos / 100)} y el papel dice ` +
    `${moneda(v.totalDeclaradoCentavos / 100)}. No se propone ningún costo desde este comprobante.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE SE LE PIDE AL MODELO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EL ESQUEMA: EL PAPEL INTERPRETADO. El mismo para Flash y para el modelo grande.
 *
 * Ningún campo obliga a separar neto de final: el modelo informa lo que el
 * papel dice y el costo final que resulta. Lo que puede faltar en el papel es
 * opcional —un campo obligatorio es una orden de inventar—; obligatoria es la
 * descripción, que siempre está impresa, y la explicación, que no se deriva de
 * ningún otro dato.
 */
export function esquemaInterpretado() {
  return {
    type: "object",
    properties: {
      identidad: {
        type: "object",
        properties: {
          tipo: { type: "string" },
          puntoVenta: { type: "string" },
          numero: { type: "string" },
          fecha: { type: "string" },
          cuit: { type: "string" },
          // El CAE de la AFIP: único por comprobante, así que defiende contra
          // la misma factura subida dos veces aunque el número no se vea.
          cae: { type: "string" },
        },
      },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            codigoProveedor: { type: "string" },
            descripcion: { type: "string" },
            cantidad: { type: "number" },
            enQueViene: { type: "string" },
            precioImpreso: { type: "number", nullable: true },
            importeImpreso: { type: "number", nullable: true },
            kilos: { type: "number", nullable: true },
            costoFinal: { type: "number" },
            tipo: { type: "string", enum: Object.values(TIPO_RENGLON) },
          },
          required: ["descripcion"],
        },
      },
      pie: { type: "object", properties: { total: { type: "number" } } },
      lineasEnElPapel: { type: "integer" },
      hayTotalImpreso: { type: "boolean" },
      // Si el papel muestra IVA o percepciones como importes aparte. Un sí o un
      // no que no se deriva de ningún otro dato: sin letra leída, es lo único
      // que separa un papel en negro de una factura cuya letra no se vio
      // (`tipoParaLaReceta`, Coca-Cola #259).
      //
      // OPCIONAL a propósito, aunque se pregunte siempre: `respuestaCompleta`
      // trata como cortada a la respuesta que no trae un obligatorio, y perder
      // la lectura entera por una pregunta de clasificación sería peor que el
      // defecto. Sin respuesta, un papel sin letra no recibe receta: es el
      // lado seguro.
      discriminaImpuestos: { type: "boolean" },
      explicacion: { type: "string" },
      // Solo se pregunta cuando el modelo grande lee guiado por la explicación
      // confirmada. OPCIONAL a propósito: sin respuesta se propone como antes.
      explicacionSirve: { type: "boolean" },
    },
    required: ["identidad", "lineas", "pie", "lineasEnElPapel", "hayTotalImpreso", "explicacion"],
  };
}

/** Por qué se llama al modelo grande, dicho para él. */
const POR_QUE_SE_TE_PIDE = Object.freeze({
  FALTAN_RENGLONES: "otro lector transcribió menos renglones de los que dice ver en el papel",
  NO_CIERRA: "con lo que leyó otro lector, los costos de los renglones no suman el total del papel",
  SIN_RECETA:
    "todavía no hay una explicación confirmada de cómo viene este tipo de papel de este proveedor",
  FLASH_SIN_RESPUESTA: "otro lector no terminó de leerlo en el tiempo que tenía",
});

/**
 * LAS INSTRUCCIONES. Leer el papel entero, calcular el costo final de cada
 * renglón y comprobar que la suma dé el total, como lo haría una persona.
 *
 * @param explicacion    la del tipo de este papel, confirmada; o null (la usa el
 *                       modelo grande, que ya sabe de qué tipo es el papel)
 * @param explicaciones  las confirmadas del proveedor, una por tipo:
 *                       `[{ tipoComprobante, explicacion }]` (la usa Flash, que
 *                       todavía no leyó la letra)
 * @param referencia   la lectura de otro lector, si la hay (solo al escalar)
 * @param motivo       por qué se escala, una clave de `ESCALADA`
 */
export function instruccionesInterpretadas({
  explicacion = null,
  explicaciones = null,
  proveedorNombre = null,
  paginas = 1,
  referencia = null,
  motivo = null,
} = {}) {
  const partes = [];
  const texto = String(explicacion ?? "").trim();
  const porTipo = (Array.isArray(explicaciones) ? explicaciones : []).filter((e) => String(e?.explicacion ?? "").trim());
  if (porTipo.length) {
    // ── UNA POR TIPO DE COMPROBANTE (`explicacionPorTipo.js`) ─────────────
    //
    // El mismo proveedor puede mandar una factura A y una B armadas distinto.
    // Van todas, cada una con su tipo, y el modelo usa la del tipo que trae el
    // papel. Si el papel es de un tipo sin explicación, lo lee como está: el
    // código se da cuenta por la letra leída y llama al modelo grande.
    partes.push(
      "Así vienen los papeles de este proveedor, explicados y confirmados por quien recibe la " +
        "mercadería, uno por tipo de comprobante:\n\n" +
        porTipo
          .map((e) => `<<<EXPLICACIÓN ${rotuloDelTipo(e.tipoComprobante)}\n${String(e.explicacion).trim()}\nEXPLICACIÓN>>>`)
          .join("\n\n") +
        "\n\nUsá SOLO la del tipo que trae este papel —mirá la letra del recuadro—. Si el papel es de " +
        "otro tipo, no uses ninguna: leelo como está. Y si este papel en particular dice otra cosa " +
        "que su explicación, manda el papel: leelo como está y decilo en tu explicación."
    );
  } else if (texto) {
    partes.push(
      "Así viene el papel de este proveedor, explicado y confirmado por quien recibe la mercadería:\n\n" +
        `<<<EXPLICACIÓN\n${texto}\nEXPLICACIÓN>>>\n\n` +
        "Usala como guía. Si este papel en particular dice otra cosa, manda el papel: leelo como " +
        "está y decilo en tu explicación."
    );
    // ── ¿LA EXPLICACIÓN CONFIRMADA SIGUE SIRVIENDO? UNA PREGUNTA APARTE ───
    //
    // El caso de Emanuel (2026-10-21): el mismo proveedor y el mismo tipo de
    // papel a veces traen una percepción del 3 % —solo cuando la compra pasa
    // un importe— y a veces no. Un papel sin ella no es un papel armado de otra
    // forma, y no tiene que proponer una receta nueva. Distinguirlo comparando
    // textos es imposible —el grande nunca escribe la misma frase—, así que se
    // pregunta, con un sí o un no que no se puede sacar de ningún otro dato
    // (regla 2 de CLAUDE.md: lo que puede faltar se pregunta aparte).
    partes.push(
      "OTRA PREGUNTA APARTE, mirando el papel y la explicación de arriba: `explicacionSirve` es " +
        "true si esa explicación describe bien cómo está armado ESTE papel, aunque este papel " +
        "traiga o no traiga algún cargo del pie que se cobra solo a veces —por ejemplo una " +
        "percepción que aparece recién a partir de cierto importe—. Es false si este papel está " +
        "armado de otra forma: el precio trae el IVA y la explicación dice que se suma al pie, las " +
        "columnas son otras, la cantidad se cuenta distinto."
    );
  }
  const porque = POR_QUE_SE_TE_PIDE[motivo];
  if (porque) partes.push(`Se te pide porque ${porque}. Lo que vale es lo que ves en el papel.`);
  if (referencia) {
    const { lineas = [], pie = {}, lineasEnElPapel = null, hayTotalImpreso = null } = referencia;
    partes.push(
      "Esto leyó el otro lector. Usalo SOLO COMO REFERENCIA: puede faltar algún renglón o haber " +
        "un número mal leído.\n\n<<<LECTURA\n" +
        JSON.stringify({ lineas, pie, lineasEnElPapel, hayTotalImpreso }) +
        "\nLECTURA>>>"
    );
  }

  partes.push(
    "Sos una persona que conoce las facturas argentinas y tiene que cargar este comprobante de " +
      "compra" +
      (proveedorNombre ? ` del proveedor ${proveedorNombre}` : "") +
      ". Leé el papel ENTERO —renglones, columnas y pie— y decí, por cada renglón, cuánto cuesta " +
      "de verdad lo que se compró."
  );
  if (Number(paginas) > 1) {
    partes.push(
      `Te paso ${paginas} imágenes del MISMO comprobante, en orden. Devolvé un solo resultado con ` +
        "todos los renglones de todas las imágenes y un solo pie. Un renglón cortado entre dos " +
        "fotos es uno solo."
    );
  }
  partes.push(
    "Por cada renglón de mercadería o de envase devolvé:\n" +
      "  codigoProveedor  el código del artículo, si lo trae\n" +
      "  descripcion      el texto del renglón tal como está impreso\n" +
      "  cantidad         la cantidad tal como está impresa\n" +
      "  enQueViene       en qué viene esa cantidad, como lo dice el papel: «unidad», «pack de 6»,\n" +
      "                   «bulto de 24», «kg», o lo que diga\n" +
      "  precioImpreso    el precio unitario tal como está impreso, si lo trae\n" +
      "  importeImpreso   el importe del renglón tal como está impreso, si lo trae\n" +
      "  kilos            si el renglón trae piezas Y además los kilos que pesaron, los kilos\n" +
      "  costoFinal       LO QUE CUESTA EL RENGLÓN ENTERO, con todo lo que le corresponde según\n" +
      "                   ESTE papel: su IVA, su parte de las percepciones y de los impuestos del\n" +
      "                   pie, su impuesto interno, y descontadas sus bonificaciones y su parte de\n" +
      "                   los descuentos. Si el precio ya trae el IVA, no se lo vuelvas a sumar.\n" +
      "                   Lo que el pie cobra para todo el papel se reparte entre los renglones en\n" +
      "                   proporción a su importe. Un renglón regalado, bonificado entero, cuesta 0.\n" +
      "                   Va SOLO lo que está impreso en este papel: un impuesto o una percepción\n" +
      "                   que la explicación nombra pero que este papel no trae, no se suma.\n" +
      "  tipo             MERCADERIA; ENVASE si es un envase, una botella de cambio, un cajón o\n" +
      "                   un cargo simbólico que no es mercadería para vender; CARGO si es un\n" +
      "                   flete, un servicio logístico, un envío o cualquier cargo del proveedor\n" +
      "                   que no es mercadería. Un CARGO lleva su costoFinal como cualquier\n" +
      "                   renglón: NO lo repartas vos entre los demás, el sistema lo reparte."
  );
  // ── CADA FILA ES UNA UNIDAD (Mauro #298, 2026-10-26) ───────────────────
  //
  // El catálogo de Mauro trae filas en $0 —lo que no se mandó— mezcladas con
  // las que sí. Flash y el modelo grande salteaban la fila en $0 y, en el bloque
  // M.CRAFTED, le dejaban su NOMBRE a los números de la fila de abajo: cinco
  // productos con los números del vecino y la suma cerrando igual, porque los
  // importes solo se movieron de lugar. Medido en `LlamadaLector` 95 y 96.
  partes.push(
    "CADA FILA DE LA TABLA ES UNA UNIDAD: el nombre, la cantidad, el precio de la unidad y el " +
      "importe de un renglón salen de LA MISMA FILA impresa, leída de izquierda a derecha. Nunca " +
      "le pongas a un nombre los números de la fila de arriba o de abajo. Devolvé siempre el " +
      "importeImpreso de cada fila, aunque se pueda calcular.\n" +
      "En un catálogo o una planilla, una fila con el importe en cero o vacío NO SE MANDÓ, pero " +
      "transcribila igual EN SU LUGAR, con su descripción, importeImpreso 0 y sin cantidad: es lo " +
      "que mantiene a las filas de abajo con sus propios números. El sistema la descarta."
  );
  partes.push(
    "LA CUENTA: la suma de los costoFinal de todos los renglones tiene que dar el TOTAL impreso del " +
      "papel, al centavo salvo redondeo. Hacé esa cuenta antes de contestar. Si no te da, volvé a " +
      "mirar el papel: un renglón salteado, un número mal leído o algo del pie que no repartiste."
  );
  partes.push(
    "NO son renglones, aunque estén en la tabla con importe: «TRANSPORTE», «VAN», «VIENEN», «SUMA " +
      "Y SIGUE», «SUBTOTAL DE LA HOJA» y cualquier acarreo de una hoja a la siguiente."
  );
  partes.push(
    "Lo que no se lee o no está en el papel, dejalo afuera. No pongas cero ni un valor aproximado " +
      "en lo que es una transcripción: un cero se confunde con un importe real."
  );
  partes.push(
    "En `pie.total` va el total impreso. OTRA TAREA APARTE, MIRANDO EL PAPEL: `hayTotalImpreso` es " +
      "true solo si VES un total impreso. Si es una planilla o un remito sin total, poné false y " +
      "dejá afuera `pie.total`: no lo completes sumando, porque la suma es justamente lo que se " +
      "compara contra él."
  );
  partes.push(
    "Y ANTES de mirar lo que transcribiste, contá cuántos renglones con cantidad tiene impresa la " +
      "tabla —incluidos los que no se leen bien— y ponelo en `lineasEnElPapel`. En un catálogo o " +
      "planilla, las filas con el importe vacío o en cero no se mandaron: transcribilas en su lugar " +
      "como se dijo arriba, pero no las cuentes acá. No lo saques de contar los que devolviste: si " +
      "te salteaste uno, este número tiene que ser mayor."
  );
  partes.push(
    "Por último, `explicacion`: en castellano y en pocas frases, cómo viene armado ESTE papel para " +
      "que otra persona lo cargue igual la próxima vez. Qué columna es qué, si el precio trae el IVA " +
      "o se suma al pie, qué hay en el pie y cómo lo repartiste, si hay bonificaciones, kilos, " +
      "envases. Si un cargo del pie puede no venir siempre —una percepción que depende del " +
      "importe—, decí que se suma cuando viene impreso, no que viene siempre. Es la receta de " +
      "este proveedor: escribila como se la explicarías a una persona."
  );
  partes.push(
    "OTRA PREGUNTA APARTE, MIRANDO EL PAPEL: `discriminaImpuestos` es true si el papel muestra el " +
      "IVA o alguna percepción como un importe aparte —en el pie o en una columna—, y false si no " +
      "muestra ninguno: un remito, un presupuesto o un ticket donde el precio ya es lo que se paga."
  );
  partes.push(
    "En `identidad`: el tipo es la LETRA del comprobante (A, B, C, M) tal como está impresa en el " +
      "recuadro; si el papel no es una factura con letra —un remito, una planilla—, dejalo afuera. " +
      "Una factura que discrimina IVA o percepciones TIENE letra: buscala en el recuadro del medio, " +
      "arriba, antes de dejarla afuera. " +
      "El punto de venta y el número salen SOLO del número de comprobante, el que el papel rotula " +
      "como «Nro.», «Comprobante», «Factura N°» o similar: nunca del CUIT, del número de Ingresos " +
      "Brutos (IIBB), del código o número de cliente, del CAE, de un número de pedido ni de ningún " +
      "otro número del encabezado. Si el número de comprobante no está a la vista, dejá afuera el " +
      "punto de venta y el número: no los deduzcas. La fecha en formato AAAA-MM-DD, el CUIT solo si " +
      "se lee con claridad, y el CAE (los 14 dígitos que el papel rotula como CAE o C.A.E.) si está " +
      "impreso."
  );
  return partes.join("\n\n");
}
