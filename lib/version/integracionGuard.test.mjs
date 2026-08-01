// Candados estructurales del guard de versión.
//
// Las reglas que protegen acá no se pueden expresar como valores: son de
// CABLEADO. Que el POS quede afuera, que el SHA cruce de la etapa builder a la
// runner, que el endpoint no se cachee y que el aviso no sea un modal.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function archivosDe(dir, ext = [".js", ".jsx"]) {
  const salida = [];
  const caminar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        caminar(p);
      } else if (ext.includes(path.extname(e.name))) salida.push(p);
    }
  };
  caminar(path.join(RAIZ, dir));
  return salida;
}

// ── 7. El POS queda expresamente afuera ─────────────────────────────────────

test("7. el POS no importa el guard de versión", () => {
  const ofensores = [];
  for (const dir of ["app/modulos/pos-ventas", "app/api/pos-ventas", "components/pos-ventas"]) {
    for (const archivo of archivosDe(dir)) {
      const src = fs.readFileSync(archivo, "utf8");
      if (/useVersionGuard|AvisoVersionNueva|version\/compararBuild|version\/motorVersion/.test(src)) {
        ofensores.push(path.relative(RAIZ, archivo));
      }
    }
  }
  assert.deepEqual(ofensores, [], `el POS importa el guard: ${ofensores.join(", ")}`);
});

test("7b. tampoco lo importan pos-transferencias ni el POS de ventas internas", () => {
  const ofensores = [];
  for (const dir of ["app/modulos/pos-transferencias", "components/pos-transferencias"]) {
    for (const archivo of archivosDe(dir)) {
      if (/useVersionGuard|AvisoVersionNueva/.test(fs.readFileSync(archivo, "utf8"))) {
        ofensores.push(path.relative(RAIZ, archivo));
      }
    }
  }
  assert.deepEqual(ofensores, []);
});

test("7c. el guard vive SOLO en los dos formularios aprobados", () => {
  const permitidos = new Set([
    "components/productos/FormProducto.jsx",
    "components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx",
  ]);
  const usuarios = [];
  for (const dir of ["app", "components"]) {
    for (const archivo of archivosDe(dir)) {
      const rel = path.relative(RAIZ, archivo).split(path.sep).join("/");
      if (rel.startsWith("components/version/")) continue;
      if (/useVersionGuard/.test(fs.readFileSync(archivo, "utf8"))) usuarios.push(rel);
    }
  }
  assert.deepEqual(usuarios.sort(), [...permitidos].sort());
});

// ── 8. El endpoint no se cachea ─────────────────────────────────────────────

test("8. /api/version es force-dynamic y manda headers anti-caché", () => {
  const src = sinComentarios("app/api/version/route.js");
  assert.ok(/export const dynamic\s*=\s*["']force-dynamic["']/.test(src), "falta force-dynamic");
  assert.ok(/no-store/.test(src) && /no-cache/.test(src) && /must-revalidate/.test(src));
  assert.ok(/Pragma/.test(src) && /Expires/.test(src));
});

test("8b. el endpoint es GET, sin auth y sin base", () => {
  const src = sinComentarios("app/api/version/route.js");
  assert.ok(/export async function GET/.test(src));
  assert.ok(!/POST|PUT|DELETE|PATCH/.test(src), "solo debe exponer GET");
  assert.ok(!/prisma|getUsuarioSession|checkPerm/.test(src), "no debe tocar base ni sesión");
});

test("8c. el endpoint devuelve SOLO buildId", () => {
  const src = sinComentarios("app/api/version/route.js");
  const cuerpo = src.slice(src.indexOf("NextResponse.json"), src.indexOf("headers:"));
  const claves = [...cuerpo.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(claves, ["buildId"], `expone de más: ${claves.join(", ")}`);
});

test("8d. el cliente pide con cache: no-store", () => {
  const src = sinComentarios("hooks/useVersionGuard.js");
  assert.ok(/fetch\(\s*["']\/api\/version["']\s*,\s*\{[^}]*cache:\s*["']no-store["']/.test(src));
});

// ── 9. El SHA cruza builder → runner ────────────────────────────────────────

test("9. el Dockerfile declara el ARG en las DOS etapas", () => {
  const df = leer("Dockerfile");
  const iBuilder = df.indexOf("AS builder");
  const iRunner = df.indexOf("AS runner");
  assert.ok(iBuilder !== -1 && iRunner !== -1 && iBuilder < iRunner);

  const builder = df.slice(iBuilder, iRunner);
  const runner = df.slice(iRunner);

  assert.ok(/ARG APP_BUILD_ID/.test(builder), "builder sin ARG APP_BUILD_ID");
  assert.ok(/ARG APP_BUILD_ID/.test(runner), "runner sin ARG APP_BUILD_ID (un ARG no cruza de etapa)");
});

test("9b. el builder incrusta NEXT_PUBLIC_BUILD_ID en el bundle", () => {
  const df = leer("Dockerfile");
  const builder = df.slice(df.indexOf("AS builder"), df.indexOf("AS runner"));
  assert.ok(/ENV NEXT_PUBLIC_BUILD_ID=\$APP_BUILD_ID/.test(builder));
});

test("9c. el runner fija APP_BUILD_ID como ENV para /api/version", () => {
  const runner = leer("Dockerfile").slice(leer("Dockerfile").indexOf("AS runner"));
  assert.ok(/ENV APP_BUILD_ID=\$APP_BUILD_ID/.test(runner));
});

test("9d. compose de producción pasa el SHA como build arg", () => {
  const compose = leer("docker-compose.prod.yml");
  assert.ok(/APP_BUILD_ID:\s*"\$\{APP_BUILD_ID:-\}"/.test(compose), "falta el build arg");
  assert.ok(/REQUIRE_BUILD_ID:\s*"1"/.test(compose), "producción debe exigir el SHA");
});

// ── 10. El build productivo falla sin SHA ───────────────────────────────────

test("10. el Dockerfile aborta si REQUIRE_BUILD_ID=1 y falta el SHA", () => {
  const df = leer("Dockerfile");
  assert.ok(/ARG REQUIRE_BUILD_ID/.test(df), "falta el flag de exigencia");
  const guardia = /if \[ "\$REQUIRE_BUILD_ID" = "1" \] && \[ -z "\$APP_BUILD_ID" \]; then[\s\S]{0,400}?exit 1/;
  assert.ok(guardia.test(df), "falta la validación que corta el build");
  assert.ok(df.indexOf("REQUIRE_BUILD_ID\" = \"1\"") < df.indexOf("npm run build"),
    "la validación debe correr ANTES del build");
});

test("10b. la validación no introduce secretos", () => {
  // Se miran solo las instrucciones, no los comentarios: el comentario que
  // aclara "es un flag de build, no un secreto" no es una fuga.
  const instrucciones = leer("Dockerfile")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .join("\n");
  assert.ok(
    !/(SECRET|PASSWORD|TOKEN|DATABASE_URL)/i.test(instrucciones),
    "el Dockerfile no debe manipular secretos"
  );
  // Y el build arg nuevo es solo el SHA y su flag.
  const args = [...leer("Dockerfile").matchAll(/^ARG (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(args, ["APP_BUILD_ID", "APP_BUILD_ID", "REQUIRE_BUILD_ID"]);
});

// ── 11. El aviso no es un modal ─────────────────────────────────────────────

test("11. AvisoVersionNueva no usa portal, overlay, backdrop ni dialog", () => {
  const src = sinComentarios("components/version/AvisoVersionNueva.jsx");
  for (const prohibido of ["createPortal", "fixed inset-0", "backdrop", "<dialog", 'role="dialog"', "z-50"]) {
    assert.ok(!src.includes(prohibido), `el aviso usa ${prohibido}`);
  }
});

test("11b. el aviso no recarga solo y no ofrece guardar igual", () => {
  const src = sinComentarios("components/version/AvisoVersionNueva.jsx");
  // El único reload es el del botón, dentro de un onClick.
  assert.ok(/onClick=\{\(\) => window\.location\.reload\(\)\}/.test(src));
  assert.equal((src.match(/location\.reload/g) || []).length, 1);
  assert.ok(!/useEffect/.test(src), "no debe recargar por su cuenta");
  assert.ok(!/(Guardar igual|Continuar igual|Ignorar)/i.test(src));
});

test("11c. el texto es el aprobado", () => {
  const src = leer("components/version/AvisoVersionNueva.jsx");
  assert.ok(src.includes("Hay una versión nueva del sistema"));
  assert.ok(src.includes("Recargá la página antes de guardar"));
  assert.ok(src.includes("se perderán al recargar"));
  assert.ok(src.includes("Recargar ahora"));
});

// ── Integración en los formularios ──────────────────────────────────────────

test("12. FormProducto chequea ANTES de construir el payload", () => {
  const src = sinComentarios("components/productos/FormProducto.jsx");
  const iGuard = src.indexOf("await puedeGuardar()");
  const iPayload = src.indexOf("const payload = {");
  const iEnvio = src.indexOf("onSubmit(payload)");
  assert.ok(iGuard !== -1, "no llama al guard");
  assert.ok(iGuard < iPayload, "el guard debe correr antes de armar el payload");
  assert.ok(iGuard < iEnvio, "el guard debe correr antes de enviar");
  assert.ok(/if \(!\(await puedeGuardar\(\)\)\) return;/.test(src), "debe cortar el submit");
});

test("12b. las tres vías de actualización de precios pasan por el guard", () => {
  const src = sinComentarios("components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx");
  const guardias = (src.match(/if \(!\(await puedeGuardar\(\)\)\) return;/g) || []).length;
  const escrituras = (src.match(/fetch\("\/api\/productos\/precios\/apply"/g) || []).length;
  assert.equal(escrituras, 3, "cambió la cantidad de puntos de escritura");
  assert.equal(guardias, 3, "cada escritura necesita su guard");
  // Cada guard debe estar antes de su fetch.
  let desde = 0;
  for (let i = 0; i < 3; i++) {
    const g = src.indexOf("if (!(await puedeGuardar())) return;", desde);
    const f = src.indexOf('fetch("/api/productos/precios/apply"', desde);
    assert.ok(g !== -1 && f !== -1 && g < f, `escritura ${i + 1}: el guard no precede al fetch`);
    desde = f + 1;
  }
});

test("12c. los dos formularios muestran el aviso", () => {
  for (const rel of [
    "components/productos/FormProducto.jsx",
    "components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(/<AvisoVersionNueva visible=\{versionNueva\}/.test(src), `${rel} no renderiza el aviso`);
  }
});

test("12d. no se tocó la lógica de margen ni de precios", () => {
  const src = sinComentarios("components/productos/FormProducto.jsx");
  // Sigue existiendo la única derivación legítima y el helper común.
  assert.ok(/pv \/ pc - 1/.test(src));
  assert.ok(/precioDesdeMargen/.test(src));
  assert.ok(/redondearA100Arriba/.test(src));
  // Y aplicarRedondeoVenta sigue sin tocar el margen.
  const i = src.indexOf("const aplicarRedondeoVenta");
  const cuerpo = src.slice(i, src.indexOf("const margenEfectivoInfo"));
  assert.ok(!/\bmargen\b/.test(cuerpo));
});
