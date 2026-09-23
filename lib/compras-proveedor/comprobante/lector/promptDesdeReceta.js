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

import { papelTieneInterno } from "../internoDelRenglon.js";
import { normalizarReceta } from "../impuestos.js";

/**
 * El esquema de la salida, en la forma que entiende la API de Google.
 *
 * Se arma DESDE la receta: los campos que ese proveedor no tiene, no están en el
 * esquema, así que el modelo no tiene dónde ponerlos.
 */
export function esquemaDeSalida(recetaCruda) {
  const receta = normalizarReceta(recetaCruda);
  // ── EL INTERNO SE ACTIVA DESDE EL ENTENDIMIENTO DEL PAPEL ────────────
  //
  // Antes esto era `receta.tieneImpuestoInterno` a secas, o sea una casilla. Un
  // proveedor sin receta guardada caía en el default —false— y el campo no
  // entraba al esquema, así que el modelo no lo devolvía y el control no lo
  // sumaba, aunque la explicación de Emanuel dijera con todas las letras que el
  // papel trae una columna de impuesto interno. Es lo que dejó a TDC sin cerrar
  // por $10.890,56.
  const conInterno = papelTieneInterno({ receta });

  const propiedadesLinea = {
    descripcion: { type: "string" },
    codigoProveedor: { type: "string" },
    cantidad: { type: "number" },
    netoUnitario: { type: "number" },
    subtotalImpreso: { type: "number" },
    // ── LOS DOS QUE FALTABAN, Y POR QUÉ ESTÁN SIEMPRE ───────────────────
    //
    // `peso`: cuando el renglón lo trae, el precio es POR KILO y la cantidad
    // son piezas. Sin leerlo, el costo real de ese renglón no se puede
    // calcular —y el fiambre quedaba afuera de la ganancia por eso mismo—.
    //
    // `bonificacion`: el descuento impreso. NO se aplica a nada, porque el
    // subtotal ya lo tiene adentro; sirve para el control por renglón, que es
    // lo que señala un número mal leído.
    //
    // Van en el esquema SIEMPRE y no según la receta: qué columnas trae cada
    // papel es justamente lo que la explicación cuenta, y un campo que no
    // existe en el esquema no tiene dónde volver. Vacío es la respuesta
    // correcta cuando el papel no los trae.
    peso: { type: "number", nullable: true },
    bonificacion: { type: "number", nullable: true },
  };
  // El interno por línea SOLO existe si el proveedor lo factura.
  //
  // Se llama `internoImpreso` y no `internoUnitario` porque eso es lo que se le
  // pide: el número TAL COMO ESTÁ, sin dividir. DYSSA lo imprime por unidad y
  // TDC por renglón; la escala la mide el código contra el interno del pie, que
  // solo cierra de una forma. Pedirle al modelo que normalice es pedirle un
  // número que no está en el papel, que es el agujero del campo derivable.
  //
  // `totalImpreso` viaja con él porque es la otra columna que aparece en los
  // papeles con interno: el importe final del renglón, ya con IVA adentro. Es
  // de donde sale el costo cuando está impreso, y `nullable` porque la mayoría
  // de los papeles no la traen.
  if (conInterno) {
    propiedadesLinea.internoImpreso = { type: "number" };
    propiedadesLinea.totalImpreso = { type: "number", nullable: true };
  }

  const propiedadesPie = {
    neto: { type: "number" },
    iva: { type: "number" },
    total: { type: "number" },
  };
  if (conInterno) propiedadesPie.interno = { type: "number" };

  // ── TODOS LOS CONCEPTOS DEL PIE, SIEMPRE, SIN DEPENDER DE LA RECETA ────
  //
  // Acá había un `if (receta.percepciones.length)`: el esquema pedía las
  // percepciones SOLO si alguien las había cargado a mano en la receta
  // estructurada. La de Arcor las tiene vacías —y su explicación en castellano
  // las nombra, "PERC. IVA 5329 y PER. IIBB"—, así que **al modelo nunca se le
  // preguntó por ellas**. No las inventó ni las leyó mal: no tenía dónde
  // ponerlas.
  //
  // Medido sobre el comprobante 17 del pedido 245: neto leído $412.877,64, IVA
  // $86.704,30, percepciones NULL y total $511.968,28. Los $12.386,34 que
  // faltaban son exactamente la percepción impresa.
  //
  // Es el primo del caso del total obligatorio que está en CLAUDE.md, y va al
  // revés: allá un campo que se podía derivar era una orden de inventar; acá un
  // campo que no se pide es una garantía de perder un dato que está impreso.
  //
  // Lista libre: nombre tal cual y su importe. No hay enum de conceptos porque
  // no hay forma de conocerlos todos —IVA 10,5, percepción de IVA, percepción
  // de IIBB de cada provincia, internos, impuesto al débito— y un enum haría
  // que el que falta se caiga en silencio o entre con el nombre equivocado.
  propiedadesPie.conceptos = {
    type: "array",
    items: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        importe: { type: "number" },
        /** true si RESTA del subtotal —un descuento—; false o ausente, suma. */
        resta: { type: "boolean", nullable: true },
      },
      required: ["nombre", "importe"],
    },
  };

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

  // ── LA EXPLICACIÓN DEL PROVEEDOR VA PRIMERA, Y TEXTUAL ─────────────────
  //
  // Es lo que Emanuel escribió sobre ESTE papel: qué columna es la cantidad, si
  // hay descuento, si el precio es por kilo. Va antes que nada porque es el
  // contexto con el que hay que leer todo lo demás, y va TAL CUAL —sin
  // reescribirla ni traducirla a reglas— porque lo que se probó que funciona es
  // exactamente eso: el texto de una persona.
  //
  // MEDIDO con el papel de Paty (`sonda-explicacion-papel.mjs`, cd05b779): con
  // cuatro frases, 11 de 11 renglones bien interpretados y tres corridas
  // idénticas. Sin ella, el mismo papel salía MAL_LEIDO.
  const explicacion = String(recetaCruda?.explicacion ?? "").trim();
  if (explicacion) {
    partes.push(
      `El que recibe la mercadería explicó cómo se lee este papel:\n\n${explicacion}`
    );
  }

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
  // ── QUÉ ES CADA CAMPO, IGUAL PARA TODOS LOS PROVEEDORES ───────────────
  //
  // Lo único que cambia entre proveedores es la explicación de arriba. Esto es
  // el contrato de la salida, y sale tal cual de la sonda que lo probó.
  partes.push(
    "Por cada renglón de mercadería devolvé:\n" +
      "  descripcion     el texto del renglón tal como está impreso\n" +
      "  codigoProveedor el código del artículo, si lo trae\n" +
      "  cantidad        el número de la columna de cantidad\n" +
      "  peso            los kilos de ese renglón si el papel los trae; si no, vacío\n" +
      "  netoUnitario    el precio unitario impreso, sin impuestos\n" +
      "  bonificacion    el descuento del renglón en porcentaje. Si el renglón NO tiene\n" +
      "                  descuento, poné 0. Dejalo vacío SOLO si hay una columna de\n" +
      "                  descuento y ese renglón no se llega a leer\n" +
      "  subtotalImpreso el importe impreso al final del renglón\n\n" +
      "El subtotal impreso YA tiene el descuento aplicado: no se lo vuelvas a aplicar y no lo " +
      "recalcules.\n\n" +
      "CERO Y VACÍO NO SON LO MISMO en la bonificación. Un cero dice «este renglón no tiene " +
      "descuento» y con eso se comprueba la cuenta del renglón. Un vacío dice «no lo pude leer» " +
      "y entonces ese renglón no se comprueba, para no acusarlo con un dato inventado."
  );

  // ── LA EXPLICACIÓN DICE QUÉ SIGNIFICA CADA COLUMNA. NO APAGA NINGUNA ────
  //
  // MEDIDO el 2026-09-21 contra el papel de Paty. La explicación de Emanuel
  // dice "Columna 5 no nos interesa / Columna 6 no nos interesa" —son el precio
  // unitario y la bonificación— y el modelo entendió que no tenía que
  // transcribirlas. El resultado fue peor que eso: devolvió UN renglón de once,
  // con `cantidad`, `peso` y `bonificacion` todos vacíos, y dijo ver 11.
  //
  // "No nos interesa" es verdad para quien recibe la mercadería —no va a mirar
  // el precio de lista— y es falso para el sistema: el control por renglón
  // rehace (kilos o cantidad) × precio × (1 − bonificación) contra el subtotal,
  // y ésa es la única cuenta que encuentra un dígito mal leído. Sin el precio y
  // sin la bonificación no hay control, y un papel mal leído entra como bueno.
  //
  // Por eso esto va DESPUÉS de la explicación: lo último que se lee es que la
  // explicación no manda sobre qué se transcribe. Y no se le pide a nadie que
  // escriba la explicación de otra manera — se explica como se le explica a una
  // persona, que es todo el punto del circuito.
  partes.push(
    "IMPORTANTE, y esto manda sobre la explicación de arriba: TRANSCRIBÍ TODAS las columnas " +
      "impresas de TODOS los renglones, aunque la explicación diga que alguna columna no " +
      "interesa o no se usa. Esa explicación dice qué SIGNIFICA cada columna, no cuáles hay que " +
      "copiar.\n\n" +
      "En particular, el precio unitario y la bonificación se transcriben SIEMPRE que estén " +
      "impresos, aunque no interesen: con ellos se comprueba que el renglón esté bien leído " +
      "—cantidad por precio menos el descuento tiene que dar el subtotal— y sin ellos un número " +
      "mal leído pasa sin que nadie lo vea.\n\n" +
      "Y devolvé TODOS los renglones de mercadería del papel, no una muestra."
  );

  // ── LO QUE PARECE UN RENGLÓN Y NO LO ES ────────────────────────────────
  //
  // Una factura de varias hojas arrastra el acumulado de una hoja a la
  // siguiente, y esas líneas están impresas EN LA MISMA TABLA que la
  // mercadería, con importe y todo. Transcriptas como productos hacen dos
  // daños a la vez: inventan un renglón que no es mercadería —y que después
  // hay que vincular a algún producto— y le suman al subtotal un importe que
  // ya estaba contado, así que la verificación contra el total no cierra por
  // un motivo que no existe.
  //
  // Con una sola hoja no aparecen. Con cuatro o cinco aparecen en todas menos
  // en la primera, que es justo el caso que esta tanda vino a resolver.
  partes.push(
    "NO son renglones de mercadería, y NO van en `lineas`, aunque estén impresos dentro de la " +
      "misma tabla y tengan importe: «TRANSPORTE», «VAN», «VIENEN», «SUMA Y SIGUE», «TRANSPORTE " +
      "ANTERIOR», «SUBTOTAL DE LA HOJA», «SUBTOTAL PÁGINA» y cualquier acarreo de una hoja a la " +
      "siguiente. Son el acumulado de la hoja anterior, no mercadería, y si los copiás el " +
      "importe queda contado dos veces.\n\n" +
      "Tampoco los cuentes en `lineasEnElPapel`: ese número es de renglones de MERCADERÍA."
  );

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

  if (papelTieneInterno({ receta })) {
    partes.push(
      "Este proveedor factura IMPUESTO INTERNO por línea. Transcribilo en `internoImpreso` " +
        "EXACTAMENTE COMO ESTÁ IMPRESO en el renglón: no lo dividas por la cantidad ni lo " +
        "multipliques. Algunos papeles lo imprimen por unidad y otros por el renglón entero; " +
        "en los dos casos va el número tal cual se lee. Si una línea no tiene interno, poné 0.\n\n" +
        "Y transcribí igual el IMP. INT. del pie, que es contra el que se comprueba: si la " +
        "suma no da, el problema se ve; si vos lo ajustás, no se ve nunca.\n\n" +
        "Si el papel imprime además el IMPORTE FINAL de cada renglón —la columna que ya tiene " +
        "el IVA y el impuesto interno adentro, la última del renglón— transcribila en " +
        "`totalImpreso`. Si no la imprime, dejá el campo afuera: NO la calcules."
    );
  } else {
    partes.push("Este proveedor NO tiene impuesto interno. No busques ni informes ese campo.");
  }

  // ── LA INSTRUCCIÓN DEL PIE ES FIJA, NO DEPENDE DE LA EXPLICACIÓN ──────
  partes.push(
    "EL PIE DEL PAPEL SE TRANSCRIBE ENTERO. Entre el subtotal y el total suele haber " +
      "varios conceptos —IVA (uno por alícuota si vienen separados), percepción de IVA, " +
      "percepción o retención de IIBB, impuestos internos, descuentos, redondeos—. " +
      "Devolvé TODOS en `pie.conceptos`, cada uno con su nombre TAL CUAL está impreso y su " +
      "importe. Si alguno RESTA del subtotal —un descuento, una bonificación general— " +
      "marcalo con `resta: true`. No inventes ninguno: solo los que están impresos. Y no " +
      "omitas ninguno aunque no sepas qué es: el nombre impreso alcanza."
  );

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
