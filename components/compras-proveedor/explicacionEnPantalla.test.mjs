// LAS PANTALLAS DE LA EXPLICACIÓN Y DE LA CORRECCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/explicacionEnPantalla.test.mjs
//
// Lo que se afirma acá no es el diseño —eso se mira abriéndolas— sino las cosas
// que no pueden hacerse mal, y que son las que este módulo ya pagó caro:
//
//   · probar no guarda nada, y lo dice antes de que alguien lo toque;
//   · no se puede guardar una explicación cuyo papel no cierra;
//   · un producto que no da su cuenta NO se corrige solo: se pregunta;
//   · el bloque de "así lo entendió" es UN componente, no dos parecidos;
//   · un papel de un proveedor sin explicación va a la receta antes de leer;
//   · «Leer de nuevo» solo existe mientras el pedido se está recibiendo;
//   · en pantalla se dice PRODUCTOS, nunca renglones ni líneas.
//
// ── POR QUÉ MIRA EL FUENTE Y NO EL HTML ───────────────────────────────────
//
// Las dos pantallas piden sus datos al montarse, así que dibujadas en el
// servidor no muestran más que el estado de carga. Lo que se afirma son
// decisiones escritas en el código —qué se llama, con qué condición—, y para
// eso el fuente es la fuente. Los COMENTARIOS se sacan antes de mirar: la
// regla 5 de CLAUDE.md tiene las tres veces que un candado encontró la prosa y
// se quedó verde sin defender nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ExplicacionDelPapel, {
  AVISO_PROBAR,
  TITULO_PROBAR,
  TEXTO_LEYENDO,
} from "./ExplicacionDelPapel.jsx";
import { TEXTO_LEER_DE_NUEVO } from "../comprobantes/PanelComprobantes.jsx";
import { LECTURA_VIEJA } from "./CorregirComprobante.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// El archivo entero, comentarios incluidos. Sirve para CORTAR por los rótulos
// de las ramas, que están escritos en comentarios; nunca para afirmar.
const textoDe = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const sinComentarios = (texto) =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const codigoDe = (rel) => sinComentarios(textoDe(rel));

const EXPLICACION = "components/compras-proveedor/ExplicacionDelPapel.jsx";
const BLOQUE = "components/compras-proveedor/AsiLoEntendio.jsx";
const CORRECCION = "components/compras-proveedor/CorregirComprobante.jsx";
const PANEL = "components/comprobantes/PanelComprobantes.jsx";
const RECEPCION = "app/modulos/compras-proveedor/[id]/page.jsx";
const RUTA = "app/api/compras-proveedor/recetas/explicacion/route.js";
const RUTA_CORREGIR = "app/api/compras-proveedor/comprobantes/corregir/[id]/route.js";
const VISOR = "components/compras-proveedor/VisorDeFoto.jsx";

const aLaVista = (html) => html.replace(/<[^>]*>/g, " ");

const ROTULO_GUARDAR = "GUARDAR: SOLO LA EXPLICACIÓN";

/**
 * Los TRES trozos de la ruta, cortados por su rótulo y ya sin prosa.
 *
 * Eran dos hasta el 2026-09-21. Ahora la lectura corre APARTE del pedido
 * —`leerElPapel`, para que ningún proxy pueda cortarla por tiempo— así que el
 * código que antes vivía adentro de la rama de probar está en una función al
 * final del archivo. Los candados de abajo siguen afirmando lo mismo; lo que
 * cambia es dónde hay que mirarlo, y por eso se corta en tres y no en dos.
 */
function trozosDeLaRuta() {
  const crudo = textoDe(RUTA);
  const arranqueProbar = crudo.indexOf("body?.probar === true");
  const arranqueGuardar = crudo.indexOf(ROTULO_GUARDAR);
  const arranqueWorker = crudo.indexOf("async function leerElPapel(");
  assert.ok(arranqueProbar > 0, "no se encontró la rama de probar");
  assert.ok(arranqueGuardar > arranqueProbar, "no se encontró la rama de guardar");
  assert.ok(arranqueWorker > arranqueGuardar, "no se encontró la lectura que corre aparte");
  return {
    probar: sinComentarios(crudo.slice(arranqueProbar, arranqueGuardar)),
    guardar: sinComentarios(crudo.slice(arranqueGuardar, arranqueWorker)),
    worker: sinComentarios(crudo.slice(arranqueWorker)),
  };
}

test("PROBAR AVISA QUE NO GUARDA NADA, ANTES DE TOCARLO", () => {
  assert.match(TITULO_PROBAR, /Probar/i);
  assert.match(AVISO_PROBAR, /no se guarda nada/i);
  assert.match(AVISO_PROBAR, /cómo leyó el papel/i);
  const html = aLaVista(renderToStaticMarkup(React.createElement(ExplicacionDelPapel, { proveedorId: 6 })));
  assert.ok(typeof html === "string", "la pantalla no se pudo dibujar");
});

test("Y PROBAR NO ESCRIBE: LA RUTA LO GARANTIZA DEL LADO DEL SERVIDOR", () => {
  // La promesa de la pantalla no vale si la ruta escribe igual.
  const { probar, worker } = trozosDeLaRuta();
  // Se miran LOS DOS: la rama que arranca el turno y la lectura que corre
  // aparte. Mirar solo una dejaría la mitad del camino sin candado, que es
  // justo lo que pasa cuando un candado sobrevive a una mudanza sin releerse.
  for (const [donde, codigo] of [["la rama de probar", probar], ["la lectura aparte", worker]]) {
    assert.ok(
      !/comprobanteProveedor\.(update|upsert|create)|comprobanteLinea\.(update|create|createMany|deleteMany)|recetaProveedor\.(update|upsert)/.test(codigo),
      `probar volvió a escribir algo en ${donde}`
    );
  }
  // Lo único que sí escribe es la bitácora de llamadas, y tiene que seguir
  // haciéndolo: esa consulta gastó cuota igual que cualquier otra.
  assert.match(worker, /llamadaLector\.createMany/);
});

test("GUARDAR GUARDA SOLO LA EXPLICACIÓN", () => {
  const ramaGuardar = trozosDeLaRuta().guardar;
  assert.match(ramaGuardar, /recetaProveedor\.upsert/);

  // ── EL CONTRATO CAMBIÓ EL 2026-09-23, Y SE ESCRIBE LA DIFERENCIA ─────
  //
  // Decía "ni relee, ni toca comprobantes". Lo primero sigue firme y es lo que
  // importa: guardar NO llama al lector, así que no gasta una sola llamada
  // paga por sí mismo.
  //
  // Lo segundo dejó de valer a propósito. Guardar ahora MIRA qué comprobantes
  // sin recibir se podrían releer con la receta nueva, y devuelve la lista con
  // el costo en lecturas. Quien decide releer es la pantalla, y quien paga es
  // el usuario al apretar. Sin eso, cambiar la explicación dejaba los papeles
  // ya subidos leídos con la vieja: le pasó al #247, cuya receta se guardó a
  // las 15:10 y cuyo comprobante siguió con la lectura de antes.
  //
  // Es el MISMO mecanismo que `recetas/guardar` ya tenía para la otra pantalla
  // de receta —`ofrecerRelectura`— conectado a este camino, no uno nuevo.
  assert.ok(
    !/leerConCadena/.test(ramaGuardar),
    "guardar la explicación volvió a llamar al lector: eso gasta cuota sin que nadie lo pida"
  );
  assert.match(ramaGuardar, /ofrecerRelectura/, "guardar dejó de ofrecer releer los pendientes");
  assert.ok(
    !/comprobanteLinea|\.update\(/.test(ramaGuardar),
    "guardar la explicación escribe en un comprobante"
  );
  for (const campoDeImpuestos of ["ivaPorLinea", "alicuotaIvaPct", "percepciones", "facturaPor"]) {
    assert.ok(
      !ramaGuardar.includes(`${campoDeImpuestos}:`),
      `guardar la explicación volvió a pisar ${campoDeImpuestos}`
    );
  }
});

test("NO SE PUEDE GUARDAR SI EL PAPEL NO CIERRA", () => {
  const c = codigoDe(EXPLICACION);
  assert.match(c, /sePuedeGuardar/, "se perdió la condición de guardado");
  // El botón mira DOS cosas: que el papel cierre, y que no haya una relectura
  // de los pendientes en curso —apretar en el medio dispararía dos tandas de
  // llamadas pagas—. La condición de cierre es la que este candado defiende.
  assert.match(
    c,
    /disabled=\{guardando \|\| Boolean\(releyendo\) \|\| !sePuedeGuardar\}/,
    "el botón de guardar dejó de mirar si el papel cierra"
  );
  assert.match(
    c,
    /Se puede guardar cuando los productos sumen el total del papel/,
    "se perdió el motivo por el que el botón está apagado"
  );
  // Y la excepción que SÍ corresponde: un papel sin total no tiene contra qué
  // cerrar, así que se guarda igual.
  assert.match(c, /hayTotal === false \? Boolean\(explicacion\.trim\(\)\)/);
});

test("UN PRODUCTO QUE NO DA LA CUENTA SE PREGUNTA, NO SE CORRIGE SOLO", () => {
  const c = codigoDe(BLOQUE);
  assert.match(c, /Mirá la foto y tocá el que dice el papel/);
  assert.match(c, /Da la cuenta/);
  assert.match(c, /Leyó/);
  assert.match(c, /Si ninguno es, escribilo como está en el papel/);
  // La corrección es una ELECCIÓN de la persona: entra por `onElegir`, no por
  // un `daLaCuenta` puesto de oficio en ningún lado.
  assert.match(c, /onElegir\(p\.daLaCuenta\)/);
  assert.match(c, /onElegir\(p\.subtotal\)/);
  assert.ok(
    !/subtotalImpreso: p\.daLaCuenta/.test(c),
    "el bloque volvió a corregir el número por su cuenta"
  );
});

test("EL BLOQUE ES UNO SOLO, USADO POR LAS DOS PANTALLAS", () => {
  // Era una sola pantalla y ahora son dos: la receta y la corrección de la
  // recepción. Si se copiara, se separarían el día que una cambie — es
  // literalmente la regla 1.
  for (const pantalla of [EXPLICACION, CORRECCION]) {
    assert.match(
      codigoDe(pantalla),
      /import AsiLoEntendio.*from "@\/components\/compras-proveedor\/AsiLoEntendio"/,
      `${pantalla} dejó de usar el bloque compartido`
    );
    assert.match(codigoDe(pantalla), /<AsiLoEntendio/);
  }
  // Y ninguna se quedó con una copia de las piezas de adentro.
  for (const pantalla of [EXPLICACION, CORRECCION]) {
    assert.ok(
      !/function ProductoSospechoso|function ProductoLeido/.test(codigoDe(pantalla)),
      `${pantalla} volvió a tener su propia copia del producto sospechoso`
    );
  }
});

test("LA CUENTA SE REHACE CON LA MISMA FUNCIÓN QUE EL SERVIDOR", () => {
  // Si una pantalla recalculara por su lado, el "cierra" de acá y el de allá
  // podrían decir cosas distintas sobre el mismo papel.
  //
  // El tercer argumento —`productos`— es opcional y solo lo pasa la receta, que
  // es la que resolvió qué producto es cada renglón para poder decir "el kilo"
  // o "cada una". Lo que este candado afirma es que la CUENTA la hace la misma
  // función, no que las tres llamadas sean idénticas letra por letra.
  assert.match(
    codigoDe(EXPLICACION),
    /comoLoEntendio\(\{ lectura: conCorrecciones, receta(, productos)? \}\)/
  );
  assert.match(
    codigoDe(CORRECCION),
    /comoLoEntendio\(\{ lectura: conCorrecciones, receta(, productos)? \}\)/
  );
  assert.match(codigoDe(RUTA), /comoLoEntendio\(\{\s*lectura: resultado\.lectura/);
});

test("Y LA UNIDAD QUE RESOLVIÓ EL SERVIDOR NO SE PIERDE AL CORREGIR", () => {
  // La receta rehace la cuenta en pantalla cada vez que alguien elige un
  // número. Si los productos no viajaran, esa segunda pasada los perdería y el
  // rótulo "el kilo" desaparecería solo, sin que nadie tocara nada.
  const c = codigoDe(EXPLICACION);
  assert.match(c, /setProductos\(d2\.productos \?\? null\)/);
  assert.match(c, /\[lectura, receta, correcciones, productos\]/);
  // Y el servidor manda SOLO la unidad: el costo del producto no tiene nada
  // que hacer en la pantalla donde se prueba cómo se lee un papel.
  assert.match(codigoDe(RUTA), /\{ unidad_medida: p\.unidad_medida \}/);
});

test("LA CORRECCIÓN SE GUARDA, Y EL PAPEL VUELVE A PASAR POR LA MISMA PUERTA", () => {
  // Acá la elección SÍ se escribe, que es la diferencia con la receta. Lo que
  // no puede haber es un segundo criterio para decidir si cierra.
  const r = codigoDe(RUTA_CORREGIR);
  assert.match(r, /comprobanteLinea\.updateMany/);
  assert.match(r, /pasarPorLaPuerta\(\{ lectura, receta: c\.recetaUsada/);
  assert.match(r, /estado: puerta\.estado/);
  // Solo se corrige lo que no cerró: un CARGADO ya tiene costos propuestos.
  assert.match(r, /c\.estado !== ESTADO\.MAL_LEIDO/);
  // Y no reescribe la lectura: el modelo, el consumo y el pie son de la
  // llamada de IA que ya pasó y no cambian porque alguien corrija un número.
  for (const campo of ["modeloLectura", "recetaUsada", "totalLeido", "tokensEntrada", "leidoEn"]) {
    assert.ok(
      !new RegExp(`${campo}:`).test(r.slice(r.indexOf("comprobanteProveedor.update"))),
      `corregir volvió a reescribir ${campo}`
    );
  }
});

test("EL BLOQUE DE CORRECCIÓN SE DIBUJA, Y NO ADENTRO DE UNA RAMA MUERTA", () => {
  const p = codigoDe(RECEPCION);
  const corregir = p.indexOf("<CorregirComprobante");
  const lista = p.indexOf("<ListaConciliacion");
  assert.ok(corregir > 0, "la recepción no dibuja el bloque de corrección");
  assert.ok(corregir < lista, "el bloque de corrección quedó debajo de la conciliación");

  // ── Y ACÁ ESTÁ LO QUE ESTE CANDADO NO MIRABA ────────────────────────
  //
  // Nació afirmando solo el ORDEN en el archivo, y el bloque estaba metido
  // adentro de `(!esRecepcion || sinFactura)` —la rama del pedido SIN papel—
  // junto con la conciliación. Las dos posiciones eran correctas y ninguna de
  // las dos se dibujaba nunca durante una recepción con factura: en el #242 el
  // bloque del yogur no apareció jamás y este candado estuvo en verde.
  //
  // Es el defecto que CLAUDE.md llama "un candado montado sobre algo que nunca
  // ocurre": no falla, no avisa, y cierra la pregunta.
  const ramaSinPapel = p.indexOf("(!esRecepcion || sinFactura)");
  assert.ok(ramaSinPapel > 0, "se perdió la rama del pedido sin papel; revisá este candado");
  assert.ok(
    corregir < ramaSinPapel,
    "el bloque para arreglar un papel volvió a quedar adentro de la rama que solo corre SIN papel"
  );
  // Y la lista de los que no cerraron sale del panel, que ya la tiene: pedirla
  // por segunda vez son dos consultas de lo mismo.
  assert.match(p, /onMalLeidos=\{setMalLeidos\}/);
  assert.match(codigoDe(PANEL), /estado === "MAL_LEIDO"/);
});

test("UN PAPEL DE UN PROVEEDOR SIN EXPLICACIÓN VA A LA RECETA ANTES DE LEER", () => {
  const c = codigoDe(PANEL);
  assert.match(c, /async function faltaLaExplicacion/);
  assert.match(c, /if \(await faltaLaExplicacion\(\)\)/);
  // Con ESA foto como papel de prueba, y con a dónde volver.
  assert.match(c, /\/modulos\/proveedores\/recetas\/\$\{proveedorId\}\?comprobante=\$\{id\}/);
  assert.match(c, /volverA=/);
  // Y la receta la usa de verdad: el papel de prueba puede venir dado.
  assert.match(codigoDe(RUTA), /comprobanteId = Number\(parametros\.get\("comprobanteId"\)\)/);
  assert.match(codigoDe(RUTA), /\{ id: comprobanteId \}/);
  // Que no se pueda consultar la receta NO puede convertirse en "no se puede
  // leer la factura": ante la duda se lee.
  assert.match(c, /if \(!d\?\.ok\) return false;/);
});

test("«LEER DE NUEVO» EXISTE, Y SOLO MIENTRAS EL PEDIDO SE ESTÁ RECIBIENDO", () => {
  assert.equal(TEXTO_LEER_DE_NUEVO, "Leer de nuevo");
  const c = codigoDe(PANEL);
  // Las dos superficies —tabla y tarjetas— usan la constante, no el texto.
  assert.equal((c.match(/TEXTO_LEER_DE_NUEVO/g) || []).length, 3);
  assert.ok(!/"Releer"/.test(c), "quedó una palabra de sistema en pantalla");
  // El botón entero cuelga de `puedeRecibir`, que la recepción ata al estado
  // ENVIADO: con el pedido RECIBIDO no se dibuja.
  assert.equal((c.match(/puedeRecibir && c\.fotos > 0/g) || []).length, 2);
  assert.match(codigoDe(RECEPCION), /puedeRecibir=\{esRecepcion\}/);
  assert.match(codigoDe(RECEPCION), /const esRecepcion = pedido\.estado === "ENVIADO"/);
});

test("EN PANTALLA SE DICE PRODUCTOS, NUNCA RENGLONES NI LÍNEAS", () => {
  // Solo el texto que se ve: los nombres de variables no cuentan.
  const juntos = [BLOQUE, EXPLICACION, CORRECCION]
    .flatMap((f) => [...codigoDe(f).matchAll(/>\s*([^<>{}\n]{6,120})\s*</g)].map((m) => m[1]))
    .join(" ")
    .toLowerCase() + " " + [AVISO_PROBAR, TITULO_PROBAR].join(" ").toLowerCase();
  for (const palabra of ["renglón", "renglones", "línea", "líneas", "ítem", "ítems"]) {
    assert.ok(!juntos.includes(palabra), `dice "${palabra}" en pantalla`);
  }
  assert.ok(juntos.includes("producto"), "las pantallas dejaron de hablar de productos");
});

test("LA FOTO SE SIRVE POR LA RUTA NUEVA, CON EL MISMO PERMISO", () => {
  // ── LA FOTO SE ABRE EN EL VISOR, NO EN OTRA PESTAÑA ─────────────────
  //
  // Las dos pantallas montan el MISMO `VisorDeFoto`, que respeta la orientación
  // del archivo, gira y se agranda con dos dedos. Antes cada una abría la
  // imagen cruda con `window.open` o con un enlace, y el navegador la mostraba
  // como quería: el papel de Paty se veía dado vuelta y en una franja.
  for (const pantalla of [BLOQUE, EXPLICACION]) {
    assert.match(codigoDe(pantalla), /<VisorDeFoto/, `${pantalla} no monta el visor`);
    assert.ok(
      !/window\.open\(/.test(codigoDe(pantalla)),
      `${pantalla} volvió a abrir la foto en otra pestaña`
    );
  }
  assert.match(codigoDe(VISOR), /\/api\/compras-proveedor\/comprobantes\/foto\//);
  const foto = codigoDe("app/api/compras-proveedor/comprobantes/foto/[id]/route.js");
  // El alcance va en el WHERE: un comprobante de otro grupo no existe.
  assert.match(foto, /comprobante: \{ id: comprobanteId, grupoId \}/);
  assert.match(foto, /checkPerm\(session, \["compras\.ver", "compras\.recibir"\]\)/);
});

// ── NINGUNA PANTALLA DE ESTE CIRCUITO MUESTRA UN CÓDIGO HTTP ──────────────

test("NADIE ESCRIBE UN NÚMERO DE HTTP EN PANTALLA", () => {
  // Lo que Emanuel leyó en el celular el 2026-09-21 fue "El servidor contestó
  // 504." Un número no le dice a nadie qué hacer, y el catálogo con la frase
  // correcta —"la lectura tardó más de lo que el servidor espera"— existía
  // desde antes: estas pantallas no lo estaban usando.
  const PANTALLAS = [
    EXPLICACION,
    CORRECCION,
    BLOQUE,
    "components/comprobantes/ListaConciliacion.jsx",
    "components/comprobantes/PiezasConciliacion.jsx",
    "components/comprobantes/PanelComprobantes.jsx",
  ];
  for (const pantalla of PANTALLAS) {
    const c = codigoDe(pantalla);
    assert.ok(
      !/contestó \$\{[^}]*status/.test(c),
      `${pantalla} vuelve a mostrar el código que contestó el servidor`
    );
    assert.ok(!/\$\{r\.status\}/.test(c), `${pantalla} interpola un estado HTTP en un texto`);
  }
});

test("EL TEXTO DE UN FALLO SALE DEL CATÁLOGO QUE YA EXISTE", () => {
  // Reusar, no escribir al lado: `queHacerHttp` con `OPERACION.LECTURA` ya
  // tiene la frase de cada estado, incluida la del 504.
  const c = codigoDe(EXPLICACION);
  assert.match(c, /export function textoDeFallo/);
  assert.match(c, /queHacerHttp\(status, \{ operacion: OPERACION\.LECTURA \}\)/);
  // Y lo que el servidor haya mandado gana, porque sabe más que la tabla.
  assert.match(c, /if \(cuerpo\?\.queHacer\) return cuerpo\.queHacer;/);
  // Las otras tres pantallas lo usan en vez de tener su propia frase.
  for (const pantalla of [
    CORRECCION,
    "components/comprobantes/ListaConciliacion.jsx",
    "components/comprobantes/PiezasConciliacion.jsx",
  ]) {
    assert.match(codigoDe(pantalla), /textoDeFallo\(d, r\.status\)/, pantalla);
  }
});

test("PROBAR NO ESPERA LA LECTURA: PIDE TURNO Y PREGUNTA", () => {
  // La defensa contra el 504 no es un timeout más chico —el que corta vive en
  // nginx, en otra máquina— sino que no haya ningún pedido HTTP largo.
  const c = codigoDe(EXPLICACION);
  assert.match(c, /probar: true/);
  assert.match(c, /await esperarElTurno\(d\.turno\)/);
  assert.match(c, /\?turno=\$\{encodeURIComponent\(turno\)\}/);
  assert.match(c, /CADA_CUANTO_SE_PREGUNTA_MS/);
  // Y mientras espera, dice cuánto puede tardar.
  assert.match(TEXTO_LEYENDO, /puede tardar hasta un minuto/);

  // Del lado del servidor: arrancar y contestar, sin `await` de la lectura.
  const ruta = codigoDe(RUTA);
  assert.match(ruta, /arrancarTurno\(\{/);
  assert.ok(
    !/await leerElPapel\(/.test(ruta),
    "la ruta volvió a esperar la lectura adentro del pedido"
  );
  assert.match(ruta, /leyendo: true/);
});

// ── EL CARTEL NARANJA VIEJO NO SE DIBUJA EN NINGUNA PANTALLA ──────────────

test("NINGUNA PANTALLA MUESTRA EL MOTIVO LARGO DEL VERIFICADOR", () => {
  // Decía: "El precio por unidad no coincide con el subtotal impreso en la 5
  // (30 × $2442.01 no da $46896.56)". Nombraba el renglón por su número,
  // escribía los importes en formato de máquina y rehacía una cuenta que NO es
  // la del control —la del control lleva kilos y descuento—. Todo eso lo dice
  // mejor el bloque de arriba de la conciliación.
  for (const pantalla of [PANEL, RECEPCION, CORRECCION, EXPLICACION, BLOQUE]) {
    const c = codigoDe(pantalla);
    assert.ok(!/texto: d\.porque/.test(c), `${pantalla} volvió a mostrar el motivo largo`);
    assert.ok(!/\{d\.porque\}/.test(c), `${pantalla} volvió a dibujar el motivo largo`);
  }
  // Y lo que el panel dice ahora manda al bloque, sin números ni renglones.
  const panel = codigoDe(PANEL);
  assert.match(panel, /la cuenta no cierra\. Está señalado abajo/);
});

test("Y CUANDO LA LECTURA ES VIEJA, LO DICE EN CASTELLANO", () => {
  // Una lectura anterior a la explicación no trae el descuento de cada renglón,
  // así que el control no juzga nada y el bloque quedaría mudo. Decirlo es
  // mejor: la acción que lo resuelve es «Leer de nuevo», que está arriba.
  const c = codigoDe(CORRECCION);
  assert.match(c, /lecturaSinDescuentos/);
  assert.match(c, /l\?\.bonificacion === null \|\| l\?\.bonificacion === undefined/);
  assert.match(LECTURA_VIEJA, /anterior a la explicación/);
  assert.match(LECTURA_VIEJA, /Leer de nuevo/);
  // No acusa a ningún producto: solo dice qué falta y qué tocar.
  assert.ok(!/Da la cuenta/.test(LECTURA_VIEJA));
});
