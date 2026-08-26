// LAS CUATRO FORMAS SON LAS QUE EL REPO USA, Y EL VELO SE PUEDE TOCAR CON EL
// TECLADO.
//
// No se monta React acá: se afirma sobre las decisiones que se pueden leer sin
// dibujar —qué formas existen, de dónde salen, y cómo se compone la clase del
// panel— y sobre el código de la pieza. Que las cuatro se DIBUJEN como dicen se
// comprobó con capturas y está contado en el commit.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { declaraAnchoMaximo } from "@/lib/sunmi/claseNegociada";
import { declaraAncho } from "@/lib/sunmi/claseAncho";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiModalLayout.jsx"), "utf8");

/** `git grep` recorre el repo entero; `readdirSync` mira un solo nivel. */
const ejecutar = (cmd) => execSync(cmd, { cwd: RAIZ, encoding: "utf8" });

/**
 * LOS CONSUMIDORES DE VERDAD DE LA PIEZA.
 *
 * ── POR QUÉ NO ALCANZA CON `git grep -l SunmiModalLayout` ──────────────────
 *
 * Ese grep encuentra el NOMBRE, y el nombre aparece también en comentarios.
 * `app/andamio-carrito/page.jsx` lo menciona al explicar qué mide y **no usa la
 * pieza**: entraba a la lista de consumidores y los candados le exigían declarar
 * props de un modal que no dibuja.
 *
 * Es la cuarta vez del mismo patrón en este repo —el contador que sumó por un
 * comentario, el candado que dio rojo por una línea comentada, el que dio verde
 * con el chequeo sacado— y acá le tocó a la ENUMERACIÓN en vez de a la
 * afirmación. Está anotado en `CLAUDE.md`.
 *
 * La red se deja ancha —el grep del nombre no tiene falsos negativos— y después
 * se filtra por el USO: un archivo es consumidor si abre la etiqueta.
 */
function consumidoresDelKit() {
  return ejecutar("git grep -l SunmiModalLayout -- app components")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith("SunmiModalLayout.jsx") && !l.endsWith(".test.mjs"))
    .filter((l) => fs.readFileSync(path.join(RAIZ, l), "utf8").includes("<SunmiModalLayout"));
}

// ── LAS FORMAS ─────────────────────────────────────────────────────────────

test("las formas son EXACTAMENTE cuatro, las que existen en el repo", () => {
  // Si aparece una quinta sin una pantalla detrás, es una forma inventada — que
  // es el error que ya se cometió dos veces en este kit.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const nombres = [...bloque.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(nombres.sort(), ["cajon", "centrado", "hoja", "hoja-o-centrado"]);
});

test("cada forma dice de dónde sale", () => {
  // El encabezado nombra la pantalla de origen de cada una. Sin eso, dentro de
  // seis meses nadie sabe si `cajon` salió de algún lado o se le ocurrió a
  // alguien.
  for (const origen of ["CarritoPedido", "caja"]) {
    assert.match(SRC, new RegExp(origen), `no dice que una forma sale de ${origen}`);
  }
});

test("EL ÚNICO PUNTO DE CORTE ES `sm`, y es el que usan las de caja", () => {
  // Nada de un sistema general de breakpoints para casos que no hay.
  const cortes = [...SRC.matchAll(/\b(sm|md|lg|xl|2xl):/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(cortes)], ["sm"], cortes.join(", "));
});

// ── EL VELO ────────────────────────────────────────────────────────────────

test("el velo QUE CIERRA es un botón con etiqueta, no un div", () => {
  // Como en el carrito, que ya lo tenía bien. Un `div` con `onClick` no existe
  // para quien no usa mouse.
  assert.match(SRC, /<button\s+type="button"\s+aria-label="Cerrar"/);
});

test("el velo QUE NO CIERRA vuelve a ser un div escondido", () => {
  // Un botón que no hace nada es peor que ninguno: recibe el foco y no contesta.
  assert.match(SRC, /<div\s+aria-hidden="true"/);
  assert.match(SRC, /const cierraElVelo = !destructivo/);
});

test("NINGÚN COLOR FIJO adentro: el velo sale del token del tema", () => {
  // Es lo que arruinó a SunmiButtonIcon, que trae tres colores fijos y por eso
  // no se puede usar. El velo del carrito es `bg-black/50`; acá el color sigue
  // saliendo del fondo del tema, aunque ahora se lo lleve hacia el negro.
  assert.doesNotMatch(SRC, /bg-(black|white|slate|gray|zinc|neutral|red|amber|green|blue)-?\d*\/?\d*/);
  assert.match(SRC, /var\(--app-bg\)/);
});

test("EL VELO NO SE DESVANECE HACIA EL FONDO DE LA APP", () => {
  // ESTE ES EL CANDADO DEL DEFECTO, y por eso vale más que su tamaño.
  //
  // El velo decía `color-mix(in srgb, var(--app-bg) 78%, transparent)`. Apagaba
  // muy bien lo de atrás, pero desvanece TODO hacia el fondo de la app — y la
  // tarjeta de un modal ES el fondo de la app en casi todos los temas. Medido
  // sobre `/modulos/categorias` en los catorce: en DIEZ el relleno de la tarjeta
  // y el del velo daban exactamente el mismo color.
  //
  // Lo que este candado impide es volver a esa forma: que el color del velo sea
  // `--app-bg` SIN llevarlo antes hacia el negro. Se mira la constante, que es
  // donde vive el color, y no las dos ramas donde se usa.
  // La constante se saca del TEXTO y no se importa: el archivo es JSX y la
  // suite corre sin transformarlo.
  const m = SRC.match(/export const COLOR_VELO = "([^"]+)"/);
  assert.ok(m, "no está `export const COLOR_VELO`: el velo volvió a estar suelto");
  const COLOR_VELO = m[1];
  assert.match(COLOR_VELO, /color-mix/, "el velo dejó de mezclar: revisar este candado");
  assert.match(
    COLOR_VELO,
    /black\s+\d+%/,
    "el velo volvió a salir del fondo de la app sin oscurecer: eso hace que la tarjeta desaparezca contra él"
  );
  // Y el control negativo: la forma vieja tiene que fallar esta misma
  // afirmación, o el candado no está mirando nada.
  assert.doesNotMatch("color-mix(in srgb, var(--app-bg) 78%, transparent)", /black\s+\d+%/);
});

test("el color y la opacidad del velo se escriben UNA vez", () => {
  // Estaban literales en las dos ramas —la que cierra al tocar y la que no—.
  // Dos copias de un color se separan el día que alguien toca una, y nadie mira
  // la rama que no usa la pantalla que está probando.
  const usos = SRC.match(/background: COLOR_VELO, opacity: OPACIDAD_VELO/g) ?? [];
  assert.equal(usos.length, 2, "las dos ramas del velo tienen que compartir la constante");
  const literales = SRC.match(/color-mix\(in srgb, black/g) ?? [];
  assert.equal(literales.length, 1, "el color del velo volvió a estar escrito más de una vez");
});

// ── LA CLASE DEL PANEL SE NEGOCIA ──────────────────────────────────────────

test("un `max-w-*` de la pantalla saca el de la pieza", () => {
  assert.equal(declaraAnchoMaximo("max-w-2xl"), true);
  assert.equal(declaraAnchoMaximo("!max-w-[420px]"), true);
  assert.equal(declaraAnchoMaximo("w-full"), false);
  assert.equal(declaraAnchoMaximo("min-w-0"), false);
});

test("`max-w-` NO cuenta como ancho para el input, y sí para el modal", () => {
  // Son dos preguntas distintas y a propósito: para un input, `max-w-sm` acota
  // pero no define, así que su `w-full` se queda. Para el panel del modal, el
  // `max-w-*` ES el ancho que se quiere.
  assert.equal(declaraAncho("max-w-sm"), false);
  assert.equal(declaraAnchoMaximo("max-w-sm"), true);
});

test("la pieza retira lo suyo cuando la pantalla declara", () => {
  const bloque = SRC.slice(SRC.indexOf("const clasesDelPanel"), SRC.indexOf("const cierraElVelo"));
  assert.match(bloque, /declaraAncho\(pedido\) \? "" : "w-full"/);
  assert.match(bloque, /declaraAnchoMaximo\(pedido\) \? "" : maxWidth/);
});

// ── EL APILADO ES UN SOLO NÚMERO ───────────────────────────────────────────

test("hay UN z, va en la capa, y NO TIENE DEFAULT", () => {
  // ── SE LE SACÓ EL DEFAULT EL 2026-08-15 ─────────────────────────────────
  //
  // Tenía `z = 9999` y los cinco que declaraban algo declaraban 50: el default
  // no lo elegía nadie que hubiera pensado el tema. Y acá el número **no es
  // cosmético**: hay cosas por encima de 50 fuera del modal —la campana de
  // notificaciones a 9998 y 9999, el gestor de columnas a 9999— que el contexto
  // de apilado de la capa no tapa. Un modal a 50 puede quedar debajo sin que
  // nada avise.
  //
  // Los 17 que no lo declaraban recibieron el valor efectivo que ya tenían,
  // MEDIDO en el navegador. Cero pantallas se mueven.
  assert.doesNotMatch(SRC, /\bz\s*=\s*9999/, "le volvió el default a `z`: eso es lo que este candado saca");
  assert.match(SRC, /^\s*z,\s*$/m, "`z` dejó de ser parámetro");
  assert.match(SRC, /style=\{\{ zIndex: z \}\}/);
  assert.match(SRC, /className=\{`fixed inset-0 \$\{f\.capa\}`\}/, "la capa no puede traer su propio z-*");
});

test("EL VELO Y EL PANEL NO LLEVAN Z PROPIO", () => {
  // Es lo que mantiene atómico el contexto de apilado. El día que cada uno tenga
  // el suyo, algo de afuera se puede volver a meter en el medio — que es
  // exactamente lo que le pasó al cartel de identificarse en producción.
  // ── EL ANCLA SE CAMBIÓ, Y NO SE AFLOJÓ NADA ────────────────────────────
  //
  // Esto decía `SRC.indexOf("return (")`. El día que la capa pasó a montarse en
  // el `body`, el JSX quedó en `const capa = (` y el `return (` pasó a ser el del
  // portal, tres líneas antes del final: el candado recortaba un pedazo sin
  // velos, encontraba CERO y se ponía en rojo sin que nada de lo que afirma se
  // hubiera roto.
  //
  // Es el caso que el `CLAUDE.md` describe al revés —un candado que sigue en
  // VERDE cuando el patrón se muda— y acá salió en rojo, que es la versión
  // barata. El ancla nueva es la declaración de la capa, que es lo que este
  // candado mira de verdad; y si algún día también se muda, el `assert` de abajo
  // lo dice con todas las letras en vez de dejar pasar un cero.
  const inicio = SRC.indexOf("const capa = (");
  assert.notEqual(inicio, -1, "se movió la declaración de la capa: reanclar este candado, no borrarlo");
  const cuerpo = SRC.slice(inicio);
  const velos = cuerpo.match(/className="absolute inset-0[^"]*"/g) ?? [];
  assert.equal(velos.length, 2, "el velo dejó de tener dos formas: revisar este candado");
  for (const v of velos) assert.doesNotMatch(v, /\bz-/, v);
  const panel = SRC.slice(SRC.indexOf("const clasesDelPanel"), SRC.indexOf("const cierraElVelo"));
  assert.doesNotMatch(panel, /\bz-\[/, "el panel se ganó un z propio");
});

test("NO HAY UN SEGUNDO NÚMERO que se pueda pasar por separado", () => {
  // Ni zVelo, ni zPanel, ni nada parecido. Si aparece, el número deja de ser uno
  // y vuelve el hueco.
  const firma = SRC.slice(SRC.indexOf("export default function"), SRC.indexOf("}) {"));
  const zetas = [...firma.matchAll(/^\s*(z[A-Za-z]*)\s*[=,]/gm)].map((m) => m[1]);
  assert.deepEqual(zetas, ["z"], zetas.join(", "));
});

test("el cartel de identificarse sigue arriba de este default", () => {
  // La otra mitad de la misma regla. El candado de ModalPedirOperador mira que
  // ninguna capa lo tape; este mira desde el otro lado, para que subir el default
  // del kit no lo deje debajo sin que nadie lo note.
  //
  // ── REESCRITO EL 2026-08-15, Y QUEDÓ MÁS FUERTE ─────────────────────────
  //
  // Miraba el DEFAULT del kit. El kit se quedó sin default de `z`, así que ese
  // número ya no existe — pero lo que el candado protege sí. Ahora compara
  // contra **el z más alto que declare cualquier consumidor**, enumerándolos con
  // git sobre el repo entero. Es la afirmación que de verdad importa: el cartel
  // tiene que estar arriba de TODOS, no de un default que ya nadie usa.
  const cartel = fs.readFileSync(path.join(RAIZ, "components/operador/ModalPedirOperador.jsx"), "utf8");
  const zCartel = Number(cartel.match(/fixed inset-0 z-\[(\d+)\]/)[1]);

  const consumidores = consumidoresDelKit();
  let masAlto = 0;
  let quien = "(ninguno declara z)";
  for (const ruta of consumidores) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    for (const m of texto.matchAll(/\n\s*z=\{(\d+)\}/g)) {
      if (Number(m[1]) > masAlto) { masAlto = Number(m[1]); quien = ruta; }
    }
  }
  assert.ok(masAlto > 0, "ningún consumidor declara `z`: el candado no está midiendo nada");
  assert.ok(
    zCartel > masAlto,
    `el cartel quedó en ${zCartel} y el modal más alto es ${masAlto} (${quien})`
  );
});

// ── EL INTERIOR NO SE REPINTA ──────────────────────────────────────────────

test("el espaciado del cuerpo y del pie es parámetro", () => {
  // `espacioCuerpo` PERDIÓ su default el 2026-08-15 y ahora lo obliga el candado
  // de más abajo — ver "`espacioCuerpo` NO TIENE DEFAULT". Lo que este sigue
  // afirmando es que los dos son parámetros y no valores clavados.
  assert.match(SRC, /^\s*espacioCuerpo,\s*$/m, "`espacioCuerpo` dejó de ser parámetro");
  assert.match(SRC, /espacioPie = "mt-3"/, "cambió el default del pie: eso sí mueve los que no lo declaran");
});

test("EL `gap-3` NO ESTÁ CLAVADO en el cuerpo", () => {
  // Si volviera a estarlo, migrar la capa de una pantalla le separaría todos los
  // campos del formulario — que es exactamente lo que emparejar NO es.
  const cuerpo = SRC.slice(SRC.indexOf("flex flex-col ${altoEnElCuerpo}"), SRC.indexOf("{children}"));
  assert.doesNotMatch(cuerpo, /gap-3/, "el gap volvió a ser fijo");
  assert.doesNotMatch(cuerpo, /mt-2/, "el margen volvió a ser fijo");
  // El `?? ""` es para que un consumidor que se olvide no escriba la palabra
  // "undefined" adentro del `class`. No es un default: quien obliga a declararlo
  // es el candado de más abajo.
  assert.match(cuerpo, /\$\{espacioCuerpo \?\? ""\}/);
});

test("EL CUERPO ACEPTA UNA REFERENCIA, y va en el div que scrollea", () => {
  // `ModalProveedor` la usa para mandar el scroll arriba al reabrirse. Si la
  // referencia terminara en otro div —la capa, el panel, la tarjeta— la pantalla
  // seguiría compilando y el scroll no volvería nunca: `scrollTop = 0` sobre algo
  // que no scrollea no hace nada y no avisa.
  const cuerpo = SRC.slice(SRC.indexOf("ref={refCuerpo}"), SRC.indexOf("{children}"));
  assert.match(cuerpo, /\$\{altoEnElCuerpo\}/, "la referencia no está en el div que lleva el alto");
  assert.match(cuerpo, /overflow-y-auto/, "la referencia no está en el div que scrollea");
});

test("EL ALTO ES UNO SOLO, Y SU DESTINO LO DERIVA LA FORMA POR DEFAULT", () => {
  // El VALOR sigue siendo uno: mismo patrón que el `z`. Lo que cambió el
  // 2026-08-14 es que su DESTINO pasó a ser una excepción declarable — ver el
  // test de abajo, que fija que el default no se movió.
  const firma = SRC.slice(SRC.indexOf("export default function"), SRC.indexOf("}) {"));
  const altos = [...firma.matchAll(/^\s*(alto[A-Za-z]*)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(altos, ["alto"], `un segundo alto CON DEFAULT: ${altos.join(", ")}`);

  // Dónde cae cada forma, y que el cuerpo crezca contra la tarjeta cuando el
  // tope está allá: sin `min-h-0` un hijo flex no baja de su contenido y el
  // scroll no aparece nunca.
  assert.match(SRC, /const altoEnLaTarjeta = dondeVaElAlto === "tarjeta" \? alto : ""/);
  assert.match(SRC, /const altoEnElCuerpo = dondeVaElAlto === "cuerpo" \? alto : "flex-1 min-h-0"/);

  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const destino = (nombre) => {
    const i = bloque.indexOf(nombre);
    return (bloque.slice(i, bloque.indexOf("}", i)).match(/altoVa:\s*"(\w+)"/) || [])[1];
  };
  // ── `centrado` PASÓ DE "cuerpo" A "tarjeta" EL 2026-08-15 ────────────────
  //
  // Lo decidió la tabla de declaraciones: de los cinco modales que declaran
  // `alto`, los CINCO lo mandan a la tarjeta y ninguno al cuerpo. Y no es solo
  // estadística — con el tope en el cuerpo, la tarjeta mide el tope MÁS el
  // encabezado y el pie, así que con el default nuevo de 90vh `ModalRol` daba
  // 926 px en una ventana de 900 y arrancaba en y=−13, con el título afuera.
  //
  // El candado no se afloja: sigue exigiendo un destino exacto por forma, y si
  // alguien lo mueve otra vez tiene que venir con su medición.
  assert.equal(destino("centrado:"), "tarjeta");
  assert.equal(destino("hoja:"), "tarjeta");
  assert.equal(destino('"hoja-o-centrado"'), "tarjeta");
  // El cajón ya fija su alto con `h-full`: un tope encima sería contradictorio.
  assert.equal(destino("cajon:"), "ninguno");
});

test("EL DEFAULT DE `altoVa` NO SE MOVIÓ: sin declararlo, manda la forma", () => {
  // ── POR QUÉ ESTE CANDADO Y NO CAPTURAS DE LAS CUATRO FORMAS ────────────────
  //
  // La comprobación pedida era fotografiar un caso de cada forma antes y después
  // del cambio. Enumerado con `git grep` sobre `app` y `components`, HOY SOLO
  // UNA de las cuatro tiene una pantalla que se pueda abrir: de los 16
  // consumidores, 15 usan `centrado` por default y el único que declara forma es
  // `ModalCambioPrevio` con `hoja-o-centrado` — y vive bajo `pos-ventas`, detrás
  // de "No hay una caja abierta a tu nombre en este local". `hoja` y `cajon` no
  // tienen NINGÚN consumidor.
  //
  // O sea que para tres de las cuatro no hay foto posible sin fabricar la
  // condición. Este candado contesta la misma pregunta y de forma más fuerte:
  // afirma que la clase resuelta es la MISMA con y sin el parámetro.
  assert.match(
    SRC,
    /const dondeVaElAlto = altoVa \?\? f\.altoVa;/,
    "el destino tiene que caer en la forma cuando no se declara"
  );

  // Sin default en la firma: `altoVa = "cuerpo"` haría que centrado siguiera
  // andando y que hoja y cajón cambiaran en silencio.
  const firma = SRC.slice(SRC.indexOf("export default function"), SRC.indexOf("}) {"));
  assert.match(firma, /^\s*altoVa,\s*$/m, "`altoVa` no puede traer default: lo deriva la forma");

  // El `??` y no `||`: con `||` un `altoVa=""` caería a la forma sin que nadie
  // lo note, y con `??` solo cae si es undefined o null.
  assert.doesNotMatch(SRC, /altoVa \|\| f\.altoVa/, "con `||` una cadena vacía se traga el destino");
});

test("LA COLUMNA VIAJA CON EL ALTO, y solo si la forma no la trae", () => {
  // Cuando el tope va a la TARJETA, la tarjeta tiene que ser columna o el
  // `flex-1 min-h-0` del cuerpo no resuelve contra nada y el scroll no aparece.
  // `centrado` es la única forma sin `flex flex-col` propio.
  assert.match(SRC, /const columnaEnLaTarjeta =/);
  assert.match(SRC, /dondeVaElAlto === "tarjeta" && !\/\(\^\|\\s\)flex\(\\s\|\$\)\/\.test\(f\.tarjeta\)/);

  // Y tiene que llegar a la tarjeta, no quedarse calculada.
  const tarjeta = SRC.slice(SRC.indexOf("<SunmiCard"), SRC.indexOf("shrink-0 flex items-start"));
  assert.match(tarjeta, /columnaEnLaTarjeta/, "se calcula y no se usa");
});

/**
 * Los consumidores que NO declaran un prop que el kit ya no tiene por default.
 *
 * Cuenta APERTURAS contra DECLARACIONES y no busca una sola aparición: hay
 * archivos con más de un modal —`clientes/page.jsx` tiene tres,
 * `PanelComprobantes` dos— y con "aparece una vez" alcanzaría con declararlo en
 * uno solo para que el candado se callara.
 */
function sinDeclararlo(consumidores, prop) {
  const faltan = [];
  for (const ruta of consumidores) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    const modales = (texto.match(/<SunmiModalLayout/g) || []).length;
    const declara = (texto.match(new RegExp("\\n\\s*" + prop, "g")) || []).length;
    if (declara < modales) faltan.push(`${ruta} (${declara} de ${modales})`);
  }
  return faltan;
}

// ── `Escape` SIGUE LA MISMA REGLA QUE EL VELO ──────────────────────────────

test("ESCAPE Y EL VELO DECIDEN CON LO MISMO", () => {
  // ── QUÉ AFIRMA, Y POR QUÉ NO ES DECORATIVO ────────────────────────────────
  //
  // `destructivo` existe para que un clic afuera no tire un formulario escrito.
  // `Escape` es el mismo accidente por otra tecla, así que tiene que decidir con
  // lo mismo: cierra donde el velo cierra y no cierra donde el velo no cierra.
  //
  // Si alguien le agrega una condición propia a uno de los dos, las 22 pantallas
  // pasan a tener DOS reglas y ninguna declaración que las distinga — que es
  // exactamente la clase de cosa que después nadie encuentra.
  //
  // ── EL ANCLA ──────────────────────────────────────────────────────────────
  //
  // Se ancla en los nombres —`cierraElVelo`, `PILA`, `marca`— y NO en un
  // `return (` ni en un número de línea. Ya nos pasó: el candado del `z`
  // delimitaba con `indexOf("return (")` y el día que la capa se mudó a una
  // constante se puso en rojo sin que nada de lo que afirmaba se hubiera roto.
  // Y si estos nombres se mudan, los `assert.notEqual` de abajo lo dicen con
  // todas las letras en vez de dejar pasar un vacío.
  // ── Y SE MIRA EL CÓDIGO, NO LOS COMENTARIOS ───────────────────────────────
  //
  // La primera versión de este candado daba VERDE con el chequeo de
  // `destructivo` sacado: encontraba la palabra en un comentario de tres líneas
  // más arriba. Es el mismo defecto que ya cobró dos veces —un contador que
  // sumaba por un comentario, y otro candado que se anclaba a un texto— y acá lo
  // atrapó la contraprueba, que para eso está. Sin ejercer la versión mala, el
  // candado habría quedado escrito, en verde, y sin afirmar nada.
  const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "");

  const iVelo = SRC.indexOf("const cierraElVelo");
  assert.notEqual(iVelo, -1, "se movió `cierraElVelo`: reanclar este candado, no borrarlo");
  const velo = sinComentarios(SRC.slice(iVelo, SRC.indexOf("\n", iVelo)));

  const iEsc = SRC.indexOf("const alTeclado");
  assert.notEqual(iEsc, -1, "se movió el escucha de teclado: reanclar este candado, no borrarlo");
  const escape = sinComentarios(SRC.slice(iEsc, SRC.indexOf("document.addEventListener", iEsc)));

  // Los dos miran EXACTAMENTE los mismos dos datos, y ninguno mira nada más.
  for (const [nombre, bloque] of [["el velo", velo], ["Escape", escape]]) {
    assert.match(bloque, /destructivo/, `${nombre} dejó de mirar \`destructivo\``);
    assert.match(bloque, /onClose/, `${nombre} dejó de mirar \`onClose\``);
  }
  // Y que Escape no se haya inventado una tercera condición: las únicas palabras
  // del kit que puede nombrar son esas dos, más las de la pila.
  const inventadas = (escape.match(/\b(forma|alto|altoVa|z|encabezado|footer|subtitle|title)\b/g) || []);
  assert.deepEqual(
    inventadas,
    [],
    `Escape se ganó una condición propia que el velo no tiene: ${inventadas.join(", ")}`
  );
});

test("ESCAPE CIERRA EL DE ARRIBA, NO LOS DOS", () => {
  // Con dos modales abiertos, un escucha por modal sobre `document` los recibe
  // TODOS. Sin la pila, una sola tecla cerraría las dos capas.
  //
  // Ejercido con `app/andamio-escape`: abiertos los dos y mandando una sola
  // tecla, el de arriba se cierra y el de abajo queda. Este candado fija el
  // mecanismo que lo consigue.
  assert.match(SRC, /const PILA = \[\]/, "desapareció la pila de modales abiertos");
  assert.match(
    SRC,
    /if \(PILA\[PILA\.length - 1\] !== marca\) return;/,
    "se fue el chequeo de 'solo el de arriba contesta': Escape vuelve a cerrar los dos"
  );
  // Y que la pila se limpie: sin el `splice` del cleanup, un modal cerrado
  // seguiría siendo el 'de arriba' y taparía al que quede abierto.
  assert.match(SRC, /PILA\.splice\(i, 1\)/, "la pila no se limpia al cerrar");
});

test("`espacioCuerpo` NO TIENE DEFAULT, y los 22 modales lo declaran", () => {
  // ── POR QUÉ SE LE SACÓ ────────────────────────────────────────────────────
  //
  // Tenía `"mt-2 gap-3"`. La tabla de declaraciones mostró que 17 de los 22 lo
  // declaran y OCHO de esos lo declaran VACÍO. Un default que un tercio pisa con
  // la nada no es el caso común: es lo que le toca al que no sabe que tiene que
  // decidirlo.
  //
  // Sacarlo mueve CERO pantallas y cuesta cinco declaraciones. La alternativa
  // —cambiarlo a vacío— movía cinco modales que NO SE PUEDEN ABRIR con los datos
  // de hoy, o sea que el cambio no se podía fotografiar.
  assert.doesNotMatch(
    SRC,
    /espacioCuerpo\s*=\s*"/,
    "le volvió el default a `espacioCuerpo`: eso es lo que este candado saca"
  );

  // Y que TODOS lo declaren, enumerando con git sobre el repo entero. Sin esto,
  // sacar el default sería empeorar: un modal nuevo nacería sin espaciado y sin
  // que nadie avisara.
  const consumidores = consumidoresDelKit();
  assert.deepEqual(
    sinDeclararlo(consumidores, "espacioCuerpo="),
    [],
    "estos modales no declaran `espacioCuerpo` y el kit ya no tiene uno que ponerles"
  );
});

test("`z` NO TIENE DEFAULT, y los 22 modales lo declaran", () => {
  // Misma forma que el de `espacioCuerpo`, y por un motivo más caro: un modal
  // que se quede sin `z` no se ve raro — se ve bien hasta el día que algo de
  // afuera se le pone encima.
  const consumidores = consumidoresDelKit();
  assert.deepEqual(
    sinDeclararlo(consumidores, "z="),
    [],
    "estos modales no declaran `z` y el kit ya no tiene uno que ponerles"
  );
});

test("el default del alto es 90vh, y moverlo mueve pantallas", () => {
  // ── DECÍA 65vh, Y SE CAMBIÓ MIDIENDO ────────────────────────────────────
  //
  // `max-h-[65vh]` era un default que **ninguno de los 22 modales elegía**, y ya
  // había cobrado uno: la migración de `CarritoPedido` lo tomó por no declarar
  // nada y la hoja quedó a 416 px de alto contra 574 —640 × 0,65—.
  //
  // El cambio se verificó con capturas en los dos anchos: a 1366 se mueven dos
  // —`ModalLocal` 701→759 y `ModalRol` 701→810, las dos entrando— y a 360 se
  // mueven cuatro, todas quedando en 576, que es 90vh de 640, y todas entrando
  // en la ventana con su botón de cerrar visible. `ModalCategoria` y
  // `ModalOperador` no se movieron ni un píxel en ninguno de los dos anchos.
  //
  // El candado sigue siendo el mismo candado: fija el número para que cambiarlo
  // vuelva a costar una medición.
  assert.match(SRC, /alto = "max-h-\[90vh\]"/, "cambió el default: eso mueve todos los migrados");
  const cuerpo = SRC.slice(SRC.indexOf("flex flex-col ${altoEnElCuerpo}"), SRC.indexOf("{children}"));
  assert.match(cuerpo, /overflow-y-auto/, "el scroll sí sigue clavado: sin él un modal largo empuja la pantalla");
});

// ── EL REDONDEO LO DERIVA LA FORMA ─────────────────────────────────────────

test("UNA HOJA SE REDONDEA ARRIBA Y QUEDA RECTA ABAJO", () => {
  // Una hoja pegada al borde con las esquinas de abajo redondeadas deja dos
  // medialunas de fondo y se ve rota. Es parte de lo que la forma significa, no
  // una preferencia: si lo declarara la pantalla, la próxima que use `hoja` y se
  // olvide nace mal.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const forma = (nombre) => {
    const i = bloque.indexOf(nombre);
    return bloque.slice(i, bloque.indexOf("}", i));
  };
  for (const nombre of ["hoja:", '"hoja-o-centrado"']) {
    const f = forma(nombre);
    assert.match(f, /!rounded-t-2xl/, `${nombre} no redondea arriba`);
    assert.match(f, /!rounded-b-none/, `${nombre} no queda recta abajo`);
    // Y la columna, por la misma razón que el redondeo: una hoja cuyo pie se va
    // con el scroll está rota. `cajon` ya lo llevaba desde antes.
    assert.match(f, /flex flex-col/, `${nombre} no es columna: el pie se iría con el scroll`);
  }
  // Y la que se centra de `sm` para arriba recupera las cuatro esquinas ahí.
  assert.match(forma('"hoja-o-centrado"'), /sm:!rounded-t-xl sm:!rounded-b-xl/);
  // La centrada no declara nada: se queda con el `rounded-xl` de la tarjeta.
  assert.doesNotMatch(forma("centrado:"), /rounded/);
});

test("LO QUE LA TARJETA RECIBE VIENE CON `!`, PORQUE SunmiCard CONCATENA", () => {
  // Sin `!important` gana la clase que Tailwind haya escrito última en la hoja
  // de estilos, no la que alguien quiso. Es el defecto que ya se comió una vez:
  // el `p-0 overflow-hidden` de tres modales nunca hizo nada y nadie lo sabía.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  for (const m of bloque.matchAll(/tarjeta:\s*"([^"]*)"/g)) {
    for (const token of m[1].split(/\s+/).filter(Boolean)) {
      if (/^(h-full|flex|flex-col)$/.test(token)) continue; // estructura, no pelea con nada
      assert.match(token, /^[a-z0-9:]*!/, `la forma pasa "${token}" sin !: no le va a ganar a SunmiCard`);
    }
  }
});

test("LA TARJETA LLEVA SU MARCA, que es lo que la hace comparable", () => {
  // El arnés recorta por selector y el antes y el después tienen que compartirlo.
  // Un selector posicional se rompe en cada migración, porque la tarjeta deja de
  // ser el primer hijo de la capa en cuanto aparece el velo. Si esta marca se
  // cae, la comparación byte a byte se pierde y nadie se entera hasta la
  // siguiente tanda.
  assert.match(SRC, /data-sunmi-modal="tarjeta"/);
  // Y que SunmiCard reenvíe lo que le llega, o la marca no llega al DOM.
  const card = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiCard.jsx"), "utf8");
  assert.match(card, /\.\.\.props/, "SunmiCard dejó de reenviar props: la marca no llega al DOM");
  assert.match(card, /<div\s*\n?\s*\{\.\.\.props\}/, "los props no se reenvían al div");
});

test("el padding y la sombra de la tarjeta son props, con el default del kit", () => {
  // La alternativa era hacer negociable el className de SunmiCard, y se descartó
  // contando: 246 usos, 151 con className, 109 declaran padding. Todas dibujan
  // 21px hoy porque el p-6 de la pieza les gana; negociar movería media
  // aplicación por una pantalla.
  assert.match(SRC, /paddingTarjeta = ""/);
  assert.match(SRC, /sombraTarjeta = ""/);

  // LAS PIEZAS DEL `className` DE LA TARJETA, EN ORDEN Y SIN NINGUNA DE MÁS.
  //
  // Afirmaba el array literal en una línea y se puso en rojo el 2026-08-14 al
  // entrar `columnaEnLaTarjeta`, que es exactamente para lo que servía: avisar
  // cuando algo se mete en la composición de la tarjeta. Se reescribe leyendo el
  // bloque real y normalizando espacios, así sigue afirmando lo mismo —qué
  // compone la tarjeta, en qué orden y nada más— sin romperse porque el array
  // ahora se escriba en varias líneas.
  const desdeLaTarjeta = SRC.indexOf("<SunmiCard");
  const abre = SRC.indexOf("className={[", desdeLaTarjeta);
  const lista = SRC.slice(abre, SRC.indexOf("]", abre) + 1);
  const piezas = lista
    .replace(/\s+/g, " ")
    .match(/\[(.*)\]/)[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.deepEqual(
    piezas,
    ["f.tarjeta", "columnaEnLaTarjeta", "altoEnLaTarjeta", "paddingTarjeta", "sombraTarjeta"],
    piezas.join(" | ")
  );
});

// ── ACCESIBILIDAD ──────────────────────────────────────────────────────────

test("acepta las etiquetas y cae al título cuando no le pasan ninguna", () => {
  assert.match(SRC, /"aria-label": ariaLabel/);
  assert.match(SRC, /"aria-labelledby": ariaLabelledBy/);
  assert.match(SRC, /role = "dialog"/);
  assert.match(SRC, /aria-modal="true"/);
  assert.match(SRC, /ariaLabel \?\? \(ariaLabelledBy \? undefined : title\)/);
});

// ── QUIÉN DECLARA `destructivo` Y QUIÉN NO ─────────────────────────────────

test("LOS FORMULARIOS NO SE CIERRAN AL TOCAR EL VELO, Y LOS DEMÁS SÍ", () => {
  // El criterio es qué se PIERDE al cerrar sin querer, no qué tan peligrosa es
  // la acción. Está escrito al lado del prop y la lista se decidió abriendo cada
  // pantalla, una por una.
  //
  // Este candado existe porque la decisión no vive en ningún lado del código:
  // sin él, un modal de carga nuevo nace cerrando al tocar afuera y nadie se
  // entera hasta que alguien pierde un formulario lleno.
  const declaran = {
    // Carga y edición: hay algo escrito que se puede perder.
    "components/locales/ModalLocal.jsx": true,
    "components/proveedores/ModalProveedor.jsx": true,
    "components/usuarios/ModalUsuario.jsx": true,
    "components/operadores/ModalOperador.jsx": true,
    "components/roles/ModalRol.jsx": true,
    "components/categorias/ModalCategoria.jsx": true,
    "components/compras-proveedor/ModalVincularCodigo.jsx": true,
    "components/listas-precios/ModalListaPrecio.jsx": true,
    "components/caja/ModalCambioPrevio.jsx": true,
    // Stock: los dos son formularios cortos pero se pierde lo escrito —la
    // cantidad y su motivo en uno, los dos límites en el otro—. Y hay un motivo
    // extra que no es de criterio sino de CONSERVAR: los dos estaban armados a
    // mano con un `fixed inset-0` SIN `onClick` en la capa, así que tocar afuera
    // nunca cerró. Migrarlos al kit sin declarar esto habría cambiado el
    // comportamiento en vez de conservarlo.
    "components/stock_locales/ModalAjuste.jsx": true,
    "components/stock_locales/ModalLimites.jsx": true,
    // Alta y edición de grupo: nombre escrito más los locales y depósitos que se
    // fueron agregando. Cerrar sin querer tira todo eso.
    "components/grupos/ModalGrupo.jsx": true,
    // Unificar duplicados: no se escribe un formulario, pero se ARMA una
    // selección —el cliente principal elegido más los duplicados tildados uno por
    // uno—, y rehacerla cuesta lo mismo que rellenar un formulario. El criterio
    // es qué se pierde, y acá se pierde el trabajo de haberlos encontrado.
    "components/clientes/ModalMergeClientes.jsx": true,
    // El formulario más largo del sistema. Y acá el criterio de qué se pierde no
    // es lo único: la capa hecha a mano NO TENÍA `onClick`, así que hoy tocar
    // afuera no cierra. Sin declararlo, migrar habría CAMBIADO el comportamiento
    // en vez de conservarlo.
    "components/productos/ModalProductoFinal.jsx": true,
    // Informativos, de confirmación y de selección: cerrarlos no pierde nada.
    // `ModalPreviewPrecio` tiene un campo y NO lleva destructivo a propósito: lo
    // único que se escribe ahí es el buscador, y perder un término de búsqueda
    // no es perder nada. El criterio es qué se pierde, no si hay un input.
    "components/listas-precios/ModalPreviewPrecio.jsx": false,
    // Se vuelven a abrir y listo.
    "components/productos/ModalVerComposicion.jsx": false,
    "components/proveedores/ModalCodigosProveedor.jsx": false,
    "components/compras-proveedor/ModalEnviarPedido.jsx": false,
    "components/comprobantes/PanelComprobantes.jsx": false,
    // Estos dos lo declaran por el criterio VIEJO —la acción es peligrosa— y
    // quedan así a propósito. Se revisan al cerrar la fase 2, junto con el
    // renombre de `destructivo`.
    "components/proveedores/listas/ModalRevertir.jsx": true,
    "components/proveedores/listas/ModalTerminar.jsx": true,
    // ── EL ÚNICO ARCHIVO CON DOS MODALES, Y NO CONTESTAN LO MISMO ────────────
    //
    // `app/modulos/clientes/page.jsx` tiene "Cuenta Corriente", que SÍ lo declara
    // —sus mini-formularios de pago y ajuste tienen monto y nota escritos—, y
    // "Historial de Ventas", que NO, porque es de solo lectura.
    //
    // Este chequeo mira el ARCHIVO, así que solo puede afirmar que alguno lo
    // declara. Es la misma limitación que el contador tenía hasta el 2026-08-14
    // —la unidad es el archivo cuando debería ser la capa— y queda anotada acá
    // para que se arregle con la misma forma el día que un archivo tenga dos
    // modales que difieran EN CONTRA: uno que deba declararlo y no lo haga.
    // Hoy no puede pasar sin que alguien lo vea, porque son dos.
    "app/modulos/clientes/page.jsx": true,
    // ── LOS ANDAMIOS TAMBIÉN ENTRAN A ESTA LISTA ──────────────────────────
    //
    // Desde el 2026-08-15 los andamios se commitean, con su guardia de entorno
    // —`scripts/andamiosNoSeCommitean.test.mjs`—, así que son consumidores de la
    // pieza como cualquier otro y les toca contestar lo mismo.
    //
    // Los dos contestan que NO, y por el criterio de siempre: no hay nada
    // escrito que perder. `andamio-velo` es una foto del velo, y los dos modales
    // de `andamio-escape` solo tienen texto fijo.
    //
    // Y `andamio-escape` no necesita declararlo para lo que mide: la rama de
    // "Escape NO cierra" se ejerció sobre `ModalRol`, una pantalla de verdad. El
    // andamio existe para la otra pregunta —cuál de dos capas se cierra— y para
    // eso los dos tienen que cerrar.
    //
    // (Un conteo rápido de la palabra en ese archivo da 1, y es un COMENTARIO
    // que la nombra. La declaración es cero. Cuarta vez del mismo patrón en este
    // repo; está en `CLAUDE.md`.)
    "app/andamio-velo/page.jsx": false,
    "app/andamio-escape/page.jsx": false,
    // ── LAS TRES HOJAS DE PRODUCTOS EN EL CELULAR (issue #2) ──────────────
    //
    // Las tres contestan que NO, y por el criterio de siempre: **el velo no
    // cierra cuando cerrar sin querer PIERDE algo**. Ninguna tiene nada que
    // perder, y conviene decir por qué una por una en vez de agruparlas:
    //
    // · `HojaMasAcciones` es un menú. Se toca una opción y se va a otro lado; no
    //   hay nada escrito adentro.
    //
    // · `HojaPersonalizarTarjeta` son interruptores que se guardan al tocarlos,
    //   así que al cerrar ya está todo guardado. Y es reversible: se vuelve a
    //   abrir y se prende lo que se apagó.
    //
    // · `app/modulos/productos/page.jsx` es la hoja de FILTROS del celular, y es
    //   la única de las tres que tiene un campo de texto. Igual contesta que no:
    //   los filtros se aplican MIENTRAS se escriben —el listado de atrás ya
    //   cambió—, así que cerrar el velo no descarta nada. Lo que se escribió
    //   sigue puesto al reabrirla.
    //
    // (Ese archivo tiene además `ModalProducto` y `ModalVerComposicion`, pero son
    // componentes aparte: acá la unidad sigue siendo el archivo y no la capa, y
    // esta página usa la pieza una sola vez.)
    "components/productos/HojaMasAcciones.jsx": false,
    "components/productos/HojaPersonalizarTarjeta.jsx": false,
    "app/modulos/productos/page.jsx": false,
  };

  // Que la lista sea TODOS los que usan la pieza, no los que alguien recordó.
  // Enumerado sobre el repo entero, no sobre una carpeta.
  const usan = consumidoresDelKit();
  assert.deepEqual(
    usan.sort(),
    Object.keys(declaran).sort(),
    "apareció o desapareció un consumidor de la pieza y esta lista no lo dice"
  );

  for (const [ruta, esperado] of Object.entries(declaran)) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    // Se busca el prop pasado a la pieza, no la palabra suelta.
    const loPasa = /\n\s*destructivo(\s*=\s*\{?(true|false)\}?)?\s*\n/.test(texto);

    // ── EL QUE PROTEGE POR PASO SE COMPRUEBA APARTE ────────────────────────
    //
    // Va en su propia rama justamente para NO tocar el regex de arriba: ése
    // sigue aceptando solo literales, que es lo que hace que una expresión
    // cualquiera no pase por decisión tomada. Acá la comparación es contra el
    // texto exacto que se registró, no contra un patrón que lo generalice.
    if (typeof esperado === "object") {
      assert.equal(
        loPasa,
        false,
        `${ruta} tiene una política por paso registrada y además pasa un literal: o cambió el modal o sobra la política`
      );
      assert.ok(
        texto.includes(esperado.expresion),
        `${ruta} no pasa exactamente \`${esperado.expresion}\`, así que la política registrada no es la que el modal aplica`
      );
      // Y que los pasos EXISTAN. Sin esto la expresión podría nombrar un estado
      // que el modal no alcanza nunca —un typo alcanza— y el velo protegería
      // siempre o nunca, con el candado igual de verde. Lo que hace que esto
      // afirme "solo protege en revisar" no es la expresión: es que los otros
      // dos pasos se comprueben reales.
      for (const paso of [esperado.protegeSolo, ...esperado.sinProteger]) {
        assert.match(
          texto,
          new RegExp(`setEstado\\("${paso}"\\)`),
          `${ruta} nombra el paso "${paso}" pero nada lo pone: la política habla de un estado que no ocurre`
        );
      }
      continue;
    }

    assert.equal(
      loPasa,
      esperado,
      esperado
        ? `${ruta} es de carga o edición y dejó de declarar destructivo: el velo le tira lo escrito`
        : `${ruta} no tiene nada que perder al cerrarse y declara destructivo de más`
    );
  }
});

test("los cuatro usos de hoy NO pasan forma: el default es el de siempre", () => {
  // Si alguno pasara una forma, esta tanda habría migrado algo, y no es lo que
  // se acordó: la pieza cambia, las pantallas no.
  const usos = [
    "components/comprobantes/PanelComprobantes.jsx",
    "components/productos/ModalVerComposicion.jsx",
    "components/proveedores/listas/ModalRevertir.jsx",
    "components/proveedores/listas/ModalTerminar.jsx",
  ];
  for (const ruta of usos) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.match(texto, /SunmiModalLayout/, `${ruta} dejó de usar el modal`);
    assert.doesNotMatch(texto, /forma=/, `${ruta} ya está migrado y esta tanda no migraba nada`);
  }
});
