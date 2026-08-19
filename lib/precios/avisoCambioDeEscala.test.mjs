// EL AVISO DE CAMBIO DE ESCALA, CON EL CASO QUE LO ORIGINÓ.
//
// El 2026-08-01 se convirtió "Pechuga Rebozada Sadia X 3kg" de producto por
// unidad a fiambre de pieza fija de 3 kg. Su precio, 36.900, era el de la unidad
// —una pechuga entera— y pasó a leerse como precio POR KILO sin que nadie lo
// dividiera. Tres de las cinco ubicaciones siguen así.
//
// Estos candados afirman que ese cambio produce un aviso con el número correcto.

import test from "node:test";
import assert from "node:assert/strict";

import {
  factorDeConversion,
  avisoDeCambioDeEscala,
  diagnosticarMargen,
  DIAGNOSTICO,
} from "./avisoCambioDeEscala.js";

// Fichas reales, antes y después de la edición del 2026-08-01.
const PECHUGA_ANTES = {
  unidad_medida: "unidad", factor_pack: null,
  pesoReferenciaKg: null, pesoEsFijo: false, modoVentaDeposito: "PESO",
};
const PECHUGA_DESPUES = {
  unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 3, pesoEsFijo: true, modoVentaDeposito: "PIEZA",
};

test("1. el caso real: pasar a pieza fija de 3 kg divide el precio por 3", () => {
  const { factor, motivo } = factorDeConversion(PECHUGA_ANTES, PECHUGA_DESPUES);
  assert.equal(motivo, "PASA_A_PIEZA_FIJA");
  // 36.900 era el precio de la pieza; por kilo son 12.300.
  assert.equal(Number((36900 * factor).toFixed(2)), 12300);
});

test("2. y el aviso dice en QUÉ ubicaciones y con qué número", () => {
  // Las cinco ubicaciones reales. Dos ya fueron corregidas a mano a 12.300 —eso
  // pasa, y por eso esto avisa en vez de convertir solo: una conversión
  // automática las habría vuelto a dividir, dejándolas en 4.100.
  const aviso = avisoDeCambioDeEscala({
    antes: PECHUGA_ANTES,
    despues: PECHUGA_DESPUES,
    ubicaciones: [
      { localId: 1, nombre: "depo", precioVenta: 36900 },
      { localId: 2, nombre: "mini el 7", precioVenta: 12300 },
      { localId: 3, nombre: "Minimarket ayala", precioVenta: 36900 },
      { localId: 4, nombre: "Casiano casas", precioVenta: 12300 },
      { localId: 5, nombre: "Mini unidas", precioVenta: 36900 },
    ],
  });

  assert.equal(aviso.motivo, "PASA_A_PIEZA_FIJA");
  assert.equal(aviso.ubicaciones.length, 5);

  const depo = aviso.ubicaciones.find((u) => u.localId === 1);
  assert.equal(depo.precioActual, 36900);
  assert.equal(depo.precioSugerido, 12300);

  // La que ya está corregida TAMBIÉN aparece, con su número. No se decide por la
  // persona cuál está bien: se le muestran las cinco y elige.
  const mini = aviso.ubicaciones.find((u) => u.localId === 2);
  assert.equal(mini.precioActual, 12300);
  assert.equal(mini.precioSugerido, 4100);
});

test("3. salir de pieza fija multiplica, no divide", () => {
  const { factor, motivo } = factorDeConversion(PECHUGA_DESPUES, PECHUGA_ANTES);
  assert.equal(motivo, "DEJA_DE_SER_PIEZA_FIJA");
  assert.equal(Number((12300 * factor).toFixed(2)), 36900);
});

test("4. EL FACTOR DE PACK: un bulto de 12 que pasa a 24 vale el doble", () => {
  // Hoy no hay ningún producto descalzado por esto —medido, cero sobre 2.383—
  // pero el mecanismo es el mismo y el día que pase no habría con qué darse
  // cuenta.
  const { factor, motivo } = factorDeConversion(
    { unidad_medida: "pack", factor_pack: 12 },
    { unidad_medida: "pack", factor_pack: 24 }
  );
  assert.equal(motivo, "CAMBIA_FACTOR_DE_PACK");
  assert.equal(Number((1000 * factor).toFixed(2)), 2000);
});

test("5. dejar de ser bulto baja el precio al unitario", () => {
  const { factor, motivo } = factorDeConversion(
    { unidad_medida: "pack", factor_pack: 24 },
    { unidad_medida: "unidad", factor_pack: null }
  );
  assert.equal(motivo, "DEJA_DE_SER_BULTO");
  assert.equal(Number((24000 * factor).toFixed(2)), 1000);
});

test("6. sin cambio de escala NO hay aviso", () => {
  // El caso más transitado: se edita el nombre o el costo y la escala no se
  // toca. Si esto avisara, el aviso se volvería ruido y se leería salteado.
  assert.equal(factorDeConversion(PECHUGA_DESPUES, PECHUGA_DESPUES).motivo, null);
  assert.equal(
    avisoDeCambioDeEscala({
      antes: PECHUGA_DESPUES,
      despues: PECHUGA_DESPUES,
      ubicaciones: [{ localId: 1, precioVenta: 12300 }],
    }),
    null
  );
});

test("7. cambiar el PESO de la pieza no descalza el precio", () => {
  // El precio sigue guardado por kilo: lo que cambia es cuánto pesa una pieza, y
  // el precio por pieza lo deriva el sistema. Avisar acá sería un falso positivo.
  const { motivo } = factorDeConversion(
    { unidad_medida: "kg", pesoReferenciaKg: 3, pesoEsFijo: true, modoVentaDeposito: "PIEZA" },
    { unidad_medida: "kg", pesoReferenciaKg: 4, pesoEsFijo: true, modoVentaDeposito: "PIEZA" }
  );
  assert.equal(motivo, null);
});

test("8. un cambio de unidad SIN equivalencia avisa, y NO inventa un número", () => {
  // "unidad" → "kg" sin pieza fija: el precio de una unidad y el de un kilo no
  // tienen ninguna relación que el sistema pueda conocer. Inventar una acá sería
  // exactamente el error que esto viene a evitar.
  const aviso = avisoDeCambioDeEscala({
    antes: { unidad_medida: "unidad" },
    despues: { unidad_medida: "kg" },
    ubicaciones: [{ localId: 1, nombre: "depo", precioVenta: 5000 }],
  });
  assert.equal(aviso.motivo, "CAMBIA_UNIDAD_SIN_EQUIVALENCIA");
  assert.equal(aviso.factor, null);
  assert.equal(aviso.ubicaciones[0].precioSugerido, null, "no se sugiere número donde no hay equivalencia");
  assert.equal(aviso.ubicaciones[0].precioActual, 5000, "pero sí se dice cuál es el precio que queda mal");
});

test("9. pasar a pieza fija SIN peso cargado avisa igual, sin número", () => {
  const aviso = avisoDeCambioDeEscala({
    antes: PECHUGA_ANTES,
    despues: { unidad_medida: "kg", pesoEsFijo: true, modoVentaDeposito: "PIEZA", pesoReferenciaKg: null },
    ubicaciones: [{ localId: 1, precioVenta: 36900 }],
  });
  // Sin peso el producto todavía no es "pieza fija" para el sistema, así que lo
  // que se detecta es el cambio de unidad. Avisa igual: es lo importante.
  assert.ok(aviso, "un cambio de unidad sin peso tiene que avisar igual");
  assert.equal(aviso.ubicaciones[0].precioSugerido, null);
});

test("10. una ubicación sin precio no genera ruido", () => {
  const aviso = avisoDeCambioDeEscala({
    antes: PECHUGA_ANTES,
    despues: PECHUGA_DESPUES,
    ubicaciones: [
      { localId: 1, nombre: "depo", precioVenta: 36900 },
      { localId: 9, nombre: "sin precio", precioVenta: 0 },
      { localId: 10, nombre: "nulo", precioVenta: null },
    ],
  });
  assert.equal(aviso.ubicaciones.length, 1, "solo se avisa por las ubicaciones que tienen precio cargado");
});

test("11. el precio llega como Decimal de Prisma —string— y se convierte igual", () => {
  const aviso = avisoDeCambioDeEscala({
    antes: PECHUGA_ANTES,
    despues: PECHUGA_DESPUES,
    ubicaciones: [{ localId: 1, precioVenta: "36900.00" }],
  });
  assert.equal(aviso.ubicaciones[0].precioSugerido, 12300);
});

// ── EL DIAGNÓSTICO POR MARGEN IMPLÍCITO ──────────────────────────────────────
//
// Todas las fichas son de producción, medidas el 2026-08-19.

test("13. los CUATRO descalzados reales salen marcados, con su número", () => {
  const casos = [
    { nombre: "Pechuga Rebozada Sadia X 3kg", precioCosto: 9453, precioVenta: 36900, pesoReferenciaKg: 3, sugerido: 12300 },
    { nombre: "GRANIX BALONCITOS CHOCOLATE 3KG", precioCosto: 5692, precioVenta: 22200, pesoReferenciaKg: 3, sugerido: 7400 },
    { nombre: "GRANIX BOCADITO FRUTILLA 2KG", precioCosto: 7130, precioVenta: 18600, pesoReferenciaKg: 2, sugerido: 9300 },
    { nombre: "MANI CON CASCARA X2KG", precioCosto: 4500, precioVenta: 11200, pesoReferenciaKg: 2, sugerido: 5600 },
  ];
  for (const c of casos) {
    const r = diagnosticarMargen(c);
    assert.equal(r.diagnostico, DIAGNOSTICO.POR_PESO, `${c.nombre} dejó de marcarse`);
    assert.equal(r.sugerido, c.sugerido, `${c.nombre}: número sugerido equivocado`);
  }
});

test("14. EL REPARO: un margen alto que NO se explica por escala no se marca", () => {
  // Éste es el candado que hace que el control sirva. Son 116 productos activos
  // con margen alto legítimo; marcarlos sería ruido, y un control que siempre
  // devuelve ruido se lee salteado.
  //
  // Ratio 3,0 con peso 3 SÍ se explicaría; con peso 7 no lo explica ni el peso ni
  // nada, así que es una decisión comercial y se respeta.
  const r = diagnosticarMargen({ precioCosto: 1000, precioVenta: 3000, pesoReferenciaKg: 7 });
  assert.equal(r.diagnostico, DIAGNOSTICO.ALTO_LEGITIMO);
  assert.equal(r.sugerido, null, "no se propone cambiarle el precio a un margen que es una decisión");
});

test("15. y un margen alto SIN ningún factor de escala tampoco se marca", () => {
  const r = diagnosticarMargen({ precioCosto: 1000, precioVenta: 4000 });
  assert.equal(r.diagnostico, DIAGNOSTICO.ALTO_LEGITIMO);
});

test("16. el margen normal es el caso masivo y no se toca", () => {
  // 2.143 de los 2.383 activos.
  assert.equal(diagnosticarMargen({ precioCosto: 1000, precioVenta: 1300 }).diagnostico, DIAGNOSTICO.NORMAL);
  assert.equal(diagnosticarMargen({ precioCosto: 1000, precioVenta: 1560 }).diagnostico, DIAGNOSTICO.NORMAL);
});

test("17. el PESO 1 no puede delatar nada", () => {
  // Son 12 productos de pieza fija con peso exactamente 1, donde las dos escalas
  // coinciden y el criterio no puede decidir. Lo que se afirma es el resultado:
  // un margen alto con peso 1 NO se marca como descalce.
  //
  // ⚠️ Y una advertencia honesta sobre este candado: la condición `peso !== 1`
  // del código es redundante, así que este test pasa igual sin ella —comprobado
  // sacándola—. No la está defendiendo; afirma el comportamiento, que es lo que
  // importa, y por eso se deja escrito acá que no hay que leerlo como su guardián.
  const r = diagnosticarMargen({ precioCosto: 1000, precioVenta: 4000, pesoReferenciaKg: 1 });
  assert.equal(r.diagnostico, DIAGNOSTICO.ALTO_LEGITIMO);
});

test("18. el factor de pack también explica, cuando la presentación es de bulto", () => {
  const r = diagnosticarMargen({
    precioCosto: 1000, precioVenta: 15600, factorPack: 12, unidadMedida: "pack",
  });
  assert.equal(r.diagnostico, DIAGNOSTICO.POR_FACTOR);
  assert.equal(r.sugerido, 1300);
});

test("19. un factor de pack sobre una presentación que NO es de bulto no explica", () => {
  // `factor_pack` puede venir cargado en productos por unidad o por kg sin que
  // el costo esté por bulto. Usarlo ahí para explicar un margen sería inventar.
  const r = diagnosticarMargen({
    precioCosto: 1000, precioVenta: 15600, factorPack: 12, unidadMedida: "kg",
  });
  assert.equal(r.diagnostico, DIAGNOSTICO.ALTO_LEGITIMO);
});

test("20. margen bajo es OTRO caso y no se confunde con un descalce", () => {
  // Los 120 que se venden al costo o por debajo ya tienen su aviso en la
  // tarjeta. Mezclarlos acá haría que este control hable de dos cosas distintas.
  assert.equal(diagnosticarMargen({ precioCosto: 1000, precioVenta: 1000 }).diagnostico, DIAGNOSTICO.BAJO);
  assert.equal(diagnosticarMargen({ precioCosto: 1000, precioVenta: 800 }).diagnostico, DIAGNOSTICO.BAJO);
});

test("21. sin costo o sin venta no se diagnostica nada", () => {
  // "Aceitunas negras" tiene los dos en cero. No hay nada que decir, y decir algo
  // sería inventar.
  assert.equal(diagnosticarMargen({ precioCosto: 0, precioVenta: 0 }).diagnostico, DIAGNOSTICO.SIN_DATOS);
  assert.equal(diagnosticarMargen({ precioCosto: null, precioVenta: 1300 }).diagnostico, DIAGNOSTICO.SIN_DATOS);
});

test("12. NO ESCRIBE NADA: es una función pura", () => {
  // La decisión de Emanuel es que esto avise y no convierta. Un candado sobre el
  // código, porque el día que alguien le agregue un `update` acá el aviso se
  // convierte en la conversión automática que se descartó a propósito.
  const antes = { ...PECHUGA_ANTES };
  const despues = { ...PECHUGA_DESPUES };
  const ubic = [{ localId: 1, precioVenta: 36900 }];
  avisoDeCambioDeEscala({ antes, despues, ubicaciones: ubic });

  assert.deepEqual(antes, PECHUGA_ANTES, "mutó la ficha de entrada");
  assert.deepEqual(despues, PECHUGA_DESPUES, "mutó la ficha de salida");
  assert.deepEqual(ubic, [{ localId: 1, precioVenta: 36900 }], "mutó las ubicaciones");
});
