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
        // SIN OBLIGATORIOS. Un remito o una planilla no tienen tipo, ni punto de
        // venta, ni número, ni fecha. Medido sobre la planilla real: los cuatro
        // vuelven en null, porque NO SE PUEDEN DERIVAR de nada que esté en el
        // papel — y esa es justo la diferencia con el total, que sí se deriva
        // sumando y por eso el modelo lo completaba. Exigirlos igual es presión
        // sin ninguna ganancia: el día que un papel dé pie a una fecha plausible
        // —un sello, otra fecha impresa cerca— la va a poner.
      },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: propiedadesLinea,
          // ── `subtotalImpreso` NO ES OBLIGATORIO, Y ES EL MISMO AGUJERO ───
          //
          // Se deriva: cantidad × netoUnitario. Si el papel no imprime un
          // importe por renglón y el esquema lo exige, el modelo lo calcula — y
          // entonces `verificarCoherenciaDeLineas` compara ese producto contra
          // sí mismo y da bien SIEMPRE.
          //
          // Esa es LA SEGUNDA ECUACIÓN, la que atrapa el 82 % de las lecturas
          // mal hechas. Y lo peor: la función YA sabe que sin subtotal impreso
          // no hay nada que comparar, y lo saltea. Tenía la defensa escrita y el
          // esquema la hacía inalcanzable, exactamente como pasaba con el total.
          //
          // `cantidad` y `netoUnitario` salen por lo mismo: cada uno se despeja
          // de los otros dos. Lo que queda obligatorio es la descripción, que no
          // se deriva de nada y siempre está impresa.
          required: ["descripcion"],
        },
      },
      // ── `neto` y `total` NO SON OBLIGATORIOS, Y ESO ES EL ARREGLO ──────
      //
      // Lo eran, y era el agujero más grande del módulo. Un remito o una
      // planilla no traen pie, pero el esquema exigía el campo igual: obligado a
      // poner un número donde no hay ninguno, el modelo pone el más plausible, y
      // el más plausible es LA SUMA DE LAS LÍNEAS.
      //
      // Con eso, la verificación se vuelve una tautología: la suma de las líneas
      // comparada contra la suma de las líneas cierra siempre, con cero de
      // diferencia. El candado central del módulo quedaba desactivado
      // exactamente en los papeles donde más falta hace, y encima el comprobante
      // salía CARGADO y habilitado para proponer costos.
      //
      // MEDIDO el 2026-08-12 sobre la planilla de Mauro, que no tiene renglón de
      // total —comprobado mirando la foto—: tres corridas seguidas devolvieron
      // 3.774.700, que es exactamente la suma de sus 21 líneas, y las tres
      // cerraron con diferencia cero.
      pie: { type: "object", properties: propiedadesPie },
      // El conteo va al MISMO nivel que las líneas, no adentro de ellas: es una
      // observación sobre el papel, no un dato de la lista.
      lineasEnElPapel: { type: "integer" },
      // Y esta es la MISMA IDEA que el conteo: una observación sobre el papel,
      // preguntada aparte. Un booleano no se puede calcular sumando, así que
      // sobrevive a que el modelo tenga ganas de completar el número.
      hayTotalImpreso: { type: "boolean" },
    },
    required: ["identidad", "lineas", "pie", "lineasEnElPapel", "hayTotalImpreso"],
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
    "EL IMPORTE POR RENGLÓN: si el papel imprime un importe al lado de cada producto, " +
      "transcribilo en `subtotalImpreso`. Si NO lo imprime, dejá el campo afuera. No lo " +
      "completes multiplicando cantidad por precio.\n\n" +
      "El motivo es el mismo que el del total: el sistema multiplica cantidad por precio y " +
      "compara el resultado contra el importe impreso, para detectar un precio mal leído. Si le " +
      "devolvés la multiplicación en lugar del impreso, compara un número contra sí mismo y la " +
      "comprobación deja de existir. Lo mismo con `cantidad` y `netoUnitario`: cada uno se " +
      "despeja de los otros dos, y ninguno se despeja: se transcriben o se dejan afuera."
  );

  partes.push(
    "OTRA TAREA APARTE, y contestala MIRANDO EL PAPEL, no lo que transcribiste: ¿el comprobante " +
      "tiene impreso un renglón de TOTAL? Poné `hayTotalImpreso` en true solo si VES un total " +
      "impreso en el papel. Si es una planilla, una lista de precios o un remito que termina con " +
      "el último producto y no tiene ningún renglón de total, poné false.\n\n" +
      "Y si `hayTotalImpreso` es false, DEJÁ AFUERA los campos `total` y `neto` del pie. No los " +
      "completes sumando las líneas. La suma la hace el sistema, y la calcula para COMPARARLA " +
      "contra el total impreso: si le devolvés la suma como si fuera el total, la comparación da " +
      "bien siempre y deja de servir para lo único que existe, que es detectar un número mal " +
      "leído. Un campo vacío es un dato correcto; un número inventado, no."
  );

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
