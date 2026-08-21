// Candados del puente entre Prisma y la clasificación de controles.
//
// ── EL CANDADO QUE IMPORTA ES EL PRIMERO ────────────────────────────────────
//
// `SELECT_CONTROLES_BASE` pedía `reglaPrecio` y `recargoFijoUnidad` a
// `ProductoBase`. Esas dos columnas viven SOLO en `ProductoLocal`. El build
// compiló, los 21 candados del dominio quedaron en verde, y la consulta explotó
// recién contra Postgres con `Unknown field reglaPrecio`.
//
// G1 compara los dos `select` contra `prisma/schema.prisma`. No reemplaza a la
// sonda —que además prueba que la migración se aplicó y que el índice resuelve—,
// pero atrapa esta familia entera sin base de datos y en milisegundos.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  TECHO_CONTROL,
  ORDEN_DEL_TECHO,
  opcionesDelTecho,
  seTrunco,
  dentroDelTecho,
  filaParaControles,
  contarDesdePrisma,
  filaMarcadaPor,
} from "./controlesDesdePrisma.js";
import { IDS_CONTROL, CONTROL } from "./controlesCalidad.js";

const SCHEMA = fs.readFileSync(
  path.join(process.cwd(), "prisma", "schema.prisma"),
  "utf8"
);

/**
 * Los nombres de campo declarados en un modelo del schema.
 *
 * Saca los comentarios ANTES de mirar. Ya hubo tres candados en este repo que
 * encontraron su patrón dentro de un comentario: dos dieron falso positivo y el
 * tercero —el peor— dio falso VERDE con la comprobación sacada.
 */
function camposDelModelo(nombreModelo) {
  const inicio = SCHEMA.indexOf(`model ${nombreModelo} {`);
  assert.ok(inicio >= 0, `no se encontró el modelo ${nombreModelo}`);
  const fin = SCHEMA.indexOf("\n}", inicio);
  const cuerpo = SCHEMA.slice(inicio, fin).replace(/\/\/[^\n]*/g, "");
  const campos = new Set();
  for (const linea of cuerpo.split("\n").slice(1)) {
    const m = linea.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+\S/);
    if (m && !m[1].startsWith("@")) campos.add(m[1]);
  }
  return campos;
}

test("G1. cada campo de los dos select existe en su modelo del schema", () => {
  const enBase = camposDelModelo("ProductoBase");
  const enLocal = camposDelModelo("ProductoLocal");

  const faltanEnBase = Object.keys(SELECT_CONTROLES_BASE).filter((c) => !enBase.has(c));
  const faltanEnLocal = Object.keys(SELECT_CONTROLES_LOCAL).filter((c) => !enLocal.has(c));

  assert.deepEqual(
    faltanEnBase,
    [],
    `SELECT_CONTROLES_BASE pide campos que ProductoBase no tiene: ${faltanEnBase.join(", ")}`
  );
  assert.deepEqual(
    faltanEnLocal,
    [],
    `SELECT_CONTROLES_LOCAL pide campos que ProductoLocal no tiene: ${faltanEnLocal.join(", ")}`
  );
});

test("G2. contraprueba de G1: un campo inventado se detecta", () => {
  const enBase = camposDelModelo("ProductoBase");
  // Si el analizador contestara que sí a cualquier cosa, G1 estaría acompañando
  // en vez de afirmando.
  assert.equal(enBase.has("reglaPrecio"), false, "reglaPrecio NO es de ProductoBase");
  assert.equal(enBase.has("recargoFijoUnidad"), false, "recargoFijoUnidad NO es de ProductoBase");
  assert.equal(enBase.has("modalidad"), true, "modalidad SÍ es de ProductoBase");
  assert.equal(camposDelModelo("ProductoLocal").has("reglaPrecio"), true);
});

test("G3. precioRevisadoAt está en el select del local, no en el de la base", () => {
  assert.equal(SELECT_CONTROLES_LOCAL.precioRevisadoAt, true);
  assert.equal(SELECT_CONTROLES_BASE.precioRevisadoAt, undefined);
});

test("G4. sin ProductoLocal la regla es MARGEN_PORCENTUAL, igual que el mapper", () => {
  // `mergeBaseLocalToUi` resuelve `local?.reglaPrecio ?? "MARGEN_PORCENTUAL"`.
  // Si acá se contestara otra cosa, el control diría "falta regla" sobre un
  // producto que la pantalla muestra con margen.
  const fila = filaParaControles({ id: 1, margen: 30, precio_costo: 100, precio_venta: 200 }, null);
  assert.equal(fila.reglaPrecio, "MARGEN_PORCENTUAL");
  assert.equal(fila.recargoFijoUnidad, null);
});

test("G5. la regla del local gana y NO se hereda de la base", () => {
  const base = { id: 1, margen: 30, precio_costo: 100, precio_venta: 200 };
  const local = { id: 9, localId: 3, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 50 };
  const fila = filaParaControles(base, local);
  assert.equal(fila.reglaPrecio, "RECARGO_FIJO_UNIDAD");
  assert.equal(Number(fila.recargoFijoUnidad), 50);
});

test("G6. el precio y el costo del local pisan a los de la ficha; en null se heredan", () => {
  const base = { id: 1, precio_costo: 100, precio_venta: 200, margen: 30 };
  const conOverride = filaParaControles(base, { id: 9, localId: 3, precio_venta: 250 });
  assert.equal(Number(conOverride.precio_venta), 250, "el override gana");
  assert.equal(Number(conOverride.precio_costo), 100, "sin override se hereda");
});

test("G7. precioRevisadoAt NO se hereda de la ficha ni de otro local", () => {
  const base = { id: 1, precio_costo: 100, precio_venta: 200, precioRevisadoAt: new Date() };
  const fila = filaParaControles(base, { id: 9, localId: 3 });
  assert.equal(
    fila.precioRevisadoAt,
    null,
    "revisar el precio de una ubicación no dice nada sobre el de otra"
  );
});

test("G8. la modalidad sale de la ficha aunque el local mande otra cosa", () => {
  const fila = filaParaControles(
    { id: 1, modalidad: "IMPORTE_VARIABLE", precio_costo: 0, precio_venta: 0 },
    { id: 9, localId: 3, modalidad: "NORMAL" }
  );
  assert.equal(fila.modalidad, "IMPORTE_VARIABLE", "un producto no es servicio en un local y mercadería en otro");
});

test("G9. contador y filtro no se pueden separar: son la misma función", () => {
  const ahora = new Date("2026-08-20T12:00:00Z");
  const viejo = new Date("2026-01-01T00:00:00Z");
  const filas = [
    // Sano y revisado hace poco: no lo marca ninguno.
    {
      id: 1, precio_costo: 100, precio_venta: 200, margen: 100, modalidad: "NORMAL",
      unidad_medida: "UNIDAD",
      locales: [{ id: 1, localId: 3, reglaPrecio: "MARGEN_PORCENTUAL", precioRevisadoAt: ahora }],
    },
    // Precio viejo y sin regla.
    {
      id: 2, precio_costo: 100, precio_venta: 100, margen: null, modalidad: "NORMAL",
      unidad_medida: "UNIDAD",
      locales: [{ id: 2, localId: 3, reglaPrecio: "MARGEN_PORCENTUAL", precioRevisadoAt: viejo }],
    },
    // Sin ProductoLocal: nunca revisado.
    { id: 3, precio_costo: 100, precio_venta: 300, margen: 200, modalidad: "NORMAL", unidad_medida: "UNIDAD", locales: [] },
  ];

  const conteo = contarDesdePrisma(filas, ahora);
  for (const id of IDS_CONTROL) {
    const porFiltro = filas.filter((f) => filaMarcadaPor(id, f, ahora)).length;
    assert.equal(porFiltro, conteo[id], `${id}: el filtro dice ${porFiltro} y el contador ${conteo[id]}`);
  }
  assert.equal(conteo[CONTROL.PRECIO_VENCIDO], 2, "el viejo y el que nunca se revisó");
  assert.equal(conteo[CONTROL.SIN_REGLA], 1);
});

// ── EL TECHO Y EL ORDEN CON EL QUE SE CORTA ────────────────────────────────

const leerRuta = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
/** Saca los comentarios ANTES de mirar: un candado que busca texto los encuentra. */
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const LAS_DOS_RUTAS = [
  "app/api/productos/controles/route.js",
  "app/api/productos/listar/route.js",
];

test("G10. el corte trae UNA de más, que es lo que detecta el truncado", () => {
  const o = opcionesDelTecho();
  assert.equal(o.take, TECHO_CONTROL + 1, "sin el +1 no se puede distinguir 'justo' de 'hay más'");
  assert.deepEqual(o.orderBy, ORDEN_DEL_TECHO);
});

test("G11. EL ORDEN ES ESTABLE Y ÚNICO, no un campo que se repite", () => {
  // ── POR QUÉ IMPORTA QUE SEA `id` ────────────────────────────────────────
  //
  // Ordenar por `nombre` no alcanza: hay nombres repetidos, y entre dos filas
  // empatadas el motor vuelve a elegir. El corte tiene que caer siempre en el
  // mismo lugar, así que la clave tiene que ser única. `id` además está indexado.
  assert.deepEqual(ORDEN_DEL_TECHO, { id: "asc" });
});

test("G12. seTrunco y dentroDelTecho cortan en el mismo lugar", () => {
  const filas = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

  assert.equal(seTrunco(filas(TECHO_CONTROL)), false, "justo el techo NO es truncado");
  assert.equal(seTrunco(filas(TECHO_CONTROL + 1)), true);
  assert.equal(dentroDelTecho(filas(TECHO_CONTROL)).length, TECHO_CONTROL);
  assert.equal(dentroDelTecho(filas(TECHO_CONTROL + 1)).length, TECHO_CONTROL);
  // Y lo que se descarta es la de más, no una del medio.
  assert.equal(dentroDelTecho(filas(TECHO_CONTROL + 1)).at(-1).id, TECHO_CONTROL);
});

test("G13. LAS DOS CONSULTAS USAN EL MISMO TECHO Y EL MISMO ORDEN", () => {
  // ── EL CANDADO QUE PIDIÓ LA REVISIÓN ────────────────────────────────────
  //
  // Los dos `findMany` traían `take: MAX_CONTROL + 1` SIN `orderBy`, y cada
  // archivo tenía su propio `const MAX_CONTROL = 5000`.
  //
  // Sin `orderBy`, con más de 5.000 productos el motor puede devolver conjuntos
  // distintos a dos peticiones: el contador y el filtro estarían mirando dos
  // muestras del mismo catálogo, y como los dos muestran el número con "+", la
  // card podría decir "+37" sobre una lista de "+41" sin que ninguno esté mal.
  // Dos límites inferiores ciertos de poblaciones distintas.
  //
  // Con menos de 5.000 no se nota, así que esto no se puede descubrir con los
  // datos de desarrollo —hay 1.790— ni con una sonda. Se mira en el código.
  // ── LO QUE ESTE CANDADO AFIRMA HOY, Y POR QUÉ CAMBIÓ ────────────────────
  //
  // Antes exigía `...opcionesDelTecho()` DENTRO de cada ruta, porque cada una
  // tenía su propio `findMany`. Los dos `findMany` se fueron: ahora las filas las
  // trae `traerFilasParaControles`, una sola función que las dos llaman.
  //
  // El candado se reescribió sabiendo eso, no se aflojó: **la afirmación es más
  // fuerte que antes.** Antes decía "las dos usan el mismo techo"; ahora dice "las
  // dos usan la misma CONSULTA", que incluye el techo, el orden, el select y el
  // corte. Y donde el techo se aplica de verdad se comprueba en G15.
  for (const ruta of LAS_DOS_RUTAS) {
    const fuente = sinComentarios(leerRuta(ruta));
    assert.match(
      fuente,
      /traerFilasParaControles\(/,
      `${ruta} dejó de traer las filas por la pieza compartida`
    );
    // La contraprueba de lo anterior: usar la función Y además escribir un
    // `findMany` propio con el select de controles pasaría lo de arriba en verde
    // mientras las dos vuelven a poder diferir.
    assert.equal(
      /SELECT_CONTROLES_(BASE|LOCAL)/.test(fuente),
      false,
      `${ruta} volvió a armar su propio select de controles`
    );
    assert.equal(
      /take:\s*\w*MAX_CONTROL|take:\s*5001|take:\s*5000/.test(fuente),
      false,
      `${ruta} volvió a escribir su propio techo`
    );
    assert.equal(
      /\b5000\b/.test(fuente),
      false,
      `${ruta} tiene un 5000 escrito a mano: el techo se define en un solo lugar`
    );
  }
});

test("G14. y el flag de truncado sale de la misma función en las dos", () => {
  // Comparar largos a mano —`rows.length > 5000`— es la otra forma de que se
  // separen: una podría quedar en `>=` y la otra en `>`. Ahora ninguna de las dos
  // lo calcula: lo reciben ya resuelto.
  for (const ruta of LAS_DOS_RUTAS) {
    const fuente = sinComentarios(leerRuta(ruta));
    assert.equal(
      /\.length\s*>\s*\w*(MAX_CONTROL|TECHO_CONTROL|5000)/.test(fuente),
      false,
      `${ruta} volvió a comparar el largo a mano`
    );
    assert.equal(
      /seTrunco\(|dentroDelTecho\(/.test(fuente),
      false,
      `${ruta} volvió a cortar por su cuenta en vez de recibir las filas ya cortadas`
    );
  }
});

test("G15. el techo y el orden se aplican en la pieza compartida", () => {
  // El corolario de G13: si las rutas dejaron de tenerlos, alguien tiene que
  // tenerlos. Sin este candado, sacar el techo de `traerFilasParaControles`
  // dejaría a G13 y G14 en verde afirmando nada — que es exactamente la forma del
  // falso verde que este repo ya se comió tres veces.
  const fuente = sinComentarios(
    fs.readFileSync(path.join(process.cwd(), "lib", "productos", "sqlControles.js"), "utf8")
  );
  assert.match(fuente, /\.\.\.opcionesDelTecho\(\)/, "sqlControles dejó de usar el techo compartido");
  assert.match(fuente, /seTrunco\(/, "sqlControles dejó de detectar el truncado");
  assert.match(fuente, /dentroDelTecho\(/, "sqlControles dejó de cortar por el techo");
  // El truncado se mide sobre la consulta que trae una de más. Calcularlo sobre
  // el resultado del SQL —que ya viene cortado— nunca lo prendería.
  assert.match(
    fuente,
    /seTrunco\(conIds\)/,
    "el truncado tiene que salir de la consulta que trae una fila de más"
  );
});
