// LO QUE SE HIZO EN LA RECEPCIÓN SOBREVIVE A UN REFRESCO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/compras-proveedor/recepcion/laRecepcionSobreviveAlRefresco.test.mjs
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// En el pedido 242, Emanuel marcaba revisados, decidía precios y corregía
// cantidades, y al refrescar la página perdía lo hecho.
//
// Medido contra producción el 2026-09-22, renglón por renglón, qué sobrevivía
// a un refresco SIN lectura de por medio:
//
//   · revisado ................ SÍ, en `ComprobanteLinea.revisadoEnRecepcion`
//   · decisión de precio ...... SÍ, en su propia tabla
//   · vinculación ............. SÍ, en `ComprobanteLinea.productoLocalId`
//   · cantidad corregida ...... a medias: `sessionStorage`, que muere con la pestaña
//   · kilos ................... a medias: el mismo `sessionStorage`
//   · sueltas ................. NO
//   · unidades que entran ..... NO
//   · motivo de la diferencia . NO
//   · por unidad o por bulto .. NO
//
// Las cinco que no sobrevivían tienen columna y se escriben al tocarlas. Este
// candado se pone rojo si alguna vuelve a vivir solo en la memoria.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const codigoDe = (rel) =>
  leer(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const RUTA = "app/api/compras-proveedor/recepcion/correccion/route.js";
const PAGINA = "app/modulos/compras-proveedor/[id]/page.jsx";
const ESQUEMA = "prisma/schema.prisma";

/**
 * ¿ESTE MODELO TIENE ESTA COLUMNA?
 *
 * ── POR QUÉ ESTO Y NO UN `assert.match` SOBRE EL ARCHIVO ────────────────
 *
 * Porque un `match` contesta "la palabra está en alguna parte", y eso dio
 * VERDE el 2026-09-22 sobre una columna escrita en el modelo EQUIVOCADO:
 * `unidadElegida` había quedado en `TransferenciaDetalle` en vez de
 * `ComprobanteLinea`. El candado pasó, el build pasó, la migración creó la
 * columna en la tabla correcta, y el cliente de Prisma quedó pidiéndosela a
 * otra tabla — o sea que todo lo que leyera una transferencia se habría caído
 * en producción con un P2022. Lo atrapó ejercer la consulta contra la base,
 * ya con la migración aplicada y antes de recrear la aplicación.
 *
 * Y no sirve preguntar "en qué modelo está": `cantidadRecibida`, `origen` y
 * `motivoPrincipal` están en varios. Una columna tiene TABLA, y la pregunta se
 * hace de a un par.
 */
function tieneColumna(modelo, columna) {
  const texto = leer(ESQUEMA);
  const i = texto.indexOf(`\nmodel ${modelo} {`);
  if (i < 0) return false;
  const cuerpo = texto.slice(i, texto.indexOf("\n}", i));
  return new RegExp(`\\n\\s+${columna}\\s`).test(cuerpo);
}

test("LAS COLUMNAS EXISTEN, EN SU TABLA, Y LA QUE FALTABA TAMBIÉN", () => {
  for (const columna of [
    "cantidadRecibida", "unidadesSueltas", "kgRecibidos", "motivoPrincipal", "motivoDetalle",
    // La que no existía: las unidades que la hoja dijo que entran al stock. Sin
    // ella, después de un refresco el cierre vuelve a DEDUCIR la escala, que
    // sobre la hamburguesa del 242 daba 3 en vez de 90.
    "unidadesFisicas",
  ]) {
    assert.ok(tieneColumna("PedidoProveedorDetalle", columna), `falta ${columna} en la línea del pedido`);
  }
  assert.match(leer(ESQUEMA), /unidadesFisicas\s+Decimal\?\s+@db\.Decimal\(12, 3\)/);

  // La elección de unidad es del renglón del PAPEL y no de la línea del pedido:
  // dos renglones pueden apuntar a la misma línea.
  assert.ok(tieneColumna("ComprobanteLinea", "unidadElegida"), "la elección de unidad quedó en otra tabla");
  assert.ok(!tieneColumna("TransferenciaDetalle", "unidadElegida"), "quedó una copia en la tabla equivocada");

  // Y el origen de una lectura es de la llamada al lector.
  assert.ok(tieneColumna("LlamadaLector", "origen"));
});

test("Y CADA COLUMNA DE LA MIGRACIÓN CAE EN LA TABLA QUE DICE EL ESQUEMA", () => {
  // La contraprueba del caso de arriba, del otro lado: el SQL nombra la tabla y
  // el esquema nombra el modelo, y los dos tienen que decir lo mismo. Con una
  // columna en el modelo equivocado esto se pone rojo, que es lo único que
  // separa "la columna está" de "la columna está donde va".
  const sql = leer("prisma/migrations/20260922040000_recepcion_sobrevive_al_refresco/migration.sql");
  const pares = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g)];
  assert.equal(pares.length, 3, "la migración dejó de crear tres columnas");
  for (const [, tabla, columna] of pares) {
    assert.ok(tieneColumna(tabla, columna), `la migración crea ${columna} en ${tabla} y el esquema no la tiene ahí`);
  }
});

test("LA RUTA GUARDA LAS SEIS COSAS, Y NINGUNA MUEVE STOCK", () => {
  const ruta = codigoDe(RUTA);
  for (const campo of [
    "cantidadRecibida",
    "unidadesSueltas",
    "unidadesFisicas",
    "kgRecibidos",
    "motivoPrincipal",
    "motivoDetalle",
  ]) {
    assert.match(ruta, new RegExp(`"${campo}" in body`), `la ruta no guarda ${campo}`);
  }
  assert.match(ruta, /unidadElegida: String\(body\.unidadElegida\)/);

  // ── LO QUE ESTA RUTA NO PUEDE HACER ────────────────────────────────
  //
  // Guardar lo contado es un borrador de trabajo. Mover stock y escribir
  // costos es otra cosa, pasa una sola vez y vive en `recibir/[id]`. Si algún
  // día esto empieza a tocar stock, hay dos caminos que mueven stock y el día
  // que uno cambie el otro queda viejo.
  for (const prohibido of ["stockLocal", "precio_costo", "movimientoStock", "estado: \"RECIBIDO\""]) {
    assert.ok(!ruta.includes(prohibido), `la ruta de guardar el borrador toca ${prohibido}`);
  }

  // El alcance y el permiso, como las otras rutas del módulo.
  assert.match(ruta, /pedido: \{ id: pedidoId, grupoId \}/);
  assert.match(ruta, /checkPerm\(session, "compras\.recibir"\)/);
  // Un pedido ya recibido no se sigue corrigiendo.
  assert.match(ruta, /estado === "RECIBIDO"/);
  // Y no manda mensajes de adentro.
  assert.ok(!/No existe esa línea|Error interno/.test(ruta));
});

test("UN CAMPO QUE NO VINO NO BORRA LO QUE YA ESTABA", () => {
  // `"campo" in body` y no `body.campo ?? null`: guardar la hoja sin tocar los
  // kilos no puede poner en null unos kilos que alguien cargó antes.
  const ruta = codigoDe(RUTA);
  assert.ok(
    !/aGuardar\.\w+ = body\.\w+ \?\? null/.test(ruta),
    "un campo ausente estaría borrando lo guardado"
  );
});

test("LA PANTALLA ESCRIBE AL GUARDAR LA HOJA Y LEE AL ABRIR", () => {
  const pagina = codigoDe(PAGINA);
  // Escribe.
  assert.match(pagina, /fetch\("\/api\/compras-proveedor\/recepcion\/correccion"/);
  assert.match(pagina, /guardarEnLaBase\(datos\);/);
  // Y lee: sin esto la pantalla vuelve vacía aunque la base tenga todo.
  assert.match(pagina, /d\.unidadesSueltas != null/);
  assert.match(pagina, /d\.unidadesFisicas != null/);
  assert.match(pagina, /d\.motivoPrincipal/);
  assert.match(pagina, /setSueltas\(sue\)/);
  assert.match(pagina, /setFisicas\(fis\)/);
  assert.match(pagina, /setMotivos\(mot\)/);
});

test("Y LA ELECCIÓN DE UNIDAD SE GUARDA Y SE VUELVE A LEER", () => {
  // Llegaba, se usaba para la cuenta de esa llamada y se tiraba.
  const aceptar = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(aceptar, /data: \{ unidadElegida: String\(body\.unidad\) \}/);
  assert.match(aceptar, /unidadElegida: body\?\.unidad \?\? linea\.unidadElegida/);
  // La conciliación la trae y el análisis la usa, así que sobrevive al refresco
  // para las dos pantallas y no solo para la que la eligió.
  const conciliacion = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(conciliacion, /unidadElegida: true/);
  const analisis = codigoDe("lib/compras-proveedor/comprobante/analisisDeComprobante.js");
  assert.match(analisis, /unidadElegida: l\.unidadElegida \?\? undefined/);
});

test("UNA LECTURA DICE QUIÉN LA PIDIÓ, Y NINGUNA ARRANCA SOLA", () => {
  // ── LA REGLA ────────────────────────────────────────────────────────
  //
  // Una lectura reescribe los renglones del comprobante. Solo corre cuando una
  // persona la pide: el botón, subir una foto, o la relectura de la receta.
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /async function leer\(id, origen = ORIGEN_DE_LECTURA\.BOTON\)/);
  assert.match(panel, /leer\(nuevos\[0\], ORIGEN_DE_LECTURA\.AL_SUBIR\)/);
  // Y no hay ningún efecto que llame a leer al montar la pantalla.
  assert.ok(
    !/useEffect\([^)]*\n?[^}]*\bleer\(/.test(panel),
    "hay un efecto que dispara una lectura al montar la pantalla"
  );
  // La relectura después de guardar la explicación de un tipo de papel.
  const recetas = codigoDe("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(recetas, /origen: ORIGEN_DE_LECTURA\.RECETA/);
  // La prueba de la receta se declara aparte: es la que NO reescribe renglones.
  const explicacion = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(explicacion, /origen: ORIGEN_DE_LECTURA\.PRUEBA_DE_RECETA/);
  // Y la ruta de lectura guarda lo que le declararon.
  const lectura = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(lectura, /origen: origenPedido/);
  assert.match(lectura, /origenDeLectura\(/);
});

test("LOS CAMINOS QUE LLAMAN AL LECTOR ESTÁN CONTADOS", () => {
  // ── EL CENSO CAMBIÓ DE PALABRA, NO DE CRITERIO ────────────────────────
  //
  // Buscaba la URL `comprobantes/leer/` escrita en las pantallas. Ya no está
  // escrita ahí: la espera del turno se mudó a `leerConTurno.js`, porque las
  // dos pantallas la necesitaban igual y dos copias se separan.
  //
  // Si el candado se hubiera dejado buscando la URL, habría quedado en VERDE
  // encontrando cero archivos y afirmando nada — que es el defecto que este
  // repo ya vio varias veces. Se busca lo que hoy señala el camino: quién
  // importa `pedirLaLectura`.
  const salida = execSync(
    'git grep -l --untracked "pedirLaLectura" -- "app/**/*.jsx" "components/**/*.jsx" || true',
    { cwd: RAIZ, encoding: "utf8" }
  );
  const archivos = salida.split("\n").map((s) => s.trim()).filter(Boolean).sort();
  // ── CRECIÓ A DOS MÁS, 2026-09-23, Y ES PARA LO QUE ESTÁ ──────────────
  //
  // `ExplicacionDelPapel` es la OTRA pantalla de receta —la de la explicación
  // en castellano— y hasta hoy era la única de las dos que no ofrecía releer
  // los papeles sin recibir. Ésa es la puerta por la que Emanuel guardó la
  // receta de TDC, y por eso el comprobante del #247 se quedó con la lectura
  // vieja: la receta cambió a las 15:10 y el papel seguía leído con la de
  // antes.
  //
  // `CorregirComprobante` entra por el callejón sin salida: cuando no hay
  // ningún número para elegir, lo que falta no es una corrección sino la
  // lectura, y la pantalla ofrece volver a leer el papel.
  //
  // Las dos usan `pedirLaLectura` —la puerta con espera de turno— y no un
  // `fetch` suelto. Este censo se puso ROJO con la primera versión de las dos,
  // que llamaban la URL por afuera, que es exactamente lo que el segundo
  // `assert` de abajo prohíbe.
  //
  // ── Y BAJÓ A TRES, 2026-10-10 ─────────────────────────────────────────
  //
  // La lista de recetas tenía el formulario de impuestos, que al guardarse
  // ofrecía releer. Se borró con el resto del código de formato (segunda parte
  // de #165): la relectura después de guardar es la de `ExplicacionDelPapel`.
  assert.deepEqual(archivos, [
    "components/compras-proveedor/CorregirComprobante.jsx",
    "components/compras-proveedor/ExplicacionDelPapel.jsx",
    "components/comprobantes/PanelComprobantes.jsx",
  ]);

  // Y NADIE LLAMA A LA RUTA POR AFUERA. Un `fetch` suelto a la URL saltearía
  // la espera del turno: el POST contesta enseguida, así que quien no espere
  // va a creer que leyó cuando la lectura recién arrancó, y en un bucle
  // dispararía todas las lecturas a la vez contra la cuota del día.
  const porAfuera = execSync(
    'git grep -l --untracked "comprobantes/leer/" -- "app/**/*.jsx" "components/**/*.jsx" || true',
    { cwd: RAIZ, encoding: "utf8" }
  );
  assert.equal(porAfuera.trim(), "", "una pantalla llama a la ruta de leer sin esperar el turno");
});
