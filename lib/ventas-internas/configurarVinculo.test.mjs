// Tests de la configuración del vínculo Cliente → Local interno.
// Correr con: node --test lib/ventas-internas/configurarVinculo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizarLocalVinculadoId,
  puedeVincularLocal,
  construirOpcionesVinculo,
  mensajeError,
  ERRORES,
  MOTIVOS,
} from "./configurarVinculo.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..", "..");

// ── normalizarLocalVinculadoId: semántica de update parcial ─────────────────

test("campo ausente → no presente (conserva el vínculo actual)", () => {
  assert.deepEqual(normalizarLocalVinculadoId({}), { presente: false });
  assert.deepEqual(normalizarLocalVinculadoId({ nombre: "X", activo: true }), { presente: false });
  // Nada de body tampoco explota.
  assert.deepEqual(normalizarLocalVinculadoId(null), { presente: false });
  assert.deepEqual(normalizarLocalVinculadoId(undefined), { presente: false });
  assert.deepEqual(normalizarLocalVinculadoId("no es objeto"), { presente: false });
});

test("null explícito → desvincular", () => {
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: null }), {
    presente: true, valor: null,
  });
});

test("string vacío → desvincular (opción 'Ningún local interno' del select)", () => {
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: "" }), {
    presente: true, valor: null,
  });
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: "   " }), {
    presente: true, valor: null,
  });
});

test("ID válido → vincular, como número o como string numérico", () => {
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: 7 }), { presente: true, valor: 7 });
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: "7" }), { presente: true, valor: 7 });
  assert.deepEqual(normalizarLocalVinculadoId({ localVinculadoId: " 12 " }), { presente: true, valor: 12 });
});

test("el 0 se rechaza", () => {
  for (const v of [0, "0", "00"]) {
    assert.deepEqual(
      normalizarLocalVinculadoId({ localVinculadoId: v }),
      { presente: true, error: ERRORES.ID_INVALIDO },
      `${JSON.stringify(v)} no debería aceptarse`
    );
  }
});

test("valores inválidos se rechazan (nunca se ignoran en silencio)", () => {
  const invalidos = [-1, "-1", 1.5, "1.5", "1e3", NaN, Infinity, true, false,
    {}, [], [7], "abc", "7abc", "1 2", undefined];
  for (const v of invalidos) {
    const r = normalizarLocalVinculadoId({ localVinculadoId: v });
    assert.equal(r.presente, true, `${JSON.stringify(v)}: el campo vino, está presente`);
    assert.equal(r.error, ERRORES.ID_INVALIDO, `${JSON.stringify(v)} debería ser inválido`);
    assert.equal("valor" in r, false);
  }
});

// ── puedeVincularLocal ──────────────────────────────────────────────────────

const localOk = (o = {}) => ({
  id: o.id ?? 7,
  nombre: o.nombre ?? "Mini 7",
  activo: o.activo ?? true,
  es_deposito: o.es_deposito ?? false,
});

test("local válido y libre → ok", () => {
  assert.deepEqual(puedeVincularLocal({ local: localOk(), clienteVinculadoId: null }), { ok: true });
});

test("local inexistente → NO_ENCONTRADO", () => {
  for (const l of [null, undefined, {}, { id: 0 }, { id: -3 }, { id: "abc" }]) {
    assert.equal(
      puedeVincularLocal({ local: l }).error,
      ERRORES.NO_ENCONTRADO,
      `${JSON.stringify(l)} debería ser NO_ENCONTRADO`
    );
  }
});

test("depósito rechazado (política de esta etapa)", () => {
  const r = puedeVincularLocal({ local: localOk({ es_deposito: true }) });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES.ES_DEPOSITO);
  assert.equal(r.motivo, MOTIVOS.ES_DEPOSITO);
  // También con la forma camelCase que devuelve la API.
  assert.equal(
    puedeVincularLocal({ local: { id: 7, activo: true, esDeposito: true } }).error,
    ERRORES.ES_DEPOSITO
  );
  // Y gana sobre el resto: un depósito inactivo y tomado sigue siendo ES_DEPOSITO.
  assert.equal(
    puedeVincularLocal({
      local: localOk({ es_deposito: true, activo: false }),
      clienteVinculadoId: 99,
    }).error,
    ERRORES.ES_DEPOSITO
  );
});

test("local inactivo rechazado para un vínculo NUEVO", () => {
  const r = puedeVincularLocal({ local: localOk({ activo: false }), vinculoActualDelCliente: null });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES.INACTIVO);
  assert.equal(r.motivo, MOTIVOS.INACTIVO);
});

test("vínculo actual con local que quedó inactivo se puede conservar", () => {
  const r = puedeVincularLocal({
    local: localOk({ id: 7, activo: false }),
    clienteVinculadoId: 55,
    vinculoActualDelCliente: 7,
    clienteIdActual: 55,
  });
  assert.deepEqual(r, { ok: true });
});

test("local tomado por OTRO cliente → YA_VINCULADO", () => {
  const r = puedeVincularLocal({
    local: localOk(),
    clienteVinculadoId: 99,
    clienteIdActual: 55,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES.YA_VINCULADO);
  assert.equal(r.motivo, MOTIVOS.TOMADO);
  // Y también cuando se crea un cliente nuevo (no hay clienteIdActual).
  assert.equal(
    puedeVincularLocal({ local: localOk(), clienteVinculadoId: 99, clienteIdActual: null }).error,
    ERRORES.YA_VINCULADO
  );
});

test("el MISMO cliente puede reguardar su vínculo actual", () => {
  assert.deepEqual(
    puedeVincularLocal({
      local: localOk({ id: 7 }),
      clienteVinculadoId: 55,
      vinculoActualDelCliente: 7,
      clienteIdActual: 55,
    }),
    { ok: true }
  );
});

test("Cliente.localId no participa de la decisión", () => {
  // Prueba de COMPORTAMIENTO, no de texto: se cuela un localId en cada objeto de
  // entrada, con valores que coinciden o no con el local vinculado, y el resultado
  // tiene que ser idéntico en todos los casos.
  const casos = [
    { local: { ...localOk({ id: 7 }), localId: 7 } },
    { local: { ...localOk({ id: 7 }), localId: 1 } },
    { local: { ...localOk({ id: 7 }), localId: 999 } },
    { local: localOk({ id: 7 }) }, // sin localId
  ];
  for (const c of casos) {
    assert.deepEqual(
      puedeVincularLocal({ ...c, clienteVinculadoId: null }),
      { ok: true },
      `localId=${JSON.stringify(c.local.localId)} no debería influir`
    );
  }
  // Y en las opciones del selector tampoco.
  const conLocalId = construirOpcionesVinculo({
    locales: [{ ...LOCALES[0], localId: 999 }],
    vinculoActual: null,
    clienteIdActual: 55,
  });
  const sinLocalId = construirOpcionesVinculo({
    locales: [LOCALES[0]],
    vinculoActual: null,
    clienteIdActual: 55,
  });
  assert.deepEqual(conLocalId, sinLocalId);
});

// ── construirOpcionesVinculo ────────────────────────────────────────────────

const LOCALES = [
  { id: 7, nombre: "Mini 7", activo: true, esDeposito: false, clienteVinculadoId: null, clienteVinculadoNombre: null },
  { id: 8, nombre: "Ayala", activo: true, esDeposito: false, clienteVinculadoId: 99, clienteVinculadoNombre: "Minimarket ayala" },
  { id: 9, nombre: "Casiano", activo: true, esDeposito: false, clienteVinculadoId: null, clienteVinculadoNombre: null },
];

test("opciones: las libres quedan habilitadas y las tomadas deshabilitadas", () => {
  const ops = construirOpcionesVinculo({ locales: LOCALES, vinculoActual: null, clienteIdActual: 55 });
  const byId = Object.fromEntries(ops.map((o) => [o.id, o]));
  assert.equal(byId[7].deshabilitada, false);
  assert.equal(byId[9].deshabilitada, false);
  assert.equal(byId[8].deshabilitada, true);
  assert.equal(byId[8].motivo, MOTIVOS.TOMADO);
  assert.match(byId[8].etiqueta, /ya vinculado a Minimarket ayala/);
});

test("opciones: el vínculo actual va primero y nunca deshabilitado", () => {
  const ops = construirOpcionesVinculo({ locales: LOCALES, vinculoActual: 7, clienteIdActual: 55 });
  assert.equal(ops[0].id, 7);
  assert.equal(ops[0].esActual, true);
  assert.equal(ops[0].deshabilitada, false);
  assert.equal(ops[0].motivo, null);
});

test("opciones: el vínculo actual inactivo sigue visible aunque no esté en la lista", () => {
  const ops = construirOpcionesVinculo({
    locales: LOCALES,
    vinculoActual: 42,
    localActual: { id: 42, nombre: "Sucursal cerrada", activo: false, esDeposito: false, clienteVinculadoId: 55 },
    clienteIdActual: 55,
  });
  const actual = ops.find((o) => o.id === 42);
  assert.ok(actual, "el vínculo actual debe estar presente");
  assert.equal(actual.deshabilitada, false, "hay que poder verlo para desvincularlo");
  assert.match(actual.etiqueta, /\(inactivo\)/);
  assert.equal(ops[0].id, 42, "va primero");
});

test("opciones: un local tomado por el PROPIO cliente no se deshabilita", () => {
  const locales = [{ id: 7, nombre: "Mini 7", activo: true, esDeposito: false, clienteVinculadoId: 55, clienteVinculadoNombre: "Mini 7" }];
  const ops = construirOpcionesVinculo({ locales, vinculoActual: 7, clienteIdActual: 55 });
  assert.equal(ops[0].deshabilitada, false);
  assert.equal(/ya vinculado/.test(ops[0].etiqueta), false);
});

test("opciones: los depósitos que llegasen a colarse quedan deshabilitados", () => {
  const locales = [{ id: 1, nombre: "depo", activo: true, esDeposito: true, clienteVinculadoId: null }];
  const ops = construirOpcionesVinculo({ locales, vinculoActual: null, clienteIdActual: 55 });
  assert.equal(ops[0].deshabilitada, true);
  assert.equal(ops[0].motivo, MOTIVOS.ES_DEPOSITO);
});

test("opciones: entradas basura se descartan y no rompen", () => {
  const ops = construirOpcionesVinculo({
    locales: [null, undefined, {}, { id: 0 }, { id: "x" }, LOCALES[0]],
    vinculoActual: null,
  });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].id, 7);
  assert.deepEqual(construirOpcionesVinculo({}), []);
  assert.deepEqual(construirOpcionesVinculo({ locales: "no es array" }), []);
});

test("opciones: orden alfabético entre las habilitadas", () => {
  const ops = construirOpcionesVinculo({ locales: LOCALES, vinculoActual: null, clienteIdActual: 55 });
  const habilitadas = ops.filter((o) => !o.deshabilitada).map((o) => o.nombre);
  assert.deepEqual(habilitadas, ["Casiano", "Mini 7"]);
  // Las deshabilitadas van al final.
  assert.equal(ops[ops.length - 1].id, 8);
});

test("es puro: no muta la lista recibida", () => {
  const locales = JSON.parse(JSON.stringify(LOCALES));
  const copia = JSON.parse(JSON.stringify(locales));
  construirOpcionesVinculo({ locales, vinculoActual: 7, clienteIdActual: 55 });
  assert.deepEqual(locales, copia);
});

// ── mensajeError ────────────────────────────────────────────────────────────

test("mensajes de error legibles y con nombres cuando se conocen", () => {
  assert.match(mensajeError(ERRORES.ID_INVALIDO), /inv.lido/i);
  assert.match(mensajeError(ERRORES.NO_ENCONTRADO), /no existe|no pertenece/i);
  assert.match(mensajeError(ERRORES.INACTIVO, { nombreLocal: "Mini 7" }), /Mini 7.*inactivo/);
  assert.match(mensajeError(ERRORES.INACTIVO), /inactivo/);
  assert.match(mensajeError(ERRORES.ES_DEPOSITO), /dep.sito/i);
  assert.equal(
    mensajeError(ERRORES.YA_VINCULADO, { nombreCliente: "Mini 7" }),
    "Este local ya está vinculado al cliente “Mini 7”."
  );
  assert.match(mensajeError(ERRORES.YA_VINCULADO), /otro cliente/);
  assert.match(mensajeError("CUALQUIERA"), /No se pudo configurar/);
});

// ── Contrato con las rutas (inspección del fuente) ──────────────────────────

const leer = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("crear: valida el vínculo contra la base y exige clientes.editar para vincular", () => {
  const src = leer("app/api/clientes/crear/route.js");
  assert.match(src, /normalizarLocalVinculadoId\(body\)/);
  assert.match(src, /puedeVincularLocal\(/);
  assert.match(src, /getLocalIdsDeGrupo\(grupoId\)/, "debe comprobar el grupo en el backend");
  assert.match(src, /checkPerm\(session, "clientes\.editar"\)/);
  assert.match(src, /localVinculadoId: localVinculadoIdFinal/);
  // Carrera por el índice único.
  assert.match(src, /P2002/);
});

test("editar: update PARCIAL — sin el campo no se toca el vínculo", () => {
  const src = leer("app/api/clientes/editar/[id]/route.js");
  assert.match(src, /normalizarLocalVinculadoId\(body\)/);
  // undefined = no tocar; solo se agrega a data si cambió.
  assert.match(src, /let localVinculadoIdFinal = undefined/);
  assert.match(src, /if \(localVinculadoIdFinal !== undefined\) \{/);
  assert.match(src, /dataCompleta\.localVinculadoId = localVinculadoIdFinal/);
  assert.match(src, /dataSimple\.localVinculadoId = localVinculadoIdFinal/);
  assert.match(src, /getLocalIdsDeGrupo\(grupoId\)/);
  assert.match(src, /puedeVincularLocal\(/);
  assert.match(src, /P2002/);
  // El scope del cliente sigue siendo por local + grupo.
  assert.match(src, /where: \{ id: Number\(id\), localId, grupoId \}/);
});

test("listar devuelve el local vinculado para la etiqueta y el selector", () => {
  assert.match(leer("app/api/clientes/listar/route.js"), /localVinculado: \{\s*\n\s*select: \{ id: true, nombre: true, activo: true \}/);
});

test("el endpoint de locales vinculables scopea por grupo, permiso y excluye depósitos", () => {
  const src = leer("app/api/clientes/locales-vinculables/route.js");
  assert.match(src, /resolveLocalAndGrupo\(req\)/);
  assert.match(src, /checkPerm\(session, "clientes\.editar"\)/);
  assert.match(src, /getLocalIdsDeGrupo\(grupoId\)/);
  assert.match(src, /es_deposito: false/);
  // Devuelve solo los 6 campos acordados.
  for (const campo of ["id:", "nombre:", "activo:", "esDeposito:", "clienteVinculadoId:", "clienteVinculadoNombre:"]) {
    assert.ok(src.includes(campo), `falta ${campo} en la respuesta`);
  }
  // Nada de dirección, teléfono, cuil… Se miran solo las líneas de CÓDIGO: los
  // comentarios del archivo mencionan esos campos justamente para explicar por qué
  // no se reutiliza /api/locales/listar, que sí los expone.
  const codigo = src
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  for (const de_mas of ["direccion", "telefono", "cuil", "codigoPostal", "provincia", "email"]) {
    assert.equal(codigo.includes(de_mas), false, `no debería exponer ${de_mas}`);
  }
});

test("la importación no escribe localVinculadoId (no lo borra por omisión)", () => {
  for (const p of ["app/api/clientes/import/apply/route.js", "app/api/clientes/import/excel/route.js"]) {
    assert.equal(leer(p).includes("localVinculadoId"), false, `${p} no debería tocar el vínculo`);
  }
});

test("exportaciones sin localVinculadoId todavía", () => {
  for (const p of ["app/api/clientes/export/excel/route.js", "app/api/clientes/export/pdf/route.js"]) {
    assert.equal(leer(p).includes("localVinculadoId"), false);
  }
});

test("el POST de editar (no usado por la UI) no escribe el vínculo", () => {
  // Su objeto `data` es una whitelist que no incluye localVinculadoId, así que un
  // update por esa vía tampoco lo borra.
  const src = leer("app/api/clientes/editar/[id]/route.js");
  const post = src.slice(src.indexOf("export async function POST"));
  assert.equal(post.includes("localVinculadoId"), false);
});

// ── Regresión: la etapa 2B no activa nada del flujo automático ──────────────

// Etapa 4: el flujo YA está activado. El invariante deja de ser "sin llamadores"
// y pasa a ser "un único punto de activación", que es lo que hay que proteger.
test("el helper de activación se usa en UN solo punto: pos-ventas/crear", () => {
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
      if (p.includes(path.join("lib", "ventas-internas"))) continue;
      const src = fs.readFileSync(p, "utf8");
      if (src.includes("evaluarVinculoVentaInterna") || src.includes("ventas-internas/vinculo")) {
        usos.push(path.relative(ROOT, p));
      }
    }
  };
  for (const raiz of ["app", "components", "lib"]) walk(path.join(ROOT, raiz));
  // Etapa 4C: el evaluador quedó encapsulado en lib/ventas-internas (excluido del
  // walk). Ninguna ruta lo llama directo: pasan por resolverVentaInterna, que es
  // quien lee la base —previa con `prisma`, definitiva con `tx`—.
  assert.deepEqual(usos, [],
    `vinculo.js solo debe usarse dentro de lib/ventas-internas: ${usos.join(", ")}`);
});

test("solo la venta interna escribe Transferencia.ventaId", () => {
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
      // Solo código de producción: los tests nombran ventaId para verificarlo.
      if (/\.test\.mjs$/.test(e.name)) continue;
      const src = fs.readFileSync(p, "utf8");
      // Escritura del vínculo venta→transferencia en la creación de transferencias.
      if (/ventaId\s*[:,]/.test(src) && /transferencia\.create|crearTransferencia\(/i.test(src)) {
        usos.push(path.relative(ROOT, p));
      }
    }
  };
  for (const raiz of ["app", "lib"]) walk(path.join(ROOT, raiz));
  assert.deepEqual(usos.sort(), [
    path.join("app", "api", "pos-ventas", "crear", "route.js"),
    path.join("lib", "transferencias", "crearTransferencia.js"),
  ].sort(), `ventaId solo se escribe desde la venta interna y su servicio: ${usos.join(", ")}`);
});

test("el módulo de configuración no importa Prisma ni Next", () => {
  const src = fs.readFileSync(path.join(AQUI, "configurarVinculo.js"), "utf8");
  for (const prohibido of ["@/lib/prisma", "next/", "NextResponse", "require("]) {
    assert.equal(src.includes(prohibido), false, `no debería mencionar "${prohibido}"`);
  }
});
