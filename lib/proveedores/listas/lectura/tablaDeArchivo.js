// lib/proveedores/listas/lectura/tablaDeArchivo.js
//
// DE FRAGMENTOS CON POSICIÓN A UNA TABLA CON COLUMNAS.
//
// ── CADA FRAGMENTO ES UNA CELDA, Y NO SE CORTA POR HUECOS ───────────────────
//
// La primera versión partía cada renglón en celdas cortando donde el hueco
// horizontal superaba un umbral sacado de la mediana de los huecos. Se cayó con
// la lista de bebidas: en una tabla de números casi todos los huecos SON huecos
// entre columnas, así que la mediana no mide el hueco de adentro de una celda
// —mide el de afuera— y el umbral quedaba tan alto que las nueve columnas se
// fusionaban en dos.
//
// Lo que se descubrió mirando las cuatro listas reales es que no hace falta
// cortar nada: pdfjs YA entrega cada celda como un fragmento. "LIVRA MANZANA 500
// c.c" viene entero, y "AGUA BAGGIO VIDA MANZANA 6 X 1500" también. Lo único que
// llega partido es el signo de moneda.
//
// Así que las celdas son los fragmentos, y las columnas salen de agrupar sus X a
// lo largo de TODO el documento. Si algún archivo trajera una celda partida en
// dos fragmentos, los dos caerían en la misma columna por estar cerca, y se
// vuelven a unir al armar el valor: el resultado es el mismo sin necesidad de un
// umbral que adivinar.
//
// ── LAS COLUMNAS SALEN DE LOS DATOS, NO DEL ENCABEZADO ──────────────────────
//
// Tomar las X del encabezado como anclas también se cayó con la lista de
// bebidas, que lo tiene EN DOS RENGLONES: "NETO C/DESC" arriba y "9,5%" abajo.
// Con las anclas de un solo renglón, esa columna no existía y sus valores se
// repartían entre las dos vecinas — dos columnas de precio contaminadas.
//
// El encabezado se usa DESPUÉS y solo para ponerle nombre a cada columna
// encontrada: un nombre mal puesto molesta, una columna mal armada miente.
//
// ── EL "$" SUELTO ───────────────────────────────────────────────────────────
//
// Tres de las cuatro listas imprimen el signo de moneda como un fragmento aparte,
// tan lejos de su número como lo está la columna siguiente. Sin tratarlo, cada
// columna de precio genera además una columna fantasma de puros "$".
//
// Módulo puro: sin BD, sin Next, sin pdfjs.

import { renglonesPorY, normalizarTitulo, anchoDePieza } from "./filasDeTexto.js";
import { pareceTituloDeColumna } from "./deteccionDeColumnas.js";

/**
 * Cuánto se pueden correr dos celdas de la misma columna.
 *
 * Doce puntos. Medido sobre las cuatro listas: una columna de precios alineada a
 * la derecha arranca hasta seis puntos más a la izquierda cuando el número tiene
 * un dígito más —"1.430,19" contra "749,45"—, y la separación entre dos columnas
 * vecinas nunca baja de veinte. Doce deja pasar lo primero y no lo segundo.
 */
const TOLERANCIA_X = 12;

/** Lo que es un signo de moneda y nada más. */
const SOLO_MONEDA = /^(?:\$|us\$|u\$s|€)$/i;

/**
 * Pega los fragmentos que son solo un signo de moneda al siguiente.
 *
 * Devuelve la X y el ancho del CONJUNTO: la columna es donde empieza el signo,
 * porque es lo que el ojo ve como borde izquierdo de la celda.
 */
function pegarMoneda(piezas = []) {
  const salida = [];
  for (let i = 0; i < piezas.length; i++) {
    const p = piezas[i];
    const sig = piezas[i + 1];
    if (sig && SOLO_MONEDA.test(p.texto.trim())) {
      salida.push({
        x: p.x,
        texto: `${p.texto.trim()} ${sig.texto.trim()}`,
        ancho: sig.x - p.x + anchoDePieza(sig),
      });
      i++;
      continue;
    }
    salida.push(p);
  }
  return salida;
}

/**
 * Agrupa las X de todas las celdas en columnas.
 *
 * Cada columna sale con su FRANJA —desde dónde hasta dónde caen sus celdas— y no
 * solo con un punto. La franja es lo que después permite repartir bien una celda
 * suelta: ver `columnaDe`.
 *
 * El `ancla` es la MEDIANA del grupo y no el promedio: un solo título largo
 * corrido a la izquierda no tiene que mover la columna entera.
 *
 * @returns [{ ancla, desde, hasta }] de izquierda a derecha
 */
export function columnasDeX(filas = []) {
  const puntos = [];
  for (let f = 0; f < filas.length; f++) for (const c of filas[f].celdas) puntos.push({ x: c.x, fila: f });
  if (puntos.length === 0) return [];
  puntos.sort((a, b) => a.x - b.x);

  let grupos = [];
  let actual = [puntos[0]];
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].x - actual[actual.length - 1].x <= TOLERANCIA_X) actual.push(puntos[i]);
    else {
      grupos.push(actual);
      actual = [puntos[i]];
    }
  }
  grupos.push(actual);

  grupos = grupos.flatMap(partirSiChocan);

  // ── CUÁNTAS CELDAS HACEN FALTA PARA QUE UN GRUPO SEA UNA COLUMNA ─────────
  //
  // Tres, o el uno por ciento de las filas, lo que sea más.
  //
  // El piso de tres es para los archivos chicos. El uno por ciento es por lo que
  // pasó en la lista de M Y F: tres descripciones largas llegan partidas en dos
  // fragmentos —"FRA HUG CLASSIC G REG 12X8 2024" y un "0" cinco puntos más a la
  // derecha— y los tres "0" caen casi en la misma X. Con el piso de tres solo,
  // eso era una columna: tres celdas sobre novecientas cincuenta y cuatro filas.
  //
  // El uno por ciento sale medido y no elegido: en las cuatro listas reales la
  // columna de verdad menos poblada es la de descuento de esa misma lista, con el
  // 36 % de las filas, y el ruido más poblado es ese 0,3 %. Entre las dos
  // poblaciones hay dos órdenes de magnitud y el corte va en el medio.
  //
  // NO se puede subir a un 5 %: una columna de impuesto interno que solo aplica a
  // un rubro es una columna real y puede tener menos que eso.
  const minimo = Math.max(3, Math.ceil(filas.length * 0.01));
  return grupos
    .filter((g) => g.length >= minimo)
    .map((g) => ({ ancla: g[Math.floor(g.length / 2)].x, desde: g[0].x, hasta: g[g.length - 1].x }));
}

/**
 * UNA COLUMNA NO PUEDE TENER DOS CELDAS DE LA MISMA FILA.
 *
 * Es la única regla que se verifica sola: si dos celdas del mismo renglón cayeron
 * en el mismo grupo, el grupo son dos columnas y no una, sin importar qué diga la
 * distancia. Se parte por el hueco más grande de adentro y se vuelve a preguntar.
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 *
 * La lista de bebidas imprime en el margen izquierdo, en ocho de sus cincuenta y
 * seis filas, la marca del rubro —"LIVRA", "SODA", "RF"— once puntos a la
 * izquierda del código. Once es menos que la tolerancia, así que el marcador y el
 * código caían en la misma columna y el código del producto quedaba leído como
 * "LIVRA 532". Con ese código ninguna de esas ocho filas se vincula con el
 * producto del catálogo, y el defecto no se ve: la fila aparece completa.
 *
 * Bajar la tolerancia no era la salida —una columna de precios alineada a la
 * derecha se corre hasta nueve puntos y once es apenas más—, y elegir un número
 * entre nueve y once habría sido adivinar. El choque de dos celdas en un renglón
 * no se adivina: o pasa o no pasa.
 */
function partirSiChocan(grupo) {
  const filas = new Set();
  let choca = false;
  for (const p of grupo) {
    if (filas.has(p.fila)) { choca = true; break; }
    filas.add(p.fila);
  }
  if (!choca) return [grupo];

  let corte = -1;
  let hueco = 0;
  for (let i = 1; i < grupo.length; i++) {
    const d = grupo[i].x - grupo[i - 1].x;
    if (d > hueco) { hueco = d; corte = i; }
  }
  // Todas las X iguales: no hay por dónde partir, y partir igual sería inventar
  // una columna. Se deja como está y el choque se ve en el valor.
  if (corte <= 0) return [grupo];
  return [...partirSiChocan(grupo.slice(0, corte)), ...partirSiChocan(grupo.slice(corte))];
}

/**
 * A qué columna pertenece una celda.
 *
 * ── POR QUÉ NO ES "LA ANCLA MÁS CERCANA" ────────────────────────────────────
 *
 * Porque entre dos columnas puede haber mucho blanco, y en el medio de ese blanco
 * la más cercana es la de la derecha aunque la celda sea de la de la izquierda.
 * En la lista de M Y F la descripción arranca en la X 41 y el descuento en la
 * 221; el pedacito "18 X 200 CC" que continúa una descripción cae en la 122 y por
 * cercanía se iba a la columna de descuento, que quedaba con "18 X 200 CC -10,0".
 *
 * La regla es la del papel: una celda se escribe DESDE donde arranca su columna
 * hacia la derecha. Así que primero se busca una franja que la contenga —con la
 * tolerancia, para que el título alineado a la izquierda alcance a su columna de
 * números alineada a la derecha— y si no hay ninguna, la celda es de la última
 * columna que arranca a su izquierda.
 */
function columnaDe(x, columnas) {
  let dentro = -1;
  let dist = Infinity;
  for (let i = 0; i < columnas.length; i++) {
    const c = columnas[i];
    if (x < c.desde - TOLERANCIA_X || x > c.hasta + TOLERANCIA_X) continue;
    const d = Math.min(Math.abs(c.desde - x), Math.abs(c.hasta - x));
    if (d < dist) {
      dist = d;
      dentro = i;
    }
  }
  if (dentro >= 0) return dentro;

  let izquierda = -1;
  for (let i = 0; i < columnas.length; i++) if (columnas[i].desde <= x) izquierda = i;
  return izquierda >= 0 ? izquierda : 0;
}

/**
 * La tabla de un archivo: filas de celdas indexadas por columna, con títulos.
 *
 * @param paginas [{ ancho, alto, fragmentos: [{x, y, texto, ancho}] }]
 * @returns {
 *   titulos: [],
 *   filas: [{ pagina, y, bloque, valores: [] }],
 *   filasDescartadas: [{ pagina, y, texto, motivo }],
 *   anclas: []
 * }
 */
export function tablaDeFragmentos(paginas = []) {
  // ── 1. Renglones de cada página, repartidos por bloque de columnas ───────
  const crudas = [];
  for (let n = 0; n < paginas.length; n++) {
    const renglones = desdeElEncabezado(renglonesPorY(paginas[n].fragmentos ?? []));
    const bloques = bloquesDeLaPagina(renglones);

    for (const r of renglones) {
      for (let b = 0; b < bloques.length; b++) {
        const piezas = pegarMoneda(
          r.piezas.filter((p) => p.x >= bloques[b].desde && p.x < bloques[b].hasta)
        );
        if (piezas.length === 0) continue;
        // ── LAS X SE MIDEN RELATIVAS AL PRIMER TÍTULO DEL BLOQUE ──────────
        //
        // En una hoja a dos columnas, la columna del código del bloque derecho
        // tiene que caer en la MISMA columna lógica que la del izquierdo.
        //
        // El origen es la X del primer título de cada bloque y no el borde del
        // bloque. Con el borde, el bloque derecho quedaba corrido veintipico de
        // puntos —el borde está cuatro puntos antes del título— y las dos mitades
        // no se superponían: la lista de M Y F daba cinco columnas con "Articulo"
        // repetido en dos, en vez de las cuatro que tiene.
        const origen = Number.isFinite(bloques[b].origen) ? bloques[b].origen : 0;
        crudas.push({
          pagina: n + 1,
          y: r.y,
          bloque: b,
          celdas: piezas.map((p) => ({ x: p.x - origen, texto: p.texto.trim() })),
        });
      }
    }
  }

  // ── 2. Las columnas, de dónde caen LOS DATOS ─────────────────────────────
  //
  // Dos clases de renglón quedan AFUERA del cálculo, y las dos por el mismo
  // motivo: no dicen dónde está una columna.
  //
  // LOS ENCABEZADOS, porque sus títulos están alineados a la izquierda y los
  // datos indentados. En la lista de M Y F "Código" arranca en la X 25 y sus
  // códigos en la 40: metiéndolos salían dos columnas donde hay una, y el título
  // se posaba sobre la fantasma dejando a la de verdad sin nombre.
  //
  // LOS RENGLONES DE UNA SOLA CELDA, porque una celda sola no está alineada con
  // nada: puede ser una columna o puede ser un título de rubro suelto, y desde
  // adentro del renglón no hay forma de saberlo. En la misma lista hay 79 títulos
  // de rubro, todos en la misma X, así que ningún mínimo de apariciones los
  // distingue de una columna real — lo que los distingue es que están solos.
  const deDatos = crudas.filter((f) => f.celdas.length >= 2 && !celdasDeEncabezado(f.celdas));
  const columnas = columnasDeX(deDatos.length >= 3 ? deDatos : crudas);
  if (columnas.length === 0) {
    return { titulos: [], filas: [], filasDescartadas: [], anclas: [] };
  }

  // ── 3. Cada fila, repartida en columnas ──────────────────────────────────
  const conValores = crudas.map((f) => {
    const valores = new Array(columnas.length).fill("");
    for (const c of f.celdas) {
      const i = columnaDe(c.x, columnas);
      valores[i] = valores[i] ? `${valores[i]} ${c.texto}` : c.texto;
    }
    return { pagina: f.pagina, y: f.y, bloque: f.bloque, valores, celdas: f.celdas.length };
  });

  // ── 4. Los títulos, de los renglones que parezcan encabezado ─────────────
  //
  // Se recorren TODOS y no solo el primero, porque hay encabezados de dos
  // renglones: el de la lista de bebidas dice "NETO C/DESC" arriba y "9,5%"
  // abajo, en la misma columna. Cada renglón aporta el nombre de las columnas
  // que el anterior dejó vacías.
  //
  // UN RENGLÓN DE UNA SOLA CELDA TAMBIÉN PUEDE SER ENCABEZADO, pero solo ANTES DE
  // LA PRIMERA FILA DE DATOS. Las dos cosas son necesarias: sin la primera, el
  // "NETO C/DESC" de la lista de bebidas —que está solo en su renglón— deja su
  // columna sin nombre; sin la segunda, cualquier título de rubro que se parezca
  // a un nombre de columna, como "ARTICULOS DE LIMPIEZA", se posaría sobre una
  // columna a mitad del archivo.
  const titulos = new Array(columnas.length).fill("");
  let hayDatos = false;
  for (const f of conValores) {
    const llenas = f.valores.filter((v) => String(v).trim() !== "").length;
    const encabezado = pareceRenglonDeEncabezado(f)
      || (!hayDatos && llenas === 1 && f.valores.some((v) => pareceTituloDeColumna(v)));
    if (!encabezado) {
      if (llenas > 1) hayDatos = true;
      continue;
    }
    for (let i = 0; i < titulos.length; i++) {
      if (!titulos[i] && f.valores[i]) titulos[i] = f.valores[i];
    }
  }

  // ── 5. Qué es una fila de datos y qué no ─────────────────────────────────
  //
  // Se descarta lo que NO tiene la forma de una fila: los encabezados repetidos
  // en cada página, los títulos de rubro o marca —que ocupan una sola celda— y
  // los pies de página. Cada descarte se guarda con su motivo: un archivo del que
  // se descartaron cuatrocientas filas sin decir por qué es un archivo que se
  // leyó mal, y sin el motivo nadie se entera.
  const filas = [];
  const filasDescartadas = [];
  for (const f of conValores) {
    const llenas = f.valores.filter((v) => String(v).trim() !== "").length;
    const texto = f.valores.filter(Boolean).join(" | ").slice(0, 120);

    if (llenas <= 1) {
      filasDescartadas.push({ pagina: f.pagina, y: f.y, texto, motivo: "TITULO_O_SUELTA" });
      continue;
    }
    if (pareceRenglonDeEncabezado(f)) {
      filasDescartadas.push({ pagina: f.pagina, y: f.y, texto, motivo: "ENCABEZADO" });
      continue;
    }
    filas.push({ pagina: f.pagina, y: f.y, bloque: f.bloque, valores: f.valores });
  }

  return { titulos, filas, filasDescartadas, anclas: columnas.map((c) => c.ancla) };
}

/** ¿Este renglón es encabezado y no datos? Sobre los valores ya en columnas. */
function pareceRenglonDeEncabezado(f) {
  const llenas = f.valores.filter((v) => String(v).trim() !== "").length;
  if (llenas < 2) return false;
  const titulos = f.valores.filter((v) => pareceTituloDeColumna(v)).length;
  return titulos >= 2 && titulos >= llenas / 2;
}

/**
 * Lo mismo, pero sobre las celdas CRUDAS.
 *
 * Hace falta antes de tener columnas: las columnas se calculan sin los
 * encabezados, y para sacarlos hay que reconocerlos primero. Es la misma regla
 * escrita sobre la otra forma del dato, no otra regla.
 */
function celdasDeEncabezado(celdas = []) {
  if (celdas.length < 2) return false;
  const titulos = celdas.filter((c) => pareceTituloDeColumna(c.texto)).length;
  return titulos >= 2 && titulos >= celdas.length / 2;
}

/**
 * Los renglones de una página DESDE SU ENCABEZADO, tirando el membrete.
 *
 * ── POR QUÉ NO ALCANZA CON DESCARTAR ESAS FILAS DESPUÉS ─────────────────────
 *
 * Porque antes de descartarlas ya hicieron daño: sus celdas entran en el cálculo
 * de las columnas. La lista de M Y F imprime arriba de cada hoja el nombre de la
 * empresa, la fecha, el día de la semana y el número de página. "DOMINGO" cae
 * justo en el hueco que separa la columna de descuento de la de precio, y con
 * seis apariciones —una por hoja— alcanza para que las dos se peguen en una sola
 * columna: los descuentos y los precios terminaban mezclados en la misma celda.
 *
 * El corte es por dónde empieza la tabla, que es su encabezado. Lo que está
 * arriba del encabezado no es de la tabla, sea lo que sea.
 *
 * ── LO QUE SÍ SE SALVA DE ARRIBA DEL ENCABEZADO ─────────────────────────────
 *
 * Un renglón cuyas celdas son TODAS nombres de columna. Hay encabezados de dos
 * pisos: la lista de bebidas escribe "NETO C/DESC" un renglón más arriba que el
 * resto y "9,5%" un renglón más abajo, y las tres líneas son el mismo encabezado.
 * Cortando parejo, esa columna se quedaba sin nombre.
 *
 * Los tres renglones de membrete de la lista de M Y F no pasan esa prueba: en
 * cada uno hay un número de página, una fecha o un día de la semana, que no es el
 * nombre de ninguna columna.
 *
 * Si una página no tiene encabezado —las hay que lo imprimen solo en la primera—
 * no se corta nada: la página entra entera, como antes.
 */
function desdeElEncabezado(renglones) {
  let corte = -1;
  let mejor = 0;
  for (let i = 0; i < renglones.length; i++) {
    const piezas = pegarMoneda(renglones[i].piezas);
    if (!celdasDeEncabezado(piezas)) continue;
    const titulos = piezas.filter((p) => pareceTituloDeColumna(p.texto)).length;
    if (titulos > mejor) {
      mejor = titulos;
      corte = i;
    }
  }
  if (corte <= 0) return renglones;
  const arriba = renglones
    .slice(0, corte)
    .filter((r) => r.piezas.every((p) => pareceTituloDeColumna(p.texto)));
  return [...arriba, ...renglones.slice(corte)];
}

/**
 * Los bloques de columnas de una página.
 *
 * Detecta el caso de DOS TABLAS POR HOJA mirando si la secuencia de títulos se
 * repite a lo largo de la X. Con una sola tabla devuelve un bloque y nada cambia.
 *
 * No se resuelve partiendo la hoja al medio: eso sería un número mágico y
 * fallaría con tres columnas o con una tabla corrida. Se resuelve mirando el
 * encabezado, que es lo que de verdad dice dónde empieza cada tabla.
 */
function bloquesDeLaPagina(renglones) {
  const UNICO = [{ desde: -Infinity, hasta: Infinity, origen: 0 }];

  let mejor = null;
  for (const r of renglones) {
    const piezas = pegarMoneda(r.piezas);
    const titulos = piezas.filter((p) => pareceTituloDeColumna(p.texto));
    if (titulos.length >= 4 && (!mejor || titulos.length > mejor.length)) mejor = titulos;
  }
  if (!mejor) return UNICO;

  const nombres = mejor.map((p) => normalizarTitulo(p.texto));
  const primero = nombres[0];
  const arranques = [];
  for (let i = 0; i < nombres.length; i++) if (nombres[i] === primero) arranques.push(i);
  if (arranques.length < 2) return UNICO;

  // Cada repetición tiene que tener el mismo largo: dos tablas iguales al lado.
  // Si los largos no coinciden, lo que se repitió es una palabra suelta y partir
  // la página por ahí destrozaría las filas.
  const largos = arranques.map((a, i) => (i + 1 < arranques.length ? arranques[i + 1] : nombres.length) - a);
  if (new Set(largos).size !== 1 || largos[0] < 2) return UNICO;

  return arranques.map((a, i) => ({
    desde: i === 0 ? -Infinity : mejor[a].x - 4,
    hasta: i + 1 < arranques.length ? mejor[arranques[i + 1]].x - 4 : Infinity,
    // La X del primer título del bloque: es lo que alinea una mitad con la otra.
    origen: mejor[a].x,
  }));
}
