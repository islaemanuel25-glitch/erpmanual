// Candados del transporte crudo de las filas de controles.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
//
// Una consulta escrita a mano no la revisa nadie. Prisma valida los argumentos de
// `findMany` y contesta `Unknown field` cuando alguien pide una columna que no
// existe; con `$queryRawUnsafe` no hay nada de eso: el texto viaja tal cual y
// falla recién contra Postgres, en producción, con un mensaje que además apunta a
// otro lado. Es la misma familia que el cliente sin regenerar.
//
// Lo que lo ata es que la lista de columnas se DERIVA de los dos `select` que ya
// tenían candado contra `prisma/schema.prisma`. Estos candados comprueban que esa
// derivación sea completa —que no se pierda ni se invente ninguna— y que la única
// cosa declarada a mano, cuáles son decimales, coincida con el schema en las dos
// direcciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  SQL_CONTROLES,
  CAMPOS_DECIMAL,
  CAMPOS_BASE,
  CAMPOS_LOCAL,
  filaCrudaAFilaPrisma,
} from "./sqlControles.js";
import {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  filaParaControles,
} from "./controlesDesdePrisma.js";

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/**
 * Campo → tipo declarado, para un modelo del schema.
 *
 * Saca los comentarios ANTES de mirar. Tres candados de este repo ya encontraron
 * su patrón adentro de un comentario, y el tercero dio falso VERDE.
 */
function tiposDelModelo(nombreModelo) {
  const inicio = SCHEMA.indexOf(`model ${nombreModelo} {`);
  assert.ok(inicio >= 0, `no se encontró el modelo ${nombreModelo}`);
  const fin = SCHEMA.indexOf("\n}", inicio);
  const cuerpo = SCHEMA.slice(inicio, fin).replace(/\/\/[^\n]*/g, "");
  const tipos = new Map();
  for (const linea of cuerpo.split("\n").slice(1)) {
    const m = linea.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z][A-Za-z0-9_]*)(\?|\[\])?/);
    if (m && !m[1].startsWith("@")) tipos.set(m[1], m[2]);
  }
  return tipos;
}

test("G1. cada campo de los dos select viaja en el SQL, con su tabla y su alias", () => {
  // La derivación puede romperse en silencio: un `Object.keys` sobre el objeto
  // equivocado, un `join` que se coma el último. Un campo que no viaje llega
  // `undefined` a la clasificación y ésta contesta con confianza una respuesta
  // equivocada — que es cómo se rompió el fiambre de pieza fija en este repo.
  for (const campo of Object.keys(SELECT_CONTROLES_BASE)) {
    assert.ok(
      SQL_CONTROLES.includes(`b."${campo}"`),
      `el SQL no pide b."${campo}", que el select de la base sí pide`
    );
    assert.ok(
      SQL_CONTROLES.includes(`AS "b_${campo}"`),
      `el SQL no le pone alias b_${campo}`
    );
  }
  for (const campo of Object.keys(SELECT_CONTROLES_LOCAL)) {
    assert.ok(
      SQL_CONTROLES.includes(`l."${campo}"`),
      `el SQL no pide l."${campo}", que el select del local sí pide`
    );
    assert.ok(
      SQL_CONTROLES.includes(`AS "l_${campo}"`),
      `el SQL no le pone alias l_${campo}`
    );
  }
  // Y al revés: los campos exportados son EXACTAMENTE los de los dos select.
  assert.deepEqual(CAMPOS_BASE, Object.keys(SELECT_CONTROLES_BASE));
  assert.deepEqual(CAMPOS_LOCAL, Object.keys(SELECT_CONTROLES_LOCAL));
});

test("G2. contraprueba de G1: un campo que el SQL no pidiera se detectaría", () => {
  // Si `includes` contestara que sí a cualquier cosa, G1 estaría acompañando en
  // vez de afirmando.
  assert.equal(SQL_CONTROLES.includes('b."campoQueNoExiste"'), false);
  assert.equal(SQL_CONTROLES.includes('AS "l_campoQueNoExiste"'), false);
  // Y los dos lados no se confunden: `reglaPrecio` es del local y NO de la base.
  assert.equal(SQL_CONTROLES.includes('b."reglaPrecio"'), false);
  assert.ok(SQL_CONTROLES.includes('l."reglaPrecio"'));
});

test("G3. CAMPOS_DECIMAL coincide con el schema en las DOS direcciones", () => {
  // ── EL CANDADO QUE MÁS FALTA HACE ────────────────────────────────────────
  //
  // Es lo único de este módulo escrito a mano, y las dos formas de equivocarse
  // duelen distinto:
  //
  //   · un decimal que FALTE llega como objeto de Postgres sin castear, y la
  //     clasificación lo lee con `Number(...)` — puede dar NaN y marcar de más;
  //   · un campo de más se castea a texto sin necesidad; `factor_pack` es `Int` y
  //     castearlo no rompe, pero declara algo falso sobre el schema.
  //
  // Por eso se comprueba en las dos direcciones y no solo en la que preocupa.
  const tiposBase = tiposDelModelo("ProductoBase");
  const tiposLocal = tiposDelModelo("ProductoLocal");

  const decimalesDelSchema = new Set();
  for (const campo of CAMPOS_BASE) {
    if (tiposBase.get(campo) === "Decimal") decimalesDelSchema.add(campo);
  }
  for (const campo of CAMPOS_LOCAL) {
    if (tiposLocal.get(campo) === "Decimal") decimalesDelSchema.add(campo);
  }

  assert.deepEqual(
    [...CAMPOS_DECIMAL].sort(),
    [...decimalesDelSchema].sort(),
    "CAMPOS_DECIMAL no dice lo mismo que prisma/schema.prisma"
  );
});

test("G3-bis. CADA CAMPO DE LOS DOS SELECT EXISTE EN SU MODELO DEL SCHEMA", () => {
  // ── EL HUECO QUE ESTE CANDADO CIERRA ─────────────────────────────────────
  //
  // G1 comprueba que los campos del select VIAJEN al SQL, y G3 que los decimales
  // estén bien declarados. Ninguno comprueba que el campo EXISTA.
  //
  // Y el hueco no era teórico: un nombre mal escrito hace que `tiposDelModelo`
  // devuelva `undefined`, que no es "Decimal", así que no entra en el conjunto
  // del schema — y como tampoco está en CAMPOS_DECIMAL, G3 pasa en VERDE. El SQL
  // crudo pediría una columna inexistente y fallaría recién contra Postgres, en
  // producción, con un mensaje que además apunta a otro lado.
  //
  // Es la misma familia que el `productoLocal` que tumbó la pantalla de
  // comprobantes: Next no mira los argumentos y los candados no tocan la base.
  // Acá el schema es un archivo de texto, así que sí se puede mirar sin base.
  const tiposBase = tiposDelModelo("ProductoBase");
  const tiposLocal = tiposDelModelo("ProductoLocal");

  const faltanEnBase = CAMPOS_BASE.filter((c) => !tiposBase.has(c));
  assert.deepEqual(
    faltanEnBase,
    [],
    `estos campos del select no existen en model ProductoBase: ${faltanEnBase.join(", ")}`
  );

  const faltanEnLocal = CAMPOS_LOCAL.filter((c) => !tiposLocal.has(c));
  assert.deepEqual(
    faltanEnLocal,
    [],
    `estos campos del select no existen en model ProductoLocal: ${faltanEnLocal.join(", ")}`
  );
});

test("G3-ter. contraprueba de G3-bis: un campo inventado se detectaría", () => {
  // Sin esto, G3-bis pasaría en verde con un `has` que contestara siempre que sí.
  const tiposBase = tiposDelModelo("ProductoBase");
  assert.equal(tiposBase.has("modoVentaDeposito"), true, "existe y el analizador lo ve");
  assert.equal(tiposBase.has("modoVentaDeposit"), false, "un nombre casi igual no puede pasar");
  assert.equal(tiposBase.has("campoQueNoExiste"), false);
  // Y los dos modelos no se confunden: `reglaPrecio` es del local y no de la base.
  assert.equal(tiposBase.has("reglaPrecio"), false);
  assert.equal(tiposDelModelo("ProductoLocal").has("reglaPrecio"), true);
});

test("G4. contraprueba de G3: el analizador distingue Decimal de Int", () => {
  const tiposBase = tiposDelModelo("ProductoBase");
  assert.equal(tiposBase.get("precio_costo"), "Decimal");
  assert.equal(tiposBase.get("factor_pack"), "Int");
  assert.equal(tiposBase.get("pesoReferenciaKg"), "Decimal");
  assert.equal(tiposDelModelo("ProductoLocal").get("precioRevisadoAt"), "DateTime");
});

test("G5. se castea a texto exactamente lo decimal, ni uno más", () => {
  for (const campo of CAMPOS_BASE) {
    const esperado = CAMPOS_DECIMAL.has(campo);
    assert.equal(
      SQL_CONTROLES.includes(`b."${campo}"::text`),
      esperado,
      `b."${campo}" ${esperado ? "debería" : "no debería"} ir casteado a texto`
    );
  }
  for (const campo of CAMPOS_LOCAL) {
    const esperado = CAMPOS_DECIMAL.has(campo);
    assert.equal(
      SQL_CONTROLES.includes(`l."${campo}"::text`),
      esperado,
      `l."${campo}" ${esperado ? "debería" : "no debería"} ir casteado a texto`
    );
  }
  // La fecha NO se castea: la clasificación la quiere como Date y `$queryRaw` la
  // devuelve así. Casteada a texto seguiría andando —`precioVencido` acepta
  // string— pero pasaría por otra conversión sin motivo.
  assert.equal(SQL_CONTROLES.includes('l."precioRevisadoAt"::text'), false);
});

test("G6. la consulta no interpola nada: solo dos parámetros posicionales", () => {
  // Lo único que se concatena son nombres de columna, y salen de constantes de
  // este repo. Si algún día alguien mete un valor en el texto, esto lo dice.
  const parametros = SQL_CONTROLES.match(/\$\d+/g) ?? [];
  assert.deepEqual([...new Set(parametros)].sort(), ["$1", "$2"]);
  assert.ok(SQL_CONTROLES.includes("ANY($1::int[])"), "los ids van como parámetro, no pegados");
  assert.ok(SQL_CONTROLES.includes('l."localId" = $2'), "la ubicación va como parámetro");
  // Y el orden es el mismo que `ORDEN_DEL_TECHO`, porque la lista de ids ya viene
  // cortada por él.
  assert.ok(SQL_CONTROLES.includes("ORDER BY b.id ASC"));
});

test("G7. sin fila del local, `locales` queda vacío — no con un objeto en null", () => {
  // Es la diferencia entre "esta ubicación no tiene override" y "tiene uno
  // vacío", y la clasificación las trata distinto: sin override hereda de la
  // ficha, con override en null también, pero `reglaPrecio` NO se hereda nunca.
  const cruda = {
    b_id: 7,
    b_precio_costo: "100.00",
    b_precio_venta: "150.00",
    b_margen: "50.00",
    b_modalidad: "NORMAL",
    b_unidad_medida: "UNIDAD",
    b_factor_pack: 6,
    b_pesoReferenciaKg: null,
    l_id: null,
    l_localId: null,
    l_precio_costo: null,
    l_precio_venta: null,
    l_margen: null,
    l_reglaPrecio: null,
    l_recargoFijoUnidad: null,
    l_precioRevisadoAt: null,
    l_activo: null,
  };
  const fila = filaCrudaAFilaPrisma(cruda);
  assert.deepEqual(fila.locales, []);
  assert.equal(fila.id, 7);
  assert.equal(fila.precio_costo, "100.00");
});

test("G8. un ProductoLocal con precio en null NO se confunde con no tener ninguno", () => {
  // Por eso se mira `l_id` y no un campo cualquiera: preguntar por el precio haría
  // que un override sin precio se leyera como ausencia de override, y ahí
  // `reglaPrecio` volvería a MARGEN_PORCENTUAL cuando la fila dice otra cosa.
  const cruda = {
    b_id: 7,
    b_precio_costo: "100.00",
    b_precio_venta: "150.00",
    b_margen: "50.00",
    b_modalidad: "NORMAL",
    b_unidad_medida: "UNIDAD",
    b_factor_pack: null,
    b_pesoReferenciaKg: null,
    l_id: 33,
    l_localId: 4,
    l_precio_costo: null,
    l_precio_venta: null,
    l_margen: null,
    l_reglaPrecio: "RECARGO_FIJO_UNIDAD",
    l_recargoFijoUnidad: "250.00",
    l_precioRevisadoAt: null,
    l_activo: true,
  };
  const fila = filaCrudaAFilaPrisma(cruda);
  assert.equal(fila.locales.length, 1);
  assert.equal(fila.locales[0].id, 33);
  assert.equal(fila.locales[0].localId, 4);

  const resuelta = filaParaControles(fila, fila.locales[0]);
  assert.equal(resuelta.reglaPrecio, "RECARGO_FIJO_UNIDAD");
  assert.equal(resuelta.recargoFijoUnidad, "250.00");
  // El precio y el costo se heredan de la ficha, porque el override está en null.
  assert.equal(resuelta.precio_costo, "100.00");
  assert.equal(resuelta.precio_venta, "150.00");
});

test("G9. la forma cruda y la forma de Prisma se resuelven al MISMO merge", () => {
  // Es la afirmación que sostiene toda la optimización: cambia el transporte y no
  // el resultado. Acá se prueba con una fila; contra los 2.363 productos de
  // producción lo prueba `scripts/sonda-tiempos-productos.mjs --contraprueba`.
  const revisado = new Date("2026-07-01T12:00:00.000Z");

  const comoPrisma = {
    id: 9,
    precio_costo: 100,
    precio_venta: 180,
    margen: 80,
    modalidad: "NORMAL",
    unidad_medida: "KG",
    factor_pack: 12,
    pesoReferenciaKg: 1.5,
    locales: [
      {
        id: 4,
        localId: 2,
        precio_costo: 110,
        precio_venta: null,
        margen: null,
        reglaPrecio: "MARGEN_PORCENTUAL",
        recargoFijoUnidad: null,
        precioRevisadoAt: revisado,
        activo: true,
      },
    ],
  };

  const comoCrudo = filaCrudaAFilaPrisma({
    b_id: 9,
    b_precio_costo: "100.00",
    b_precio_venta: "180.00",
    b_margen: "80.00",
    b_modalidad: "NORMAL",
    b_unidad_medida: "KG",
    b_factor_pack: 12,
    b_pesoReferenciaKg: "1.500",
    l_id: 4,
    l_localId: 2,
    l_precio_costo: "110.00",
    l_precio_venta: null,
    l_margen: null,
    l_reglaPrecio: "MARGEN_PORCENTUAL",
    l_recargoFijoUnidad: null,
    l_precioRevisadoAt: revisado,
    l_activo: true,
  });

  const a = filaParaControles(comoPrisma, comoPrisma.locales[0]);
  const b = filaParaControles(comoCrudo, comoCrudo.locales[0]);

  // Los números se comparan como números: uno llega Decimal y el otro texto, y lo
  // que importa es que la clasificación —que los lee con `Number(...)`— vea lo
  // mismo.
  for (const campo of ["precio_costo", "precio_venta", "margen", "pesoReferenciaKg", "factor_pack"]) {
    assert.equal(Number(a[campo]), Number(b[campo]), `difieren en ${campo}`);
  }
  assert.equal(a.reglaPrecio, b.reglaPrecio);
  assert.equal(a.modalidad, b.modalidad);
  assert.equal(a.unidad_medida, b.unidad_medida);
  assert.equal(new Date(a.precioRevisadoAt).getTime(), new Date(b.precioRevisadoAt).getTime());
});
