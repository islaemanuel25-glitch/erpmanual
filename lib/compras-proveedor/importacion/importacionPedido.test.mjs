import test from "node:test";
import assert from "node:assert/strict";

import { proponerCantidadPedido } from "./cantidad.js";
import { extraerFilasExcel } from "./excelFilas.js";
import fs from "node:fs";
import path from "node:path";

import {
  sumarCantidadesImportadas,
  costoParaUnidad,
  baseDeProducto,
  datosDetalleNuevo,
} from "./merge.js";
import { prepararLineasImportadas, recalcularPrecioDeLinea } from "./prepararLineas.js";
import { aliasesDeImportacion } from "./aliases.js";
import { consolidarLineasImportadas } from "./payload.js";
import { ORIGEN_PRECIO, precioElegido, preciosComparables } from "./precios.js";
import { naturalezaLinea, permiteToggleUnidad } from "../calculoPedido.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
// Los candados que miran código sacan los comentarios ANTES de mirar: si no, un
// patrón nombrado en una explicación cuenta como si estuviera en el código, y el
// candado pasa a afirmar nada.
const leerSinComentarios = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const pack = { factor_pack: 21, modoCompra: "BULTO", unidad_medida: "unidad" };
// Fiambre: se compra por pieza y su costo está por kilo. `factor_pack` existe y
// NO entra en el dinero — es la diferencia con el pack.
const fiambre = { factor_pack: 6, modoCompra: "UNIDAD", unidad_medida: "kg", pesoReferenciaKg: 2.5 };
const porKilo = { factor_pack: 1, modoCompra: "BULTO", unidad_medida: "kg" };

test("convierte unidades a bultos solamente cuando la equivalencia es exacta", () => {
  assert.deepEqual(proponerCantidadPedido({ cantidad: 42, unidadFuente: "UN", producto: pack }), {
    cantidad: 2,
    unidad: "BULTO",
    requiereRevision: false,
    motivo: null,
    equivalencia: "42 un = 2 bultos de 21",
  });
});

test("una equivalencia no exacta se conserva en unidades y exige revisión", () => {
  const resultado = proponerCantidadPedido({ cantidad: 40, unidadFuente: "UN", producto: pack });
  assert.equal(resultado.cantidad, 40);
  assert.equal(resultado.unidad, "UNIDAD");
  assert.equal(resultado.requiereRevision, true);
  assert.match(resultado.motivo, /no equivalen/i);
});

test("DI y una unidad ausente nunca se interpretan automáticamente", () => {
  assert.equal(proponerCantidadPedido({ cantidad: 21, unidadFuente: "DI", producto: pack }).requiereRevision, true);
  assert.equal(proponerCantidadPedido({ cantidad: 21, unidadFuente: null, producto: pack }).requiereRevision, true);
});

test("el Excel genérico encuentra encabezados y conserva código, cantidad y unidad", () => {
  const resultado = extraerFilasExcel([
    ["Pedido de prueba"],
    ["ARTÍCULO", "CANTIDAD", "DESCRIPCIÓN", "PRECIO UNIT."],
    [6596, "42 UN", "ALF. COFLER BLOCK X60G", 909.037],
    ["", "", "TOTAL", 1234],
  ]);
  assert.equal(resultado.ok, true);
  // ── LA FORMA DE LA LÍNEA CAMBIÓ A PROPÓSITO ─────────────────────────────
  //
  // Se agregaron `bonificacionPct` y `subtotal` porque el precio del papel dejó
  // de ser la columna PRECIO. Este `deepEqual` se reescribe en vez de aflojarse:
  // sigue afirmando la forma COMPLETA, así que un campo nuevo que aparezca sin
  // que nadie lo decida vuelve a ponerlo en rojo.
  //
  // Esta hoja NO tiene columnas de bonificación ni de subtotal, y eso es parte
  // de lo que se afirma: los dos campos vienen en null y los dos booleanos lo
  // dicen. Es el caso "se conserva el comportamiento anterior".
  assert.deepEqual(resultado.documento.lineas, [
    {
      filaOrigen: 3,
      codigo: "6596",
      descripcion: "ALF. COFLER BLOCK X60G",
      cantidad: 42,
      unidad: "UN",
      precioUnitario: 909.037,
      bonificacionPct: null,
      subtotal: null,
    },
  ]);
  assert.equal(resultado.documento.hayColumnaSubtotal, false);
  assert.equal(resultado.documento.hayColumnaBonificacion, false);
  // El renglón de TOTAL sigue sin entrar como producto, pero ahora su importe se
  // guarda: es el número contra el que se verifica la suma de los subtotales.
  assert.equal(resultado.documento.hayTotalImpreso, true);
  assert.equal(resultado.documento.totalDocumento, 1234);
});

test("un nombre parecido solo sugiere; el código o alias exacto sí vincula", () => {
  const productos = [
    {
      productoLocalId: 7,
      baseId: 70,
      nombre: "Alfajor Cofler Block 60g",
      codigoInterno: "006596",
      codigosInternos: ["006596"],
      aliasesProveedor: [{ codigoInterno: "006596", descripcionProveedor: "ALF COFLER BLOCK" }],
      factor_pack: 21,
      modoCompra: "BULTO",
      unidad_medida: "unidad",
    },
  ];
  const [exacta, parecida] = prepararLineasImportadas({
    productos,
    lineas: [
      { codigo: "006596", descripcion: "texto distinto", cantidad: 42, unidad: "UN" },
      { codigo: null, descripcion: "Alfajor Cofler Block 60 gramos", cantidad: 42, unidad: "UN" },
    ],
  });
  assert.equal(exacta.productoLocalId, "7");
  assert.equal(exacta.confirmada, true);
  assert.equal(exacta.cantidadPedido, 2);
  assert.equal(parecida.productoLocalId, "");
  assert.equal(parecida.confirmada, false);
  assert.deepEqual(parecida.candidatos, [7]);
});

test("el importador baja por la terminación 7, 6, 5 y 4 y solo acepta un producto único", () => {
  const producto = (id, codigo) => ({
    productoLocalId: id,
    baseId: id * 10,
    nombre: `Producto ${id}`,
    codigoInterno: codigo,
    codigosInternos: [codigo],
    aliasesProveedor: [{ codigoInterno: codigo, descripcionProveedor: null }],
    factor_pack: 1,
    modoCompra: "BULTO",
    unidad_medida: "unidad",
    precio_costo: 100,
  });
  const linea = (codigo) => ({ codigo, descripcion: "Descripción distinta", cantidad: 1, unidad: "BULTO" });

  for (const [codigoPapel, codigoErp, digitos] of [
    ["991234567", "001234567", 7],
    ["99123456", "00123456", 6],
    ["9912345", "0012345", 5],
    ["991234", "001234", 4],
  ]) {
    const [r] = prepararLineasImportadas({ lineas: [linea(codigoPapel)], productos: [producto(7, codigoErp)] });
    assert.equal(r.productoLocalId, "7", `no vinculó por los últimos ${digitos}`);
    assert.equal(r.origenVinculo, "CODIGO_APROXIMADO");
  }

  const [ambigua] = prepararLineasImportadas({
    lineas: [linea("991234")],
    productos: [producto(7, "001234"), producto(8, "771234")],
  });
  assert.equal(ambigua.productoLocalId, "", "un sufijo compartido eligió un producto al azar");
  assert.equal(ambigua.confirmada, false);
});

test("precio del sistema y del papel se comparan en la misma escala", () => {
  const producto = { factor_pack: 21, modoCompra: "BULTO", unidad_medida: "unidad", precio_costo: 2100 };
  const porUnidad = preciosComparables({
    precioPapel: 120,
    facturaPor: "UNIDAD",
    unidadPedido: "UNIDAD",
    producto,
  });
  assert.equal(porUnidad.precioSistema, 100);
  assert.equal(porUnidad.precioPapel, 120);
  assert.equal(porUnidad.diferencia, 20);
  assert.equal(porUnidad.diferenciaPct, 20);
  assert.equal(precioElegido({ precios: porUnidad, origen: ORIGEN_PRECIO.PAPEL }), 120);

  const porBulto = preciosComparables({
    precioPapel: 120,
    facturaPor: "UNIDAD",
    unidadPedido: "BULTO",
    producto,
  });
  assert.equal(porBulto.precioSistema, 2100);
  assert.equal(porBulto.precioPapel, 2520, "el papel unitario no se comparó contra el bulto");
});

test("cada elección manual deja un alias permanente, incluso sin código", () => {
  const productosPorLocal = new Map([[7, { baseId: 70 }]]);
  const aliases = aliasesDeImportacion({
    grupoId: 3,
    proveedorId: 9,
    productosPorLocal,
    items: [{
      productoLocalId: 7,
      aliases: [
        { codigoProveedor: "001-234", descripcionProveedor: "CHESTERFIELD 10 CONV" },
        { codigoProveedor: null, descripcionProveedor: "PHILIPS MORRIS 20 BOX" },
      ],
    }],
  });
  assert.equal(aliases.length, 2);
  assert.equal(aliases[0].codigoInterno, "001234");
  assert.match(aliases[1].codigoInterno, /^TXT:/);
  assert.ok(aliases.every((a) => a.productoBaseId === 70 && a.origenAlta === "VINCULACION_MANUAL"));
});

test("dos renglones del mismo producto conservan subtotal, precio elegido y ambos alias", () => {
  const producto = {
    productoLocalId: 7,
    factor_pack: 10,
    modoCompra: "BULTO",
    unidad_medida: "unidad",
  };
  const items = consolidarLineasImportadas({
    productosPorId: new Map([["7", producto]]),
    lineas: [
      {
        productoLocalId: "7",
        cantidadPedido: 2,
        unidadPedido: "BULTO",
        precioSistema: 1000,
        precioPapel: 1200,
        origenPrecio: ORIGEN_PRECIO.PAPEL,
        codigo: "001",
        descripcion: "PRODUCTO CAJA",
      },
      {
        productoLocalId: "7",
        cantidadPedido: 5,
        unidadPedido: "UNIDAD",
        precioSistema: 100,
        precioPapel: 130,
        origenPrecio: ORIGEN_PRECIO.PAPEL,
        codigo: null,
        descripcion: "PRODUCTO SUELTO",
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].cantidad, 25);
  assert.equal(items[0].unidad, "UNIDAD");
  assert.equal(items[0].precioCosto, 122);
  assert.equal(items[0].cantidad * items[0].precioCosto, 3050);
  assert.equal(items[0].origenPrecio, ORIGEN_PRECIO.PAPEL);
  assert.equal(items[0].aliases.length, 2);
});

// ── EL CONTRATO DE `sumarCantidadesImportadas` CAMBIÓ A PROPÓSITO ──────────
//
// Antes devolvía solo { cantidad, unidad } y este candado lo afirmaba con un
// deepEqual. Devolver la cantidad sin el costo es lo que dejó pasar el defecto:
// la ruta escribía las dos primeras y el costo se quedaba en la escala vieja.
// Ahora las tres viajan juntas y el candado las mira juntas.
test("al continuar un borrador combina bultos y unidades sin perder cantidad NI escala de costo", () => {
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
      importada: { cantidad: 5, unidad: "UNIDAD" },
      factorPack: 21,
      producto: pack,
      costoMaestro: 2100,
    }),
    { cantidad: 47, unidad: "UNIDAD", unidadCambio: true, precioCosto: 100 }
  );
  assert.deepEqual(
    sumarCantidadesImportadas({
      actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
      importada: { cantidad: 42, unidad: "UNIDAD" },
      factorPack: 21,
      producto: pack,
      costoMaestro: 2100,
    }),
    { cantidad: 4, unidad: "BULTO", unidadCambio: false, precioCosto: 2100 }
  );
});

test("ECONOMÍA 1. 40 UN de un PACK de 21 valen 4.000, no 84.000", () => {
  // El caso que abrió la revisión: 40 no es múltiplo de 21, así que la línea se
  // queda en UNIDAD, y ahí el costo del bulto NO es el costo de la línea.
  const propuesta = proponerCantidadPedido({ cantidad: 40, unidadFuente: "UN", producto: pack });
  assert.equal(propuesta.cantidad, 40);
  assert.equal(propuesta.unidad, "UNIDAD");

  const costo = costoParaUnidad({ costoMaestro: 2100, unidad: propuesta.unidad, producto: pack });
  assert.equal(costo, 100, "el costo unitario de un bulto de 21 a 2.100 es 100");
  assert.equal(propuesta.cantidad * costo, 4000, "40 unidades a 100 son 4.000");
});

test("ECONOMÍA 2. 42 UN exactas son 2 BULTO a 2.100 y valen 4.200", () => {
  const propuesta = proponerCantidadPedido({ cantidad: 42, unidadFuente: "UN", producto: pack });
  assert.equal(propuesta.cantidad, 2);
  assert.equal(propuesta.unidad, "BULTO");

  const costo = costoParaUnidad({ costoMaestro: 2100, unidad: propuesta.unidad, producto: pack });
  assert.equal(costo, 2100, "en BULTO el costo maestro no se toca");
  assert.equal(propuesta.cantidad * costo, 4200);
});

test("ECONOMÍA 3. 2 BULTO existentes + 5 UN importadas son 47 UNIDAD a 100 y valen 4.700", () => {
  const suma = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2100 },
    importada: { cantidad: 5, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(suma.cantidad, 47);
  assert.equal(suma.unidad, "UNIDAD");
  assert.equal(suma.precioCosto, 100);
  assert.equal(suma.cantidad * suma.precioCosto, 4700, "47 unidades a 100 son 4.700");

  // Y lo que este candado impide, dicho como número: con el costo del bulto la
  // misma línea valdría veintiún veces más.
  assert.equal(suma.cantidad * 2100, 98700);
});

test("CONTRAPRUEBA. dejar el costo del bulto como unitario tiene que dar rojo", () => {
  // Ésta es la afirmación que separa un candado que defiende de uno que
  // acompaña: se calcula el costo COMO LO HACÍA EL CÓDIGO VIEJO —el maestro sin
  // mirar la unidad— y se comprueba que la comparación contra el correcto falla.
  const costoViejo = 2100; // lo que conservaba la ruta
  const costoCorrecto = costoParaUnidad({ costoMaestro: 2100, unidad: "UNIDAD", producto: pack });
  assert.notEqual(costoViejo, costoCorrecto, "si estos dos son iguales, la conversión no está ocurriendo");
  assert.throws(
    () => assert.equal(47 * costoViejo, 4700),
    "47 × 2.100 no puede dar 4.700: si esto no lanza, el candado no está midiendo nada"
  );
});

test("el fiambre y el kg no cambian de costo con el factor", () => {
  // `factor_pack` no entra en el dinero de estos productos, y por eso el costo
  // maestro es el costo de la línea aunque quede en UNIDAD.
  assert.equal(costoParaUnidad({ costoMaestro: 8000, unidad: "UNIDAD", producto: fiambre }), 8000);
  assert.equal(costoParaUnidad({ costoMaestro: 5400, unidad: "UNIDAD", producto: porKilo }), 5400);
});

test("KG DE FIAMBRE. 10 KG nunca se confirman solos ni se vuelven bultos", () => {
  // ── EL DEFECTO ────────────────────────────────────────────────────────────
  //
  // Devolvía "10 BULTO, requiereRevision: false": diez bultos de un producto que
  // no se compra por bulto, y confirmado sin que nadie lo mirara. El fiambre se
  // pide por PIEZA y los kilos del papel no dicen cuántas piezas son.
  const r = proponerCantidadPedido({ cantidad: 10, unidadFuente: "KG", producto: fiambre });
  assert.equal(r.unidad, "UNIDAD", "un fiambre no se pide en bultos");
  assert.equal(r.requiereRevision, true, "nunca se confirma solo");
  assert.equal(r.cantidad, 10, "se conserva el número leído; no se inventa una equivalencia");
  assert.match(r.motivo, /kilos/i);
  assert.match(r.motivo, /pieza/i);
  // Y que NO haya inventado piezas dividiendo por el peso: 10 / 2,5 = 4 sería
  // exactamente la clase de número plausible que este candado impide.
  assert.notEqual(r.cantidad, 4);
});

// ══ LOS TRES DE LA SEGUNDA REVISIÓN ═══════════════════════════════════════

test("DETALLE NUEVO. el maestro sale de la BASE, y el cuerpo no lo puede reemplazar", () => {
  // ── EL DEFECTO ────────────────────────────────────────────────────────────
  //
  // El modal ya manda el costo EN LA ESCALA DE LA LÍNEA: para un PACK de 21 que
  // queda en UNIDAD manda 100, no 2.100. La ruta tomaba ese 100 como si fuera el
  // maestro y lo volvía a dividir por 21: guardaba 4,761904…
  //
  // Dos conversiones sobre el mismo número. El arreglo no es "no convertir": es
  // que el maestro salga SIEMPRE de la base y se convierta exactamente una vez.
  const base = { factor_pack: 21, precio_costo: 2100, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };

  const conCostoYaConvertido = datosDetalleNuevo({
    pedidoId: 7, productoLocalId: 9004,
    item: { cantidad: 40, unidad: "UNIDAD", precioCosto: 100 },
    base,
  });
  assert.equal(conCostoYaConvertido.cantidad, 40);
  assert.equal(conCostoYaConvertido.unidad, "UNIDAD");
  assert.equal(conCostoYaConvertido.precioCosto, 100, "se volvió a dividir: 100/21 = 4,7619…");

  // Y con cualquier disparate en el cuerpo, el resultado no se mueve: la fuente
  // es la base. Si el costo se pudiera fijar desde afuera, el defecto se podría
  // reproducir a mano contra la ruta.
  for (const arbitrario of [999999, 0, -5, null, "1", 4.76]) {
    const r = datosDetalleNuevo({
      pedidoId: 7, productoLocalId: 9004,
      item: { cantidad: 40, unidad: "UNIDAD", precioCosto: arbitrario },
      base,
    });
    assert.equal(r.precioCosto, 100, `el cuerpo con precioCosto=${arbitrario} movió el resultado`);
  }

  // En BULTO el maestro va tal cual, también derivado de la base.
  const enBulto = datosDetalleNuevo({
    pedidoId: 7, productoLocalId: 9004,
    item: { cantidad: 2, unidad: "BULTO", precioCosto: 100 },
    base,
  });
  assert.equal(enBulto.precioCosto, 2100);
});

test("PRECIO ELEGIDO. el papel se acepta solo cuando la decisión viaja explícita", () => {
  const base = { factor_pack: 21, precio_costo: 2100, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
  const papel = datosDetalleNuevo({
    pedidoId: 7,
    productoLocalId: 9004,
    item: { cantidad: 40, unidad: "UNIDAD", precioCosto: 120, origenPrecio: "PAPEL" },
    base,
  });
  assert.equal(papel.precioCosto, 120);

  const sinDecision = datosDetalleNuevo({
    pedidoId: 7,
    productoLocalId: 9004,
    item: { cantidad: 40, unidad: "UNIDAD", precioCosto: 120 },
    base,
  });
  assert.equal(sinDecision.precioCosto, 100, "un número suelto del cuerpo reemplazó el costo del sistema");
});

test("PRECIO ELEGIDO. al sumar sobre un borrador el papel confirmado gana y sigue a la unidad", () => {
  const suma = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2520 },
    importada: { cantidad: 5, unidad: "UNIDAD", precioCosto: 130 },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
    usarCostoImportado: true,
  });
  assert.equal(suma.cantidad, 47);
  assert.equal(suma.unidad, "UNIDAD");
  assert.equal(suma.precioCosto, 130);
});

test("DETALLE NUEVO. la ruta usa esa pieza y no arma el costo por su cuenta", () => {
  // El candado de arriba prueba la PIEZA. Éste prueba el VÍNCULO: que la ruta la
  // consuma. Sin esto, la pieza podría estar perfecta y la ruta seguir armando
  // el costo a mano, que es exactamente el estado del que venimos.
  const ruta = leerSinComentarios("app/api/compras-proveedor/importar/aplicar/[id]/route.js");
  assert.match(ruta, /datosDetalleNuevo/, "la ruta dejó de usar el constructor del detalle nuevo");
  assert.doesNotMatch(
    ruta,
    /costoMaestro:\s*item\.precioCosto/,
    "volvió el costo del CUERPO como maestro: eso es la doble conversión"
  );
});

test("COSTO NEGOCIADO. cambiar de unidad convierte el costo de la LÍNEA, no el del catálogo", () => {
  // ── EL DEFECTO ────────────────────────────────────────────────────────────
  //
  // `actual.precioCosto` es lo que se pagó de verdad por esa línea del pedido:
  // sale del detalle guardado, no del catálogo. Al cambiar de unidad se lo
  // reemplazaba por el maestro convertido, o sea que una negociación se perdía
  // en silencio y el pedido pasaba a valer otra cosa.
  //
  // Los números son distintos a propósito para que el maestro y el negociado no
  // se puedan confundir: 2.520 negociado contra 2.100 de catálogo.
  const suma = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2520 },
    importada: { cantidad: 5, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(suma.cantidad, 47);
  assert.equal(suma.unidad, "UNIDAD");
  assert.equal(suma.precioCosto, 120, "tomó el maestro (2100/21=100) en vez del negociado (2520/21=120)");
  assert.equal(suma.cantidad * suma.precioCosto, 5640);
  // Lo que este candado impide, dicho como número: con el maestro daría 4.700.
  assert.notEqual(suma.cantidad * suma.precioCosto, 4700);
});

test("COSTO NEGOCIADO. si la unidad no cambia, el costo queda EXACTAMENTE igual", () => {
  const suma = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 2520 },
    importada: { cantidad: 42, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(suma.unidad, "BULTO");
  assert.equal(suma.precioCosto, 2520, "una suma que no cambia la unidad no puede tocar el costo");
});

test("COSTO NEGOCIADO. el maestro es SOLO el respaldo cuando la línea no tiene costo", () => {
  const sinCosto = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: null },
    importada: { cantidad: 5, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(sinCosto.precioCosto, 100, "sin costo en la línea, el maestro convertido es el respaldo");

  // Y un CERO es un costo utilizable: no puede caer al respaldo.
  const enCero = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 0 },
    importada: { cantidad: 5, unidad: "UNIDAD" },
    factorPack: 21,
    producto: pack,
    costoMaestro: 2100,
  });
  assert.equal(enCero.precioCosto, 0, "un costo cero cayó al maestro: cero es un número, no la ausencia de uno");
});

test("PANTALLA. después de aplicar recarga el borrador que devolvió el servidor", () => {
  const pagina = leerSinComentarios("components/compras-proveedor/ImportarPedidoDesdeArchivo.jsx");
  assert.match(pagina, /importar\/aplicar/, "la pantalla dejó de usar la ruta atómica para continuar un borrador");
  assert.match(
    pagina,
    /nueva\?pedidoId=\$\{idCreado\}&importado=1/,
    "la pantalla no vuelve a cargar el borrador guardado por el servidor"
  );
  assert.doesNotMatch(
    pagina,
    /setItems\(/,
    "la pantalla volvió a mezclar en memoria una versión vieja con la respuesta del servidor"
  );
});

// ── EL PRECIO EFECTIVO, DE PUNTA A PUNTA ──────────────────────────────────
//
// Los candados de `precioDelPapel.test.mjs` prueban la PIEZA. Estos prueban el
// CAMINO: que el número que calcula la pieza llegue a la pantalla convertido en
// la escala correcta y de ahí al cuerpo que se manda al servidor. Es la lección
// del módulo de comprobante: las piezas pueden estar todas bien y el defecto
// vivir en el espacio entre dos.

const CATALOGO_BONIF = [{
  productoLocalId: 9004,
  baseId: 8004,
  nombre: "Pack Sintético x12",
  codigoInterno: "SINT-012",
  codigosInternos: ["SINT-012"],
  aliasesProveedor: [{ codigoInterno: "SINT-012", descripcionProveedor: null }],
  unidad_medida: "unidad",
  factor_pack: 12,
  modoCompra: "BULTO",
  // El costo maestro está por BULTO, como todo pack en el ERP.
  precio_costo: 90000,
}];

// El renglón del caso: 12 unidades a 8.168,94 con 14 % y subtotal 87.045,75.
const RENGLON_BONIF = Object.freeze({
  codigo: "SINT-012",
  descripcion: "Pack Sintético x12",
  cantidad: 12,
  unidad: "UN",
  precioUnitario: 8168.94,
  bonificacionPct: 14,
  subtotal: 87045.75,
});

test("BONIFICACIÓN. la línea preparada trae el precio efectivo, no el de lista", () => {
  const [linea] = prepararLineasImportadas({
    lineas: [RENGLON_BONIF],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });

  assert.equal(linea.productoLocalId, "9004");
  assert.equal(linea.precioFinalPapelCrudo, 7253.81, "el precio del papel no salió del subtotal");
  assert.equal(linea.origenPrecioPapel, "SUBTOTAL");
  assert.equal(linea.papelRequiereRevision, false);
  // Y el desglose viaja para poder mostrarlo: sin estos tres campos la pantalla
  // no puede explicar por qué el final es menor que el impreso.
  assert.equal(linea.precioUnitario, 8168.94);
  assert.equal(linea.bonificacionPct, 14);
  assert.equal(linea.subtotal, 87045.75);
});

test("BONIFICACIÓN + ESCALA. 12 unidades de un pack de 12 se comparan por BULTO", () => {
  // ── POR QUÉ ESTE CANDADO ────────────────────────────────────────────────
  //
  // La cantidad del renglón está en la unidad del PAPEL y el costo del ERP en la
  // del producto. `subtotal ÷ cantidad` da 7.253,81 POR UNIDAD; el catálogo tiene
  // 90.000 POR BULTO de 12. Comparar los dos sin convertir daría una baja del
  // 92 % que no existe.
  const [linea] = prepararLineasImportadas({
    lineas: [RENGLON_BONIF],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });

  // 12 unidades de un pack de 12 son un bulto entero: el pedido queda en BULTO.
  assert.equal(linea.unidadPedido, "BULTO");
  assert.equal(linea.cantidadPedido, 1);

  // El papel, llevado a bulto: 7.253,81 × 12.
  assert.equal(linea.precioPapel, 87045.72);
  assert.equal(linea.precioSistema, 90000);
  assert.equal(Math.round(linea.diferencia * 100) / 100, -2954.28);
  assert.equal(linea.diferentes, true);

  // CONTRAPRUEBA DE LA ESCALA: si no se convirtiera, la diferencia sería de
  // -82.746,19 y la pantalla mostraría una baja del 92 % sobre una compra normal.
  assert.notEqual(Math.round(linea.diferencia * 100) / 100, -82746.19);
});

test("BONIFICACIÓN. el borrador recibe el precio final, no el impreso", () => {
  const [linea] = prepararLineasImportadas({
    lineas: [RENGLON_BONIF],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });

  const [item] = consolidarLineasImportadas({
    lineas: [{ ...linea, origenPrecio: ORIGEN_PRECIO.PAPEL }],
    productosPorId: new Map([["9004", CATALOGO_BONIF[0]]]),
  });

  assert.equal(item.productoLocalId, 9004);
  assert.equal(item.unidad, "BULTO");
  assert.equal(item.cantidad, 1);
  assert.equal(item.precioCosto, 87045.72, "el cuerpo llevó el precio de lista al borrador");
  assert.notEqual(item.precioCosto, 8168.94 * 12, "viajó el precio de lista por bulto");
  assert.equal(item.origenPrecio, ORIGEN_PRECIO.PAPEL);

  // Y la ruta escribe ese número tal cual, porque la decisión viaja explícita.
  const detalle = datosDetalleNuevo({
    pedidoId: 7,
    productoLocalId: 9004,
    item,
    base: { factor_pack: 12, precio_costo: 90000, unidad_medida: "unidad", modoCompraProveedor: "BULTO" },
  });
  assert.equal(detalle.precioCosto, 87045.72);
});

test("BONIFICACIÓN. sin columna de subtotal la línea baja al descuento, no al precio de lista", () => {
  const [linea] = prepararLineasImportadas({
    // El subtotal viene igual —un lector puede calcularlo— pero el documento
    // dice que esa columna no existe.
    lineas: [{ ...RENGLON_BONIF, subtotal: 12 * 8168.94 }],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
  });
  assert.equal(linea.origenPrecioPapel, "DESCUENTO");
  assert.equal(linea.precioFinalPapelCrudo, 7025.29);
  assert.notEqual(linea.precioFinalPapelCrudo, 8168.94, "un subtotal calculado devolvió el precio de lista");
});

test("BONIFICACIÓN. sin subtotal ni descuento, el comportamiento anterior queda intacto", () => {
  const [linea] = prepararLineasImportadas({
    lineas: [{ ...RENGLON_BONIF, bonificacionPct: null, subtotal: null }],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
  });
  assert.equal(linea.origenPrecioPapel, "PRECIO_IMPRESO");
  assert.equal(linea.precioFinalPapelCrudo, 8168.94);
  assert.equal(linea.precioPapel, 98027.28, "8.168,94 × 12 es lo que se comparaba antes");
});

test("BONIFICACIÓN. cantidad inválida con subtotal deja la línea pidiendo revisión", () => {
  const [linea] = prepararLineasImportadas({
    lineas: [{ ...RENGLON_BONIF, cantidad: 0 }],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(linea.papelRequiereRevision, true);
  assert.equal(linea.precioFinalPapelCrudo, null);
  assert.equal(linea.precioPapel, null, "inventó un precio del papel sin poder dividir");
  assert.ok(linea.papelMotivoRevision);
});

test("BONIFICACIÓN. un precio escrito a mano gana y sobrevive al cambio de unidad", () => {
  const [linea] = prepararLineasImportadas({
    lineas: [RENGLON_BONIF],
    productos: CATALOGO_BONIF,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });

  const aMano = recalcularPrecioDeLinea(linea, CATALOGO_BONIF[0], {
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
    papelManual: "7000",
  });
  assert.equal(aMano.precioPapelEditado, true);
  assert.equal(aMano.precioFinalPapelCrudo, "7000");
  assert.equal(aMano.precioPapel, 84000);

  // Cambiar de unidad NO puede pisar lo que alguien escribió mirando el papel.
  const enUnidad = recalcularPrecioDeLinea(
    { ...aMano, unidadPedido: "UNIDAD", cantidadPedido: 12 },
    CATALOGO_BONIF[0],
    { facturaPor: "UNIDAD", hayColumnaSubtotal: true }
  );
  assert.equal(enUnidad.precioPapelEditado, true);
  assert.equal(enUnidad.precioPapel, 7000);

  // Y borrar el campo vuelve al cálculo del papel, no al último valor escrito.
  const borrado = recalcularPrecioDeLinea(aMano, CATALOGO_BONIF[0], {
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
    papelManual: "",
  });
  assert.equal(borrado.precioPapelEditado, false);
  assert.equal(borrado.precioFinalPapelCrudo, 7253.81);
});

test("EXCEL. bonificación y subtotal salen de sus columnas, y el total del pie también", () => {
  const hoja = [
    ["Codigo", "Descripcion", "Cantidad", "Precio", "Bonif", "Importe"],
    ["SINT-012", "Pack Sintético x12", 12, 8168.94, 14, 87045.75],
    ["SINT-020", "Otro Sintético", 2, 1000, null, 2000],
    ["", "TOTAL", null, null, null, 89045.75],
  ];
  const r = extraerFilasExcel(hoja);
  assert.equal(r.ok, true);
  assert.equal(r.documento.hayColumnaSubtotal, true);
  assert.equal(r.documento.hayColumnaBonificacion, true);
  assert.equal(r.documento.hayTotalImpreso, true);
  assert.equal(r.documento.totalDocumento, 89045.75);
  assert.equal(r.documento.lineas.length, 2, "el renglón de TOTAL entró como producto");
  assert.deepEqual(
    r.documento.lineas.map((l) => [l.codigo, l.precioUnitario, l.bonificacionPct, l.subtotal]),
    [["SINT-012", 8168.94, 14, 87045.75], ["SINT-020", 1000, null, 2000]]
  );
});

test("EXCEL. sin esas columnas los campos vienen en null y el booleano lo dice", () => {
  const hoja = [
    ["Codigo", "Descripcion", "Cantidad", "Precio"],
    ["SINT-012", "Pack Sintético x12", 12, 8168.94],
  ];
  const r = extraerFilasExcel(hoja);
  assert.equal(r.ok, true);
  assert.equal(r.documento.hayColumnaSubtotal, false);
  assert.equal(r.documento.hayColumnaBonificacion, false);
  assert.equal(r.documento.hayTotalImpreso, false);
  assert.equal(r.documento.totalDocumento, null);
  assert.equal(r.documento.lineas[0].subtotal, null);
  assert.equal(r.documento.lineas[0].bonificacionPct, null);
});

test("EXCEL. el 14 % guardado como 0,14 se lee como 14, no como 0,14", () => {
  const hoja = [
    ["Codigo", "Descripcion", "Cantidad", "Precio", "Dto"],
    ["SINT-012", "Pack Sintético x12", 12, 100, 0.14],
  ];
  const r = extraerFilasExcel(hoja);
  assert.equal(r.documento.lineas[0].bonificacionPct, 14);
});

test("solo el PACK puede alternar BULTO/UNIDAD", () => {
  // La misma decisión que toma el selector del modal, sobre la pieza compartida.
  assert.equal(permiteToggleUnidad(baseDeProducto(pack)), true);
  assert.equal(permiteToggleUnidad(baseDeProducto(fiambre)), false);
  assert.equal(permiteToggleUnidad(baseDeProducto(porKilo)), false);
  assert.equal(naturalezaLinea(baseDeProducto(fiambre)), "FIAMBRE");
  assert.equal(naturalezaLinea(baseDeProducto(porKilo)), "KG");
});
