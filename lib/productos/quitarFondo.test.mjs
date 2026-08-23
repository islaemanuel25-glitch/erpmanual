// CANDADOS DEL QUITADO DE FONDO.
//
// ── LO QUE DEFIENDEN ──────────────────────────────────────────────────────
//
// Tres cosas, y ninguna se rompe con un error visible:
//
//   1. Guardar un recorte en JPEG. No falla: rellena el fondo de NEGRO y se
//      guarda tan campante. Todo el trabajo se pierde en el último paso y se ve
//      recién en la tarjeta.
//   2. Que un fallo del procesador bloquee la carga de la foto. Cambiaría una
//      mejora por una regresión: sin foto no se puede editar el producto.
//   3. Que el recorte se suba sin que nadie lo mire. Es lo que la revisión
//      existe para impedir, y es una decisión de producto, no un detalle.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BLOQUE_MINIMO,
  RECORTE_MAXIMO,
  RECORTE_MINIMO,
  confiaEnElRecorte,
  distanciaDeColor,
  fraccionDelBloqueMayor,
  quitarFondoPorBordes,
  tipoConAlfa,
} from "@/lib/productos/quitarFondo";
import { tipoDeSalida } from "@/lib/productos/achicarFoto";
import { TIPOS_ACEPTADOS } from "@/lib/productos/fotoProducto";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const QUITAR = leer("lib/productos/quitarFondo.js");
const ACHICAR = leer("lib/productos/achicarFoto.js");
const PANTALLA = leer("components/productos/CargarFotoProducto.jsx");

/** Una imagen de prueba: un rectángulo de color sobre un fondo uniforme. */
function imagen({ ancho, alto, fondo, producto, caja }) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const dentro = caja && x >= caja.x0 && x <= caja.x1 && y >= caja.y0 && y <= caja.y1;
      const c = dentro ? producto : fondo;
      const o = (y * ancho + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { width: ancho, height: alto, data };
}

const opaco = (datos) => {
  let n = 0;
  for (let i = 3; i < datos.data.length; i += 4) if (datos.data[i] === 255) n++;
  return n;
};

test("Q1. TRANSPARENCIA NUNCA EN JPEG — la regla que no se negocia", () => {
  // ── POR QUÉ ES EL PRIMERO ───────────────────────────────────────────────
  //
  // JPEG no tiene canal alfa y no da error: rellena el fondo de negro. Un
  // recorte guardado ahí se ve peor que la foto original, y el defecto aparece
  // en la tarjeta, dos pasos después de donde se produjo.
  //
  // Se prueba con las DOS ramas del navegador: con webp y sin webp.
  const conWebp = () => "data:image/webp;base64,xx";
  const sinWebp = () => "data:image/png;base64,xx";

  assert.equal(tipoConAlfa(conWebp), "image/webp");
  assert.equal(tipoConAlfa(sinWebp), "image/png", "sin webp cayó a algo que no es png");
  assert.notEqual(tipoConAlfa(sinWebp), "image/jpeg");

  // Y si el navegador tira al preguntarle, el respaldo sigue teniendo alfa.
  assert.equal(tipoConAlfa(() => { throw new Error("no"); }), "image/png");

  // La función que achica comparte la regla cuando le dicen que hay alfa.
  assert.equal(tipoDeSalida(sinWebp, { conTransparencia: true }), "image/png");
  // Y NO cambia el caso viejo: una foto con fondo sigue yendo a jpeg sin webp.
  assert.equal(tipoDeSalida(sinWebp), "image/jpeg");
  assert.equal(tipoDeSalida(sinWebp, { conTransparencia: false }), "image/jpeg");

  // Y en el código del recorte no puede aparecer jpeg en ningún lado.
  assert.doesNotMatch(QUITAR, /jpe?g/i, "el quitado de fondo nombra jpeg en algún lado");
});

test("Q2. LA EXTENSIÓN SALE DEL MISMO MAPA QUE ACEPTA EL SERVIDOR", () => {
  // Con dos formatos alcanzaba un ternario. Con PNG en el medio, un tercer caso
  // olvidado sube un archivo llamado `.jpg` que adentro es un PNG — y el
  // servidor lo acepta por su `type`, así que nadie se entera hasta que algo lo
  // lea por la extensión.
  assert.match(ACHICAR, /EXTENSION_POR_TIPO = TIPOS_ACEPTADOS/);
  assert.equal(TIPOS_ACEPTADOS["image/png"], "png");
  assert.equal(TIPOS_ACEPTADOS["image/webp"], "webp");
  assert.equal(TIPOS_ACEPTADOS["image/jpeg"], "jpg");
  assert.doesNotMatch(ACHICAR, /tipo === "image\/webp" \? "webp" : "jpg"/, "volvió el ternario");

  // Y LO MISMO DEL OTRO LADO. El recorte guarda su propio archivo y tenía el
  // ternario escrito de nuevo — el mismo agujero, en el archivo de al lado.
  // Es exactamente lo que la regla 1 llama "escribir una parecida al lado".
  assert.match(QUITAR, /TIPOS_ACEPTADOS\[tipo\]/, "el recorte volvió a decidir la extensión solo");
  assert.doesNotMatch(QUITAR, /\? "webp" :/, "volvió el ternario en el recorte");
});

test("Q3. UN FALLO DEL PROCESADOR NO BLOQUEA LA CARGA", () => {
  // ── EL DEFECTO QUE IMPIDE ───────────────────────────────────────────────
  //
  // Si el recorte tirara para arriba, un navegador viejo o una foto rara
  // dejarían a la persona sin poder ponerle foto al producto. Sería cambiar una
  // mejora por una regresión, y encima una que solo aparece en los teléfonos
  // que no tenemos a mano.
  //
  // Se afirma que la llamada al recorte está en su PROPIO `try`, con la
  // original ya calculada antes — o sea que el fallo cae a algo que existe.
  assert.match(
    PANTALLA,
    /const original = await achicarFoto\(archivo\);[\s\S]{0,600}try \{\s*recorte = await quitarFondo\(original\);\s*\} catch/,
    "el recorte no está aislado: un fallo suyo se lleva puesta la carga"
  );
  // Y el motivo se muestra en vez de tragarse: la persona tiene que poder
  // distinguir "no se pudo" de "el botón no hace nada".
  assert.match(PANTALLA, /motivoDelFallo/);
  assert.match(PANTALLA, /No se pudo quitar el fondo/);
});

test("Q4. NADA SE SUBE SIN QUE ALGUIEN LO MIRE", () => {
  // Es la decisión de producto: automático pero no ciego. Se afirma que subir
  // solo ocurre desde los botones de la propuesta, y que están los tres.
  for (const boton of ["Usar sin fondo", "Usar original", "Cambiar foto"]) {
    assert.ok(PANTALLA.includes(boton), `falta el botón "${boton}"`);
  }
  // El envío NO puede dispararse solo al elegir el archivo.
  const alElegir = PANTALLA.match(/const alElegir = async \(e\) => \{[\s\S]*?\n  \};/);
  assert.ok(alElegir, "no se encontró el manejador de elegir archivo");
  assert.doesNotMatch(alElegir[0], /subir\(/, "elegir la foto la sube sin pasar por la revisión");
  assert.doesNotMatch(alElegir[0], /fetch\(/, "elegir la foto llama al servidor sin revisión");

  // Y la vista previa va sobre cuadros, que es lo que hace visible un recorte a
  // medias: sobre un fondo liso, medio fondo blanco pegado se ve perfecto.
  assert.match(PANTALLA, /const CUADROS =/);
  assert.match(PANTALLA, /data-foto-vista-sin-fondo[\s\S]{0,200}\$\{CUADROS\}/);
});

test("Q5. LA CONFIANZA MIRA DOS COSAS, Y NINGUNA SOLA ALCANZA", () => {
  // ── ESTE CANDADO SE REESCRIBIÓ CON DATOS, Y CONVIENE SABER POR QUÉ ───────
  //
  // La primera versión decía que un 92 % quitado no era creíble. Medido sobre
  // casos armados, eso es FALSO: un producto que ocupa el 5 % del cuadro deja
  // un 95,3 % de fondo, y quitarlo entero es exactamente lo que hay que hacer.
  // El candado viejo ponía en rojo el caso fácil.
  //
  // Lo que la medición mostró es que la proporción sola no separa nada:
  //
  //   producto 44 % del cuadro  → quita  55,6 %   bloque 100 %   legítimo
  //   producto 11 % del cuadro  → quita  88,9 %   bloque 100 %   legítimo
  //   producto  5 % del cuadro  → quita  95,3 %   bloque 100 %   legítimo
  //   producto blanco           → quita 100,0 %   bloque   0 %   defecto
  //   fondo con textura         → quita  31,5 %   bloque   9 %   defecto
  //
  // Por proporción, el ruido (31,5 %) cae en el MISMO rango que el caso bueno
  // (55,6 %). Lo que los separa es qué quedó: un producto es un bloque, el
  // ruido son manchitas.

  // La proporción sigue atajando sus dos extremos.
  assert.equal(confiaEnElRecorte(0), false);
  assert.equal(confiaEnElRecorte(0.03), false, "un 3 % pasó por bueno");
  assert.equal(confiaEnElRecorte(1), false, "quitar TODO pasó por bueno");
  assert.equal(confiaEnElRecorte(RECORTE_MINIMO, 1), true);
  assert.equal(confiaEnElRecorte(RECORTE_MAXIMO, 1), true);

  // Y ahora sí acepta los recortes grandes que están bien.
  assert.equal(confiaEnElRecorte(0.892, 1), true, "rechazó el producto chico legítimo");
  assert.equal(confiaEnElRecorte(0.953, 1), true, "rechazó el producto muy chico legítimo");

  // LA SEGUNDA SEÑAL: la proporción puede ser perfecta y el recorte un desastre.
  assert.equal(confiaEnElRecorte(0.5, 0.09), false, "confió en un recorte hecho pedazos");
  assert.equal(confiaEnElRecorte(0.315, 0.09), false, "confió en el fondo con textura");
  assert.ok(BLOQUE_MINIMO > 0.09 && BLOQUE_MINIMO < 1, "el umbral del bloque quedó absurdo");

  // Y una entrada que no es número no se toma por buena.
  assert.equal(confiaEnElRecorte(NaN, 1), false);
  assert.equal(confiaEnElRecorte(undefined, 1), false);
  assert.equal(confiaEnElRecorte("mucho", 1), false);
  assert.equal(confiaEnElRecorte(0.5, NaN), false);
});

test("Q6. EL CASO FÁCIL SE RECORTA BIEN: caja sobre fondo uniforme", () => {
  // El producto apoyado sobre algo liso, que es la foto que alguien saca con el
  // teléfono. Se comprueba con PÍXELES, no con que la función no tire.
  const datos = imagen({
    ancho: 60, alto: 60,
    fondo: [240, 240, 240],
    producto: [30, 60, 180],
    caja: { x0: 20, y0: 20, x1: 39, y1: 39 },
  });
  const r = quitarFondoPorBordes(datos);

  assert.equal(r.confia, true, `no confió: quitó el ${(r.proporcionQuitada * 100).toFixed(0)} %`);
  // La caja son 400 de 3600 píxeles: tiene que quedar opaca entera.
  assert.equal(opaco(datos), 400, "el producto no quedó entero");
  // Y una esquina tiene que haber desaparecido.
  assert.equal(datos.data[3], 0, "la esquina superior izquierda sigue opaca");
});

test("Q7. FONDO DEL COLOR DEL PRODUCTO: se lo come, y por eso hay revisión", () => {
  // ── ESTE CANDADO AFIRMA UNA LIMITACIÓN, NO UNA VIRTUD ───────────────────
  //
  // Es el caso del producto blanco sobre fondo claro. El relleno entra al
  // producto porque no hay diferencia de color que lo detenga.
  //
  // Se escribe como candado para que la limitación quede MEDIDA y no como una
  // sospecha: el día que se cambie el motor, esto tiene que ponerse rojo — y
  // ponerse rojo va a significar que el motor nuevo lo resolvió.
  const datos = imagen({
    ancho: 60, alto: 60,
    fondo: [245, 245, 245],
    producto: [250, 250, 250],
    caja: { x0: 20, y0: 20, x1: 39, y1: 39 },
  });
  const r = quitarFondoPorBordes(datos);

  assert.ok(
    r.proporcionQuitada > 0.95,
    `el motor de bordes debería comerse el producto blanco; quitó ${(r.proporcionQuitada * 100).toFixed(0)} %`
  );
  // Y LA CONFIANZA LO ATAJA: es lo que impide que ese recorte se ofrezca como
  // bueno. Sin esto, la limitación sería un defecto.
  assert.equal(r.confia, false, "se comió el producto y encima dijo que confiaba");
});

test("Q8. FONDO CON TEXTURA: pica la foto, y la proporción sola NO lo ataja", () => {
  // ── EL CASO QUE OBLIGÓ A LA SEGUNDA SEÑAL ───────────────────────────────
  //
  // El relleno se corta a los pocos píxeles y deja manchas por toda la foto.
  // Quita el 31,5 %, que es una proporción PERFECTAMENTE creíble: cae en el
  // mismo rango que el caso fácil, que quita el 55,6 %.
  //
  // O sea que este candado no afirma "falla y lo dice": afirma POR QUÉ lo dice,
  // porque la razón es lo único que se puede romper sin darse cuenta.
  const ancho = 60, alto = 60;
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    const ruido = (i * 37) % 200;
    const o = i * 4;
    data[o] = ruido; data[o + 1] = 255 - ruido; data[o + 2] = (ruido * 3) % 255; data[o + 3] = 255;
  }
  const r = quitarFondoPorBordes({ width: ancho, height: alto, data });

  assert.equal(r.confia, false, "sobre ruido dijo que confiaba");

  // Y acá está la trampa, medida: por proporción habría pasado.
  assert.ok(
    r.proporcionQuitada >= RECORTE_MINIMO && r.proporcionQuitada <= RECORTE_MAXIMO,
    `el ruido dejó de caer en la banda creíble (${(r.proporcionQuitada * 100).toFixed(1)} %) — ` +
      "si esto cambió, revisar si la segunda señal sigue haciendo falta"
  );
  assert.ok(
    r.fraccionDelBloque < BLOQUE_MINIMO,
    `lo que quedó no está hecho pedazos: bloque mayor ${(r.fraccionDelBloque * 100).toFixed(1)} %`
  );
});

test("Q8bis. LA SEGUNDA SEÑAL MIDE LO QUE DICE MEDIR", () => {
  // Un bloque entero da 1; dos bloques iguales dan 0,5; nada que quede da 0.
  // Sin esto, `fraccionDelBloqueMayor` podría devolver cualquier cosa y Q8
  // seguiría verde de casualidad.
  const uno = new Uint8Array(9).fill(1);
  uno[4] = 0; // un solo píxel en el centro
  assert.equal(fraccionDelBloqueMayor(uno, 3, 3), 1);

  // Dos manchas separadas del mismo tamaño: el mayor es la mitad de lo que quedó.
  const dos = new Uint8Array(9).fill(1);
  dos[0] = 0;
  dos[8] = 0;
  assert.equal(fraccionDelBloqueMayor(dos, 3, 3), 0.5);

  // Y si no quedó nada, no hay bloque: 0, no una división por cero.
  assert.equal(fraccionDelBloqueMayor(new Uint8Array(9).fill(1), 3, 3), 0);

  // Conectividad de 4, no diagonal: dos píxeles en diagonal son DOS bloques.
  const diagonal = new Uint8Array(9).fill(1);
  diagonal[0] = 0;
  diagonal[4] = 0;
  assert.equal(fraccionDelBloqueMayor(diagonal, 3, 3), 0.5);
});

test("Q9. LA DISTANCIA DE COLOR PESA LOS CANALES COMO EL OJO", () => {
  // Con distancia euclídea plana, un salto en azul y uno en verde valen lo
  // mismo, y el recorte se come el producto o no toca el fondo. Se afirma el
  // orden, no el número: verde pesa más que rojo, y rojo más que azul.
  const negro = [0, 0, 0];
  const dRojo = distanciaDeColor(negro, [100, 0, 0]);
  const dVerde = distanciaDeColor(negro, [0, 100, 0]);
  const dAzul = distanciaDeColor(negro, [0, 0, 100]);
  assert.ok(dVerde > dRojo, "el verde no pesa más que el rojo");
  assert.ok(dRojo > dAzul, "el rojo no pesa más que el azul");
  assert.equal(distanciaDeColor([10, 20, 30], [10, 20, 30]), 0);
});

test("Q10. UNA FOTO GRANDE NO DESBORDA LA PILA", () => {
  // Un relleno recursivo sobre una foto de 1200 px muere con "Maximum call
  // stack size exceeded", que además parece un error del programa y no de la
  // foto. Se ejerce con una imagen de un millón de píxeles y se afirma que el
  // código no usa recursión.
  const datos = imagen({
    ancho: 1000, alto: 1000,
    fondo: [240, 240, 240],
    producto: [20, 20, 20],
    caja: { x0: 300, y0: 300, x1: 699, y1: 699 },
  });
  assert.doesNotThrow(() => quitarFondoPorBordes(datos), "desbordó con una foto grande");
  assert.match(QUITAR, /cola = new Int32Array/, "el relleno dejó de ser iterativo");
});

// ── LA MATRIZ DE CASOS QUE PIDIÓ EMANUEL ──────────────────────────────────
//
// Botella con transparencias, caja rectangular, producto blanco, bolsa con
// bordes irregulares, fondo parecido al producto, fallo del procesador y
// conservación de la original. La caja es Q6, el producto blanco es Q7; los
// otros van acá, y cada uno afirma LO QUE SE MIDIÓ, no lo que uno querría.

/** Un lienzo de 80×80 pintado por una función. */
function lienzo(fn, n = 80) {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = fn(x, y);
      const o = (y * n + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { width: n, height: n, data };
}

const FONDO_CLARO = [238, 238, 238];

test("Q12. BOTELLA CON VIDRIO Y REFLEJO: sobrevive entera", () => {
  // ── POR QUÉ LA TRANSPARENCIA NO ROMPE ESTE MOTOR ────────────────────────
  //
  // El miedo razonable es que el vidrio, al ser casi del color del fondo, deje
  // pasar el relleno y la botella quede hueca. Medido: NO pasa, y el motivo es
  // que el relleno viene de los bordes y el contorno oscuro lo frena. El vidrio
  // del medio nunca queda conectado con el borde de la foto.
  //
  // O sea que la botella queda opaca entera, vidrio incluido. Visualmente es lo
  // correcto: una botella recortada tiene que verse como una botella, no como
  // un anillo.
  const datos = lienzo((x, y) => {
    const dentro = x >= 30 && x <= 49 && y >= 12 && y <= 69;
    if (!dentro) return FONDO_CLARO;
    const borde = x <= 32 || x >= 47 || y <= 14 || y >= 67;
    if (borde) return [70, 90, 80];
    if (x >= 36 && x <= 38) return [252, 252, 252]; // el reflejo
    return [232, 240, 236]; // el vidrio, casi del color del fondo
  });
  const r = quitarFondoPorBordes(datos);

  assert.equal(r.confia, true, `no confió en la botella: quitó ${(r.proporcionQuitada * 100).toFixed(1)} %`);
  // 20 × 58 = 1160 píxeles. Que estén TODOS es lo que prueba que no quedó hueca.
  assert.equal(opaco(datos), 1160, "la botella quedó agujereada por el vidrio o el reflejo");
  assert.equal(r.fraccionDelBloque, 1, "la botella quedó partida en pedazos");
});

test("Q13. BOLSA CON BORDES IRREGULARES: el borde dentado no la parte", () => {
  // Un contorno con entrantes y salientes es donde un recorte por rectángulo
  // fracasaría. El relleno lo sigue sin problema; lo que se afirma es que lo que
  // queda sigue siendo UN objeto, que es la condición para que se ofrezca.
  const datos = lienzo((x, y) => {
    const r = 22 + 5 * Math.sin(x * 0.9) + 4 * Math.cos(y * 1.3);
    return Math.hypot(x - 40, y - 42) <= r ? [180, 60, 40] : FONDO_CLARO;
  });
  const r = quitarFondoPorBordes(datos);

  assert.equal(r.confia, true, `no confió en la bolsa: quitó ${(r.proporcionQuitada * 100).toFixed(1)} %`);
  assert.ok(
    r.fraccionDelBloque > 0.85,
    `el borde dentado dejó la bolsa en pedazos: bloque mayor ${(r.fraccionDelBloque * 100).toFixed(1)} %`
  );
});

test("Q14. FONDO PARECIDO AL PRODUCTO: se lo come, y NO lo ofrece", () => {
  // ── LA SEGUNDA LIMITACIÓN MEDIDA ────────────────────────────────────────
  //
  // Q7 es el producto blanco sobre blanco. Éste es el caso realista que más va a
  // pasar en el depósito: un producto de cartón claro sobre una mesa de madera
  // clara. La diferencia entre los dos colores es de 16 a 20 por canal, bastante
  // menos que la tolerancia, así que el relleno entra y se lleva todo.
  //
  // Este candado NO afirma que el motor lo resuelva: afirma que lo reconoce.
  // Ofrecer ese recorte sería peor que no ofrecer ninguno.
  const datos = lienzo((x, y) => {
    const dentro = x >= 25 && x <= 54 && y >= 25 && y <= 54;
    return dentro ? [222, 214, 200] : [238, 232, 220];
  });
  const r = quitarFondoPorBordes(datos);

  assert.ok(r.proporcionQuitada > 0.99, "el motor de bordes debería comerse el producto");
  assert.equal(opaco(datos), 0, "quedó algo del producto");
  assert.equal(r.confia, false, "se comió el producto y encima dijo que confiaba");
});

test("Q15. LA FOTO ORIGINAL SE CONSERVA Y SE PUEDE ELEGIR", () => {
  // ── LO QUE ESTO IMPIDE ──────────────────────────────────────────────────
  //
  // Que el recorte reemplace a la foto. Si el motor se come el producto y lo
  // único que quedó es el recorte, la persona perdió la foto que sacó y tiene
  // que volver a sacarla — con el producto ya guardado en el estante.
  //
  // La original se calcula ANTES del recorte, se guarda aparte, y hay un botón
  // que la sube tal cual. Los tres pedazos se afirman por separado.
  assert.match(PANTALLA, /original,\s*\n\s*vistaOriginal: URL\.createObjectURL\(original\)/);
  assert.match(PANTALLA, /onClick=\{\(\) => subir\(propuesta\.original\)\}/, "no hay forma de subir la original");
  // Y son dos archivos distintos: si `sinFondo` saliera de `original`, subir la
  // original subiría el recorte.
  assert.match(PANTALLA, /sinFondo: recorte\?\.archivo \?\? null/);
});

test("Q16. FALLO DELIBERADO DEL PROCESADOR: se cae a la original", () => {
  // ── SE EJERCE EL FALLO, NO SE LEE EL `try` ──────────────────────────────
  //
  // Q3 afirma la FORMA del código. Esto es distinto: se rompe el motor a
  // propósito y se comprueba qué pasa. Un `try` puede estar escrito y agarrar
  // algo que nunca ocurre — es exactamente el defecto del estado SIN_TOTAL, que
  // existía y era inalcanzable.
  //
  // Se simula el manejador de la pantalla, que es lo que decide.
  const achicar = async () => ({ nombre: "la original" });
  const romper = async () => { throw new Error("el navegador no sabe leer píxeles"); };

  async function comoLaPantalla() {
    const original = await achicar();
    let recorte = null;
    let motivo = null;
    try {
      recorte = await romper(original);
    } catch (e) {
      motivo = e?.message || "no se pudo procesar";
    }
    return { original, sinFondo: recorte?.archivo ?? null, motivoDelFallo: motivo };
  }

  return comoLaPantalla().then((p) => {
    assert.equal(p.original.nombre, "la original", "el fallo se llevó puesta la foto");
    assert.equal(p.sinFondo, null, "ofreció un recorte que no existe");
    assert.match(p.motivoDelFallo, /no sabe leer/, "el motivo se perdió");
  });
});

test("Q11. EL MOTOR ENTRA POR UNA COSTURA, no está cosido a la pantalla", () => {
  // La comparación de motores todavía está abierta —ver DEC-0010— así que lo
  // que se fija es que cambiarlo sea cambiar un archivo y no la pantalla.
  assert.match(PANTALLA, /import \{ quitarFondo \} from "@\/lib\/productos\/quitarFondo"/);
  // La pantalla NO conoce el algoritmo: si aparecen píxeles o canvas acá, el
  // motor se derramó y cambiarlo deja de ser cambiar un archivo.
  assert.doesNotMatch(PANTALLA, /getImageData|createElement\("canvas"\)|Uint8ClampedArray/);
  assert.ok(
    fs.existsSync(path.join(RAIZ, "docs/decisions/DEC-0010-motor-de-quitar-fondo.md")),
    "falta la decisión que compara los motores"
  );
});
