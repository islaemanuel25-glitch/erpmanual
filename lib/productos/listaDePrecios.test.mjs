// LA LISTA DE PRECIOS DEL CATÁLOGO EN PDF.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/productos/listaDePrecios.test.mjs
//
// Las filas de prueba NO se escriben con la forma de la tarjeta: se arman con
// `mergeBaseLocalToUi` sobre fichas con la forma de `ProductoBase` y
// `ProductoLocal`, que es exactamente lo que hace la consulta. Un fixture con la
// forma de la salida, escrito a mano, es el defecto que CLAUDE.md cuenta tres
// veces: un candado verde sobre un dato que el sistema nunca produce.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PDFDocument, PageSizes } from "pdf-lib";

import { mergeBaseLocalToUi } from "@/lib/mappers/producto";
import { escalaDeVentaDe, ESCALA_BULTO, ESCALA_UNIDAD, ESCALA_KG, ESCALA_PIEZA, ESCALA_IMPORTE } from "@/lib/precios/escalaDeVenta";
import { carasDeTarjeta, presentacionEnPalabras } from "@/lib/productos/carasDeTarjeta";
import { precioQueCobraElPos } from "@/lib/precios/ubicacionVendeAlCosto";
import { formatearImporteDeLista } from "@/lib/moneda";
import {
  filaDeLaLista,
  gruposPorCategoria,
  lineaDeFiltros,
  SIN_CATEGORIA,
} from "./listaDePrecios.js";
import {
  armarListaDePreciosPdf,
  paginarLista,
  COLUMNAS,
  TITULO,
  textoDelPie,
  textoDePagina,
} from "@/lib/pdf/listaDePreciosPdf";
import { COLORES_DEL_PAPEL, letraDelPapel, PUNTOS_POR_PIXEL } from "@/lib/pdf/temaDelPapel";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (rel) =>
  fs.readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── FICHAS CON LA FORMA DE LA BASE ──────────────────────────────────────────

/** Una `ProductoBase` como la trae Prisma: snake_case y los Decimal como texto. */
const ficha = (x = {}) => ({
  id: 1,
  grupoId: 1,
  creadoEnLocalId: null,
  nombre: "Producto",
  descripcion: null,
  sku: null,
  codigo_barra: "7790000000001",
  codigo_barra_secundario: null,
  categoria_id: 8,
  proveedor_id: 3,
  unidad_medida: "unidad",
  factor_pack: 1,
  modo_envio: null,
  precio_costo: "1000.00",
  precio_venta: "1500.00",
  margen: "50.00",
  redondeo_100: false,
  activo: true,
  es_combo: false,
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  ...x,
});

/** La `ProductoLocal` de la ubicación, entera, como la trae `take: 1` sin `select`. */
const enLaUbicacion = (x = {}) => ({
  id: 50,
  localId: 9,
  nombre: null,
  descripcion: null,
  precio_costo: null,
  precio_venta: null,
  margen: null,
  activo: true,
  reglaPrecio: "MARGEN_PORCENTUAL",
  recargoFijoUnidad: null,
  codigo_barra_propio: null,
  recargoServicioPct: null,
  ...x,
});

/** Lo que la consulta le pasa a `filaDeLaLista`. */
const filaDeLaConsulta = (base, local = null, categoriaNombre = "Almacen") => ({
  ...mergeBaseLocalToUi(base, local),
  categoriaNombre,
});

const UN_LOCAL = { esDeposito: false, vendeConListaAlCosto: false, listaAlCostoRedondea100: false };
const DEPOSITO_AL_COSTO = { esDeposito: true, vendeConListaAlCosto: true, listaAlCostoRedondea100: false };

// ── LA PRESENTACIÓN, EN PALABRAS ────────────────────────────────────────────

test("presentación: 'Pieza 3 kg', 'kg', 'Pack de 24', 'Unidad', como pidió Emanuel", () => {
  assert.equal(presentacionEnPalabras({ escala: ESCALA_PIEZA, pesoReferenciaKg: 3 }), "Pieza 3 kg");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_PIEZA, pesoReferenciaKg: 2.5 }), "Pieza 2,5 kg");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_PIEZA, pesoReferenciaKg: null }), "Pieza");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_KG }), "kg");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_BULTO, factor: 24, unidad: "pack" }), "Pack de 24");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_BULTO, factor: 12, unidad: "cajon" }), "Cajón de 12");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_BULTO, factor: 1, unidad: "pack" }), "Bulto");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_UNIDAD, factor: 24, unidad: "pack" }), "Unidad");
  assert.equal(presentacionEnPalabras({ escala: ESCALA_IMPORTE }), "Importe variable");
});

// ── LOS NÚMEROS SON LOS DE LA TARJETA ───────────────────────────────────────

/** La cadena de la tarjeta, como la llama `app/modulos/productos/page.jsx`. */
function comoLaTarjeta(p, ubic) {
  const escala = escalaDeVentaDe(p, ubic.esDeposito);
  const { precio, redondeo100 } = precioQueCobraElPos(p, ubic);
  return carasDeTarjeta({
    escala, precio, costo: p.precioCosto, redondeo100,
    factor: p.factorPack, unidad: p.unidadMedida, pesoReferenciaKg: p.pesoReferenciaKg, esCombo: p.esCombo,
  }).frente;
}

test("cada renglón dice el mismo costo y la misma venta que el FRENTE de la tarjeta", () => {
  const casos = [
    // Un pack de 24 en un local, con el precio de la ubicación pisando el de la ficha.
    [ficha({ unidad_medida: "pack", factor_pack: 24, precio_costo: "24500.00", precio_venta: "31900.00" }),
      enLaUbicacion({ precio_venta: "33600.00" }), UN_LOCAL],
    // El mismo pack en el depósito, que vende con lista al costo y por bulto.
    [ficha({ unidad_medida: "pack", factor_pack: 24, modo_envio: "SOLO_BULTO", precio_costo: "24500.00", precio_venta: "31900.00" }),
      enLaUbicacion(), DEPOSITO_AL_COSTO],
    // Un fiambre de pieza fija en el depósito: se vende por pieza.
    [ficha({ unidad_medida: "kg", factor_pack: null, precio_costo: "3800.00", precio_venta: "5000.00",
      pesoEsFijo: true, pesoReferenciaKg: "2.500", modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" }),
      enLaUbicacion(), DEPOSITO_AL_COSTO],
    // Un kilo en un local.
    [ficha({ unidad_medida: "kg", factor_pack: null, precio_costo: "7800.00", precio_venta: "11000.00" }), null, UN_LOCAL],
  ];
  for (const [base, local, ubic] of casos) {
    const p = filaDeLaConsulta(base, local);
    const frente = comoLaTarjeta(p, ubic);
    const fila = filaDeLaLista(p, ubic);
    assert.equal(fila.venta, frente.importe, `venta de ${base.unidad_medida}`);
    assert.equal(fila.costo, frente.costo, `costo de ${base.unidad_medida}`);
    assert.ok(Number.isFinite(fila.venta) && fila.venta > 0, "la venta salió vacía: el caso no ejerce nada");
  }
});

test("los números son de la UBICACIÓN, no de la ficha", () => {
  const base = ficha({ precio_costo: "1000.00", precio_venta: "1500.00" });
  const fila = filaDeLaLista(filaDeLaConsulta(base, enLaUbicacion({ precio_costo: "1100.00", precio_venta: "1800.00" })), UN_LOCAL);
  assert.equal(fila.costo, 1100);
  assert.equal(fila.venta, 1800);
});

test("en el depósito que vende al costo, la venta es el costo: lo que cobra su POS", () => {
  const p = filaDeLaConsulta(ficha({ precio_costo: "1000.00", precio_venta: "1500.00" }), enLaUbicacion());
  const fila = filaDeLaLista(p, DEPOSITO_AL_COSTO);
  assert.equal(fila.venta, 1000);
  assert.equal(filaDeLaLista(p, UN_LOCAL).venta, 1500);
});

test("la presentación del renglón sale de la MISMA escala que su precio", () => {
  const pack = ficha({ unidad_medida: "pack", factor_pack: 24, modo_envio: "SOLO_BULTO" });
  assert.equal(filaDeLaLista(filaDeLaConsulta(pack), DEPOSITO_AL_COSTO).presentacion, "Pack de 24");
  const pieza = ficha({ unidad_medida: "kg", factor_pack: null, pesoEsFijo: true, pesoReferenciaKg: "3.000",
    modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD" });
  assert.equal(filaDeLaLista(filaDeLaConsulta(pieza), DEPOSITO_AL_COSTO).presentacion, "Pieza 3 kg");
  // El mismo fiambre en un local se vende por kilo.
  assert.equal(filaDeLaLista(filaDeLaConsulta(pieza), UN_LOCAL).presentacion, "kg");
});

test("el código es el de la tarjeta: el de barras, y si no hay, el SKU", () => {
  assert.equal(filaDeLaLista(filaDeLaConsulta(ficha()), UN_LOCAL).codigo, "7790000000001");
  assert.equal(filaDeLaLista(filaDeLaConsulta(ficha({ codigo_barra: null, sku: "SKU-9" })), UN_LOCAL).codigo, "SKU-9");
});

// ── EL ORDEN ────────────────────────────────────────────────────────────────

test("grupos por categoría, por nombre; adentro, por nombre; 'Sin categoría' al final", () => {
  const filas = [
    { nombre: "Yerba", categoria: "Almacen" },
    { nombre: "Queso", categoria: "frio" },
    { nombre: "Suelto", categoria: null },
    { nombre: "arroz", categoria: "Almacen" },
    { nombre: "Alfajor", categoria: "Alfajores" },
  ];
  const grupos = gruposPorCategoria(filas);
  assert.deepEqual(grupos.map((g) => g.categoria), ["Alfajores", "Almacen", "frio", SIN_CATEGORIA]);
  assert.deepEqual(grupos[1].filas.map((f) => f.nombre), ["arroz", "Yerba"], "sin distinguir mayúsculas");
});

test("la línea de filtros dice 'Categoría', y 'Todos' / 'Todas' en lo que no se eligió", () => {
  // Era "Tipo" hasta el 2026-10-31: Emanuel pidió llamarlo por lo que es.
  assert.equal(lineaDeFiltros({}), "Proveedor: Todos  ·  Categoría: Todas");
  assert.equal(lineaDeFiltros({ proveedor: "Paladini", categoria: "frio" }), "Proveedor: Paladini  ·  Categoría: frio");
});

test("el importe va como '$ 12.300', y los centavos que existen se muestran", () => {
  assert.equal(formatearImporteDeLista(12300), "$ 12.300");
  assert.equal(formatearImporteDeLista(205.71), "$ 205,71");
  assert.equal(formatearImporteDeLista(null), "—");
});

// ── EL REPARTO EN PÁGINAS ───────────────────────────────────────────────────

const fila = (n) => ({ codigo: String(n), nombre: `P${n}`, presentacion: "Unidad", costo: 1, venta: 2 });

test("páginas: encabezado solo en la primera, cada fila una vez y en orden, y el grupo se repite al seguir", () => {
  // Alturas grandes para que corte enseguida. Útil por página: A4 − 2 márgenes.
  const alto = { fila: 100, categoria: 100, encabezado: 300, pie: 0, cabecera: 0 };
  const grupos = [
    { categoria: "Almacen", filas: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(fila) },
    { categoria: "frio", filas: [10, 11].map(fila) },
  ];
  const paginas = paginarLista(grupos, alto);

  assert.ok(paginas.length > 1, "el caso tiene que pasar de página o no prueba nada");
  assert.deepEqual(paginas.map((p) => p.encabezado), paginas.map((_, i) => i === 0));

  const filasEnOrden = paginas.flatMap((p) => p.renglones.filter((r) => r.tipo === "fila").map((r) => r.fila.codigo));
  assert.deepEqual(filasEnOrden, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);

  for (const [i, p] of paginas.entries()) {
    // Ninguna página empieza con una fila suelta: arriba siempre está su categoría.
    assert.equal(p.renglones[0].tipo, "categoria", `la página ${i + 1} arranca sin categoría`);
    // Y ninguna termina con una categoría sola.
    assert.equal(p.renglones.at(-1).tipo, "fila", `la página ${i + 1} termina con una categoría huérfana`);
  }
  assert.equal(paginas[0].renglones[0].texto, "ALMACEN", "la categoría va en mayúsculas");
});

// ── EL PDF ──────────────────────────────────────────────────────────────────

/**
 * El contenido de las páginas, descomprimido. `pdf-lib` guarda cada página con
 * FlateDecode, así que el texto no está a la vista en los bytes: buscar sin
 * descomprimir daría "falta" sobre un PDF que lo tiene.
 */
function contenido(bytes) {
  const crudo = Buffer.from(bytes);
  const partes = [];
  let desde = 0;
  for (;;) {
    const i = crudo.indexOf("stream", desde, "latin1");
    if (i === -1) break;
    const inicio = crudo[i + 6] === 0x0d ? i + 8 : i + 7;
    const fin = crudo.indexOf("endstream", inicio, "latin1");
    try {
      partes.push(zlib.inflateSync(crudo.subarray(inicio, fin)).toString("latin1"));
    } catch {
      // No era un flujo comprimido: no lleva texto de página.
    }
    desde = fin + 9;
  }
  return partes.join("\n");
}

/** El texto como lo escribe pdf-lib con Helvetica: en hexadecimal, entre `<` y `>`. */
const enHex = (texto) => `<${Buffer.from(texto, "latin1").toString("hex").toUpperCase()}>`;
const escribe = (bytes, texto) => contenido(bytes).includes(enHex(texto));

function datosDePrueba(cantidad) {
  const filas = Array.from({ length: cantidad }, (_, i) =>
    filaDeLaLista(
      filaDeLaConsulta(
        ficha({ id: i + 1, nombre: `Producto número ${i + 1}`, codigo_barra: String(7790000000000 + i),
          unidad_medida: i % 2 ? "pack" : "unidad", factor_pack: i % 2 ? 24 : 1,
          // Los packs salen por bulto, así la lista tiene renglones "Pack de 24".
          // Es el DEPÓSITO a propósito: en un local un pack se vende siempre por
          // unidad y ese renglón no existe.
          modo_envio: i % 2 ? "SOLO_BULTO" : null }),
        enLaUbicacion(),
        i % 3 ? "Almacen" : "frio"
      ),
      DEPOSITO_AL_COSTO
    )
  );
  return { ubicacion: "Depósito: depo", proveedor: null, categoria: "frio", grupos: gruposPorCategoria(filas), total: filas.length };
}

test("el PDF: A4 vertical, tantas páginas como el reparto, y escribe lo del diseño", async () => {
  const datos = datosDePrueba(150);
  const bytes = await armarListaDePreciosPdf(datos, { fecha: new Date("2026-10-31T15:00:00Z") });
  const doc = await PDFDocument.load(bytes);

  const paginas = paginarLista(datos.grupos);
  assert.ok(paginas.length > 1, "150 productos tienen que pasar de página");
  assert.equal(doc.getPageCount(), paginas.length);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    assert.deepEqual([width, height], PageSizes.A4, "la hoja no es A4 vertical");
  }

  assert.ok(escribe(bytes, TITULO), "falta el título");
  assert.ok(escribe(bytes, "31/10/2026"), "falta la fecha");
  assert.ok(escribe(bytes, "Depósito: depo"), "falta la ubicación");
  assert.ok(escribe(bytes, "Proveedor: Todos  ·  Categoría: frio"), "falta la línea de filtros");
  assert.ok(escribe(bytes, "ALMACEN") && escribe(bytes, "FRIO"), "faltan las categorías en mayúsculas");
  assert.ok(escribe(bytes, textoDelPie(150)), "falta el pie con la cantidad");
  assert.ok(escribe(bytes, textoDePagina(paginas.length, paginas.length)), "falta 'Página Y de Y'");
  assert.ok(escribe(bytes, "Pack de 24"), "falta la presentación en palabras");

  // La cabecera de columnas, una vez por página: se cuenta "Presentación".
  assert.equal(contenido(bytes).split(enHex(COLUMNAS[2])).length - 1, paginas.length, "la cabecera no se repite en cada página");
});

test("un nombre con letras que Helvetica no tiene no tira el PDF abajo", async () => {
  const datos = datosDePrueba(1);
  datos.grupos[0].filas[0].nombre = "Té ☃ Ω Ğ";
  const bytes = await armarListaDePreciosPdf(datos);
  assert.ok(bytes.length > 0);
  assert.ok(escribe(bytes, "Té ? ? G"), "las letras sin glifo tenían que salir sin acento o como '?'");
});

// ── EL TEMA ─────────────────────────────────────────────────────────────────

test("los colores del papel son los de `sunmiLight` en app/globals.css", () => {
  const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
  const inicio = css.indexOf('html[data-theme="sunmiLight"] {');
  assert.notEqual(inicio, -1, "no encontré el bloque de sunmiLight");
  const bloque = css.slice(inicio, css.indexOf("\n}", inicio));
  for (const [variable, valor] of Object.entries(COLORES_DEL_PAPEL)) {
    const m = new RegExp(`${variable}:\\s*([^;]+);`).exec(bloque);
    assert.ok(m, `${variable} no está en sunmiLight`);
    assert.equal(m[1].trim().toLowerCase(), valor.toLowerCase(), `${variable} cambió en el tema y el papel quedó atrás`);
  }
});

test("las letras salen de la escala del proyecto, en puntos", () => {
  assert.equal(letraDelPapel("sm2"), 11 * PUNTOS_POR_PIXEL);
  assert.equal(letraDelPapel("xl2"), 22 * PUNTOS_POR_PIXEL);
  assert.throws(() => letraDelPapel("inventado"), /no está en la escala/);
});

// ── EL CABLEADO ─────────────────────────────────────────────────────────────

test("la ruta: costos.ver, la ubicación por resolveScope y el PDF por la misma exportación", () => {
  const src = leer("app/api/productos/export/route.js");
  const iPerm = src.indexOf('checkPerm(session, "costos.ver")');
  const iScope = src.indexOf("resolveScope(req, { explicitLocalId:");
  const iPdf = src.indexOf("if (esPdf) {");
  assert.ok(iPerm > 0 && iScope > iPerm && iPdf > iScope, "el permiso y la ubicación tienen que ir antes que el PDF");
  assert.match(src, /const esPdf = body\.formato === "pdf";/);
  assert.match(src, /datosDeLaListaDePrecios\(prisma, \{ grupoId, localId, proveedorId, categoriaId \}\)/);
  assert.match(src, /armarListaDePreciosPdf\(datos\)/);
  // El `localId` del cuerpo se lee una sola vez: tomarlo directo era poder
  // bajar los costos de otro local.
  assert.equal((src.match(/body\.localId/g) ?? []).length, 1, "el localId del cuerpo se usa en más de un lugar");
});

test("la lista se baja SOLO de la ubicación actual, administrador incluido", () => {
  // Decidido por Emanuel el 2026-10-31. Dos mitades: el PDF no deja que
  // `resolveScope` tome la ubicación del pedido —sin explícito, un administrador
  // cae en su contexto activo y cualquier otro en su local—, y si el pedido trae
  // otra se rechaza en vez de usarse.
  const src = leer("app/api/productos/export/route.js");
  assert.match(
    src,
    /resolveScope\(req, \{ explicitLocalId: esPdf \? null : localIdPedido \}\)/,
    "el PDF volvió a dejar elegir la ubicación por el pedido"
  );
  assert.match(
    src,
    /if \(esPdf && localIdPedido && localIdPedido !== localId\) \{\s*return NextResponse\.json\([\s\S]*?\{ status: 403 \}/,
    "una ubicación distinta de la actual tiene que rechazarse"
  );
  // Y el panel ya no ofrece elegir: muestra la del encabezado, fija.
  const panel = leer("components/productos/PanelListaDePrecios.jsx");
  assert.doesNotMatch(panel, /SunmiSelectAdv|locales\/opciones|setUbicacionId/, "volvió el selector de ubicación");
  assert.match(panel, /nombreDeUbicacion\(ubicacion\)/);
  assert.match(panel, /localId,\s*\n\s*proveedorId:/, "el panel tiene que mandar la ubicación que muestra");
  assert.match(leer("app/modulos/productos/page.jsx"), /<PanelListaDePrecios[\s\S]*?ubicacion=\{contexto\}/);
});

test("proveedor y categoría llevan el buscador de SunmiSelectAdv en el panel, y la solapa no cambia", () => {
  const campos = leer("components/productos/CamposDeExportacion.jsx");
  assert.equal((campos.match(/searchable=\{buscable\}/g) ?? []).length, 2, "los dos desplegables tienen que poder buscar");
  assert.match(campos, /buscable = false/, "por defecto sin buscador: la solapa del Excel queda como estaba");
  assert.match(leer("components/productos/PanelListaDePrecios.jsx"), /<CamposDeExportacion[\s\S]*?buscable\s*\/>/);
  assert.match(campos, />Categoría<\/label>/, "el rótulo es Categoría, no Tipo");
  assert.doesNotMatch(campos, /Tipo|rotuloCategoria/);
});

test("la consulta: el universo del catálogo, la ficha entera de la ubicación y los números de la tarjeta", () => {
  const src = leer("lib/productos/listaDePreciosServer.js");
  assert.match(src, /locales: \{ where: \{ localId \}, take: 1 \}/, "la ficha de la ubicación tiene que venir entera");
  assert.match(src, /mergeBaseLocalToUi\(p, p\.locales\?\.\[0\] \?\? null\)/);
  assert.match(src, /filaDeLaLista\(/);
  assert.match(src, /ubicacionVendeAlCosto\(\{ prisma, grupoId, localId \}\)/);
  assert.match(src, /proveedor_id: proveedorId/, "el proveedor es el del filtro del catálogo");
  assert.match(src, /categoria_id: categoriaId/, "el otro filtro es la categoría");
});

test("la pantalla: el botón y la opción solo con costos.ver, y el panel pide el PDF y dice los errores", () => {
  const pagina = leer("app/modulos/productos/page.jsx");
  assert.match(pagina, /\{puedeExportar && \(\s*<SunmiButton color="cyan" onClick=\{\(\) => setPanelListaDePrecios\(true\)\}>/);
  assert.match(pagina, /\{puedeExportar && \(\s*<PanelListaDePrecios/);
  assert.match(pagina, /onListaDePrecios=\{\(\) => setPanelListaDePrecios\(true\)\}/);

  const hoja = leer("components/productos/HojaMasAcciones.jsx");
  assert.match(hoja, /\{puedeExportar && \(\s*<Opcion\s+icono=\{FileText\}[\s\S]*?onClick=\{elegir\(onListaDePrecios\)\}/);

  const panel = leer("components/productos/PanelListaDePrecios.jsx");
  assert.match(panel, /formato: "pdf"/);
  assert.match(panel, /if \(!res\.ok\) \{[\s\S]*?setError\(/, "un error del servidor se tiene que decir en el panel");
  assert.match(panel, /descargar\(blob,/);
  assert.match(panel, /<CamposDeExportacion/, "el proveedor y la categoría son los mismos campos que la solapa");
  assert.match(pagina, /<CamposDeExportacion/, "la solapa dejó de usar la pieza compartida");
});
