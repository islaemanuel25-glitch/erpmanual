// Candados del contador de hardcodeo.
//
// Ejercen el COMPORTAMIENTO —qué encuentra y qué reemplazo ofrece sobre un texto
// dado— y no la forma del archivo. El texto de prueba de abajo es un archivo
// falso con casos conocidos: cada línea está puesta para que una categoría la
// tenga que ver, o para que NO la vea.
//
// Los casos negativos importan tanto como los positivos. Un contador que marca
// de más se deja de mirar a la semana, y entonces no protege nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

import {
  contarArchivo,
  compararConLineaBase,
  contadorVacio,
  sumar,
  tokenDeEspaciado,
  TOKENS_TIPOGRAFIA,
  PRIORIDAD,
  ETIQUETAS,
  sinComentarioAlFinal,
} from "./contador.js";

const OPCIONES = { patronesColor: [/\bbg-slate-/, /\btext-red-/], excepcionesColor: [/text-slate-900\/80/] };

// Archivo de prueba. Cada línea tiene su motivo al lado.
const ARCHIVO = `
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function Pantalla() {
  return (
    <div className="bg-slate-700 p-2">            {/* color: clase de Tailwind */}
      <span className="text-[11px]">once</span>    {/* medida: hay token */}
      <span className="text-[13px]">trece</span>   {/* medida: no hay token */}
      <div className="w-[56px]" />                 {/* medida: 56/3.5 = 16 */}
      <div className="w-[76px]" />                 {/* medida: no cae en escala */}
      <button onClick={x}>crudo</button>           {/* crudo: hay SunmiButton */}
      <input value={v} />                          {/* crudo: hay SunmiInput */}
      <table><tbody><tr>
        <td>una</td><td className="text-right">dos</td>{/* celda: dos en la misma línea */}
        <td
          className="px-3">tres</td>                {/* celda: la etiqueta cortada cuenta igual */}
        <tdd>no es una celda</tdd>                  {/* NO cuenta: no es <td> */}
      </tr></tbody></table>
      <div className="fixed inset-0 bg-black/60"/>  {/* modal a mano */}
      <p className="pos-text-muted">tema</p>        {/* tema paralelo */}
      <SunmiSelectAdv value={v} className="w-[85px]">
        <SunmiSelectOption value={1}>uno</SunmiSelectOption>
      </SunmiSelectAdv>
      <span style={{ color: "#f59e0b" }} />        {/* color literal */}
      <div style={{ borderColor: "var(--pos-warning, #f59e0b)" }} />
    </div>
  );
}
// bg-slate-900 en un comentario NO cuenta
`;

const contar = (txt = ARCHIVO, ruta = "components/prueba/Pantalla.jsx") =>
  contarArchivo(ruta, txt, OPCIONES);

test("cuenta un color de Tailwind y no cuenta el que está en un comentario", () => {
  const { hallazgos } = contar();
  const colores = hallazgos.filter((h) => h.categoria === "color" && h.que.includes("bg-slate"));
  assert.equal(colores.length, 1, "debería ver solo el del JSX, no el del comentario");
  assert.equal(colores[0].linea, 6);
});

test("una medida con token equivalente lo dice; una sin token, no lo inventa", () => {
  const { hallazgos } = contar();
  const once = hallazgos.find((h) => h.que === "text-[11px]");
  const trece = hallazgos.find((h) => h.que === "text-[13px]");
  assert.equal(once.reemplazo, "text-sm2 vale lo mismo");
  assert.equal(trece.reemplazo, null, "13px no tiene token: no se inventa uno");
  assert.ok(trece.detalle.includes("sin token"));
});

test("el ancho que cae en la escala de espaciado ofrece su token", () => {
  const { hallazgos } = contar();
  assert.equal(hallazgos.find((h) => h.que === "w-[56px]").reemplazo, "w-16 vale lo mismo");
  assert.equal(hallazgos.find((h) => h.que === "w-[76px]").reemplazo, null);
});

test("los tokens de tipografía son los tres que existen de verdad", () => {
  // Si alguien agrega uno a tailwind.config.js y no acá, la ficha va a decir
  // "sin token equivalente" sobre algo que sí lo tiene.
  assert.deepEqual(Object.keys(TOKENS_TIPOGRAFIA).map(Number).sort((a, b) => a - b), [10, 11, 14]);
  assert.equal(tokenDeEspaciado(56, "w"), "w-16");
  assert.equal(tokenDeEspaciado(76, "w"), null);
  assert.equal(tokenDeEspaciado(14, "gap"), "gap-4");
});

test("EL CONTEO MIRA TAMBIÉN LO NO TRACKEADO", () => {
  // `git ls-files` a secas lista solo lo trackeado, así que un archivo nuevo no
  // lo veía nadie hasta que alguien hiciera `git add`. El síntoma fue el peor
  // posible: al mudar una tabla a un archivo nuevo, el trinquete informó que el
  // hardcodeo había BAJADO catorce celdas. No había bajado: se había mudado a un
  // archivo que el conteo no leía.
  //
  // Esto mira el texto del script, que es lo único que se puede afirmar sin
  // escribir archivos dentro del repo desde un candado. El caso se ejerció a
  // mano y está contado en el commit: se creó un archivo con hardcodeo sin
  // agregarlo y el trinquete lo contó.
  const src = fs.readFileSync(path.join(RAIZ, "scripts/hardcodeo.mjs"), "utf8");
  const llamada = src.slice(src.indexOf("function archivosDeInterfaz"), src.indexOf("function escanear"));
  assert.match(llamada, /"--others"/, "no enumera lo no trackeado");
  assert.match(llamada, /"--exclude-standard"/, "sin esto entrarían node_modules y .next");
  assert.match(llamada, /new Set\(/, "sin deduplicar, un archivo nuevo ya agregado contaría dos veces");
});

test("CUENTA LAS CELDAS ESCRITAS A MANO, incluida la de la etiqueta cortada", () => {
  // Tres: dos en la misma línea y una con los atributos en la línea siguiente.
  // Esa última es la que un patrón `<td ` o `<td>` pierde, y en el repo son cinco.
  const celdas = contar().hallazgos.filter((h) => h.categoria === "celda");
  assert.equal(celdas.length, 3, celdas.map((c) => c.linea).join(", "));
  assert.equal(celdas[0].reemplazo, "SunmiTable en modo por columnas");
});

test("UN `<td>` DENTRO DE UN COMENTARIO no es una celda", () => {
  // Apareció escribiendo el candado de arriba: el comentario que explicaba el
  // caso decía `<td>` y se contó solo. `esComentario` saltea la línea que es
  // toda comentario, pero no el comentario pegado al final del código.
  const { hallazgos } = contar('<div>hola</div> {/* acá iría un <td> */}', "components/x/Y.jsx");
  assert.equal(hallazgos.filter((h) => h.categoria === "celda").length, 0);
  assert.equal(sinComentarioAlFinal("<td>x</td> // y otro <td>").match(/<td/g).length, 1);
});

test("`<tdd>` NO es una celda", () => {
  // Sin el corte por letra, cualquier etiqueta que empiece con td contaría.
  const { hallazgos } = contar("<tdd>x</tdd>", "components/x/Y.jsx");
  assert.equal(hallazgos.filter((h) => h.categoria === "celda").length, 0);
});

test("EL CONTADOR NO DECIDE si esa tabla podría ser por columnas", () => {
  // Solo cuenta. Decidirlo pide entender la línea y marcaría de más, que es el
  // mismo criterio por el que este contador no mira números de negocio. Una
  // celda con `rowSpan` —el único caso que el relevamiento dejó afuera— se
  // cuenta igual, y está bien: el conteo no es una orden de migrar.
  const { hallazgos } = contar('<td rowSpan={3}>x</td>', "components/x/Y.jsx");
  assert.equal(hallazgos.filter((h) => h.categoria === "celda").length, 1);
});

test("una celda DENTRO DEL KIT no se cuenta: el kit es el mecanismo", () => {
  const { hallazgos } = contar("<td>x</td>", "components/sunmi/SunmiTable.jsx");
  assert.equal(hallazgos.filter((h) => h.categoria === "celda").length, 0);
});

test("cuenta los elementos crudos y ofrece el componente del kit", () => {
  const { hallazgos } = contar();
  const crudos = hallazgos.filter((h) => h.categoria === "crudo");
  assert.deepEqual(crudos.map((h) => h.que).sort(), ["<button>", "<input>"]);
  assert.equal(crudos.find((h) => h.que === "<button>").reemplazo, "SunmiButton");
});

test("NO cuenta elementos crudos dentro del kit: ahí es donde tienen que estar", () => {
  const { conteo } = contar(ARCHIVO, "components/sunmi/SunmiButton.jsx");
  assert.equal(conteo.crudo, 0);
});

test("ve un modal armado a mano, y no lo ve si el archivo usa el del kit", () => {
  assert.equal(contar().conteo.modal, 1);
  const conKit = ARCHIVO.replace("import SunmiButton", "import SunmiModalLayout");
  assert.equal(contar(conKit).conteo.modal, 0, "si importa SunmiModalLayout, lo que arma no es a mano");
});

test("ve el componente del kit que pisa la clase, aunque tenga hijos", () => {
  // El caso que se escapó al escribir esto: una expresión que exigiera `/>` no
  // ve un `<SunmiSelectAdv …>` con opciones adentro, que es como se usan casi
  // todos.
  const { hallazgos } = contar();
  const pisados = hallazgos.filter((h) => h.categoria === "kit-pisado");
  assert.equal(pisados.length, 1);
  assert.ok(pisados[0].que.includes("SunmiSelectAdv"));
  assert.ok(pisados[0].detalle.includes("w-full"));
});

test("ve la clase del tema paralelo", () => {
  const { hallazgos } = contar();
  assert.equal(hallazgos.filter((h) => h.categoria === "tema-paralelo").length, 1);
});

test("distingue un color literal de uno que es respaldo de una variable", () => {
  const { hallazgos } = contar();
  const hex = hallazgos.filter((h) => h.categoria === "color" && h.que === "#f59e0b");
  assert.equal(hex.length, 2);
  const literal = hex.find((h) => h.detalle === "color literal");
  const fallback = hex.find((h) => h.detalle && h.detalle.includes("respaldo"));
  assert.ok(literal, "el del style suelto es literal");
  assert.ok(fallback, "el de var(--…, #hex) es respaldo y se informa aparte");
  assert.equal(fallback.reemplazo, null, "no se ofrece reemplazo: el token ya se está usando");
});

test("respeta la lista de excepciones de color", () => {
  const { conteo } = contar(`<div className="text-slate-900/80 text-red-500" />`);
  assert.equal(conteo.color, 0, "la línea entera está exceptuada");
});

test("todo hallazgo trae archivo y línea: sin eso no se puede accionar", () => {
  const { hallazgos } = contar();
  assert.ok(hallazgos.length > 0);
  for (const h of hallazgos) {
    assert.equal(h.archivo, "components/prueba/Pantalla.jsx");
    assert.ok(Number.isInteger(h.linea) && h.linea > 0, `línea inválida en ${h.que}`);
  }
});

test("el conteo es la cuenta de los hallazgos, no un número aparte", () => {
  // Si el conteo se calculara por su lado, podría discrepar de la lista que se
  // muestra — y entonces la ficha y el trinquete dirían cosas distintas.
  const { hallazgos, conteo } = contar();
  for (const cat of Object.keys(conteo)) {
    assert.equal(conteo[cat], hallazgos.filter((h) => h.categoria === cat).length, cat);
  }
});

test("sumar junta conteos sin perder ni inventar categorías", () => {
  const a = { ...contadorVacio(), color: 2, medida: 5 };
  const b = { ...contadorVacio(), color: 3, crudo: 1 };
  const t = sumar([a, b]);
  assert.equal(t.color, 5);
  assert.equal(t.medida, 5);
  assert.equal(t.crudo, 1);
  assert.equal(t.modal, 0);
});

test("cada categoría tiene prioridad y etiqueta: la ficha se ordena con eso", () => {
  const cats = Object.keys(contadorVacio());
  for (const c of cats) {
    assert.ok(PRIORIDAD.includes(c), `${c} no está en PRIORIDAD`);
    assert.ok(ETIQUETAS[c], `${c} no tiene etiqueta`);
  }
  assert.equal(PRIORIDAD.length, cats.length);
});

// ── El trinquete ───────────────────────────────────────────────────────────

const BASE = { color: 10, "tema-paralelo": 5, modal: 2, "kit-pisado": 1, crudo: 20, medida: 100 };

test("EL TRINQUETE SE PONE ROJO cuando un número sube", () => {
  const r = compararConLineaBase(BASE, { ...BASE, color: 11 });
  assert.equal(r.estado, "subio");
  assert.equal(r.subieron.length, 1);
  assert.deepEqual(r.subieron[0], { categoria: "color", antes: 10, ahora: 11, delta: 1 });
});

test("EL TRINQUETE SE PONE VERDE cuando un número baja, y lo avisa", () => {
  const r = compararConLineaBase(BASE, { ...BASE, medida: 90 });
  assert.equal(r.estado, "bajo");
  assert.equal(r.bajaron[0].delta, -10);
  assert.equal(r.subieron.length, 0);
});

test("sin cambios es verde y no pide nada", () => {
  const r = compararConLineaBase(BASE, { ...BASE });
  assert.equal(r.estado, "sin-cambio");
  assert.equal(r.subieron.length + r.bajaron.length, 0);
});

test("una categoría que sube NO se compensa con otra que baja", () => {
  // Cambiar diez colores fijos por diez medidas mágicas no es progreso, es
  // mudanza. Si se compensaran, el trinquete dejaría pasar eso en silencio.
  const r = compararConLineaBase(BASE, { ...BASE, color: 20, medida: 90 });
  assert.equal(r.estado, "subio");
  assert.equal(r.subieron.length, 1);
  assert.equal(r.bajaron.length, 1);
});

test("una categoría que falta en la base cuenta como cero, no como ausente", () => {
  // Al agregar una categoría nueva, la base vieja no la tiene. Tratarla como
  // ausente dejaría entrar cualquier cantidad sin que el trinquete diga nada.
  const r = compararConLineaBase({ color: 10 }, { color: 10, modal: 3 });
  assert.equal(r.estado, "subio");
  assert.equal(r.subieron[0].categoria, "modal");
  assert.equal(r.subieron[0].antes, 0);
});

test("el trinquete mira TODAS las categorías, no solo las que están en la base", () => {
  const r = compararConLineaBase({}, {});
  assert.equal(r.estado, "sin-cambio");
});

test("una clase con ! NO se marca como pisada: el ! le gana al componente", () => {
  // `!w-44` agrega !important y por lo tanto SÍ se aplica. Marcarlo mandaría a
  // arreglar algo que ya está resuelto. Salió de la primera corrida real de la
  // ficha, donde el auditor abrió el archivo y vio el signo.
  const conBang = `<SunmiSelectAdv value={v} className="!w-44"><X/></SunmiSelectAdv>`;
  assert.equal(contar(conBang).conteo["kit-pisado"], 0);
  const sinBang = `<SunmiSelectAdv value={v} className="w-44"><X/></SunmiSelectAdv>`;
  assert.equal(contar(sinBang).conteo["kit-pisado"], 1);
});
