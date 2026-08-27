// EL CONOCIMIENTO COMPARTIDO DEL PROVEEDOR.
//
// Lo que se afirma acá es que Listas de precios y Facturas escriben y leen LA
// MISMA cosa, con la misma procedencia y la misma presentación. Todos los datos
// son sintéticos.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CERTEZA,
  METODO_DETECCION,
  ORIGEN_ALTA,
  claveDeAlias,
  datosDeActualizacion,
  factorDeConversion,
  filasDeIdentidad,
  nivelDeCerteza,
  presentacionesDe,
  puedePisar,
} from "./servicioIdentidad.js";

const AHORA = new Date("2026-08-27T10:00:00.000Z");

const identidad = (extra = {}) => ({
  grupoId: 3,
  proveedorId: 9,
  productoBaseId: 700,
  codigoProveedor: "001-234",
  descripcionProveedor: "GANCIA X6",
  metodoDeteccion: METODO_DETECCION.APROXIMADO,
  ...extra,
});

// ── EL APRENDIZAJE VIAJA EN LOS DOS SENTIDOS ──────────────────────────────

test("COMPARTIDO 1. lo confirmado en Listas aparece en Facturas", () => {
  // Listas confirma a mano.
  const [porCodigo, porAlias] = filasDeIdentidad(
    identidad({
      metodoDeteccion: METODO_DETECCION.MANUAL,
      confirmadaPorUsuarioId: 12,
      confirmadaEn: AHORA,
      presentacionProveedor: "x6",
      unidadesPorPresentacion: 6,
    })
  );

  // Facturas lee EXACTAMENTE esas filas: no hay una tabla por módulo.
  for (const fila of [porCodigo, porAlias]) {
    assert.equal(fila.productoBaseId, 700);
    assert.equal(nivelDeCerteza(fila), CERTEZA.CONFIRMADA_USUARIO);
    assert.equal(fila.presentacionProveedor, "x6");
    assert.equal(fila.unidadesPorPresentacion, 6);
  }
  assert.equal(porCodigo.codigoInterno, "001234");
  assert.equal(porAlias.codigoInterno, "TXT:gancia x6");
});

test("COMPARTIDO 2. lo confirmado en Facturas aparece en Listas", () => {
  // Es el mismo servicio: lo que cambia es quién llama. Que la afirmación sea
  // simétrica es el punto — si hubiera dos caminos, este candado sería falso.
  const desdeFactura = filasDeIdentidad(
    identidad({
      descripcionProveedor: "GANCIA X6 AMERICANO",
      confirmadaPorUsuarioId: 44,
      confirmadaEn: AHORA,
      unidadesPorPresentacion: 6,
    })
  );
  assert.ok(desdeFactura.length >= 1);
  for (const fila of desdeFactura) {
    assert.equal(nivelDeCerteza(fila), CERTEZA.CONFIRMADA_USUARIO);
    assert.equal(fila.confirmadaPorUsuarioId, 44);
    assert.equal(fila.unidadesPorPresentacion, 6);
  }
});

test("COMPARTIDO 3. la presentación y el factor se comparten y el factor NO se guarda", () => {
  const [fila] = filasDeIdentidad(
    identidad({ presentacionProveedor: "x6", unidadesPorPresentacion: 6 })
  );
  // Lo que se persiste son las unidades del proveedor, nunca el factor.
  assert.equal(fila.unidadesPorPresentacion, 6);
  assert.ok(!("factor" in fila), "el factor se guardó y se va a pudrir");
  assert.ok(!("factorConversion" in fila));

  // El factor sale de dividir contra el producto del ERP, cada vez.
  const p = presentacionesDe({ vinculo: fila, productoBase: { factor_pack: 24, unidad_medida: "pack" } });
  assert.equal(p.unidadesProveedor, 6);
  assert.equal(p.unidadesErp, 24);
  assert.equal(p.factor, 4, "24 ÷ 6 no dio 4");
  assert.equal(p.erp, "Pack x24");
  assert.equal(p.proveedor, "x6");

  // Y si mañana el pack del ERP pasa a 12, el factor acompaña solo.
  const cambiado = presentacionesDe({ vinculo: fila, productoBase: { factor_pack: 12, unidad_medida: "pack" } });
  assert.equal(cambiado.factor, 2, "un factor guardado habría seguido diciendo 4");
});

test("CONVERSIÓN. sin uno de los dos lados el factor es NULL, nunca 1", () => {
  // Un 1 por omisión escribiría el precio del x6 como si fuera el del pack.
  assert.equal(factorDeConversion({ unidadesPorPresentacion: null, factorPackErp: 24 }), null);
  assert.equal(factorDeConversion({ unidadesPorPresentacion: 6, factorPackErp: null }), null);
  assert.equal(factorDeConversion({ unidadesPorPresentacion: 0, factorPackErp: 24 }), null);
  assert.equal(factorDeConversion({ unidadesPorPresentacion: 6, factorPackErp: 24 }), 4);
});

// ── UNA CORRECCIÓN NO DEJA DOS ASOCIACIONES VIGENTES ──────────────────────

test("COMPARTIDO 4. corregir reescribe TODAS las claves de ese renglón", () => {
  // El renglón trae código Y descripción, así que dejó dos filas. Corregir el
  // producto tiene que mover las dos: si moviera una sola, el próximo documento
  // sin código volvería al producto viejo.
  const antes = filasDeIdentidad(identidad({ productoBaseId: 700 }));
  const despues = filasDeIdentidad(
    identidad({ productoBaseId: 999, confirmadaPorUsuarioId: 7, confirmadaEn: AHORA })
  );
  assert.equal(antes.length, 2);
  assert.equal(despues.length, 2);
  assert.deepEqual(
    antes.map((f) => f.codigoInterno).sort(),
    despues.map((f) => f.codigoInterno).sort(),
    "la corrección no cubre las mismas claves: quedaría una apuntando al producto viejo"
  );
  for (const f of despues) assert.equal(f.productoBaseId, 999);
});

test("COMPARTIDO 4bis. la corrección humana pisa la deducción", () => {
  const existente = {
    productoBaseId: 700,
    origenAlta: ORIGEN_ALTA.APLICACION_AUTOMATICA,
    metodoDeteccion: METODO_DETECCION.APROXIMADO,
    confirmadaEn: null,
  };
  const [entrante] = filasDeIdentidad(
    identidad({ productoBaseId: 999, confirmadaPorUsuarioId: 7, confirmadaEn: AHORA })
  );
  const r = datosDeActualizacion({ existente, entrante });
  assert.equal(r.actualizar, true);
  assert.equal(r.motivo, "CORRECCION_HUMANA");
  assert.equal(r.data.productoBaseId, 999);
  assert.equal(r.data.confirmadaPorUsuarioId, 7);
});

test("UNA DEDUCCIÓN NO PISA UNA CONFIRMACIÓN HUMANA", () => {
  // Es la regla que hace que compartir el conocimiento no sea peligroso: si el
  // motor pudiera reescribir lo que alguien confirmó, cada documento nuevo
  // tendría la chance de deshacer una decisión humana en silencio, y desde el
  // otro módulo.
  const existente = {
    productoBaseId: 700,
    origenAlta: ORIGEN_ALTA.VINCULACION_MANUAL,
    confirmadaPorUsuarioId: 12,
    confirmadaEn: AHORA,
  };
  const [entrante] = filasDeIdentidad(identidad({ productoBaseId: 999 }));
  const r = datosDeActualizacion({ existente, entrante });
  assert.equal(r.actualizar, false, "una deducción pisó una confirmación");
  assert.equal(r.motivo, "CONFIRMADA_NO_SE_PISA_CON_DEDUCCION");
  assert.equal(r.data, null);
});

test("LA CONFIRMACIÓN Y SU AUTORÍA NO SE PIERDEN AL RELEER UN DOCUMENTO", () => {
  // Mismo producto, entrante sin confirmar: se actualizan los datos, pero quién
  // decidió queda.
  const existente = {
    productoBaseId: 700,
    origenAlta: ORIGEN_ALTA.VINCULACION_MANUAL,
    confirmadaPorUsuarioId: 12,
    confirmadaEn: AHORA,
    presentacionProveedor: "x6",
    unidadesPorPresentacion: 6,
  };
  const [entrante] = filasDeIdentidad(identidad({ productoBaseId: 700 }));
  const r = datosDeActualizacion({ existente, entrante });
  assert.equal(r.actualizar, true);
  assert.equal(r.data.confirmadaPorUsuarioId, 12, "se borró quién lo confirmó");
  assert.equal(r.data.confirmadaEn, AHORA);
  assert.equal(r.data.origenAlta, ORIGEN_ALTA.VINCULACION_MANUAL);
  // Y la presentación que el documento no trae tampoco se borra.
  assert.equal(r.data.unidadesPorPresentacion, 6, "un documento mudo borró el armado confirmado");
});

// ── LA PROCEDENCIA NO SE INVENTA ──────────────────────────────────────────

test("COMPARTIDO 5. una inferencia automática NUNCA se registra como manual", () => {
  // ── EL DEFECTO QUE ESTO CIERRA ──────────────────────────────────────────
  //
  // `aliasAEscribir` tenía "VINCULACION_MANUAL" escrito adentro, así que TODA
  // línea guardaba su alias como si una persona lo hubiera elegido — incluidas
  // las que el motor vinculó solo por terminación de código, que son justo las
  // que hay que poder revocar el día que salgan mal.
  for (const metodo of [
    METODO_DETECCION.APROXIMADO,
    METODO_DETECCION.CODIGO_EXACTO,
    METODO_DETECCION.ALIAS_CONFIRMADO,
    METODO_DETECCION.NOMBRE_EXACTO,
  ]) {
    const filas = filasDeIdentidad(identidad({ metodoDeteccion: metodo }));
    for (const f of filas) {
      assert.notEqual(
        f.origenAlta,
        ORIGEN_ALTA.VINCULACION_MANUAL,
        `una deducción por ${metodo} se guardó como manual`
      );
      assert.equal(f.origenAlta, ORIGEN_ALTA.APLICACION_AUTOMATICA);
      assert.equal(f.confirmadaEn, null);
      assert.equal(f.confirmadaPorUsuarioId, null);
    }
  }
});

test("MEDIA CONFIRMACIÓN NO ES UNA CONFIRMACIÓN", () => {
  // Con usuario y sin fecha, o al revés, no alcanza: la autoría de una decisión
  // necesita las dos mitades o no se puede auditar.
  const soloUsuario = filasDeIdentidad(identidad({ confirmadaPorUsuarioId: 5, confirmadaEn: null }));
  const soloFecha = filasDeIdentidad(identidad({ confirmadaPorUsuarioId: null, confirmadaEn: AHORA }));
  for (const f of [...soloUsuario, ...soloFecha]) {
    assert.equal(f.origenAlta, ORIGEN_ALTA.APLICACION_AUTOMATICA);
    assert.equal(f.confirmadaEn, null);
  }
});

test("COMPARTIDO 6. los cuatro niveles se distinguen", () => {
  assert.equal(
    nivelDeCerteza({ confirmadaEn: AHORA, metodoDeteccion: METODO_DETECCION.APROXIMADO }),
    CERTEZA.CONFIRMADA_USUARIO,
    "una deducción confirmada después no cuenta como confirmada"
  );
  assert.equal(
    nivelDeCerteza({ origenAlta: ORIGEN_ALTA.VINCULACION_MANUAL }),
    CERTEZA.CONFIRMADA_USUARIO
  );
  assert.equal(
    nivelDeCerteza({ origenAlta: ORIGEN_ALTA.APLICACION_AUTOMATICA, metodoDeteccion: METODO_DETECCION.CODIGO_EXACTO }),
    CERTEZA.EXACTA
  );
  assert.equal(
    nivelDeCerteza({ origenAlta: ORIGEN_ALTA.APLICACION_AUTOMATICA, metodoDeteccion: METODO_DETECCION.ALIAS_CONFIRMADO }),
    CERTEZA.EXACTA
  );
  assert.equal(
    nivelDeCerteza({ origenAlta: ORIGEN_ALTA.APLICACION_AUTOMATICA, metodoDeteccion: METODO_DETECCION.APROXIMADO }),
    CERTEZA.INFERIDA
  );
  // Sin vínculo no hay asociación: es una sugerencia, y no se persiste.
  assert.equal(nivelDeCerteza(null), CERTEZA.SUGERENCIA);
  // Los vínculos anteriores a la columna quedan en el nivel más bajo, no en el
  // más alto: no consta por dónde entraron.
  assert.equal(nivelDeCerteza({ origenAlta: null, metodoDeteccion: null }), CERTEZA.INFERIDA);
});

// ── LOS BORDES ────────────────────────────────────────────────────────────

test("sin código NI descripción no se guarda nada", () => {
  assert.deepEqual(filasDeIdentidad(identidad({ codigoProveedor: null, descripcionProveedor: null })), []);
  assert.deepEqual(filasDeIdentidad(identidad({ codigoProveedor: "  ", descripcionProveedor: "" })), []);
});

test("sin producto no se guarda nada", () => {
  assert.deepEqual(filasDeIdentidad(identidad({ productoBaseId: null })), []);
  assert.deepEqual(filasDeIdentidad(identidad({ grupoId: null })), []);
});

test("una descripción sin código deja UNA sola fila, la del alias", () => {
  const filas = filasDeIdentidad(identidad({ codigoProveedor: null }));
  assert.equal(filas.length, 1);
  assert.equal(filas[0].codigoInterno, "TXT:gancia x6");
  assert.equal(filas[0].descripcionNormalizada, "gancia x6");
});

test("el alias se normaliza: acentos, mayúsculas y espacios no crean dos memorias", () => {
  assert.equal(claveDeAlias("  CAFÉ   La  Virginia  "), claveDeAlias("cafe la virginia"));
});

test("PUEDE PISAR. una fila nueva siempre entra", () => {
  const r = puedePisar({ existente: null, entrante: { productoBaseId: 1 } });
  assert.equal(r.pisa, true);
  assert.equal(r.motivo, "NUEVA");
});
