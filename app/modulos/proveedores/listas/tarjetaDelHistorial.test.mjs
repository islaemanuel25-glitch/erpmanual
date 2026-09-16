// LA TARJETA DEL HISTORIAL NO PUEDE MENTIR SOBRE SI YA SE ESCRIBIERON COSTOS.
//
// ── EL DEFECTO QUE ATAJAN ──────────────────────────────────────────────────
//
// La tapa del historial mostraba `listoParaActualizar`, que es un contador de
// FILAS congelado en la cabecera al conciliar. Aplicar NO cambia el estado de la
// fila —marca `aplicada`—, así que las ya aplicadas seguían contando: la tarjeta
// decía "287 listos para aplicar" sobre una lista que ya había escrito 279
// costos. Dos números distintos para la misma pregunta, y el de la tapa era el
// que se veía primero.
//
// ── POR QUÉ SE EJERCE LA FUNCIÓN Y NO SE LEE EL JSX ────────────────────────
//
// Porque lo que hay que defender es una CADENA DE CASOS, y leer el fuente
// afirmaría que las ramas están escritas, no que la de arriba no tape a la de
// abajo. El orden es justamente lo que se rompió.
//
// ── Y DE DÓNDE SALEN ESTOS DATOS ───────────────────────────────────────────
//
// De los dos campos que el endpoint manda, no de un fixture "razonable" escrito
// a mano. El último candado comprueba esa unión: un candado montado sobre un
// dato que el endpoint nunca manda queda verde para siempre y no cubre nada.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { lineaDeEstado, quedoAMedias } from "@/app/modulos/proveedores/listas/page";
import { ESTADOS_A_MEDIAS } from "@/lib/proveedores/listas/persistencia";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");
// Los comentarios se sacan ANTES de mirar: este archivo explica el defecto con
// las mismas palabras que busca. Ya pasó tres veces en este repo.
const leer = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

test("una lista que ya aplicó costos NUNCA dice «listos para aplicar»", () => {
  // ÉSTE ES EL CASO QUE SE ROMPIÓ, con los números que se vieron en pantalla.
  const linea = lineaDeEstado({
    estado: "PARCIALMENTE_APLICADA",
    productosListos: 8,
    productosActualizados: 279,
  });
  assert.ok(!linea.texto.includes("listos para aplicar"), `dijo: ${linea.texto}`);
  assert.match(linea.texto, /^Aplicada · 8 para revisar$/);
  assert.equal(linea.tono, "sunmi-text-warning");
});

test("lo que todavía no se aplicó sí invita a aplicar, y en verde", () => {
  const linea = lineaDeEstado({ estado: "CONCILIADA", productosListos: 850, productosActualizados: 0 });
  assert.equal(linea.texto, "850 listos para aplicar");
  assert.equal(linea.tono, "sunmi-text-success");
});

test("terminada y cancelada dicen lo que pasó, no lo que se puede hacer", () => {
  const t = lineaDeEstado({ estado: "TERMINADA", productosListos: 3, productosActualizados: 942 });
  assert.equal(t.texto, "Terminada · 942 actualizados");
  assert.equal(t.tono, "sunmi-text-muted");

  // Y con listos > 0 TERMINADA sigue siendo terminada: la rama de "queda
  // trabajo" no puede colarse sobre una lista cerrada.
  assert.ok(!t.texto.includes("para revisar"));

  const c = lineaDeEstado({ estado: "CANCELADA", productosListos: 500, productosActualizados: 0 });
  assert.equal(c.texto, "Cancelada");
});

test("el singular no queda mal escrito", () => {
  assert.equal(lineaDeEstado({ estado: "CONCILIADA", productosListos: 1 }).texto, "1 listo para aplicar");
  assert.equal(
    lineaDeEstado({ estado: "TERMINADA", productosActualizados: 1 }).texto,
    "Terminada · 1 actualizado"
  );
});

test("sin nada para aplicar se dice, no se muestra un cero en verde", () => {
  const linea = lineaDeEstado({ estado: "CONCILIADA", productosListos: 0, productosActualizados: 0 });
  assert.equal(linea.texto, "Sin nada para aplicar");
  assert.equal(linea.tono, "sunmi-text-muted");
});

test("«quedó a medias» usa la MISMA lista de estados que el filtro del servidor", () => {
  // No es una lista escrita al lado: si el día de mañana aparece un estado
  // nuevo, la pantalla y el chip tienen que moverse juntos o el chip diría 3 y
  // la sección de arriba mostraría 2.
  for (const e of ESTADOS_A_MEDIAS) assert.equal(quedoAMedias({ estado: e }), true, e);
  assert.equal(quedoAMedias({ estado: "TERMINADA" }), false);
  assert.equal(quedoAMedias({ estado: "CANCELADA" }), false);
  assert.equal(quedoAMedias({}), false);

  const ruta = leer("app/modulos/proveedores/listas/page.jsx");
  assert.match(ruta, /ESTADOS_A_MEDIAS/, "la pantalla tiene que importar la constante, no copiarla");
});

test("los dos campos que la tarjeta lee son los que el endpoint manda", () => {
  // CONTRA EL DEFECTO QUE MÁS SE REPITE: un candado montado sobre un dato que el
  // endpoint nunca manda queda verde para siempre. Acá se comprueba la unión.
  const endpoint = leer("app/api/proveedores/listas/route.js");
  assert.match(endpoint, /productosListos:/, "el endpoint tiene que mandar productosListos");
  assert.match(endpoint, /productosActualizados:/, "el endpoint tiene que mandar productosActualizados");

  // Y QUE SE CUENTEN EN LA BASE, SIN DUPLICADOS. Contar filas de la importación
  // cuenta dos veces el producto que aparece repetido en el archivo; contar
  // `productoBase` cuenta productos, que es lo que la tarjeta dice.
  assert.match(
    endpoint,
    /prisma\.productoBase\.count\(\{\s*where:\s*whereDelGrupo\(GRUPO_PRODUCTO\.LISTO_PARA_APLICAR/,
    "los listos se cuentan sobre productos en la base, con el mismo predicado que el detalle"
  );
  assert.match(
    endpoint,
    /prisma\.productoBase\.count\(\{\s*where:\s*whereDelGrupo\(GRUPO_PRODUCTO\.ACTUALIZADO/,
    "los actualizados se cuentan sobre productos en la base"
  );
});

test("la pantalla tiene rama para el error, no solo para el caso bueno", () => {
  // INC-0006: `app/modulos/proveedores/page.jsx` preguntaba por el caso bueno y
  // no tenía rama para el malo, así que un 500 se veía igual que un botón que no
  // hace nada. Las tres pantallas nuevas de este módulo tienen que mostrarlo.
  for (const p of [
    "app/modulos/proveedores/listas/page.jsx",
    "app/modulos/proveedores/listas/[id]/page.jsx",
    "app/modulos/proveedores/listas/[id]/revisar/page.jsx",
  ]) {
    const fuente = leer(p);
    assert.match(fuente, /setError\(/, `${p} no guarda el error`);
    assert.match(fuente, /ErrorRecuperable|\{error &&|if \(error\)/, `${p} no dibuja el error`);
  }
});
