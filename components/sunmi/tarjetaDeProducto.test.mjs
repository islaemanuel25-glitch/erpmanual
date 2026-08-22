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
// El envoltorio de las dos caras. La pantalla dejó de montar la pieza del kit
// directo: ahora monta esto, y esto monta la pieza. Los candados que hablaban de
// "la pantalla" tienen que mirar acá o quedan afirmando sobre el archivo
// equivocado — que es la forma en que un candado se pone verde sin defender nada.
const ENVOLTORIO = leer("components/productos/TarjetaProductoMovil.jsx");

test("LA CAPA NO VUELVE: la tarjeta no tiene estado ni nada superpuesto", () => {
  assert.doesNotMatch(TARJETA, /absolute inset-0/, "volvió la capa superpuesta");
  assert.doesNotMatch(TARJETA, /\babierta\b/, "volvió la prop de abierta/cerrada");
  assert.doesNotMatch(TARJETA, /\bonToggle\b/, "volvió el disparador de la capa");
  // Y la pantalla tampoco puede volver a guardar cuál está abierta.
  assert.doesNotMatch(PAGINA, /tarjetaAbierta/, "volvió el estado en la pantalla");
});

test("el ícono que queda es del núcleo, no una prop", () => {
  // Si cada pantalla eligiera los suyos, dos listas del mismo ERP marcarían el
  // mismo dato con dibujos distintos.
  //
  // ── ERAN DOS Y QUEDÓ UNO ────────────────────────────────────────────────
  //
  // `Tag` marcaba la franja de equivalencia como "esto es la escala del precio".
  // La franja se fue: la escala viaja pegada al número, en palabras, y un ícono
  // para eso sería un dibujo repitiendo lo que el texto ya dice.
  assert.match(TARJETA, /<Barcode/, "falta el ícono del código de barras en el pie");
  assert.doesNotMatch(TARJETA, /\bTag\b/, "quedó el ícono de la franja, o su import sin uso");
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

test("el pie ROTULA el código, y dice DE QUIÉN es", () => {
  // ── EL RÓTULO CAMBIÓ, Y NO ES COSMÉTICO ─────────────────────────────────
  //
  // Decía "Cod. int.", y debajo de ese rótulo la pantalla llegó a poner el ID
  // del producto. "Cod. prov." dice de quién es el código: del PROVEEDOR. Con
  // ese nombre, poner ahí un id se ve mal a simple vista.
  assert.match(TARJETA, /Cod\. prov\./);
  // La almohadilla no dice de qué código es. Se busca la forma exacta que tenía,
  // `#{codigoInterno}`, y no un `#` suelto que aparece en mil lados.
  assert.doesNotMatch(TARJETA, /#\{codigoInterno\}/);
});

test("lo que falta se DICE, no se borra el renglón", () => {
  // Un renglón que desaparece deja esa tarjeta más baja que las vecinas —el
  // defecto que ya costó emparejar la lista— y además pierde el dato.
  assert.match(TARJETA, /Sin proveedor/);
  assert.match(TARJETA, /sin código de barras/);
  // ── Y EL DEL PROVEEDOR AHORA TAMBIÉN ────────────────────────────────────
  //
  // Antes el slot desaparecía sin decir nada, y podía hacerlo porque mostraba el
  // id: nunca faltaba. Con el dato correcto faltar es lo habitual, y un hueco
  // deja sin contestar por qué ese producto no machea contra la lista del
  // proveedor.
  assert.match(TARJETA, /Sin cód\. prov\./);
});

test("la fila de acciones existe y separa con la línea del kit", () => {
  // `divide-x` dibuja el borde SOLO entre hijos: escribirlo en cada botón deja
  // una línea colgando en el último.
  assert.match(TARJETA, /divide-x/);
  // Y el color sale del token del kit, no de un gris escrito acá.
  assert.match(TARJETA, /divide-x sunmi-divider/);
});

test("EL BOTÓN DE LA FILA VIVE EN EL KIT, no en quien lo usa", () => {
  // Si cada consumidor escribiera el suyo, stock y pedidos tendrían acciones de
  // distinto alto en la misma lista.
  //
  // El consumidor cambió: la pantalla ya no monta la pieza del kit, la monta
  // `TarjetaProductoMovil`. El candado sigue afirmando lo mismo, sobre el archivo
  // que hoy dibuja los botones — mirarlo en `page.jsx` habría dado verde por
  // ausencia, que es peor que rojo.
  assert.match(TARJETA, /export function AccionTarjeta/);
  assert.match(ENVOLTORIO, /AccionTarjeta,?\s*\n?\s*\}? from "@\/components\/sunmi\/SunmiProductoCard"|AccionTarjeta,/);
  assert.doesNotMatch(ENVOLTORIO, /function AccionTarjeta\s*\(/, "el envoltorio se escribió el suyo");
  assert.doesNotMatch(PAGINA, /function AccionTarjeta\s*\(/, "la pantalla se escribió el suyo");

  // ── Y EL PIE DE CÓDIGOS TAMBIÉN VIVE EN EL KIT ──────────────────────────
  //
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA OTRA COSA ────────────────
  //
  // Exigía que el envoltorio NOMBRARA a `PieDeCodigosTarjeta`, porque en la card
  // anterior lo montaba él, una segunda vez, adentro del cuerpo del carrusel.
  // La card aprobada no lo monta: le pasa los dos códigos al kit y esconde el
  // pie en el frente con una clase. O sea que el pie quedó en UN solo lugar, que
  // es lo que este candado dice defender — exigir el nombre habría obligado a
  // volver a montarlo para poner el candado en verde, que es justo lo contrario.
  //
  // Lo que se afirma ahora es la cadena completa, y son tres eslabones porque
  // romper cualquiera de los tres deja el frente mostrando los códigos:
  assert.match(TARJETA, /export function PieDeCodigosTarjeta/);

  // 1. el envoltorio le PASA los códigos al kit en vez de dibujarlos;
  assert.match(ENVOLTORIO, /codigoBarra=\{/, "el envoltorio no le pasa el código de barras al kit");
  assert.match(ENVOLTORIO, /codigoInterno=\{/, "el envoltorio no le pasa el código interno al kit");
  assert.doesNotMatch(
    ENVOLTORIO,
    /Sin cód\. prov\.|sin código de barras/,
    "el envoltorio se escribió su propio pie de códigos"
  );

  // 2. y NO LO ESCONDE. Éste afirmaba lo contrario hasta que los códigos
  //    pasaron a verse en el frente: pedía la clase `invisible` sobre el pie,
  //    porque la identificación era del dorso y el frente solo le reservaba el
  //    lugar. La decisión cambió —se miran para reponer y para conciliar, y un
  //    gesto de más los volvía invisibles en la práctica— así que el candado se
  //    da vuelta en vez de borrarse: reponer esa clase saca el dato de la
  //    pantalla sin romper nada que se note.
  assert.doesNotMatch(
    ENVOLTORIO,
    /\[&_\[data-pie-codigos\]\]:invisible/,
    "volvió la clase que escondía los códigos en el frente"
  );

  // 3. Y EL ATRIBUTO SIGUE SIENDO LA JUNTA ENTRE LOS DOS ARCHIVOS. Ya no lo usa
  //    el envoltorio para esconder, pero sí la sonda para afirmar sobre la
  //    pantalla corriendo, y es lo único que marca ese pie. Si alguien le cambia
  //    el nombre, todo compila, la suite queda verde y la sonda pasa a medir un
  //    nodo que no existe — que es un verde por ausencia, el peor de los dos.
  assert.match(
    TARJETA,
    /data-pie-codigos/,
    "el kit dejó de marcar su pie de códigos: nadie lo puede encontrar"
  );
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
  // ── Y VOLVIÓ A CAMBIAR DOS VECES ────────────────────────────────────────
  //
  // Primero pasaron a ser dos —Editar y el de dar vuelta—. Después el de dar
  // vuelta se fue de la fila: no es una acción sobre el producto, es moverse
  // entre caras, y ponerlos hermanos los igualaba. Vive adentro del cuerpo del
  // carrusel, con el indicador.
  //
  // Así que la fila vuelve a tener UNO. Y los dibuja el ENVOLTORIO, no la
  // pantalla; lo que la pantalla tiene que seguir haciendo es pasar la acción,
  // que es el hueco que este candado nació para tapar: una pieza puede estar
  // perfecta y la pantalla no usarla.
  const enElEnvoltorio = (ENVOLTORIO.match(/<AccionTarjeta/g) || []).length;
  assert.equal(enElEnvoltorio, 1, "la fila de acciones tiene que dibujar Editar y nada más");
  assert.match(ENVOLTORIO, /icono=\{Pencil\}/, "el envoltorio: falta el ícono de Editar");
  assert.doesNotMatch(
    ENVOLTORIO,
    /icono=\{Eye\}/,
    "volvió el botón Ver a la tarjeta: el issue #2 lo sacó"
  );
  // La pantalla le pasa qué hacer al tocar Editar. Sin esto el botón existe y no
  // lleva a ningún lado, que es exactamente el defecto que ya se coló una vez.
  assert.match(PAGINA, /onEditar=\{/, "la pantalla dejó de pasar la acción de Editar");
  assert.match(PAGINA, /abrirEditar\(/, "la pantalla dejó de llamar a abrirEditar");

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
