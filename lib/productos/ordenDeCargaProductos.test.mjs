// CANDADOS DEL ORDEN DE CARGA DE LA PANTALLA DE PRODUCTOS.
//
// ── QUÉ DEFIENDEN ─────────────────────────────────────────────────────────
//
// Que la consulta CARA no vuelva a competir con la barata. `/api/productos/listar`
// trae una página de 25 filas; `/api/productos/controles` recorre el catálogo
// entero hasta `TECHO_CONTROL`. Los dos efectos que los disparaban no se
// conocían, así que salían en el mismo tick del primer render.
//
// Medido en la pantalla real, con el servidor caliente y las dos versiones sobre
// los mismos datos:
//
//   antes    listado 1392→2452 (1060 ms)   controles 1393→2355   solape 1059 ms
//   después  listado 1360→1990 ( 630 ms)   controles 2342→2459   holgura +352 ms
//
// Las primeras filas pasaron de 2823 ms a 2278 ms.
//
// ── LO QUE SE PRUEBA ACÁ Y LO QUE NO ──────────────────────────────────────
//
// Acá se prueba la DECISIÓN —cuándo puede salir el pedido de controles— porque
// es pura y se puede ejercer sin montar React. El ORDEN REAL de los dos pedidos
// en un navegador lo mide `scripts/sonda-productos-orden-de-carga.mjs`, que es
// otra pregunta: ésta es "la regla dice lo correcto", aquélla es "la pantalla
// obedece la regla".
//
// Y el cableado —qué dependencias tiene cada efecto— se afirma leyendo el
// archivo, porque un efecto con la dependencia de más vuelve a pedir los
// contadores en cada paginada sin que nada falle.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  controlesPuedenSalir,
  listadoTermino,
} from "@/lib/productos/ordenDeCargaProductos";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const PANTALLA = leer("app/modulos/productos/page.jsx");
const RUTA_LISTAR = leer("app/api/productos/listar/route.js");

test("OC1. LOS CONTROLES NO SALEN ANTES DE QUE TERMINE EL PRIMER LISTADO", () => {
  // ── ES EL DEFECTO QUE MOTIVÓ LA TANDA ───────────────────────────────────
  //
  // Mientras el primer listado viaja, la puerta está cerrada. Es el único caso
  // que devuelve false, y es todo el arreglo.
  assert.equal(controlesPuedenSalir(null, 0), false, "salieron sin que ningún listado terminara");
  assert.equal(controlesPuedenSalir(null, 7), false);
  assert.equal(controlesPuedenSalir({ termino: false }, 7), false, "salieron con el listado todavía en el aire");
  assert.equal(controlesPuedenSalir(undefined, 7), false);
});

test("OC2. CUANDO EL LISTADO TERMINA, LOS CONTROLES PUEDEN SALIR", () => {
  // Terminó bien y para la misma ubicación: es el camino normal.
  assert.equal(controlesPuedenSalir(listadoTermino({ localIdRespondido: 7 }), 7), true);

  // Terminó bien y todavía no se conoce la ubicación —el contexto no llegó—.
  // Lo que contestó el servidor salió de la MISMA cookie que va a leer el
  // contexto, así que ya es de la ubicación correcta.
  assert.equal(controlesPuedenSalir(listadoTermino({ localIdRespondido: 7 }), 0), true);
});

test("OC3. UN FALLO DEL LISTADO NO DEJA LAS CARDS DE REHENES", () => {
  // ── LA PUERTA FALLA ABIERTA, Y NO ES UN DESCUIDO ────────────────────────
  //
  // Es una PRIORIDAD, no un control de corrección. Si fallara cerrada, un error
  // de red en el listado dejaría las cuatro cards cargando para siempre: media
  // pantalla muerta hasta recargar, y por un pedido que no tiene nada que ver.
  assert.equal(controlesPuedenSalir(listadoTermino({ ok: false }), 7), true);
  assert.equal(controlesPuedenSalir(listadoTermino({ ok: false }), 0), true);
  assert.equal(
    controlesPuedenSalir(listadoTermino({ ok: false, localIdRespondido: null }), 99),
    true,
    "un listado fallido bloqueó los controles"
  );

  // Y un servidor que no informa la ubicación tampoco los bloquea: no puede
  // desmentir nada, así que castigarlos sería castigarlos por una limitación
  // ajena.
  assert.equal(controlesPuedenSalir(listadoTermino({ localIdRespondido: null }), 7), true);
});

test("OC4. CAMBIAR DE UBICACIÓN CIERRA LA PUERTA Y RESTABLECE EL ORDEN", () => {
  // ── POR QUÉ ESTO ES LO QUE CONSERVA EL ORDEN AL CAMBIAR DE LOCAL ────────
  //
  // Sin esto, al cambiar de sitio los controles saldrían de inmediato —la
  // puerta seguiría abierta por el listado del local ANTERIOR— y volverían a
  // competir con el listado nuevo. La puerta se cierra sola porque la ubicación
  // que la abrió ya no es la actual.
  const puertaDelSiete = listadoTermino({ localIdRespondido: 7 });
  assert.equal(controlesPuedenSalir(puertaDelSiete, 7), true, "no abría para su propia ubicación");
  assert.equal(controlesPuedenSalir(puertaDelSiete, 9), false, "quedó abierta para OTRA ubicación");

  // Y vuelve a abrirse cuando termina el listado del local nuevo.
  assert.equal(controlesPuedenSalir(listadoTermino({ localIdRespondido: 9 }), 9), true);
});

test("OC5. `listadoTermino` ANOTA IGUAL SI FALLÓ, que es lo que destraba", () => {
  // Si el `catch` de la pantalla se olvidara de anotar, los controles no
  // saldrían nunca y eso no se ve leyendo el componente. Se fija la forma.
  assert.deepEqual(listadoTermino({ localIdRespondido: 7 }), {
    termino: true, ok: true, localIdRespondido: 7,
  });
  assert.deepEqual(listadoTermino({ ok: false }), {
    termino: true, ok: false, localIdRespondido: null,
  });
  // Sin argumentos no explota y cuenta como terminado: un `listadoTermino()`
  // suelto no puede dejar la puerta cerrada.
  assert.equal(listadoTermino().termino, true);
});

test("OC6. EL LISTADO NO ESPERA A NADIE", () => {
  // ── LA MITAD QUE NO SE PUEDE ROMPER ─────────────────────────────────────
  //
  // El arreglo hace que los controles esperen. Si por simetría alguien pusiera
  // la puerta también en el efecto del listado, la pantalla no cargaría nunca:
  // la puerta la abre el propio listado. Es un abrazo mortal, y compila.
  const efectoListado = PANTALLA.match(
    /useEffect\(\(\) => \{\s*if \(yaSalio\(pedidoRef[\s\S]*?\}, \[claveDelPedido, localId\]\);/
  );
  assert.ok(efectoListado, "no se encontró el efecto del listado con sus dependencias de siempre");
  assert.doesNotMatch(
    efectoListado[0],
    /controlesPuedenSalir|puerta/,
    "el listado quedó esperando la puerta que él mismo abre: la pantalla no carga nunca"
  );
});

test("OC7. LOS CONTROLES MIRAN LA PUERTA, y no un reloj", () => {
  const efectoControles = PANTALLA.match(
    /useEffect\(\(\) => \{\s*if \(!controlesPuedenSalir[\s\S]*?\}, \[[^\]]*\]\);/
  );
  assert.ok(efectoControles, "el efecto de controles dejó de consultar la puerta");
  assert.match(efectoControles[0], /fetchControles\(\)/);

  // ── NADA DE `setTimeout` ────────────────────────────────────────────────
  //
  // Un retraso fijo no coordina: adivina. En una máquina lenta el listado tarda
  // más que el retraso y vuelven a pisarse; en una rápida se regalan
  // milisegundos. La puerta se abre cuando el listado TERMINÓ.
  assert.doesNotMatch(efectoControles[0], /setTimeout|setInterval/, "volvió el retraso adivinado");
});

test("OC8. CAMBIAR PÁGINA, ORDEN O FILTROS NO RECALCULA LOS CONTROLES", () => {
  // ── POR QUÉ SE MIRAN LAS DEPENDENCIAS Y NO EL RESULTADO ─────────────────
  //
  // El universo de los contadores es el catálogo entero de la ubicación: no
  // depende de la página, del orden ni de los filtros. Si `claveDelPedido`
  // entrara en las dependencias de este efecto, cada toque del paginador
  // dispararía otra vez la consulta cara para dar exactamente el mismo número, y
  // nada fallaría — solo sería lento.
  const efectoControles = PANTALLA.match(
    /useEffect\(\(\) => \{\s*if \(!controlesPuedenSalir[\s\S]*?\}, \[([^\]]*)\]\);/
  );
  assert.ok(efectoControles, "no se encontró el efecto de controles");
  const deps = efectoControles[1];

  assert.doesNotMatch(deps, /claveDelPedido/, "los controles se recalculan al cambiar de página o filtro");
  assert.doesNotMatch(deps, /\bpage\b/, "los controles dependen de la página");
  assert.doesNotMatch(deps, /filtros/, "los controles dependen de los filtros");
  assert.doesNotMatch(deps, /sortKey|sortDir/, "los controles dependen del orden");
  // Sí dependen de la ubicación y de la puerta, que son las dos cosas que los
  // invalidan de verdad.
  assert.match(deps, /localId/, "los controles dejaron de recargarse al cambiar de ubicación");
  assert.match(deps, /listadoTerminoOk/, "los controles dejaron de esperar al listado");
});

test("OC9. LA PUERTA SE ANOTA CON PRIMITIVOS, no con un objeto", () => {
  // ── ESTO NO ES ESTILO ───────────────────────────────────────────────────
  //
  // React descarta un `setState` que repite el mismo valor solo si es el MISMO
  // valor. Con un objeto, cada listado que termina crea una identidad nueva, el
  // efecto de controles vuelve a correr en cada paginada y solo lo salva el
  // guardia de `yaSalio`. Con primitivos, ni siquiera se re-renderiza.
  assert.match(PANTALLA, /useState\(null\);?\s*$/m);
  assert.match(PANTALLA, /setListadoTerminoOk\(true\)/, "no se anota el listado que salió bien");
  assert.match(PANTALLA, /setListadoTerminoOk\(false\)/, "no se anota el listado que falló");
  assert.match(
    PANTALLA,
    /const \[listadoRespondioPara, setListadoRespondioPara\] = useState\(null\)/,
    "se perdió la ubicación para la que contestó el listado"
  );
});

test("OC10. UNA RESPUESTA VIEJA NO PISA A LA NUEVA", () => {
  // Cambiar de ubicación deja el pedido anterior en el aire. Si vuelve último,
  // sin esto sus filas —las del OTRO local— sobrescriben las del actual y el
  // `pedidoRef` queda diciendo que lo correcto ya se pidió. La pantalla mostraría
  // el catálogo equivocado sin un solo error.
  assert.match(PANTALLA, /const miToken = \+\+tokenListadoRef\.current/);
  assert.match(PANTALLA, /const miToken = \+\+tokenControlesRef\.current/);
  assert.match(PANTALLA, /if \(miToken !== tokenListadoRef\.current\) return;/);
  assert.match(PANTALLA, /if \(miToken !== tokenControlesRef\.current\) return;/);
});

test("OC11. UN FALLO DE CONTROLES SE PUEDE REINTENTAR", () => {
  // El `catch` borra la anotación: sin eso, un error de red dejaría los
  // contadores sin poder volver a pedirse hasta recargar la página.
  const fn = PANTALLA.match(/const fetchControles = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(fn, "no se encontró fetchControles");
  assert.match(fn[0], /catch[\s\S]*controlesRef\.current = null/, "un fallo deja los controles bloqueados");
});

test("OC12. \"MARCAR REVISADOS\" SIGUE ACTUALIZANDO LAS DOS COSAS", () => {
  // ── ACÁ EL `Promise.all` ES CORRECTO Y NO SE TOCA ───────────────────────
  //
  // La puerta ordena la PRIMERA carga, donde la persona está esperando ver el
  // listado. Después de marcar revisados no hay nada que priorizar: los dos
  // datos cambiaron y los dos tienen que volver. Ponerlos en serie acá sería
  // lentitud sin motivo.
  const fn = PANTALLA.match(/const marcarRevisados = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(fn, "no se encontró marcarRevisados");
  assert.match(
    fn[0],
    /Promise\.all\(\[fetchProductos\(\), fetchControles\(\)\]\)/,
    "marcar revisados dejó de actualizar el listado y los contadores juntos"
  );
});

test("OC13. MÓVIL Y ESCRITORIO COMPARTEN LOS MISMOS DATOS", () => {
  // ── LO QUE ESTO IMPIDE, Y ESTABA PEDIDO EXPRESAMENTE ────────────────────
  //
  // "No solucionar esto ocultando las cards en desktop ni evitando su consulta
  // en escritorio." Las cards se van a ver en las dos versiones, así que el
  // arreglo tiene que ser de ORDEN y no de visibilidad.
  //
  // Se afirma que los pedidos no están condicionados por el ancho: si
  // apareciera un `md:` o un `matchMedia` decidiendo si se piden los controles,
  // escritorio y móvil dejarían de traer lo mismo.
  const fn = PANTALLA.match(/const fetchControles = async \(\) => \{[\s\S]*?\n  \};/)[0];
  assert.doesNotMatch(fn, /matchMedia|innerWidth|isMobile|esMovil/, "el pedido depende del ancho de pantalla");

  const efectoControles = PANTALLA.match(
    /useEffect\(\(\) => \{\s*if \(!controlesPuedenSalir[\s\S]*?\}, \[[^\]]*\]\);/
  )[0];
  assert.doesNotMatch(efectoControles, /matchMedia|innerWidth|isMobile|esMovil/, "el efecto depende del ancho");
});

test("OC14. LA PAGINACIÓN SIGUE TRAYENDO SOLO EL pageSize PEDIDO", () => {
  // El listado nunca fue el problema y tiene que seguir sin serlo: esta tanda no
  // lo toca, y este candado lo fija para que no se "arregle" de más.
  assert.match(RUTA_LISTAR, /skip: \(page - 1\) \* pageSize/, "el listado dejó de paginar");
  assert.match(RUTA_LISTAR, /take: pageSize/, "el listado dejó de limitar la cantidad");
  assert.match(RUTA_LISTAR, /PAGE_SIZES_VALIDOS\.includes\(rawPageSize\)/, "el pageSize dejó de validarse");
});
