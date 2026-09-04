// Candados del alcance de proveedor por ubicación.
//
// Lo que defienden: que un local pueda habilitar un proveedor propio SIN que
// ningún proveedor existente cambie de visibilidad, y que dar de alta uno que ya
// existe no le pise los datos a las demás ubicaciones que lo usan.
//
// Los dos modos de fallar son silenciosos y por eso están ejercidos uno por uno:
// una rama del OR mal armada saca de la vista proveedores que hoy se ven, y un
// `update` en la rama de reuso le cambia el nombre a la ficha de otro grupo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { proveedorVisibleWhere, proveedorAsociadoWhere } from "../visibilidad.js";
import {
  ACCION,
  CAMPOS_GLOBALES,
  CLAVE_ASOCIACION,
  cuitParaBuscar,
  decidirAltaDeProveedor,
  claveAsociacion,
  correspondeAsociar,
} from "./altaEnUbicacion.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CASIANO = 7;
const OTRO_LOCAL = 9;
const GRUPO = 3;

// ── LA VISIBILIDAD LEGACY NO SE MUEVE ─────────────────────────────────────

test("P1. LAS CUATRO RAMAS LEGACY SIGUEN EXACTAMENTE IGUALES, en el mismo orden", () => {
  // Es el candado que sostiene "un proveedor que se veía antes se sigue
  // viendo". Se comparan las cuatro ramas COMPLETAS, una por una: que el OR
  // "contenga" las condiciones no distingue de haberles cambiado algo adentro.
  const w = proveedorVisibleWhere(CASIANO, GRUPO);
  const creadoAca = { grupoId: GRUPO, creadoEnLocalId: CASIANO };

  assert.deepEqual(w.OR[0], { productos: { some: creadoAca } });
  assert.deepEqual(w.OR[1], { productos2: { some: creadoAca } });
  assert.deepEqual(w.OR[2], { productos3: { some: creadoAca } });
  assert.deepEqual(w.OR[3], {
    AND: [
      { productos: { none: { grupoId: GRUPO } } },
      { productos2: { none: { grupoId: GRUPO } } },
      { productos3: { none: { grupoId: GRUPO } } },
      { creadoEnLocalId: CASIANO },
    ],
  });
});

test("P2. EL CAMBIO ES ADITIVO: una rama más, y ninguna menos", () => {
  const w = proveedorVisibleWhere(CASIANO, GRUPO);
  assert.equal(w.OR.length, 5, "el OR dejó de tener las cuatro legacy más la nueva");
  // El `where` no ganó ninguna clave de nivel superior: sigue siendo un OR pelado.
  // Un AND arriba convertiría la disyunción en una restricción y sacaría de la
  // vista proveedores que hoy se ven — el modo de fallar más caro de esta tanda.
  assert.deepEqual(Object.keys(w), ["OR"]);
});

test("P3. LA RAMA NUEVA EXIGE LOS TRES: grupo, local y activo", () => {
  const rama = proveedorAsociadoWhere(CASIANO, GRUPO);
  assert.deepEqual(rama, {
    localesAsociados: { some: { grupoId: GRUPO, localId: CASIANO, activo: true } },
  });
  // Y es LA MISMA que entra en el OR: si la visibilidad armara la suya, asociar
  // por un camino y ver por otro dejaría de estar garantizado.
  assert.deepEqual(proveedorVisibleWhere(CASIANO, GRUPO).OR[4], rama);
});

test("P4. UNA ASOCIACIÓN INACTIVA NO HABILITA: `activo: true` es parte del filtro", () => {
  // Es el caso 4 del pedido. Sin `activo` en el `some`, dar de baja una
  // asociación no sacaría al proveedor de la vista y la baja sería decorativa.
  const rama = proveedorAsociadoWhere(CASIANO, GRUPO);
  assert.equal(rama.localesAsociados.some.activo, true);
  assert.ok(
    Object.prototype.hasOwnProperty.call(rama.localesAsociados.some, "activo"),
    "se cayó el filtro por activo"
  );
});

test("P5. LA ASOCIACIÓN ES DE UNA UBICACIÓN, NO DE UN GRUPO ENTERO", () => {
  // Es el caso 3: asociar en Casiano no puede hacerlo visible en otro local.
  const enCasiano = proveedorAsociadoWhere(CASIANO, GRUPO);
  const enOtro = proveedorAsociadoWhere(OTRO_LOCAL, GRUPO);
  assert.notDeepEqual(enCasiano, enOtro);
  assert.equal(enCasiano.localesAsociados.some.localId, CASIANO);
  assert.equal(enOtro.localesAsociados.some.localId, OTRO_LOCAL);
  // Y el grupo también filtra: el mismo local en otro grupo es otra asociación.
  assert.notDeepEqual(
    proveedorAsociadoWhere(CASIANO, GRUPO),
    proveedorAsociadoWhere(CASIANO, GRUPO + 1)
  );
});

// ── CREAR O REUSAR ────────────────────────────────────────────────────────

test("P6. SIN CUIT NO SE PUEDE DEDUPLICAR, y se dice en vez de taparse", () => {
  assert.equal(cuitParaBuscar(null), null);
  assert.equal(cuitParaBuscar(""), null);
  assert.equal(cuitParaBuscar("   "), null);
  const d = decidirAltaDeProveedor({ cuitPedido: null, existente: null });
  assert.equal(d.accion, ACCION.CREAR);
  assert.match(d.motivo, /CUIT/, "el motivo no explica por qué no se pudo deduplicar");
});

test("P7. EL CUIT SE RECORTA EN LOS DOS LADOS", () => {
  // Un espacio al final producía una fila que el único no ve como duplicada y
  // que ninguna búsqueda posterior encuentra: el segundo `Proveedor` que esta
  // tanda existe para evitar.
  assert.equal(cuitParaBuscar("  20-1234-5  "), "20-1234-5");
  // Y NO se normaliza más que eso: sacar guiones rompería el match contra las
  // filas ya guardadas con guiones.
  assert.equal(cuitParaBuscar("20-1234-5"), "20-1234-5");
  assert.notEqual(cuitParaBuscar("20-1234-5"), "2012345");
});

test("P8. CON CUIT NUEVO SE CREA; CON CUIT EXISTENTE SE REUSA", () => {
  assert.deepEqual(
    decidirAltaDeProveedor({ cuitPedido: "20-1", existente: null }).accion,
    ACCION.CREAR
  );
  const reuso = decidirAltaDeProveedor({ cuitPedido: "20-1", existente: { id: 42 } });
  assert.equal(reuso.accion, ACCION.REUSAR);
  assert.equal(reuso.proveedorId, 42);
});

test("P9. LA RAMA DE REUSO NO ESCRIBE NINGÚN CAMPO GLOBAL", () => {
  // El modo de fallar más caro: la fila encontrada por CUIT puede ser la que
  // otro grupo usa todos los días. Se comprueba sobre el CÓDIGO de la ruta, que
  // es donde el `update` podría aparecer.
  const ruta = sinComentarios(leer("app/api/proveedores/crear/route.js"));
  assert.ok(ruta.includes("decidirAltaDeProveedor"), "no se está leyendo la ruta correcta");
  assert.doesNotMatch(
    ruta,
    /tx\.proveedor\.update|prisma\.proveedor\.update/,
    "la ruta actualiza un Proveedor: eso le cambia los datos a todas las ubicaciones que lo usan"
  );
  // La lista existe para que esto se pueda afirmar; si se vacía, el candado deja
  // de significar algo.
  assert.ok(CAMPOS_GLOBALES.length >= 5);
  assert.ok(CAMPOS_GLOBALES.includes("nombre") && CAMPOS_GLOBALES.includes("cuit"));
});

test("P10. CONTRAPRUEBA de P9: el analizador vería un update si volviera", () => {
  const conUpdate = 'const x = await tx.proveedor.update({ where: { id }, data: { nombre } });';
  assert.match(conUpdate, /tx\.proveedor\.update/);
  // Y los comentarios no cuentan, que es la trampa que este repo ya pisó cuatro veces.
  assert.equal(sinComentarios("// tx.proveedor.update en prosa\nconst y=1;").includes("proveedor.update"), false);
});

// ── LA ASOCIACIÓN ─────────────────────────────────────────────────────────

test("P11. LA CLAVE DE LA ASOCIACIÓN ES LA DEL SCHEMA, y son los tres campos", () => {
  const k = claveAsociacion({ grupoId: GRUPO, localId: CASIANO, proveedorId: 42 });
  assert.deepEqual(k, {
    [CLAVE_ASOCIACION]: { grupoId: GRUPO, localId: CASIANO, proveedorId: 42 },
  });
  // El nombre tiene que existir tal cual en el schema: si alguien lo renombra
  // allá, esto se pone rojo en vez de explotar contra Postgres en producción.
  const schema = leer("prisma/schema.prisma");
  assert.match(
    schema,
    new RegExp(`@@unique\\(\\[grupoId, localId, proveedorId\\], name: "${CLAVE_ASOCIACION}"\\)`),
    "el único compuesto del schema no coincide con CLAVE_ASOCIACION"
  );
});

test("P12. LOS IDS SE CONVIERTEN A NÚMERO", () => {
  // Un id que llegó como texto produce un `where` que no matchea nada y un
  // upsert que inserta en vez de actualizar: la base lo frena con el único, pero
  // convierte una operación idempotente en un 409.
  const k = claveAsociacion({ grupoId: "3", localId: "7", proveedorId: "42" });
  assert.deepEqual(k[CLAVE_ASOCIACION], { grupoId: 3, localId: 7, proveedorId: 42 });
});

test("P13. SIN CONTEXTO DE UBICACIÓN NO SE ASOCIA NADA", () => {
  // Es el camino del administrador sin local activo, que ya existía antes de
  // esta tanda. Asociar al azar le habilitaría el proveedor a una ubicación que
  // nadie eligió.
  assert.equal(correspondeAsociar({ grupoId: GRUPO, localId: CASIANO }), true);
  assert.equal(correspondeAsociar({ grupoId: null, localId: CASIANO }), false);
  assert.equal(correspondeAsociar({ grupoId: GRUPO, localId: null }), false);
  assert.equal(correspondeAsociar({}), false);
  assert.equal(correspondeAsociar({ grupoId: 0, localId: CASIANO }), false);
});

// ── LA AUTORIZACIÓN ───────────────────────────────────────────────────────

test("P14. LA RUTA PREGUNTA POR EL PERMISO, NUNCA POR EL ROL", () => {
  const ruta = sinComentarios(leer("app/api/proveedores/crear/route.js"));
  assert.match(ruta, /checkPerm\(session, "proveedores\.crear"\)/);
  assert.doesNotMatch(ruta, /requireAdmin/, "la creación volvió a ser solo de administrador");
  for (const rol of ["ENCARGADO", "DUEÑO_LOCAL", "DUENO_LOCAL", "CAJERO", "esDuenoLocal", "rolNombre"]) {
    assert.doesNotMatch(
      ruta,
      new RegExp(rol),
      `la ruta pregunta por el rol ${rol} en vez de por el permiso`
    );
  }
});

test("P15. EDITAR Y ELIMINAR SIGUEN SIENDO DE ADMINISTRADOR", () => {
  // El pedido lo dice explícitamente y el motivo está en el modelo: los datos de
  // `Proveedor` son globales. Si alguien abre estas dos, este candado avisa.
  for (const p of ["app/api/proveedores/editar/route.js", "app/api/proveedores/eliminar/route.js"]) {
    assert.match(sinComentarios(leer(p)), /requireAdmin/, `${p} dejó de exigir administrador`);
  }
});

test("P16. EL PERMISO ESTÁ EN EL CATÁLOGO Y LO HEREDA EL DUEÑO", () => {
  const registry = leer("lib/rbac/registry.js");
  assert.match(registry, /code: "proveedores\.crear"/);

  const roles = sinComentarios(leer("lib/rbac/systemRoles.js"));
  // Va UNA sola vez, en ENCARGADO: DUEÑO_LOCAL lo hereda por el spread. Dos
  // apariciones serían dos lugares que dicen lo mismo.
  const apariciones = (roles.match(/"proveedores\.crear"/g) || []).length;
  assert.equal(apariciones, 1, "el permiso está escrito más de una vez en los defaults");
  assert.match(roles, /ENCARGADO_PERMISOS\s*=\s*\[[\s\S]*?"proveedores\.crear"[\s\S]*?\];/);
  assert.match(roles, /DUENO_LOCAL_PERMISOS\s*=\s*\[\s*\.\.\.ENCARGADO_PERMISOS/);
});

test("P17. Y SE COMPRUEBA SOBRE LA MATRIZ QUE SE EXPORTA, no sobre el texto", () => {
  // P16 mira la forma del archivo; esto mira el resultado. Los dos hacen falta:
  // el texto puede estar bien y la exportación mal armada.
  return import("../rbac/systemRoles.js").then((m) => {
    const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, DUENO_LOCAL, CAJERO } = m;
    assert.ok(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("proveedores.crear"));
    assert.ok(
      DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes("proveedores.crear"),
      "DUEÑO_LOCAL dejó de heredarlo"
    );
    assert.ok(
      !DEFAULT_PERMISOS_SISTEMA[CAJERO].includes("proveedores.crear"),
      "un cajero no da de alta proveedores"
    );
  });
});
