// EL CARTEL DE IDENTIFICARSE VA ARRIBA DE TODO.
//
// Estaba en `z-[100]` con los modales del sistema en `z-[9999]`, y los dos viven
// en el mismo contexto de apilado: `OperadorProvider` lo dibuja como hermano de
// `{children}` en `app/modulos/layout.jsx`.
//
// Se ejerció en el navegador: con un modal abierto, el cartel se dibujaba pero
// quedaba DEBAJO DEL VELO. Se veía apagado y no se podía tocar ni el PIN ni el
// botón. Un operario leyendo "identificate para seguir" sin poder hacerlo, con
// el mostrador lleno.
//
// Este candado es lo único que separa a ese cartel de volver a quedar tapado: no
// alcanza con que su número sea alto hoy, tiene que seguir siendo el más alto.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { esComentario } from "@/lib/hardcodeo/contador.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const zDelCartel = () => {
  const src = fs.readFileSync(path.join(RAIZ, "components/operador/ModalPedirOperador.jsx"), "utf8");
  const m = src.match(/fixed inset-0 z-\[(\d+)\]/);
  assert.ok(m, "el cartel dejó de declarar su z: sin eso no hay nada que comparar");
  return Number(m[1]);
};

/** Todas las capas del repo con su z, salteando comentarios como el contador. */
function capasConZ() {
  const archivos = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "app/**/*.jsx", "components/**/*.jsx"],
        { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
      ).split("\n").map((s) => s.trim()).filter(Boolean)
    ),
  ];
  const capas = [];
  for (const ruta of archivos) {
    if (ruta.endsWith("components/operador/ModalPedirOperador.jsx")) continue;
    const lineas = fs.readFileSync(path.join(RAIZ, ruta), "utf8").split("\n");
    for (let i = 0; i < lineas.length; i++) {
      if (!/fixed\s+inset-0/.test(lineas[i]) || esComentario(lineas[i])) continue;
      const m = lineas.slice(i, i + 6).join(" ").match(/z-\[?(\d+)\]?/);
      if (m) capas.push({ ruta, linea: i + 1, z: Number(m[1]) });
    }
  }
  return capas;
}

test("el cartel está ARRIBA de todas las capas del sistema", () => {
  const z = zDelCartel();
  const arriba = capasConZ().filter((c) => c.z >= z);
  assert.deepEqual(
    arriba.map((c) => `${c.ruta}:${c.linea} (z ${c.z})`),
    [],
    `estas capas tapan al cartel de identificarse, que quedó en z ${z}`
  );
});

test("HAY CAPAS QUE MIRAR: si no, este candado no prueba nada", () => {
  // La contracara. Si el patrón dejara de encontrar capas, el de arriba pasaría
  // en verde sin haber comparado contra nada.
  const capas = capasConZ();
  assert.ok(capas.length >= 20, `solo ${capas.length} capas encontradas: ¿cambió cómo se escriben?`);
  assert.ok(capas.some((c) => c.z >= 9000), "no se ve ninguna capa de las altas: el patrón dejó de servir");
});

test("y no volvió a bajar a z-[100]", () => {
  // El valor exacto que tenía cuando quedaba tapado. Vale nombrarlo: si alguien
  // "limpia" los z-index y lo devuelve ahí, esto lo dice con su nombre.
  assert.notEqual(zDelCartel(), 100);
});
