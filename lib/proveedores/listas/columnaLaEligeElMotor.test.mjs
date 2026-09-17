// LA COLUMNA DE PRECIO LA ELIGE EL MOTOR, NO EL NOMBRE DE LA COLUMNA.
//
// ── EL DEFECTO, CON SUS NÚMEROS ────────────────────────────────────────────
//
// Un archivo con las dos columnas de Arcor —S/IVA y C/IVA— se leyó con la de SIN
// IVA. El motor había medido las dos y sabía que la de sin IVA explicaba 1 de
// cada 9 productos y la de con IVA explicaba 4; no eligió ninguna, porque
// ninguna llega a los dos tercios que pide `MAYORIA_MINIMA`, y quería preguntar.
//
// La pregunta no se hizo. La pantalla "¿Leí bien la lista?" PROPONE una columna
// —la primera de las candidatas, ordenadas por lo que su título parece— y mandaba
// esa propuesta al servidor por el mismo campo que una elección de la persona.
// Una elección manual le gana al motor, así que apretar "Está bien, seguir" —el
// botón obvio, el único que avanza— se tragaba la pregunta.
//
// Lo que se escribió: ARCOR ARVEJAS 350G, que costaba $742,30, quedó en $858,86.
// El precio correcto de esa fila era $1.039,22: se escribió un 17 % abajo. Y no
// se vio, porque $858,86 contra $742,30 da +15,7 %, que cae limpio adentro del
// rango esperado de 10 a 20 % — así que la fila salió LISTO_PARA_ACTUALIZAR y se
// aplicó sin una sola advertencia.
//
// Esa es la forma del daño y por eso el candado existe: la columna equivocada no
// produce un disparate visible, produce un aumento plausible.
//
// ── POR QUÉ NINGÚN CANDADO LO ATRAPÓ ANTES ─────────────────────────────────
//
// Por tres razones que se acumulan, y ninguna es que faltara cobertura del
// motor. `decisionDeLista` tenía —y tiene— sus candados, y están bien: miden que
// con dos columnas el motor puntúe cada una y elija la que explica más. Todos
// pasaban, y todos siguen pasando. El defecto no estaba en lo que medían.
//
//   1. **El defecto vivía ENTRE dos piezas.** El motor decidía bien y la
//      pantalla proponía bien; lo que estaba mal era que la propuesta llegara
//      por el mismo campo que una decisión. Ningún candado del motor podía verlo
//      —el motor nunca era consultado— y ningún candado de la pantalla tampoco
//      —la pantalla mandaba lo que tenía que mandar—. Es el caso que el
//      CLAUDE.md anota cinco veces sobre el módulo de comprobante: los candados
//      prueban piezas, la pantalla prueba el camino, y los defectos viven entre
//      las piezas.
//
//   2. **La rama correcta SÍ se ejercía, pero en la segunda lectura.** Cuando la
//      receta del proveedor ya está guardada, la pantalla de columnas no se
//      muestra, no se manda ninguna columna, el motor decide y —si no puede—
//      pregunta. O sea que el camino bueno funcionaba y era fácil verlo andar. El
//      roto era el de la PRIMERA lista de un proveedor, que es exactamente la
//      única vez en que nadie tiene todavía una referencia para desconfiar.
//
//   3. **El único testigo era un campo de auditoría, y se lo había arreglado a
//      él en vez de al problema.** `decisionDeLectura.aMano` ya descontaba los
//      casos en que la persona solo había aceptado la propuesta, con un
//      comentario que lo explicaba: "la pantalla 3 manda siempre la columna,
//      también cuando la persona aprieta «Está bien, seguir»". El síntoma estaba
//      visto y anotado — pero se lo trató como un problema de cómo se informa,
//      no de quién decide. La misma distinción que ahí se hacía para el registro
//      es la que faltaba tres líneas más arriba, donde se elige.
//
// El arreglo, entonces, no agrega inteligencia en ningún lado: separa dos cosas
// que viajaban juntas. Una propuesta del sistema no es una decisión de nadie.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/columnaLaEligeElMotor.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MOTIVO_LISTA, decidirLista, MAYORIA_MINIMA } from "./decisionDeLista.js";
import { MODO_LISTA } from "./modoDeLaLista.js";
import { normalizarReceta, recetaParaGuardar } from "./lectura/recetaDeLista.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const RUTA_IMPORTAR = "app/api/proveedores/listas/importar/route.js";
const RUTA_PANTALLA = "components/proveedores/listas/ConfirmarColumnas.jsx";

/**
 * El fuente sin comentarios.
 *
 * NO es una precaución teórica: este repo ya tuvo un candado VERDE que
 * encontraba la palabra que buscaba adentro de un comentario tres líneas más
 * arriba. Un candado que mira código tiene que sacar los comentarios antes de
 * mirar, y este archivo está lleno de comentarios que nombran justo lo que
 * busca.
 */
const sinComentarios = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const fuenteDe = (ruta) => sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));

// ═══════════════════════════════════════════════════════════════════════════
// 1. EL CASO EXACTO DE ARCOR ARVEJAS
// ═══════════════════════════════════════════════════════════════════════════

// Los tres números del caso, tal como quedaron medidos contra la base.
const COSTO_VIEJO = 742.3;
const CON_IVA = 1039.22;
// El sin IVA del mismo renglón: el papel lo trae impreso y es el con IVA ÷ 1,21.
const SIN_IVA = Math.round((CON_IVA / 1.21) * 100) / 100;

const COL_SIN_IVA = 4;
const COL_CON_IVA = 5;

test("EL FIXTURE ES EL CASO: $858,86 con S/IVA, +15,7 % contra el costo viejo", () => {
  // CONTRA EL FIXTURE QUE NO REPRODUCE NADA. Si estos números no dieran lo que
  // el informe midió, todo lo de abajo estaría probando otro caso y el candado
  // se leería como si cubriera éste.
  assert.equal(SIN_IVA, 858.86, "el sin IVA del renglón no es el del caso");

  const subeConSinIva = ((SIN_IVA - COSTO_VIEJO) / COSTO_VIEJO) * 100;
  assert.equal(Math.round(subeConSinIva * 10) / 10, 15.7);

  // Y LO QUE HACE QUE EL DAÑO SEA INVISIBLE: ese 15,7 % cae adentro del rango
  // esperado, así que la fila se aplica sola. Si cayera afuera, el módulo la
  // habría mandado a revisar y una persona la habría mirado.
  assert.ok(subeConSinIva >= 10 && subeConSinIva <= 20, "el caso pierde la gracia si no cae en rango");

  // El correcto sube mucho más, y ESO sí se habría visto.
  const subeConConIva = ((CON_IVA - COSTO_VIEJO) / COSTO_VIEJO) * 100;
  assert.ok(subeConConIva > 20, "con la columna correcta el aumento queda fuera de rango");
});

/**
 * Una lista chica con las dos columnas, alrededor del renglón de ARVEJAS.
 *
 * Los demás renglones están para que la columna correcta EXPLIQUE algo: una
 * decisión de lista se toma sobre la lista entera, y con una sola fila cualquier
 * columna le queda linda. `explicaConIva` dice si ese renglón aumentó lo
 * esperado leyéndolo por la columna de con IVA.
 */
function lista({ explicanConIva }) {
  const filas = [
    // El de ARVEJAS, con sus números exactos.
    {
      clave: 0,
      codigo: "9140",
      precios: { [COL_SIN_IVA]: SIN_IVA, [COL_CON_IVA]: CON_IVA },
      descuentoPct: null,
      cantidadDelArchivo: null,
      factorPack: null,
      costoActual: COSTO_VIEJO,
    },
  ];
  // Los acompañantes: su costo se pone para que el con IVA dé +15 %, que está en
  // rango, y el sin IVA dé −5 %, que no.
  for (let i = 1; i <= explicanConIva; i++) {
    const conIva = 1000 + i * 137.5;
    filas.push({
      clave: i,
      codigo: `900${i}`,
      precios: { [COL_SIN_IVA]: Math.round((conIva / 1.21) * 100) / 100, [COL_CON_IVA]: conIva },
      descuentoPct: null,
      cantidadDelArchivo: null,
      factorPack: null,
      costoActual: Math.round((conIva / 1.15) * 100) / 100,
    });
  }
  return filas;
}

const RANGO = { minPct: 10, maxPct: 20 };

test("CON RANGO, ELIGE LA QUE EXPLICA MÁS — no la del nombre parecido", () => {
  // Nueve renglones, ocho de los cuales suben lo esperado leídos por el con IVA.
  // Es el escenario en que el motor SÍ puede decidir, y tiene que decidir bien.
  const r = decidirLista({
    filas: lista({ explicanConIva: 8 }),
    columnasDePrecio: [COL_SIN_IVA, COL_CON_IVA],
    config: { rango: RANGO, modo: MODO_LISTA.ACTUALIZAR },
  });

  assert.ok(r.eleccion, `no eligió ninguna columna: ${r.motivoLista}`);
  assert.equal(
    r.eleccion.columna,
    COL_CON_IVA,
    "eligió la columna de sin IVA, que es la primera por el nombre y la que explica menos"
  );

  // CONTRAPRUEBA DEL PUNTAJE: no alcanza con que haya elegido la de con IVA,
  // hay que ver que la eligió PORQUE explica más. Si las dos explicaran lo
  // mismo, esta afirmación se cumpliría por casualidad.
  const porColumna = new Map(r.opciones.filter((o) => !o.conDescuento).map((o) => [o.columna, o.explicadas]));
  assert.ok(
    porColumna.get(COL_CON_IVA) > porColumna.get(COL_SIN_IVA),
    `la de con IVA explica ${porColumna.get(COL_CON_IVA)} y la de sin IVA ${porColumna.get(COL_SIN_IVA)}: ` +
      `sin diferencia de puntaje este candado no prueba nada`
  );
});

test("EL CASO DE ARVEJAS: con dos filas o más, nunca se queda con la de sin IVA", () => {
  // Se barre de 1 a 8 acompañantes, o sea de "apenas tiene con qué decidir" a
  // "tiene de sobra". En NINGUNO puede terminar eligiendo la de sin IVA: o elige
  // la de con IVA, o no elige y pregunta.
  //
  // ── POR QUÉ ARRANCA EN 1 Y NO EN 0 ────────────────────────────────────────
  //
  // Porque con CERO acompañantes —el renglón de ARVEJAS solo— el motor sí se
  // queda con la de sin IVA, y es un límite real que conviene tener escrito. Con
  // una sola fila comparable, la de sin IVA explica 1 de 1, eso llega a los dos
  // tercios, y el motor decide una lista entera con una muestra de uno.
  //
  // NO se arregló en esta tanda, a propósito: es otro defecto —el motor no exige
  // una muestra mínima— y esta tanda arregla uno solo. Está medido abajo, en su
  // propio candado, para que se vea que se conoce y no que se pasó por alto.
  // Sobre las listas reales no ocurre: las de este cliente traen entre 56 y 983
  // renglones.
  for (let acompañantes = 1; acompañantes <= 8; acompañantes++) {
    const r = decidirLista({
      filas: lista({ explicanConIva: acompañantes }),
      columnasDePrecio: [COL_SIN_IVA, COL_CON_IVA],
      config: { rango: RANGO, modo: MODO_LISTA.ACTUALIZAR },
    });

    if (r.eleccion === null) {
      assert.equal(
        r.motivoLista,
        MOTIVO_LISTA.NINGUNA_OPCION_CLARA,
        `con ${acompañantes} acompañantes no eligió, pero tampoco pidió elegir`
      );
      continue;
    }
    assert.equal(
      r.eleccion.columna,
      COL_CON_IVA,
      `con ${acompañantes} acompañantes se quedó con la columna de sin IVA`
    );
  }
});

test("LÍMITE CONOCIDO: con UNA sola fila comparable el motor decide igual, y elige mal", () => {
  // ── QUÉ ES ESTO Y POR QUÉ ESTÁ ESCRITO ────────────────────────────────────
  //
  // No es una afirmación de que el módulo esté bien: es la medición de un defecto
  // que esta tanda NO arregla, escrita para que no se lea como cubierto.
  //
  // Con el renglón de ARVEJAS solo, la de sin IVA explica 1 de 1 —su +15,7 % cae
  // en el rango— y la de con IVA explica 0. Uno sobre uno llega a los dos
  // tercios, así que el motor elige, y elige la equivocada: decide una lista
  // entera con una muestra de uno.
  //
  // Lo que falta es una MUESTRA MÍNIMA: un umbral de filas comparables por
  // debajo del cual el motor no decide y pregunta. No se agregó acá porque es
  // otro defecto y porque cambiaría cuándo el módulo pregunta sobre listas
  // reales, que es una decisión de Emanuel y no de esta tanda.
  //
  // El día que se arregle, este candado se pone rojo — y tiene que ponerse rojo:
  // es la señal de que el arreglo funcionó. Ahí se cambia por su contrario.
  const r = decidirLista({
    filas: lista({ explicanConIva: 0 }),
    columnasDePrecio: [COL_SIN_IVA, COL_CON_IVA],
    config: { rango: RANGO, modo: MODO_LISTA.ACTUALIZAR },
  });

  assert.ok(r.eleccion, "con una sola fila el motor ya no elige: el límite se arregló, cambiá este candado");
  assert.equal(
    r.eleccion.columna,
    COL_SIN_IVA,
    "con una sola fila el motor dejó de elegir la de sin IVA: el límite se arregló, cambiá este candado"
  );
  assert.equal(r.eleccion.explicadas, 1);
  assert.equal(r.eleccion.comparables, 1);
});

test("LA MAYORÍA MÍNIMA ES LO QUE HACE QUE PREGUNTE, y son dos tercios", () => {
  // Se afirma el número porque de él depende TODO lo de arriba: con una mayoría
  // más baja, el motor elegiría con 4 de 9 y no preguntaría nunca. Si alguien lo
  // baja, que sea a sabiendas.
  assert.equal(MAYORIA_MINIMA, 2 / 3);
  // Y el caso real: 4 de 9 no llega, así que el motor pide ayuda.
  assert.ok(4 / 9 < MAYORIA_MINIMA, "4 de 9 llegaría a la mayoría: el caso no reproduce");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA PROPUESTA NO ES UNA ELECCIÓN — en la ruta
// ═══════════════════════════════════════════════════════════════════════════

test("LA RUTA EXIGE EL GESTO, no solo el índice de columna", () => {
  const fuente = fuenteDe(RUTA_IMPORTAR);

  // El índice que manda la pantalla solo se toma como elección si viene con la
  // bandera que dice que alguien la tocó.
  assert.match(
    fuente,
    /precioElegidoPorUsuario/,
    `${RUTA_IMPORTAR} no mira \`precioElegidoPorUsuario\`: la propuesta de la pantalla vuelve a ` +
      `contar como elección y el motor vuelve a quedar sin voz`
  );

  // Y el otro camino legítimo: una elección de una persona ya guardada.
  assert.match(
    fuente,
    /precioLoEligioUnaPersona/,
    `${RUTA_IMPORTAR} no mira \`precioLoEligioUnaPersona\`: una columna elegida a mano el mes ` +
      `pasado se lee igual que una propuesta`
  );
});

test("CONTRAPRUEBA: el chequeo de arriba distingue de verdad", () => {
  // ── POR QUÉ ESTA CONTRAPRUEBA ─────────────────────────────────────────────
  //
  // Un `assert.match` sobre un fuente enorme es exactamente la clase de
  // afirmación que pasa sin probar nada: cualquier archivo que mencione la
  // palabra una vez la cumple. Acá se ejerce el caso que tiene que fallar —el
  // fuente SIN la bandera— y se comprueba que el mismo chequeo se pone rojo.
  const fuente = fuenteDe(RUTA_IMPORTAR);
  const comoEstabaAntes = fuente.replace(/precioElegidoPorUsuario/g, "");

  assert.doesNotMatch(
    comoEstabaAntes,
    /precioElegidoPorUsuario/,
    "la contraprueba no logró sacar la bandera: no está probando nada"
  );
  // Y que la palabra estaba de verdad, no que el replace no hizo nada.
  assert.notEqual(fuente, comoEstabaAntes, "el fuente no tenía la bandera para empezar");
});

test("EL «Está bien, seguir» SOLO NO ELIGE NADA: la bandera nace en false", () => {
  const fuente = fuenteDe(RUTA_PANTALLA);

  // Arranca en false, siempre. Es lo que hace que aceptar la propuesta no sea
  // elegirla, incluso cuando hay una columna preseleccionada.
  assert.match(
    fuente,
    /useState\(false\)[^\n]*\n?/,
    `${RUTA_PANTALLA} no arranca la bandera en false`
  );
  assert.match(
    fuente,
    /const \[precioElegidoPorUsuario, setPrecioElegidoPorUsuario\] = useState\(false\)/,
    `${RUTA_PANTALLA} cambió cómo arranca \`precioElegidoPorUsuario\`: si arranca en true, ` +
      `aceptar la propuesta vuelve a contar como elegirla`
  );

  // Y se enciende en UN SOLO lugar: al elegir una columna de precio.
  const encendidos = [...fuente.matchAll(/setPrecioElegidoPorUsuario\(\s*true\s*\)/g)];
  assert.equal(
    encendidos.length,
    1,
    `${RUTA_PANTALLA} enciende la bandera en ${encendidos.length} lugares; tiene que ser uno solo, ` +
      `dentro de \`elegirPrecio\`. Cada lugar de más es una forma de que la propuesta se cuele como elección`
  );

  const elegirPrecio = fuente.match(/const elegirPrecio = \([\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(
    elegirPrecio,
    /setPrecioElegidoPorUsuario\(true\)/,
    "la bandera no se enciende dentro de `elegirPrecio`, que es el único gesto que la justifica"
  );

  // Y la pantalla la MANDA. Encenderla y no mandarla la deja sin efecto.
  assert.match(
    fuente,
    /precioElegidoPorUsuario,\s*\n/,
    `${RUTA_PANTALLA} no manda la bandera al confirmar`
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA RECETA GUARDADA
// ═══════════════════════════════════════════════════════════════════════════

const recetaBase = {
  version: 1,
  codigo: 0,
  descripcion: 1,
  cantidad: 3,
  descuento: null,
  codigoBarra: null,
  precios: [4, 5],
};

test("UNA RECETA VIEJA NO CUENTA COMO ELECCIÓN DE NADIE", () => {
  // ── POR QUÉ IMPORTA ─────────────────────────────────────────────────────
  //
  // Las recetas guardadas ANTES de esta tanda tienen `columnaPrecioElegida`
  // escrita desde la PROPUESTA, porque hasta entonces las dos cosas viajaban por
  // el mismo campo. Si se leyeran como una elección, el defecto sobreviviría al
  // arreglo en todos los proveedores que ya tienen receta — y sin dejar rastro,
  // porque el dato se ve exactamente igual.
  const vieja = normalizarReceta({ ...recetaBase, columnaPrecioElegida: 4, descuentoAplicado: false });
  assert.equal(vieja.ok, true);
  assert.equal(
    vieja.receta.precioLoEligioUnaPersona,
    false,
    "una receta sin la bandera se está leyendo como si alguien hubiera elegido la columna"
  );
});

test("Y UNA NUEVA, ELEGIDA A MANO, SÍ", () => {
  const nueva = normalizarReceta({
    ...recetaBase,
    columnaPrecioElegida: 5,
    descuentoAplicado: false,
    precioLoEligioUnaPersona: true,
  });
  assert.equal(nueva.receta.precioLoEligioUnaPersona, true);
  assert.equal(nueva.receta.columnaPrecioElegida, 5);
});

test("CONTRAPRUEBA: la bandera no se deriva de que haya una columna guardada", () => {
  // Las dos recetas de arriba tienen `columnaPrecioElegida` cargada y difieren
  // SOLO en la bandera. Si alguien intentara deducir "la eligió una persona" de
  // "hay una columna guardada", las dos darían lo mismo y este candado lo dice.
  const sinBandera = normalizarReceta({ ...recetaBase, columnaPrecioElegida: 5 });
  const conBandera = normalizarReceta({ ...recetaBase, columnaPrecioElegida: 5, precioLoEligioUnaPersona: true });

  assert.equal(sinBandera.receta.columnaPrecioElegida, conBandera.receta.columnaPrecioElegida);
  assert.notEqual(
    sinBandera.receta.precioLoEligioUnaPersona,
    conBandera.receta.precioLoEligioUnaPersona,
    "la bandera se está derivando de la columna: son dos hechos y tienen que ser dos datos"
  );
});

test("`recetaParaGuardar` no la enciende sola", () => {
  const sinDecir = recetaParaGuardar({
    mapeo: { codigo: 0, descripcion: 1, cantidad: 3, descuento: null, codigoBarra: null, precios: [4, 5] },
    titulos: ["CODIGO", "DESCRIPCION", "U.M.", "CANT", "S/IVA", "C/IVA"],
    columnaPrecioElegida: 4,
  });
  assert.equal(sinDecir.ok, true);
  assert.equal(
    sinDecir.receta.precioLoEligioUnaPersona,
    false,
    "guardar una receta sin decir quién eligió la columna la marca como elegida a mano"
  );

  const diciendo = recetaParaGuardar({
    mapeo: { codigo: 0, descripcion: 1, cantidad: 3, descuento: null, codigoBarra: null, precios: [5, 4] },
    titulos: ["CODIGO", "DESCRIPCION", "U.M.", "CANT", "S/IVA", "C/IVA"],
    columnaPrecioElegida: 5,
    precioLoEligioUnaPersona: true,
  });
  assert.equal(diciendo.receta.precioLoEligioUnaPersona, true);
});
