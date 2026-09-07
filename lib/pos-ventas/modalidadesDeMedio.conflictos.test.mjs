// LAS TRES RESTRICCIONES QUE HOY IMPIDEN LAS MODALIDADES POR MEDIO.
//
// ── QUÉ AFIRMA ESTE ARCHIVO, Y QUÉ NO ─────────────────────────────────────
//
// El diseño aprobado (Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 19:2) reemplaza los
// tres botones de Mercado Pago por UNO con modalidades:
//
//     Mercado Pago
//     ├── Débito
//     ├── Crédito
//     └── QR / saldo
//
// Acá se afirma únicamente CUÁL es la restricción que lo impide, leyendo
// `schema.prisma`. El comportamiento —insertar y que Postgres rechace— vive en
// `scripts/pruebas-db/mediosCobro.mjs`, que corre DESPUÉS de `migrate deploy`.
//
// ── POR QUÉ ESA SEPARACIÓN, Y NO ES UNA PREFERENCIA ───────────────────────
//
// El orden del workflow de verificación es deliberado:
//
//     prisma generate → prisma validate → Suite de candados → migrate deploy
//
// La suite corre ANTES de aplicar las migraciones. Hay un Postgres levantado,
// pero SIN ESQUEMA. Una prueba de base metida acá no mide el conflicto: falla
// con "The table public.Local does not exist", que es un rojo de infraestructura
// y no distingue nada.
//
// Se probó y pasó exactamente eso. Por eso este archivo es PURO y determinista:
// no abre conexión, no hace `SELECT 1`, y no pregunta si existe una tabla —una
// guarda así seguiría dando la respuesta equivocada, solo que en silencio.
//
// ── Y SON CANDADOS CON FECHA DE VENCIMIENTO, A PROPÓSITO ──────────────────
//
// Los tres se van a poner ROJOS el día que el esquema cambie para soportar
// modalidades. Eso no es un defecto: es el aviso de que el conflicto que
// describen dejó de existir y que hay que reescribirlos contra el contrato
// nuevo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
const modelo = (nombre) => {
  const m = schema.match(new RegExp(`model ${nombre} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, `no se encontró el modelo ${nombre} en schema.prisma`);
  return m[0];
};

test("A · el recargo se identifica por (local, tipo contable), no por medio", () => {
  // `RecargoPagoLocal` es la fuente del recargo, y su clave es el ENUM. Dos
  // modalidades del mismo medio padre colapsan en una sola fila: la segunda pisa
  // a la primera. Es lo que impide Débito 2 % y Crédito 6 % a la vez.
  const m = modelo("RecargoPagoLocal");
  assert.match(m, /@@unique\(\[localId, medio\]\)/, "cambió la clave del recargo");
  assert.match(m, /\bmedio\s+MedioPago\b/, "el recargo dejó de indexarse por el enum contable");
  assert.doesNotMatch(
    m,
    /modalidad/i,
    "el recargo ya conoce una modalidad: el conflicto A dejó de existir y este candado hay que reescribirlo"
  );
});

test("B · un tender se identifica por (venta, tipo contable), sin modalidad", () => {
  // Con las modalidades bajo el mismo medio padre, una venta pagada en parte con
  // Débito y en parte con Crédito son dos tenders del MISMO enum, y esta
  // restricción rechaza el segundo.
  const m = modelo("VentaPago");
  assert.match(m, /@@unique\(\[ventaId, medio\]\)/, "cambió la clave del tender");
  assert.match(m, /\bmedio\s+MedioPago\b/);
  assert.doesNotMatch(
    m,
    /modalidad/i,
    "VentaPago ya conoce una modalidad: el conflicto B dejó de existir"
  );
});

test("C · el snapshot de la venta congela el tipo contable y nada más", () => {
  // `recargoPagoMedio` puede decir MERCADOPAGO, pero no "Mercado Pago / Crédito".
  // Una auditoría futura no puede reconstruir qué modalidad impuso la condición.
  const m = modelo("Venta");
  assert.match(m, /recargoPagoMedio\s+MedioPago\?/, "cambió el snapshot del medio que impuso el recargo");
  assert.match(m, /recargoPagoPct\s+Decimal\?/, "el porcentaje congelado ya no está donde se afirma");
  assert.doesNotMatch(
    m,
    /recargoPagoModalidad/,
    "Venta ya congela la modalidad: el conflicto C dejó de existir"
  );
});

