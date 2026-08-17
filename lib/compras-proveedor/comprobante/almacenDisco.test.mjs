// Candados de la cáscara que toca el disco.
//
// El criterio puro ya está probado en almacenImagenes.test.mjs. Lo que se
// prueba acá es lo otro: que lo que se lee del sistema de archivos llegue bien
// al criterio, y que la escritura FRENE de verdad.
//
// Se usan directorios reales, no simulados. Es el punto: el caso peligroso —un
// directorio que existe, está vacío y es perfectamente escribible— es
// indistinguible de un volumen montado salvo por el centinela, y eso solo se
// comprueba contra un directorio de verdad.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inspeccionarAlmacen,
  exigirAlmacen,
  verificarAlArrancar,
  traducirErrorDeEscritura,
  medirOcupacion,
  AlmacenNoDisponible,
  VARIABLE_RUTA,
} from "./almacenDisco.js";
import { MOTIVO_ALMACEN, NOMBRE_CENTINELA } from "./almacenImagenes.js";

async function directorioTemporal({ conCentinela }) {
  const base = await mkdtemp(join(tmpdir(), "comprobantes-"));
  const vol = join(base, "comprobantes");
  await mkdir(vol);
  if (conCentinela) await writeFile(join(vol, NOMBRE_CENTINELA), "");
  return { vol, limpiar: () => rm(base, { recursive: true, force: true }) };
}

test("un volumen montado de verdad pasa", async () => {
  const { vol, limpiar } = await directorioTemporal({ conCentinela: true });
  try {
    const r = await inspeccionarAlmacen({ ruta: vol });
    assert.equal(r.ok, true, r.motivo ?? "");
    assert.equal(r.ruta, vol);
  } finally {
    await limpiar();
  }
});

test("UN DIRECTORIO VACÍO Y ESCRIBIBLE NO PASA POR VOLUMEN", async () => {
  // La forma exacta que tiene un punto de montaje cuando el volumen no está:
  // existe, está vacío, y escribir en él funciona. Sin el centinela, esto
  // habría pasado por bueno y las fotos se habrían perdido al recrear la app.
  const { vol, limpiar } = await directorioTemporal({ conCentinela: false });
  try {
    const r = await inspeccionarAlmacen({ ruta: vol });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_CENTINELA);
  } finally {
    await limpiar();
  }
});

test("un directorio que no existe se distingue de uno sin centinela", async () => {
  const r = await inspeccionarAlmacen({ ruta: join(tmpdir(), "no-existe-comprobantes-xyz") });
  assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_DIRECTORIO);
});

test("sin la variable configurada no se adivina una ruta", async () => {
  // ── ESTE CANDADO NO EJERCÍA SU PROPIO CASO ────────────────────────────────
  //
  // Su nombre dice "SIN la variable configurada" y no la desconfiguraba: se
  // apoyaba en que el entorno de la suite estuviera vacío por casualidad. Y lo
  // estaba, porque hasta el 2026-08-17 el corredor no leía el `.env`.
  //
  // El día que el corredor empezó a leerlo —y `COMPROBANTES_VOLUMEN_PATH` pasó a
  // estar puesta— se puso ROJO, y destapó que además CONTRADECÍA al candado de
  // abajo: `inspeccionarAlmacen({ ruta: undefined })` cae al default de la firma
  // y lee la variable, que es justo lo que "la ruta sale de la variable de
  // entorno cuando no se le pasa una" afirma que TIENE que pasar. Los dos no
  // podían ser ciertos a la vez con la variable puesta.
  //
  // Se arregla ejerciendo el caso de verdad: se saca la variable del entorno,
  // se mide, y se repone. NO se sacó `undefined` de la lista —eso habría sido
  // achicar lo que afirma para que pase—: ahora afirma lo mismo que antes, pero
  // sobre el escenario que su nombre promete y sin depender del entorno.
  const previo = process.env[VARIABLE_RUTA];
  delete process.env[VARIABLE_RUTA];
  try {
    for (const ruta of [undefined, null, "", "   "]) {
      const r = await inspeccionarAlmacen({ ruta });
      assert.equal(r.ok, false, String(ruta));
      assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_RUTA);
      assert.equal(r.ruta, null);
    }
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
  }
});

test("la ruta sale de la variable de entorno cuando no se le pasa una", async () => {
  const previo = process.env[VARIABLE_RUTA];
  const { vol, limpiar } = await directorioTemporal({ conCentinela: true });
  try {
    process.env[VARIABLE_RUTA] = vol;
    const r = await inspeccionarAlmacen();
    assert.equal(r.ok, true, r.motivo ?? "");
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
    await limpiar();
  }
});

// ── La escritura ───────────────────────────────────────────────────────────

test("SIN VOLUMEN, EXIGIR FRENA — no devuelve una ruta igual", async () => {
  const { vol, limpiar } = await directorioTemporal({ conCentinela: false });
  const previo = process.env[VARIABLE_RUTA];
  try {
    process.env[VARIABLE_RUTA] = vol;
    await assert.rejects(
      () => exigirAlmacen({ comprobanteId: 1, proveedorNombre: "Dyssa" }),
      (e) => {
        assert.ok(e instanceof AlmacenNoDisponible);
        assert.equal(e.motivo, MOTIVO_ALMACEN.SIN_CENTINELA);
        return true;
      },
    );
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
    await limpiar();
  }
});

test("el error dice el motivo, no un código", async () => {
  // Quien lo lea va a estar apurado. Que el mensaje del error ya sea la
  // explicación evita tener que ir a buscar qué significa.
  const e = new AlmacenNoDisponible({ motivo: MOTIVO_ALMACEN.SIN_CENTINELA, ruta: "/vol/comprobantes" });
  assert.match(e.message, /NO ESTÁ MONTADO/);
  assert.equal(e.ruta, "/vol/comprobantes");
});

test("con volumen, exigir devuelve la ruta absoluta ya armada", async () => {
  // Que la arme esta función y no el que llama: si el que llama la arma, puede
  // armarla sin haber preguntado nunca.
  const { vol, limpiar } = await directorioTemporal({ conCentinela: true });
  const previo = process.env[VARIABLE_RUTA];
  try {
    process.env[VARIABLE_RUTA] = vol;
    const r = await exigirAlmacen({
      comprobanteId: 42,
      proveedorNombre: "Dyssa",
      puntoVenta: "0011",
      numero: "00794708",
    });
    assert.equal(r.directorio, vol);
    assert.equal(r.nombre, "Dyssa_0011_00794708_42_p1.jpg");
    assert.equal(r.rutaAbsoluta, join(vol, "Dyssa_0011_00794708_42_p1.jpg"));
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
    await limpiar();
  }
});

test("LA ESCRITURA SE PREGUNTA CADA VEZ, NO UNA VEZ POR PROCESO", async () => {
  // Un montaje se puede caer DESPUÉS de arrancar. Si el veredicto se cacheara,
  // el proceso seguiría escribiendo en el disco del contenedor hasta que
  // alguien lo reiniciara.
  const { vol, limpiar } = await directorioTemporal({ conCentinela: true });
  const previo = process.env[VARIABLE_RUTA];
  try {
    process.env[VARIABLE_RUTA] = vol;
    await exigirAlmacen({ comprobanteId: 1 }); // primera: anda
    await rm(join(vol, NOMBRE_CENTINELA)); // se cae el montaje
    await assert.rejects(() => exigirAlmacen({ comprobanteId: 2 }), AlmacenNoDisponible);
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
    await limpiar();
  }
});

// ── El volumen lleno ───────────────────────────────────────────────────────

test("EL VOLUMEN LLENO SE TRADUCE A UN MENSAJE CLARO, NO A UN CÓDIGO", () => {
  const e = Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
  const t = traducirErrorDeEscritura(e, "/vol/comprobantes");
  assert.ok(t instanceof AlmacenNoDisponible);
  assert.equal(t.motivo, MOTIVO_ALMACEN.SIN_ESPACIO);
  assert.equal(t.causa, e); // la causa original no se pierde
});

test("EL MENSAJE DE LLENO DICE QUE NO SE BORRA NADA VIEJO", () => {
  // Es la parte que evita que alguien "resuelva" el problema borrando. Si el
  // mensaje solo dijera «no hay espacio», la salida obvia sería hacer lugar.
  assert.match(MOTIVO_ALMACEN.SIN_ESPACIO, /no se guardó/i);
  assert.match(MOTIVO_ALMACEN.SIN_ESPACIO, /No se borra nada viejo/i);
  assert.match(MOTIVO_ALMACEN.SIN_ESPACIO, /siete días/i);
});

test("la cuota de disco cuenta como lleno, no como error raro", () => {
  const e = Object.assign(new Error("disk quota exceeded"), { code: "EDQUOT" });
  assert.equal(traducirErrorDeEscritura(e).motivo, MOTIVO_ALMACEN.SIN_ESPACIO);
});

test("un error que no es de espacio vuelve TAL CUAL", () => {
  // Inventarle un mensaje amable a un error desconocido es cómo se pierden las
  // causas raíz.
  const e = Object.assign(new Error("algo raro"), { code: "EIO" });
  assert.equal(traducirErrorDeEscritura(e), e);
  const pelado = new Error("sin code");
  assert.equal(traducirErrorDeEscritura(pelado), pelado);
});

// ── La medición para el aviso ──────────────────────────────────────────────

test("se mide lo ocupado, sin contar el centinela", async () => {
  const { vol, limpiar } = await directorioTemporal({ conCentinela: true });
  const previo = process.env[VARIABLE_RUTA];
  try {
    process.env[VARIABLE_RUTA] = vol;
    await writeFile(join(vol, "a.jpg"), "x".repeat(1000));
    await writeFile(join(vol, "b.jpg"), "x".repeat(500));
    const m = await medirOcupacion();
    assert.equal(m.archivos, 2); // el centinela no es una foto
    assert.equal(m.bytes, 1500);
  } finally {
    if (previo === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = previo;
    await limpiar();
  }
});

test("SIN VOLUMEN, LO OCUPADO ES null Y NO CERO", async () => {
  // Un 0 se leería como «no ocupa nada», que es una afirmación distinta de «no
  // se pudo medir» — y la primera tranquiliza cuando habría que preocuparse.
  const previo = process.env[VARIABLE_RUTA];
  try {
    delete process.env[VARIABLE_RUTA];
    const m = await medirOcupacion();
    assert.equal(m.bytes, null);
    assert.equal(m.motivo, MOTIVO_ALMACEN.SIN_RUTA);
  } finally {
    if (previo !== undefined) process.env[VARIABLE_RUTA] = previo;
  }
});

// ── El arranque ────────────────────────────────────────────────────────────

test("EL ARRANQUE AVISA PERO NO TUMBA LA APLICACIÓN", async () => {
  // Deliberado: si el proceso se negara a arrancar, un volumen de fotos sin
  // montar dejaría sin POS a los cinco locales. No vender es mucho peor que no
  // poder subir una foto.
  const previo = process.env[VARIABLE_RUTA];
  const erroresOriginales = console.error;
  const dichos = [];
  try {
    delete process.env[VARIABLE_RUTA];
    console.error = (m) => dichos.push(String(m));
    const r = await verificarAlArrancar(); // no tira
    assert.equal(r.ok, false);
    assert.equal(dichos.length, 1);
  } finally {
    console.error = erroresOriginales;
    if (previo !== undefined) process.env[VARIABLE_RUTA] = previo;
  }
});

test("el aviso del arranque nombra la variable y el runbook", async () => {
  // Para que el que lee el log sepa qué tocar sin tener que preguntar.
  const previo = process.env[VARIABLE_RUTA];
  const erroresOriginales = console.error;
  const dichos = [];
  try {
    delete process.env[VARIABLE_RUTA];
    console.error = (m) => dichos.push(String(m));
    await verificarAlArrancar();
  } finally {
    console.error = erroresOriginales;
    if (previo !== undefined) process.env[VARIABLE_RUTA] = previo;
  }
  assert.match(dichos[0], new RegExp(VARIABLE_RUTA));
  assert.match(dichos[0], /RUNBOOK-VOLUMEN-COMPROBANTES/);
  assert.match(dichos[0], /sigue funcionando/);
});
