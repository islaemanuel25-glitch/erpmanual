// CONTRAPRUEBAS CONTRA POSTGRES DE LOS DOS DEFECTOS QUE VIVEN EN LA BASE.
//
// Las contrapruebas de `scripts/contrapruebas-revision.mjs` rompen y miran
// candados de texto. Estas dos rompen y miran DATOS: se reintroduce el defecto,
// se corre la suite de recepción de verdad contra Postgres, y se exige que las
// afirmaciones que lo cubren se pongan rojas.
//
// Se corre con la misma DATABASE_URL que la suite:
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/contrapruebasRevision.mjs
//
// Cada caso arranca de un esquema limpio, porque la suite monta y desmonta sus
// propios datos y dos corridas encimadas se estorban.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ORIGEN = process.cwd();

const CASOS = [
  {
    n: 1,
    defecto: "desmarcar vuelve a pasar por el validador y usa el fallback de lo enviado",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    // ── HAY QUE ROMPER LAS DOS MITADES, Y ESO SE APRENDIÓ ACÁ ──────────────
    //
    // El arreglo del defecto 1 tiene dos partes: el camino propio de desmarcar,
    // y que la validación parta de lo PERSISTIDO. La primera versión de esta
    // contraprueba rompía solo la primera y la suite se quedaba verde — porque
    // la segunda alcanza sola para que el conteo sobreviva.
    //
    // Eso no era un candado flojo: es que las dos mitades se tapan entre sí, y
    // cualquiera de las dos sostiene el dato. Para volver al defecto de verdad
    // —"desmarcar usa el fallback de lo enviado"— hay que sacar las dos.
    inyecciones: [
      { de: "      if (!revisado) {", a: "      if (false) {" },
      { de: "          recibido: d.recibido,", a: "          recibido: undefined," },
      {
        de: "          recibidoUnidadesSueltas: d.recibidoUnidadesSueltas,",
        a: "          recibidoUnidadesSueltas: undefined,",
      },
    ],
    // Lo que tiene que gritar: el conteo de 5 bultos y 5 sueltas volviendo a
    // 6 y 0 por tocar "desmarcar".
    esperadas: [
      "H · el recibido SIGUE en 5",
      "H · las sueltas SIGUEN en 5",
    ],
  },
  {
    n: 6,
    defecto: "el ajuste informativo del origen vuelve a ignorar las sueltas",
    archivo: "app/api/transferencias/detalle/route.js",
    inyecciones: [
      {
        de: "              recibidaSueltas: d.recibidoUnidadesSueltas,",
        a: "              recibidaSueltas: null,",
      },
    ],
    esperadas: [
      "I.2 · al origen se le devuelve 1, no 6",
    ],
  },
];

// `node_modules` se ENLAZA, no se copia. Copiarlo entero daba un árbol a medias
// —`next/server` dejaba de resolver, con un mensaje que apuntaba a otro lado— y
// además tarda. Enlazado, la resolución sube desde la copia, encuentra el enlace
// y entra al mismo árbol de siempre. Nada de lo que se rompe a propósito vive
// ahí adentro.
const copiar = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), "contra-db-"));
  for (const entrada of fs.readdirSync(ORIGEN)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    execFileSync("cp", ["-a", path.join(ORIGEN, entrada), destino]);
  }
  fs.symlinkSync(path.join(ORIGEN, "node_modules"), path.join(destino, "node_modules"));
  return destino;
};

/**
 * El entorno del hijo, SIN la marca de registro del cargador de alias.
 *
 * `scripts/alias-loader.mjs` se protege de registrarse en cadena con
 * `__ERPAZUL_ALIAS_LOADER__` en el entorno. Este script corre con el cargador
 * puesto, así que la marca ya está — y heredarla hacía que el hijo importara el
 * cargador y NO lo registrara. El síntoma no se parecía en nada a la causa:
 * `next/server` dejaba de resolver y el mensaje culpaba a `node_modules`, que
 * estaba perfecto.
 */
const entornoHijo = () => {
  const env = { ...process.env };
  delete env.__ERPAZUL_ALIAS_LOADER__;
  return env;
};

let fallas = 0;
for (const c of CASOS) {
  const raiz = copiar();
  const archivo = path.join(raiz, c.archivo);
  let texto = fs.readFileSync(archivo, "utf8");

  // Cada inyección tiene que aplicar, y una sola vez. Un ancla que no engancha
  // deja el archivo sano y la suite verde, y eso se lee como "el candado no
  // sirve" cuando lo que no sirvió fue el destrozo.
  let ancladas = true;
  for (const iny of c.inyecciones) {
    const apariciones = texto.split(iny.de).length - 1;
    if (apariciones !== 1) {
      console.log(`✗ ${c.n}  una inyección no aplica (${apariciones} coincidencias de «${iny.de.trim()}»)`);
      ancladas = false;
      break;
    }
    texto = texto.replace(iny.de, iny.a);
  }
  if (!ancladas) {
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }
  fs.writeFileSync(archivo, texto);

  let salida = "";
  try {
    salida = execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", "scripts/pruebas-db/recepcionTransferencias.mjs"],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: entornoHijo() }
    );
  } catch (e) {
    salida = `${e.stdout || ""}${e.stderr || ""}`;
  }

  // Que la suite haya CORRIDO: si abortó al montar, el rojo no prueba nada.
  const corrio = /Afirmaciones que pasaron: (\d+)/.exec(salida);
  const pasadas = corrio ? Number(corrio[1]) : 0;
  if (pasadas < 100) {
    console.log(`✗ ${c.n}  la suite no llegó a correr (${pasadas} afirmaciones): el rojo no vale`);
    console.log(salida.split("\n").slice(0, 12).map((l) => `     | ${l}`).join("\n"));
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }

  const faltantes = c.esperadas.filter((t) => !salida.includes(`✗ [`) || !salida.includes(t + " —"));
  if (faltantes.length === 0) {
    console.log(`✓ ${c.n}  ${c.defecto} → ROJO en: ${c.esperadas.join(" · ")}`);
  } else {
    console.log(`✗ ${c.n}  ${c.defecto} → NO se pusieron rojas: ${faltantes.join(" · ")}`);
    fallas++;
  }
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(fallas === 0
  ? `\n${CASOS.length}/${CASOS.length} contrapruebas de base en rojo, como corresponde`
  : `\n${fallas} contrapruebas de base NO probaron nada`);
process.exit(fallas === 0 ? 0 : 1);
