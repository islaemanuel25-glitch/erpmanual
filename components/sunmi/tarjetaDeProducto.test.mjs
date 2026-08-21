// CANDADOS DE LA TARJETA DE PRODUCTO, después de sacarle la capa.
//
// La capa que se superponía al tocar se eliminó por decisión de diseño: si los
// botones están a la vista, no hay nada que abrir. Lo que estos candados
// defienden es que no vuelva por la puerta de atrás y que la fila que la
// reemplaza tenga lo que tiene que tener.
//
// La sonda `scripts/sonda-tarjeta-producto.mjs` mide esto MISMO sobre la
// pantalla corriendo. Estos son el hermano barato: viajan en la suite, no
// necesitan navegador ni sesión, y se ponen rojos en el commit y no en el
// despliegue. Ninguno reemplaza al otro — éstos miran el código, la sonda mira
// lo que el código PRODUCE.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
// Los comentarios se sacan ANTES de mirar: un candado que busca texto encuentra
// la prosa que lo explica y se pone verde por el motivo equivocado. Ya pasó tres
// veces en este repo, y la peor fue un VERDE falso.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const TARJETA = leer("components/sunmi/SunmiProductoCard.jsx");
const PAGINA = leer("app/modulos/productos/page.jsx");
const ANDAMIO = leer("app/andamio-producto-card/page.jsx");

test("LA CAPA NO VUELVE: la tarjeta no tiene estado ni nada superpuesto", () => {
  assert.doesNotMatch(TARJETA, /absolute inset-0/, "volvió la capa superpuesta");
  assert.doesNotMatch(TARJETA, /\babierta\b/, "volvió la prop de abierta/cerrada");
  assert.doesNotMatch(TARJETA, /\bonToggle\b/, "volvió el disparador de la capa");
  // Y la pantalla tampoco puede volver a guardar cuál está abierta.
  assert.doesNotMatch(PAGINA, /tarjetaAbierta/, "volvió el estado en la pantalla");
});

test("los dos íconos que quedan son del núcleo, no props", () => {
  // Si cada pantalla eligiera los suyos, dos listas del mismo ERP marcarían el
  // mismo dato con dibujos distintos.
  assert.match(TARJETA, /<Tag/, "falta el ícono de la etiqueta en la equivalencia");
  assert.match(TARJETA, /<Barcode/, "falta el ícono del código de barras en el pie");
});

test("EL ÍCONO DEL NOMBRE NO VUELVE sin una medición nueva", () => {
  // Se sacó con su número: era el MISMO cubo para 2.231 de los 2.377 productos
  // activos —el 93,9 %—, así que no distinguía nada y se comía 24 px de ancho
  // del nombre en todas las tarjetas. Las únicas distinciones reales del dato
  // son combo (142) y servicio (4); las que sí parten el catálogo —bulto, kilo,
  // unidad— ya están dichas con palabras en el rótulo de escala.
  //
  // Este candado no dice "nunca": dice que reponerlo cuesta volver a medir.
  assert.doesNotMatch(TARJETA, /<Package/, "volvió el ícono del nombre");
  assert.doesNotMatch(TARJETA, /Package/, "quedó el import sin uso");
});

test("el pie ROTULA el código interno en vez de la almohadilla", () => {
  assert.match(TARJETA, /Cod\. int\./);
  // La almohadilla no dice de qué código es. Se busca la forma exacta que tenía,
  // `#{codigoInterno}`, y no un `#` suelto que aparece en mil lados.
  assert.doesNotMatch(TARJETA, /#\{codigoInterno\}/);
});

test("lo que falta se DICE, no se borra el renglón", () => {
  // Un renglón que desaparece deja esa tarjeta más baja que las vecinas —el
  // defecto que ya costó emparejar la lista— y además pierde el dato.
  assert.match(TARJETA, /proveedor no especificado/);
  assert.match(TARJETA, /sin código de barras/);
});

test("la fila de acciones existe y separa con la línea del kit", () => {
  // `divide-x` dibuja el borde SOLO entre hijos: escribirlo en cada botón deja
  // una línea colgando en el último.
  assert.match(TARJETA, /divide-x/);
  // Y el color sale del token del kit, no de un gris escrito acá.
  assert.match(TARJETA, /divide-x sunmi-divider/);
});

test("EL BOTÓN DE LA FILA VIVE EN EL KIT, no en la pantalla", () => {
  // Si cada pantalla escribiera el suyo, stock y pedidos tendrían acciones de
  // distinto alto en la misma lista.
  assert.match(TARJETA, /export function AccionTarjeta/);
  assert.match(PAGINA, /import SunmiProductoCard, \{ AccionTarjeta \}/);
  assert.doesNotMatch(PAGINA, /function AccionTarjeta/, "la pantalla se escribió el suyo");
});

test("LA PANTALLA PASA SU BOTÓN, y el andamio sigue ejerciendo dos", () => {
  // ── QUÉ AFIRMABA ANTES Y POR QUÉ CAMBIA ─────────────────────────────────
  //
  // Exigía DOS botones —Ver y Editar— en la pantalla y en el andamio. El issue #2
  // saca "Ver" de la tarjeta: Editar queda como única acción, y con un solo botón
  // la fila deja de partirse en dos, así que el blanco táctil pasa de media
  // tarjeta a la tarjeta entera. La ficha de sólo lectura no se borró —se llega
  // desde la tabla de escritorio—, lo que se fue es el botón.
  //
  // Lo que el candado defiende NO cambia y por eso no se borra: el hueco de
  // "nadie comprueba que la página se lo pase". Una pieza puede estar perfecta y
  // la pantalla no usarla.
  //
  // Se separan los dos consumidores porque ya no afirman lo mismo:
  const enLaPantalla = (PAGINA.match(/<AccionTarjeta/g) || []).length;
  assert.equal(enLaPantalla, 1, "la pantalla tiene que dibujar Editar, y nada más");
  assert.match(PAGINA, /icono=\{Pencil\}/, "la pantalla: falta el ícono de Editar");
  assert.doesNotMatch(
    PAGINA,
    /icono=\{Eye\}/,
    "volvió el botón Ver a la tarjeta: el issue #2 lo sacó"
  );

  // El ANDAMIO conserva los dos, y es a propósito: la pieza del kit sigue
  // aceptando varias acciones —stock y pedidos las van a usar— y el andamio es lo
  // único que ejerce el separador entre botones. Con un solo botón, `divide-x` no
  // dibuja ninguna línea y ese caso dejaría de probarse.
  const enElAndamio = (ANDAMIO.match(/<AccionTarjeta/g) || []).length;
  assert.equal(enElAndamio, 2, "el andamio tiene que seguir ejerciendo dos acciones");
  assert.match(ANDAMIO, /icono=\{Pencil\}/, "el andamio: falta el ícono de Editar");
});

test("los botones del andamio HACEN algo", () => {
  // Un botón de mentira en un andamio no prueba que la acción exista: prueba que
  // el kit sabe dibujar dos botones, que no era la pregunta. Ya despistó una vez.
  const conManejador = (ANDAMIO.match(/<AccionTarjeta[^>]*onClick=/g) || []).length;
  assert.equal(conManejador, 2, "los dos botones del andamio tienen que responder");
});
