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
// Con UNA excepción, que dice el papel y no se adivina (Mauro #759): una hoja
// sin total que imprime «Hoja 1» o «1 de 2» anuncia que sigue, y la hoja que
// viene después se le junta aunque ninguna traiga total. Esa factura queda sin
// total, que es lo que es. Ver `encadenadas`.
//
// Módulo puro: sin React, sin Prisma y sin red.

/**
 * Una hoja, tal como se le pregunta a este módulo.
 *
 * `leido` y `tieneTotal` son dos preguntas distintas y las dos hacen falta: una
 * foto sin leer no se sabe si cierra o no, y tratarla como "sin total" la
 * pegaría a la siguiente sin fundamento.
 *
 * `anunciaMas`: la hoja no trae total y el papel dice que sigue —«Hoja 1»,
 * «1 de 2»—. Es lo que separa la primera hoja de una factura sin total de un
 * remito suelto (ver `encadenadas`).
 *
 * @typedef {{ id: number, leido: boolean, tieneTotal: boolean, anulado?: boolean, anunciaMas?: boolean }} Hoja
 */

/**
 * LAS HOJAS SIN TOTAL QUE EL PAPEL DICE QUE VAN JUNTAS (Mauro #759).
 *
 * Una factura de dos hojas donde NINGUNA trae total: la 1 dice «Hoja 1» al pie
 * y la pantalla le dice a quien recibe "sacale foto a la siguiente y
 * agregala" —y le promete que la agrupación la junta—. Con la regla del total
 * sola, esa promesa no se cumplía: sin una hoja con total la corrida no cierra
 * nunca, y la hoja 1 seguía pidiendo la siguiente con la siguiente ya subida.
 *
 * La regla: una hoja que anuncia que sigue se junta con la hoja leída que
 * viene inmediatamente después. Sin anuncio no se junta nada —el remito suelto
 * de `UN REMITO SUELTO NO SE PEGA…` sigue igual—, y juntar no cierra la
 * factura: si después llega la hoja con el total, la regla de siempre la pega
 * al resultado, que sigue siendo una hoja leída sin total.
 *
 * El total de la factura juntada lo decide `lecturaUnida`: el de la hoja que
 * tiene total impreso, y si ninguna lo tiene, ninguno.
 *
 * @param corrida  las hojas (objetos) de una corrida sin cerrar, en orden
 * @returns `[{ destinoId, hojaIds }]`, solo las de dos hojas o más
 */
function encadenadas(corrida) {
  const grupos = [];
  let actual = [];
  for (const h of corrida) {
    actual.push(h.id);
    if (!h.anunciaMas) {
      if (actual.length > 1) grupos.push({ destinoId: actual[0], hojaIds: actual });
      actual = [];
    }
  }
  if (actual.length > 1) grupos.push({ destinoId: actual[0], hojaIds: actual });
  return grupos;
}

/**
 * AGRUPAR LAS FOTOS EN FACTURAS.
 *
 * @param {Hoja[]} hojas en ORDEN DE SUBIDA. El orden es el dato.
 * @returns `{ facturas, abierta, sinLeer, juntas }`
 *   · `juntas`: las hojas sin total que el papel encadena (`encadenadas`), que
 *     se juntan aunque su corrida no haya cerrado. Siguen contadas en `abierta`.
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
  // Las hojas sin total que el papel encadena (`encadenadas`). Se juntan aunque
  // la corrida no haya cerrado.
  const juntas = [];
  let corrida = [];
  let hojasDeLaCorrida = [];

  for (const h of lista) {
    if (!h.leido) {
      // Una hoja sin leer corta: no se sabe si cierra la corrida que viene
      // armándose ni si empieza otra. Lo que va antes queda esperando, y lo que
      // viene después empieza de cero — pegar por encima de un agujero sería
      // adivinar.
      sinLeer.push(h.id);
      juntas.push(...encadenadas(hojasDeLaCorrida));
      corrida = [];
      hojasDeLaCorrida = [];
      continue;
    }

    corrida.push(h.id);
    hojasDeLaCorrida.push(h);

    if (h.tieneTotal) {
      facturas.push({ destinoId: corrida[0], hojaIds: [...corrida] });
      corrida = [];
      hojasDeLaCorrida = [];
    }
  }
  juntas.push(...encadenadas(hojasDeLaCorrida));

  return { facturas, abierta: corrida, sinLeer, juntas };
}

/**
 * LAS HOJAS QUE CIERRAN JUNTAS, AUNQUE NO VENGAN EN ORDEN.
 *
 * ── EL CASO (Mauro #298, 2026-10-26) ──────────────────────────────────────
 *
 * Un catálogo de dos hojas: la 1 (Philips…) con 15 productos y sin total, la 2
 * (Lucky, Camel) con 4 productos y al pie TOTAL $2.026.100, que es el de las
 * DOS. Leída sola, la 2 no cierra —sus productos suman $340.600— y queda
 * MAL_LEIDO, que para `agruparHojas` es un agujero: la corrida se corta ahí y
 * las dos quedan como dos facturas, una "no cierra" y la otra "sin total".
 *
 * La regla: un papel que no cierra solo contra su total impreso prueba sumarse
 * con los papeles del mismo pedido que no tienen total propio. Si así cierra al
 * centavo, son hojas del mismo comprobante. No se le pregunta nada a nadie: lo
 * decide la cuenta, con la misma puerta que juzga cualquier lectura.
 *
 * Se prueban las combinaciones de menos a más hojas, y entre las del mismo
 * tamaño en orden de subida: la primera que cierra gana. Una que cierra con
 * menos hojas es la explicación más chica de la diferencia.
 *
 * @param conTotal   el id del papel con total que no cerró solo
 * @param sinTotal   los ids de los papeles sin total, EN ORDEN DE SUBIDA
 * @param cierran    (ids en orden de subida) → boolean: la puerta sobre la lectura unida
 * @param orden      ids de todos, en orden de subida: el orden de las hojas
 * @returns los ids a fusionar en orden de subida, o null
 */
export function hojasQueCierranJuntas({ conTotal, sinTotal = [], cierran, orden = [] } = {}) {
  const candidatas = (Array.isArray(sinTotal) ? sinTotal : []).slice(0, MAX_HOJAS_A_PROBAR);
  const enOrden = (ids) => [...ids].sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  for (let tamano = 1; tamano <= candidatas.length; tamano++) {
    for (const combinacion of combinaciones(candidatas, tamano)) {
      const ids = enOrden([conTotal, ...combinacion]);
      if (cierran(ids)) return ids;
    }
  }
  return null;
}

/**
 * Hasta cuántas hojas sin total se prueban juntas. Son 2^n combinaciones: con
 * 10 son mil lecturas armadas en memoria, sin llamar a nadie. Un pedido con más
 * de diez papeles sueltos sin total es otra cosa y no se adivina.
 */
const MAX_HOJAS_A_PROBAR = 10;

function* combinaciones(lista, k, desde = 0, prefijo = []) {
  if (prefijo.length === k) {
    yield prefijo;
    return;
  }
  for (let i = desde; i < lista.length; i++) yield* combinaciones(lista, k, i + 1, [...prefijo, lista[i]]);
}

/**
 * LAS FUSIONES QUE HAY QUE HACER DE VERDAD.
 *
 * De `agruparHojas` salen también las facturas de una sola hoja, que ya están
 * bien como están. Esto deja solo las que tienen algo que mover, para que la
 * ruta no escriba en la base sin motivo.
 */
export function fusionesPendientes(hojas) {
  const { facturas, juntas } = agruparHojas(hojas);
  return [...facturas.filter((f) => f.hojaIds.length > 1), ...juntas];
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
  // ── SI NINGUNA HOJA TRAE TOTAL, LA FACTURA NO TIENE TOTAL (Mauro #759) ──
  //
  // El pie de la última hoja se usa igual —sus otros importes son del papel—,
  // pero sin total y con `hayTotalImpreso` en false: el número que una hoja sin
  // total trae en el pie es, a lo sumo, su subtotal, y el subtotal de UNA hoja
  // nunca es el total de la factura juntada.
  const conTotalImpreso = [...lista].reverse().find((l) => l?.hayTotalImpreso === true) || null;
  const conTotal = conTotalImpreso || lista[lista.length - 1];

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
    pie: conTotalImpreso ? conTotal?.pie ?? null : conTotal?.pie ? { ...conTotal.pie, total: null } : null,
    hayTotalImpreso: conTotalImpreso !== null,
    lineasEnElPapel: enElPapel.length ? enElPapel.reduce((a, b) => a + b, 0) : null,
  };
}
