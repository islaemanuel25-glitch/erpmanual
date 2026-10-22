// EL CELULAR NO SE TOCA: LO QUE DIBUJA POR DEBAJO DE lg ES LO DE aff3a9c.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/celularIntacto.test.mjs
//
// Regla de Emanuel para la versión de escritorio de Pedidos (2026-10-22), la
// misma de la recepción de transferencias: el teléfono no se toca en nada. El
// escritorio vive en `components/pedidos/PedidosEscritorio.jsx` y `page.jsx`
// solo agrega el punto de reparto.
//
// Cómo se prueba: `celularIntacto.foto.json` tiene el HTML que dibujaba la
// pantalla del teléfono en aff3a9c —la producción de antes del escritorio—,
// en siete momentos, con las respuestas reales de las rutas sobre erpazul_al.
// Se sacó con ESCRIBIR_FOTO_CELULAR=1 corriendo este mismo archivo CONTRA
// aff3a9c, antes de tocar `page.jsx`. Hoy se vuelve a montar y se compara lo
// que queda adentro del envoltorio del teléfono, carácter por carácter.
//
// Lo único que se normaliza son los identificadores que React inventa
// (`useId`): dependen de dónde está el componente en el árbol, y el envoltorio
// del reparto lo baja un nivel. No es algo que se dibuje.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const { real, montar, desmontarTodo, boton, tocar, asentar, filaShell } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const RUTA_FOTO = "app/modulos/pedidos/celularIntacto.foto.json";
const ESCRIBIR = process.env.ESCRIBIR_FOTO_CELULAR === "1";

/** Una fecha fija y vieja: "Enviado 15/01 12:00" no cambia de un día al otro. */
const FECHA = "2026-01-15T15:00:00.000Z";
const conFecha = (r) => ({ ...r, cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: FECHA } } });

/** Lo que dibuja el teléfono: adentro de su envoltorio, o —en aff3a9c, que no lo tenía— todo el contenido. */
function delCelular() {
  const envoltorio = document.querySelector("[data-pedidos-celular]");
  const raiz = envoltorio ?? document.querySelector("[data-contenido]");
  return normalizar(raiz.innerHTML) + "\n--shell--\n" + normalizar(filaShell().innerHTML);
}
const normalizar = (html) => html.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:/g, "«id»");

/** El botón del teléfono, y no el homónimo del escritorio. */
const delTelefono = (texto) => {
  const raiz = document.querySelector("[data-pedidos-celular]") ?? document.querySelector("[data-contenido]");
  return boton(texto, raiz);
};

const MOMENTOS = {
  "entrada sin pedido": async () => {
    await montar({ inicio: real.carritoVacio, enLaEntrada: true });
  },
  "entrada con borrador": async () => {
    await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  },
  "catálogo armando": async () => {
    await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
    await tocar(delTelefono("Seguir armando"));
    await asentar(450);
  },
  "entrada enviado": async () => {
    await montar({ inicio: conFecha(real.carritoPendiente), enLaEntrada: true });
  },
  "modo sumar": async () => {
    await montar({ inicio: conFecha(real.carritoPendiente), enLaEntrada: true });
    await tocar(delTelefono("Sumar productos"));
    await asentar(450);
  },
  "ver pedido enviado": async () => {
    await montar({ inicio: conFecha(real.carritoPendiente), enLaEntrada: true });
    await tocar(delTelefono("Ver pedido"));
  },
  "entrada preparando": async () => {
    await montar({ inicio: conFecha(real.empezadoCarrito), enLaEntrada: true });
  },
};

const foto = existsSync(RUTA_FOTO) ? JSON.parse(readFileSync(RUTA_FOTO, "utf8")) : {};

for (const [nombre, llegar] of Object.entries(MOMENTOS)) {
  test(`el celular dibuja lo mismo que en aff3a9c: ${nombre}`, async () => {
    await llegar();
    const ahora = delCelular();
    if (ESCRIBIR) {
      foto[nombre] = ahora;
      writeFileSync(RUTA_FOTO, `${JSON.stringify(foto, null, 2)}\n`);
      return;
    }
    assert.ok(foto[nombre], `falta la foto de "${nombre}"`);
    assert.ok(ahora === foto[nombre], `el celular cambió en "${nombre}"`);
  });
}

test("la foto es de aff3a9c y tiene los siete momentos", () => {
  if (ESCRIBIR) return;
  assert.deepEqual(Object.keys(foto).sort(), Object.keys(MOMENTOS).sort());
  // Que retrata lo que dice retratar, y no una pantalla de error (CLAUDE.md,
  // regla 1: reproducible y correcto son dos preguntas distintas).
  assert.match(foto["entrada sin pedido"], /No tenés un pedido en curso/);
  assert.match(foto["catálogo armando"], /Enviar pedido al depósito \(2\)/);
  assert.match(foto["modo sumar"], /0 cambios sin confirmar/);
  assert.match(foto["entrada preparando"], /El depósito lo está preparando/);
  assert.match(foto["ver pedido enviado"], /data-tarjeta-pedido/);
});
