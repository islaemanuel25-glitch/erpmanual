// lib/compras-proveedor/comprobante/lector/promptDesdeReceta.js
//
// LA RECETA DEL PROVEEDOR GUÍA QUÉ BUSCAR.
//
// No es lo mismo pedirle a DYSSA que a DAS, y pedirles lo mismo a los dos es
// como se producen los campos inventados:
//
//   · DYSSA trae el IVA POR LÍNEA y además impuesto interno por línea. Si no se
//     pide el interno, se pierde un dato que existe; si se pide un IVA por línea
//     a un comprobante que no lo tiene, el modelo lo inventa para completar el
//     campo — que es exactamente lo que hay que evitar.
//
//   · DAS trae el IVA SOLO AL PIE y no tiene interno. Pedirle interno por línea
//     es ofrecerle un casillero vacío para llenar.
//
// Un campo que no corresponde no se pide. Es la misma idea que el esquema de
// salida estructurada: cuanto menos lugar haya para poner un número que no
// existe, menos números que no existen aparecen.
//
// El prompt se arma acá, con la receta, y es puro: se puede ejercer sin llamar a
// ningún servicio.

import { normalizarReceta } from "../impuestos.js";

/**
 * El esquema de la salida, en la forma que entiende la API de Google.
 *
 * Se arma DESDE la receta: los campos que ese proveedor no tiene, no están en el
 * esquema, así que el modelo no tiene dónde ponerlos.
 */
export function esquemaDeSalida(recetaCruda) {
  const receta = normalizarReceta(recetaCruda);

  const propiedadesLinea = {
    descripcion: { type: "string" },
    codigoProveedor: { type: "string" },
    cantidad: { type: "number" },
    netoUnitario: { type: "number" },
    subtotalImpreso: { type: "number" },
  };
  // El interno por línea SOLO existe si el proveedor lo factura.
  if (receta.tieneImpuestoInterno) {
    propiedadesLinea.internoUnitario = { type: "number" };
  }

  const propiedadesPie = {
    neto: { type: "number" },
    iva: { type: "number" },
    total: { type: "number" },
  };
  if (receta.tieneImpuestoInterno) propiedadesPie.interno = { type: "number" };
  if (receta.percepciones.length) {
    propiedadesPie.percepciones = {
      type: "array",
      items: {
        type: "object",
        properties: { nombre: { type: "string" }, importe: { type: "number" } },
        required: ["nombre", "importe"],
      },
    };
  }

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
        required: ["tipo", "puntoVenta", "numero", "fecha"],
      },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: propiedadesLinea,
          required: ["descripcion", "cantidad", "netoUnitario", "subtotalImpreso"],
        },
      },
      pie: { type: "object", properties: propiedadesPie, required: ["neto", "total"] },
      // El conteo va al MISMO nivel que las líneas, no adentro de ellas: es una
      // observación sobre el papel, no un dato de la lista.
      lineasEnElPapel: { type: "integer" },
    },
    required: ["identidad", "lineas", "pie", "lineasEnElPapel"],
  };
}

/**
 * Las instrucciones, también armadas desde la receta.
 *
 * Dos reglas que valen para todos y que salen de errores conocidos:
 *
 *  1. TRANSCRIBIR, NO CALCULAR. Si un número está impreso, va el impreso. El
 *     modelo no tiene que completar un subtotal multiplicando: si lo hace, la
 *     segunda ecuación de la puerta —cantidad × unitario contra el subtotal—
 *     deja de ser independiente y el candado pierde el 82 % de su alcance, que
 *     es lo que se midió el 2026-08-11.
 *
 *  2. LO QUE NO SE LEE VA VACÍO, NUNCA EN CERO. Un cero se suma y desplaza el
 *     total; un campo ausente se ve.
 */
export function instruccionesDesdeReceta(recetaCruda, { proveedorNombre = null, paginas = 1 } = {}) {
  const receta = normalizarReceta(recetaCruda);
  const partes = [];

  partes.push(
    "Sos un transcriptor de comprobantes de compra argentinos. Tu trabajo es COPIAR los " +
      "números tal como están impresos en el papel. No calcules, no completes, no corrijas."
  );
  if (proveedorNombre) partes.push(`El comprobante es del proveedor ${proveedorNombre}.`);

  // ── VARIAS FOTOS SON UN SOLO PAPEL ─────────────────────────────────────
  //
  // Sin esto, el modelo puede tratar cada imagen como un comprobante aparte y
  // devolver el pie de la segunda como si fuera de otra factura. Es el caso de
  // DAS: encabezado en una foto, totales en la otra.
  if (Number(paginas) > 1) {
    partes.push(
      `Te paso ${paginas} imágenes. NO son ${paginas} comprobantes: son ${paginas} FOTOS DEL MISMO ` +
        "comprobante, en orden. Una factura larga se fotografía por partes — las líneas suelen " +
        "estar en las primeras y los totales al pie en la última.\n\n" +
        "Devolvé UN SOLO resultado con TODAS las líneas de TODAS las imágenes, en el orden en que " +
        "aparecen, y UN SOLO pie con los totales, que están impresos una sola vez. Si una línea " +
        "aparece cortada entre dos fotos, es la misma línea: no la repitas."
    );
  }

  partes.push(
    "REGLA MÁS IMPORTANTE: si un número está impreso, transcribí EXACTAMENTE el impreso. " +
      "Nunca reemplaces un subtotal impreso por el resultado de multiplicar cantidad por " +
      "precio, aunque no coincidan. Si no coinciden, transcribí igual lo que está impreso: " +
      "esa diferencia es un dato y hay quien la revisa."
  );
  partes.push(
    "Si un dato no se lee o no está en el comprobante, dejá el campo afuera. NO pongas cero " +
      "ni un valor aproximado: un cero se confunde con un importe real."
  );

  // ── Lo específico del proveedor ────────────────────────────────────────
  if (receta.ivaPorLinea) {
    partes.push(
      `Este proveedor discrimina el IVA POR LÍNEA, con alícuota ${receta.alicuotaIvaPct} %. ` +
        "Aun así, en `netoUnitario` va el precio unitario SIN IVA, y en `subtotalImpreso` el " +
        "subtotal de la línea SIN IVA, que es como están impresos."
    );
  } else {
    partes.push(
      `Este proveedor NO discrimina IVA por línea: lo trae solo al pie, con alícuota ` +
        `${receta.alicuotaIvaPct} %. Las líneas van sin IVA. No agregues un campo de IVA por línea.`
    );
  }

  if (receta.tieneImpuestoInterno) {
    partes.push(
      "Este proveedor factura IMPUESTO INTERNO por línea. Transcribilo en `internoUnitario` " +
        "por unidad. Si una línea no tiene interno, dejá el campo afuera."
    );
  } else {
    partes.push("Este proveedor NO tiene impuesto interno. No busques ni informes ese campo.");
  }

  if (receta.percepciones.length) {
    const nombres = receta.percepciones.map((p) => p.nombre).join(", ");
    partes.push(
      `Al pie puede haber percepciones (${nombres}). Transcribí cada una con su nombre y su ` +
        "importe, tal como figuran. Si alguna no está en este comprobante, no la informes."
    );
  } else {
    partes.push("Este proveedor no suele traer percepciones. Si el papel trae alguna, informala igual.");
  }

  partes.push(
    "En `identidad` va el tipo (A, B, C…), el punto de venta, el número y la fecha en formato " +
      "AAAA-MM-DD. El CUIT solo si está impreso y se lee con claridad."
  );

  // ── EL CONTEO, COMO PREGUNTA APARTE ────────────────────────────────────
  //
  // Va al final y planteado como otra tarea, no como un campo más. Si saliera de
  // contar lo que ya transcribió, coincidiría siempre consigo mismo y no
  // controlaría nada: el punto es que detecte los renglones que NO pudo leer.
  partes.push(
    "TAREA APARTE, y hacela ANTES de mirar lo que transcribiste: contá cuántos RENGLONES CON " +
      "CANTIDAD tiene impresa la tabla de detalle, de la primera línea de mercadería hasta la " +
      "última. Contá los que estén borrosos o cortados si se ve que tienen cantidad. No cuentes " +
      "encabezados, subtotales ni el pie.\n\n" +
      "NO CUENTES los renglones que estén con la cantidad vacía, en blanco o en cero, aunque " +
      "tengan nombre de producto y precio. En una planilla de pedido o en una lista de precios " +
      "esos son productos OFRECIDOS que no se pidieron, y no son mercadería de este " +
      "comprobante.\n\n" +
      "Ese número va en `lineasEnElPapel`. NO lo saques de contar los elementos que pusiste en " +
      "`lineas`: si los dos números coinciden siempre, este control no sirve para nada. Si te " +
      "salteaste un renglón que tenía cantidad porque no se leía, `lineasEnElPapel` tiene que ser " +
      "MAYOR que la cantidad de elementos de `lineas`, y está bien que así sea."
  );

  return partes.join("\n\n");
}
