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

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const CONTADOR = path.join(AQUI, "hardcodeo.mjs");

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

  const r = spawnSync(process.execPath, [CONTADOR, "--trinquete"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });

  // El trinquete se rompió: se deja pasar, pero se dice. Un contador roto que
  // calla se confunde con un contador que no encontró nada.
  if (r.status !== 0 && r.status !== 1) {
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
    `TRINQUETE DE HARDCODEO: este cambio hizo subir el conteo por encima de la línea de base.\n\n` +
      `${limpio}\n\n` +
      `Archivo tocado: ${rel}\n` +
      `Para ver qué hay en esa pantalla: node scripts/hardcodeo.mjs --ficha <pantalla>\n\n` +
      `Esto NO revierte nada. Hay dos salidas honestas: usar lo que ya existe —el token, ` +
      `el componente del kit— o, si el aumento es a propósito, subir la línea de base con ` +
      `node scripts/hardcodeo.mjs --linea-base y decir en el commit por qué.`
  );
});
