// scripts/sonda-externa.mjs
//
// LA SONDA DE CASCADA CONTRA PRODUCCIÓN, DISPARADA DESDE `/deploy` Y CORRIDA
// AFUERA DE PRODUCCIÓN.
//
//   git show origin/main:scripts/sonda-externa.mjs | \
//     node --input-type=module - --fase pre --sha-esperado "$DESPLEGADO"
//
// Dispara `.github/workflows/sonda-cascada.yml` en GitHub Actions, espera a que
// termine, lee el log y sale con 0 SOLO si la sonda midió la versión esperada y
// dio VERDE. Cualquier otra cosa —token que falta, GitHub que no contesta, una
// corrida que no termina, un log que no dice lo que tiene que decir— es ROJO y
// sale con 1. Uso mal escrito: 2.
//
// ── POR QUÉ ASÍ ───────────────────────────────────────────────────────────
//
// El VPS no tiene navegador y no se le instala uno, ni `node_modules`. La sonda
// necesita un navegador de verdad. El runner de Actions lo tiene, así que la
// sonda corre allá y el VPS solo pregunta: este archivo usa `fetch` y nada más
// de afuera de Node, y anda en el Node 18 del VPS sin instalar nada.
//
// Es UN solo archivo a propósito. `/deploy` lo corre con `git show origin/main:`
// —sin mover el árbol del VPS, que el paso 4 mueve cuando corresponde—, y por
// ese camino un `import` relativo no tendría de dónde leer.
//
// ── EL TOKEN, Y QUE NUNCA SE IMPRIME ────────────────────────────────────────
//
// Disparar un workflow pide un token de GitHub con permiso de Actions en
// escritura sobre este repo, y nada más. Se lee de `SONDA_GITHUB_TOKEN` o del
// archivo `~/.config/erpazul/sonda-github-token`, que tiene que tener permisos
// 600: si otro usuario de la máquina lo puede leer, es ROJO y no se usa. Cómo
// se crea está en `docs/deploy/SONDA-EXTERNA.md`. Este script no lo imprime en
// ningún caso, ni en los errores: si un mensaje de GitHub lo trajera, se tapa.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REPO_POR_DEFECTO = "islaemanuel25-glitch/erpmanual";
export const REF_POR_DEFECTO = "main";
export const API_POR_DEFECTO = "https://api.github.com";
export const WORKFLOW = "sonda-cascada.yml";
export const FASES = ["pre", "post"];
export const ARCHIVO_TOKEN_POR_DEFECTO = path.join(os.homedir(), ".config", "erpazul", "sonda-github-token");

/** Segundos que se espera, en total, a que la corrida termine. Medido: ~1 min más la cola. */
export const ESPERA_MAXIMA_POR_DEFECTO = 900;
/** Segundos entre una consulta y la siguiente. */
export const INTERVALO_POR_DEFECTO = 10;
/** Segundos que se busca la corrida por su título, si GitHub no devolvió su id. */
export const ESPERA_PARA_ENCONTRARLA = 120;

/** Las líneas que el workflow imprime y que el veredicto exige. El candado las busca en el `.yml`. */
export const MARCAS = {
  fase: "SONDA-EXTERNA FASE",
  shaAntes: "SONDA-EXTERNA SHA-ANTES",
  shaDespues: "SONDA-EXTERNA SHA-DESPUES",
  resultado: "SONDA-EXTERNA RESULTADO VERDE",
  verdeDeLaSonda: "VERDE · las utilidades de Tailwind le ganan a las clases del kit.",
};

const SHA_COMPLETO = /^[0-9a-f]{40}$/;

// ── LO QUE SE LEE DE LA LÍNEA DE COMANDOS ─────────────────────────────────

/**
 * Las opciones, o `{ error }` con lo que está mal escrito. No hay defaults para
 * lo que decide qué se mide: la fase y el SHA se dicen siempre.
 */
export function leerOpciones(argv, env = {}) {
  const valor = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const fase = valor("fase");
  const shaEsperado = valor("sha-esperado");
  if (!FASES.includes(fase)) return { error: "falta --fase pre|post" };
  if (!SHA_COMPLETO.test(shaEsperado || "")) {
    return { error: "falta --sha-esperado con el SHA COMPLETO de 40 caracteres, nunca uno corto" };
  }
  const esperaMaxima = Number(valor("espera-maxima") ?? ESPERA_MAXIMA_POR_DEFECTO);
  const intervalo = Number(valor("intervalo") ?? INTERVALO_POR_DEFECTO);
  if (!(esperaMaxima > 0) || !(intervalo > 0)) return { error: "--espera-maxima e --intervalo van en segundos, mayores que cero" };
  return {
    fase,
    shaEsperado,
    repo: valor("repo") || REPO_POR_DEFECTO,
    ref: valor("ref") || REF_POR_DEFECTO,
    archivoToken: valor("token-archivo") || ARCHIVO_TOKEN_POR_DEFECTO,
    // Solo para el candado, que levanta un GitHub de mentira en localhost.
    api: env.SONDA_GITHUB_API || API_POR_DEFECTO,
    esperaMaxima,
    intervalo,
  };
}

/** Un identificador que nadie más va a usar, para encontrar ESTA corrida entre las otras. */
export function nuevaCorrelacion(fase, aleatorio = () => crypto.randomBytes(6).toString("hex")) {
  return `sonda-${fase}-${aleatorio()}`;
}

/** El título de la corrida. Tiene que dar lo mismo que el `run-name` del workflow. */
export function tituloDeLaCorrida({ fase, shaEsperado, correlacion }) {
  return `sonda ${fase} ${shaEsperado} ${correlacion}`;
}

// ── EL TOKEN ──────────────────────────────────────────────────────────────

/**
 * El token, o `{ error }` diciendo qué hacer. La variable de entorno gana; si no
 * está, el archivo, que tiene que ser solo del dueño.
 */
export function leerToken({ env = {}, archivo, sistema = fs } = {}) {
  const deEntorno = (env.SONDA_GITHUB_TOKEN || "").trim();
  if (deEntorno) return { token: deEntorno, origen: "SONDA_GITHUB_TOKEN" };
  let info;
  try {
    info = sistema.statSync(archivo);
  } catch {
    return {
      error:
        `no hay token para disparar la sonda: ni SONDA_GITHUB_TOKEN ni el archivo ${archivo}. ` +
        "Crearlo una sola vez según docs/deploy/SONDA-EXTERNA.md.",
    };
  }
  if ((info.mode & 0o077) !== 0) {
    return { error: `el archivo del token ${archivo} lo pueden leer otros usuarios: chmod 600 y volver a correr.` };
  }
  const token = String(sistema.readFileSync(archivo, "utf8")).trim();
  if (!token) return { error: `el archivo del token ${archivo} está vacío.` };
  return { token, origen: archivo };
}

/** Tapa el token si apareciera en un texto que se va a imprimir. */
export function sinToken(texto, token) {
  const s = String(texto ?? "");
  return token ? s.split(token).join("***") : s;
}

// ── EL LOG ────────────────────────────────────────────────────────────────

/** El log de un job sin la marca de tiempo que GitHub le pone a cada línea. */
export function limpiarLog(texto) {
  return String(texto ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/, ""));
}

/**
 * El veredicto que dice el log, línea por línea y exacto: una línea tiene que
 * SER la marca, no contenerla. Así no cuenta el texto del script que GitHub
 * repite en el log antes de correrlo —ahí la marca aparece adentro de un `echo`—.
 */
export function veredictoDelLog(texto, { fase, shaEsperado }) {
  const lineas = limpiarLog(texto);
  const valorDe = (marca) => {
    const l = lineas.find((x) => x.startsWith(`${marca} `));
    return l ? l.slice(marca.length + 1).trim() : null;
  };
  const rojas = lineas.filter((l) => l.startsWith("ROJO · "));

  const inicio = lineas.findIndex((l) => l.startsWith("sonda de cascada — "));
  let bloque = [];
  if (inicio > -1) {
    let fin = lineas.findIndex((l, i) => i > inicio && /^(VERDE|ROJO) · /.test(l));
    if (fin === -1) fin = lineas.length - 1;
    while (fin + 1 < lineas.length && lineas[fin + 1].startsWith("  ")) fin++;
    bloque = lineas.slice(inicio, fin + 1);
  }

  const faltas = [];
  if (valorDe(MARCAS.fase) !== fase) faltas.push(`la corrida no es de la fase ${fase}`);
  const antes = valorDe(MARCAS.shaAntes);
  const despues = valorDe(MARCAS.shaDespues);
  if (antes !== shaEsperado) faltas.push(`antes de medir, producción servía ${antes || "nada"}`);
  if (despues !== shaEsperado) faltas.push(`después de medir, producción servía ${despues || "nada"}`);
  if (!lineas.includes(MARCAS.verdeDeLaSonda)) faltas.push("la sonda no dio VERDE");
  if (!lineas.includes(MARCAS.resultado)) faltas.push("el workflow no llegó al veredicto");
  if (rojas.length) faltas.push(...rojas.map((l) => l.replace(/^ROJO · /, "")));

  return { verde: faltas.length === 0, faltas, bloque, antes, despues };
}

// ── HABLAR CON GITHUB ─────────────────────────────────────────────────────

function cliente({ api, token, fetch }) {
  return async (metodo, ruta, cuerpo) => {
    const url = ruta.startsWith("http") ? ruta : `${api}${ruta}`;
    return fetch(url, {
      method: metodo,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "erpazul-sonda-externa",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      // Ninguna redirección se sigue con el token puesto. La única que hay es la
      // del log, y ésa se sigue a mano y sin él: ver `leerLog`.
      redirect: "manual",
    });
  };
}

/**
 * El texto del log de un job, o `null`. GitHub contesta con una redirección a
 * una URL firmada de su almacenamiento, que se pide SIN el token: la firma ya
 * autoriza, y mandarle el token a otro servidor es regalarlo. No se deja en
 * manos del `fetch`, que en algunos Node 18 lo reenvía al seguir la redirección.
 */
async function leerLog(pedir, fetch, ruta) {
  const r = await pedir("GET", ruta);
  if (r.status >= 300 && r.status < 400) {
    const destino = r.headers.get("location");
    if (!destino) return null;
    const rl = await fetch(destino, { headers: { "User-Agent": "erpazul-sonda-externa" } });
    return rl.ok ? rl.text() : null;
  }
  return r.ok ? r.text() : null;
}

async function mensajeDeGitHub(respuesta) {
  try {
    const j = await respuesta.json();
    return j?.message || "";
  } catch {
    return "";
  }
}

const QUE_SIGNIFICA = {
  401: "el token no sirve: vencido, revocado o mal copiado",
  403: "el token no tiene permiso de Actions en escritura sobre este repo",
  404: "GitHub no encuentra el workflow: o el token no ve el repo, o sonda-cascada.yml todavía no está en main",
  422: "GitHub rechazó el pedido",
};

/**
 * Dispara la sonda y espera su veredicto. Todo lo de afuera entra por
 * argumento —`fetch`, `dormir`, `ahora`, `escribir`— para que el candado la
 * pueda correr entera contra un GitHub de mentira.
 *
 * @returns {Promise<{ verde: boolean, motivo: string, url?: string, bloque?: string[] }>}
 */
export async function correrSondaExterna({
  opciones,
  token,
  fetch = globalThis.fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora = () => Date.now(),
  escribir = (l) => console.log(l),
  correlacion = nuevaCorrelacion(opciones.fase),
}) {
  const { fase, shaEsperado, repo, ref, api, esperaMaxima, intervalo } = opciones;
  const pedir = cliente({ api, token, fetch });
  const titulo = tituloDeLaCorrida({ fase, shaEsperado, correlacion });
  const base = `/repos/${repo}/actions`;
  const inicio = ahora();
  const quedaTiempo = () => ahora() - inicio < esperaMaxima * 1000;

  try {
    // 1. Disparar. Con `return_run_details` GitHub devuelve el id de la corrida;
    //    si no lo devuelve, se la busca por su título.
    const disparo = await pedir("POST", `${base}/workflows/${WORKFLOW}/dispatches`, {
      ref,
      inputs: { fase, sha_esperado: shaEsperado, correlacion },
      return_run_details: true,
    });
    if (disparo.status !== 200 && disparo.status !== 204) {
      const msg = sinToken(await mensajeDeGitHub(disparo), token);
      const que = QUE_SIGNIFICA[disparo.status] || "GitHub no aceptó el pedido";
      return { verde: false, motivo: `no se pudo disparar la sonda (${disparo.status}): ${que}${msg ? ` — ${msg}` : ""}` };
    }
    let id = null;
    let url = null;
    if (disparo.status === 200) {
      const j = await disparo.json().catch(() => ({}));
      id = j?.workflow_run_id ?? null;
      url = j?.html_url ?? null;
    }
    escribir(`disparada: ${titulo}`);

    if (!id) {
      const hasta = ahora() + ESPERA_PARA_ENCONTRARLA * 1000;
      while (!id && ahora() < hasta) {
        const r = await pedir("GET", `${base}/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=30`);
        if (r.ok) {
          const j = await r.json();
          const run = (j?.workflow_runs || []).find((x) => x.display_title === titulo);
          if (run) {
            id = run.id;
            url = run.html_url;
            break;
          }
        }
        await dormir(intervalo * 1000);
      }
      if (!id) return { verde: false, motivo: `GitHub aceptó el disparo pero la corrida «${titulo}» no apareció en ${ESPERA_PARA_ENCONTRARLA} s` };
    }
    if (url) escribir(`corrida: ${url}`);

    // 2. Esperar a que termine.
    let run = null;
    let estadoAnterior = null;
    while (true) {
      const r = await pedir("GET", `${base}/runs/${id}`);
      if (r.ok) {
        run = await r.json();
        url = run.html_url || url;
        if (run.display_title !== titulo) {
          return { verde: false, motivo: `la corrida ${id} no es la que se disparó: se llama «${run.display_title}»`, url };
        }
        if (run.status !== estadoAnterior) {
          escribir(`estado: ${run.status}`);
          estadoAnterior = run.status;
        }
        if (run.status === "completed") break;
      }
      if (!quedaTiempo()) {
        return { verde: false, motivo: `la corrida no terminó en ${esperaMaxima} s (último estado: ${estadoAnterior || "desconocido"})`, url };
      }
      await dormir(intervalo * 1000);
    }

    // 3. Leer el log del job. Recién terminada, GitHub a veces tarda en tenerlo.
    const rj = await pedir("GET", `${base}/runs/${id}/jobs?per_page=10`);
    const jobs = rj.ok ? (await rj.json())?.jobs || [] : [];
    const job = jobs.find((j) => j.name === "sonda") || jobs[0];
    let log = null;
    if (job) {
      for (let intento = 0; intento < 6 && log === null; intento++) {
        log = await leerLog(pedir, fetch, `${base}/jobs/${job.id}/logs`);
        if (log === null) await dormir(intervalo * 1000);
      }
    }
    if (log === null) {
      return { verde: false, motivo: `la corrida terminó (${run.conclusion}) pero no se pudo leer su log`, url };
    }

    // 4. El veredicto: el job en success Y el log diciendo lo que tiene que decir.
    const v = veredictoDelLog(log, { fase, shaEsperado });
    if (run.conclusion !== "success") v.faltas.unshift(`la corrida terminó en ${run.conclusion}`);
    const verde = run.conclusion === "success" && v.verde;
    return {
      verde,
      motivo: verde
        ? `producción sirve ${shaEsperado} antes y después de medir, y la cascada está bien`
        : v.faltas.join("; "),
      url,
      bloque: v.bloque,
    };
  } catch (e) {
    return { verde: false, motivo: `no se pudo hablar con GitHub: ${sinToken(e?.message || e, token)}` };
  }
}

// ── LA LÍNEA DE COMANDOS ──────────────────────────────────────────────────

export async function principal(argv = process.argv, env = process.env, dependencias = {}) {
  const escribir = dependencias.escribir || ((l) => console.log(l));
  const opciones = leerOpciones(argv, env);
  if (opciones.error) {
    escribir(`uso: sonda-externa --fase pre|post --sha-esperado <SHA de 40> — ${opciones.error}`);
    return 2;
  }
  escribir(`sonda externa ${opciones.fase.toUpperCase()} — se espera ${opciones.shaEsperado} en producción`);

  const t = leerToken({ env, archivo: opciones.archivoToken, sistema: dependencias.sistema || fs });
  if (t.error) {
    escribir("");
    escribir(`ROJO · NO SE PUEDE MEDIR: ${t.error}`);
    return 1;
  }

  const r = await correrSondaExterna({ opciones, token: t.token, escribir, ...dependencias });
  if (r.bloque?.length) {
    escribir("");
    for (const l of r.bloque) escribir(l);
  }
  escribir("");
  escribir(`${r.verde ? "VERDE" : "ROJO"} · sonda externa ${opciones.fase.toUpperCase()}: ${r.motivo}`);
  if (r.url) escribir(`  ${r.url}`);
  return r.verde ? 0 : 1;
}

const invocado = process.argv[1];
const esPrincipal =
  invocado === "-" || (invocado && import.meta.url === pathToFileURL(path.resolve(invocado)).href);
if (esPrincipal) {
  principal().then(
    (codigo) => process.exit(codigo),
    (e) => {
      // Un error que se escapó no es "no se pudo comprobar": es ROJO.
      console.log(`ROJO · NO SE PUEDE MEDIR: ${e?.message || e}`);
      process.exit(1);
    }
  );
}
