// CANDADOS DE LA VISTA MÓVIL DE STOCK.
//
// Lo que se puede afirmar leyendo: que la vista móvil EXISTE y no es la tabla con
// scroll, que usa el kit en vez de elementos crudos, que las dos acciones siguen
// separadas y que los contadores no salen a competir con el listado.
//
// Lo que NO se puede afirmar acá —que a 390 px no haya scroll horizontal, que
// tocar una card filtre de verdad— lo mide la sonda: necesita un navegador.

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
const RESUMEN_HOOK = leer("hooks/useResumenStock.js");

test("MOV1. HAY UNA VISTA MÓVIL DE VERDAD, no la tabla arrastrable", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE ──────────────────────────────────────────
  //
  // La tabla vive dentro de un `overflow-x-auto`: en un teléfono había que
  // arrastrarla de costado para leer una fila. El encargo pide una vista móvil
  // real, y era la mitad del sentido de la tanda.
  assert.match(TABLA, /md:hidden/, "no hay bloque exclusivo de celular");
  assert.match(TABLA, /hidden md:block overflow-x-auto/, "la tabla dejó de ser exclusiva de escritorio");
  assert.match(TABLA, /TarjetaStockMovil/, "el celular no dibuja tarjetas");
});

test("MOV2. LA TARJETA NO MUESTRA UN CERO CUANDO NO HAY LÍMITE", () => {
  // Es la regla que motivó la tanda, del lado que la persona ve: "mín 0" sobre un
  // producto nunca configurado es una afirmación falsa con cara de dato.
  assert.match(TARJETA, /limitesConfigurados/, "la tarjeta no consulta si están configurados");
  assert.match(TARJETA, /Sin ajustar/, "no dice 'Sin ajustar' cuando no hay límites");
});

test("MOV3. LAS DOS ACCIONES SIGUEN SEPARADAS", () => {
  // Ajustar mueve cantidad; Límites mueve mínimo y máximo. Juntarlas en un botón
  // sería mezclar dos operaciones que el negocio mantiene distintas.
  assert.match(TARJETA, /Ajustar/);
  assert.match(TARJETA, /Límites/);
  assert.match(TARJETA, /onAjustar\?\.\(item\)/);
  assert.match(TARJETA, /onLimites\?\.\(item\)/);
});

test("MOV4. LA TARJETA NO TRAE NADA DEL CATÁLOGO", () => {
  // El diseño lo dice expreso: sin precio, sin edición de producto, sin
  // funciones de catálogo. Es una pantalla de STOCK.
  assert.doesNotMatch(TARJETA, /precioVenta|precioCosto|precioUnitario/, "la tarjeta muestra precios");
  assert.doesNotMatch(TARJETA, /Editar producto|onEditarProducto/, "la tarjeta abre la ficha de producto");
});

test("MOV5. SE USA EL KIT, no botones ni paginadores a mano", () => {
  // ── ESTE CANDADO SE REESCRIBIÓ, Y CONVIENE SABER POR QUÉ ────────────────
  //
  // Afirmaba `SunmiButton` y `SunmiPanel` porque la tarjeta armaba SU PROPIA
  // card. Ahora consume `SunmiProductoCard`, que es la del catálogo, y sus
  // acciones son `AccionTarjeta` — la misma pieza que usa Productos para su
  // botón de editar.
  //
  // O sea que el candado seguía siendo verdad y describía una arquitectura peor.
  // Si se hubiera dejado como estaba, habría OBLIGADO a conservar la card
  // duplicada: un candado que fija el defecto en vez de defenderlo.
  assert.match(TARJETA, /AccionTarjeta/, "las acciones no usan la pieza del kit");
  assert.match(TARJETA, /SunmiProductoCard/, "la tarjeta no consume la card del kit");
  assert.doesNotMatch(TARJETA, /<button/, "quedó un <button> crudo en la tarjeta");
  assert.doesNotMatch(TARJETA, /<input/, "quedó un <input> crudo en la tarjeta");

  // El paginador a mano —dos botones con ◀ y ▶— se fue al del kit.
  assert.match(TABLA, /SunmiPaginador/, "no se usa el paginador del kit");
  assert.doesNotMatch(TABLA, /sunmi-btn sunmi-control/, "quedó el paginador armado a mano");
});

test("MOV6. LA CANTIDAD SE FORMATEA CON LA MISMA PIEZA QUE LA TABLA", () => {
  // Un formateador escrito al lado haría que packs, kilos, unidades y fiambre
  // se leyeran distinto en móvil y escritorio para el mismo producto.
  assert.match(
    TARJETA,
    /presentacionCantidadStock/,
    "la tarjeta formatea la cantidad por su cuenta"
  );
  assert.match(TABLA, /presentacionCantidadStock/);
});

test("MOV7. LAS CARDS VAN ARRIBA DEL BUSCADOR Y REUSAN EL CARRUSEL", () => {
  // El orden es el del diseño aprobado. Y el carrusel es el de Productos: si se
  // escribiera uno nuevo al lado, las dos pantallas empezarían a verse distinto
  // el día que una cambie.
  assert.match(PANTALLA, /CarruselControles/, "las cards no reusan el carrusel del kit");
  const iCards = PANTALLA.indexOf("CarruselControles");
  const iFiltros = PANTALLA.indexOf("<FiltrosStock");
  assert.ok(iCards > 0 && iFiltros > 0, "no se encontraron las dos piezas");
  assert.ok(iCards < iFiltros, "las cards quedaron debajo del buscador");
});

test("MOV8. TOCAR LA CARD ACTIVA LA APAGA, y solo una puede estar prendida", () => {
  // El estado activo vive DENTRO del filtro y no en un estado paralelo: si
  // viviera aparte habría dos verdades sobre qué se está mostrando.
  assert.match(PANTALLA, /const estadoActivo = filtro\.estado \|\| null/);
  assert.match(PANTALLA, /if \(prev\.estado === id\)/, "tocar la card activa no la apaga");
  // Se reemplaza, no se acumula: un solo estado a la vez.
  assert.match(PANTALLA, /\{ \.\.\.prev, estado: id \}/);
  assert.match(PANTALLA, /setPage\(1\)/, "cambiar de card deja la página vieja");
});

test("MOV9. LOS CONTADORES ESPERAN AL LISTADO, y reusan la puerta de Productos", () => {
  // ── LA MISMA LECCIÓN, Y ACÁ EL DESBALANCE ES MAYOR ─────────────────────
  //
  // El listado trae 25 filas; el resumen recorre el catálogo de la ubicación. La
  // regla de cuándo puede salir no se reescribe: se importa de Productos, que ya
  // la tiene con sus candados y sus contrapruebas.
  assert.match(
    RESUMEN_HOOK,
    /from "@\/lib\/productos\/ordenDeCargaProductos"/,
    "el resumen escribió su propia regla de orden en vez de reusar la que existe"
  );
  assert.match(RESUMEN_HOOK, /controlesPuedenSalir/);
  assert.doesNotMatch(RESUMEN_HOOK, /setTimeout/, "volvió el retraso adivinado");

  // Y una respuesta vieja no pisa los contadores de la ubicación actual.
  assert.match(RESUMEN_HOOK, /haceElUltimoPedido/);

  // El listado avisa cuándo terminó, bien o mal: si solo avisara del éxito, un
  // listado fallido dejaría las cards cargando para siempre.
  // El aviso lleva `ok` —para que un listado fallido no deje las cards cargando
  // para siempre— y ahora además una generación, que es lo que evita el segundo
  // pedido por cada guardado. Ver `stockKitYRecarga.test.mjs`.
  assert.match(TABLA, /onPrimeraCarga\?\.\(\{/, "se perdió el aviso al resumen");
  assert.match(TABLA, /ok: !error/, "el aviso no contempla el listado fallido");
});

test("MOV10. UN ERROR DEL RESUMEN NO SE DISFRAZA DE CATÁLOGO SANO", () => {
  // Cuatro ceros AFIRMAN que no hay nada para revisar. Si el conteo falló, no se
  // sabe nada — y decirlo es lo correcto.
  assert.match(RESUMEN_HOOK, /setEstados\(\[\]\)/);
  assert.match(RESUMEN_HOOK, /setError\(/);
  assert.match(PANTALLA, /errorResumen/, "la pantalla se traga el error del resumen");
});

test("MOV11. LA TABLA DE ESCRITORIO NO SE REDISEÑÓ", () => {
  // El encargo es móvil. Lo de escritorio sigue siendo la misma tabla, con sus
  // columnas y su selector: lo único que cambió es que ahora está detrás de un
  // `hidden md:block` y que el paginador es el del kit.
  assert.match(TABLA, /<table/, "desapareció la tabla de escritorio");
  assert.match(TABLA, /ColumnPicker/, "desapareció el selector de columnas");
  assert.match(TABLA, /isVisible\("producto"\)/, "cambiaron las columnas de la tabla");
});

test("MOV12. LA CARD RECIBE LA UBICACIÓN Y COMPARTE LA ESCALA CON ESCRITORIO", () => {
  // Sin `localEsDeposito`, la tarjeta no puede saber que 45 unidades físicas de
  // un Pack x10 se leen como 4 bultos + 5 uds. Ese fue el defecto observado en
  // producción inmediatamente después de desplegar la vista móvil.
  assert.match(
    TABLA,
    /localEsDeposito=\{localEsDeposito\}/,
    "TablaStock no le informa a la card si la ubicación es depósito"
  );
  assert.match(TARJETA, /presentacionCantidadStock\(item, localEsDeposito\)/);
  assert.match(TARJETA, /getUnidadDeposito/);
  assert.match(TARJETA, /formatLimiteStock/);
  assert.doesNotMatch(
    TARJETA,
    /formatCantidad\(stock/,
    "la card volvió al formateador genérico que muestra unidades crudas"
  );
});
