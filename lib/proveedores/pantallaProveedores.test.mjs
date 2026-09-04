// Candados de la PANTALLA de proveedores contra la autorización real.
//
// Lo que defienden: que la puerta de la UI pida lo mismo que la del servidor.
// Exigía `proveedores.ver` a secas mientras la API acepta `compras.ver` O
// `proveedores.ver`, así que un ENCARGADO recibía "sin permisos" sobre una API
// que le habría contestado perfecto. Una puerta más cerrada que la del servidor
// es tan defecto como una más abierta: deja gente afuera sin motivo y nadie lo
// ve, porque no hay ningún error.
//
// Y que cada botón pida su propia capacidad, para no ofrecer acciones que
// terminan en 403 al tocarlas.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const PAGINA = "app/modulos/proveedores/page.jsx";

test("A4. LA PANTALLA SE ABRE CON compras.ver O CON proveedores.ver", () => {
  const fuente = sinComentarios(leer(PAGINA));
  assert.match(
    fuente,
    /hasAnyPermission\(\["compras\.ver",\s*"proveedores\.ver"\]\)/,
    "la pantalla no acepta los dos permisos que acepta la API"
  );
  // Y la comparación a mano contra el comodín se fue: la resuelve el helper.
  assert.doesNotMatch(
    fuente,
    /permisosP\.includes\("proveedores\.ver"\)/,
    "volvió la regla vieja, que exigía proveedores.ver a secas"
  );
});

test("A5. LA PANTALLA PIDE EXACTAMENTE LO MISMO QUE LAS DOS RUTAS", () => {
  // No es una lista elegida a ojo: se lee de las rutas y se compara. Si mañana
  // una ruta cambia su par de permisos, esto se pone rojo en vez de dejar la
  // pantalla desalineada en silencio.
  const enLaPagina = new Set(["compras.ver", "proveedores.ver"]);
  for (const ruta of [
    "app/api/proveedores/listar/route.js",
    "app/api/proveedores/opciones/route.js",
  ]) {
    const m = sinComentarios(leer(ruta)).match(/PERMISO_VER_PROVEEDORES\s*=\s*\[([^\]]*)\]/);
    assert.ok(m, `${ruta} dejó de declarar su lista de permisos de lectura`);
    const dela = new Set(m[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, "")));
    assert.deepEqual(
      [...dela].sort(),
      [...enLaPagina].sort(),
      `${ruta} acepta otros permisos que los que pide la pantalla`
    );
  }
});

test("A6. CADA BOTÓN PIDE SU PROPIA CAPACIDAD", () => {
  const fuente = sinComentarios(leer(PAGINA));
  assert.match(fuente, /hasPermission\("proveedores\.crear"\)/, "el alta no pide su permiso");
  assert.match(fuente, /hasPermission\("compras\.crear"\)/, "comprar no pide su permiso");
  assert.match(fuente, /puedeCrearProveedor && \(/, "el botón de alta no está condicionado");
  assert.match(fuente, /puedeComprar \?/, "el botón de comprar no está condicionado");
  // Editar y eliminar siguen atados a administrador MIENTRAS el backend lo esté.
  assert.match(fuente, /puedeAdministrarFicha = isAdmin/);
  assert.match(fuente, /puedeAdministrarFicha && \(/);
});

test("A7. Y ESO SIGUE SIENDO CIERTO PORQUE EL BACKEND NO SE ABRIÓ", () => {
  // El día que `editar` deje de pedir administrador, este candado obliga a
  // volver acá y decidir qué muestra la UI, en vez de que quede desalineada.
  for (const p of [
    "app/api/proveedores/editar/route.js",
    "app/api/proveedores/eliminar/route.js",
  ]) {
    assert.match(sinComentarios(leer(p)), /requireAdmin/, `${p} ya no es admin-only`);
  }
  const registry = leer("lib/rbac/registry.js");
  for (const code of ["proveedores.editar", "proveedores.eliminar"]) {
    assert.doesNotMatch(
      registry,
      new RegExp(`code: "${code}"`),
      `${code} entró al catálogo: esta tanda no lo agrega`
    );
  }
});

test("A7-bis. CONTRAPRUEBA de A4: el analizador ve la regla vieja si vuelve", () => {
  const comoEraAntes =
    'const esAdminP = permisosP.includes("*");\n' +
    'if (!esAdminP && !permisosP.includes("proveedores.ver")) return <SinPermisos />;';
  assert.match(comoEraAntes, /permisosP\.includes\("proveedores\.ver"\)/);
  // Y ve la forma nueva, así que el match de A4 no pasa por vacío.
  assert.match(
    'const puedeVer = hasAnyPermission(["compras.ver", "proveedores.ver"]);',
    /hasAnyPermission\(\["compras\.ver",\s*"proveedores\.ver"\]\)/
  );
});
