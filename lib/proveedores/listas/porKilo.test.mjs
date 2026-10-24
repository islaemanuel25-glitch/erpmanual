// UN PRODUCTO QUE SE VENDE POR KILO, FRENTE A UNA LISTA QUE COTIZA LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/porKilo.test.mjs
//
// EL CASO (Dab, producción 28029225, 2026-10-24): GRANIX BOCADITO CHOC. BLANCO
// 2KG. En el sistema guarda el costo por kilo: $ 6.405,00. En la lista: "5808 ·
// GRANIX BOCADITOS CHOC BLANCO 2 K · $ 22.105,73 · por 2" —pieza de 2 kg, bulto
// de 2 piezas—. El motor lo bloqueaba entero con "no admite que la lista le
// cambie el costo así" y no dejaba hacer nada.
//
// La forma de los datos sale de donde vive: la fila como la guarda el lector
// genérico (`unidadProveedor` "" porque no trae unidad comercial, las unidades
// por bulto en `unidadesPorBulto`), el producto con `CAMPOS_PRODUCTO_PARA_LEER`
// y `CAMPOS_PRODUCTO_PARA_REVALIDAR`, y la recordada con las columnas de
// `LecturaProductoProveedor`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLAVE_KILO,
  CLAVE_KILOS_POR_PIEZA,
  conLoRecordado,
  kilosValidos,
  lecturasPorKilo,
} from "@/lib/proveedores/listas/cajaRecordada";
import { CONFIG_GENERICA } from "@/lib/proveedores/listas/configuraciones/generico";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
import { guardaElCostoPorKilo, MOTIVO_BLOQUEO } from "@/lib/proveedores/listas/calculoCosto";
import { lecturasDeLaFila, lecturaElegida } from "@/lib/proveedores/listas/lecturasDeLaFila";
import { puedeConfirmarse, resultadoConfirmacion } from "@/lib/proveedores/listas/confirmarPresentacion";
import { revalidarFila } from "@/lib/proveedores/listas/aplicacion";
import { costoDeLaFila, MOTIVO_LECTURA } from "@/lib/proveedores/listas/eleccionDeLectura";
import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "@/lib/proveedores/listas/conciliarLista";
import {
  porQueNoSeConfirma,
  TEXTO_BLOQUEO_SIN_MOTIVO,
  TEXTO_POR_KILO_SIN_CONVERSION,
} from "@/lib/proveedores/listas/porQueNoSeConfirma";
import { MOTIVO_NO_CONFIRMABLE } from "@/lib/proveedores/listas/confirmarPresentacion";
import { ESTADO_TU_PRODUCTO, TEXTO_FALTAN_LOS_KILOS, tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** `Intl` separa el "$" con un espacio duro. */
const conEspacios = (t) => String(t).replace(/ /g, " ");

const RANGO_DAB = { minPct: 0, maxPct: 12 };
const CAB = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };

/** GRANIX, con los campos del motor y de la revalidación. Por kilo, "caja de 1". */
function granix(extra = {}) {
  return {
    id: 31,
    nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG",
    precio_costo: 6405,
    precio_venta: 8900,
    margen: 39,
    redondeo_100: false,
    es_combo: false,
    creadoEnLocalId: 1,
    activo: true,
    locales: [{ activo: true }],
    unidad_medida: "kg",
    factor_pack: 1,
    modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null,
    ...extra,
  };
}

/** El renglón 5808 de Dab. */
function renglon5808(extra = {}) {
  return {
    id: 5808, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: MOTIVO_LECTURA.SIN_LECTURAS, costoAnterior: 6405,
    productoBaseId: 31, excluidaManual: false, aplicada: false, seleccionada: false, diferenciaPct: null,
    aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: null, vinculadoEn: null,
    multiplicadorConfirmado: null, kilosConfirmados: null, fueraDeRangoAceptadaEn: null, costoMaestroPropuesto: null,
    factorErp: 1, codigoCrudo: "5808", codigoNormalizado: "5808",
    descripcionProveedor: "GRANIX BOCADITOS CHOC BLANCO 2 K",
    precioConIva: 22105.73, unidadesPorBulto: 2, unidadProveedor: "",
    ...extra,
  };
}

/** Lo que guarda la ruta `lectura-recordada` cuando contestan "2". */
const PIEZA_DE_2KG = { clave: CLAVE_KILOS_POR_PIEZA, multiplicador: 1, cantidad: null, kilosPorPieza: "2.000" };

test("GRANIX ES UN PRODUCTO POR KILO, Y LA PIEZA NO SE COMPARA CONTRA EL KILO", () => {
  assert.equal(guardaElCostoPorKilo(granix()), true);
  // Sin los kilos de la pieza: ninguna lectura. Antes del arreglo esto era un
  // bloqueo; lo que NO puede pasar es la lectura "tal cual" de $ 22.105,73.
  const sin = lecturasDeLaFila({ fila: renglon5808(), producto: granix(), cab: CAB, rango: RANGO_DAB });
  assert.deepEqual(sin.lecturas, []);
  assert.equal(sin.porKilo, true);
  assert.equal(sin.admiteKilos, true);
  assert.equal(sin.confirmable, true, "con un lector que pasa a kilo, la fila se puede decidir");
  // Un producto que no es por peso sigue con sus lecturas de siempre.
  const porUnidad = lecturasDeLaFila({ fila: renglon5808(), producto: granix({ unidad_medida: "unidad" }), cab: CAB, rango: RANGO_DAB });
  assert.ok(porUnidad.lecturas.length > 0);
  assert.equal(porUnidad.porKilo, false);
});

test("CON LA PIEZA DE 2 KG: «PRECIO DE UNA PIEZA» Y «PRECIO DEL BULTO», PASADAS A KILO Y CONTRA $ 6.405 EL KILO", () => {
  const { lecturas } = lecturasDeLaFila({
    fila: renglon5808(),
    producto: conLoRecordado(granix(), PIEZA_DE_2KG),
    cab: CAB,
    rango: RANGO_DAB,
  });
  const pieza = lecturas.find((l) => l.clave === CLAVE_KILO.PIEZA);
  const bulto = lecturas.find((l) => l.clave === CLAVE_KILO.BULTO);
  assert.equal(lecturas.length, 2);
  // $ 22.105,73 ÷ 2 kg = $ 11.052,87 el kilo: +72,6 % contra $ 6.405.
  assert.equal(pieza.costoNuevo, 11052.87);
  assert.equal(pieza.titulo, "Precio de una pieza");
  assert.equal(pieza.cuenta, "$ 22.105,73 ÷ 2 kg = $ 11.052,87 el kilo");
  assert.ok(Math.abs(pieza.variacionPct - 72.56) < 0.01, `pieza ${pieza.variacionPct}`);
  // $ 22.105,73 ÷ (2 piezas × 2 kg) = $ 5.526,43 el kilo: −13,7 %.
  assert.equal(bulto.costoNuevo, 5526.43);
  assert.equal(bulto.titulo, "Precio del bulto");
  assert.equal(bulto.cuenta, "$ 22.105,73 ÷ (2 piezas × 2 kg) = $ 5.526,43 el kilo");
  assert.ok(Math.abs(bulto.variacionPct - -13.72) < 0.01, `bulto ${bulto.variacionPct}`);
  // Ninguna cae en el 0 a 12 de Dab: se elige la más cercana al costo de hoy,
  // como cualquier otra lectura. Es la del bulto.
  assert.equal(pieza.fueraDeRango, true);
  assert.equal(bulto.fueraDeRango, true);
  assert.equal(lecturaElegida({ lecturas, fila: renglon5808() }).clave, CLAVE_KILO.BULTO);
});

test("SIN UNIDADES POR BULTO EN LA LISTA, SOLO EL PRECIO DE UNA PIEZA", () => {
  const l = lecturasPorKilo({ precio: 22105.73, kilos: 2, piezasPorBulto: null });
  assert.deepEqual(l.map((x) => x.clave), [CLAVE_KILO.PIEZA]);
  assert.deepEqual(lecturasPorKilo({ precio: 22105.73, kilos: null }), [], "sin kilos no hay ninguna");
  // Admite decimales: una pieza de 2,5 kg.
  assert.equal(kilosValidos(2.5), true);
  assert.equal(kilosValidos(0), false);
  assert.equal(kilosValidos(2.0005), false, "más fino que el gramo no lo guarda la columna");
  assert.equal(lecturasPorKilo({ precio: 1000, kilos: 2.5 })[0].costoNuevo, 400);
});

test("LA CONCILIACIÓN YA NO BLOQUEA A GRANIX CON EL LECTOR GENÉRICO; CON EL DE ARCOR, SÍ", () => {
  const conciliar = (config, lecturasRecordadas = null) =>
    conciliarFila({
      fila: { ...renglon5808(), filaExcel: 1, hojaNombre: "PDF", codigoComparableSinCeros: "5808", codigoBarraProveedor: null, precioSinIva: null },
      indice: indexarCodigosProveedor([{ id: 1, productoBaseId: 31, codigoInterno: "5808", activo: true }]),
      indiceBarra: indexarCodigosBarra([]),
      productosPorId: new Map([
        [31, {
          productoBaseId: 31, nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG", precioCostoActual: 6405, factorPack: 1,
          unidadMedida: "kg", modoCompraProveedor: "BULTO", pesoReferenciaKg: null, creadoEnLocalId: 1, esCombo: false, codigosBarra: [],
        }],
      ]),
      contexto: {
        grupoId: 1, proveedorId: 1, operandoEnLocalId: 1, depositoLocalId: 1,
        cabecera: { aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12 },
        lecturasRecordadas,
      },
      config: { ...config, recargoPct: 0, umbralVariacionPct: 30, impuestoAdicionalPct: null },
    });
  // Sin kilos: para revisar, sin costo propuesto (no el precio de la pieza).
  const sinKilos = conciliar(CONFIG_GENERICA);
  assert.equal(sinKilos.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(sinKilos.costoMaestroPropuesto ?? null, null);
  // Con los 2 kg recordados: para revisar con el porcentaje de la más cercana.
  const conKilos = conciliar(CONFIG_GENERICA, new Map([[31, PIEZA_DE_2KG]]));
  assert.notEqual(conKilos.estado, ESTADO_LINEA.BLOQUEADO);
  assert.ok(Math.abs(conKilos.diferenciaPct - -13.72) < 0.01, `quedó ${conKilos.diferenciaPct}`);
  // Contraprueba: el formato de Arcor afirma la unidad y no pasa a kilo.
  const arcor = conciliar(CONFIG_ARCOR);
  assert.equal(arcor.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(arcor.motivo, MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
});

test("SIN KILOS, EL MOTOR NO TOMA EL PRECIO DE LA PIEZA COMO SI FUERA EL DEL KILO", () => {
  const r = costoDeLaFila({
    fila: renglon5808(),
    base: { unidad_medida: "kg", factor_pack: 1, modoCompraProveedor: "BULTO", precio_costo: 6405 },
    config: CONFIG_GENERICA,
    recargoPct: 0,
    impuestoAdicionalPct: null,
    rango: RANGO_DAB,
    precioConRecargo: 22105.73,
    producto: { factorPack: 1, unidadMedida: "kg", modoCompraProveedor: "BULTO", esCombo: false },
    requiereBulto: false,
    factorErp: 1,
    factorErpValido: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.SIN_LECTURAS);
});

test("CONFIRMAR EL BULTO GUARDA ENTRE CUÁNTOS KILOS SE DIVIDIÓ; LA FILA BLOQUEADA DE PRODUCCIÓN SE PUEDE DECIDIR", () => {
  const r = resultadoConfirmacion({
    fila: renglon5808(),
    base: conLoRecordado(granix(), PIEZA_DE_2KG),
    clave: CLAVE_KILO.BULTO,
    cantidadPresentacion: null,
    recargoPct: 0,
    rango: RANGO_DAB,
    impuestoAdicionalPct: null,
    lecturasPosibles: CONFIG_GENERICA.lecturasPosibles,
    umbralVariacionPct: 30,
    aceptarFueraDeRango: true,
  });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.costoNuevo, 5526.43);
  assert.equal(r.kilos, 4);
  assert.equal(r.multiplicador, 1);
  // La fila de GRANIX en producción quedó BLOQUEADA antes del arreglo: con un
  // lector que pasa a kilo se decide; sin él, no.
  const bloqueada = renglon5808({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE });
  const abierta = { estado: "CONCILIADA" };
  assert.equal(puedeConfirmarse(bloqueada, abierta, { lecturasPropias: true, admiteKilos: true }).ok, true);
  assert.equal(puedeConfirmarse(bloqueada, abierta, { lecturasPropias: true, admiteKilos: false }).ok, false);
  // Un combo bloqueado sigue sin decidirse aunque el lector pase a kilo.
  const combo = renglon5808({ estado: ESTADO_LINEA.BLOQUEADO, motivo: "PRODUCTO_COMBO" });
  assert.equal(puedeConfirmarse(combo, abierta, { lecturasPropias: true, admiteKilos: true }).ok, false);
});

/** La fila como queda después de «✓ Usar» sobre el bulto (`confirmar`). */
function confirmadaPorKilo(extra = {}) {
  return renglon5808({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    motivo: null,
    seleccionada: true,
    multiplicadorConfirmado: 1,
    kilosConfirmados: "4.000",
    confirmadoEn: new Date("2026-10-24T10:00:00.000Z"),
    costoMaestroPropuesto: 5526.43,
    diferenciaPct: -13.72,
    fueraDeRangoAceptadaEn: new Date("2026-10-24T10:00:00.000Z"),
    ...extra,
  });
}
const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: { aumentoEsperadoMinPct: -100, aumentoEsperadoMaxPct: 100 } };
const aplicar = (fila, base, config = CONFIG_GENERICA) =>
  revalidarFila({ fila, base, contexto: CONTEXTO, config, recargoPct: 0 });

test("APLICAR ESCRIBE EL COSTO POR KILO DEL BULTO: $ 5.526,43, NUNCA EL PRECIO DE LA PIEZA", () => {
  const r = aplicar(confirmadaPorKilo(), conLoRecordado(granix(), PIEZA_DE_2KG));
  assert.equal(r.aplicable, true, `motivo: ${r.motivo}`);
  assert.equal(r.costoNuevo, 5526.43);
  // Contrapruebas, todas FALLAN CERRADAS y ninguna escribe $ 22.105,73:
  // sin los kilos en la fila (la cuenta del multiplicador daría la pieza),
  const sinKilos = aplicar(confirmadaPorKilo({ kilosConfirmados: null }), conLoRecordado(granix(), PIEZA_DE_2KG));
  assert.equal(sinKilos.aplicable, false);
  assert.notEqual(sinKilos.costoNuevo, 22105.73);
  // con los kilos recordados cambiados después de confirmar,
  const otrosKilos = aplicar(confirmadaPorKilo(), conLoRecordado(granix(), { ...PIEZA_DE_2KG, kilosPorPieza: "2.500" }));
  assert.equal(otrosKilos.aplicable, false);
  // sin la memoria de los kilos,
  assert.equal(aplicar(confirmadaPorKilo(), granix()).aplicable, false);
  // con un producto que ya no guarda por kilo,
  const yaNoEsKilo = aplicar(confirmadaPorKilo(), conLoRecordado(granix({ unidad_medida: "unidad" }), PIEZA_DE_2KG));
  assert.equal(yaNoEsKilo.aplicable, false);
  // y con un lector que no pasa a kilo, el bloqueo de siempre.
  assert.equal(aplicar(confirmadaPorKilo(), conLoRecordado(granix(), PIEZA_DE_2KG), CONFIG_ARCOR).aplicable, false);
});

test("LA FICHA DEL PRODUCTO NO SE TOCA: los kilos van a la lectura recordada", () => {
  const r = codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/lectura-recordada/route.js");
  assert.match(r, /prisma\.lecturaProductoProveedor\.upsert\(/);
  assert.match(r, /clave: CLAVE_KILOS_POR_PIEZA,\s*multiplicador: 1,\s*cantidad: null,\s*kilosPorPieza: kilos,/);
  // Nada que escriba en el producto: ni update, ni su peso, ni su factor.
  assert.ok(!/productoBase\.(update|updateMany|upsert|create)\(/.test(r), "la ruta escribe en el producto");
  assert.ok(!r.includes("pesoReferenciaKg"), "la ruta toca el peso de referencia del producto");
  assert.ok(!r.includes("factor_pack"), "la ruta toca el factor del producto");
  assert.ok(!/importacionListaFila\.update/.test(r), "la ruta confirma la fila");
  // Y confirmar no borra los kilos al elegir una lectura: van en el `create` y
  // NO en el `update`.
  const c = codigoDe("app/api/proveedores/listas/[id]/filas/[filaId]/confirmar/route.js");
  const upsert = c.slice(c.indexOf("lecturaProductoProveedor.upsert("), c.indexOf("recalcularContadores(tx"));
  const create = upsert.slice(upsert.indexOf("create:"), upsert.indexOf("update:"));
  const update = upsert.slice(upsert.indexOf("update:"));
  assert.match(create, /kilosPorPieza: base\.kilosPorPieza \?\? null,/);
  assert.ok(!update.includes("kilosPorPieza"), "confirmar pisa los kilos al elegir una lectura");
  assert.match(c, /kilosConfirmados: r\.kilos,/);
  // La pantalla manda los kilos a esa ruta.
  const p = codigoDe("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.match(p, /\{ kilos: kilosDeLaPieza \}/);
  assert.match(p, /\/lectura-recordada`/);
  assert.match(p, /onKilos=\{kilos\}/);
});

test("LA TARJETA PREGUNTA LOS KILOS, Y CON ELLOS DICE LA CUENTA EN KILOS", () => {
  const tarjeta = (producto, fila = renglon5808()) => {
    const { lecturas, confirmable, admiteCaja, admiteKilos, porKilo } = lecturasDeLaFila({ fila, producto, cab: CAB, rango: RANGO_DAB });
    return tusProductosDeLaLista({
      productos: [{ id: 31, nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG", precio_costo: 6405, filas: [fila] }],
      rango: RANGO_DAB,
      lecturaPorFila: new Map([[fila.id, { lectura: lecturaElegida({ lecturas, fila }), delPropuesto: null, confirmable, admiteCaja, admiteKilos, porKilo }]]),
      proveedor: "Dab",
    }).items[0];
  };
  const sin = tarjeta(granix());
  assert.equal(sin.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(sin.preguntarKilos, true);
  assert.equal(sin.preguntarCaja, false, "a un producto por kilo no se le pregunta la caja");
  assert.equal(sin.motivoTexto, TEXTO_FALTAN_LOS_KILOS);
  // La fila BLOQUEADA de producción también pregunta, en vez del cartel.
  const bloqueada = tarjeta(granix(), renglon5808({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE }));
  assert.equal(bloqueada.preguntarKilos, true);
  assert.equal(bloqueada.motivoTexto, TEXTO_FALTAN_LOS_KILOS);
  // Con los kilos: ya no pregunta, y tiene costo nuevo y porcentaje por kilo.
  const con = tarjeta(conLoRecordado(granix(), PIEZA_DE_2KG));
  assert.equal(con.preguntarKilos, false);
  assert.equal(con.costoNuevo, 5526.43);
  assert.equal(con.porKilo, true);
  assert.equal(con.divisorKg, 4);
  assert.equal(con.usar?.clave, CLAVE_KILO.BULTO);
});

test("EL CARTEL DE BLOQUEO DICE EL MOTIVO DE ESE PRODUCTO, Y EL TEXTO VAGO SE FUE", () => {
  const por = (motivo) =>
    porQueNoSeConfirma(MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE, { estado: ESTADO_LINEA.BLOQUEADO, motivo });
  assert.equal(por(MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE), TEXTO_POR_KILO_SIN_CONVERSION);
  assert.match(por("PRODUCTO_COMBO"), /combo/);
  assert.match(por("PRECIO_INVALIDO"), /no es un número/);
  assert.equal(por("ALGO_QUE_NO_EXISTE"), TEXTO_BLOQUEO_SIN_MOTIVO);
  assert.ok(!codigoDe("lib/proveedores/listas/porQueNoSeConfirma.js").includes("no admite que la lista le cambie"));
});
