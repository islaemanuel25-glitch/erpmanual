// LA EXPLICACIÓN DEL PAPEL, PROBADA CON LOS NÚMEROS REALES DE PATY.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/pruebaDeExplicacion.test.mjs
//
// ── DE DÓNDE SALEN ESTOS NÚMEROS ──────────────────────────────────────────
//
// De la sonda `sonda-explicacion-papel.mjs` corrida contra el papel real de
// Paty el 2026-09-21 (cd05b779): once renglones, tres corridas idénticas. NO
// están escritos a mano — es el fixture que este repo pide y que tres veces
// costó no tener.
//
// El papel tiene las dos cosas que el circuito de Mauro nunca vio: DESCUENTO
// por renglón y PRECIO POR KILO en tres de los once. Y tiene, medido, un número
// mal leído: el yogur vainilla salió 46.896,56 donde el papel dice 46.886,55.
// Ese renglón es el candado más importante de este archivo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  comoLoEntendio,
  textoDelResultado,
  textoDeLaCantidad,
} from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import { netoQueFacturaElProveedor } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import {
  toleranciaDelRenglon,
  TOLERANCIA_RENGLON_TECHO_CENTAVOS,
} from "@/lib/compras-proveedor/comprobante/lector/puerta";

/** La receta de Paty, medida: sin IVA discriminado y sin percepciones. */
const RECETA_PATY = {
  ivaPorLinea: false,
  alicuotaIvaPct: 0,
  tieneImpuestoInterno: false,
  ivaIncluyeInternoEnLaBase: false,
  percepciones: [],
  percepcionesEnCosto: true,
};

/** Los once renglones, tal como los devolvió el modelo. */
const PAPEL_DE_PATY = {
  lineas: [
    { descripcion: "BUTLER C. TRAD 9MM X2,5KG -6-", cantidad: 12, peso: null, netoUnitario: 18991.95, bonificacion: 57, subtotalImpreso: 97998.47 },
    { descripcion: "TREM3 MANTECA X100 GS 60", cantidad: 60, peso: null, netoUnitario: 1984.23, bonificacion: 24, subtotalImpreso: 90481.03 },
    { descripcion: "TREM3 QUESO RALL 40GR X20 6", cantidad: 6, peso: null, netoUnitario: 25565.43, bonificacion: 20, subtotalImpreso: 122714.07 },
    { descripcion: "PATY CLASICO FLOW X80GR X2 30", cantidad: 90, peso: null, netoUnitario: 4113.57, bonificacion: 50, subtotalImpreso: 185110.67 },
    // ── EL MAL LEÍDO, Y ES EL CANDADO MÁS IMPORTANTE DE ESTE ARCHIVO ────
    // 30 × 2.442,01 × (1 − 36 %) = 46.886,59. El modelo leyó 46.896,56, diez
    // pesos de más: un 8 que se leyó 9 en la foto. El papel dice 46.886,55.
    { descripcion: "TREM3 YOG VAINILLA X 900ML 10", cantidad: 30, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 46896.56 },
    { descripcion: "TREM3 YOG FRUTILLA X 900ML 10", cantidad: 40, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 62515.42 },
    { descripcion: "TREM3 Q.UNT CLASICO X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    { descripcion: "TREM3 Q.UNT SALAME X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    // ── LOS TRES QUE SE COBRAN POR KILO ─────────────────────────────────
    { descripcion: "FOX SAL BAST CHACAR GRUESO X2U 1", cantidad: 2, peso: 2.9, netoUnitario: 22627, bonificacion: 28, subtotalImpreso: 47245.18 },
    { descripcion: "FOX SAL PIC FINO X 4U 1", cantidad: 3, peso: 2.1, netoUnitario: 24889.7, bonificacion: 28, subtotalImpreso: 37633.23 },
    { descripcion: "TREM3 QUESO DANBO (AMARILLO) -1-", cantidad: 3, peso: 11.685, netoUnitario: 16694.69, bonificacion: 34, subtotalImpreso: 128751.11 },
  ],
  pie: { total: 861376.07 },
};

/** Un papel como el de Mauro: sin peso, sin descuento y sin total impreso. */
const PAPEL_DE_MAURO = {
  lineas: [
    { descripcion: "PHILIPS MORRIS 10", cantidad: 80, peso: null, netoUnitario: 3460.32, bonificacion: null, subtotalImpreso: 276825.6 },
    { descripcion: "M.CRAFTED 20 BOX RED", cantidad: 2, peso: null, netoUnitario: 40500, bonificacion: null, subtotalImpreso: 81000 },
  ],
  pie: { total: null },
};

// ── EL NETO: LA UNIDAD LA DECIDE EL PRODUCTO ──────────────────────────────
//
// Estos cuatro reemplazan a tres que afirmaban lo contrario —que los kilos del
// papel mandaban siempre— y que eran la forma vieja, la de `6787934d`. No se
// aflojaron: se reescribieron sabiendo qué cambió, que es la regla 5. La
// intención de cada uno se conservó entera; lo que cambió es quién decide la
// unidad, y ahora hay que decírselo.

/** Los dos productos del catálogo que hacen falta, con el ÚNICO campo que decide. */
const DANBO_POR_KILO = { unidad_medida: "kg", precio_costo: 9000, factor_pack: 1 };
const PAPAS_POR_PIEZA = { unidad_medida: "unidad", precio_costo: 9000, factor_pack: 1 };

test("PRODUCTO POR KILO CON PESO EN EL PAPEL: EL NETO ES POR KILO", () => {
  // Los dos valores los calculó Emanuel a mano sobre la foto y cierran exactos.
  const salame = PAPEL_DE_PATY.lineas[8];
  const danbo = PAPEL_DE_PATY.lineas[10];
  assert.equal(
    Math.round(netoQueFacturaElProveedor({ linea: salame, producto: DANBO_POR_KILO }).neto * 100) / 100,
    16291.44
  );
  assert.equal(
    Math.round(netoQueFacturaElProveedor({ linea: danbo, producto: DANBO_POR_KILO }).neto * 100) / 100,
    11018.49
  );
  // Dividir por las PIEZAS daría 42.917,04: cuatro veces el costo real.
  assert.notEqual(Math.round((danbo.subtotalImpreso / danbo.cantidad) * 100) / 100, 11018.49);
});

test("PRODUCTO POR PIEZA CON PESO EN EL PAPEL: EL NETO ES POR PIEZA", () => {
  // EL CANDADO DE ESTA TANDA. Mismo renglón, mismo peso impreso, y el producto
  // dice que va por pieza: el peso del papel es un dato, no una orden.
  //
  // Es el caso de las papas — el proveedor imprime los kilos del bolsón y el
  // depósito las cuenta por bolsón. Con la regla vieja, este renglón entraba al
  // catálogo a 11.018,49 el kilo contra un costo que está por pieza.
  const danbo = PAPEL_DE_PATY.lineas[10];
  const r = netoQueFacturaElProveedor({ linea: danbo, producto: PAPAS_POR_PIEZA });
  assert.equal(r.porKilo, false);
  assert.equal(r.faltanKilos, false);
  // 128.751,11 ÷ 3 piezas.
  assert.equal(Math.round(r.neto * 100) / 100, 42917.04);
  // Y NO es el número por kilo, que es el que salía antes.
  assert.notEqual(Math.round(r.neto * 100) / 100, 11018.49);
});

test("PRODUCTO POR KILO SIN KILOS EN EL PAPEL: NO SE INVENTA, SE PIDEN AL RECIBIR", () => {
  // El butler no trae peso. Si el producto va por kilo, dividir por las 12
  // unidades daría un "precio por kilo" que es por unidad, y nada lo delataría
  // río abajo. Los kilos se piden al recibir, como ya funciona el fiambre.
  const butler = PAPEL_DE_PATY.lineas[0];
  const r = netoQueFacturaElProveedor({ linea: butler, producto: DANBO_POR_KILO });
  assert.equal(r.neto, null, "se inventó un neto sin kilos");
  assert.equal(r.faltanKilos, true);
  assert.equal(r.porKilo, true);
});

test("RENGLÓN SIN VINCULAR: NO HAY NETO TODAVÍA", () => {
  // Sin producto no se sabe por cuánto dividir, y elegir uno sería adivinar.
  const danbo = PAPEL_DE_PATY.lineas[10];
  const r = netoQueFacturaElProveedor({ linea: danbo, producto: null });
  assert.equal(r.neto, null);
  assert.equal(r.sinProducto, true);
  assert.equal(r.porKilo, null, "se opinó sobre la unidad sin producto");
});

test("SIN KILOS, EL NETO YA TIENE EL DESCUENTO ADENTRO", () => {
  const butler = PAPEL_DE_PATY.lineas[0];
  const r = netoQueFacturaElProveedor({ linea: butler, producto: PAPAS_POR_PIEZA });
  assert.equal(Math.round(r.neto * 100) / 100, 8166.54);
  // El unitario IMPRESO es el de lista, 18.991,95: usarlo como costo sería
  // cargar el producto a más del doble de lo que se pagó.
  assert.equal(butler.netoUnitario, 18991.95);
});

test("CONTRAPRUEBA: en un papel sin peso ni descuento, el neto ES el unitario", () => {
  // Es el papel de Mauro, que hoy funciona. Si esto cambiara, todo el circuito
  // que ya anda empezaría a escribir otros costos sin que nadie lo pida.
  for (const l of PAPEL_DE_MAURO.lineas) {
    // Redondeado al centavo: 276.825,60 ÷ 80 da 3460.3199999999997 en coma
    // flotante. La igualdad que importa es la del costo, no la del binario.
    assert.equal(
      Math.round(netoQueFacturaElProveedor({ linea: l, producto: PAPAS_POR_PIEZA }).neto * 100) / 100,
      Math.round(l.netoUnitario * 100) / 100
    );
  }
});

// ── LOS DOS CONTROLES ─────────────────────────────────────────────────────

test("EL CONTROL POR RENGLÓN SEÑALA EL YOGUR, Y SOLO EL YOGUR", () => {
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 1, "señaló de más o de menos");
  assert.match(r.sospechosos[0].nombre, /YOG VAINILLA/);
  // Y ofrece lo que da la cuenta, para poder preguntárselo a la persona.
  assert.equal(Math.round(r.sospechosos[0].daLaCuenta * 100) / 100, 46886.59);
  assert.equal(r.enOrden, 10, "los otros diez dan su cuenta");
});

test("Y NO SEÑALA LA MANTECA, QUE DIFIERE 14 CENTAVOS Y ESTÁ BIEN LEÍDA", () => {
  // Medido: 60 × 1.984,23 × (1 − 24 %) da 90.480,89 y el papel dice 90.481,03.
  // El proveedor redondea el unitario antes de multiplicar y ese centavo se
  // multiplica por 60. Con una tolerancia fija de cinco centavos, este renglón
  // perfecto mandaría a mirar la foto — y un control que señala de más se
  // empieza a ignorar.
  const manteca = PAPEL_DE_PATY.lineas[1];
  const calculado = manteca.cantidad * manteca.netoUnitario * (1 - manteca.bonificacion / 100);
  assert.ok(Math.abs(calculado - manteca.subtotalImpreso) > 0.05, "el caso ya no es el medido");
  assert.ok(Math.abs(calculado - manteca.subtotalImpreso) < 0.6);
  assert.equal(toleranciaDelRenglon(60), 60, "cinco de piso más uno por unidad");

  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.ok(
    !r.sospechosos.some((p) => /MANTECA/.test(p.nombre)),
    "volvió a marcar como mal leído un renglón que está bien"
  );
});

test("CONTRAPRUEBA: la tolerancia no tapa el error del yogur", () => {
  // 30 unidades dan 30 centavos de margen; el yogur difiere 9,97. Si la
  // tolerancia creciera de más, este candado se quedaría sin nada que atrapar.
  assert.equal(toleranciaDelRenglon(30), 30);
  const yogur = PAPEL_DE_PATY.lineas[4];
  const calculado = yogur.cantidad * yogur.netoUnitario * (1 - yogur.bonificacion / 100);
  assert.ok(Math.abs(calculado - yogur.subtotalImpreso) * 100 > toleranciaDelRenglon(30));
});

test("y con ese renglón corregido, el papel CIERRA", () => {
  // La prueba de que la diferencia del papel es exactamente ese renglón.
  const corregido = {
    ...PAPEL_DE_PATY,
    lineas: PAPEL_DE_PATY.lineas.map((l, i) =>
      i === 4 ? { ...l, subtotalImpreso: 46886.59 } : l
    ),
  };
  const r = comoLoEntendio({ lectura: corregido, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 0);
  assert.equal(r.cierra, true, `quedó una diferencia de ${r.diferencia}`);
});

test("EL CONTROL PRINCIPAL ES EL DE SIEMPRE, CON LA RECETA PUESTA", () => {
  // No es una suma pelada: pasa por `verificarComprobante`, que aplica IVA y
  // percepciones. Con la receta de Paty —sin IVA discriminado— el total
  // calculado es la suma; con IVA del 21 % daría otra cosa, y ese es el punto.
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.equal(Math.round(r.suma * 100) / 100, 861386.08);
  assert.equal(r.totalDelPapel, 861376.07);
  assert.equal(Math.round(r.diferencia * 100) / 100, 10.01);
  assert.equal(r.cierra, false);

  const conIva = comoLoEntendio({
    lectura: PAPEL_DE_PATY,
    receta: { ...RECETA_PATY, alicuotaIvaPct: 21 },
  });
  assert.notEqual(
    conIva.totalCalculado,
    r.totalCalculado,
    "la receta dejó de influir en el control principal"
  );
});

test("UN PAPEL SIN TOTAL NO SE MARCA COMO MAL LEÍDO", () => {
  // El de Mauro. No hay contra qué comparar: decir "no cierra" afirmaría que la
  // lectura está mal cuando puede estar perfecta.
  const r = comoLoEntendio({ lectura: PAPEL_DE_MAURO, receta: {} });
  assert.equal(r.hayTotal, false);
  assert.equal(r.cierra, null);
  assert.equal(r.sospechosos.length, 0, "sus renglones dan su cuenta");
  const t = textoDelResultado(r);
  assert.equal(t.tono, "aviso");
  assert.match(t.titulo, /no trae total/i);
});

// ── CÓMO SE DICE, QUE ES LA MITAD DEL TRABAJO ─────────────────────────────

test("la cantidad se dice en piezas y kilos cuando hay kilos", () => {
  assert.equal(textoDeLaCantidad({ cantidad: 2, peso: 2.9 }), "2 piezas · 2.9 kg");
  assert.equal(textoDeLaCantidad({ cantidad: 1, peso: 11.685 }), "1 pieza · 11.685 kg");
  assert.equal(textoDeLaCantidad({ cantidad: 12, peso: null }), "12 unidades");
  assert.equal(textoDeLaCantidad({ cantidad: 1, peso: null }), "1 unidad");
});

test("EL TEXTO DE ARRIBA DICE CUÁL DE LOS TRES CASOS ES", () => {
  const moneda = (v) => `$${v.toFixed(2)}`;
  const ok = textoDelResultado(
    comoLoEntendio({
      lectura: { ...PAPEL_DE_PATY, lineas: PAPEL_DE_PATY.lineas.map((l, i) => (i === 4 ? { ...l, subtotalImpreso: 46886.59 } : l)) },
      receta: RECETA_PATY,
    }),
    { moneda }
  );
  // ── EL CARTEL CAMBIÓ, Y ÉSTE ES EL CONTRATO NUEVO ────────────────────
  //
  // Decía "Los 11 productos suman $X" y abajo "Igual que el total del papel".
  // Ese $X es la suma de la columna NETO, y en cualquier proveedor que
  // discrimine IVA al pie NO es el total del papel: con TDC el cartel afirmaba
  // que el papel decía $374.056,62 cuando dice $463.499,07, en verde y
  // habilitando guardar.
  //
  // Ahora el título nombra el total IMPRESO —que es contra lo que el control
  // compara— y el detalle dice la cuenta entera. Paty factura con alícuota 0,
  // así que acá los dos números coinciden; lo que se afirma es CUÁL se titula.
  assert.equal(ok.tono, "ok");
  assert.match(ok.titulo, /El papel cierra en/);
  assert.ok(
    !/Igual que el total del papel/.test(`${ok.titulo} ${ok.detalle}`),
    "volvió la afirmación de igualdad entre la suma de netos y el total del papel"
  );
  assert.match(ok.detalle, /Está bien leído/);

  const mal = textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY }), { moneda });
  assert.equal(mal.tono, "alerta");
  assert.match(mal.titulo, /No cierra por \$10\.01/);
  assert.match(mal.detalle, /está acá abajo/);
});

test("NINGÚN TEXTO DICE RENGLONES, LÍNEAS NI ÍTEMS", () => {
  const moneda = (v) => `$${v}`;
  const textos = [
    textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY }), { moneda }),
    textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_MAURO, receta: {} }), { moneda }),
  ];
  for (const t of textos) {
    const junto = `${t.titulo} ${t.detalle}`.toLowerCase();
    for (const palabra of ["renglón", "renglones", "línea", "líneas", "ítem", "items"]) {
      assert.ok(!junto.includes(palabra), `dice "${palabra}": ${junto}`);
    }
  }
});

// ── LA TOLERANCIA DEL RENGLÓN, MEDIDA CONTRA LOS DOS CASOS QUE LA DEFINEN ──

test("LA TOLERANCIA ESTÁ EN CENTAVOS, Y CON 30 UNIDADES SON 30 CENTAVOS", () => {
  // Se escribe porque ya se leyó mal una vez: el commit de `6787934d` decía
  // "uno por unidad" a secas y eso se lee como UN PESO por unidad. Con treinta
  // unidades la tolerancia serían treinta pesos y el error del yogur —$9,97—
  // pasaría sin avisar. Son treinta CENTAVOS.
  assert.equal(toleranciaDelRenglon(30), 30);
  assert.equal(toleranciaDelRenglon(60), 60);
  // Y el error del yogur, en centavos, es treinta y tres veces esa tolerancia.
  const yogur = PAPEL_DE_PATY.lineas[4];
  const daLaCuenta = Math.round(Math.round(yogur.netoUnitario * 100) * yogur.cantidad * (1 - yogur.bonificacion / 100));
  const difiere = Math.abs(daLaCuenta - Math.round(yogur.subtotalImpreso * 100));
  assert.equal(difiere, 997);
  assert.ok(difiere > toleranciaDelRenglon(30) * 30, "el margen contra el yogur se achicó");
});

test("Y LA MANTECA USA MENOS DE UN CUARTO DE LA SUYA", () => {
  // 14 centavos sobre 60 de tolerancia. Es el renglón que obligó a que la
  // tolerancia acompañe a la cantidad, y es el que no se puede señalar.
  const manteca = PAPEL_DE_PATY.lineas[1];
  const daLaCuenta = Math.round(Math.round(manteca.netoUnitario * 100) * manteca.cantidad * (1 - manteca.bonificacion / 100));
  const difiere = Math.abs(daLaCuenta - Math.round(manteca.subtotalImpreso * 100));
  assert.equal(difiere, 14);
  assert.ok(difiere < toleranciaDelRenglon(60), "la manteca volvió a quedar señalada");
});

test("EL TECHO IMPIDE QUE UN RENGLÓN GRANDE APAGUE EL CONTROL SOLO", () => {
  // Sin techo, mil unidades tolerarían diez pesos — el tamaño exacto del error
  // del yogur, que es un dígito mal leído en el SUBTOTAL y no crece con la
  // cantidad. El control se apagaría justo en los renglones más grandes, en
  // silencio.
  assert.equal(toleranciaDelRenglon(1000), TOLERANCIA_RENGLON_TECHO_CENTAVOS);
  assert.equal(toleranciaDelRenglon(100000), TOLERANCIA_RENGLON_TECHO_CENTAVOS);
  // Con el techo puesto, un error de diez pesos se sigue señalando por grande
  // que sea el renglón.
  assert.ok(997 > TOLERANCIA_RENGLON_TECHO_CENTAVOS * 1.5, "el techo dejó de tener margen contra el yogur");
  // Y no recorta ninguno de los renglones que existen: el más grande medido en
  // producción son 200 unidades, sobre las 47 líneas cargadas.
  assert.ok(toleranciaDelRenglon(200) < TOLERANCIA_RENGLON_TECHO_CENTAVOS);
  assert.equal(toleranciaDelRenglon(200), 200);
});

test("LOS DOS CONTROLES SON DISTINTOS: UNO SIGUE AL PAPEL Y EL OTRO AL PRODUCTO", () => {
  // El renglón del danbo se COBRA por kilo, y el producto podría ser de pieza.
  // La verificación de lectura tiene que usar los kilos igual —si no, un papel
  // perfecto no cerraría— mientras el costo usa lo que diga el producto.
  const danbo = PAPEL_DE_PATY.lineas[10];
  const comoPieza = { unidad_medida: "unidad", precio_costo: 1, factor_pack: 1 };

  // El control de lectura no mira el producto: ni lo recibe.
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 1, "la verificación dejó de seguir al papel");
  assert.match(r.sospechosos[0].nombre, /YOG VAINILLA/);

  // Y el costo del mismo renglón cambia según el producto, sin tocar lo de arriba.
  const porPieza = netoQueFacturaElProveedor({ linea: danbo, producto: comoPieza }).neto;
  const porKilo = netoQueFacturaElProveedor({ linea: danbo, producto: DANBO_POR_KILO }).neto;
  assert.notEqual(Math.round(porPieza * 100), Math.round(porKilo * 100));
  assert.equal(Math.round(porKilo * 100) / 100, 11018.49);
});

// ── EL BUTLER ESTÁ BIEN Y NO SE LO PUEDE ACUSAR ───────────────────────────
//
// Lo que Emanuel vio en el #242 el 2026-09-21 a las 19:41: el bloque decía "No
// cierra por $10,01" —correcto— y la tarjeta señalada era el BUTLER, con "Da la
// cuenta $227.903,40". Ese número es 12 × 18.991,95 SIN el 57 % de descuento.
//
// El Butler está perfecto: 12 × 18.991,95 × 0,43 = 97.998,47, que es su
// subtotal impreso. Lo que faltaba era el descuento —esa lectura era anterior a
// la columna— y el control lo reemplazaba por un cero.

/** Los once renglones del #242 COMO ESTÁN GUARDADOS HOY, medidos el 2026-09-21
 *  sobre la lectura de las 22:40 hecha con la explicación de Paty. */
const PAPEL_DE_PATY_COMPLETO = {
  lineas: [
    { descripcion: "BUTLER C. TRAD 9MM X2.5KG -6-", cantidad: 12, peso: null, netoUnitario: 18991.95, bonificacion: 57, subtotalImpreso: 97998.47 },
    { descripcion: "TREMS MANTECA X100 GS 60", cantidad: 60, peso: null, netoUnitario: 1984.23, bonificacion: 24, subtotalImpreso: 90481.03 },
    { descripcion: "TREMS QUESO RALL 40GR X20 6", cantidad: 6, peso: null, netoUnitario: 25565.43, bonificacion: 20, subtotalImpreso: 122714.07 },
    { descripcion: "PATY CLASICO FLOW X80GR X2 30", cantidad: 90, peso: null, netoUnitario: 4113.57, bonificacion: 50, subtotalImpreso: 185110.67 },
    { descripcion: "TREMS YOG VAINILLA X 900ML 10", cantidad: 30, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 46896.56 },
    { descripcion: "TREMS YOG FRUTILLA X 900ML 10", cantidad: 40, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 62515.42 },
    { descripcion: "TREMS Q.UNT CLASICO X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    { descripcion: "TREMS Q.UNT SALAME X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    { descripcion: "FOX SAL BAST CHACAR GRUESO X2U 1", cantidad: 2, peso: 2.9, netoUnitario: 22627, bonificacion: 28, subtotalImpreso: 47245.18 },
    { descripcion: "FOX SAL PIC FINO X 4U 1", cantidad: 3, peso: 2.1, netoUnitario: 24889.7, bonificacion: 28, subtotalImpreso: 37633.23 },
    { descripcion: "TREMS QUESO DANBO (AMARILLO) -1-", cantidad: 3, peso: 11.685, netoUnitario: 16694.69, bonificacion: 34, subtotalImpreso: 128751.11 },
  ],
  pie: { total: 861376.07 },
};

test("CON LOS DESCUENTOS, EL ÚNICO ACUSADO ES EL YOGUR", () => {
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY_COMPLETO, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 1, "acusó de más o de menos");
  assert.match(r.sospechosos[0].nombre, /YOG VAINILLA/);
  // Y la tarjeta ofrece la cuenta CON el descuento: 30 × 2.442,01 × 0,64.
  assert.equal(Math.round(r.sospechosos[0].daLaCuenta * 100) / 100, 46886.59);
  assert.equal(r.sospechosos[0].subtotal, 46896.56, "y el «Leyó» es el subtotal impreso");
  assert.equal(Math.round(Math.abs(r.diferencia) * 100) / 100, 10.01);
});

test("EL BUTLER NO SE ACUSA, Y SU CUENTA CIERRA AL CENTAVO", () => {
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY_COMPLETO, receta: RECETA_PATY });
  const butler = r.productos.find((p) => p.nombre.startsWith("BUTLER"));
  assert.equal(butler.daLaCuenta, null, "volvió a acusarse el Butler");
  // La cuenta que lo salva, escrita: 12 × 18.991,95 × (1 − 57 %) = 97.998,46,
  // contra los 97.998,47 impresos. Difiere UN CENTAVO, que es el redondeo del
  // propio proveedor y justo lo que la tolerancia del renglón existe para
  // perdonar — doce unidades toleran doce centavos.
  assert.equal(Math.round(12 * 18991.95 * 0.43 * 100) / 100, 97998.46);
  assert.equal(Math.abs(Math.round(12 * 18991.95 * 0.43 * 100) - Math.round(97998.47 * 100)), 1);
  // Y el número que se le ofrecía, que es la misma cuenta SIN el descuento.
  assert.equal(Math.round(12 * 18991.95 * 100) / 100, 227903.4);
});

test("SIN EL DESCUENTO LEÍDO, ESE RENGLÓN NO SE JUZGA NI OFRECE NÚMERO", () => {
  // La lectura vieja del #242: los once renglones sin descuento. Ninguno se
  // juzga, así que nadie queda acusado — ni el Butler ni el yogur.
  const vieja = {
    ...PAPEL_DE_PATY_COMPLETO,
    lineas: PAPEL_DE_PATY_COMPLETO.lineas.map((l) => ({ ...l, bonificacion: null })),
  };
  const r = comoLoEntendio({ lectura: vieja, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 0, "acusó a un renglón con el descuento inventado");
  for (const p of r.productos) assert.equal(p.daLaCuenta, null);

  // CONTRAPRUEBA: con un cero EXPLÍCITO sí se juzga, porque cero es un dato.
  // Es la diferencia que el contrato del lector ahora le pide al modelo.
  const conCero = {
    ...PAPEL_DE_PATY_COMPLETO,
    lineas: PAPEL_DE_PATY_COMPLETO.lineas.map((l) => ({ ...l, bonificacion: 0 })),
  };
  const r2 = comoLoEntendio({ lectura: conCero, receta: RECETA_PATY });
  assert.ok(r2.sospechosos.length > 1, "con cero explícito el control tiene que volver a juzgar");
});

test("Y UN SOLO RENGLÓN SIN DESCUENTO NO ARRASTRA A LOS DEMÁS", () => {
  // Solo el Butler pierde su descuento. Él no se juzga; el yogur sigue
  // acusado, que es lo que el control tiene que seguir haciendo.
  const mixta = {
    ...PAPEL_DE_PATY_COMPLETO,
    lineas: PAPEL_DE_PATY_COMPLETO.lineas.map((l, i) => (i === 0 ? { ...l, bonificacion: null } : l)),
  };
  const r = comoLoEntendio({ lectura: mixta, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 1);
  assert.match(r.sospechosos[0].nombre, /YOG VAINILLA/);
});
