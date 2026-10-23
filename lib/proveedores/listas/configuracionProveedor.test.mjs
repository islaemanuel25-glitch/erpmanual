// LA CONFIGURACIÓN DE LISTAS POR PROVEEDOR: sin valores de fábrica.
//
// Cada candado de acá tiene su CONTRAPRUEBA: se ejerce el caso que lo activa y
// se comprueba que el resultado sea distinto. Un candado que solo mira el caso
// bueno acompaña, no afirma.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FALTA_CONFIGURACION,
  TEXTO_FALTA_CONFIGURACION,
  configuracionDeProveedor,
  faltantesDeConfiguracion,
  configuracionCompleta,
  configuracionParaLaLista,
  aplicarImpuestoAdicional,
  porcentajeValido,
  recargoODefault,
} from "@/lib/proveedores/listas/configuracionProveedor";
import { MODO_LISTA } from "@/lib/proveedores/listas/modoDeLaLista";

/** Un proveedor con todo cargado, tal como sale de Prisma. */
const completo = (extra = {}) => ({
  listaAumentoEsperadoMinPct: 5,
  listaAumentoEsperadoMaxPct: 8,
  listaRecargoPct: 5,
  listaImpuestoAdicionalPct: 0,
  listaImpuestosDefinidos: true,
  ...extra,
});

// ── SIN VALORES DE FÁBRICA ──────────────────────────────────────────────────

test("un proveedor recién creado no tiene configuración y no puede importar", () => {
  const config = configuracionDeProveedor({});
  assert.deepEqual(config, {
    minPct: null, maxPct: null, recargoPct: null,
    impuestoAdicionalPct: null, impuestosDefinidos: false,
  });
  assert.equal(configuracionCompleta(config), false);
  // Y dice TODO lo que falta de una, no el primero: el usuario tiene que poder
  // cargar todo junto, no descubrir el segundo faltante después de contestar el
  // primero. El recargo NO está: vacío vale 0 (decisión del 2026-10-23).
  assert.deepEqual(faltantesDeConfiguracion(config).sort(), [
    FALTA_CONFIGURACION.IMPUESTOS,
    FALTA_CONFIGURACION.RANGO,
  ].sort());
});

test("CONTRAPRUEBA: con todo cargado no falta nada", () => {
  const config = configuracionDeProveedor(completo());
  assert.deepEqual(faltantesDeConfiguracion(config), []);
  assert.equal(configuracionCompleta(config), true);
});

test("cada faltante tiene un texto que dice qué hacer, sin jerga", () => {
  for (const clave of Object.values(FALTA_CONFIGURACION)) {
    const texto = TEXTO_FALTA_CONFIGURACION[clave];
    assert.ok(texto, `falta el texto de ${clave}`);
    assert.match(texto, /^Falta /, "el texto tiene que decir qué falta");
    assert.ok(!/pct|Pct|factor_pack|UxBU/.test(texto), `${clave} usa jerga del motor`);
  }
});

// ── EL BOOLEANO DE IMPUESTOS NO SE DERIVA DEL PORCENTAJE ────────────────────

test("cero por ciento CONTESTADO está completo; cero sin contestar, no", () => {
  // Es la lección del `total` obligatorio del lector de comprobantes: lo que
  // puede faltar se pregunta aparte, con un booleano que no se pueda derivar de
  // los otros datos.
  const contestado = configuracionDeProveedor(completo({
    listaImpuestoAdicionalPct: 0, listaImpuestosDefinidos: true,
  }));
  assert.deepEqual(faltantesDeConfiguracion(contestado), []);

  const sinContestar = configuracionDeProveedor(completo({
    listaImpuestoAdicionalPct: 0, listaImpuestosDefinidos: false,
  }));
  assert.deepEqual(faltantesDeConfiguracion(sinContestar), [FALTA_CONFIGURACION.IMPUESTOS]);
});

test("decir que SÍ hay impuestos sin decir cuánto sigue estando incompleto", () => {
  const config = configuracionDeProveedor(completo({
    listaImpuestoAdicionalPct: null, listaImpuestosDefinidos: true,
  }));
  assert.deepEqual(faltantesDeConfiguracion(config), [FALTA_CONFIGURACION.IMPUESTOS]);
});

// ── EL RANGO ────────────────────────────────────────────────────────────────

test("un rango dado vuelta no es un rango", () => {
  const config = configuracionDeProveedor(completo({
    listaAumentoEsperadoMinPct: 20, listaAumentoEsperadoMaxPct: 5,
  }));
  assert.deepEqual(faltantesDeConfiguracion(config), [FALTA_CONFIGURACION.RANGO]);
});

test("medio rango tampoco: o los dos o ninguno", () => {
  const config = configuracionDeProveedor(completo({ listaAumentoEsperadoMaxPct: null }));
  assert.deepEqual(faltantesDeConfiguracion(config), [FALTA_CONFIGURACION.RANGO]);
});

test("un rango con el mínimo igual al máximo vale: es un aumento exacto", () => {
  const config = configuracionDeProveedor(completo({
    listaAumentoEsperadoMinPct: 7, listaAumentoEsperadoMaxPct: 7,
  }));
  assert.deepEqual(faltantesDeConfiguracion(config), []);
});

// ── LO DE LA LISTA PISA AL PROVEEDOR, PERO NO LO REESCRIBE ──────────────────

test("lo que se escribe en la pantalla vale SOLO para esta lista", () => {
  const proveedor = completo();
  const r = configuracionParaLaLista(proveedor, { minPct: 12, maxPct: 18 });

  assert.equal(r.ok, true);
  assert.equal(r.config.minPct, 12, "manda lo de la pantalla");
  assert.equal(r.config.maxPct, 18);
  assert.equal(r.config.recargoPct, 5, "lo que no se tocó sigue siendo del proveedor");

  // CONTRAPRUEBA: el objeto del proveedor quedó intacto. Si esta función lo
  // mutara, subir una lista con un rango distinto reescribiría el criterio de
  // todos los meses siguientes sin que nadie lo pida.
  assert.equal(proveedor.listaAumentoEsperadoMinPct, 5);
  assert.equal(proveedor.listaAumentoEsperadoMaxPct, 8);
});

test("sin sobrescritura manda el proveedor tal cual", () => {
  const r = configuracionParaLaLista(completo(), {});
  assert.equal(r.ok, true);
  assert.equal(r.config.minPct, 5);
  assert.equal(r.config.maxPct, 8);
});

test("un proveedor sin configurar no se completa con la nada, y lo dice", () => {
  const r = configuracionParaLaLista({}, {});
  assert.equal(r.ok, false);
  assert.ok(r.faltan.includes(FALTA_CONFIGURACION.RANGO));

  // CONTRAPRUEBA: cargando lo que falta desde la pantalla, la misma lista SÍ se
  // puede conciliar aunque el proveedor siga vacío. Es el caso de la primera vez.
  const conDatos = configuracionParaLaLista({}, {
    minPct: 5, maxPct: 8, recargoPct: 5, impuestoAdicionalPct: 0, impuestosDefinidos: true,
  });
  assert.equal(conDatos.ok, true);
  assert.equal(conDatos.config.minPct, 5);
});

test("no mandar el sí/no de impuestos NO lo borra: lo deja como está el proveedor", () => {
  // Si `undefined` se leyera como false, subir una lista sin tocar el campo
  // borraría la respuesta del proveedor y volvería a preguntar para siempre.
  const r = configuracionParaLaLista(completo(), { minPct: 6 });
  assert.equal(r.ok, true);
  assert.equal(r.config.impuestosDefinidos, true);

  // CONTRAPRUEBA: mandarlo en false SÍ lo cambia.
  const apagado = configuracionParaLaLista(completo(), { impuestosDefinidos: false });
  assert.equal(apagado.ok, false);
  assert.ok(apagado.faltan.includes(FALTA_CONFIGURACION.IMPUESTOS));
});

// ── EL IMPUESTO ADICIONAL ───────────────────────────────────────────────────

test("el impuesto adicional se suma sobre el costo", () => {
  assert.equal(aplicarImpuestoAdicional(1000, 3), 1030);
});

test("sin impuesto el costo NO pasa por una multiplicación por 1", () => {
  // Multiplicar por 1 parece inofensivo y mete error de redondeo donde no hay
  // nada que sumar. Se devuelve el mismo número, idéntico.
  const costo = 1404.602001;
  assert.equal(aplicarImpuestoAdicional(costo, 0), costo);
  assert.equal(aplicarImpuestoAdicional(costo, null), costo);
});

test("UN PORCENTAJE DA LO MISMO POR UNIDAD QUE POR PACK", () => {
  // Es el motivo por el que la pantalla NO ofrece elegir entre "por unidad" y
  // "por pack": con un porcentaje las dos cuentas dan el mismo número, porque el
  // porcentaje escala con el importe. La distinción recién importaría con un
  // impuesto de tantos PESOS por unidad, que es otra cosa y hoy no existe.
  const precio = 1000;
  const unidades = 12;
  const imp = 3;

  const porPack = aplicarImpuestoAdicional(precio * unidades, imp);
  const porUnidad = aplicarImpuestoAdicional(precio, imp) * unidades;

  assert.equal(porPack, porUnidad);
});

// ── CONTROLAR NO PIDE RANGO ─────────────────────────────────────────────────

test("SIN RANGO NO SE PUEDE ACTUALIZAR, PERO SÍ CONTROLAR", () => {
  // Es el caso del proveedor nuevo: todavía nadie cargó cuánto suele aumentar, y
  // lo primero que uno quiere hacer con su lista es justamente MIRAR si coincide
  // con los costos. Exigir el rango para eso sería una puerta cerrada a cambio
  // de un dato que el modo controlar no usa para nada.
  const sinRango = configuracionDeProveedor(completo({
    listaAumentoEsperadoMinPct: null,
    listaAumentoEsperadoMaxPct: null,
  }));

  assert.deepEqual(faltantesDeConfiguracion(sinRango), [FALTA_CONFIGURACION.RANGO]);
  assert.deepEqual(
    faltantesDeConfiguracion(sinRango, { modo: MODO_LISTA.CONTROLAR }),
    [],
    "controlar no necesita el rango"
  );
  assert.deepEqual(
    faltantesDeConfiguracion(sinRango, { modo: MODO_LISTA.ACTUALIZAR }),
    [FALTA_CONFIGURACION.RANGO],
    "actualizar sí lo necesita"
  );
});

test("CONTROLAR SIGUE EXIGIENDO LOS IMPUESTOS", () => {
  // No es una inconsistencia con el de arriba: el impuesto cambia el número
  // CONTRA EL QUE SE COMPARA. (El recargo vacío vale 0: ver el candado de abajo.)
  const sinImpuestos = configuracionDeProveedor(completo({ listaImpuestosDefinidos: false }));
  assert.ok(
    faltantesDeConfiguracion(sinImpuestos, { modo: MODO_LISTA.CONTROLAR })
      .includes(FALTA_CONFIGURACION.IMPUESTOS)
  );
});

test("el modo llega desde `configuracionParaLaLista`, que es por donde entra la ruta", () => {
  // CONTRA EL PARÁMETRO QUE NO SE PASA. La ruta no llama a
  // `faltantesDeConfiguracion` directo: llama a ésta. Si el modo se perdiera en
  // el camino, los dos candados de arriba seguirían verdes y la pantalla
  // seguiría pidiendo el rango para controlar.
  const proveedor = completo({ listaAumentoEsperadoMinPct: null, listaAumentoEsperadoMaxPct: null });

  assert.equal(configuracionParaLaLista(proveedor, {}).ok, false);
  assert.equal(
    configuracionParaLaLista(proveedor, { modo: MODO_LISTA.CONTROLAR }).ok,
    true,
    "el modo no llegó hasta faltantesDeConfiguracion"
  );
});

// ── EL RECARGO VACÍO ES 0 Y NO BLOQUEA ──────────────────────────────────────
//
// Pasó con Dab (2026-10-23): el campo mostraba un "0" de marca de agua, estaba
// vacío, y la lectura se frenaba con "falta el recargo". Se decidió que vacío
// sea 0. La forma del dato es la real: la pantalla manda `String(null)` o ""
// por FormData, y la ficha llega con `listaRecargoPct: null`.

test("RECARGO VACÍO = 0 Y NO BLOQUEA, en ningún modo", () => {
  const proveedor = completo({ listaRecargoPct: null });
  for (const vacio of [undefined, null, "", "null"]) {
    for (const modo of [undefined, MODO_LISTA.ACTUALIZAR, MODO_LISTA.CONTROLAR]) {
      const r = configuracionParaLaLista(proveedor, { recargoPct: vacio, modo });
      assert.equal(r.ok, true, `bloqueó con recargo ${JSON.stringify(vacio)} en modo ${modo}`);
      assert.equal(r.config.recargoPct, 0, "el vacío tiene que llegar al motor como 0");
    }
  }
  assert.deepEqual(faltantesDeConfiguracion({ ...configuracionDeProveedor(proveedor) }), []);
  assert.equal(recargoODefault(""), 0);
  assert.equal(recargoODefault(null), 0);
  assert.equal(recargoODefault("7.5"), 7.5);
});

test("CONTRAPRUEBA: el recargo de la ficha se respeta, y un número absurdo sí frena", () => {
  const r = configuracionParaLaLista(completo({ listaRecargoPct: 5 }), { recargoPct: "" });
  assert.equal(r.config.recargoPct, 5, "vacío en la pantalla no pisa la ficha");
  const absurdo = configuracionParaLaLista(completo(), { recargoPct: 5000 });
  assert.equal(absurdo.ok, false);
  assert.deepEqual(absurdo.faltan, [FALTA_CONFIGURACION.RECARGO]);
});

test("un porcentaje válido no es cualquier número", () => {
  assert.equal(porcentajeValido(0), true);
  assert.equal(porcentajeValido(5), true);
  assert.equal(porcentajeValido(1000), true);
  assert.equal(porcentajeValido(1001), false, "mil uno es un error de tipeo, no un recargo");
  assert.equal(porcentajeValido(-1), false);
  assert.equal(porcentajeValido(null), false);
  assert.equal(porcentajeValido(""), false);
  assert.equal(porcentajeValido("cinco"), false);
});
