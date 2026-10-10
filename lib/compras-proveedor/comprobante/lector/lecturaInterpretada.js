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

/** Qué es cada renglón. Lo dice el modelo mirando el papel. */
export const TIPO_RENGLON = Object.freeze({
  MERCADERIA: "MERCADERIA",
  /** Botellas de cambio, cajones, cargos simbólicos: suman al papel y no son producto. */
  ENVASE: "ENVASE",
});

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
 * LA CUENTA DEL PAPEL: LA SUMA DE LOS COSTOS FINALES CONTRA EL TOTAL IMPRESO.
 *
 * Los envases suman: están impresos y el proveedor los cobra. Lo que no hace
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
    const tipo = l?.tipo === TIPO_RENGLON.ENVASE ? TIPO_RENGLON.ENVASE : TIPO_RENGLON.MERCADERIA;
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
  const hayTotal = total !== null && lectura?.hayTotalImpreso !== false;
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

/** Por qué no cierra, dicho como el resto de los carteles. */
export function porqueNoCierraInterpretada(v, { moneda = (x) => `$${x}` } = {}) {
  if (v?.invalidos?.length) {
    const uno = v.invalidos[0];
    const nombre = uno.nombre ? `«${uno.nombre}»` : `el renglón ${uno.linea}`;
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
      explicacion: { type: "string" },
    },
    required: ["identidad", "lineas", "pie", "lineasEnElPapel", "hayTotalImpreso", "explicacion"],
  };
}

/** Por qué se llama al modelo grande, dicho para él. */
const POR_QUE_SE_TE_PIDE = Object.freeze({
  FALTAN_RENGLONES: "otro lector transcribió menos renglones de los que dice ver en el papel",
  NO_CIERRA: "con lo que leyó otro lector, los costos de los renglones no suman el total del papel",
  SIN_RECETA: "es un proveedor del que todavía no hay una explicación confirmada de cómo viene su papel",
  FLASH_SIN_RESPUESTA: "otro lector no terminó de leerlo en el tiempo que tenía",
});

/**
 * LAS INSTRUCCIONES. Leer el papel entero, calcular el costo final de cada
 * renglón y comprobar que la suma dé el total, como lo haría una persona.
 *
 * @param explicacion  la del proveedor, confirmada; o null
 * @param referencia   la lectura de otro lector, si la hay (solo al escalar)
 * @param motivo       por qué se escala, una clave de `ESCALADA`
 */
export function instruccionesInterpretadas({
  explicacion = null,
  proveedorNombre = null,
  paginas = 1,
  referencia = null,
  motivo = null,
} = {}) {
  const partes = [];
  const texto = String(explicacion ?? "").trim();
  if (texto) {
    partes.push(
      "Así viene el papel de este proveedor, explicado y confirmado por quien recibe la mercadería:\n\n" +
        `<<<EXPLICACIÓN\n${texto}\nEXPLICACIÓN>>>\n\n` +
        "Usala como guía. Si este papel en particular dice otra cosa, manda el papel: leelo como " +
        "está y decilo en tu explicación."
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
      "  tipo             MERCADERIA, o ENVASE si es un envase, una botella de cambio, un cajón o\n" +
      "                   un cargo simbólico que no es mercadería para vender"
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
      "tabla —incluidos los que no se leen bien— y ponelo en `lineasEnElPapel`. No lo saques de " +
      "contar los que devolviste: si te salteaste uno, este número tiene que ser mayor."
  );
  partes.push(
    "Por último, `explicacion`: en castellano y en pocas frases, cómo viene armado ESTE papel para " +
      "que otra persona lo cargue igual la próxima vez. Qué columna es qué, si el precio trae el IVA " +
      "o se suma al pie, qué hay en el pie y cómo lo repartiste, si hay bonificaciones, kilos, " +
      "envases. Es la receta de este proveedor: escribila como se la explicarías a una persona."
  );
  partes.push(
    "En `identidad`: el tipo (A, B, C…), el punto de venta, el número y la fecha en formato " +
      "AAAA-MM-DD, y el CUIT solo si se lee con claridad."
  );
  return partes.join("\n\n");
}
