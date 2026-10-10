// QUÉ FOTOS SON HOJAS DE LA MISMA FACTURA. SIN PREGUNTARLE NADA A NADIE.
//
// ── EL CASO REAL ───────────────────────────────────────────────────────────
//
// Un pedido de Arcor de 50 productos llega con cuatro o cinco facturas, y cada
// una puede tener dos o tres hojas. El que recibe saca doce fotos seguidas y no
// tiene por qué acordarse de cuál era la segunda hoja de cuál.
//
// Hasta hoy se le preguntaba al subir: «¿es una factura nueva o una hoja de la
// anterior?». Esa pregunta tiene dos problemas y el segundo es el grave:
//
//   · con doce fotos hay que contestarla once veces, en el mostrador y con el
//     proveedor esperando;
//   · SE PUEDE CONTESTAR MAL, y una respuesta equivocada arma una factura que
//     no existe. Tanto, que hubo que construirle una salida de emergencia
//     —`/comprobantes/unir`— para deshacerla.
//
// ── LO QUE DECIDE ES EL PAPEL, NO LA PERSONA ───────────────────────────────
//
// Una factura TERMINA donde está impreso su total. Esa es la regla entera:
//
//   · foto con total al pie  → cierra la factura que venía armándose;
//   · foto sin total         → es una hoja intermedia y espera a la siguiente.
//
// Es un dato del papel, no una opinión, y el lector ya lo contesta: el campo
// `hayTotalImpreso` se pregunta APARTE del total justamente para que no se
// pueda derivar sumando —el motivo largo está en CLAUDE.md, regla 2—. Acá se
// usa ese sí o no.
//
// ── POR QUÉ LA AGRUPACIÓN VIENE DESPUÉS DE LEER, Y NO ANTES ────────────────
//
// Porque antes de leer no hay forma de saberlo. Cada foto se sube como su
// propio comprobante, se lee sola, y recién con el resultado en la mano se sabe
// dónde termina cada factura. El orden de subida es el orden de las hojas: es
// lo que el que saca las fotos hace naturalmente, y es lo único que se le pide.
//
// ── QUÉ PASA CON LA ÚLTIMA, SI NO TIENE TOTAL ──────────────────────────────
//
// Nada, y eso es deliberado. Una corrida de hojas sin total que no llegó a
// ninguna con total es una factura INCOMPLETA: puede que falte fotografiar la
// última hoja. No se fusiona —fusionarla afirmaría que está entera— y queda a
// la vista como lo que es, esperando la hoja que la cierre.
//
// Y hay un caso que NO es ése y conviene no confundir: un remito no trae total
// nunca. Un remito suelto es una sola foto sin total, no una hoja intermedia, y
// se distingue porque nunca aparece una hoja siguiente. Por eso una corrida
// abierta no se rompe ni se marca mal: se deja quieta.
//
// Módulo puro: sin React, sin Prisma y sin red.

/**
 * Una hoja, tal como se le pregunta a este módulo.
 *
 * `leido` y `tieneTotal` son dos preguntas distintas y las dos hacen falta: una
 * foto sin leer no se sabe si cierra o no, y tratarla como "sin total" la
 * pegaría a la siguiente sin fundamento.
 *
 * @typedef {{ id: number, leido: boolean, tieneTotal: boolean, anulado?: boolean }} Hoja
 */

/**
 * AGRUPAR LAS FOTOS EN FACTURAS.
 *
 * @param {Hoja[]} hojas en ORDEN DE SUBIDA. El orden es el dato.
 * @returns `{ facturas, abierta, sinLeer }`
 *   · `facturas`: `[{ destinoId, hojaIds }]`, una por cada corrida cerrada por
 *     una hoja con total. `destinoId` es la PRIMERA hoja de la corrida —la que
 *     sobrevive a la fusión— y `hojaIds` van en orden de página.
 *   · `abierta`: los ids de la corrida final que todavía no cerró, o `[]`.
 *   · `sinLeer`: las que todavía no se leyeron. Cortan la agrupación: mientras
 *     haya una sin leer en el medio, lo que sigue no se puede decidir.
 *
 * Una factura de UNA SOLA hoja también sale en la lista, con `hojaIds` de un
 * solo elemento. Quien aplica el resultado no tiene que fusionar nada ahí, pero
 * el número de facturas tiene que contarla: es una factura.
 */
export function agruparHojas(hojas) {
  const lista = (Array.isArray(hojas) ? hojas : []).filter((h) => h && !h.anulado);

  const facturas = [];
  const sinLeer = [];
  let corrida = [];

  for (const h of lista) {
    if (!h.leido) {
      // Una hoja sin leer corta: no se sabe si cierra la corrida que viene
      // armándose ni si empieza otra. Lo que va antes queda esperando, y lo que
      // viene después empieza de cero — pegar por encima de un agujero sería
      // adivinar.
      sinLeer.push(h.id);
      corrida = [];
      continue;
    }

    corrida.push(h.id);

    if (h.tieneTotal) {
      facturas.push({ destinoId: corrida[0], hojaIds: [...corrida] });
      corrida = [];
    }
  }

  return { facturas, abierta: corrida, sinLeer };
}

/**
 * LAS FUSIONES QUE HAY QUE HACER DE VERDAD.
 *
 * De `agruparHojas` salen también las facturas de una sola hoja, que ya están
 * bien como están. Esto deja solo las que tienen algo que mover, para que la
 * ruta no escriba en la base sin motivo.
 */
export function fusionesPendientes(hojas) {
  return agruparHojas(hojas).facturas.filter((f) => f.hojaIds.length > 1);
}

/**
 * LA LECTURA DE UNA FACTURA ENTERA, ARMADA CON LA DE CADA HOJA.
 *
 * ── POR QUÉ NO SE VUELVE A LEER ────────────────────────────────────────────
 *
 * Porque no hace falta y porque cuesta. Cada hoja se leyó ENTERA y sola: sus
 * renglones son sus renglones, no medio renglón de nada. Mandar las tres hojas
 * juntas de nuevo gastaría otra consulta de IA de las veinte que hay por día
 * para obtener lo que ya está.
 *
 * Es la diferencia con `/comprobantes/unir`, que sí relee: allá se juntan
 * papeles que se leyeron por separado SIN saber que eran el mismo, y sus
 * identidades y sus pies se contradicen entre sí. Acá el orden es el contrario
 * —primero se lee cada hoja, después se decide que son una— y lo leído sirve.
 *
 * ── DE DÓNDE SALE CADA COSA ────────────────────────────────────────────────
 *
 * · Los RENGLONES: todos, en orden de hoja y de renglón dentro de la hoja.
 * · El PIE: el de la hoja que trae el total, entero. Los importes del pie están
 *   impresos UNA sola vez, en la última hoja, y sumar los pies de las hojas
 *   intermedias —que suelen traer un acumulado parcial— contaría dos veces.
 * · La IDENTIDAD: la primera que esté completa. El número de factura está
 *   impreso en todas las hojas, pero si una salió mal leída, otra lo tiene.
 * · `lineasEnElPapel`: la SUMA. Es un conteo de renglones y cada hoja contó los
 *   suyos; es el control contra el que se compara cuántos se transcribieron.
 *
 * @param lecturas en orden de hoja, cada una como la devuelve el lector o
 *                 `lecturaDesdeLoGuardado`.
 */
export function lecturaUnida(lecturas) {
  const lista = (Array.isArray(lecturas) ? lecturas : []).filter(Boolean);
  if (!lista.length) return null;
  if (lista.length === 1) return lista[0];

  // La que trae el total manda sobre el pie. Es la última en el caso normal,
  // pero se busca por el dato y no por la posición: una hoja de más al final
  // —la foto del sello, el remito adjunto— no puede robarle el pie a la buena.
  const conTotal = [...lista].reverse().find((l) => l?.hayTotalImpreso === true) || lista[lista.length - 1];

  const identidad = {};
  // El CAE también: suele estar impreso solo en la última hoja, y es lo que
  // ataja el papel subido dos veces cuando el número no está a la vista.
  for (const clave of ["tipo", "puntoVenta", "numero", "fecha", "cuit", "cae"]) {
    for (const l of lista) {
      const v = l?.identidad?.[clave];
      if (v !== null && v !== undefined && v !== "") {
        identidad[clave] = v;
        break;
      }
    }
    if (!(clave in identidad)) identidad[clave] = null;
  }

  const enElPapel = lista
    .map((l) => Number(l?.lineasEnElPapel))
    .filter((n) => Number.isFinite(n));

  return {
    ...conTotal,
    identidad,
    lineas: lista.flatMap((l) => (Array.isArray(l?.lineas) ? l.lineas : [])),
    pie: conTotal?.pie ?? null,
    hayTotalImpreso: conTotal?.hayTotalImpreso ?? false,
    lineasEnElPapel: enElPapel.length ? enElPapel.reduce((a, b) => a + b, 0) : null,
  };
}
