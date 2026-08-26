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
import { prepararLineasImportadas } from "./prepararLineas.js";
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
  assert.deepEqual(resultado.documento.lineas, [
    {
      filaOrigen: 3,
      codigo: "6596",
      descripcion: "ALF. COFLER BLOCK X60G",
      cantidad: 42,
      unidad: "UN",
      precioUnitario: 909.037,
    },
  ]);
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

test("solo el PACK puede alternar BULTO/UNIDAD", () => {
  // La misma decisión que toma el selector del modal, sobre la pieza compartida.
  assert.equal(permiteToggleUnidad(baseDeProducto(pack)), true);
  assert.equal(permiteToggleUnidad(baseDeProducto(fiambre)), false);
  assert.equal(permiteToggleUnidad(baseDeProducto(porKilo)), false);
  assert.equal(naturalezaLinea(baseDeProducto(fiambre)), "FIAMBRE");
  assert.equal(naturalezaLinea(baseDeProducto(porKilo)), "KG");
});
