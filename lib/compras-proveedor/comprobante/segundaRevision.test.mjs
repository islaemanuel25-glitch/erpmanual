// Candados de la segunda revisión.
//
// El central: una línea cuyo costo NUNCA se escribió no se puede corregir.
// Confundir "nunca escribió" con "escribió y hay que deshacer" es lo que hace
// que un deshacer escriba de más.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  puedeRevertirCosto,
  planDeReversion,
  planDeCorreccion,
  PERMISOS_SEGUNDA_REVISION,
  MOTIVO_NO_CORREGIBLE,
} from "./segundaRevision.js";
import { CLASE_DIFERENCIA } from "../fronteraCosto.js";

const ESCRITA = { costoEscrito: true, costoPrevioAplicacion: 1000 };
const NUNCA = { costoEscrito: false, costoPrevioAplicacion: null };

// ── LA REGLA CENTRAL ───────────────────────────────────────────────────────

test("UNA LÍNEA CUYO COSTO NUNCA SE ESCRIBIÓ NO SE PUEDE REVERTIR", () => {
  const r = puedeRevertirCosto(NUNCA);
  assert.equal(r.puede, false);
  assert.equal(r.motivo, MOTIVO_NO_CORREGIBLE.NUNCA_ESCRITO);
});

test("y el motivo DISTINGUE los dos casos, no dice lo mismo para los dos", () => {
  // Si los dos dieran el mismo mensaje, quien lo lea no sabría si el problema
  // es que no hay nada que deshacer o que falta el dato para deshacerlo.
  const nunca = puedeRevertirCosto(NUNCA).motivo;
  const sinPrevio = puedeRevertirCosto({ costoEscrito: true, costoPrevioAplicacion: null }).motivo;
  assert.notEqual(nunca, sinPrevio);
  assert.equal(sinPrevio, MOTIVO_NO_CORREGIBLE.SIN_COSTO_PREVIO);
});

test("escribió pero sin costo previo guardado: tampoco se revierte", () => {
  // Es un dato inconsistente. Revertir a null borraría el costo bueno.
  for (const previo of [null, undefined, "", "abc", -5, NaN]) {
    const r = puedeRevertirCosto({ costoEscrito: true, costoPrevioAplicacion: previo });
    assert.equal(r.puede, false, `previo=${String(previo)}`);
  }
});

test("una línea que sí escribió y guardó el previo SE REVIERTE", () => {
  const r = puedeRevertirCosto(ESCRITA);
  assert.equal(r.puede, true);
  assert.equal(r.costoARestaurar, 1000);
});

test("un costo previo de CERO es un valor, no una ausencia", () => {
  // Un producto que no tenía costo y esta línea se lo puso: revertir tiene que
  // devolverlo a cero, no negarse.
  const r = puedeRevertirCosto({ costoEscrito: true, costoPrevioAplicacion: 0 });
  assert.equal(r.puede, true);
  assert.equal(r.costoARestaurar, 0);
});

// ── El plan de reversión ───────────────────────────────────────────────────

test("revertir restaura el costo previo y DEJA LA LÍNEA COMO NUNCA ESCRITA", () => {
  const p = planDeReversion(ESCRITA);
  assert.equal(p.ok, true);
  assert.equal(p.cambios.productoCosto, 1000);
  assert.equal(p.cambios.linea.costoEscrito, false);
  assert.equal(p.cambios.linea.costoPrevioAplicacion, null);
});

test("NO SE PUEDE REVERTIR DOS VECES LA MISMA LÍNEA", () => {
  // Después de revertir, la línea queda como nunca escrita. Si el previo
  // siguiera puesto, una segunda reversión restauraría un valor que ya no era
  // el anterior — escribiría de más, que es justo lo que hay que evitar.
  const p = planDeReversion(ESCRITA);
  const despues = { ...ESCRITA, ...p.cambios.linea };
  assert.equal(puedeRevertirCosto(despues).puede, false);
});

test("el plan NO escribe: solo dice qué escribir", () => {
  const p = planDeReversion(ESCRITA);
  assert.deepEqual(Object.keys(p).sort(), ["cambios", "motivo", "ok"]);
  assert.deepEqual(Object.keys(p.cambios).sort(), ["linea", "productoCosto"]);
});

test("sin línea no explota y no propone nada", () => {
  const p = planDeReversion(null);
  assert.equal(p.ok, false);
  assert.equal(p.cambios, null);
});

// ── La corrección a un valor nuevo ─────────────────────────────────────────

test("LA CORRECCIÓN PASA POR LA MISMA FRONTERA que la recepción", () => {
  // Que revise el dueño no lo exime de la regla. Una baja brusca sigue siendo
  // sospecha de mala lectura aunque la cargue él.
  const p = planDeCorreccion({ linea: NUNCA, costoNuevo: 500, costoCatalogoActual: 1000 });
  assert.equal(p.ok, false, "una baja del 50 % no se escribe de un clic");
  assert.equal(p.clasificacion.clase, CLASE_DIFERENCIA.SOSPECHA_LECTURA);
});

test("una diferencia chica se corrige sin pedir nada", () => {
  const p = planDeCorreccion({ linea: NUNCA, costoNuevo: 1020, costoCatalogoActual: 1000 });
  assert.equal(p.ok, true);
  assert.equal(p.cambios.productoCosto, 1020);
});

test("una diferencia grande necesita que la acepten, también en la revisión", () => {
  const args = { linea: NUNCA, costoNuevo: 1300, costoCatalogoActual: 1000 };
  assert.equal(planDeCorreccion(args).ok, false);
  assert.equal(planDeCorreccion({ ...args, aceptada: true }).ok, true);
});

test("los umbrales del proveedor siguen valiendo en la revisión", () => {
  const args = { linea: NUNCA, costoNuevo: 1080, costoCatalogoActual: 1000 };
  assert.equal(planDeCorreccion(args).ok, false, "8 % con el default de 5 se marca");
  assert.equal(
    planDeCorreccion({ ...args, umbrales: { revisarPct: 10 } }).ok,
    true,
    "con umbral propio de 10, un 8 % entra"
  );
});

test("CORREGIR UNA LÍNEA YA ESCRITA CONSERVA EL PREVIO ORIGINAL", () => {
  // El actual del catálogo es el que ella misma puso. Guardarlo perdería el
  // original para siempre y la reversión devolvería un costo inventado.
  const p = planDeCorreccion({
    linea: { costoEscrito: true, costoPrevioAplicacion: 800 },
    costoNuevo: 1020,
    costoCatalogoActual: 1000,
  });
  assert.equal(p.ok, true);
  assert.equal(p.cambios.linea.costoPrevioAplicacion, 800, "tiene que seguir siendo el original, no 1000");
});

test("corregir una línea que nunca escribió guarda el costo actual como previo", () => {
  const p = planDeCorreccion({ linea: NUNCA, costoNuevo: 1020, costoCatalogoActual: 1000 });
  assert.equal(p.cambios.linea.costoPrevioAplicacion, 1000);
  assert.equal(p.cambios.linea.costoEscrito, true);
});

test("un costo nuevo inválido no se escribe", () => {
  for (const c of [0, -5, null, "abc", undefined]) {
    assert.equal(planDeCorreccion({ linea: NUNCA, costoNuevo: c, costoCatalogoActual: 1000 }).ok, false, String(c));
  }
});

// ── Quién puede ────────────────────────────────────────────────────────────

test("EL PERMISO ES UNO QUE EXISTE, y cubre a quien tiene que cubrir", () => {
  // La primera versión comparaba nombres de rol inventados —"DUENO" no existe,
  // es DUEÑO_LOCAL— y además usaba un mecanismo que el proyecto no usa: acá se
  // gatea por permiso, como en las 123 rutas que llaman a checkPerm.
  //
  // Estos son los permisos REALES de erpazul_al, medidos y no supuestos:
  const rolesReales = {
    Admin: ["*"],
    Deposito: ["compras.crear", "compras.ver", "proveedores.ver"],
    Mini: ["compras.crear", "compras.ver"],
    CAJERO: [],
    ENCARGADO: ["compras.ver", "compras.recibir"],
    "DUEÑO_LOCAL": ["compras.ver", "compras.recibir", "compras.crear", "costos.ver"],
  };
  const tiene = (perms) =>
    perms.includes("*") || PERMISOS_SEGUNDA_REVISION.some((p) => perms.includes(p));

  // Los que Emanuel nombró para la segunda revisión.
  for (const rol of ["Admin", "ENCARGADO", "DUEÑO_LOCAL"]) {
    assert.equal(tiene(rolesReales[rol]), true, `${rol} tiene que poder revisar`);
  }
  // Y los que no.
  for (const rol of ["CAJERO", "Deposito", "Mini"]) {
    assert.equal(tiene(rolesReales[rol]), false, `${rol} NO tiene que poder revisar`);
  }
});
