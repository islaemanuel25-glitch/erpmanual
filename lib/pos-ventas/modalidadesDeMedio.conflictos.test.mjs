// EL CONTRATO ESTRUCTURAL DE LAS MODALIDADES POR MEDIO.
//
// ── DE DÓNDE VIENE ESTE ARCHIVO ───────────────────────────────────────────
//
// Antes afirmaba las TRES RESTRICCIONES que impedían las modalidades. Eran
// candados con fecha de vencimiento a propósito, y venció: el esquema ya las
// resuelve. Ahora afirman el contrato NUEVO.
//
// Se conserva la historia porque explica por qué el modelo es así y no de la
// forma obvia:
//
//   A · el recargo se indexaba por `(localId, MedioPago)`, así que Débito 2 % y
//       Crédito 6 % del mismo padre colapsaban en una fila. Medido contra
//       Postgres: el segundo insert lo rechazaba la base.
//   B · el tender se identificaba por `(ventaId, medio)`, así que una venta no
//       podía registrar MP/Débito y MP/Crédito. Medido igual.
//   C · la venta congelaba solo el tipo contable, así que "Mercado Pago·Crédito"
//       y "Banco X·Crédito" eran indistinguibles para siempre.
//
// ── ESTE ARCHIVO NO TOCA LA BASE, Y NO ES PREFERENCIA ─────────────────────
//
// El workflow corre `Suite de candados` ANTES de `migrate deploy`: hay Postgres
// levantado pero sin esquema. Una prueba de base acá falla con "table does not
// exist", que es un rojo de infraestructura y no distingue nada. Se probó y pasó
// exactamente eso.
//
// El comportamiento —insertar, que Postgres acepte o rechace— vive en
// `scripts/pruebas-db/mediosCobro.mjs`, que corre después de migrar.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
const MIGRACION = join(RAIZ, "prisma", "migrations", "20260907230000_modalidades_por_medio", "migration.sql");
const sql = readFileSync(MIGRACION, "utf8");

/**
 * El modelo SIN sus comentarios.
 *
 * No es prolijidad: sin esto el candado encuentra en la prosa lo que viene a
 * prohibir. `VentaPago` EXPLICA por qué no lleva `@@unique([ventaId, medio])` ni
 * la compuesta con `modalidadId`, y las dos afirmaciones que las prohíben daban
 * rojo señalando su propia documentación.
 *
 * Es el defecto que este proyecto ya pagó varias veces. Se saca una vez acá y
 * vale para todas las afirmaciones del archivo.
 */
const modelo = (nombre) => {
  const m = schema.match(new RegExp(`model ${nombre} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, `no se encontró el modelo ${nombre} en schema.prisma`);
  return m[0]
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
};

/** Ídem para el SQL: `--` abre comentario en PostgreSQL. */
const sqlSinComentarios = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

test("A · la modalidad tiene su propio recargo, y es su fuente", () => {
  const m = modelo("MedioCobroModalidadLocal");
  assert.match(m, /recargoPct\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(5, 2\)/,
    "la modalidad perdió su recargo propio: volvería a depender de RecargoPagoLocal, que colapsa las dos");
  assert.match(m, /medioCobroLocalId\s+Int/, "la modalidad dejó de pertenecer a un medio");
  assert.match(m, /tipoContable\s+MedioPago/, "la modalidad perdió su clasificación contable");
});

test("A bis · la comisión de la modalidad es NULLABLE, y eso significa algo", () => {
  // `null` no es `0`. El sistema distingue "configurada en cero" de "sin
  // configurar", y de esa diferencia depende `Venta.comisionPendiente`, que marca
  // las ventas cuyo neto y ganancia tienen un cero estructural que NO es una
  // medición. Un `@default(0)` acá apagaría esa marca en silencio.
  const m = modelo("MedioCobroModalidadLocal");
  assert.match(m, /comisionPct\s+Decimal\?/, "la comisión de la modalidad dejó de ser nullable");
  assert.doesNotMatch(m, /comisionPct\s+Decimal\?\s+@default/,
    "se le puso un default a la comisión: 'sin configurar' pasaría a ser un número y se perdería la distinción");
});

test("A ter · el medio padre conserva su tipo contable para el caso legacy", () => {
  // Un medio SIN modalidades tiene que seguir comportándose igual que hoy. Si el
  // padre perdiera su `tipoContable`, todos los medios existentes quedarían sin
  // identidad contable.
  assert.match(modelo("MedioCobroLocal"), /tipoContable\s+MedioPago/,
    "el medio padre perdió su tipo contable: los medios sin modalidades quedan sin identidad");
  assert.match(modelo("MedioCobroLocal"), /modalidades\s+MedioCobroModalidadLocal\[\]/,
    "el medio padre dejó de conocer sus modalidades");
});

test("B · el tender identifica medio Y modalidad, y ya no lleva la unique vieja", () => {
  const m = modelo("VentaPago");
  assert.match(m, /medio\s+MedioPago/, "el tender dejó de congelar el tipo contable");
  assert.match(m, /modalidadId\s+Int\?/, "el tender no puede decir con qué modalidad se cobró");
  assert.match(m, /medioCobroLocalId\s+Int\?/, "el tender no puede decir con qué medio visible se cobró");
  assert.doesNotMatch(m, /@@unique\(\[ventaId, medio\]\)/,
    "volvió la unique que impedía dos modalidades del mismo medio padre en una venta");
});

test("B bis · los dos índices parciales están en la migración, con su predicado", () => {
  // Prisma no expresa índices parciales, así que van escritos a mano. Se afirma
  // el SQL porque es el único lugar donde existen.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX[^;]*"VentaPago_ventaId_medio_sin_modalidad_key"[\s\S]*?WHERE "modalidadId" IS NULL/,
    "falta el índice que replica el contrato LEGACY: dos tenders del mismo medio sin modalidad dejarían de chocar"
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX[^;]*"VentaPago_ventaId_modalidad_key"[\s\S]*?WHERE "modalidadId" IS NOT NULL/,
    "falta el índice que impide repetir la MISMA modalidad en una venta"
  );
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "VentaPago_ventaId_medio_key"/,
    "no se quitó la unique vieja: seguiría rechazando el segundo tender");
});

test("B ter · NO se usó la unique compuesta, que aflojaría el contrato legacy", () => {
  // `UNIQUE (ventaId, medio, modalidadId)` es la solución obvia y es un error:
  // en PostgreSQL dos NULL nunca son iguales dentro de un índice único, así que
  // dos tenders legacy —los dos con modalidadId en null— dejarían de chocar.
  assert.doesNotMatch(
    modelo("VentaPago"),
    /@@unique\(\[ventaId, medio, modalidadId\]\)/,
    "se usó la unique compuesta: con modalidadId NULL, Postgres deja pasar dos tenders legacy del mismo medio"
  );
  assert.doesNotMatch(
    sqlSinComentarios,
    /UNIQUE[^;]*\("ventaId",\s*"medio",\s*"modalidadId"\)/,
    "la migración crea la unique compuesta: aflojaría el contrato legacy"
  );
});

test("C · la venta congela la identidad de quien impuso el recargo", () => {
  const m = modelo("Venta");
  // El porcentaje ya estaba y NO se duplica.
  assert.match(m, /recargoPagoPct\s+Decimal\?/);
  assert.match(m, /recargoPagoMedio\s+MedioPago\?/);
  // Lo que se agrega es identidad, en pares referencia + texto.
  assert.match(m, /recargoPagoModalidadId\s+Int\?/, "la venta no puede decir qué modalidad impuso el recargo");
  assert.match(m, /recargoPagoModalidadNombre\s+String\?/,
    "sin el nombre congelado, renombrar o borrar la modalidad deja la venta sin explicación");
  assert.match(m, /recargoPagoMedioCobroLocalId\s+Int\?/);
  assert.match(m, /recargoPagoMedioNombre\s+String\?/,
    "sin el nombre del medio, 'Mercado Pago·Crédito' y 'Banco X·Crédito' siguen siendo indistinguibles");
});

test("C ter · las referencias del snapshot son FK REALES, con su inversa y su índice", () => {
  // Un `Int?` suelto no es una referencia. El contrato es referencia operativa +
  // texto histórico, y sin FK la primera mitad no existe.
  //
  // `Venta.recargoPagoMedioCobroLocalId` nació así: columna sin relación y sin
  // FK en la migración. Lo detectó la revisión, no un candado — por eso existe
  // este.
  const v = modelo("Venta");
  assert.match(
    v,
    /recargoPagoMedioCobro\s+MedioCobroLocal\?\s+@relation\("RecargoImpuestoPorMedio", fields: \[recargoPagoMedioCobroLocalId\]/,
    "`recargoPagoMedioCobroLocalId` volvió a ser un Int suelto sin relación"
  );
  assert.match(v, /@@index\(\[recargoPagoMedioCobroLocalId\]\)/, "falta el índice de la FK del medio ganador");
  assert.match(v, /@@index\(\[recargoPagoModalidadId\]\)/, "falta el índice de la FK de la modalidad ganadora");

  // Y la FK tiene que existir en el SQL, que es lo único que la crea de verdad.
  assert.match(
    sqlSinComentarios,
    /ADD CONSTRAINT "Venta_recargoPagoMedioCobroLocalId_fkey"[\s\S]*?ON DELETE SET NULL/,
    "la migración no crea la FK del medio que impuso el recargo"
  );
  assert.match(
    sqlSinComentarios,
    /ADD CONSTRAINT "Venta_recargoPagoModalidadId_fkey"[\s\S]*?ON DELETE SET NULL/,
    "la migración no crea la FK de la modalidad que impuso el recargo"
  );
});

test("C quater · cada relación tiene su inversa, y están NOMBRADAS", () => {
  // `prisma generate` falló con P1012 sobre `VentaPago.medioCobro`: relación sin
  // opuesta. Y las inversas necesitan nombre porque `MedioCobroLocal` recibe DOS
  // desde `Venta` y `VentaPago` —el medio con el que se cobró y el que impuso el
  // recargo— y sin nombre Prisma no puede distinguirlas.
  const mcl = modelo("MedioCobroLocal");
  assert.match(mcl, /pagos\s+VentaPago\[\]\s+@relation\("PagoConMedioCobro"\)/,
    "falta la inversa de VentaPago.medioCobro: prisma generate falla con P1012");
  assert.match(mcl, /ventasCuyoRecargoImpuso\s+Venta\[\]\s+@relation\("RecargoImpuestoPorMedio"\)/,
    "falta la inversa de Venta.recargoPagoMedioCobro");

  const mod = modelo("MedioCobroModalidadLocal");
  assert.match(mod, /pagos\s+VentaPago\[\]\s+@relation\("PagoConModalidad"\)/);
  assert.match(mod, /ventasCuyoRecargoImpuso\s+Venta\[\]\s+@relation\("RecargoImpuestoPorModalidad"\)/);
});

test("C bis · las FK históricas son SetNull: borrar configuración no borra historia", () => {
  // Una cascada acá borraría pagos —o ventas— al limpiar configuración. El texto
  // congelado es lo que sostiene la explicación cuando la referencia se pierde.
  assert.match(
    modelo("VentaPago"),
    /modalidad\s+MedioCobroModalidadLocal\?\s+@relation\([^)]*onDelete: SetNull/,
    "la FK de modalidad en VentaPago no es SetNull"
  );
  assert.match(
    modelo("VentaPago"),
    /medioCobro\s+MedioCobroLocal\?\s+@relation\([^)]*onDelete: SetNull/,
    "la FK de medio en VentaPago no es SetNull"
  );
  assert.match(
    modelo("Venta"),
    /recargoPagoModalidad\s+MedioCobroModalidadLocal\?\s+@relation\([^)]*onDelete: SetNull/,
    "la FK de modalidad en Venta no es SetNull"
  );
  assert.match(
    modelo("Venta"),
    /recargoPagoMedioCobro\s+MedioCobroLocal\?\s+@relation\([^)]*onDelete: SetNull/,
    "la FK de medio en Venta no es SetNull"
  );
  // Y ninguna de las cuatro puede ser Cascade: borrar configuración borraría
  // ventas o pagos, que es exactamente lo contrario del snapshot histórico.
  for (const nombre of ["Venta", "VentaPago"]) {
    const m = modelo(nombre);
    const lineas = m.split("\n").filter((l) => /MedioCobroLocal\?|MedioCobroModalidadLocal\?/.test(l));
    for (const l of lineas) {
      assert.doesNotMatch(l, /onDelete: Cascade/, `una FK de configuración en ${nombre} quedó en Cascade: ${l.trim()}`);
    }
  }
});

test("la semántica de los TRES casos está escrita donde se lee el modelo", () => {
  // No es documentación decorativa: la diferencia entre "venta histórica" y
  // "venta nueva con un medio sin modalidades" decide qué se congela, y
  // confundirlas dejaría ventas nuevas identificadas solo como CREDITO.
  //
  // Se afirma sobre el archivo CRUDO a propósito: acá el sujeto ES el comentario.
  const bruto = schema.match(/model VentaPago \{[\s\S]*?\n\}/)[0];
  assert.match(bruto, /VENTA HISTÓRICA, anterior a esta funcionalidad/);
  assert.match(bruto, /VENTA NUEVA con un medio configurable SIN modalidades/);
  assert.match(bruto, /VENTA NUEVA con modalidad/);
  assert.match(
    bruto,
    /NO puede quedar identificada solo como `CREDITO`/,
    "se perdió la advertencia de que una venta nueva sin modalidad igual congela medio y procesador"
  );
});

test("la cadena de resolución de comisión está cerrada y documentada", () => {
  // La decisión no queda abierta hasta escribir el servidor: el orden y el
  // tratamiento del 0 explícito se fijan acá.
  const bruto = schema.match(/model MedioCobroModalidadLocal \{[\s\S]*?\n\}/)[0];
  const encabezado = schema.slice(Math.max(0, schema.indexOf("model MedioCobroModalidadLocal") - 3000), schema.indexOf("model MedioCobroModalidadLocal"));
  const texto = encabezado + bruto;
  assert.match(texto, /MedioCobroModalidadLocal\.comisionPct/, "falta el primer escalón de la cadena");
  assert.match(texto, /MedioCobroLocal\.comisionPct/, "falta el override del medio padre");
  assert.match(texto, /ConfiguracionGrupo/, "falta el escalón de configuración de grupo");
  assert.match(texto, /comisionPendiente/, "falta el estado final de la cadena");
  assert.match(
    texto,
    /UN `0` EXPLÍCITO GANA Y CORTA LA CADENA/,
    "se perdió la regla del 0 explícito: con `||` una decisión de no cobrar comisión se convertiría en herencia"
  );
});

test("la migración no siembra ni una modalidad, ni toca ventas históricas", () => {
  // La compatibilidad no puede depender de haber corrido un UPDATE una vez: un
  // local creado mañana tiene que comportarse igual. Mismo criterio que la
  // migración de medios configurables, que tampoco sembró una fila.
  assert.doesNotMatch(sqlSinComentarios, /INSERT INTO "MedioCobroModalidadLocal"/i,
    "la migración siembra modalidades: eso es reinterpretar una configuración que nadie eligió");
  assert.doesNotMatch(sqlSinComentarios, /UPDATE "Venta"\s+SET/i, "la migración reescribe ventas históricas");
  assert.doesNotMatch(sqlSinComentarios, /UPDATE "VentaPago"\s+SET/i, "la migración reescribe pagos históricos");
  assert.doesNotMatch(sqlSinComentarios, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i,
    "la migración borra datos: esta tanda es aditiva salvo el reemplazo de la unique");
});
