// CANDADOS DEL VOCABULARIO COMPARTIDO DE DIFERENCIAS DE MERCADERÍA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/motivosDeDiferencia.test.mjs
//
// Tres cosas:
//
//   1. los VALORES son los que ya están guardados en la base, y no cambian;
//   2. qué dirección admite cada motivo;
//   3. transferencias y compras lo toman de acá, y nadie vuelve a escribir su
//      copia. Que el ajuste de Stock Locales también lo use lo afirma
//      `components/stock_locales/modalAjusteCausa.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import {
  DIRECCION_DIFERENCIA,
  ETIQUETA_MOTIVO,
  MOTIVO_DIFERENCIA,
  direccionDeDiferencia,
  esMotivoDeDiferencia,
  motivoExigeDetalle,
  motivoPermitidoPara,
  motivosParaDireccion,
  opcionesParaDireccion,
} from "./motivosDeDiferencia.js";
import { MOTIVOS_FALTANTE, MOTIVOS_SOBRANTE, ETIQUETA_CHIP_MOVIL } from "../transferencias/recepcionUI.js";
import { MOTIVOS as MOTIVOS_COMPRAS } from "../../components/compras-proveedor/HojaCorregirLinea.jsx";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const { DISMINUCION, AUMENTO } = DIRECCION_DIFERENCIA;

// ── 1 · LOS VALORES GUARDADOS ──────────────────────────────────────────────

test("los valores son exactamente los que ya están en la base, en castellano", () => {
  // Son los de TransferenciaDetalle.motivoPrincipal y PedidoProveedorDetalle.
  // motivoPrincipal desde antes de este archivo. Renombrar uno deja las filas
  // viejas con un valor que ya nadie ofrece.
  assert.deepEqual(Object.values(MOTIVO_DIFERENCIA), ["Faltante", "Producto dañado", "Sobrante", "Otro"]);
  for (const v of Object.values(MOTIVO_DIFERENCIA)) assert.equal(esMotivoDeDiferencia(v), true);
  for (const inventado of ["Roto", "Dañado", "MERMA", "Corrección", "", null, undefined]) {
    assert.equal(esMotivoDeDiferencia(inventado), false, `${JSON.stringify(inventado)} no es un valor`);
  }
});

test("'Roto' y 'Dañado' son TEXTOS de pantalla del mismo valor, no valores", () => {
  assert.equal(ETIQUETA_CHIP_MOVIL[MOTIVO_DIFERENCIA.PRODUCTO_DANADO], "Roto");
  const danadoEnCompras = MOTIVOS_COMPRAS.find((m) => m.texto === "Dañado");
  assert.equal(danadoEnCompras.valor, MOTIVO_DIFERENCIA.PRODUCTO_DANADO);
});

// ── 2 · LA DIRECCIÓN ───────────────────────────────────────────────────────

test("una disminución ofrece Faltante, Producto dañado y Otro; un aumento, Sobrante y Otro", () => {
  assert.deepEqual(motivosParaDireccion(DISMINUCION), ["Faltante", "Producto dañado", "Otro"]);
  assert.deepEqual(motivosParaDireccion(AUMENTO), ["Sobrante", "Otro"]);
  assert.deepEqual(motivosParaDireccion(null), []);
  assert.deepEqual(motivosParaDireccion("CUALQUIERA"), []);
});

test("Producto dañado solo explica una disminución y Sobrante solo un aumento", () => {
  assert.equal(motivoPermitidoPara(DISMINUCION, MOTIVO_DIFERENCIA.PRODUCTO_DANADO), true);
  assert.equal(motivoPermitidoPara(AUMENTO, MOTIVO_DIFERENCIA.PRODUCTO_DANADO), false);
  assert.equal(motivoPermitidoPara(AUMENTO, MOTIVO_DIFERENCIA.SOBRANTE), true);
  assert.equal(motivoPermitidoPara(DISMINUCION, MOTIVO_DIFERENCIA.SOBRANTE), false);
  assert.equal(motivoPermitidoPara(DISMINUCION, MOTIVO_DIFERENCIA.FALTANTE), true);
  assert.equal(motivoPermitidoPara(AUMENTO, MOTIVO_DIFERENCIA.FALTANTE), false);
  for (const d of [DISMINUCION, AUMENTO]) assert.equal(motivoPermitidoPara(d, MOTIVO_DIFERENCIA.OTRO), true);
  assert.equal(motivoPermitidoPara(null, MOTIVO_DIFERENCIA.OTRO), false, "sin diferencia no hay motivo que explique");
});

test("la dirección sale de comparar lo esperado con lo real", () => {
  assert.equal(direccionDeDiferencia(10, 7), DISMINUCION);
  assert.equal(direccionDeDiferencia(7, 10), AUMENTO);
  assert.equal(direccionDeDiferencia(10, 10), null);
  assert.equal(direccionDeDiferencia("10.500", "10.5"), null, "la misma cantidad escrita distinto no es diferencia");
  assert.equal(direccionDeDiferencia(null, 3), null);
  assert.equal(direccionDeDiferencia(3, Number.NaN), null);
});

test("solo Otro exige detalle", () => {
  assert.equal(motivoExigeDetalle(MOTIVO_DIFERENCIA.OTRO), true);
  for (const v of [MOTIVO_DIFERENCIA.FALTANTE, MOTIVO_DIFERENCIA.PRODUCTO_DANADO, MOTIVO_DIFERENCIA.SOBRANTE, null, ""]) {
    assert.equal(motivoExigeDetalle(v), false);
  }
});

// ── 3 · LOS TRES MÓDULOS TOMAN EL MISMO ────────────────────────────────────

test("transferencias ofrece lo mismo que ofrecía, con sus textos", () => {
  // La lista exacta de antes de compartirse, escrita acá a mano A PROPÓSITO:
  // es el comportamiento que no se tenía que mover.
  assert.deepEqual(MOTIVOS_FALTANTE, [
    { value: "Faltante", label: "Faltante" },
    { value: "Producto dañado", label: "Producto dañado" },
    { value: "Otro", label: "Otro (especificar)" },
  ]);
  assert.deepEqual(MOTIVOS_SOBRANTE, [
    { value: "Sobrante", label: "Sobrante" },
    { value: "Otro", label: "Otro (especificar)" },
  ]);
  assert.deepEqual(MOTIVOS_FALTANTE, opcionesParaDireccion(DISMINUCION));
  assert.deepEqual(MOTIVOS_SOBRANTE, opcionesParaDireccion(AUMENTO));
});

test("compras ofrece lo mismo que ofrecía: los de una disminución, siempre, con textos cortos", () => {
  assert.deepEqual(MOTIVOS_COMPRAS, [
    { valor: "Faltante", texto: "Faltante" },
    { valor: "Producto dañado", texto: "Dañado" },
    { valor: "Otro", texto: "Otro" },
  ]);
  assert.deepEqual(
    MOTIVOS_COMPRAS.map((m) => m.valor),
    motivosParaDireccion(DISMINUCION),
    "compras dejó de tomar los valores del vocabulario compartido"
  );
});

test("ningún otro archivo escribe los valores a mano: la copia es lo que este archivo reemplazó", () => {
  // Enumerado con `git ls-files --cached --others --exclude-standard`, que ve
  // también lo que todavía no se commiteó. Se busca el único valor que no
  // tiene otro uso en el repo: "Faltante", "Sobrante" y "Otro" sí lo tienen
  // —estados de línea, el arqueo de caja, los chips de período— y buscarlos
  // daría falsos rojos. Los tres módulos que los usan como motivo están
  // afirmados uno por uno arriba.
  const archivos = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "lib", "components"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
  const copias = archivos.filter(
    (f) => f !== "lib/stock/motivosDeDiferencia.js" && /["'`]Producto dañado["'`]/.test(sinComentarios(readFileSync(f, "utf8")))
  );
  assert.deepEqual(copias, []);
});
