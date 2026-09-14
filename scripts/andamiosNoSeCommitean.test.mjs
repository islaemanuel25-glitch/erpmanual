// NINGÚN ANDAMIO ENTRA AL REPO SIN SU GUARDIA DE ENTORNO.
//
// ── ESTE CANDADO DECÍA "NINGUNO ENTRA", Y SE REESCRIBIÓ SABIENDO POR QUÉ ────
//
// La versión anterior prohibía que un andamio quedara trackeado, con este
// motivo: *"esa ruta es una PÁGINA DE LA APLICACIÓN: si entra al repo se
// construye y se despliega, con datos de mentira, en producción."*
//
// El motivo era correcto y **el guardia de entorno lo elimina**: con
// `if (process.env.NODE_ENV === "production") notFound();` la ruta deja de
// existir en producción. Comprobado ejecutando, en las dos direcciones y el
// 2026-08-15:
//
//   · en desarrollo los tres andamios contestan **200**;
//   · con el entorno en producción —`npm run build` y `next start`— los tres
//     contestan **404**, y el control `/inicio` sigue contestando 200, así que
//     el 404 es del guardia y no de un servidor roto.
//
// Lo que se gana al dejarlos entrar: dejan de perderse entre máquinas, tienen
// historia, y el que venga después ve qué se probó y cómo. El andamio del
// carrito estuvo suelto desde la migración de la hoja sin que nadie supiera que
// existía.
//
// ── POR QUÉ SIGUE SIENDO UN CANDADO ────────────────────────────────────────
//
// Porque lo que ahora sostiene la seguridad es UNA LÍNEA por archivo, y una
// línea que hay que acordarse de escribir es un hábito. Este repo ya tiene la
// cuenta de lo que cuestan los hábitos: el comentario que esquivaba al contador,
// el `git add -A`, el clon sin identidad.
//
// Y hay un motivo extra medido el mismo día: **no existe `middleware` en este
// proyecto**, así que no hay ningún guardia de servidor detrás. Comprobado
// contra producción sin sesión, `/inicio` y `/modulos/categorias` contestan 200
// a cualquiera. Un andamio sin su línea quedaría servido a quien escriba la
// dirección, y no habría una segunda barrera.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Los andamios TRACKEADOS. `git ls-files` lista lo trackeado, que es la pregunta.
 *
 * ── ESTE ES EL ÚNICO QUE NO LLEVA `--others`, Y ES A PROPÓSITO ───────────
 *
 * El 2026-09-14 se barrieron todas las enumeraciones del repo para agregarles
 * `--others --exclude-standard` / `--untracked`: `git ls-files` y `git grep` a
 * secas miran solo lo trackeado, así que un archivo nuevo sin commitear pasa
 * invisible y el candado da verde sin haber podido mirar.
 *
 * Acá NO corresponde, porque la pregunta de este candado es literalmente
 * "¿QUEDÓ ALGÚN ANDAMIO COMMITEADO?". Un andamio sin commitear es el caso
 * BUENO: es alguien trabajando. Agregarle `--others` haría que este candado se
 * ponga rojo cada vez que alguien tiene un andamio abierto en su máquina, que es
 * exactamente lo que no tiene que hacer.
 *
 * Si una auditoría futura vuelve a pasar por acá: no es un olvido, está mirado.
 */
function andamiosTrackeados() {
  return execSync("git ls-files app", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /^app\/andamio-/.test(l));
}

test("TODO ANDAMIO TRACKEADO TIENE SU GUARDIA DE ENTORNO", () => {
  const sinGuardia = [];
  for (const ruta of andamiosTrackeados()) {
    if (!ruta.endsWith(".jsx") && !ruta.endsWith(".js")) continue;
    const fuente = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    // Se miran las DOS mitades: el guardia y el `notFound` importado. Con una
    // sola, la línea estaría escrita y no haría nada — que es la forma exacta en
    // la que este repo ya se comió tres candados que no afirmaban.
    const tieneGuardia = /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/.test(fuente);
    const importaNotFound = /import \{[^}]*\bnotFound\b[^}]*\} from "next\/navigation";/.test(fuente);
    if (!tieneGuardia || !importaNotFound) {
      sinGuardia.push(
        `${ruta}${!tieneGuardia ? " (falta el guardia)" : ""}${!importaNotFound ? " (falta importar notFound)" : ""}`
      );
    }
  }

  assert.deepEqual(
    sinGuardia,
    [],
    "hay un andamio commiteado SIN su guardia de entorno: quedaría servido en producción " +
      "a cualquiera que escriba la dirección, y no hay middleware detrás.\n  " +
      sinGuardia.join("\n  ")
  );
});

test("EL CANDADO SABE MIRAR: encuentra las rutas que sí están", () => {
  // Un `git ls-files` mal escrito devuelve vacío y parece un verde. Se comprueba
  // que el comando enumera de verdad antes de creerle al cero.
  const todas = execSync("git ls-files app", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.ok(todas.length > 100, `solo enumeró ${todas.length} archivos de app/: revisá el comando`);
  assert.ok(
    todas.some((l) => l.endsWith("page.jsx")),
    "no aparece ninguna página: el enumerado no está mirando lo que cree"
  );
});

test("Y ENCUENTRA LOS ANDAMIOS, no solo las páginas", () => {
  // La otra mitad del control anterior. Si algún día el patrón del nombre cambia
  // —`banco-*`, `prueba-*`— este candado dejaría de mirar nada y el de arriba
  // seguiría en verde, porque `app/` sigue llena de páginas.
  assert.ok(
    andamiosTrackeados().length > 0,
    "no hay ningún andamio trackeado: si es a propósito, este candado dejó de afirmar algo y hay que decidir si se borra"
  );
});
