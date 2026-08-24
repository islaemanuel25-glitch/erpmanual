// CANDADOS DE "ESTADO DEL STOCK".
//
// ── LO QUE DEFIENDEN, Y POR QUÉ NINGUNO FALLA CON UN ERROR VISIBLE ────────
//
// Los cuatro estados alimentan DOS cosas que tienen que decir lo mismo: el
// número de cada card y el total del listado filtrado. Si se separan, no rompen
// nada — la card dice 12, la lista muestra 9, y las dos tienen cara de estar
// bien. Sólo se ve contando a mano.
//
// Y abajo de todo está la decisión que motivó la tanda: un límite en 0 es un
// valor CONFIGURADO válido, así que "nunca se ajustó" no se puede deducir de los
// valores. Se lee de `limitesConfiguradosAt`, que es un hecho propio.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ESTADOS,
  ESTADO_STOCK,
  IDS_ESTADO,
  condicionesPrisma,
  condicionesSql,
  esEstadoValido,
  estadosDeLaFila,
} from "@/lib/stock/estadosDeStock";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Una fila como la que devuelve `mapItem`. */
const fila = (o) => ({
  cantidad: 0,
  stockMin: null,
  stockMax: null,
  limitesConfigurados: false,
  ...o,
});

test("EST1. LAS CUATRO CARDS, EN EL ORDEN DEL DISEÑO APROBADO", () => {
  // El 2×2 tiene un orden concreto y se decide en el dominio, no en la pantalla:
  // si lo decidiera el componente, el endpoint y la vista podrían discrepar.
  assert.deepEqual(
    ESTADOS.map((e) => e.id),
    ["bajo-minimo", "sin-stock", "limites-sin-ajustar", "sobre-maximo"]
  );
  assert.deepEqual(
    ESTADOS.map((e) => e.titulo),
    ["Bajo mínimo", "Sin stock", "Límites sin ajustar", "Sobre máximo"]
  );
  assert.deepEqual(
    ESTADOS.map((e) => e.detalle),
    ["reponer", "sin unidades", "configurar", "revisar"]
  );
  assert.deepEqual(
    ESTADOS.map((e) => e.rol),
    ["warning", "danger", "warning", "warning"]
  );

  // Cada una tiene qué decir cuando el conteo es CERO. Sin esto, "Bajo mínimo ·
  // reponer" sobre un 0 se sigue leyendo como el nombre de un problema.
  for (const e of ESTADOS) {
    assert.ok(e.detalleSano && e.detalleSano.length > 2, `${e.id} no dice nada en cero`);
  }
});

test("EST2. UN 0 CONFIGURADO NO ES LO MISMO QUE UN LÍMITE SIN AJUSTAR", () => {
  // ── LA DECISIÓN QUE MOTIVÓ TODA LA TANDA ────────────────────────────────
  //
  // Estas dos filas tienen los MISMOS valores y pertenecen a cards distintas. Lo
  // único que las separa es si alguien ajustó los límites alguna vez.
  const ceroConfigurado = fila({ cantidad: 5, stockMin: 0, stockMax: 0, limitesConfigurados: true });
  const ceroSinAjustar = fila({ cantidad: 5, stockMin: 0, stockMax: 0, limitesConfigurados: false });

  assert.ok(
    !estadosDeLaFila(ceroConfigurado).includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR),
    "un cero puesto a propósito se contó como 'sin ajustar'"
  );
  assert.ok(
    estadosDeLaFila(ceroSinAjustar).includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR),
    "una fila que nunca se configuró quedó fuera de 'Límites sin ajustar'"
  );
});

test("EST3. null/null SIN AUDITORÍA: sin ajustar, y no cuenta como bajo mínimo", () => {
  const f = fila({ cantidad: 3, stockMin: null, stockMax: null, limitesConfigurados: false });
  const e = estadosDeLaFila(f);
  assert.ok(e.includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR));
  // ── EL DEFECTO QUE ESTO IMPIDE ──────────────────────────────────────────
  //
  // Antes, `mapItem` aplanaba el null a 0 y "faltante" quedaba en `cantidad < 0`.
  // Con el aplanado al revés —tratando el null como un mínimo real— TODO producto
  // sin límites entraría en "Bajo mínimo" y la card contaría el catálogo entero.
  assert.ok(!e.includes(ESTADO_STOCK.BAJO_MINIMO), "sin mínimo configurado igual dijo 'bajo mínimo'");
  assert.ok(!e.includes(ESTADO_STOCK.SOBRE_MAXIMO));
});

test("EST4. LÍMITES POSITIVOS: cada lado dispara su card", () => {
  const bajo = fila({ cantidad: 2, stockMin: 5, stockMax: 50, limitesConfigurados: true });
  assert.ok(estadosDeLaFila(bajo).includes(ESTADO_STOCK.BAJO_MINIMO));
  assert.ok(!estadosDeLaFila(bajo).includes(ESTADO_STOCK.SOBRE_MAXIMO));

  const alto = fila({ cantidad: 90, stockMin: 5, stockMax: 50, limitesConfigurados: true });
  assert.ok(estadosDeLaFila(alto).includes(ESTADO_STOCK.SOBRE_MAXIMO));
  assert.ok(!estadosDeLaFila(alto).includes(ESTADO_STOCK.BAJO_MINIMO));

  const dentro = fila({ cantidad: 20, stockMin: 5, stockMax: 50, limitesConfigurados: true });
  assert.deepEqual(estadosDeLaFila(dentro), []);
});

test("EST5. MÍNIMO O MÁXIMO INDIVIDUALMENTE EN 0", () => {
  // Mínimo en 0 configurado: nada puede estar por debajo salvo un negativo.
  const minCero = fila({ cantidad: 0, stockMin: 0, stockMax: 10, limitesConfigurados: true });
  assert.ok(!estadosDeLaFila(minCero).includes(ESTADO_STOCK.BAJO_MINIMO));
  assert.ok(estadosDeLaFila(minCero).includes(ESTADO_STOCK.SIN_STOCK));

  const negativoConMinCero = fila({ cantidad: -2, stockMin: 0, stockMax: 10, limitesConfigurados: true });
  // Un negativo SÍ está por debajo de un mínimo de cero, y el encargo lo pide
  // expresamente: negativo sigue en el selector, y si cumple la condición
  // también pertenece a "Bajo mínimo".
  assert.ok(estadosDeLaFila(negativoConMinCero).includes(ESTADO_STOCK.BAJO_MINIMO));

  // Máximo en 0 configurado: cualquier unidad lo supera.
  const maxCero = fila({ cantidad: 1, stockMin: 0, stockMax: 0, limitesConfigurados: true });
  assert.ok(estadosDeLaFila(maxCero).includes(ESTADO_STOCK.SOBRE_MAXIMO));

  // Y uno solo configurado no arrastra al otro: sin máximo, no hay "sobre máximo".
  const soloMin = fila({ cantidad: 100, stockMin: 5, stockMax: null, limitesConfigurados: true });
  assert.ok(!estadosDeLaFila(soloMin).includes(ESTADO_STOCK.SOBRE_MAXIMO));
});

test("EST6. LOS ESTADOS SE SUPERPONEN: no son una partición", () => {
  // ── ESTO NO ES UN DEFECTO, ES LA DEFINICIÓN ─────────────────────────────
  //
  // Son cuatro controles de revisión. Sumar los cuatro números no da el total
  // del catálogo, y quien lea las cards no tiene que esperar que dé.
  const sinStockYBajo = fila({ cantidad: 0, stockMin: 5, stockMax: 50, limitesConfigurados: true });
  const e = estadosDeLaFila(sinStockYBajo);
  assert.ok(e.includes(ESTADO_STOCK.SIN_STOCK));
  assert.ok(e.includes(ESTADO_STOCK.BAJO_MINIMO));
  assert.equal(e.length, 2, "un producto sin stock y bajo mínimo tiene que estar en las DOS");
});

test("EST7. SIN STOCK ES CERO EXACTO, y el negativo no se disfraza", () => {
  assert.ok(estadosDeLaFila(fila({ cantidad: 0 })).includes(ESTADO_STOCK.SIN_STOCK));
  assert.ok(
    !estadosDeLaFila(fila({ cantidad: -3 })).includes(ESTADO_STOCK.SIN_STOCK),
    "un stock negativo se contó como 'sin stock' y perdió su propia alerta"
  );
});

test("EST8. LA CONDICIÓN SQL SOBREVIVE AL LEFT JOIN", () => {
  // ── POR QUÉ IMPORTA, Y CÓMO SE SEPARABAN LAS DOS CONSULTAS ──────────────
  //
  // El universo es `ProductoLocal`, no `StockLocal`: un producto puede no tener
  // fila de stock todavía. Con un LEFT JOIN, todas las columnas de `sl` vienen
  // en NULL, y `sl."cantidad" = 0` sobre un NULL da NULL —o sea, no cuenta—.
  //
  // Sin el COALESCE, un producto sin fila quedaba FUERA de "Sin stock" en el
  // conteo y ADENTRO en el listado, que usa `stock: { none: {} }`. La card y la
  // lista discrepaban exactamente en los productos recién creados.
  const cond = condicionesSql("sl");
  assert.match(cond["sin-stock"], /COALESCE/, "sin COALESCE, un producto sin fila no cuenta como sin stock");

  // Los tres que miran `limitesConfiguradosAt` no necesitan COALESCE: un NULL de
  // LEFT JOIN ya significa "nunca configurado", que es la respuesta correcta.
  assert.match(cond["limites-sin-ajustar"], /"limitesConfiguradosAt" IS NULL/);
  assert.match(cond["bajo-minimo"], /"limitesConfiguradosAt" IS NOT NULL/);
  assert.match(cond["sobre-maximo"], /"limitesConfiguradosAt" IS NOT NULL/);

  // Y NINGUNA mira los valores para decidir si están configurados: eso volvería
  // a confundir un cero deliberado con una fila recién creada.
  for (const id of IDS_ESTADO) {
    assert.doesNotMatch(
      cond[id],
      /"stockMin"\s*>\s*0|"stockMax"\s*>\s*0/,
      `${id} volvió a deducir "configurado" desde los valores`
    );
  }
});

test("EST9. EL ALIAS SE APLICA A TODAS LAS COLUMNAS", () => {
  // Si una columna quedara sin alias, la consulta con LEFT JOIN sería ambigua o
  // apuntaría a la tabla equivocada — y fallaría en Postgres, no acá.
  const cond = condicionesSql("xx");
  for (const id of IDS_ESTADO) {
    assert.match(cond[id], /xx\./, `${id} no usa el alias recibido`);
    assert.doesNotMatch(cond[id], /(?<!xx)\."stock(Min|Max)"/, `${id} tiene una columna sin alias`);
  }
  // Un alias con basura no se interpola: es lo único que entra por parámetro.
  assert.match(condicionesSql("a; DROP TABLE x")["sin-stock"], /aDROPTABLEx/);
});

test("EST10. LOS DOS QUE NO SE PUEDEN EN PRISMA SON LOS QUE COMPARAN COLUMNAS", () => {
  // `cantidad < stockMin` compara dos columnas de la misma fila y el `where` de
  // Prisma no lo expresa. Ése es el motivo real por el que el filtro "faltantes"
  // que ya existía traía el catálogo a memoria.
  const p = condicionesPrisma();
  assert.equal(p["bajo-minimo"].necesitaSql, true);
  assert.equal(p["sobre-maximo"].necesitaSql, true);

  // Y los dos que SÍ se pueden entran en la consulta paginada, sin un IN con
  // miles de ids. El caso grande —"límites sin ajustar", hoy 3.945 de 4.008— es
  // justamente uno de éstos.
  assert.ok(p["sin-stock"].prisma, "sin-stock dejó de resolverse en la consulta paginada");
  assert.ok(p["limites-sin-ajustar"].prisma, "limites-sin-ajustar pasó a necesitar un IN gigante");

  // Los dos de Prisma contemplan al producto SIN fila de stock, igual que la
  // condición SQL. Si uno de los dos lo olvidara, la card y la lista se separan.
  assert.match(JSON.stringify(p["sin-stock"].prisma), /"none"/);
  assert.match(JSON.stringify(p["limites-sin-ajustar"].prisma), /"none"/);
});

test("EST11. LO QUE LLEGA POR LA URL SE VALIDA CONTRA EL DOMINIO", () => {
  for (const id of IDS_ESTADO) assert.equal(esEstadoValido(id), true);
  assert.equal(esEstadoValido("faltantes"), false, "aceptó un id que no es de estas cards");
  assert.equal(esEstadoValido(""), false);
  assert.equal(esEstadoValido(null), false);
  assert.equal(esEstadoValido("limites-sin-ajustar; DROP TABLE"), false);
});

test("EST12. CONTEO Y LISTADO PIDEN LA CONDICIÓN AL MISMO LUGAR", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE NO ROMPE NADA ────────────────────────────
  //
  // Si el resumen escribiera su SQL y el listado su `where`, podrían divergir sin
  // que fallara ninguna consulta: la card diría un número y la lista otro. Se
  // afirma que los dos IMPORTAN del módulo en vez de escribir la condición.
  const resumen = leer("app/api/stock_locales/resumen/route.js");
  const listar = leer("app/api/stock_locales/listar/route.js");

  assert.match(resumen, /from "@\/lib\/stock\/estadosDeStock"/, "el resumen no usa el módulo del dominio");
  assert.match(listar, /from "@\/lib\/stock\/estadosDeStock"/, "el listado no usa el módulo del dominio");
  assert.match(resumen, /condicionesSql/);
  assert.match(listar, /condicionesPrisma|condicionesSql/);

  // Y el resumen cuenta sobre el MISMO universo que el listado: ProductoLocal
  // activo, base activa y sin combos. Contar sobre `StockLocal` a secas se
  // separaba por los dos lados a la vez.
  assert.match(resumen, /FROM "ProductoLocal" pl/, "el resumen volvió a contar sobre StockLocal");
  assert.match(resumen, /LEFT JOIN "StockLocal"/);
  assert.match(resumen, /pb\."es_combo" = false/, "el resumen cuenta combos, que el listado no muestra");
  assert.match(resumen, /pl\."activo" = true/);
});

test("EST13. EL RESUMEN NO DESCARGA PRODUCTOS PARA CONTAR", () => {
  // ── ESTABA PROHIBIDO EXPRESAMENTE, Y YA HABÍA UN PRECEDENTE ─────────────
  //
  // El filtro `faltantes` de `listar` traía el conjunto completo a memoria antes
  // de paginar. Cuatro cards alimentadas así habrían sido cuatro barridos del
  // catálogo por cada entrada a la pantalla.
  const resumen = leer("app/api/stock_locales/resumen/route.js");

  assert.match(resumen, /COUNT\(\*\) FILTER \(WHERE/, "el resumen dejó de agregar en Postgres");
  // Los cuatro conteos, en UNA sola pasada.
  assert.equal(
    (resumen.match(/COUNT\(\*\) FILTER \(WHERE/g) || []).length,
    4,
    "no son cuatro conteos agregados en la misma consulta"
  );
  assert.doesNotMatch(resumen, /findMany/, "el resumen trae filas en vez de contar");
  assert.doesNotMatch(resumen, /\.map\(\s*\(?\s*p\s*\)?\s*=>/, "el resumen clasifica en JavaScript");
});
