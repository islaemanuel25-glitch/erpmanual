// scripts/hook-trinquete-hardcodeo.mjs
//
// TRINQUETE PostToolUse: avisa si un Edit o un Write hizo subir el hardcodeo por
// encima de la línea de base.
//
// ── POR QUÉ DESPUÉS Y NO ANTES ──────────────────────────────────────────────
//
// El contador mira archivos escritos, no diffs propuestos. Antes de la escritura
// no hay nada que contar. Así que corre después: si subió, lo dice en el mismo
// momento en que pasó, cuando todavía está claro qué se acababa de tocar. Un
// aviso media hora más tarde, en el commit, ya no se ata a ningún cambio.
//
// ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
//
// NO revierte nada y NO impide guardar. Devuelve un aviso que se lee y se decide
// qué hacer: usar lo que ya existe, o subir la base a propósito diciendo por qué.
// Un trinquete que revierte solo termina peleándose con quien trabaja.
//
// ── QUÉ NO DISPARA ──────────────────────────────────────────────────────────
//
// Solo mira ediciones de `.jsx` bajo `app/` o `components/`, que es el universo
// que el contador recorre. Tocar un test, un documento o una migración no corre
// nada: el escaneo cuesta un par de segundos y no tiene sentido pagarlo en cada
// escritura de cualquier archivo.
//
// ── SI EL TRINQUETE MISMO FALLA ─────────────────────────────────────────────
//
// Deja pasar y lo dice. Es lo contrario de la guardia de migraciones, que
// deniega cuando no pudo mirar — y la diferencia es a propósito: allá lo que
// estaba en juego eran los datos de producción; acá, una cuenta de deuda
// visual. Frenar el trabajo de alguien porque un contador se rompió sería peor
// que perderse un aumento.
//
// ── POR DÓNDE SE SALTEA ─────────────────────────────────────────────────────
//
// La lista completa está en el skill `/revisar-pantalla`. En una línea: esto
// cubre las escrituras que pasan por las herramientas Edit y Write de Claude
// Code en ESTE repo, y nada más.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MARCA_VEREDICTO } from "../lib/hardcodeo/contador.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
// El contador real. La variable de entorno existe SOLO para que el candado
// pueda inyectar uno falso y ejercer los cuatro desenlaces —contó y subió, contó
// y no subió, se cayó, abortó—. Sin esa costura no hay forma de probar el hook
// más que rompiendo el repo a propósito para que un número suba, y una rama
// defensiva que no se puede ejercer es una rama que nadie sabe si corre.
const CONTADOR = process.env.ERPAZUL_CONTADOR_HARDCODEO || path.join(AQUI, "hardcodeo.mjs");

const ME_IMPORTA = /^(app|components)\/.*\.jsx$/;

/**
 * La ruta del archivo tocado, relativa a la raíz del repo y con barras normales.
 *
 * NO se usa `path.relative`: en Windows, con la raíz escrita en un estilo
 * (`c:/…`) y la ruta que llega en otro (`C:\…`), devuelve una ruta sin sentido
 * en vez de fallar. Costó encontrarlo — el hook se quedaba callado y parecía que
 * el trinquete no veía el cambio.
 *
 * Acá se normalizan los dos lados a minúsculas con barras normales y se corta
 * por la raíz. Si la ruta no cae adentro del repo, devuelve null y el hook no
 * hace nada.
 */
function rutaRelativa(absoluta) {
  if (!absoluta) return null;
  const norm = (s) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const raiz = norm(ROOT).toLowerCase();
  const archivo = norm(absoluta);
  if (!archivo.toLowerCase().startsWith(raiz + "/")) return null;
  return archivo.slice(raiz.length + 1);
}

function responder(texto) {
  if (texto) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: texto,
        },
      })
    );
  }
  process.exit(0);
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (entrada += c));
process.stdin.on("end", () => {
  let datos;
  try {
    datos = JSON.parse(entrada || "{}");
  } catch {
    responder(null);
  }

  const rel = rutaRelativa(String(datos?.tool_input?.file_path ?? ""));
  if (!rel || !ME_IMPORTA.test(rel)) responder(null);

  // ── SE PREGUNTA POR EL ARCHIVO EDITADO, NO POR EL REPO ENTERO ───────────
  //
  // Antes esto pedía el veredicto global y contestaba con la deuda completa
  // —treinta líneas— después de CADA edición de un `.jsx`, aunque la edición no
  // hubiera agregado nada. Peor: el encabezado decía "este cambio hizo subir el
  // conteo" incluso cuando lo había bajado, porque el aviso no distinguía lo que
  // la edición introdujo de lo que ya estaba.
  //
  // Un aviso que aparece siempre y que además puede estar diciendo lo contrario
  // de lo que pasó se lee salteado a los dos días, y ahí deja de avisar.
  //
  // Con `--archivo` el contador informa solo las altas de ESE archivo y sale con
  // 0 si no hay ninguna, así que el hook se calla cuando no hay nada que decir.
  // El veredicto no se aflojó: sigue siendo rojo si la edición introdujo algo.
  const r = spawnSync(process.execPath, [CONTADOR, "--trinquete", "--archivo", rel], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });

  // ── ROTO Y "SUBIÓ" SALEN LOS DOS CON CÓDIGO 1 ────────────────────────────
  //
  // El contador devuelve 1 cuando el hardcodeo subió. Node TAMBIÉN devuelve 1
  // cuando el script se cae solo —una excepción sin atrapar sale con 1—, así que
  // mirar únicamente el código confunde las dos cosas y el hook informaba
  // "este cambio hizo subir el conteo" sobre un contador que nunca llegó a
  // contar nada. Un aviso que no distingue un veredicto de un choque es un aviso
  // que no se puede creer en ninguna de las dos direcciones.
  //
  // Se vio todos los días en cuanto el intérprete no era el que la herramienta
  // necesita: `lib/hardcodeo/contador` era ESM en un archivo `.js` y el
  // `package.json` no declara `"type": "module"`, así que en Node 18 el import
  // explotaba con `Named export 'ETIQUETAS' not found` — código 1, cero bytes de
  // salida, y el hook lo contaba como un aumento.
  //
  // **Esa causa ya está arreglada**: el contador es `.mjs` y lo cuida
  // `scripts/hardcodeoArranca.test.mjs`. Esta defensa NO se saca, porque no era
  // de ese defecto: separa un veredicto de un choque, y choques hay muchos —un
  // timeout, un git que no responde, una excepción nueva—. Se sacaría recién si
  // el contador dejara de poder chocar, que no va a pasar.
  //
  // Lo que los separa es la MARCA que el contador imprime cuando de verdad
  // comparó. Sin esa marca no hubo veredicto, haya salido con el código que haya
  // salido.
  // La marca la define el CONTADOR y la importan los tres que la necesitan: el
  // que la imprime, este hook que la busca, y el candado. Estaba escrita a mano
  // en dos lados, y cambiar el texto del trinquete habría dejado a este hook
  // informando "no pudo correr" sobre un contador que contestó bien.
  const salidaCompleta = `${r.stdout || ""}\n${r.stderr || ""}`;
  const huboVeredicto = salidaCompleta.includes(MARCA_VEREDICTO);

  if (r.status !== 0 && !huboVeredicto) {
    responder(
      "El trinquete de hardcodeo no pudo correr, así que este cambio NO fue " +
        "revisado. No bloquea nada, pero conviene arreglarlo:\n" +
        `${(r.stderr || r.error?.message || "sin detalle").toString().trim().slice(0, 400)}`
    );
  }

  if (r.status === 0) responder(null);

  // Node avisa por stderr que lib/ no declara tipo de módulo. Es ruido de la
  // herramienta, no del contador, y mezclado con el aviso lo vuelve ilegible.
  const limpio = (r.stderr || "")
    .split("\n")
    .filter((l) => !/MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|To eliminate this warning|trace-warnings/.test(l))
    .join("\n")
    .trim();

  responder(
    `TRINQUETE DE HARDCODEO: esta edición de ${rel} introdujo hardcodeo que no ` +
      `estaba en la línea de base.\n\n` +
      `${limpio}\n\n` +
      `Para ver qué hay en esa pantalla: node scripts/hardcodeo.mjs --ficha <pantalla>\n\n` +
      `Esto NO revierte nada. Hay dos salidas honestas: usar lo que ya existe —el token, ` +
      `el componente del kit— o, si el aumento es a propósito, subir la línea de base con ` +
      `node scripts/hardcodeo.mjs --linea-base --sellar y decir en el commit por qué. ` +
      `Sin --sellar, ese mismo comando solo la muestra.`
  );
});
