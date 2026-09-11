// EL CABLEADO DEL BUSCADOR MÓVIL DE PRODUCTOS.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/productos/buscadorMovilCableado.test.mjs
//
// Los candados de `lib/productos/busquedaDelCatalogo.test.mjs` prueban las dos
// DECISIONES. Éstos prueban que la pantalla las esté usando, que es la otra
// mitad: una decisión correcta que nadie llama no arregla nada.
//
// Es exactamente el caso de CLAUDE.md, regla 2 —"los candados prueban piezas, la
// pantalla prueba el camino, y los defectos viven entre las piezas"— con el
// límite que este repo tiene hoy: sin DOM en las pruebas no se puede montar la
// página y teclear. Así que se afirma sobre el cableado, y se afirma sobre las
// TRES líneas que, si vuelven a lo anterior, traen el defecto de vuelta.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** El código SIN comentarios: acá se afirma sobre lo que corre, no sobre prosa. */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const PAGINA = "app/modulos/productos/page.jsx";
const FILTROS = "components/productos/FiltrosProductos.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// EL INPUT ES DUEÑO DE SU TEXTO
// ═══════════════════════════════════════════════════════════════════════════

test("EL BUSCADOR MÓVIL MUESTRA EL BORRADOR, NO EL ESTADO CONFIRMADO", () => {
  // Es LA línea del defecto. Con `value={filtros.search}`, el campo mostraba el
  // mismo estado que el efecto de la URL reescribe, así que un eco tardío le
  // cambiaba el texto a la persona mientras escribía.
  const src = codigoDe(PAGINA);

  assert.match(
    src,
    /<SunmiCampoBusquedaVoz[\s\S]{0,400}?value=\{textoBusquedaMovil\}/,
    "el campo del celular dejó de mostrar el borrador"
  );
  assert.ok(
    !/<SunmiCampoBusquedaVoz[\s\S]{0,400}?value=\{filtros\.search\}/.test(src),
    "el campo volvió a mostrar `filtros.search`: un eco de la URL puede pisarlo"
  );
});

test("el borrador arranca de la URL, así un enlace con ?q= deja el campo escrito", () => {
  const src = codigoDe(PAGINA);
  assert.match(
    src,
    /useState\(\s*inicialRef\.current\.filtros\.search\s*\)/,
    "el borrador dejó de inicializarse desde la URL"
  );
});

test("teclear toca el borrador y NO aplica filtros de una", () => {
  const src = codigoDe(PAGINA);
  assert.match(src, /const alTeclearEnElCelular = \(texto\) => \{/);
  assert.match(src, /setTextoBusquedaMovil\(texto\)/);
  assert.match(src, /confirmadorRef\.current\.programar\(texto\)/);

  // El cableado viejo: cada tecla llamaba directo a `aplicarFiltros`, o sea una
  // navegación y un pedido por letra.
  assert.ok(
    !/const alBuscarEnElCelular = \(texto\) => aplicarFiltros/.test(src),
    "volvió la confirmación por tecla"
  );
});

test("dictar confirma sin esperar, como el escritorio con la voz", () => {
  const src = codigoDe(PAGINA);
  assert.match(src, /const alDictarEnElCelular = \(texto\) => \{/);
  assert.match(src, /confirmadorRef\.current\.inmediato\(texto\)/);
  // Y los dos siguen entrando por el mismo camino de negocio.
  assert.match(src, /onChange=\{alTeclearEnElCelular\}/);
  assert.match(src, /onVoz=\{alDictarEnElCelular\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA URL HIDRATA POR UN EVENTO, NO POR COMPARAR CADENAS
// ═══════════════════════════════════════════════════════════════════════════

test("LA PANTALLA YA NO HIDRATA EL ESTADO DESDE `searchParams`", () => {
  // El efecto viejo reaccionaba a CUALQUIER cambio de `searchParams` y decidía
  // comparando contra la última URL escrita. Con varias navegaciones propias en
  // vuelo, una intermedia se leía como externa y pisaba el estado más nuevo.
  const src = codigoDe(PAGINA);

  assert.ok(
    !/aplicarEstadoDeLaUrl\(searchParams\)/.test(src),
    "volvió a hidratar el estado desde searchParams: ahí vive la carrera"
  );
  assert.ok(
    !/\[\s*searchParams\s*,[^\]]*aplicarEstadoDeLaUrl\s*\]/.test(src),
    "volvió el efecto que depende de searchParams para hidratar"
  );
});

test("hidrata con `popstate`, que el navegador solo dispara al navegar el historial", () => {
  const src = codigoDe(PAGINA);
  assert.match(src, /addEventListener\("popstate"/);
  assert.match(src, /removeEventListener\("popstate"/, "el oyente no se limpia al desmontar");
  assert.match(src, /laUrlHidrataElEstado\(ORIGEN_DE_URL\.HISTORIAL\)/);
  // Se lee de la barra de direcciones y no del router: cuando `popstate` llega,
  // `window.location` ya está en el destino y no hay que esperar a nadie.
  assert.match(src, /new URLSearchParams\(window\.location\.search\)/);
});

test("y `searchParams` sigue sirviendo para lo que sí es reactivo: los modales", () => {
  // No se sacó el hook: `editar` y `nuevo` sí tienen que reaccionar, y el estado
  // inicial se sigue leyendo de ahí al montar.
  const src = codigoDe(PAGINA);
  assert.match(src, /const nuevo = searchParams\.get\("nuevo"\)/);
  assert.match(src, /const editarId = searchParams\.get\("editar"\)/);
  assert.match(src, /filtros: filtrosDeLaUrl\(searchParams\)/);
});

test("Atrás repone también el texto del campo, en las dos composiciones", () => {
  const src = codigoDe(PAGINA);
  // Móvil: el borrador se repone junto con el estado confirmado.
  assert.match(src, /setTextoBusquedaMovil\(estado\.filtros\.search\)/);
  // Escritorio: el panel lee `initial` al montarse, así que se remonta con lo
  // restaurado. El contador se mueve SOLO al navegar el historial.
  assert.match(src, /setGeneracionDeHistorial\(\(n\) => n \+ 1\)/);
  assert.match(src, /key=\{generacionDeHistorial\}/);
  const sinComentarios = src;
  const vecesQueSeMueve = (sinComentarios.match(/setGeneracionDeHistorial\(/g) || []).length;
  assert.equal(
    vecesQueSeMueve,
    1,
    "el contador se mueve en más de un lugar: si teclear lo toca, el escritorio se remonta por tecla"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE NO SE PODÍA ROMPER
// ═══════════════════════════════════════════════════════════════════════════

test("buscar sigue REEMPLAZANDO y las cards siguen APILANDO", () => {
  // La regla vieja no se toca: una entrada por tecla convierte volver de
  // "aceite" en seis toques de Atrás.
  const src = codigoDe(PAGINA);
  assert.match(src, /const apilar = laSeleccionDeCardsCambio\(/);
  assert.match(src, /if \(apilar\) router\.push\(url, \{ scroll: false \}\)/);
  assert.match(src, /else router\.replace\(url, \{ scroll: false \}\)/);
});

test("la protección contra respuestas fuera de orden queda intacta", () => {
  // Ya estaba bien y no era parte del defecto: protege las RESPUESTAS, no el
  // texto que se escribe.
  const src = codigoDe(PAGINA);
  assert.match(src, /const miToken = \+\+tokenListadoRef\.current/);
  assert.match(src, /haceElUltimoPedido\(tokenListadoRef, miToken\)/);
});

test("el pedido del listado sigue saliendo de `claveDelPedido`", () => {
  // Lo que cambió es cuántas veces cambia esa clave al escribir, no quién
  // dispara el pedido.
  const src = codigoDe(PAGINA);
  assert.match(src, /const claveDelPedido = useMemo\(/);
  assert.match(src, /if \(yaSalio\(pedidoRef, claveDelPedido, localId\)\) return/);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL ESCRITORIO NO CAMBIÓ DE COMPORTAMIENTO
// ═══════════════════════════════════════════════════════════════════════════

test("el escritorio conserva su borrador local y su debounce", () => {
  const src = codigoDe(FILTROS);
  assert.match(src, /const \[search, setSearch\] = useState\(initial\.search \|\| ""\)/);
  assert.match(src, /}, MS_DEBOUNCE_BUSQUEDA\)/);
  // La ventana ya no está escrita a mano acá: es la misma del celular.
  assert.ok(
    !/\}, 250\)/.test(src),
    "volvió el 250 escrito a mano: dos números que se separan el día que alguien toca uno"
  );
  assert.match(src, /import \{ MS_DEBOUNCE_BUSQUEDA \} from "@\/lib\/productos\/busquedaDelCatalogo"/);
});
