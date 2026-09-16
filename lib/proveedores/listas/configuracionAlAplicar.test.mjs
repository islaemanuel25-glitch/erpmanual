// SE APLICA CON LAS REGLAS DEL LECTOR QUE LEYÓ LA LISTA, NO CON LAS DE ARCOR.
//
// ── EL DEFECTO, QUE NO LO ATRAPÓ NINGÚN CANDADO ────────────────────────────
//
// `aplicar/route.js` tenía `CONFIG_ARCOR` fija, de cuando el único lector que
// existía era el de Arcor. La primera lista genérica que se aplicó —369 filas
// que la pantalla mostraba como "listas para actualizar"— OMITIÓ LAS 369 con
// "no se pudo calcular el costo".
//
// El motivo es de una línea: la configuración de Arcor exige que la unidad
// comercial de la fila sea UN, DI o BU, porque su archivo trae esa columna. Un
// archivo cualquiera no la trae, así que toda fila genérica llega con
// `unidadProveedor: null` y el veto la saca antes de calcular nada.
//
// Nada se puso en rojo. La importación andaba, la conciliación andaba, la
// pantalla andaba, los 3.000 candados estaban en verde, y el defecto vivía en el
// espacio entre dos piezas que cada candado probaba por separado. Lo encontró
// abrir la pantalla y apretar el botón.
//
// ── POR QUÉ ESTE CANDADO EJERCE Y ADEMÁS MIRA EL FUENTE ────────────────────
//
// Ejercer `revalidarFila` prueba que las dos configuraciones deciden distinto
// sobre la MISMA fila —si no decidieran distinto, el defecto sería inofensivo y
// este candado no defendería nada—. Mirar el fuente prueba que la ruta elige
// entre las dos en vez de tener una escrita adentro, que es lo que estaba mal.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { revalidarFila } from "@/lib/proveedores/listas/aplicacion";
import { resolverParserPorId, PARSER_LISTA } from "@/lib/proveedores/listas/registro";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
import { CONFIG_GENERICA } from "@/lib/proveedores/listas/configuraciones/generico";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const leer = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

// LA FORMA DEL DATO ES LA QUE PRODUCE `filasDelArchivo`, no una inventada:
// `unidadProveedor` en null es justamente lo que el lector genérico escribe,
// porque un archivo cualquiera no trae columna de unidad comercial.
const FILA_GENERICA = {
  id: 1,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  productoBaseId: 7,
  unidadProveedor: null,
  unidadesPorBulto: null,
  precioConIva: 1000,
  costoAnterior: 900,
  costoMaestroPropuesto: 1000,
  diferenciaPct: 11.1,
  multiplicadorConfirmado: null,
  confirmadoEn: null,
  vinculadoEn: null,
  excluidaManual: false,
  aplicada: false,
};

const PRODUCTO = {
  id: 7,
  nombre: "ATUN AL NATURAL LC X300G",
  precio_costo: 900,
  precio_venta: 1500,
  margen: 40,
  redondeo_100: false,
  es_combo: false,
  unidad_medida: "UNIDAD",
  factor_pack: null,
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
};

const CONTEXTO = {
  operandoEnLocalId: 1,
  depositoLocalId: 1,
  cabecera: { aumentoEsperadoMinPct: 5, aumentoEsperadoMaxPct: 20 },
};

const revalidar = (config) =>
  revalidarFila({ fila: FILA_GENERICA, base: PRODUCTO, contexto: CONTEXTO, config, recargoPct: 0 });

test("la configuración de Arcor NO puede aplicar una fila genérica", () => {
  // Esto no es un defecto de Arcor: su veto por unidad es correcto PARA SU
  // archivo, que sí trae la columna. Es la prueba de que las dos
  // configuraciones deciden distinto sobre la misma fila.
  const v = revalidar({ ...CONFIG_ARCOR, impuestoAdicionalPct: null });
  assert.equal(v.aplicable, false, "si Arcor la aplicara, el defecto no habría existido");
});

test("la configuración genérica SÍ la aplica, y con el costo de la lista", () => {
  const v = revalidar({ ...CONFIG_GENERICA, impuestoAdicionalPct: null });
  assert.equal(v.aplicable, true, `la omitió por: ${v.motivo}`);
  assert.equal(v.costoNuevo, 1000);
});

test("lo que la persona confirmó en «para revisar» SE APLICA, aunque no haya unidad", () => {
  // ── EL SEGUNDO DEFECTO DE LA MISMA TANDA ─────────────────────────────────
  //
  // Con la configuración ya bien resuelta, la aplicación seguía omitiendo DIEZ
  // filas: exactamente las diez que se habían confirmado a mano en la pantalla
  // 5. Una fila confirmada FALLA CERRADA si `basePrecioDeFila` devuelve null, y
  // devuelve null siempre que el archivo no traiga la columna de unidad
  // comercial —o sea, siempre, salvo Arcor—.
  //
  // La pantalla dejaba confirmarla, la marcaba lista, la contaba entre los 369
  // del botón y al aplicar la tiraba. Es peor que no dejar confirmar: le hace
  // creer a la persona que su decisión entró.
  const confirmada = {
    ...FILA_GENERICA,
    // La forma REAL de las diez: multiplicador 1, confirmación vigente, y la
    // unidad en null porque el lector genérico no la escribe.
    multiplicadorConfirmado: 1,
    confirmadoEn: new Date("2026-09-16T22:40:00Z"),
    vinculadoEn: new Date("2026-09-16T19:11:00Z"),
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    unidadProveedor: null,
  };
  const v = revalidarFila({
    fila: confirmada,
    base: PRODUCTO,
    contexto: CONTEXTO,
    config: { ...CONFIG_GENERICA, impuestoAdicionalPct: null },
    recargoPct: 0,
  });
  assert.equal(v.aplicable, true, `la omitió por: ${v.motivo}`);
  assert.equal(v.costoNuevo, 1000, "tiene que escribir el costo que la persona aprobó");

  // CONTRAPRUEBA: con la configuración de Arcor —donde la unidad SÍ es el dato
  // que decide la lectura— una fila confirmada sin unidad sigue fallando
  // cerrada. La excepción es del lector sin columna, no de toda fila confirmada.
  const conArcor = revalidarFila({
    fila: confirmada,
    base: PRODUCTO,
    contexto: CONTEXTO,
    config: { ...CONFIG_ARCOR, impuestoAdicionalPct: null },
    recargoPct: 0,
  });
  assert.equal(conArcor.aplicable, false);
});

test("el registro devuelve cada configuración por el id que se guarda en la importación", () => {
  // `ImportacionListaProveedor.parser` guarda EXACTAMENTE estos dos valores hoy.
  assert.equal(resolverParserPorId(PARSER_LISTA.GENERICO).config, CONFIG_GENERICA);
  assert.equal(resolverParserPorId(PARSER_LISTA.ARCOR_XLSX).config, CONFIG_ARCOR);

  // Una importación vieja sin el campo cae al genérico y no rompe.
  assert.equal(resolverParserPorId(null).config, CONFIG_GENERICA);

  // Y un id que no existe no se resuelve en silencio a Arcor.
  const raro = resolverParserPorId("FORMATO_QUE_NO_EXISTE");
  assert.equal(raro.ok, false);
});

test("la ruta que escribe costos ELIGE la configuración, no la tiene escrita adentro", () => {
  const ruta = leer("app/api/proveedores/listas/[id]/aplicar/route.js");

  // CONTRAPRUEBA DEL CANDADO: si alguien vuelve a poner `CONFIG_ARCOR` fija acá,
  // esto se pone rojo. Es la única forma de que no vuelva a pasar en silencio.
  assert.ok(
    !/CONFIG_ARCOR/.test(ruta),
    "la ruta de aplicar volvió a tener la configuración de Arcor escrita adentro"
  );
  assert.match(ruta, /resolverParserPorId\(importacion\.parser\)/);

  // Y que pida el campo: sin `parser: true` en el select, `importacion.parser`
  // llega en `undefined` y todo cae al genérico sin que nadie se entere —lo que
  // rompería Arcor exactamente igual que antes rompía el genérico—.
  const selects = ruta.match(/select:\s*\{[\s\S]*?\},\s*\}\);/g) ?? [];
  const conParser = selects.filter((s) => /\bparser: true\b/.test(s));
  assert.ok(conParser.length >= 2, `solo ${conParser.length} de los select piden \`parser\``);
});

test("los dos scripts que revalidan fuera de Next eligen igual", () => {
  // Regla 10: el relevamiento se hace sobre todo el repo. `git grep CONFIG_ARCOR`
  // encontró dos scripts con la misma configuración fija, que habrían informado
  // sobre una lista genérica con las reglas de otro proveedor.
  for (const s of [
    "scripts/preparar-aplicacion-lista.mjs",
    "scripts/reconciliar-importacion-lista.mjs",
  ]) {
    const fuente = leer(s);
    assert.ok(!/CONFIG_ARCOR/.test(fuente), `${s} sigue con la configuración de Arcor fija`);
    assert.match(fuente, /resolverParserPorId\(cab\.parser\)/, `${s} no resuelve el lector guardado`);
  }
});
