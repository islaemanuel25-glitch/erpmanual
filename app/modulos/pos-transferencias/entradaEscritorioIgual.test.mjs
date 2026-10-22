// LA ENTRADA DE POS · TRANSFERENCIAS EN LA COMPUTADORA SE VE IGUAL QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/entradaEscritorioIgual.test.mjs
//
// El 2026-10-22 los selectores de "transferencia sin pedido" y su lógica
// salieron de `page.jsx` a `components/pos-transferencias/TransferenciaSinPedido.jsx`,
// para que la entrada del celular los ofrezca detrás de un botón. La condición:
// desde 1024 px se ve lo de hoy.
//
// `entradaEscritorioAntes.fixture.json` es el HTML que dibujaba la página en la
// computadora ANTES de sacarlos (tomado sobre 4cd3ba7), montada con el arnés de
// Pedidos y las respuestas REALES del depósito y de un admin (sección 14 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`), que van guardadas junto con
// la foto.
//
// La ÚNICA diferencia de texto admitida, y es de nombre y no de píxeles: los
// tamaños escritos a mano de los selectores pasaron a sus tokens, que el
// config define como exactamente esos píxeles (se comprueba acá mismo).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./page.jsx");

afterEach(A.desmontarTodo);

const foto = JSON.parse(readFileSync("app/modulos/pos-transferencias/entradaEscritorioAntes.fixture.json", "utf8"));

/** Los tamaños que pasaron a token, y el tamaño que el config le da a cada token. */
const A_TOKEN = [
  ["text-[11px]", "text-sm2", "11px"],
  ["text-[13px]", "text-sm3", "13px"],
  ["text-[14px]", "text-base", "14px"],
];

test("cada token es exactamente el tamaño que reemplazó, y nada más", () => {
  const config = readFileSync("tailwind.config.js", "utf8").replace(/\/\/[^\n]*/g, "");
  for (const [, token, px] of A_TOKEN) {
    const clave = token.replace("text-", "");
    assert.match(config, new RegExp(`\\b${clave}: "${px}",`), `${token} no es ${px} en el config`);
  }
});

for (const modo of ["deposito", "admin"]) {
  test(`modo ${modo}: el mismo HTML que antes, con los tamaños en token`, async () => {
    const { me, opciones, solicitados } = foto.respuestas[modo];
    await A.montar({
      pagina: Pagina,
      ancho: "escritorio",
      inicio: A.real.carritoVacio,
      otras: {
        "/api/me": me,
        "/api/pos-transferencias/opciones": opciones,
        "/api/pos-transferencias/solicitados": solicitados,
      },
    });
    // Los tokens, SOLO adentro del bloque de los selectores (el que se mudó):
    // la cinta y la lista de pedidos siguen con sus tamaños escritos a mano,
    // porque esta tanda no los toca.
    const antes = document.createElement("div");
    antes.innerHTML = foto.fotos[modo];
    const bloques = [...antes.querySelectorAll("div")].filter((el) => el.getAttribute("class") === "space-y-4 text-[13px]");
    assert.equal(bloques.length, 1, "la foto no tiene un único bloque de selectores");
    // Y no adentro de los desplegables: lo de adentro lo dibuja `SunmiSelectAdv`,
    // que no cambió y tiene su propio `text-[13px]`.
    const delDesplegable = (el) => !!el.parentElement?.closest('[class*="[&_.sunmi-select-trigger]"]');
    for (const el of [bloques[0], ...bloques[0].querySelectorAll("*")].filter((x) => !delDesplegable(x))) {
      let clase = el.getAttribute("class");
      if (clase == null) continue;
      for (const [crudo, token] of A_TOKEN) clase = clase.split(crudo).join(token);
      el.setAttribute("class", clase);
    }
    const ahora = A.contenido().innerHTML;
    assert.ok(ahora === antes.innerHTML, `la computadora cambió en modo ${modo}`);
    // Y no es un HTML cualquiera: es la pantalla de siempre.
    assert.match(A.contenido().textContent, /POS · Transferencias/);
  });
}
