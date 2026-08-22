// CANDADOS DEL CAMPO DE BÚSQUEDA COMPARTIDO.
//
// ── QUÉ DEFIENDEN, Y CONTRA QUÉ ───────────────────────────────────────────
//
// El POS y Productos tenían dos buscadores distintos: uno con borde de acento,
// ícono y micrófono, el otro un input pelado. Se unificaron en
// `SunmiCampoBusquedaVoz`. Lo que estos candados impiden no es que el campo se
// vea mal — es que VUELVA A HABER DOS.
//
// Y esa es una divergencia que no rompe nada: el día que alguien le escriba un
// input propio a una de las dos pantallas, va a compilar, la suite va a quedar
// verde y las dos pantallas van a andar. Solo se nota abriendo las dos en un
// teléfono y viendo que una escucha y la otra no. Por eso hace falta un candado
// y no alcanza con el comentario del componente.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// Los comentarios se sacan ANTES de mirar. Un candado que busca texto encuentra
// la prosa que lo explica y se pone verde por el motivo equivocado; en este repo
// ya pasó tres veces y la peor fue un VERDE falso.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const PIEZA = leer("components/sunmi/SunmiCampoBusquedaVoz.jsx");
const POS = leer("components/pos-ventas/BuscadorProductos.jsx");
const PRODUCTOS = leer("app/modulos/productos/page.jsx");

// Las dos pantallas que tienen que usar la MISMA pieza. Es una lista y no dos
// afirmaciones sueltas para que agregar una tercera sea una línea, y para que el
// mensaje diga cuál falló.
const CONSUMIDORAS = [
  ["el POS", POS, "components/pos-ventas/BuscadorProductos.jsx"],
  ["Productos", PRODUCTOS, "app/modulos/productos/page.jsx"],
];

test("LAS DOS PANTALLAS MONTAN LA MISMA PIEZA", () => {
  for (const [nombre, fuente, ruta] of CONSUMIDORAS) {
    assert.match(
      fuente,
      /<SunmiCampoBusquedaVoz/,
      `${nombre} (${ruta}) dejó de montar el campo compartido`
    );
  }
});

test("Y NINGUNA SE ESCRIBIÓ EL SUYO AL LADO", () => {
  // ── POR QUÉ SE MIRAN ESTAS TRES COSAS Y NO "¿HAY UN INPUT?" ─────────────
  //
  // Las dos pantallas tienen otros campos —los filtros de Productos, sin ir más
  // lejos— así que prohibir `SunmiInput` sería falso. Lo que no puede repetirse
  // es lo que HACE a este buscador: el reconocimiento de voz, el idioma y el
  // texto de "Escuchando...". Si alguno de los tres aparece fuera de la pieza,
  // es que alguien está armando el segundo buscador.
  //
  // Y el patrón del idioma va ANCLADO a la asignación —`.lang =`— y no suelto.
  // Buscar "es-AR" a secas puso este candado en rojo por el `toLocaleString`
  // con el que el POS formatea los pesos: la misma cadena, otro asunto
  // completamente. Un patrón suelto encuentra lo que se parece, no lo que es.
  const RASGOS = [
    [/SpeechRecognition/, "el reconocimiento de voz"],
    [/\.lang\s*=\s*["']es-AR["']/, "el idioma del dictado"],
    [/Escuchando\.\.\./, "el aviso de que el micrófono está abierto"],
  ];
  for (const [nombre, fuente, ruta] of CONSUMIDORAS) {
    for (const [patron, que] of RASGOS) {
      assert.doesNotMatch(
        fuente,
        patron,
        `${nombre} (${ruta}) se escribió ${que} por su cuenta: eso vive en SunmiCampoBusquedaVoz`
      );
    }
  }
});

test("EL DICTADO ES EN ES-AR, Y ESTÁ EN UN SOLO LUGAR", () => {
  // El idioma no es un detalle de configuración: en es-AR el reconocedor
  // entiende "dos litros" y en es-ES devuelve otra cosa. Que esté una sola vez
  // es lo que impide que una pantalla escuche distinto que la otra.
  assert.match(PIEZA, /export const IDIOMA_VOZ = "es-AR"/);
  assert.equal(
    (PIEZA.match(/["']es-AR["']/g) || []).length,
    1,
    "el idioma quedó escrito más de una vez adentro de la pieza"
  );
  assert.match(PIEZA, /lang = IDIOMA_VOZ/, "el reconocedor no usa la constante");
});

test("LA VOZ Y EL TECLADO SON DOS RANURAS, Y CADA PANTALLA ELIGE", () => {
  // ── LA DIFERENCIA QUE NO SE PUEDE PERDER ────────────────────────────────
  //
  // En Productos dictar es exactamente escribir. En el POS NO: la voz viaja con
  // `fromVoice` para que el servidor devuelva cómo interpretó la transcripción,
  // y eso solo tiene sentido cuando alguien habló.
  //
  // Si un día alguien "simplifica" la pieza haciendo que la voz entre por
  // `onChange`, el POS pierde esa interpretación sin que nada se rompa: sigue
  // buscando, sigue encontrando, y deja de avisar que entendió otra palabra.
  // ── Y SE MIRA QUE LA USE, NO QUE LA DECLARE ─────────────────────────────
  //
  // La primera versión de esto decía `assert.match(PIEZA, /onVoz/)`. La
  // contraprueba la desarmó: se cambió el cuerpo para que el dictado llamara a
  // `onChange` y el candado siguió VERDE, porque `onVoz` seguía escrito en la
  // lista de props. Comprobaba que la ranura existiera, no que estuviera
  // enchufada — un candado que acompaña, no que afirma.
  //
  // Lo que se mira ahora es la línea que decide: la que el reconocedor ejecuta
  // cuando termina de escuchar.
  assert.match(
    PIEZA,
    /\(onVoz \|\| onChange\)\?\.\(/,
    "el dictado dejó de preferir onVoz: el POS pierde la interpretación de lo hablado"
  );
  assert.match(
    POS,
    /onVoz=\{alDictar\}/,
    "el POS dejó de tratar la voz distinto del teclado: pierde la interpretación"
  );
  assert.match(
    POS,
    /fromVoice/,
    "el POS dejó de marcar la búsqueda por voz contra el servidor"
  );

  // Y del otro lado, la afirmación opuesta: en Productos las dos ranuras
  // reciben LA MISMA función, no dos parecidas escritas al lado.
  assert.match(
    PRODUCTOS,
    /onChange=\{alBuscarEnElCelular\}/,
    "Productos dejó de usar la función única para teclear"
  );
  assert.match(
    PRODUCTOS,
    /onVoz=\{alBuscarEnElCelular\}/,
    "en Productos dictar dejó de alimentar filtros.search igual que escribir"
  );
});

test("LA PIEZA NO SABE BUSCAR, Y ESO ES A PROPÓSITO", () => {
  // Es la mitad que hace que sirva para las dos pantallas. El POS auto-agrega
  // con un código exacto y Productos filtra un listado: si la búsqueda viviera
  // adentro, la pieza tendría dos modos y el segundo consumidor no la podría
  // usar — que es exactamente cómo nacieron `SunmiModalLayout` y
  // `SunmiButtonIcon`, las dos piezas del kit que hoy no se pueden usar.
  assert.doesNotMatch(PIEZA, /fetch\(/, "la pieza se puso a buscar por su cuenta");
  assert.doesNotMatch(PIEZA, /\/api\//, "la pieza conoce una ruta: eso es de la pantalla");
});

test("EL CAMPO DEL POS NO SE MOVIÓ: LAS CLASES SON LAS QUE TENÍA", () => {
  // ── POR QUÉ SE FIJAN LAS CLASES Y NO SOLO "QUE EXISTA" ──────────────────
  //
  // La pieza salió del POS tal cual estaba, y la prueba de que una extracción
  // salió bien es que la pantalla de origen quede IDÉNTICA. Estas son las
  // clases que definían ese campo: el alto en el celular y en escritorio, el
  // borde de dos, el hueco del ícono y el del micrófono.
  //
  // Están acá y no en una captura porque una captura se compara una vez; esto
  // se compara en cada commit. La captura igual se sacó, y dio cero.
  for (const clase of ["min-h-12", "lg:min-h-10", "!py-2", "!pl-9", "!border-2", "pulse-neon", "!pr-12"]) {
    assert.ok(
      PIEZA.includes(clase),
      `se fue la clase ${clase}: el campo dejó de verse como el del POS`
    );
  }
  // El borde toma el color del acento del POS, no uno escrito a mano.
  assert.match(PIEZA, /borderColor: "var\(--pos-link\)"/);
});
