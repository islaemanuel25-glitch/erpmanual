// CENSO: TODA RUTA DEL POS QUE TOCA UN TURNO DICE CÓMO DECIDE DE QUIÉN ES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/censoCajaPropia.test.mjs
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// La caja es del operador (DEC-0012). La regla vive en un solo lugar
// —`whereCajaPropia` / `esCajaPropia` / `puedeActuarSobreCaja` en
// lib/caja/cierreRelevo.js, armada por lib/caja/identidadCajaServer.js— y el
// riesgo no es que esa función esté mal: es que una ruta NO la use y autorice
// solo por local, solo por cuenta o solo por "turno abierto". Así entró el
// agujero offline de la PR #126: una rama de `crear` aceptaba "cualquier turno
// de la cuenta", compilaba, y sus candados estaban en verde.
//
// ── QUÉ CUBRE ──────────────────────────────────────────────────────────────
//
// El universo son las rutas de `app/api/pos-ventas/**/route.js` que nombran un
// turno —`turnoId`, o una lectura de `Turno` (`prisma.turno.`, `tx.turno.`)—,
// enumeradas con `git ls-files --cached --others --exclude-standard` para que
// una ruta recién escrita y sin commitear también entre (CLAUDE.md, regla 10).
// Cada una tiene que estar en la tabla de abajo, en una de tres clases:
//
//   IDENTIDAD  decide con la identidad canónica: su fuente, SIN comentarios,
//              contiene al menos una de las marcas de `MARCAS_IDENTIDAD`.
//   TOKEN      flujo posterior de un corte o retiro: la autoridad se fijó al
//              iniciarlo y el token la transporta. Contiene la carga por token.
//   EXENTA     no decide propiedad de caja; el motivo va escrito al lado.
//
// Y ninguna, cualquiera sea su clase, puede decidir "propio" por la cuenta:
// las formas de `PROPIO_POR_CUENTA` son las que se usaban antes.
//
// ── QUÉ NO CUBRE ───────────────────────────────────────────────────────────
//
// No es un analizador: que una ruta contenga la marca no prueba que la use en
// el WHERE correcto. Eso lo prueba el comportamiento, en
// scripts/pruebas-db/cajaPorOperador.mjs. Este censo atrapa lo que se olvida
// —una ruta nueva sin clasificar, una que perdió la marca, una que volvió a
// comparar la cuenta—, que es lo que nadie mira.
//
// Fuera del universo, a propósito: las rutas de Finanzas (eligen un cajón por
// decisión del dueño, DEC-0012) y de Auditoría POS (lectura con
// `reportes.ver`). No operan la caja como cajero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const UNIVERSO = "app/api/pos-ventas";
const TOCA_TURNO = /turnoId|prisma\.turno\.|tx\.turno\./;

const MARCAS_IDENTIDAD = [
  "whereCajaPropia(",
  "esCajaPropia(",
  "puedeActuarSobreCaja(",
  "whereCajaAccesible(",
  "puedeVerCaja(",
  "identidadParaOperar(",
  "identidadParaMirar(",
  // contextoArqueo arma la identidad adentro (lib/caja/arqueoServer.js).
  "contextoArqueo(",
];
const MARCAS_TOKEN = ["cargarCierrePorToken(", "cargarRetiroPorToken("];

// Las formas con las que se decidía "propio" por la cuenta. Volver a escribir
// cualquiera en una ruta del POS es volver a juntar las cajas.
const PROPIO_POR_CUENTA = [
  /vendedorId\s*[!=]==\s*session\.id/,
  /session\.id\s*[!=]==\s*\w+\.vendedorId/,
  /OR:\s*\[\s*\{\s*vendedorId/,
  /vendedorId:\s*session\.id\s*,\s*\.\.\.WHERE_TURNO_OPERATIVO/,
];

const CLASES = {
  "app/api/pos-ventas/arqueos/estado/route.js": "IDENTIDAD",
  "app/api/pos-ventas/arqueos/listar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/arqueos/postergar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/arqueos/registrar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/caja-movimientos/crear/route.js": "IDENTIDAD",
  "app/api/pos-ventas/caja-movimientos/listar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/cierres/iniciar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/cierres/pendientes/route.js": "IDENTIDAD",
  "app/api/pos-ventas/crear/route.js": "IDENTIDAD",
  "app/api/pos-ventas/historial-dia/route.js": "IDENTIDAD",
  "app/api/pos-ventas/retiros/iniciar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/abrir-con-cambio/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/abrir/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/actual/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/[id]/turno-operativo/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/cerrar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/listar/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/resumen/route.js": "IDENTIDAD",
  "app/api/pos-ventas/turnos/ventas/route.js": "IDENTIDAD",

  "app/api/pos-ventas/cierres/[token]/route.js": "TOKEN",
  "app/api/pos-ventas/cierres/[token]/confirmar/route.js": "TOKEN",
  "app/api/pos-ventas/cierres/[token]/cancelar/route.js": "TOKEN",
  "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js": "TOKEN",
  "app/api/pos-ventas/retiros/[token]/route.js": "TOKEN",
  "app/api/pos-ventas/retiros/[token]/confirmar/route.js": "TOKEN",
  "app/api/pos-ventas/retiros/[token]/cancelar/route.js": "TOKEN",
};

const EXENTAS = {
  "app/api/pos-ventas/corregir-simple/[id]/route.js":
    "corrige una venta existente con `ventas.corregir_simple`; no la mueve de caja, solo mira si su turno ORIGINAL sigue abierto",
  "app/api/pos-ventas/venta/[id]/corregir/route.js":
    "corrección completa con `ventas.corregir_completa`, sobre el turno ORIGINAL de la venta; no opera otra caja",
  "app/api/pos-ventas/venta/[id]/editar/route.js":
    "lectura previa a la corrección completa, con `ventas.corregir_completa`, sobre el turno original de la venta",
  "app/api/pos-ventas/venta/[id]/revisar/route.js":
    "revisión de la corrección completa, con `ventas.corregir_completa`, sobre el turno original de la venta",
  "app/api/pos-ventas/venta/[id]/anular/route.js":
    "anula una venta común con `ventas.corregir_completa`, solo con su turno ORIGINAL abierto y sobre ese turno; no opera otra caja",
};

const sinComentarios = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function universo() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", `${UNIVERSO}/**/route.js`],
    { encoding: "utf8" }
  );
  return salida
    .split("\n")
    .filter(Boolean)
    .filter((ruta) => TOCA_TURNO.test(readFileSync(ruta, "utf8")))
    .sort();
}

test("la enumeración encuentra rutas de verdad", () => {
  // Contra la enumeración vacía: con cero rutas, todo lo de abajo daría verde.
  const rutas = universo();
  assert.ok(rutas.length >= 25, `la enumeración devolvió ${rutas.length} rutas`);
  assert.ok(rutas.includes("app/api/pos-ventas/crear/route.js"));
});

test("toda ruta del POS que toca un turno está clasificada", () => {
  const sinClase = universo().filter((r) => !(r in CLASES) && !(r in EXENTAS));
  assert.deepEqual(sinClase, [],
    "rutas nuevas que tocan un turno sin decir cómo deciden de quién es la caja. " +
    "Usar la identidad canónica (lib/caja/identidadCajaServer.js) y anotarlas en CLASES, " +
    "o anotarlas en EXENTAS con el motivo.");
});

test("la tabla no nombra rutas que ya no existen o que ya no tocan un turno", () => {
  const rutas = new Set(universo());
  const sobran = [...Object.keys(CLASES), ...Object.keys(EXENTAS)].filter((r) => !rutas.has(r));
  assert.deepEqual(sobran, []);
});

test("cada ruta IDENTIDAD decide con la identidad canónica", () => {
  for (const [ruta, clase] of Object.entries(CLASES)) {
    if (clase !== "IDENTIDAD") continue;
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    assert.ok(MARCAS_IDENTIDAD.some((m) => fuente.includes(m)), `${ruta} perdió la identidad canónica`);
  }
});

test("cada ruta TOKEN carga su corte o su retiro por token", () => {
  for (const [ruta, clase] of Object.entries(CLASES)) {
    if (clase !== "TOKEN") continue;
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    assert.ok(MARCAS_TOKEN.some((m) => fuente.includes(m)), `${ruta} no carga por token`);
  }
});

test("cada exención trae su motivo", () => {
  for (const [ruta, motivo] of Object.entries(EXENTAS)) {
    assert.ok(typeof motivo === "string" && motivo.length > 30, `${ruta} sin motivo`);
  }
});

test("ninguna ruta del POS decide 'propio' por la cuenta", () => {
  for (const ruta of universo()) {
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    for (const forma of PROPIO_POR_CUENTA) {
      assert.doesNotMatch(fuente, forma, `${ruta} decide la caja por la cuenta (${forma})`);
    }
  }
});

test("CONTRAPRUEBA: las formas prohibidas atrapan lo que se usaba antes", () => {
  // La rama offline que abrió el agujero, y la comparación del cierre clásico.
  const antes = [
    "...(origenOffline === true ? { OR: [{ vendedorId: session.id }, cajaDeQuienVende] } : cajaDeQuienVende),",
    "if (!turno || turno.vendedorId !== session.id) {",
    "where: { localId, vendedorId: session.id, ...WHERE_TURNO_OPERATIVO },",
  ];
  for (const linea of antes) {
    assert.ok(PROPIO_POR_CUENTA.some((f) => f.test(linea)), `no atrapa: ${linea}`);
  }
  // Y lo que se escribe hoy en una creación —la cuenta como auditoría— no es "propio".
  assert.ok(!PROPIO_POR_CUENTA.some((f) => f.test("        vendedorId: session.id,\n        operadorId: identidad.operadorId,")));
});
