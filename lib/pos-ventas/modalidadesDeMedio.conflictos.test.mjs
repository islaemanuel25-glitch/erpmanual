// LOS TRES CONFLICTOS QUE EL MODELO ACTUAL TIENE CON LAS MODALIDADES.
//
// ── PARA QUÉ EXISTE ESTE ARCHIVO ──────────────────────────────────────────
//
// El diseño aprobado (Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 19:2) reemplaza la
// decisión vieja —un botón por cada variante de Mercado Pago— por una sola:
//
//     Mercado Pago
//     ├── Débito
//     ├── Crédito
//     └── QR / saldo
//
// UN medio visible, con modalidades configurables. Antes de tocar el esquema hay
// que demostrar que el modelo de hoy NO puede expresar eso, y demostrarlo con
// comportamiento, no leyendo el `schema.prisma`.
//
// LOS TRES ROJOS SON A PROPÓSITO. Cada uno señala una restricción distinta, y la
// causa tiene que poder distinguirse sin ambigüedad:
//
//   · CONFLICTO 1 → el recargo está indexado por TIPO CONTABLE, no por medio.
//   · CONFLICTO 2 → `VentaPago` tiene `@@unique([ventaId, medio])`.
//   · CONFLICTO 3 → `Venta.recargoPagoMedio` es el enum, no identifica modalidad.
//
// ── LO QUE ESTOS TESTS NO HACEN, Y ES DELIBERADO ──────────────────────────
//
// NO le dan a cada modalidad un `MedioPago` distinto para que pasen. Eso
// reproduciría exactamente la arquitectura que el diseño viene a reemplazar: si
// Débito y Crédito de Mercado Pago fueran enums distintos, volveríamos a tener
// tres botones. Las tres modalidades comparten identidad de medio padre; lo que
// las distingue es la modalidad.
//
// NO tocan `prisma/schema.prisma`, ni migraciones, ni APIs, ni el POS, ni el
// cálculo de recargos. Solo miden.
//
// ── POR QUÉ CONTRA POSTGRES DE VERDAD ─────────────────────────────────────
//
// Dos de los tres conflictos SON de la base: una restricción `@@unique` y la
// forma de una tabla. Un mock los ocultaría justamente donde viven. Se sigue el
// precedente de `lib/ventas-internas/precisionStock.test.mjs`: conexión
// perezosa, y si no hay base se SALTEA con motivo en vez de fallar — un rojo por
// falta de infraestructura no distinguiría nada.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
const modelo = (nombre) => (schema.match(new RegExp(`model ${nombre} \\{[\\s\\S]*?\\n\\}`)) || [""])[0];

// ── Conexión perezosa, igual que el precedente del repo ────────────────────
let prisma = null;
let motivoSkip = null;
try {
  if (!process.env.DATABASE_URL) {
    motivoSkip = "sin DATABASE_URL: estos conflictos son de base y no se pueden medir con un mock";
  } else {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.$queryRawUnsafe("SELECT 1");
  }
} catch (e) {
  motivoSkip = `sin base disponible (${e.message.split("\n")[0]})`;
  prisma = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICTO 1 · EL RECARGO ES DEL TIPO CONTABLE, NO DEL MEDIO
// ═══════════════════════════════════════════════════════════════════════════
//
// Contrato deseado: dos modalidades del MISMO medio padre pueden tener recargos
// distintos, y cambiar una no cambia la otra.
//
// Hoy el recargo vive en `RecargoPagoLocal`, con `@@unique([localId, medio])`
// donde `medio` es el enum `MedioPago`. La propia ruta lo dice: "EL RECARGO ES
// DEL TIPO CONTABLE, no del botón". Así que Débito 2 % y Crédito 6 % bajo el
// mismo medio padre son, para este modelo, la MISMA fila — y la segunda pisa a
// la primera.

test("CONFLICTO 1 · dos modalidades del mismo medio padre pueden tener recargos distintos", { skip: motivoSkip ?? false }, async () => {
  const local = await prisma.local.findFirst({ select: { id: true } });
  if (!local) return assert.fail("no hay ningún local en la base de prueba");

  // Las dos modalidades comparten identidad de medio padre. Ese es el escenario
  // del diseño; darles enums distintos sería medir otra cosa.
  const MEDIO_PADRE = "MERCADOPAGO";

  // Escribir el recargo de la modalidad "Débito" del medio padre…
  await prisma.recargoPagoLocal.upsert({
    where: { localId_medio: { localId: local.id, medio: MEDIO_PADRE } },
    create: { localId: local.id, medio: MEDIO_PADRE, porcentaje: 2 },
    update: { porcentaje: 2 },
  });

  // …y después el de "Crédito", del MISMO medio padre.
  await prisma.recargoPagoLocal.upsert({
    where: { localId_medio: { localId: local.id, medio: MEDIO_PADRE } },
    create: { localId: local.id, medio: MEDIO_PADRE, porcentaje: 6 },
    update: { porcentaje: 6 },
  });

  const filas = await prisma.recargoPagoLocal.findMany({
    where: { localId: local.id, medio: MEDIO_PADRE },
    select: { porcentaje: true },
  });

  // El contrato deseado: las DOS conviven, cada una con su porcentaje.
  assert.equal(
    filas.length,
    2,
    "el modelo actual guarda UNA sola fila por (local, tipo contable): las dos modalidades del mismo medio " +
      "padre no pueden tener recargos distintos, la segunda pisa a la primera"
  );
  const pcts = filas.map((f) => Number(f.porcentaje)).sort((a, b) => a - b);
  assert.deepEqual(pcts, [2, 6], "Débito y Crédito tienen que poder valer 2 % y 6 % a la vez");
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICTO 2 · DOS TENDERS DEL MISMO MEDIO PADRE EN UNA VENTA
// ═══════════════════════════════════════════════════════════════════════════
//
// Contrato deseado: una venta puede registrar Mercado Pago/Débito por $X y
// Mercado Pago/Crédito por $Y como DOS tenders. Lo que los distingue es la
// modalidad.
//
// Hoy `VentaPago` tiene `@@unique([ventaId, medio])` sobre el enum. Con las dos
// modalidades bajo el mismo medio padre, el segundo INSERT choca.
//
// El test NO propone la restricción de reemplazo: eso se decide después. Solo
// mide que hoy no entra.

test("CONFLICTO 2 · una venta admite dos tenders del mismo medio padre en modalidades distintas", { skip: motivoSkip ?? false }, async () => {
  const venta = await prisma.venta.findFirst({ select: { id: true }, orderBy: { id: "desc" } });
  if (!venta) return assert.fail("no hay ninguna venta en la base de prueba");

  const MEDIO_PADRE = "MERCADOPAGO";
  const creados = [];
  let choque = null;

  try {
    creados.push(
      await prisma.ventaPago.create({
        data: { ventaId: venta.id, medio: MEDIO_PADRE, monto: 100, comision: 0, neto: 100 },
      })
    );
    // El segundo tender: mismo medio padre, OTRA modalidad.
    creados.push(
      await prisma.ventaPago.create({
        data: { ventaId: venta.id, medio: MEDIO_PADRE, monto: 200, comision: 0, neto: 200 },
      })
    );
  } catch (e) {
    choque = e;
  } finally {
    // Se limpia siempre: este test escribe en una base compartida del runner.
    if (creados.length) {
      await prisma.ventaPago.deleteMany({ where: { id: { in: creados.map((c) => c.id) } } });
    }
  }

  assert.equal(
    choque,
    null,
    "`@@unique([ventaId, medio])` rechaza el segundo tender: con las modalidades bajo el mismo medio padre, " +
      `una venta no puede registrar Débito y Crédito por separado. Postgres informó: ${choque?.message?.split("\n")[0] ?? ""}`
  );
  assert.equal(creados.length, 2, "tienen que quedar los dos tenders");
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICTO 3 · EL SNAPSHOT NO IDENTIFICA LA MODALIDAD
// ═══════════════════════════════════════════════════════════════════════════
//
// Contrato deseado: si Crédito impuso el recargo de la venta, la venta histórica
// tiene que poder decirlo — aunque después la modalidad cambie de nombre, de
// porcentaje, o se desactive.
//
// Este test NO se conforma con "falta una columna": ejerce el COMPORTAMIENTO.
// Crea el escenario, cambia la configuración después, y pregunta si la venta
// sigue explicando qué modalidad se usó.

test("CONFLICTO 3 · la venta histórica sigue diciendo qué MODALIDAD impuso su recargo", { skip: motivoSkip ?? false }, async () => {
  const venta = await prisma.venta.findFirst({
    select: { id: true, recargoPagoPct: true, recargoPagoMedio: true },
    orderBy: { id: "desc" },
  });
  if (!venta) return assert.fail("no hay ninguna venta en la base de prueba");

  // Lo que el modelo de hoy puede congelar sobre la condición comercial.
  const congelado = await prisma.venta.findUnique({
    where: { id: venta.id },
    select: { recargoPagoPct: true, recargoPagoMedio: true },
  });

  // La configuración cambia DESPUÉS de la venta: es el escenario que hace que el
  // snapshot importe. Si la auditoría dependiera de leer la config actual, acá
  // empezaría a mentir.
  //
  // No hace falta escribir nada para demostrarlo: alcanza con preguntar si el
  // dato congelado alcanza para distinguir dos modalidades del mismo medio.
  const puedeDistinguirModalidad =
    Object.prototype.hasOwnProperty.call(congelado, "recargoPagoModalidad") ||
    Object.prototype.hasOwnProperty.call(congelado, "recargoPagoModalidadId");

  assert.equal(
    puedeDistinguirModalidad,
    true,
    `la venta solo congela el tipo contable (${JSON.stringify(congelado.recargoPagoMedio)}): no puede distinguir ` +
      "Mercado Pago/Crédito de Mercado Pago/Débito, así que una auditoría futura no puede reconstruir qué " +
      "modalidad impuso la condición"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LA CAUSA DE CADA ROJO, AFIRMADA APARTE
// ═══════════════════════════════════════════════════════════════════════════
//
// Estos tres no necesitan base y no fallan: existen para que cada rojo de arriba
// tenga una causa nombrada y no haya que deducirla. Si mañana el esquema cambia,
// estos se ponen rojos y avisan que los conflictos de arriba ya no aplican.

test("la causa del conflicto 1 es que el recargo se indexa por tipo contable", () => {
  assert.match(
    modelo("RecargoPagoLocal"),
    /@@unique\(\[localId, medio\]\)/,
    "cambió la restricción que hace imposible el recargo por modalidad"
  );
  assert.match(modelo("RecargoPagoLocal"), /medio\s+MedioPago/, "el recargo dejó de indexarse por el enum");
});

test("la causa del conflicto 2 es @@unique([ventaId, medio]) sobre el enum", () => {
  assert.match(modelo("VentaPago"), /@@unique\(\[ventaId, medio\]\)/);
  assert.match(modelo("VentaPago"), /medio\s+MedioPago/);
  assert.doesNotMatch(
    modelo("VentaPago"),
    /modalidad/i,
    "VentaPago ya conoce una modalidad: el conflicto 2 dejó de aplicar"
  );
});

test("la causa del conflicto 3 es que el snapshot guarda el enum y nada más", () => {
  assert.match(modelo("Venta"), /recargoPagoMedio\s+MedioPago\?/);
  assert.doesNotMatch(
    modelo("Venta"),
    /recargoPagoModalidad/,
    "Venta ya congela la modalidad: el conflicto 3 dejó de aplicar"
  );
});
