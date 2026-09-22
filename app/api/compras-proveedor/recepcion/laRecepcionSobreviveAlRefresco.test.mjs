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

test("LAS COLUMNAS EXISTEN, Y LA QUE FALTABA TAMBIÉN", () => {
  const esquema = leer(ESQUEMA);
  for (const columna of ["cantidadRecibida", "unidadesSueltas", "kgRecibidos", "motivoPrincipal", "motivoDetalle"]) {
    assert.match(esquema, new RegExp(`\\n\\s+${columna}\\s`), `falta ${columna} en el detalle del pedido`);
  }
  // La que no existía: las unidades que la hoja dijo que entran al stock. Sin
  // ella, después de un refresco el cierre vuelve a DEDUCIR la escala, que
  // sobre la hamburguesa del 242 daba 3 en vez de 90.
  assert.match(esquema, /unidadesFisicas\s+Decimal\?\s+@db\.Decimal\(12, 3\)/);
  // Y la elección de unidad, que es del renglón del papel y no de la línea del
  // pedido: dos renglones pueden apuntar a la misma línea.
  assert.match(esquema, /unidadElegida String\?/);
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
  const recetas = codigoDe("app/modulos/proveedores/recetas/page.jsx");
  assert.match(recetas, /origen: ORIGEN_DE_LECTURA\.RECETA/);
  // La prueba de la receta se declara aparte: es la que NO reescribe renglones.
  const explicacion = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(explicacion, /origen: ORIGEN_DE_LECTURA\.PRUEBA_DE_RECETA/);
  // Y la ruta de lectura guarda lo que le declararon.
  const lectura = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(lectura, /origen: origenPedido/);
  assert.match(lectura, /origenDeLectura\(/);
});

test("LOS TRES CAMINOS QUE LLAMAN AL LECTOR ESTÁN CONTADOS", () => {
  // Enumerado sobre el repo entero, con lo sin commitear incluido: si aparece
  // un cuarto lugar que llame a leer, este candado se pone rojo y hay que
  // decidir qué origen declara. Sin esto, el próximo camino entra sin declarar
  // nada y la columna vuelve a no contestar nada.
  const salida = execSync(
    'git grep -l --untracked "comprobantes/leer/" -- "app/**/*.jsx" "components/**/*.jsx" || true',
    { cwd: RAIZ, encoding: "utf8" }
  );
  const archivos = salida.split("\n").map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(archivos, [
    "app/modulos/proveedores/recetas/page.jsx",
    "components/comprobantes/PanelComprobantes.jsx",
  ]);
});
