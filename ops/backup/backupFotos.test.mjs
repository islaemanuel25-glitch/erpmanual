// CANDADOS DEL RESPALDO DE FOTOS DE PRODUCTO.
//
// ── QUÉ DEFIENDEN ─────────────────────────────────────────────────────────
//
// Un backup que falla en silencio es peor que no tenerlo, porque uno cree que
// está cubierto. Las cuatro formas de que eso pase acá:
//
//   1. Empaquetar un directorio VACÍO. Docker crea el punto de montaje aunque el
//      volumen falte, así que el tar sale bien, pesa unos bytes y no tiene nada.
//   2. Que el paquete se corte a la mitad y `gzip -t` igual pase — no pasa, pero
//      un tar vacío está perfectamente bien comprimido, así que `gzip -t` SOLO
//      tampoco alcanza.
//   3. Que el patrón que cuenta fotos se separe del que la aplicación usa para
//      nombrarlas, y el backup informe "0 fotos" sobre un volumen lleno.
//   4. Que alguien le agregue una retención de siete días copiando la de
//      comprobantes.
//
// ── Y SE EJERCE DE VERDAD ─────────────────────────────────────────────────
//
// Los tres primeros no se comprueban leyendo el script: se arma un tar.gz real
// en un directorio temporal y se le corren ENCIMA los mismos comandos que corre
// el backup, con los patrones SACADOS DEL PROPIO SCRIPT. Si alguien cambia el
// patrón allá, este candado usa el nuevo y compara contra la aplicación — no
// contra una copia escrita acá.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  NOMBRE_CENTINELA_FOTOS,
  esNombreDeFotoValido,
} from "@/lib/productos/fotoProducto";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SCRIPT = fs.readFileSync(path.join(RAIZ, "ops/backup/vps-backup-erpazul.sh"), "utf8");

/**
 * Corre un comando de shell EN un directorio, con nombres RELATIVOS.
 *
 * Las rutas absolutas de Windows no cruzan: `tar -tzf "C:\Users\..."` muere con
 * "Error is not recoverable" porque las barras invertidas no son separadores
 * para tar. Se trabaja siempre con el directorio como `cwd` y nombres cortos.
 */
function sh(comando, cwd) {
  return execFileSync("bash", ["-c", comando], { cwd, encoding: "utf8" });
}

/** Arma un tar.gz con los nombres dados y devuelve su ruta. */
function empaquetar(nombres) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fotos-backup-"));
  const vol = path.join(dir, "vol");
  fs.mkdirSync(vol);
  for (const n of nombres) fs.writeFileSync(path.join(vol, n), "x");
  sh(`tar -czf paquete.tar.gz -C vol .`, dir);
  return { dir, tar: path.join(dir, "paquete.tar.gz"), nombre: "paquete.tar.gz" };
}

test("B1. EL CENTINELA DEL BACKUP ES EL MISMO QUE EL DE LA APLICACIÓN", () => {
  // Si se separan, el backup busca un archivo que nunca está y falla siempre —o
  // peor, si el que busca existiera por otro motivo, daría por bueno un volumen
  // que no es el nuestro.
  const m = SCRIPT.match(/CENTINELA_FOTOS="([^"]+)"/);
  assert.ok(m, "el script no declara el centinela");
  assert.equal(m[1], NOMBRE_CENTINELA_FOTOS);

  const v = SCRIPT.match(/VOLUMEN_FOTOS="([^"]+)"/);
  assert.ok(v, "el script no declara el volumen");
  assert.equal(v[1], "erpazul_fotos_productos");

  // Y el mismo nombre tiene que estar en el compose, o se respaldaría un volumen
  // que la aplicación no usa.
  const compose = fs.readFileSync(path.join(RAIZ, "docker-compose.prod.yml"), "utf8");
  assert.match(compose, new RegExp(`${v[1]}:`));
});

test("B2. EL PATRÓN QUE CUENTA FOTOS ES EL MISMO QUE LAS NOMBRA", () => {
  // ── POR QUÉ ESTO IMPORTA ────────────────────────────────────────────────
  //
  // El backup cuenta las fotos del paquete con una expresión escrita en el
  // script. La aplicación valida los nombres con otra, en JavaScript. Si se
  // separan, el backup puede informar "0 fotos" sobre un volumen lleno y el log
  // diría que todo salió bien.
  //
  // Se saca la expresión DEL SCRIPT y se la compara contra la de la aplicación,
  // caso por caso. No se escribe una tercera acá.
  const m = SCRIPT.match(/grep -cE '\^\\\.\/([^']+)'/);
  assert.ok(m, "no se encontró el patrón que cuenta fotos en el script");
  const patronDelScript = new RegExp(`^${m[1]}$`);

  for (const nombre of ["p1-0a1b2c3d.webp", "p2023-ffffffff.jpg", "p7-00000000.png"]) {
    assert.equal(
      patronDelScript.test(nombre),
      esNombreDeFotoValido(nombre),
      `el backup y la aplicación no coinciden sobre ${nombre}`
    );
  }
  for (const nombre of ["p1-0a1b2c3d.svg", "p-0a1b2c3d.webp", "otracosa.webp", "README.md"]) {
    assert.equal(
      patronDelScript.test(nombre),
      esNombreDeFotoValido(nombre),
      `el backup y la aplicación no coinciden sobre ${nombre}`
    );
  }
});

test("B3. LA VERIFICACIÓN DISTINGUE UN PAQUETE BUENO DE UNO VACÍO", () => {
  // Es el caso 1 y el que de verdad puede pasar: el volumen no montado. Docker
  // crea el directorio igual, así que el tar sale bien — con nada adentro.
  const bueno = empaquetar([NOMBRE_CENTINELA_FOTOS, "p1-0a1b2c3d.webp", "p2-ffffffff.jpg"]);
  const vacio = empaquetar([]);
  try {
    // Las mismas tres preguntas del script, en el mismo orden.
    assert.doesNotThrow(() => sh(`gzip -t ${bueno.nombre}`, bueno.dir), "el paquete bueno no pasó gzip -t");
    // Y el vacío TAMBIÉN pasa gzip -t: por eso esa pregunta sola no alcanza.
    assert.doesNotThrow(() => sh(`gzip -t ${vacio.nombre}`, vacio.dir), "un tar vacío igual está bien comprimido");

    const listadoBueno = sh(`tar -tzf ${bueno.nombre}`, bueno.dir);
    const listadoVacio = sh(`tar -tzf ${vacio.nombre}`, vacio.dir);

    // El centinela es lo que los separa.
    assert.ok(listadoBueno.includes(NOMBRE_CENTINELA_FOTOS));
    assert.ok(!listadoVacio.includes(NOMBRE_CENTINELA_FOTOS), "el vacío trajo centinela");

    // Y el conteo, con el patrón del script.
    const m = SCRIPT.match(/grep -cE '(\^\\\.\/[^']+)'/);
    const cuantas = (listadoBueno.match(new RegExp(m[1].replace(/\\\./g, "\\."), "gm")) || []).length;
    assert.equal(cuantas, 2, "no contó las dos fotos del paquete");
  } finally {
    fs.rmSync(bueno.dir, { recursive: true, force: true });
    fs.rmSync(vacio.dir, { recursive: true, force: true });
  }
});

test("B4. UN PAQUETE TRUNCADO NO PASA", () => {
  // El caso 2: el tar se cortó a mitad de camino. `gzip -t` lo agarra, y por eso
  // está antes que el listado — leer un tar roto puede colgar o devolver basura.
  const { dir, tar, nombre } = empaquetar([NOMBRE_CENTINELA_FOTOS, "p1-0a1b2c3d.webp"]);
  try {
    const bytes = fs.readFileSync(tar);
    fs.writeFileSync(tar, bytes.subarray(0, Math.floor(bytes.length / 2)));
    assert.throws(() => sh(`gzip -t ${nombre}`, dir), "un gzip cortado por la mitad pasó la verificación");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B5. LAS FOTOS NO HEREDAN LA RETENCIÓN DE LOS COMPROBANTES", () => {
  // ── EL CASO 4 ───────────────────────────────────────────────────────────
  //
  // Las de comprobante se borran a los siete días por diseño (DEC-0008). Estas
  // NO. Lo que se afirma es que el backup no menciona ninguna caducidad de
  // contenido y que no toca el volumen de comprobantes: mezclarlos es la única
  // forma de que una foto de producto termine con fecha de vencimiento.
  assert.doesNotMatch(SCRIPT, /DIAS_DE_VIDA|vencid|retencionImagen/i);
  assert.doesNotMatch(SCRIPT, /erpazul_comprobantes/, "el backup de fotos toca el volumen de comprobantes");

  // Lo que sí hay es rotación de COPIAS, que es otra cosa: cuántos paquetes se
  // guardan, no cuánto vive una foto. Se afirma que existe y que es la del
  // script, no una heredada.
  assert.match(SCRIPT, /RETENER_DIARIOS_FOTOS=/);
  assert.match(SCRIPT, /rotar "fotos-diario-\*\.tar\.gz"/);
});

test("B6. LAS FOTOS VAN DESPUÉS DE LA BASE, Y NO LA PUEDEN ARRUINAR", () => {
  // Si el respaldo de fotos corriera antes, un volumen sin montar dejaría a la
  // BASE sin backup del día: se cambiaría un riesgo chico por el más grande que
  // hay. Se afirma el orden en el archivo.
  const iDump = SCRIPT.indexOf("dump OK:");
  const iRotarBase = SCRIPT.indexOf('rotar "diario-*.sql.gz"');
  const iFotos = SCRIPT.indexOf("respaldar_fotos || FALLO_FOTOS=1");
  assert.ok(iDump > 0 && iRotarBase > iDump, "el orden del dump cambió");
  assert.ok(iFotos > iRotarBase, "el respaldo de fotos corre antes de terminar el de la base");

  // Y su fallo se informa con un código propio: tiene que verse en el estado del
  // servicio, no perderse en el log.
  assert.match(SCRIPT, /exit 3/);
});

test("B7. HAY PUNTEROS DE FOTOS, COMO LOS DE LA BASE", () => {
  // La notebook los lee en vez de adivinar el nombre del día. Sin ellos, bajar
  // el paquete depende de que alguien arme el nombre a mano.
  for (const p of ["ULTIMO_FOTOS_DIARIO.txt", "ULTIMO_FOTOS_SEMANAL.txt", "ULTIMO_FOTOS_MENSUAL.txt"]) {
    assert.ok(SCRIPT.includes(p), `falta el puntero ${p}`);
  }
  const bajar = fs.readFileSync(path.join(RAIZ, "ops/backup/notebook-bajar-backup.ps1"), "utf8");
  assert.match(bajar, /ULTIMO_FOTOS_DIARIO\.txt/, "la notebook no baja el paquete de fotos");
});
