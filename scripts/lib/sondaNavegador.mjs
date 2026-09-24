// scripts/lib/sondaNavegador.mjs
//
// CÓMO SE LEVANTA EL NAVEGADOR DE UNA SONDA. Puro: no lanza nada.
//
// Salió de `scripts/sonda-cascada.mjs` cuando la sonda tuvo que correr fuera de
// la máquina con Edge en Windows. Lo que la sonda MIDE quedó allá, sin tocar;
// acá está solo lo que decide con qué navegador y cómo se habla con él, que es
// lo que cambiaba de un entorno a otro y lo único que se puede probar sin
// navegador.
//
// ── LOS DOS ENTORNOS QUE LA FRENABAN ─────────────────────────────────────
//
//   · Contenedor que corre como root, con Chromium: Chromium no arranca como
//     root sin `--no-sandbox`, y la sonda no tenía cómo pasarlo. Ahora lo pide
//     el flag `--no-sandbox` de la sonda, explícito: nunca se agrega solo,
//     porque apagar el sandbox es una decisión del que corre, no un default.
//   · Node 18: no trae `WebSocket` global (entró en Node 22). La sonda usa el
//     global si está y, si no, el paquete `ws` que el repo YA tiene instalado —
//     viene con `@supabase/supabase-js`, que es dependencia directa—. No se
//     agregó ninguna dependencia.
//
// El comando de siempre, sin flags nuevos, arma exactamente los mismos
// argumentos que antes. Lo comprueba `sondaNavegador.test.mjs`.

import os from "node:os";
import path from "node:path";

/** El Edge de Windows: el navegador por defecto de siempre. */
export const EDGE_POR_DEFECTO = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

/**
 * El lector de argumentos de la sonda, tal como estaba: el valor que sigue al
 * flag, `true` si el flag está solo, o el default.
 */
export function lectorDeArgumentos(argv) {
  return (n, d = null) => {
    const i = argv.indexOf(`--${n}`);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--")
      ? argv[i + 1]
      : argv.includes(`--${n}`)
        ? true
        : d;
  };
}

/**
 * Las opciones de la sonda leídas de la línea de comandos.
 *
 * `--no-sandbox` se lee como PRESENCIA y no con el lector de valores: con él,
 * `--no-sandbox /login` tomaría la ruta como valor del flag.
 */
export function opcionesDeLaSonda(argv, { tmpdir = os.tmpdir() } = {}) {
  const arg = lectorDeArgumentos(argv);
  const puerto = Number(arg("puerto-cdp", "9226"));
  return {
    base: arg("base", "http://localhost:3000"),
    ruta: arg("url", "/login"),
    puerto,
    // EL PERFIL VA ATADO AL PUERTO. Con un perfil fijo, correr la sonda en otro
    // puerto —para medir producción sin matar la corrida local— encuentra el
    // perfil tomado por el navegador anterior, el nuevo se muere solo y lo único
    // que se ve es que no respondió al puerto de depuración. El síntoma no
    // nombra al perfil.
    perfil: arg("perfil", path.join(tmpdir, `sonda-cascada-edge-${puerto}`)),
    navegador: arg("edge", EDGE_POR_DEFECTO),
    sinSandbox: argv.includes("--no-sandbox"),
  };
}

/**
 * Los argumentos con que se lanza el navegador. Sin `sinSandbox` son los de
 * siempre, en el mismo orden; con él se agrega `--no-sandbox` y nada más.
 */
export function argumentosDelNavegador({ puerto, perfil, sinSandbox = false }) {
  return [
    "--headless=new",
    `--remote-debugging-port=${puerto}`,
    `--user-data-dir=${perfil}`,
    "--window-size=1366,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    ...(sinSandbox ? ["--no-sandbox"] : []),
  ];
}

/**
 * La clase `WebSocket` con que se habla con el navegador: la global si el Node
 * la trae, y si no, la del paquete `ws`.
 *
 * `importar` entra por argumento para que el candado pueda simular un Node sin
 * global y sin el paquete. Si no hay ninguna de las dos, devuelve el motivo en
 * vez de tirar: la sonda lo informa como ROJO, porque no poder medir es rojo.
 *
 * @returns {Promise<{ WebSocket: Function, origen: "global"|"ws" } | { error: string }>}
 */
export async function resolverWebSocket(opciones = {}) {
  // `in` y no un default de desestructuración: el default se aplica también
  // cuando llega `undefined`, y `undefined` es justamente cómo se describe "este
  // Node no tiene WebSocket global".
  const global = "global" in opciones ? opciones.global : globalThis.WebSocket;
  const importar = opciones.importar || (() => import("ws"));
  if (typeof global === "function") return { WebSocket: global, origen: "global" };
  try {
    const mod = await importar();
    const Clase = mod?.WebSocket || mod?.default;
    if (typeof Clase === "function") return { WebSocket: Clase, origen: "ws" };
  } catch {}
  return {
    error:
      "Este Node no trae WebSocket global y no se encontró el paquete `ws` " +
      "(lo instala `@supabase/supabase-js`: correr `npm ci` en el repo).",
  };
}
