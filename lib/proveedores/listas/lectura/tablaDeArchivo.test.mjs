// De fragmentos con posición a una tabla con columnas.
//
// ── DE DÓNDE SALEN ESTOS FRAGMENTOS ─────────────────────────────────────────
//
// De las listas reales, volcados con pdfjs y pegados acá con sus coordenadas y
// sus anchos tal cual vinieron. Ninguno está escrito a mano.
//
// El motivo no es prolijidad: las cinco trampas que este módulo tiene que
// sortear —el membrete arriba del encabezado, el encabezado de dos pisos, la
// hoja a dos tablas, el signo de moneda suelto y el marcador de rubro pegado al
// código— se reconocen por MILÍMETROS. Un fixture plausible escrito de memoria
// las tendría todas a distancias redondas y este archivo quedaría verde sin
// probar ninguna.

import { test } from "node:test";
import assert from "node:assert/strict";

import { tablaDeFragmentos, columnasDeX } from "@/lib/proveedores/listas/lectura/tablaDeArchivo";

// ── LISTA DE M Y F: membrete, dos tablas por hoja, título de rubro ──────────
//
// Una hoja con las columnas Código · Articulo · Desc% · Precio impresas DOS
// VECES, y arriba de todo el nombre de la empresa, la fecha, el día de la
// semana y el número de página.
const MYF = [
  { x: 68.08, y: 807.23, ancho: 39.1, texto: "M Y F SRL" },
  { x: 541.55, y: 807.23, ancho: 27.62, texto: "Página 1" },
  { x: 68.08, y: 793.6, ancho: 119.46, texto: "Lista de Precios 3 en PESO" },
  { x: 512.81, y: 795.49, ancho: 56.41, texto: "4/5/2026 16:26:44" },
  { x: 68.08, y: 783.1, ancho: 71.96, texto: "(Precios Finales)" },
  { x: 535.03, y: 782.74, ancho: 34.2, texto: "DOMINGO" },

  { x: 24.58, y: 756.62, ancho: 20.63, texto: "Código" },
  { x: 65.58, y: 756.62, ancho: 22.64, texto: "Articulo" },
  { x: 239.36, y: 756.62, ancho: 19.67, texto: "Desc%" },
  { x: 273.7, y: 756.62, ancho: 18.32, texto: "Precio" },
  { x: 299.54, y: 756.62, ancho: 20.63, texto: "Código" },
  { x: 340.54, y: 756.62, ancho: 22.64, texto: "Articulo" },
  { x: 514.32, y: 756.62, ancho: 19.67, texto: "Desc%" },
  { x: 548.66, y: 756.62, ancho: 18.32, texto: "Precio" },

  { x: 24.58, y: 743.87, ancho: 55.64, texto: "RUBROS A-AGUAS" },

  { x: 39.59, y: 736.37, ancho: 13.34, texto: "2034" },
  { x: 65.58, y: 736.37, ancho: 114.61, texto: "AGUA BAGGIO VIDA MANZANA 6 X 1500" },
  { x: 268.69, y: 736.37, ancho: 23.34, texto: "1.135,65" },
  { x: 314.55, y: 747.62, ancho: 13.34, texto: "4638" },
  { x: 340.54, y: 747.62, ancho: 130.27, texto: "TOSTEX CHIPS COLORES BOLSA 10 X 270 G." },
  { x: 543.65, y: 747.62, ancho: 23.34, texto: "1.430,19" },
  { x: 314.55, y: 740.12, ancho: 13.34, texto: "4635" },
  { x: 340.54, y: 740.12, ancho: 168.58, texto: "TOSTEX CHIPS DULCE DE LECHE GRANIZADO 10 X 300 G." },
  { x: 543.65, y: 740.12, ancho: 23.34, texto: "1.304,00" },

  // Una fila con descuento, en cada bloque.
  { x: 39.59, y: 728.12, ancho: 13.34, texto: "5486" },
  { x: 65.58, y: 728.12, ancho: 104.94, texto: "FID. MOLTO SPAGUETTI 20X500 GR" },
  { x: 248.69, y: 728.12, ancho: 13.67, texto: "-7,0" },
  { x: 273.69, y: 728.12, ancho: 18.34, texto: "737,84" },
  { x: 314.55, y: 732.62, ancho: 13.34, texto: "5131" },
  { x: 340.54, y: 732.62, ancho: 140.27, texto: "GRANBY LIQ CONC P/DIL LIMON4X500ML+BOT3L" },
  { x: 520.32, y: 732.62, ancho: 13.67, texto: "-23,0" },
  { x: 543.65, y: 732.62, ancho: 23.34, texto: "4.683,11" },

];

// Dos descripciones que pdfjs entrega PARTIDAS en dos fragmentos, con el pedazo
// de atrás en el medio del blanco entre columnas.
//
// VAN EN UNA SOLA HOJA, que es donde están: en el archivo real son tres filas
// sobre novecientas cincuenta y cuatro. Repetirlas en las seis hojas —que fue la
// primera versión de este fixture— las convierte en el 14 % de las filas, y con
// esa proporción SÍ son una columna: el candado daba rojo por el fixture y no
// por el módulo.
const MYF_PARTIDAS = [
  { x: 41.26, y: 720.62, ancho: 10.01, texto: "360" },
  { x: 65.58, y: 720.62, ancho: 75.77, texto: "BAGGIO +MANZANA ROJA" },
  { x: 146.36, y: 720.62, ancho: 34.34, texto: "18 X 200 CC" },
  { x: 273.69, y: 720.62, ancho: 18.34, texto: "457,68" },
  { x: 314.55, y: 725.12, ancho: 13.34, texto: "1892" },
  { x: 340.54, y: 725.12, ancho: 105.97, texto: "FRA HUG CLASSIC G REG 12X8 2024" },
  { x: 451.52, y: 725.12, ancho: 3.34, texto: "0" },
  { x: 520.32, y: 725.12, ancho: 13.67, texto: "-16,0" },
  { x: 543.65, y: 725.12, ancho: 23.34, texto: "2.327,25" },
];

// ── SEIS PÁGINAS, QUE ES LO QUE TIENE EL ARCHIVO ────────────────────────────
//
// El membrete se imprime UNA VEZ POR HOJA, así que con una sola página cada una
// de sus celdas aparece una vez, no llega al mínimo de tres y se descarta sola.
// Con eso, el candado del membrete quedaba VERDE aun con el corte del membrete
// sacado del módulo: probaba una lista de una hoja, que no es la que hay.
//
// Medido: con una página, sacar `desdeElEncabezado` deja el candado en verde;
// con seis, se pone rojo nombrando el descuento pegado al precio.
const PAGINAS_MYF = 6;
const tablaMyf = () =>
  tablaDeFragmentos(
    Array.from({ length: PAGINAS_MYF }, (_, i) => ({
      ancho: 595.5,
      alto: 842.25,
      fragmentos: i === 0 ? [...MYF, ...MYF_PARTIDAS] : MYF,
    }))
  );

test("M Y F: cuatro columnas con sus nombres, y las dos mitades de la hoja apiladas", () => {
  const t = tablaMyf();
  assert.deepEqual(t.titulos, ["Código", "Articulo", "Desc%", "Precio"]);
  assert.equal(t.anclas.length, 4);
  // Las filas de los dos bloques entran a la misma tabla.
  const codigos = t.filas.map((f) => f.valores[0]);
  assert.ok(codigos.includes("2034"), "falta una fila del bloque izquierdo");
  assert.ok(codigos.includes("4638"), "falta una fila del bloque derecho");
});

test("M Y F: el membrete NO pega la columna de descuento con la de precio", () => {
  // CONTRAPRUEBA MEDIDA: "DOMINGO" cae en la X 535, que relativa al bloque
  // derecho es 235,5 — justo en el hueco entre el descuento (220,8) y el precio
  // (244,1). Con el membrete adentro del cálculo, las dos columnas se encadenan
  // en una y los descuentos aparecen pegados a los precios.
  const t = tablaMyf();
  const conDescuento = t.filas.filter((f) => f.valores[2] !== "");
  assert.ok(conDescuento.length >= 2, "no se leyó ninguna fila con descuento");
  for (const f of conDescuento) {
    assert.match(f.valores[2], /^-\d+,\d$/, `el descuento vino contaminado: ${JSON.stringify(f.valores)}`);
    assert.doesNotMatch(f.valores[3], /-/, `el precio vino con el descuento pegado: ${JSON.stringify(f.valores)}`);
  }
  // Y el membrete no entró como dato.
  const textos = t.filas.map((f) => f.valores.join(" "));
  assert.equal(textos.some((x) => x.includes("DOMINGO") || x.includes("Página")), false);
});

test("M Y F: el título de rubro no crea una columna ni entra como fila", () => {
  const t = tablaMyf();
  assert.equal(t.filas.some((f) => f.valores.includes("RUBROS A-AGUAS")), false);
  assert.ok(
    t.filasDescartadas.some((d) => d.motivo === "TITULO_O_SUELTA" && d.texto.includes("RUBROS")),
    "el título de rubro tiene que quedar descartado CON su motivo"
  );
});

test("M Y F: el pedazo suelto de una descripción vuelve a la descripción", () => {
  // CONTRAPRUEBA: "18 X 200 CC" está en la X 146, y por cercanía pura la columna
  // más próxima es la de descuento (220,8) y no la de la descripción (41). Con
  // la regla de la ancla más cercana, esa fila quedaba con
  // descuento "18 X 200 CC".
  const t = tablaMyf();
  const fila = t.filas.find((f) => f.valores[0] === "360");
  assert.ok(fila, "no se leyó la fila 360");
  assert.equal(fila.valores[1], "BAGGIO +MANZANA ROJA 18 X 200 CC");
  assert.equal(fila.valores[2], "");

  const fra = t.filas.find((f) => f.valores[0] === "1892");
  assert.equal(fra.valores[1], "FRA HUG CLASSIC G REG 12X8 2024 0");
  assert.equal(fra.valores[2], "-16,0");
});

// ── LISTA DE BEBIDAS: encabezado de dos pisos, "$" suelto, marca de rubro ───

const BEBIDAS = [
  { x: 222.29, y: 957.24, ancho: 170.25, texto: "LISTA DE PRECIO 22 + 9,5%" },
  { x: 457.78, y: 942.24, ancho: 52.69, texto: "NETO C/DESC" },
  { x: 41.64, y: 936.12, ancho: 17.17, texto: "COD" },
  { x: 115.1, y: 936.12, ancho: 52.58, texto: "DESCRIPCION" },
  { x: 224.09, y: 936.12, ancho: 18.14, texto: "UND" },
  { x: 257.57, y: 936, ancho: 20.48, texto: "I. INT" },
  { x: 305.93, y: 936, ancho: 21.68, texto: "NETO" },
  { x: 358.15, y: 936, ancho: 22.56, texto: "FINAL" },
  { x: 399.79, y: 936, ancho: 41.41, texto: "PREVENTA" },
  { x: 474.7, y: 929.88, ancho: 18.8, texto: "9,5%" },
  { x: 538.2, y: 936, ancho: 22.56, texto: "FINAL" },
];

// Las filas son todas iguales salvo el código, la descripción y el impuesto:
// se generan con los desplazamientos reales de la lista.
function filaBebida({ y, codigo, nombre, impuesto, rubro = null }) {
  const f = [
    { x: 45.36, y, ancho: 14.35, texto: codigo },
    { x: 63.12, y, ancho: 93.88, texto: nombre },
    { x: 230.81, y, ancho: 4.75, texto: "6" },
    { x: 249.65, y, ancho: 4.75, texto: "$" },
    { x: 259.49, y, ancho: 26.2, texto: impuesto },
    { x: 294.89, y, ancho: 4.75, texto: "$" },
    { x: 309.53, y, ancho: 28.85, texto: "4.337,1" },
    { x: 347.59, y, ancho: 4.75, texto: "$" },
    { x: 362.23, y, ancho: 28.85, texto: "5.366,8" },
    { x: 400.27, y, ancho: 4.75, texto: "$" },
    { x: 418.75, y, ancho: 21.64, texto: "5.590" },
    { x: 449.62, y, ancho: 4.75, texto: "$" },
    { x: 489.82, y, ancho: 28.59, texto: "3.925,1" },
    { x: 527.62, y, ancho: 4.75, texto: "$" },
    { x: 542.28, y, ancho: 28.85, texto: "4.868,3" },
  ];
  // El marcador de rubro se imprime en el margen, 11,2 puntos a la izquierda
  // del código y 2,6 más abajo — adentro de la tolerancia vertical del renglón.
  if (rubro) f.push({ x: 34.2, y: y - 2.64, ancho: 22.93, texto: rubro });
  return f;
}

// ── LA PROPORCIÓN DE MARCADORES ES LA DEL ARCHIVO, NO UNA CUALQUIERA ────────
//
// En la lista real el marcador de rubro aparece en OCHO de las cincuenta y seis
// filas: uno cada siete, cuando cambia el rubro. La primera versión de este
// fixture puso uno solo sobre cinco filas y el candado dio rojo — con razón: con
// un marcador solo, el grupo no llega al mínimo de tres celdas, se descarta, y la
// celda cae en la columna del código igual que antes del arreglo.
//
// Es el defecto de siempre: un fixture escrito "razonable" que prueba una
// combinación que el archivo no tiene. Se corrige con la proporción real, que es
// lo único que dice si la regla funciona donde tiene que funcionar.
const RUBROS = { 5: "LIVRA", 12: "SODA", 18: "RF" };

function filasBebidas() {
  const salida = [];
  for (let i = 0; i < 21; i++) {
    salida.push(
      ...filaBebida({
        y: 917.28 - i * 12.36,
        codigo: String(521 + i),
        nombre: `LIVRA SABOR ${i} 500 c.c`,
        impuesto: "118,93",
        rubro: RUBROS[i] ?? null,
      })
    );
  }
  return salida;
}

const tablaBebidas = () =>
  tablaDeFragmentos([{ ancho: 612, alto: 1008, fragmentos: [...BEBIDAS, ...filasBebidas()] }]);

test("bebidas: el signo de moneda no genera una columna de puros pesos", () => {
  const t = tablaBebidas();
  assert.equal(
    t.titulos.some((x) => x.trim() === "$"),
    false,
    "quedó una columna de signos de moneda"
  );
  const fila = t.filas.find((f) => f.valores.includes("521"));
  assert.ok(fila, "no se leyó la primera fila");
  assert.ok(fila.valores.includes("$ 4.337,1"), `el precio quedó partido: ${JSON.stringify(fila.valores)}`);
});

test("bebidas: el encabezado de dos pisos le pone nombre a su columna", () => {
  // CONTRAPRUEBA: "NETO C/DESC" está SOLO en su renglón y un renglón más arriba
  // que el resto del encabezado. Sin la regla que salva los renglones de arriba
  // cuyas celdas son todas nombres de columna, esa columna queda sin título y la
  // pantalla le pide al usuario que confirme una columna que no sabe nombrar.
  const t = tablaBebidas();
  assert.ok(t.titulos.includes("NETO C/DESC"), `títulos leídos: ${JSON.stringify(t.titulos)}`);
});

test("bebidas: el título del documento NO se usa como nombre de columna", () => {
  // "LISTA DE PRECIO 22 + 9,5%" está arriba de todo y contiene la palabra
  // "precio". Si se toma por encabezado, se posa sobre la columna de unidades.
  const t = tablaBebidas();
  assert.equal(
    t.titulos.some((x) => x.includes("LISTA DE PRECIO")),
    false,
    `el título del documento entró como nombre de columna: ${JSON.stringify(t.titulos)}`
  );
});

test("bebidas: el marcador de rubro no se pega al código del producto", () => {
  // CONTRAPRUEBA MEDIDA: "LIVRA" está a 11,2 puntos del código y la tolerancia
  // horizontal es de 12. Sin la regla de que una columna no puede tener dos
  // celdas del mismo renglón, el código de esa fila se lee "LIVRA 532" y el
  // producto no se vincula nunca — con la fila entera pareciendo bien leída.
  const t = tablaBebidas();
  for (const [i, marca] of Object.entries(RUBROS)) {
    const codigo = String(521 + Number(i));
    const fila = t.filas.find((f) => f.valores.some((v) => v.includes(`SABOR ${i} `)));
    assert.ok(fila, `no se leyó la fila ${codigo}`);
    assert.ok(
      fila.valores.includes(codigo),
      `el código vino contaminado con "${marca}": ${JSON.stringify(fila.valores)}`
    );
  }
});

// ── LA REGLA QUE SE VERIFICA SOLA ───────────────────────────────────────────

test("columnasDeX parte un grupo donde dos celdas de la misma fila chocan", () => {
  const filas = [
    { celdas: [{ x: 34.2 }, { x: 45.4 }] },
    { celdas: [{ x: 34.2 }, { x: 45.4 }] },
    { celdas: [{ x: 34.2 }, { x: 45.4 }] },
  ];
  const cols = columnasDeX(filas);
  assert.equal(cols.length, 2, "once puntos de separación con choque son DOS columnas");

  // Y sin choque, esas mismas X son una sola columna: la distancia sola no
  // decide, y por eso una columna de precios alineada a la derecha no se parte.
  const sinChoque = [
    { celdas: [{ x: 34.2 }] },
    { celdas: [{ x: 45.4 }] },
    { celdas: [{ x: 40.0 }] },
    { celdas: [{ x: 41.0 }] },
  ];
  assert.equal(columnasDeX(sinChoque).length, 1);
});

test("un grupo con pocas celdas para el tamaño del archivo no es una columna", () => {
  // Tres celdas sobre mil filas son un pedazo de descripción que quedó suelto,
  // no una columna. Con el piso de tres solo, eran una columna y corrían el
  // índice de todas las demás.
  const filas = [];
  for (let i = 0; i < 1000; i++) filas.push({ celdas: [{ x: 15 }, { x: 41 }, { x: 244 }] });
  filas[10].celdas.push({ x: 152 });
  filas[11].celdas.push({ x: 156 });
  filas[12].celdas.push({ x: 160 });
  assert.equal(columnasDeX(filas).length, 3);

  // En un archivo chico, en cambio, tres SÍ alcanzan.
  const chicas = [];
  for (let i = 0; i < 20; i++) chicas.push({ celdas: [{ x: 15 }, { x: 41 }, { x: 244 }] });
  for (const i of [3, 4, 5]) chicas[i].celdas.push({ x: 152 });
  assert.equal(columnasDeX(chicas).length, 4);
});
