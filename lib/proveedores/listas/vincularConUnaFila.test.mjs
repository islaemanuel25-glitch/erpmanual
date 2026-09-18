// Candados de atar un producto del catálogo a un renglón de la lista.
//
// ── DE DÓNDE SALEN LOS FIXTURES DE ACÁ, QUE ES LA PREGUNTA IMPORTANTE ───────
//
// El defecto que más se repite en este proyecto es un candado montado sobre un
// dato que el sistema nunca produce: queda verde para siempre y no cubre nada.
// Así que estos fixtures NO se escribieron "razonables":
//
//   · La FILA sale de `ImportacionListaFila` tal como la trae `findFirst` en las
//     dos rutas —los campos y los nombres son los del modelo—.
//   · El PRODUCTO sale de `CAMPOS_PRODUCTO_PARA_EL_MOTOR`, que es literalmente el
//     `select` que las rutas usan. Si el select cambia, el fixture cambia con él.
//   · El VÍNCULO que se le da a `indexarCodigosProveedor` no se escribe: se toma
//     de lo que `guardarCodigoDeLaFila` acaba de mandar a la base. Eso es lo que
//     hace que el candado 3 pruebe el camino de verdad y no una versión ideal.
//
// Los tres arreglos que estos candados defienden se ejercieron además contra
// Postgres —importación 22 de M Y F, producto 1358, renglón 17049— porque una
// consulta de Prisma no se prueba con candados. Lo medido está en el informe.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/vincularConUnaFila.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  candidatasConPuntaje,
  guardarCodigoDeLaFila,
  desactivarCodigosDelProducto,
  filaParaElMotor,
  productoParaElMotor,
  motorParaEstaLista,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  CAMPOS_CABECERA_PARA_EL_MOTOR,
  TOPE_CANDIDATAS,
} from "./vincularConUnaFila.js";
import { indexarCodigosProveedor, indexarCodigosBarra, conciliarFila } from "./conciliarLista.js";
import { ESTADO_LINEA } from "./estados.js";
import { resolverParserPorId } from "./registro.js";

// ---------------------------------------------------------------------------
// Un `tx` de mentira que anota qué se le pidió, en orden.
// ---------------------------------------------------------------------------
//
// No simula Prisma: guarda los argumentos para poder AFIRMAR SOBRE EL VALOR
// ESCRITO. Un candado que solo comprueba que la función no explota no habría
// visto `origenAlta: undefined`, que es justamente lo que pasó.
function txQueAnota() {
  const llamadas = [];
  return {
    llamadas,
    productoCodigoProveedor: {
      upsert: async (args) => {
        llamadas.push({ op: "upsert", args });
        return { id: 1 };
      },
      updateMany: async (args) => {
        llamadas.push({ op: "updateMany", args });
        return { count: 0 };
      },
    },
  };
}

/** Una fila de `ImportacionListaFila`, con los nombres del modelo. */
const FILA = Object.freeze({
  id: 17049,
  filaExcel: 214,
  hojaNombre: "Hoja1",
  codigoCrudo: "4479",
  codigoNormalizado: "4479",
  codigoComparableSinCeros: "4479",
  codigoBarraProveedor: null,
  descripcionProveedor: "VIM LVDINA GEL CITR PREVSARRO 12X700ML",
  unidadProveedor: "BU",
  unidadesPorBulto: 12,
  precioConIva: 2638.52,
  precioSinIva: null,
  categoriaCruda: null,
  productoBaseId: null,
  // Lo que la fila traía de una confirmación anterior, que NO tiene que viajar.
  confirmadoEn: new Date("2026-09-01T10:00:00Z"),
  baseConfirmada: "BULTO",
  aumentoEsperadoMinPct: 5,
  aumentoEsperadoMaxPct: 9,
});

// ===========================================================================
// 1. El código guardado dice que lo decidió UNA PERSONA
// ===========================================================================

test("el vínculo se guarda con origenAlta VINCULACION_MANUAL", async () => {
  // ── EL DEFECTO QUE ESTE CANDADO EXISTE PARA ATAJAR ──────────────────────
  //
  // Decía `ORIGEN_ALTA_VINCULO.MANUAL`, y esa clave NO EXISTE: la del enum es
  // `VINCULACION_MANUAL`. En JavaScript una propiedad que no existe vale
  // `undefined`, Prisma trata un `undefined` como "no lo mandes", y la columna
  // quedaba en null sin un solo error. Venía así de «No es este producto», así
  // que todos los vínculos hechos a mano desde esa pantalla quedaron nulos.
  //
  // Importa porque `servicioIdentidad` lee exactamente ese valor para decir que
  // un vínculo lo confirmó una persona: con null, una decisión tomada a mano se
  // trataba como una corazonada del motor.
  //
  // Se afirma el VALOR y no que la función corra: es lo único que lo ve.
  const tx = txQueAnota();
  await guardarCodigoDeLaFila(tx, {
    grupoId: 1,
    proveedorId: 2,
    productoBaseId: 1358,
    fila: FILA,
  });

  const upsert = tx.llamadas.find((l) => l.op === "upsert");
  assert.ok(upsert, "tiene que haber un upsert");
  assert.equal(upsert.args.create.origenAlta, "VINCULACION_MANUAL");
  assert.equal(upsert.args.create.activo, true);
  assert.equal(upsert.args.update.activo, true);
});

test("el vínculo guarda la descripción CRUDA y la NORMALIZADA", () => {
  // La normalizada es la que indexa el macheo por nombre. En null, este vínculo
  // no participaría de esa búsqueda y el macheo por nombre no lo encontraría.
  const tx = txQueAnota();
  return guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358, fila: FILA,
  }).then(() => {
    const { create } = tx.llamadas.find((l) => l.op === "upsert").args;
    assert.equal(create.descripcionProveedor, FILA.descripcionProveedor);
    assert.ok(create.descripcionNormalizada, "la normalizada no puede quedar vacía");
    assert.notEqual(create.descripcionNormalizada, create.descripcionProveedor);
  });
});

test("el único es codigo_interno_unico_por_proveedor, con su nombre a mano", async () => {
  // El modelo lo nombra a mano: con el nombre que Prisma arma solo, esto falla
  // recién contra Postgres. Es de los que el build no ve.
  const tx = txQueAnota();
  await guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358, fila: FILA,
  });
  const { where } = tx.llamadas.find((l) => l.op === "upsert").args;
  assert.deepEqual(Object.keys(where), ["codigo_interno_unico_por_proveedor"]);
  assert.deepEqual(where.codigo_interno_unico_por_proveedor, {
    grupoId: 1, proveedorId: 2, codigoInterno: "4479",
  });
});

test("CONTRAPRUEBA: un renglón sin código no escribe ningún vínculo", async () => {
  // Es la rama que protege de guardar un vínculo con código vacío, que después
  // machearía cualquier cosa. Se ejerce, no se supone.
  const tx = txQueAnota();
  const r = await guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358,
    fila: { ...FILA, codigoNormalizado: null, codigoCrudo: null },
  });
  assert.equal(r, null);
  assert.deepEqual(tx.llamadas, []);
});

// ===========================================================================
// 2. Apagar los viejos va ANTES de encender el nuevo
// ===========================================================================

test("se apagan TODOS los códigos del producto, no uno elegido", async () => {
  // Desde «Buscarlo en la lista» no se sabe cuál era el equivocado: el producto
  // no apareció, así que ninguno de sus códigos está en este archivo. Apagar
  // solo el que uno cree que es el malo dejaría el otro macheando el mes que
  // viene. El `where` NO lleva `codigoInterno`, y eso es lo que se afirma.
  const tx = txQueAnota();
  await desactivarCodigosDelProducto(tx, { grupoId: 1, proveedorId: 2, productoBaseId: 1358 });

  const { args } = tx.llamadas.find((l) => l.op === "updateMany");
  assert.deepEqual(args.where, { grupoId: 1, proveedorId: 2, productoBaseId: 1358, activo: true });
  assert.equal("codigoInterno" in args.where, false);
  assert.deepEqual(args.data, { activo: false });
});

test("el orden es apagar y después encender, nunca al revés", async () => {
  // Invertirlo dejaría al producto sin NINGÚN código activo: el upsert enciende
  // el nuevo y el updateMany lo apagaría enseguida. No hay nada que avise, así
  // que el orden se afirma acá.
  const tx = txQueAnota();
  await desactivarCodigosDelProducto(tx, { grupoId: 1, proveedorId: 2, productoBaseId: 1358 });
  await guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358, fila: FILA,
  });
  assert.deepEqual(tx.llamadas.map((l) => l.op), ["updateMany", "upsert"]);
});

// ===========================================================================
// 3. EL VÍNCULO SE USA EN LA LISTA SIGUIENTE
// ===========================================================================

test("el vínculo recién guardado es el que machea en la próxima lista", async () => {
  // ── POR QUÉ EL FIXTURE SALE DEL ESCRITOR Y NO DE LA CABEZA ──────────────
  //
  // Lo que la próxima lista consulta es `ProductoCodigoProveedor` con
  // `activo: true` —lo hace `cargaErp.js`— y lo indexa con
  // `indexarCodigosProveedor`. Si acá se escribiera un vínculo "razonable" a
  // mano, el candado probaría que el índice funciona, que ya se sabe; lo que hay
  // que probar es que lo que ESTA función escribe es lo que ese índice acepta.
  //
  // Así que la fila que se indexa se ARMA CON LO QUE EL UPSERT MANDÓ.
  const tx = txQueAnota();
  await guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358, fila: FILA,
  });
  const { where, create } = tx.llamadas.find((l) => l.op === "upsert").args;

  const guardado = {
    id: 1,
    productoBaseId: create.productoBaseId,
    codigoInterno: where.codigo_interno_unico_por_proveedor.codigoInterno,
    descripcionProveedor: create.descripcionProveedor,
    activo: create.activo,
  };

  const indice = indexarCodigosProveedor([guardado]);
  const macheo = indice.exacto.get("4479");
  assert.ok(macheo, "la próxima lista tiene que encontrar el código 4479");
  assert.deepEqual(macheo.map((v) => v.productoBaseId), [1358]);
});

test("CONTRAPRUEBA: desactivado, el mismo vínculo NO machea", async () => {
  // Es la mitad que prueba que el candado de arriba afirma algo. Y es el
  // comportamiento de «No está en la lista»: el código se desactiva —no se
  // borra— y deja de machear el renglón equivocado.
  const tx = txQueAnota();
  await guardarCodigoDeLaFila(tx, {
    grupoId: 1, proveedorId: 2, productoBaseId: 1358, fila: FILA,
  });
  const { where, create } = tx.llamadas.find((l) => l.op === "upsert").args;

  const indice = indexarCodigosProveedor([
    {
      id: 1,
      productoBaseId: create.productoBaseId,
      codigoInterno: where.codigo_interno_unico_por_proveedor.codigoInterno,
      activo: false,
    },
  ]);
  assert.equal(indice.exacto.get("4479"), undefined);
  assert.ok(indice.inactivos.get("4479"), "tiene que quedar registrado como inactivo");
});

// ===========================================================================
// 4. La forma con la que se le habla al motor
// ===========================================================================

test("el producto llega al motor con los dos campos que deciden si se puede escribir", () => {
  // ── EL DEFECTO, CONTADO EN UNA LÍNEA ───────────────────────────────────
  //
  // «Buscarlo en la lista» armaba este objeto de memoria y le puso otros nombres
  // —`precioCosto` por `precioCostoActual`, `factor_pack` por `factorPack`— y se
  // olvidó `creadoEnLocalId` y `esCombo`. El motor recibió `creadoEnLocalId:
  // undefined`, concluyó que el local que opera no puede tocar el costo, y
  // escribió la fila como BLOQUEADO / SIN_PROPIEDAD_COSTO. Un veredicto
  // coherente sobre un dato que nunca llegó.
  const producto = {
    id: 1358, nombre: "PRODUCTO SIN LISTA 2 M Y F", precio_costo: 2000,
    factor_pack: 12, unidad_medida: "UN", modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null, creadoEnLocalId: 4, es_combo: false,
  };
  const paraElMotor = productoParaElMotor(producto);

  assert.equal(paraElMotor.creadoEnLocalId, 4);
  assert.equal(paraElMotor.esCombo, false);
  assert.equal(paraElMotor.precioCostoActual, 2000);
  assert.equal(paraElMotor.factorPack, 12);
  assert.equal(paraElMotor.unidadMedida, "UN");
});

test("el select le pide a la base TODO lo que el motor mira", () => {
  // El eslabón que faltaba: el objeto puede armarse bien y quedar con undefined
  // igual, si el `select` no trajo el campo. Los dos tienen que estar de acuerdo,
  // y por eso se comparan entre ellos y no contra una lista escrita a mano.
  for (const campo of ["creadoEnLocalId", "es_combo", "precio_costo", "factor_pack", "unidad_medida"]) {
    assert.equal(CAMPOS_PRODUCTO_PARA_EL_MOTOR[campo], true, `falta ${campo} en el select`);
  }
});

test("CONTRAPRUEBA: sin creadoEnLocalId el motor bloquea por propiedad del costo", () => {
  // ── ESTE CANDADO REPRODUCE EL DEFECTO CON LOS NÚMEROS QUE LO PRODUJERON ──
  //
  // Y el detalle que lo hace posible es el que costó entenderlo: el grupo no
  // tiene depósito asignado —`GrupoDeposito` está vacía— así que
  // `getDepositoIdDeGrupo` devuelve null. Con eso, `puedeTocarElCosto` trata un
  // `creadoEnLocalId` nulo como "es del depósito", no encuentra depósito, y no
  // hay dueño: bloquea. Con el valor puesto —el local 1, que es el que opera— el
  // dueño es ese local y no bloquea.
  //
  // O sea: el campo faltante no bloquea siempre, bloquea EN ESTE GRUPO. Con un
  // `depositoLocalId` inventado el candado pasaría en verde sin probar nada, que
  // es el defecto que este archivo entero existe para no repetir.
  const producto = {
    id: 1358, nombre: "PRODUCTO SIN LISTA 2 M Y F", precio_costo: 2000,
    factor_pack: 12, unidad_medida: "UN", modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null, creadoEnLocalId: 1, es_combo: false,
  };
  // ── LA CONFIG SALE DEL PARSER DE VERDAD, NO DE UN `{ recargoPct: 0 }` ────
  //
  // Escrita a mano, el primer intento no llevaba `precioBase` y el motor
  // contestó ERROR / PRECIO_INVALIDO: se cortaba ANTES del chequeo de propiedad
  // del costo, así que el candado habría afirmado el bloqueo equivocado. Es el
  // mismo defecto que este archivo defiende, cometido en el propio candado.
  //
  // Así que el parser se resuelve —GENERICO, el de la importación 22— y el
  // contexto se arma con `motorParaEstaLista`, la misma función que usan las
  // rutas. La cabecera son los valores reales de esa lista.
  const reg = resolverParserPorId("GENERICO");
  assert.ok(reg.ok, "el parser GENERICO tiene que existir");
  const { config, contexto } = motorParaEstaLista({
    cab: {
      id: 22, estado: "PARCIALMENTE_APLICADA", proveedorId: 2, parser: "GENERICO",
      recargoPct: 5, impuestoAdicionalPct: 0, modo: null,
      aumentoEsperadoMinPct: 2, aumentoEsperadoMaxPct: 15,
    },
    reg,
    grupoId: 1,
    operandoEnLocalId: 1,
    // null porque es lo que devuelve `getDepositoIdDeGrupo` en este grupo, no
    // porque quede cómodo. Ver el comentario de arriba.
    depositoLocalId: null,
  });
  const comun = {
    fila: filaParaElMotor(FILA, { vinculadoEn: new Date() }),
    indice: indexarCodigosProveedor([
      { id: 0, productoBaseId: 1358, codigoInterno: "4479", activo: true },
    ]),
    indiceBarra: indexarCodigosBarra([]),
    contexto,
    config,
  };

  const mutilado = { ...productoParaElMotor(producto), creadoEnLocalId: undefined };
  const malo = conciliarFila({
    ...comun,
    productosPorId: new Map([[1358, mutilado]]),
  });
  assert.equal(malo.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(malo.motivo, "SIN_PROPIEDAD_COSTO");

  // Y con el campo puesto, el motor YA NO bloquea por eso. Sin esta mitad, el
  // candado pasaría igual con un motor que bloquee siempre.
  const bueno = conciliarFila({
    ...comun,
    productosPorId: new Map([[1358, productoParaElMotor(producto)]]),
  });
  assert.notEqual(bueno.motivo, "SIN_PROPIEDAD_COSTO");
});

test("la cabecera viaja ENTERA al motor, no masticada", () => {
  // El motor le pregunta a `rangoDeLaFila` y a `modoDeImportacion`, que la leen
  // ellos. Armarle una cabecera "ya convertida" acá es adivinar qué va a leer, y
  // el rango de aumento esperado saldría de lo que uno creyó.
  const cab = {
    id: 22, estado: "PARCIALMENTE_APLICADA", proveedorId: 2, parser: "generico",
    recargoPct: 3, impuestoAdicionalPct: null, modo: "ACTUALIZAR",
    aumentoEsperadoMinPct: 5, aumentoEsperadoMaxPct: 12,
  };
  const { config, contexto } = motorParaEstaLista({
    cab, reg: { config: { pisoPrecioCreible: 1 } },
    grupoId: 1, operandoEnLocalId: 4, depositoLocalId: 1,
  });

  assert.equal(contexto.cabecera, cab, "la cabecera es la misma, no una copia recortada");
  assert.equal(contexto.operandoEnLocalId, 4);
  assert.equal(contexto.depositoLocalId, 1);
  assert.equal(config.recargoPct, 3);
  assert.equal(config.umbralVariacionPct, 12);
  assert.equal(config.pisoPrecioCreible, 1, "lo del parser no se pierde");
});

test("el select de la cabecera trae lo que el motor y la ruta necesitan", () => {
  for (const campo of ["modo", "aumentoEsperadoMinPct", "aumentoEsperadoMaxPct", "parser", "estado"]) {
    assert.equal(CAMPOS_CABECERA_PARA_EL_MOTOR[campo], true, `falta ${campo} en el select`);
  }
});

// ===========================================================================
// 5. La confirmación vieja no viaja
// ===========================================================================

test("la fila llega al motor SIN la confirmación ni el rango congelado", () => {
  // Si alguien había confirmado cómo se leía el precio, esa respuesta se tomó
  // cuando el renglón era de otro producto: otra unidad, otra cantidad, otro
  // precio. Arrastrarla haría que una decisión tomada sobre un producto
  // habilitara la escritura del costo de otro.
  const ahora = new Date("2026-09-18T12:00:00Z");
  const paraElMotor = filaParaElMotor(FILA, { vinculadoEn: ahora });

  assert.equal(paraElMotor.confirmadoEn, null);
  assert.equal(paraElMotor.aumentoEsperadoMinPct, null);
  assert.equal(paraElMotor.aumentoEsperadoMaxPct, null);
  assert.equal(paraElMotor.vinculadoEn, ahora);
  // Y lo que SÍ tiene que viajar: el renglón, con su precio y su presentación.
  assert.equal(paraElMotor.codigoNormalizado, "4479");
  assert.equal(paraElMotor.unidadesPorBulto, 12);
  assert.equal(paraElMotor.precioConIva, 2638.52);
});

// ===========================================================================
// 6. Las candidatas
// ===========================================================================

test("se ordenan por parecido al nombre DEL PRODUCTO", () => {
  // Contra el nombre del catálogo y no contra la descripción del renglón actual,
  // que es justamente la que se sospecha equivocada. Es lo que hace que "ala 800
  // lavado total con bica" encuentre "ALA PVO LAV MANO C BICARBONATO 24X800".
  const filas = [
    { id: 1, codigoCrudo: "1", descripcionProveedor: "AZUCAR LEDESMA 1KG", productoBaseId: null },
    { id: 2, codigoCrudo: "2", descripcionProveedor: "ALA PVO LAV MANO C BICARBONATO 24X800", productoBaseId: null },
    { id: 3, codigoCrudo: "3", descripcionProveedor: "FIDEOS MATARAZZO", productoBaseId: null },
  ];
  const items = candidatasConPuntaje({
    filas, nombreDelProducto: "ala 800 lavado total con bica",
  });
  assert.equal(items[0].id, 2, "la que se parece va primera");
  assert.equal(items.length, 3);
});

test("una fila tomada por OTRO producto lo dice, y la del propio producto no", () => {
  // No lo impide —puede ser que ESE sea el mal vinculado— pero la persona tiene
  // que verlo antes de decidir, no después.
  const filas = [
    {
      id: 10, codigoCrudo: "10", descripcionProveedor: "COSA A", productoBaseId: 999,
      productoBase: { id: 999, nombre: "OTRO PRODUCTO" },
    },
    {
      id: 11, codigoCrudo: "11", descripcionProveedor: "COSA B", productoBaseId: 1358,
      productoBase: { id: 1358, nombre: "EL MISMO" },
    },
  ];
  const items = candidatasConPuntaje({ filas, nombreDelProducto: "COSA", productoBaseId: 1358 });
  const porId = new Map(items.map((i) => [i.id, i]));
  assert.equal(porId.get(10).tomadaPor, "OTRO PRODUCTO");
  assert.equal(porId.get(11).tomadaPor, null, "estar tomada por el propio producto no es aviso");
});

test("«la que estaba» se marca solo cuando se vino de una fila", () => {
  // Desde «Buscarlo en la lista» no hay ninguna, y `filaActualId` es null. Sin
  // esta distinción, una fila con id null marcaría cualquier cosa.
  const filas = [{ id: 7, codigoCrudo: "7", descripcionProveedor: "X", productoBaseId: null }];
  assert.equal(candidatasConPuntaje({ filas, filaActualId: 7 })[0].laQueEstaba, true);
  assert.equal(candidatasConPuntaje({ filas, filaActualId: null })[0].laQueEstaba, false);
});

test("no se ofrecen más de TOPE_CANDIDATAS", () => {
  const filas = Array.from({ length: TOPE_CANDIDATAS + 15 }, (_, i) => ({
    id: i + 1, codigoCrudo: String(i + 1), descripcionProveedor: `COSA ${i}`, productoBaseId: null,
  }));
  assert.equal(candidatasConPuntaje({ filas, nombreDelProducto: "COSA" }).length, TOPE_CANDIDATAS);
});
