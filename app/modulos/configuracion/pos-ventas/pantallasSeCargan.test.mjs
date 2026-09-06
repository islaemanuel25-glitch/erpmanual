// CANDADO: LAS PANTALLAS DE CONFIGURACIÓN POS SE PUEDEN CARGAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/configuracion/pos-ventas/pantallasSeCargan.test.mjs
//
// ── QUÉ AGUJERO TAPA ───────────────────────────────────────────────────────
//
// El CI de este repo NO corre `next build`. Corre los candados, las migraciones
// y las pruebas de base, y ninguna de esas tres abre un `page.jsx`. O sea que
// una pantalla con un import mal escrito, un módulo que no existe o una llave de
// más pasa TODO en verde y se descubre abriendo la pantalla.
//
// No es hipotético y está anotado en CLAUDE.md: un identificador usado sin
// importar compiló, pasó el lint, pasaron más de mil candados y reventó en
// producción; y un `SunmiInput` sin importar hizo lo mismo en el módulo de
// comprobante.
//
// Esto IMPORTA cada pantalla nueva. Con eso alcanza para atrapar el error de
// sintaxis, la ruta de import equivocada y el export con nombre que no existe
// —el caso de `SunmiSelectOption`—, que son los que dejan la pantalla en blanco.
//
// ── LO QUE NO PRUEBA ───────────────────────────────────────────────────────
//
// Que dibujen bien, ni que dibujen algo. Importar ejecuta lo de arriba del
// archivo, no el cuerpo del componente: un identificador que solo se usa adentro
// del JSX sigue sin verse acá. Para eso están el candado de render de
// `FormularioMedio` y, sobre todo, abrir la pantalla.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PANTALLAS = [
  ["Configuración POS (portada)", "@/app/modulos/configuracion/pos-ventas/page.jsx"],
  ["Reglas de venta", "@/app/modulos/configuracion/pos-ventas/reglas/page.jsx"],
  ["Cobros", "@/app/modulos/configuracion/pos-ventas/cobros/page.jsx"],
  ["Editar medio", "@/app/modulos/configuracion/pos-ventas/cobros/[clave]/page.jsx"],
  ["Agregar medio", "@/app/modulos/configuracion/pos-ventas/cobros/nuevo/page.jsx"],
  ["Integraciones", "@/app/modulos/configuracion/pos-ventas/integraciones/page.jsx"],
  ["Recargos (ruta vieja, ahora redirección)", "@/app/modulos/configuracion/recargos-pago/page.jsx"],
  ["Landing de Configuración", "@/app/modulos/configuracion/page.jsx"],
];

for (const [nombre, ruta] of PANTALLAS) {
  test(`${nombre} se importa y exporta un componente`, async () => {
    const modulo = await import(ruta);
    assert.equal(typeof modulo.default, "function", `${ruta} no exporta un componente por defecto`);
  });
}

test("el formulario compartido y el hook de datos también", async () => {
  const form = await import("@/components/configuracion-pos/FormularioMedio.jsx");
  assert.equal(typeof form.default, "function");

  const hook = await import("@/hooks/useMediosCobro.js");
  assert.equal(typeof hook.default, "function");
});

// CANDADOS DEL REDISEÑO MOBILE APROBADO EN FIGMA.
//
// La portada puede cambiar su contenido, pero debe vivir DENTRO del shell global
// del ERP: el Header y el título mobile los sigue poniendo LayoutBase, igual que
// en Productos y el resto de los módulos.
test("la portada mobile usa tokens del sistema y no hardcodea colores ni px arbitrarios", () => {
  const portada = readFileSync(new URL("./page.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    portada,
    /#[0-9a-fA-F]{3,8}\b/,
    "la portada introdujo un color hexadecimal literal"
  );
  assert.doesNotMatch(
    portada,
    /\[[0-9.]+px\]/,
    "la portada introdujo una medida arbitraria en px"
  );

  // ── LA AFIRMACIÓN DE `sunmi-btn-accent-soft` SE FUE, TAMBIÉN A PROPÓSITO ─
  //
  // Esa clase la ponía el bloque del "Tip" escrito adentro de esta página. El
  // bloque se fue al kit —`SunmiAviso`— porque Cobros necesita el mismo aviso,
  // así que ahora la clase vive en la pieza. Exigirla acá sería pedir que el
  // token vuelva a estar suelto en la pantalla, que es justo lo contrario de lo
  // que queremos.
  //
  // Lo que se exige en su lugar es que la portada CONSUMA las piezas del kit:
  // si alguien vuelve a dibujar la tarjeta o el aviso a mano, esto se pone rojo.
  assert.match(portada, /SunmiNavCard/);
  assert.match(portada, /SunmiAviso/);

  // ── LA AFIRMACIÓN DE `var(--success-fg)` SE FUE, Y SE FUE A PROPÓSITO ────
  //
  // Esa variable solo la usaba el chip verde con el rol del usuario. Ese chip y
  // el del local se sacaron: el Header global del ERP ya muestra las dos cosas
  // arriba, en todas las pantallas, y repetirlas dos centímetros más abajo hacía
  // que ésta se viera distinta del resto sin agregar un dato.
  //
  // Exigirla ahora dejaría el candado pidiendo que vuelva algo que decidimos
  // sacar. Lo que sí se sigue exigiendo —arriba— es que no aparezca un color
  // literal ni una medida arbitraria, que es lo que el candado cuida de verdad.
  // Se prohíben los INGREDIENTES de los chips, no la palabra "Local:". La
  // primera versión de esta línea también prohibía esa cadena y se puso en rojo
  // sola: el bloque DESKTOP la usa legítimamente, en el subtítulo de
  // `SunmiHeader`. Pedía algo que la pantalla nunca prometió.
  assert.doesNotMatch(
    portada,
    /rolNombre|UserRound/,
    "los chips de local y rol volvieron: eso ya lo muestra el Header global"
  );
});

// LA TARJETA DE SECCIÓN ES UNA PIEZA DEL KIT, NO JSX SUELTO EN LA PÁGINA.
//
// Antes el tamaño del redondel, el relleno, el radio, el estado atenuado y el
// tratamiento del icono estaban escritos adentro de la portada. La segunda
// pantalla que quisiera una lista de secciones los habría escrito de nuevo, y
// ahí empiezan las diferencias entre pantallas que muestran lo mismo.
test("la portada consume SunmiNavCard en vez de dibujar la tarjeta a mano", () => {
  const portada = readFileSync(new URL("./page.jsx", import.meta.url), "utf8");

  assert.match(portada, /SunmiNavCard/);
  assert.doesNotMatch(
    portada,
    /size-12 shrink-0 items-center/,
    "el redondel del icono volvió a la página: va en la pieza"
  );
});

test("Configuración POS conserva el header y el título mobile globales del ERP", () => {
  const portada = readFileSync(new URL("./page.jsx", import.meta.url), "utf8");
  const layout = readFileSync(
    new URL("../../../../components/LayoutBase.jsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    layout,
    /configuracionPosMobile/,
    "LayoutBase no debe tener una excepción de chrome para Configuración POS"
  );
  assert.match(
    layout,
    /<Header onOpenMobileMenu=\{headerMobileHandler\} \/>/,
    "el Header global debe renderizarse normalmente"
  );
  assert.match(
    layout,
    /<div className="md:hidden px-4 py-3 text-xl font-semibold">[\s\S]*\{tituloMobile\}/,
    "el título mobile global debe seguir activo"
  );

  assert.doesNotMatch(
    portada,
    /ArrowLeft|theme\.header|<h1[^>]*>Configuración POS<\/h1>|<h2[^>]*>[\s\S]*Configuración POS[\s\S]*<\/h2>/,
    "la portada no debe inventar un header o un título paralelo"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// COBROS COMPARTE EL PATRÓN, Y LA LISTA SIGUE SIENDO DEL SERVIDOR
// ══════════════════════════════════════════════════════════════════════════

/** Un archivo de pantalla sin comentarios: acá se mira lo que HACE. */
function sinComentarios(relativa) {
  return readFileSync(new URL(relativa, import.meta.url), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const cobrosSinComentarios = () => sinComentarios("./cobros/page.jsx");

/** Las dos pantallas de formulario, que comparten `FormularioMedio`. */
const FORMULARIOS = [
  ["Editar medio", "./cobros/[clave]/page.jsx"],
  ["Agregar medio", "./cobros/nuevo/page.jsx"],
];

test("Cobros usa las MISMAS piezas que la portada, no una tarjeta propia", () => {
  const cobros = cobrosSinComentarios();
  assert.match(cobros, /SunmiNavCard/);
  assert.match(cobros, /SunmiAviso/);
  assert.doesNotMatch(
    cobros,
    /size-12 shrink-0 items-center/,
    "el redondel volvió a la página: su geometría vive en la pieza"
  );
});

test("los medios se dibujan desde el servidor, no escritos en la pantalla", () => {
  // Es lo que hace que la pantalla funcione con cualquier cantidad y cualquier
  // nombre. Si alguien escribiera los cuatro de hoy, esto se pone rojo.
  const cobros = cobrosSinComentarios();
  assert.match(cobros, /medios\.map\(/);
  assert.doesNotMatch(
    cobros,
    /"Efectivo"|"Débito"|"Crédito"|"Mercado Pago"/,
    "hay un medio escrito a mano en la pantalla"
  );
});

test("el resumen de la tarjeta es el comercial, no el orden ni el procesador", () => {
  // Recargo y comisión son lo que cambia plata. El orden y el procesador siguen
  // existiendo y siguen siendo editables adentro del medio; simplemente no son
  // lo primero que alguien necesita leer en una lista.
  const cobros = cobrosSinComentarios();
  assert.match(cobros, /resumenComercial/);
  assert.doesNotMatch(cobros, /resumenClasificacion/);
});

test("el aviso de configuración predeterminada aparece SOLO con usandoDefaults", () => {
  const cobros = cobrosSinComentarios();
  assert.match(cobros, /usandoDefaults && \(/);
  assert.match(cobros, /Configuración predeterminada/);
  // Y el párrafo permanente sobre procesadores no vuelve: se leía una vez y
  // después estorbaba todos los días.
  assert.doesNotMatch(cobros, /Un mismo procesador puede tener varios botones/);
});

test("COBROS REGISTRA UNA ACCIÓN, Y ESA ACCIÓN ES EL SunmiBackButton DEL KIT", () => {
  const cobros = cobrosSinComentarios();
  assert.match(cobros, /useAccionDePagina\(/, "Cobros no registra ninguna acción de página");
  assert.match(cobros, /SunmiBackButton/, "el botón sale del kit, no se dibuja otra flecha");
  assert.match(
    cobros,
    /useAccionDePagina\(\s*\(\) => \([\s\S]*?<SunmiBackButton href=\{RUTA_PORTADA\}/,
    "lo registrado tiene que ser el botón del kit, no otra cosa"
  );
});

test("el destino de la acción es explícito: la portada de Configuración POS", () => {
  const cobros = cobrosSinComentarios();
  assert.match(
    cobros,
    /const RUTA_PORTADA = "\/modulos\/configuracion\/pos-ventas"/,
    "desde Cobros se vuelve SIEMPRE a la portada, no a lo último que se visitó"
  );
  assert.doesNotMatch(
    cobros,
    /router\.back\(\)/,
    "router.back() llevaría a donde sea que se venga, no a la portada"
  );
});

test("EL BOTÓN NO VUELVE A OCUPAR UNA FILA PROPIA EN MOBILE", () => {
  // Era el defecto: el botón quedaba en una fila aparte debajo del título y
  // regalaba una franja de alto. Ahora en mobile lo dibuja el shell, en la misma
  // fila que "Cobros"; lo que queda en la pantalla es SOLO la colocación de
  // escritorio, donde el shell no tiene fila de título propia.
  const cobros = cobrosSinComentarios();
  assert.match(
    cobros,
    /<div className="hidden md:flex justify-end mb-2">\{volver\}<\/div>/,
    "la colocación de escritorio cambió, o el botón volvió a ocupar alto en mobile"
  );
  assert.doesNotMatch(
    cobros,
    /<div className="flex justify-end mb-2">/,
    "el botón volvió a tener su propia fila en mobile"
  );
  // Un solo lugar donde se declara: la pantalla dibuja el mismo nodo que
  // registró. Si apareciera un segundo `<SunmiBackButton .../>` habría dos
  // botones que se pueden ir separando con el tiempo.
  assert.equal((cobros.match(/<SunmiBackButton/g) || []).length, 1);
});

test("'Cobros' se escribe una sola vez: el título lo pone el shell", () => {
  // El título de la pantalla lo dibujan el bloque mobile de LayoutBase y el
  // <h1> del Header, los dos desde `usePageTitle`. Si la página además pusiera
  // el suyo, se leería dos veces seguidas.
  const cobros = cobrosSinComentarios();
  assert.doesNotMatch(cobros, /<h1[^>]*>[\s\S]*?Cobros[\s\S]*?<\/h1>/);
  // Y la bajada sí se queda: es de la pantalla, no del shell.
  assert.match(cobros, /Configurá los medios de cobro de este local/);
});

test("Cobros no repite el contexto que ya muestra el shell", () => {
  const cobros = cobrosSinComentarios();
  assert.doesNotMatch(
    cobros,
    /useContextoActivo|Local: |SunmiHeader/,
    "el local y la cinta del módulo ya los pone el shell del ERP"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// EDITAR Y AGREGAR CUMPLEN EL MISMO CONTRATO QUE LA LISTA
// ══════════════════════════════════════════════════════════════════════════
//
// Eran las dos que faltaban. Cada una abría con una cinta ámbar en mayúsculas
// —"MERCADO PAGO"— y abajo "Cobros · Local: Depósito Central", mientras el shell
// ya decía "Cobros" arriba de todo. Dos encabezados para una pantalla, y ninguno
// de los dos nombraba dónde estaba parado quien miraba.

for (const [nombre, ruta] of FORMULARIOS) {
  test(`${nombre}: el título y el Volver los registra en el shell`, () => {
    const pantalla = sinComentarios(ruta);
    assert.match(pantalla, /useTituloDePagina\(/, "el título tiene que salir de la pantalla");
    assert.match(pantalla, /useAccionDePagina\(/);
    assert.match(pantalla, /<SunmiBackButton href=\{RUTA_COBROS\} \/>/);
  });

  test(`${nombre}: un solo Volver, y en mobile no ocupa una fila propia`, () => {
    const pantalla = sinComentarios(ruta);
    // Mismo criterio que en la lista: la colocación de escritorio es lo único
    // que queda en la página, porque allá el shell no tiene fila de título.
    assert.match(pantalla, /<div className="hidden md:flex justify-end mb-2">\{volver\}<\/div>/);
    assert.doesNotMatch(pantalla, /<div className="flex justify-end mb-2">/);
    assert.equal((pantalla.match(/<SunmiBackButton/g) || []).length, 1);
  });

  test(`${nombre}: no repite el contexto ni escribe un encabezado propio`, () => {
    const pantalla = sinComentarios(ruta);
    assert.doesNotMatch(
      pantalla,
      /useContextoActivo|Local: |SunmiHeader|subtitulo=/,
      "el local y la cinta se sacaron del diseño: el shell ya pone el título"
    );
  });
}

test("y la pieza compartida tampoco dibuja un encabezado", () => {
  const form = readFileSync(
    new URL("../../../../components/configuracion-pos/FormularioMedio.jsx", import.meta.url),
    "utf8"
  )
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.doesNotMatch(form, /SunmiHeader/, "la cinta del título no puede volver");
  assert.doesNotMatch(form, /subtitulo/, "el subtítulo del local se sacó del diseño");
  // Y lo que SÍ le quedó de arriba: la bajada de cada modo.
  assert.match(form, /Configurá cómo se muestra y se cobra con este medio\./);
  assert.match(form, /Creá un nuevo medio de cobro para este local\./);
});
