// EJERCER UNA FILA DE `TablaSugeridos` O DE `PreparadosTable`, MONTADA DE VERDAD.
//
// Lo usan los candados de la tanda 9 de la regla única de unidades. Monta la
// tabla con una fila en jsdom (el mismo de `montarPantallaPedidos.mjs`) y le
// hace siempre la misma secuencia: más en todos los botones, encender la
// rotura, más dos veces, menos, tipear 4 y 30, apagar la rotura, menos, tipear
// 7. En cada paso anota los campos, los números que se leen en la fila y lo que
// la tabla le mandó a la página (`onEditSugerido` / `onEditPreparado`), después
// del debounce de 350 ms.

const A = await import("../../../app/modulos/pedidos/montarPantallaPedidos.mjs");
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: TablaSugeridos } = await import("./TablaSugeridos.jsx");
const { default: PreparadosTable } = await import("./PreparadosTable.jsx");

export const desmontarTodo = A.desmontarTodo;

/** Los campos y los números de la fila (el total "= 51 uds" incluido). */
function foto(cont) {
  const campos = [...cont.querySelectorAll("input")].map((i) => (i.type === "checkbox" ? `[${i.checked ? "x" : " "}]` : i.value));
  const texto = cont.querySelector("tbody")?.textContent ?? "";
  return [campos, (texto.match(/\d+(?:[.,]\d+)?/g) || []).join(" ")];
}
const botonesDe = (cont, t) => [...cont.querySelectorAll("tbody button")].filter((b) => b.textContent.trim() === t);
const roturaDe = (cont) => botonesDe(cont, "Rotura")[0] ?? cont.querySelector('tbody input[type="checkbox"]');
async function click(b) {
  await A.act(async () => { b.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}
async function escribir(input, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await A.act(async () => {
    input.dispatchEvent(new window.FocusEvent("focus", { bubbles: true }));
    set.call(input, String(valor));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await A.act(async () => {
    input.dispatchEvent(new window.FocusEvent("blur", { bubbles: true }));
    input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
}
const esperar = (ms) => A.act(async () => { await new Promise((r) => setTimeout(r, ms)); });

/**
 * @param {"sugeridos"|"preparados"} cual
 * @param {object} fila  la fila como se la pasa la página
 * @returns {Array<[string, string[], string, Array]>}  [paso, campos, números, lo emitido]
 */
export async function ejercerTabla(cual, fila) {
  const emitidos = [];
  const cont = document.createElement("div");
  document.body.appendChild(cont);
  const root = createRoot(cont);
  const comun = { page: 1, totalPages: 1, onPrev() {}, onNext() {}, pageSize: 25, onPageSizeChange() {} };
  const el =
    cual === "sugeridos"
      ? createElement(TablaSugeridos, { ...comun, datos: [fila], onEditSugerido: (...a) => emitidos.push(a), onMarcarPreparado: (...a) => emitidos.push(["marcar", ...a]) })
      : createElement(PreparadosTable, { ...comun, datos: [fila], onEditPreparado: (...a) => emitidos.push(a), onDesmarcar: (...a) => emitidos.push(["quitar", ...a]) });
  await A.act(async () => { root.render(el); });

  const pasos = [["inicio", ...foto(cont), []]];
  const anotar = async (n) => {
    await esperar(400);
    pasos.push([n, ...foto(cont), emitidos.splice(0)]);
  };

  for (const b of botonesDe(cont, "+")) await click(b);
  await anotar("+ en todos");
  if (roturaDe(cont)) {
    await click(roturaDe(cont));
    await anotar("rotura encendida");
    for (const b of botonesDe(cont, "+")) { await click(b); await click(b); }
    await anotar("+ dos veces en todos");
    for (const b of botonesDe(cont, "−")) await click(b);
    await anotar("− en todos");
    const campos = [...cont.querySelectorAll('tbody input:not([type="checkbox"])')];
    for (const [i, c] of campos.entries()) await escribir(c, i === 0 ? 4 : 30);
    await anotar("tipea 4 y 30");
    await click(roturaDe(cont));
    await anotar("rotura apagada");
  }
  for (const b of botonesDe(cont, "−")) await click(b);
  await anotar("− en todos, al final");
  const campo = cont.querySelector('tbody input:not([type="checkbox"])');
  if (campo) {
    await escribir(campo, 7);
    await anotar("tipea 7");
  }
  await A.act(async () => { root.unmount(); });
  cont.remove();
  return pasos;
}
