// Tests del predicado de venta interna + verificación del schema y la migración.
// Correr con: node --test lib/ventas-internas/vinculo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluarVinculoVentaInterna, CODIGOS } from "./vinculo.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..", "..");

// Escenario válido de referencia: depósito 1 vende al local 7, que el cliente 55
// representa. Cada test rompe UNA condición.
const DEPO = { id: 1, es_deposito: true, activo: true, nombre: "depo" };
const LOCAL7 = { id: 7, es_deposito: false, activo: true, nombre: "Minimarket casiano" };

const valido = (over = {}) => ({
  cliente: { id: 55, nombre: "Minimarket casiano", localId: 1, localVinculadoId: 7 },
  localOrigen: DEPO,
  localDestino: LOCAL7,
  perteneceOrigenAlGrupo: true,
  perteneceDestinoAlGrupo: true,
  tienePermisoCrearTransferencia: true,
  ...over,
});

// ── Caso válido ──────────────────────────────────────────────────────────────

test("caso válido: activa, con el código y el destino", () => {
  assert.deepEqual(evaluarVinculoVentaInterna(valido()), {
    activa: true,
    codigo: "VENTA_INTERNA_VALIDA",
    localDestinoId: 7,
  });
});

// ── Las 10 condiciones, una por vez ──────────────────────────────────────────

test("1. cliente ausente", () => {
  for (const c of [null, undefined]) {
    assert.deepEqual(evaluarVinculoVentaInterna(valido({ cliente: c })), {
      activa: false, codigo: "CLIENTE_AUSENTE",
    });
  }
  // Sin argumentos tampoco explota.
  assert.deepEqual(evaluarVinculoVentaInterna(), { activa: false, codigo: "CLIENTE_AUSENTE" });
  assert.deepEqual(evaluarVinculoVentaInterna({}), { activa: false, codigo: "CLIENTE_AUSENTE" });
});

test("2. cliente sin vínculo a local interno", () => {
  for (const v of [null, undefined, 0, -1, "", "abc", 1.5, NaN]) {
    const r = evaluarVinculoVentaInterna(valido({
      cliente: { id: 55, nombre: "Cliente externo", localId: 1, localVinculadoId: v },
    }));
    assert.deepEqual(r, { activa: false, codigo: "CLIENTE_SIN_LOCAL_VINCULADO" },
      `localVinculadoId=${JSON.stringify(v)} no debería activar`);
  }
});

test("3. origen ausente", () => {
  for (const o of [null, undefined, {}, { id: 0 }, { id: null }]) {
    assert.deepEqual(evaluarVinculoVentaInterna(valido({ localOrigen: o })), {
      activa: false, codigo: "ORIGEN_AUSENTE",
    });
  }
});

test("4. origen no es depósito", () => {
  for (const flag of [false, undefined, null, 0, "true"]) {
    assert.deepEqual(
      evaluarVinculoVentaInterna(valido({ localOrigen: { id: 3, es_deposito: flag } })),
      { activa: false, codigo: "ORIGEN_NO_ES_DEPOSITO" },
      `es_deposito=${JSON.stringify(flag)} no debería contar como depósito`
    );
  }
});

test("5. destino ausente", () => {
  for (const d of [null, undefined, {}, { id: 0 }]) {
    assert.deepEqual(evaluarVinculoVentaInterna(valido({ localDestino: d })), {
      activa: false, codigo: "DESTINO_AUSENTE",
    });
  }
});

test("6. destino inactivo", () => {
  for (const flag of [false, undefined, null, 0]) {
    assert.deepEqual(
      evaluarVinculoVentaInterna(valido({ localDestino: { id: 7, activo: flag } })),
      { activa: false, codigo: "DESTINO_INACTIVO" }
    );
  }
});

test("7. origen igual al destino", () => {
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, localVinculadoId: 1 },
    localOrigen: { id: 1, es_deposito: true },
    localDestino: { id: 1, activo: true },
  }));
  assert.deepEqual(r, { activa: false, codigo: "ORIGEN_Y_DESTINO_IGUALES" });
});

test("8. origen fuera del grupo", () => {
  for (const flag of [false, undefined, null]) {
    assert.deepEqual(
      evaluarVinculoVentaInterna(valido({ perteneceOrigenAlGrupo: flag })),
      { activa: false, codigo: "ORIGEN_FUERA_DEL_GRUPO" }
    );
  }
});

test("9. destino fuera del grupo", () => {
  for (const flag of [false, undefined, null]) {
    assert.deepEqual(
      evaluarVinculoVentaInterna(valido({ perteneceDestinoAlGrupo: flag })),
      { activa: false, codigo: "DESTINO_FUERA_DEL_GRUPO" }
    );
  }
});

test("10. sin permiso transferencias.crear", () => {
  for (const flag of [false, undefined, null, "sí"]) {
    assert.deepEqual(
      evaluarVinculoVentaInterna(valido({ tienePermisoCrearTransferencia: flag })),
      { activa: false, codigo: "SIN_PERMISO_TRANSFERENCIA" }
    );
  }
});

// ── El destino sale SOLO de localVinculadoId ────────────────────────────────

test("Cliente.localId distinto de localVinculadoId: el destino es el vinculado", () => {
  // El cliente pertenece a la agenda del depósito (localId 1) pero representa al 7.
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, nombre: "X", localId: 1, localVinculadoId: 7 },
  }));
  assert.equal(r.activa, true);
  assert.equal(r.localDestinoId, 7, "el destino no debe salir de localId");
});

test("localId apuntando a otro local no cambia el destino", () => {
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, localId: 99, localVinculadoId: 7 },
  }));
  assert.equal(r.localDestinoId, 7);
});

test("cliente con localId pero SIN localVinculadoId no activa", () => {
  // Reutilizar localId como vínculo sería el error a evitar: acá localId existe y
  // apunta a un local válido, y el resultado sigue siendo "sin vínculo".
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, nombre: "Cliente del depósito", localId: 7 },
  }));
  assert.deepEqual(r, { activa: false, codigo: "CLIENTE_SIN_LOCAL_VINCULADO" });
});

test("cliente con el MISMO nombre del local pero sin vínculo no activa", () => {
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, nombre: "Minimarket casiano", localId: 1, localVinculadoId: null },
    localDestino: { id: 7, activo: true, nombre: "Minimarket casiano" },
  }));
  assert.deepEqual(r, { activa: false, codigo: "CLIENTE_SIN_LOCAL_VINCULADO" },
    "el local NUNCA se infiere por el nombre");
});

test("destino que no coincide con localVinculadoId se rechaza", () => {
  // Defensa contra un llamador que resuelva mal el local: el vínculo dice 7 y le
  // pasan el 8.
  const r = evaluarVinculoVentaInterna(valido({
    cliente: { id: 55, localVinculadoId: 7 },
    localDestino: { id: 8, activo: true },
  }));
  assert.deepEqual(r, { activa: false, codigo: "DESTINO_AUSENTE" });
});

test("acepta localVinculadoId numérico en string", () => {
  const r = evaluarVinculoVentaInterna(valido({ cliente: { id: 55, localVinculadoId: "7" } }));
  assert.equal(r.activa, true);
  assert.equal(r.localDestinoId, 7);
  assert.equal(typeof r.localDestinoId, "number");
});

// ── Forma del resultado y códigos ────────────────────────────────────────────

test("los resultados negativos no traen localDestinoId", () => {
  const negativos = [
    valido({ cliente: null }),
    valido({ cliente: { id: 1 } }),
    valido({ localOrigen: null }),
    valido({ localOrigen: { id: 3, es_deposito: false } }),
    valido({ localDestino: null }),
    valido({ localDestino: { id: 7, activo: false } }),
    valido({ perteneceOrigenAlGrupo: false }),
    valido({ perteneceDestinoAlGrupo: false }),
    valido({ tienePermisoCrearTransferencia: false }),
  ];
  for (const args of negativos) {
    const r = evaluarVinculoVentaInterna(args);
    assert.equal(r.activa, false);
    assert.equal("localDestinoId" in r, false, `${r.codigo} no debería traer localDestinoId`);
    assert.equal(typeof r.codigo, "string");
  }
});

test("los 11 códigos están declarados y son únicos", () => {
  const esperados = [
    "VENTA_INTERNA_VALIDA", "CLIENTE_AUSENTE", "CLIENTE_SIN_LOCAL_VINCULADO",
    "ORIGEN_AUSENTE", "ORIGEN_NO_ES_DEPOSITO", "DESTINO_AUSENTE", "DESTINO_INACTIVO",
    "ORIGEN_Y_DESTINO_IGUALES", "ORIGEN_FUERA_DEL_GRUPO", "DESTINO_FUERA_DEL_GRUPO",
    "SIN_PERMISO_TRANSFERENCIA",
  ];
  const valores = Object.values(CODIGOS);
  assert.equal(valores.length, 11);
  assert.equal(new Set(valores).size, 11, "no debe haber códigos repetidos");
  for (const c of esperados) assert.ok(valores.includes(c), `falta el código ${c}`);
});

test("el orden de evaluación es estable: la primera condición que falla gana", () => {
  // Todo mal a la vez → el código del primer chequeo (cliente).
  assert.equal(
    evaluarVinculoVentaInterna({
      cliente: null, localOrigen: null, localDestino: null,
      perteneceOrigenAlGrupo: false, perteneceDestinoAlGrupo: false,
      tienePermisoCrearTransferencia: false,
    }).codigo,
    "CLIENTE_AUSENTE"
  );
  // Con cliente vinculado pero todo lo demás mal → el origen.
  assert.equal(
    evaluarVinculoVentaInterna({
      cliente: { localVinculadoId: 7 }, localOrigen: null, localDestino: null,
      perteneceOrigenAlGrupo: false, perteneceDestinoAlGrupo: false,
      tienePermisoCrearTransferencia: false,
    }).codigo,
    "ORIGEN_AUSENTE"
  );
});

test("el helper es puro: no muta los argumentos", () => {
  const args = valido();
  const copia = JSON.parse(JSON.stringify(args));
  evaluarVinculoVentaInterna(args);
  assert.deepEqual(JSON.parse(JSON.stringify(args)), copia);
});

// ── Schema: campos y relaciones inversas ────────────────────────────────────

const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const modelo = (nombre) => {
  const m = schema.match(new RegExp(`^model ${nombre} \\{[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `no se encontró el modelo ${nombre}`);
  return m[0];
};

test("schema: Cliente.localVinculadoId nullable, único y con FK SetNull", () => {
  const c = modelo("Cliente");
  assert.match(c, /localVinculadoId\s+Int\?\s+@unique/);
  assert.match(
    c,
    /localVinculado\s+Local\?\s+@relation\("ClienteLocalVinculado", fields: \[localVinculadoId\], references: \[id\], onDelete: SetNull\)/
  );
  // localId conserva su significado y su relación original.
  assert.match(c, /local\s+Local\?\s+@relation\(fields: \[localId\], references: \[id\]\)/);
});

test("schema: Cliente ↔ Local es UNO A UNO (la inversa no es lista)", () => {
  assert.match(modelo("Local"), /clienteVinculado\s+Cliente\?\s+@relation\("ClienteLocalVinculado"\)/);
  assert.equal(
    /clienteVinculado\s+Cliente\[\]/.test(modelo("Local")),
    false,
    "Local.clienteVinculado no debe ser una lista"
  );
});

test("schema: Transferencia.ventaId nullable, único y con FK SetNull", () => {
  const t = modelo("Transferencia");
  assert.match(t, /ventaId\s+Int\?\s+@unique/);
  assert.match(
    t,
    /venta\s+Venta\?\s+@relation\("VentaTransferencia", fields: \[ventaId\], references: \[id\], onDelete: SetNull\)/
  );
  // Compatible con posTransferenciaId: sigue existiendo intacto.
  assert.match(t, /posTransferenciaId Int\?/);
  assert.match(t, /posTransferencia PosTransferencia\?\s+@relation\(fields: \[posTransferenciaId\]/);
});

test("schema: Venta ↔ Transferencia es UNO A UNO (la inversa no es lista)", () => {
  const v = modelo("Venta");
  assert.match(v, /transferencia\s+Transferencia\?\s+@relation\("VentaTransferencia"\)/);
  assert.equal(
    /transferencias?\s+Transferencia\[\]/.test(v),
    false,
    "Venta.transferencia no debe ser una lista: el FK del otro lado es @unique"
  );
});

test("schema: el @unique no se duplica con un @@index sobre la misma columna", () => {
  // En PostgreSQL el índice único ya sirve para las búsquedas. Un @@index normal
  // sobre la misma columna sería un segundo índice redundante.
  assert.equal(
    /@@index\(\[localVinculadoId\]\)/.test(modelo("Cliente")),
    false,
    "Cliente: @@index([localVinculadoId]) es redundante con @unique"
  );
  assert.equal(
    /@@index\(\[ventaId\]\)/.test(modelo("Transferencia")),
    false,
    "Transferencia: @@index([ventaId]) es redundante con @unique"
  );
});

test("schema: sin enum de origen ni constraint de exclusión ventaId/posTransferenciaId", () => {
  assert.equal(/enum\s+OrigenTransferencia/.test(schema), false);
  assert.equal(/enum\s+TipoTransferencia/.test(schema), false);
  const t = modelo("Transferencia");
  // Sin unique compuesto ni check que fuerce exclusión mutua entre los dos vínculos.
  assert.equal(/@@unique\(\[ventaId, posTransferenciaId\]\)/.test(t), false);
});

test("schema: Cliente.localId NO se reutilizó como vínculo", () => {
  const c = modelo("Cliente");
  // Sigue declarado y nullable, sin @unique: varios clientes comparten el local
  // propietario. Si se hubiera reutilizado como vínculo tendría que ser único.
  assert.match(c, /^\s*localId\s+Int\?\s*$/m);
  assert.equal(/localId\s+Int\?\s+@unique/.test(c), false, "localId no debe volverse único");
  // Y su relación original sigue sin nombre (la nombrada es la del vínculo nuevo).
  assert.match(c, /local\s+Local\?\s+@relation\(fields: \[localId\]/);
});

// ── El vínculo, en la baseline ──────────────────────────────────────────────
//
// ── POR QUÉ ESTE BLOQUE SE REESCRIBIÓ ──────────────────────────────────────
//
// Antes había cinco candados sobre `20260730…_ventas_internas_vinculos`: que
// existiera una sola, que su timestamp no estuviera en el futuro, que se
// ordenara después de la anterior, que fuera aditiva y que no creara índices
// redundantes. Eran correctos y protegían el momento en que esa migración se
// escribió.
//
// El 2026-09-04 el historial se saneó: las 105 migraciones se reemplazaron por
// `000000000000_squashed_migrations`, porque ninguna creaba `Venta` y el
// historial no podía reproducir una base vacía. Esa migración ya no existe como
// archivo, así que las cinco afirmaciones quedaron sin sujeto — tres de ellas
// (nombre, fecha, orden) directamente sin sentido: hay una sola migración.
//
// NO se borraron: se reescribieron sobre lo que sigue siendo verdad. Lo que
// aquellas cinco protegían de fondo es la FORMA del vínculo —una columna
// nullable, un índice único, una FK que anula en vez de borrar— y eso ahora lo
// construye la baseline. Se afirma ahí.
//
// La diferencia de idioma importa: la migración vieja decía `ALTER TABLE … ADD
// COLUMN`, la baseline dice `CREATE TABLE`. Buscar el patrón viejo en el archivo
// nuevo habría dado rojo sobre una estructura correcta.

const DIR_MIG = path.join(ROOT, "prisma/migrations");
const BASELINE = path.join(DIR_MIG, "000000000000_squashed_migrations", "migration.sql");

test("la baseline encabeza el historial y ninguna de las 105 volvió", () => {
  // ── LA PRIMERA VERSIÓN DE ESTE CANDADO DURÓ UNA RAMA ──────────────────
  //
  // Afirmaba `deepEqual(dirs, ["000000000000_squashed_migrations"])`: que la
  // baseline fuera la ÚNICA migración. Era verdad el día que se escribió, en la
  // rama del saneamiento, y se puso en rojo con la primera migración legítima
  // que llegó — la de Ofertas. Un candado que se rompe cuando alguien hace su
  // trabajo bien es un candado que se termina borrando.
  //
  // Lo que sí tiene que valer siempre son dos cosas distintas: que la baseline
  // esté y ordene primero, y que NINGUNA de las 105 históricas vuelva al
  // directorio activo. Si volvieran, Prisma intentaría aplicarlas después de la
  // baseline, sobre una base que ya tiene todo, y el despliegue se caería.
  const dirs = fs
    .readdirSync(DIR_MIG, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  assert.ok(dirs.includes("000000000000_squashed_migrations"), "falta la baseline");
  assert.equal(dirs[0], "000000000000_squashed_migrations",
    `la baseline tiene que ordenar primero; primera: ${dirs[0]}`);

  // La lista de las 105 sale del snapshot, no de una copia escrita a mano acá.
  const historicas = new Set(
    fs
      .readFileSync(path.join(ROOT, "docs/deploy/estructura-produccion/migraciones-historicas.txt"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const volvieron = dirs.filter((d) => historicas.has(d));
  assert.deepEqual(volvieron, [], `volvieron al directorio activo: ${volvieron.join(", ")}`);
});

test("ninguna migración queda fechada en el futuro", () => {
  // Se conserva de los candados viejos porque la regla sigue valiendo para las
  // que vengan: el repo ya tuvo migraciones fechadas adelante (20260731…,
  // 20260801…) y el orden lexicográfico las pone donde no van.
  //
  // La baseline se llama `000000000000_…` a propósito: doce ceros la ordenan
  // antes que cualquier timestamp real, que es exactamente lo que tiene que
  // pasar. Por eso no entra en esta comprobación.
  const hoy = new Date();
  const hoyTs =
    `${hoy.getFullYear()}` +
    `${String(hoy.getMonth() + 1).padStart(2, "0")}` +
    `${String(hoy.getDate()).padStart(2, "0")}`;
  const fechadas = fs
    .readdirSync(DIR_MIG, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .map((e) => e.name);
  for (const d of fechadas) {
    assert.ok(d.slice(0, 8) <= hoyTs, `migración fechada en el futuro: ${d}`);
  }
});

test("la baseline construye el vínculo con su columna, su único y su FK", () => {
  const sql = fs.readFileSync(BASELINE, "utf8");

  // Las dos columnas, nullable: en un CREATE TABLE eso es la ausencia de NOT
  // NULL en su renglón.
  assert.match(sql, /"localVinculadoId" INTEGER,/, "falta Cliente.localVinculadoId");
  assert.match(sql, /"ventaId" INTEGER,/, "falta Transferencia.ventaId");

  // Los dos índices únicos, con el nombre exacto.
  assert.match(sql, /CREATE UNIQUE INDEX "Cliente_localVinculadoId_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "Transferencia_ventaId_key"/);

  // Y las dos FK que ANULAN en vez de borrar. Es la parte con consecuencia
  // real: con ON DELETE CASCADE, borrar un local se llevaría puesto al cliente,
  // y borrar una venta, la transferencia que la despachó.
  assert.match(
    sql,
    /"Cliente_localVinculadoId_fkey"[\s\S]{0,200}?REFERENCES "Local"\("id"\)[\s\S]{0,80}?ON DELETE SET NULL/,
    "la FK del cliente no anula al borrar el local"
  );
  assert.match(
    sql,
    /"Transferencia_ventaId_fkey"[\s\S]{0,200}?REFERENCES "Venta"\("id"\)[\s\S]{0,80}?ON DELETE SET NULL/,
    "la FK de la transferencia no anula al borrar la venta"
  );
});

test("no hay índices normales redundantes con los únicos del vínculo", () => {
  // Un CREATE INDEX (no UNIQUE) sobre las mismas columnas sería un segundo
  // índice sin utilidad: en PostgreSQL el índice único ya cubre las búsquedas.
  const sql = fs.readFileSync(BASELINE, "utf8");
  const normales = [...sql.matchAll(/CREATE INDEX "(\w+)" ON "(\w+)"\("(\w+)"\)/g)];
  for (const [, nombre, tabla, col] of normales) {
    const redundante =
      (tabla === "Cliente" && col === "localVinculadoId") ||
      (tabla === "Transferencia" && col === "ventaId");
    assert.equal(redundante, false, `índice normal redundante con el único: ${nombre}`);
  }
});

// ── Ninguna ruta usa todavía el helper ──────────────────────────────────────

// Etapa 4: activado. Se protege que el punto de entrada siga siendo UNO solo.
test("el helper está conectado solo desde pos-ventas/crear", () => {
  const usos = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git"].includes(e.name)) continue;
        walk(p);
        continue;
      }
      if (!/\.(js|jsx|mjs)$/.test(e.name)) continue;
      if (p.includes(path.join("lib", "ventas-internas"))) continue; // el propio módulo y su test
      const src = fs.readFileSync(p, "utf8");
      if (src.includes("evaluarVinculoVentaInterna") || src.includes("ventas-internas/vinculo")) {
        usos.push(path.relative(ROOT, p));
      }
    }
  };
  for (const raiz of ["app", "components", "lib"]) walk(path.join(ROOT, raiz));
  // Etapa 4C: el helper quedó encapsulado detrás de resolverVentaInterna, en
  // lib/ventas-internas (excluido del walk). Que ninguna ruta lo llame directo es
  // lo que garantiza que la lectura de base siempre pase por el mismo lugar y
  // pueda hacerse con `tx`.
  assert.deepEqual(usos, [],
    `el helper solo debe usarse dentro de lib/ventas-internas. Encontrados: ${usos.join(", ")}`);
  // Y el punto de entrada único sigue existiendo.
  const integracion = fs.readFileSync(path.join(AQUI, "integracionVenta.js"), "utf8");
  assert.match(integracion, /evaluarVinculoVentaInterna\(\{/);
  assert.equal(
    (fs.readFileSync(path.join(ROOT, "app", "api", "pos-ventas", "crear", "route.js"), "utf8")
      .match(/resolverVentaInterna\(/g) || []).length,
    2,
    "el route lo usa dos veces: previa con prisma y definitiva con tx"
  );
});

test("el helper no importa Prisma ni Next", () => {
  const src = fs.readFileSync(path.join(AQUI, "vinculo.js"), "utf8");
  for (const prohibido of ["@/lib/prisma", "prisma", "next/", "NextResponse", "require("]) {
    assert.equal(src.includes(prohibido), false, `no debería mencionar "${prohibido}"`);
  }
});
