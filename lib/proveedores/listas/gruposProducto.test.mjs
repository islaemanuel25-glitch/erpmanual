// La pantalla dada vuelta: en qué situación está cada PRODUCTO.
//
// Lo que se protege:
//   · que las situaciones sean EXCLUYENTES y CUBRAN el universo — si no cubren,
//     hay productos que no aparecen en ninguna card y nadie los mira;
//   · que el `where` que va a Postgres diga lo mismo que el predicado;
//   · que "sin código" signifique lo que dice: sigue con el precio viejo POR no
//     tener código, no cualquier producto sin código.

import test from "node:test";
import assert from "node:assert/strict";

import {
  GRUPO_PRODUCTO,
  TEXTO_GRUPO,
  DETALLE_GRUPO,
  esPrecioViejo,
  grupoDeProducto,
  whereDelGrupo,
  coberturaDeGrupos,
  titularDeCatalogo,
} from "./gruposProducto.js";

// ── El reparto ──────────────────────────────────────────────────────────────

test("1. aplicada le gana a todo: el costo ya se escribió", () => {
  // Aunque otra fila del mismo producto siga en la cola. Escribir un costo no se
  // deshace porque quede otra fila por mirar.
  const g = grupoDeProducto({ tieneFilaAplicada: true, tieneFilaEnCola: true, tieneFila: true });
  assert.equal(g, GRUPO_PRODUCTO.ACTUALIZADO);
});

test("2. con fila en la cola y sin aplicar: necesita decisión", () => {
  assert.equal(
    grupoDeProducto({ tieneFilaEnCola: true, tieneFila: true }),
    GRUPO_PRODUCTO.NECESITA_DECISION
  );
});

test("3. con fila, sin aplicar y fuera de la cola: LISTO PARA APLICAR", () => {
  // Éste es el grupo que los cuatro de la pantalla no cubren. Hoy está vacío
  // porque la importación #3 ya se aplicó casi entera; el día que se importe una
  // lista nueva va a ser el más grande.
  assert.equal(grupoDeProducto({ tieneFila: true }), GRUPO_PRODUCTO.LISTO_PARA_APLICAR);
});

test("4. sin filas y con código: la lista no lo trajo", () => {
  assert.equal(
    grupoDeProducto({ tieneCodigoActivo: true }),
    GRUPO_PRODUCTO.NO_TRAIDO
  );
});

test("5. sin filas y sin código: no hubo forma de reconocerlo", () => {
  assert.equal(grupoDeProducto({}), GRUPO_PRODUCTO.SIN_CODIGO);
});

test("6. un producto SIN código que igual macheó no va a la card de sin código", () => {
  // Machea por código de barras. Está actualizado o pendiente según corresponda,
  // y contarlo como "sin código" diría que sigue con el precio viejo cuando no.
  // Es la diferencia con la card de hoy, que cuenta 58 sobre todo el universo.
  assert.equal(
    grupoDeProducto({ tieneFila: true, tieneFilaAplicada: true, tieneCodigoActivo: false }),
    GRUPO_PRODUCTO.ACTUALIZADO
  );
  assert.equal(
    grupoDeProducto({ tieneFila: true, tieneFilaEnCola: true, tieneCodigoActivo: false }),
    GRUPO_PRODUCTO.NECESITA_DECISION
  );
});

test("7. los dos que responden 'sigue con el precio viejo'", () => {
  assert.equal(esPrecioViejo(GRUPO_PRODUCTO.SIN_CODIGO), true);
  assert.equal(esPrecioViejo(GRUPO_PRODUCTO.NO_TRAIDO), true);
  assert.equal(esPrecioViejo(GRUPO_PRODUCTO.ACTUALIZADO), false);
  assert.equal(esPrecioViejo(GRUPO_PRODUCTO.LISTO_PARA_APLICAR), false);
  // Un discontinuado NO sigue con el precio viejo como problema: ya se decidió
  // que el proveedor dejó de traerlo. Contarlo ahí sería pedir por segunda vez
  // una decisión que alguien ya tomó.
  assert.equal(esPrecioViejo(GRUPO_PRODUCTO.DISCONTINUADO), false);
});

// ── Discontinuado = el vínculo dado de baja ─────────────────────────────────
//
// Marcar un producto como discontinuado NO crea una columna: se da de baja el
// vínculo, que ya existe y ya tiene el concepto. Eso obliga a distinguirlo de
// "sin código", porque los dos llegan sin código ACTIVO por caminos opuestos.

test("7b. con el código dado de baja: discontinuado, no 'sin código'", () => {
  // Sin esta distinción, la pantalla diría "no sabemos con qué código lo llama
  // el proveedor" sobre un producto que alguien ya resolvió. Lo contrario de lo
  // que pasó.
  assert.equal(
    grupoDeProducto({ tieneCodigoActivo: false, tieneCodigoDadoDeBaja: true }),
    GRUPO_PRODUCTO.DISCONTINUADO
  );
  assert.equal(
    grupoDeProducto({ tieneCodigoActivo: false, tieneCodigoDadoDeBaja: false }),
    GRUPO_PRODUCTO.SIN_CODIGO
  );
});

test("7c. un código ACTIVO le gana a uno dado de baja", () => {
  // El proveedor le cambió el código: el viejo quedó de baja y el nuevo activo.
  // Ese producto no está discontinuado, simplemente esta lista no lo trajo.
  assert.equal(
    grupoDeProducto({ tieneCodigoActivo: true, tieneCodigoDadoDeBaja: true }),
    GRUPO_PRODUCTO.NO_TRAIDO
  );
});

test("7d. dar de baja el código no revive un producto que la lista SÍ trajo", () => {
  // Con filas, el grupo lo decide la fila. La baja del vínculo solo habla de los
  // que siguen con el precio viejo.
  assert.equal(
    grupoDeProducto({ tieneFila: true, tieneFilaAplicada: true, tieneCodigoDadoDeBaja: true }),
    GRUPO_PRODUCTO.ACTUALIZADO
  );
});

// ── Excluyentes y exhaustivos ───────────────────────────────────────────────

test("8. TODA combinación de hechos cae en exactamente un grupo", () => {
  const validos = new Set(Object.values(GRUPO_PRODUCTO));
  let combinaciones = 0;
  for (const aplicada of [false, true])
    for (const cola of [false, true])
      for (const fila of [false, true])
        for (const codigo of [false, true])
          for (const baja of [false, true]) {
            const g = grupoDeProducto({
              tieneFilaAplicada: aplicada, tieneFilaEnCola: cola, tieneFila: fila,
              tieneCodigoActivo: codigo, tieneCodigoDadoDeBaja: baja,
            });
            combinaciones++;
            assert.ok(validos.has(g), `combinación sin grupo: ${JSON.stringify({ aplicada, cola, fila, codigo, baja })}`);
          }
  assert.equal(combinaciones, 32);
});

test("9. la cobertura se informa, no se supone", () => {
  const completo = coberturaDeGrupos({
    universo: 376,
    porGrupo: { ACTUALIZADO: 279, NECESITA_DECISION: 7, LISTO_PARA_APLICAR: 0, SIN_CODIGO: 40, NO_TRAIDO: 50 },
  });
  assert.equal(completo.suma, 376);
  assert.equal(completo.cierra, true);
  assert.equal(completo.faltante, 0);

  // Si falta uno, se dice. Un resumen que no cierra esconde un producto que
  // nadie va a mirar.
  const roto = coberturaDeGrupos({ universo: 376, porGrupo: { ACTUALIZADO: 279 } });
  assert.equal(roto.cierra, false);
  assert.equal(roto.faltante, 97);
});

test("10. cada grupo tiene título y explicación", () => {
  for (const g of Object.values(GRUPO_PRODUCTO)) {
    assert.ok(TEXTO_GRUPO[g]?.length > 3, `${g} sin título`);
    assert.ok(DETALLE_GRUPO[g]?.length > 15, `${g} sin explicación`);
  }
});

// ── El `where` dice lo mismo que el predicado ───────────────────────────────
//
// Son dos implementaciones de la misma regla y no hay forma de evitarlo:
// Postgres no puede llamar a `grupoDeProducto`. Este candado las compara sobre
// las 16 combinaciones posibles, con un intérprete que entiende solo los
// operadores que el filtro usa.

const COLA = { estado: { in: ["NO_MACHEADO"] } };

/** Evalúa el `where` de un grupo contra un producto en memoria. */
function evaluar(where, p) {
  return Object.entries(where).every(([clave, cond]) => {
    if (clave === "NOT") {
      const lista = Array.isArray(cond) ? cond : [cond];
      return lista.every((c) => !evaluar(c, p));
    }
    if (clave === "filasImportacionLista") {
      if (cond.none) return !p.tieneFila;
      if (cond.some) {
        // Se distingue por lo que pide el `some`: aplicada, la cola, o cualquiera.
        if (cond.some.aplicada === true) return p.tieneFilaAplicada;
        if (cond.some.estado !== undefined) return p.tieneFilaEnCola;
        return p.tieneFila;
      }
      return true;
    }
    if (clave === "codigosProveedor") {
      if (cond.some) return cond.some.activo === false ? p.tieneCodigoDadoDeBaja : p.tieneCodigoActivo;
      if (cond.none) return !p.tieneCodigoActivo;
      return true;
    }
    if (clave === "universo") return true;
    throw new Error(`operador desconocido en el where del grupo: ${clave}`);
  });
}

test("11. el where de cada grupo dice lo mismo que grupoDeProducto", () => {
  let combinaciones = 0;
  for (const tieneFilaAplicada of [false, true])
    for (const tieneFilaEnCola of [false, true])
      for (const tieneFila of [false, true])
        for (const tieneCodigoActivo of [false, true])
        for (const tieneCodigoDadoDeBaja of [false, true]) {
          // Los hechos tienen que ser coherentes entre sí: no hay fila aplicada
          // ni fila en la cola sin que haya fila.
          if ((tieneFilaAplicada || tieneFilaEnCola) && !tieneFila) continue;
          const p = { tieneFilaAplicada, tieneFilaEnCola, tieneFila, tieneCodigoActivo, tieneCodigoDadoDeBaja };
          const esperado = grupoDeProducto(p);
          combinaciones++;

          for (const g of Object.values(GRUPO_PRODUCTO)) {
            const w = whereDelGrupo(g, { universoWhere: { universo: true }, importacionId: 3, proveedorId: 9, filtroCola: COLA });
            assert.equal(
              evaluar(w, p),
              g === esperado,
              `${g} contra ${JSON.stringify(p)} — esperado ${esperado}`
            );
          }
        }
  assert.ok(combinaciones >= 10, `se probaron pocas combinaciones: ${combinaciones}`);
});

// ── El titular cambia con el estado ─────────────────────────────────────────

test("12. recién importada: el titular habla de lo que hay para actualizar", () => {
  const t = titularDeCatalogo({ universo: 376, porGrupo: { LISTO_PARA_APLICAR: 280, NECESITA_DECISION: 7 } });
  assert.match(t.titulo, /280 productos listos para actualizar/);
  assert.match(t.titulo, /7 necesitan que decidas/);
});

test("13. aplicada: el titular pasa a hablar del precio viejo", () => {
  const t = titularDeCatalogo({
    universo: 376,
    porGrupo: { ACTUALIZADO: 279, LISTO_PARA_APLICAR: 0, NECESITA_DECISION: 0, SIN_CODIGO: 56, NO_TRAIDO: 31 },
  });
  assert.match(t.titulo, /Actualizaste 279 de 376/);
  assert.match(t.titulo, /87 productos siguieron con el precio viejo/);
});

test("14. los discontinuados NO entran en el titular", () => {
  // Ya se resolvieron. Sumarlos pediría por segunda vez una decisión tomada.
  const sin = titularDeCatalogo({ universo: 376, porGrupo: { ACTUALIZADO: 279, SIN_CODIGO: 56, NO_TRAIDO: 31 } });
  const con = titularDeCatalogo({ universo: 376, porGrupo: { ACTUALIZADO: 279, SIN_CODIGO: 56, NO_TRAIDO: 31, DISCONTINUADO: 3 } });
  assert.equal(con.titulo, sin.titulo);
});

test("15. con todo actualizado el titular lo dice y no muestra un cero", () => {
  const t = titularDeCatalogo({ universo: 376, porGrupo: { ACTUALIZADO: 376 } });
  assert.match(t.titulo, /Actualizaste los 376/);
  assert.equal(t.tono, "sunmi-text-success");
});

test("16. singular y plural", () => {
  const uno = titularDeCatalogo({ universo: 1, porGrupo: { LISTO_PARA_APLICAR: 1 } });
  assert.match(uno.titulo, /1 producto listo para actualizar/);
  assert.ok(!/productos listos/.test(uno.titulo));
  const dec = titularDeCatalogo({ universo: 5, porGrupo: { NECESITA_DECISION: 1 } });
  assert.match(dec.titulo, /1 producto esperando/);
});
