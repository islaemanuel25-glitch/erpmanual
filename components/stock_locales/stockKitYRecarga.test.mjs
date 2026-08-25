// CANDADOS DE LA SEGUNDA TANDA DE STOCK: KIT, ORDEN DE RECARGA Y FILTROS.
//
// Los cinco defectos que cierran acá tienen la misma forma: ninguno rompía nada.
// Dos tarjetas creciendo en paralelo, un pedido de más, una card que se apagaba
// sola, un catálogo pedido dos veces. Todo "andaba".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const TARJETA = leer("components/stock_locales/TarjetaStockMovil.jsx");
const TABLA = leer("components/stock_locales/TablaStock.jsx");
const PANTALLA = leer("app/modulos/stock_locales/page.jsx");
const FILTROS = leer("components/stock_locales/FiltrosStock.jsx");
const HOOK = leer("hooks/useResumenStock.js");
const TARJETA_PRODUCTOS = leer("components/productos/TarjetaProductoMovil.jsx");

test("KIT1. LA TARJETA DE STOCK CONSUME EL KIT, no arma otra card", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE ──────────────────────────────────────────
  //
  // La primera versión armaba su propia tarjeta con `SunmiPanel`: dos tarjetas
  // de producto creciendo en paralelo. El día que una cambiara —el padding, el
  // límite visible contra el fondo, el ritmo vertical— la otra se quedaba vieja
  // sin que nada avisara. Es "escribir una parecida al lado", que es lo que la
  // regla 1 del repo prohíbe.
  assert.match(TARJETA, /from "@\/components\/sunmi\/SunmiProductoCard"/, "no usa la tarjeta del kit");
  assert.match(TARJETA, /<SunmiProductoCard/);
  assert.doesNotMatch(TARJETA, /<SunmiPanel/, "volvió a construir su propia card con SunmiPanel");

  // Y usa las ranuras, no reimplementa sus piezas.
  for (const pieza of ["BloqueValorTarjeta", "RotuloBloqueValor", "NumeroBloqueValor", "AccionTarjeta"]) {
    assert.match(TARJETA, new RegExp(pieza), `no usa ${pieza} del kit`);
  }

  // La lista también es la del kit: el `grid` con su `auto-rows-fr` iguala
  // alturas, y escribirlo a mano acá lo dejaba fuera de sincronía.
  assert.match(TABLA, /SunmiListaProductoCards/, "la lista móvil no usa la del kit");
});

test("KIT2. EL CÓDIGO DE PROVEEDOR SE OCULTA, no se deja vacío", () => {
  // ── `false` Y `null` NO SON LO MISMO EN ESTA TARJETA ────────────────────
  //
  // El kit distingue "esta pantalla no lo muestra" —el renglón desaparece— de
  // "no hay dato" —el renglón se queda y dice qué falta—.
  //
  // El listado de stock no devuelve el código de proveedor. Pasarle `null` haría
  // que la tarjeta escribiera "Sin cód. prov." en TODAS las filas: una afirmación
  // falsa sobre el catálogo entero.
  assert.match(
    TARJETA,
    /codigoInterno=\{false\}/,
    "el código de proveedor no se oculta: con null la tarjeta afirma que no hay dato en todas las filas"
  );
  // Y no se agregó código de proveedor, que quedó fuera de alcance.
  assert.doesNotMatch(TARJETA, /codigoProveedor|ProductoCodigoProveedor/, "entró código de proveedor");
});

test("KIT3. PRODUCTOS SIGUE USANDO LA MISMA PIEZA", () => {
  // La extracción tiene que dejar a Productos consumiendo el kit, no una copia:
  // si Productos volviera a tener su propio bloque de valor, la pieza compartida
  // dejaría de estar compartida y el próximo cambio se aplicaría a una sola.
  assert.match(TARJETA_PRODUCTOS, /from "@\/components\/sunmi\/SunmiProductoCard"/);
  assert.match(TARJETA_PRODUCTOS, /BloqueValorTarjeta/);
  assert.match(TARJETA_PRODUCTOS, /AccionTarjeta/);
});

test("REC1. EL RESUMEN NO SE PIDE DOS VECES POR CADA GUARDADO", () => {
  // ── EL DEFECTO, Y POR QUÉ ERA INVISIBLE ────────────────────────────────
  //
  // El hook componía su clave con el booleano `refrescar`, que hace un viaje de
  // IDA Y VUELTA: lo prende quien guarda y `useStockData` lo devuelve a false al
  // terminar. La clave cambiaba dos veces por guardado, así que salían DOS
  // pedidos a `/resumen` — y el primero mientras el listado seguía en vuelo,
  // que es exactamente lo que la puerta existe para evitar.
  //
  // Los dos pedidos devolvían el mismo número, así que la pantalla se veía bien.
  assert.doesNotMatch(HOOK, /post-cambio|inicial/, "volvió la clave que iba y volvía con el booleano");
  assert.doesNotMatch(HOOK, /refrescar/, "el hook volvió a depender del booleano de refresco");
  assert.match(HOOK, /generacion/, "no hay una generación que avance en un solo sentido");
  assert.match(HOOK, /\$\{localSeleccionado\}\|\$\{generacion\}/, "la clave no es ubicación + generación");
});

test("REC2. LA GENERACIÓN SUBE UNA VEZ POR CARGA QUE CORRESPONDE RECONTAR", () => {
  // El aviso no puede mirar `refrescar` en el momento de terminar: `useStockData`
  // lo apaga en el MISMO tick que apaga `loading`, así que ya vale false. La
  // intención se anota cuando el booleano se PRENDE y se consume al terminar.
  assert.match(TABLA, /pendienteRef/, "no se anota la intención de recontar");
  assert.match(TABLA, /if \(refrescar\) pendienteRef\.current = true/, "la intención no se anota al prender");
  assert.match(TABLA, /pendienteRef\.current = false/, "la intención no se consume");
  assert.match(TABLA, /genRef\.current \+= 1/, "la generación no avanza");
  assert.match(TABLA, /gen: genRef\.current/, "la generación no viaja en el aviso");

  // Y sigue avisando en la PRIMERA carga de cada ubicación, no solo tras guardar.
  assert.match(TABLA, /esPrimeraDeEsteLocal/, "se perdió el aviso de la primera carga");
});

test("FIL1. LA CARD ACTIVA SOBREVIVE A BUSCAR Y FILTRAR", () => {
  // ── EL DEFECTO ─────────────────────────────────────────────────────────
  //
  // `FiltrosStock` emite el juego COMPLETO de sus filtros. Pasarle `setFiltro`
  // directo reemplazaba el objeto entero y se llevaba puesto `estado` —la card
  // activa— apenas se escribía en el buscador. La card se apagaba sola y el
  // listado volvía a traer todo, sin que nada fallara.
  assert.doesNotMatch(
    PANTALLA,
    /onFiltroChange=\{setFiltro\}/,
    "se pasa setFiltro directo: los filtros pisan la card activa"
  );
  assert.match(PANTALLA, /onFiltroChange=\{alCambiarFiltros\}/);
  assert.match(
    PANTALLA,
    /prev\.estado \? \{ \.\.\.nuevos, estado: prev\.estado \} : nuevos/,
    "los filtros no conservan el estado de la card"
  );

  // Se apaga solo por las dos vías previstas.
  assert.match(PANTALLA, /if \(prev\.estado === id\)/, "tocar la card activa dejó de apagarla");
  assert.match(PANTALLA, /const alLimpiar = useCallback/, "Limpiar no borra la card");
});

test("FIL2. LOS HANDLERS SON ESTABLES, no funciones inline", () => {
  // ── POR QUÉ IMPORTA ACÁ Y NO EN CUALQUIER PANTALLA ─────────────────────
  //
  // El efecto de `FiltrosStock` que dispara el filtrado tiene `onFiltroChange`
  // entre sus dependencias. Una función inline se recrea en cada render, así que
  // ese efecto correría de más y el debounce se reiniciaría solo.
  assert.match(PANTALLA, /const alCambiarFiltros = useCallback/, "el handler de filtros es inestable");
  assert.match(PANTALLA, /const alTocarCard = useCallback/);
  assert.match(PANTALLA, /const alCargarCatalogos = useCallback/);
  assert.doesNotMatch(PANTALLA, /onReset=\{\(\) =>/, "onReset volvió a ser una función inline");
});

test("CAT1. EL CATÁLOGO DE PROVEEDORES SE PIDE UNA SOLA VEZ", () => {
  // `FiltrosStock` ya traía los tres catálogos, y la pantalla pedía proveedores
  // otra vez para resolver el nombre en la tarjeta: dos pedidos idénticos en
  // cada entrada. Ahora lo informa quien lo carga.
  assert.doesNotMatch(
    PANTALLA,
    /fetch\(\s*"\/api\/catalogos\/proveedores"/,
    "la pantalla volvió a pedir el catálogo por su cuenta"
  );
  assert.match(FILTROS, /onCatalogos\?\.\(/, "FiltrosStock no informa los catálogos que ya trajo");
  assert.match(PANTALLA, /onCatalogos=\{alCargarCatalogos\}/);

  // Y no se resolvió con un join nuevo en el listado, que era la otra salida y
  // estaba prohibida.
  const listar = leer("app/api/stock_locales/listar/route.js");
  assert.doesNotMatch(listar, /proveedor: \{ select/, "se agregó un join de proveedor al listado");
});

test("VIS1. EL RESUMEN APLICA LA MISMA VISIBILIDAD QUE EL LISTADO", () => {
  // Una `ProductoLocal` cáscara —creada por otro local que no es depósito— la
  // esconde el listado con `productoVisibleWhere`. El resumen no lo hacía, así
  // que la contaba: la card decía un número más alto y no había forma de llegar
  // a esas filas.
  const resumen = leer("app/api/stock_locales/resumen/route.js");
  assert.match(resumen, /LEFT JOIN "Local" cel/, "el resumen no mira el local creador");
  assert.match(resumen, /pb\."creadoEnLocalId" IS NULL/, "no contempla el producto sin local creador");
  assert.match(resumen, /cel\."es_deposito" = true/);
  assert.match(resumen, /pb\."creadoEnLocalId" = \$1/);
  // En positivo y no como NOT: con `creadoEnLocalId` en null un `NOT (...)` da
  // NULL y la fila se cae del conteo, que es el caso más común.
  assert.doesNotMatch(resumen, /AND NOT \(\s*COALESCE\("?cel/, "la regla volvió a escribirse como NOT");
});

test("DOC1. LA DOCUMENTACIÓN DICE DÓNDE SE SELLA DE VERDAD", () => {
  // El comentario decía que la marca la escribe `/api/stock_locales/limites`, y
  // esa ruta NO se consume. Un comentario que apunta a código muerto manda al
  // próximo lector al lugar equivocado.
  // CRUDO y no con `leer`: lo que se afirma acá VIVE en un comentario, y `leer`
  // los saca. Con el archivo limpiado, este candado daba rojo sobre un schema
  // correcto — y peor, habría dado verde si alguien borraba el comentario.
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const migracion = fs.readFileSync(
    path.join(RAIZ, "prisma/migrations/20260824010000_stock_limites_configurados_at/migration.sql"),
    "utf8"
  );
  assert.doesNotMatch(
    schema,
    /La escribe únicamente `\/api\/stock_locales\/limites`/,
    "el schema sigue diciendo que la escribe la ruta muerta"
  );
  assert.match(schema, /ajustar` con `modo: "limites"`/, "el schema no nombra la ruta real");
  assert.match(migracion, /ajustar con modo "limites"/, "la migración no nombra la ruta real");

  // Y la ruta real efectivamente sella.
  const ajustar = leer("app/api/stock_locales/ajustar/route.js");
  assert.match(ajustar, /limitesConfiguradosAt: new Date\(\)/);
});
