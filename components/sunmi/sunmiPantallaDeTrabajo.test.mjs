// EL PIE DE `SunmiPantallaDeTrabajo` NO SE MUEVE.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiPantallaDeTrabajo.test.mjs
//
// El pie era `sticky` y se movía: pegado al borde del CONTENIDO del `<main>` que
// scrollea, dejaba ver tarjetas por la franja del padding y, al final de la
// lista, un hueco entre la barra y el borde del teléfono. Ahora es `fixed`,
// clavado abajo, con un lugar reservado en el flujo del alto MEDIDO de la barra.
// Ver el punto 4 de la pieza.
//
// jsdom no maqueta: `getBoundingClientRect` devuelve ceros. Acá se le hace
// contestar medidas conocidas —las del pie de la recepción medido a 360 px:
// 338 de ancho arrancando en x=7— para poder afirmar que la pieza copia lo
// medido y no un número propio.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "Node", "Event", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Lo que "mide el navegador", por elemento.
const medidas = { barra: 57, lugarIzquierda: 7, lugarAncho: 338, nav: 0 };
dom.window.Element.prototype.getBoundingClientRect = function () {
  const caja = (left, width, height) => ({ left, width, height, top: 0, right: left + width, bottom: height, x: left, y: 0 });
  if (this.hasAttribute("data-pie-de-pantalla")) return caja(0, medidas.lugarAncho, medidas.barra);
  if (this.hasAttribute("data-pie-reservado")) return caja(medidas.lugarIzquierda, medidas.lugarAncho, 0);
  if (this.hasAttribute("data-nav-inferior")) return caja(0, 360, medidas.nav);
  return caja(0, 0, 0);
};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: SunmiPantallaDeTrabajo } = await import("./SunmiPantallaDeTrabajo.jsx");

let raiz = null;
afterEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  raiz = null;
  document.body.replaceChildren();
  Object.assign(medidas, { barra: 57, lugarIzquierda: 7, lugarAncho: 338, nav: 0 });
});

async function montar({ conNav = false } = {}) {
  const lugar = document.createElement("div");
  document.body.replaceChildren(lugar);
  if (conNav) {
    const nav = document.createElement("nav");
    nav.setAttribute("data-nav-inferior", "");
    document.body.appendChild(nav);
  }
  raiz = createRoot(lugar);
  await act(async () => {
    raiz.render(
      React.createElement(SunmiPantallaDeTrabajo, {
        lista: React.createElement("p", null, "la última tarjeta"),
        despuesDeLista: React.createElement("p", null, "el paginador"),
        pieDePantalla: React.createElement("button", null, "Enviar"),
      })
    );
  });
  return {
    barra: document.querySelector("[data-pie-de-pantalla]"),
    lugar: document.querySelector("[data-pie-reservado]"),
  };
}

const pasarAPixeles = (n) => `${n}px`;

test("la barra está clavada a la ventana: fixed, abajo, y no sticky", async () => {
  const { barra } = await montar();
  assert.ok(barra, "no se dibujó la barra");
  assert.match(barra.className, /\bfixed\b/, "la barra no es fixed");
  assert.doesNotMatch(barra.className, /\bsticky\b/, "la barra volvió a ser sticky");
  assert.equal(barra.style.bottom, "0px", "sin barra de navegación, va en el borde de abajo");
  // Y conserva lo que dibujaba: el gutter, el borde de arriba y la superficie.
  assert.match(barra.className, /px-4 pt-2 pb-2 border-t sunmi-divider sunmi-surface/);
  assert.match(barra.className, /\bz-10\b/, "el apilado tiene que quedar debajo de las hojas del kit");
});

test("el lugar reservado al pie del contenido mide lo que mide la barra", async () => {
  const { barra, lugar } = await montar();
  assert.ok(lugar, "no hay lugar reservado al pie del contenido");
  // Está en el flujo, DESPUÉS de lo que viene tras la lista, y es de la pieza.
  const seccion = lugar.closest("section");
  assert.ok(seccion, "el lugar reservado no está adentro de la sección de la pieza");
  assert.ok(seccion.textContent.indexOf("el paginador") > -1);
  const orden = [...seccion.children];
  assert.ok(orden.indexOf(lugar) > orden.findIndex((n) => n.textContent === "el paginador"), "el lugar va después del paginador");
  assert.equal(lugar.style.height, pasarAPixeles(57), "el lugar no copia el alto medido de la barra");
  // Y la barra toma el ancho y la izquierda del lugar: el gutter de siempre.
  assert.equal(barra.style.left, pasarAPixeles(7));
  assert.equal(barra.style.width, pasarAPixeles(338));
});

test("si la barra cambia de alto, el lugar reservado se vuelve a medir", async () => {
  const { lugar } = await montar();
  medidas.barra = 98; // aparece un segundo renglón en la barra
  await act(async () => {
    window.dispatchEvent(new window.Event("resize"));
  });
  assert.equal(lugar.style.height, pasarAPixeles(98), "el lugar se quedó con el alto viejo");
});

test("con la barra de navegación del celular, el pie se apoya encima, a su alto medido", async () => {
  medidas.nav = 64;
  const { barra } = await montar({ conNav: true });
  assert.equal(barra.style.bottom, pasarAPixeles(64), "la barra de navegación lo taparía");
});

test("se arregla en la pieza: ninguna pantalla compensa el pie a mano", () => {
  // Las consumidoras, enumeradas con git sobre el repo entero (también lo sin
  // commitear). Ninguna reserva lugar ni clava su propia barra.
  const consumidoras = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "SunmiPantallaDeTrabajo", "--", "*.jsx"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter((f) => f && f !== "components/sunmi/SunmiPantallaDeTrabajo.jsx");
  assert.ok(consumidoras.length >= 3, `muy pocas consumidoras: ${consumidoras.join(", ")}`);
  // Solo el lugar reservado: es lo que una pantalla copiaría para compensar el
  // pie. Un `sticky bottom-0` propio puede existir por otro motivo —compras
  // tiene el suyo en la barra de ESCRITORIO, que no es la de la pieza—.
  // El resultado es un booleano con el nombre del archivo: un `doesNotMatch`
  // sobre el fuente entero vuelca miles de líneas en el mensaje y el runner se
  // queda serializándolas.
  const queCompensan = consumidoras.filter((f) =>
    /data-pie-reservado/.test(readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, ""))
  );
  assert.deepEqual(queCompensan, [], "estas pantallas reservan el lugar del pie por su cuenta");
});
