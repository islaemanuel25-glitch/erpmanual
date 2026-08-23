// CANDADOS DEL BOTÓN "EDITAR" DE LA CARD DEL CELULAR.
//
// ── EL DEFECTO QUE ATAJAN ─────────────────────────────────────────────────
//
// La card mandaba TODO al editor normal: `abrirEditar(p.id ?? p.productoLocalId)`.
// Un combo terminaba en `/modulos/productos/<ProductoBase.id>/editar`, que es el
// formulario de un producto común — sin componentes, sin composición, y editando
// la ficha maestra de algo que no es un producto maestro.
//
// La tabla de ESCRITORIO ya despachaba bien: mira `row.esCombo` y llama a
// `onEditarCombo(row.localProductoId)`. El celular no tenía esa rama. O sea que
// las dos superficies de la misma pantalla hacían cosas distintas con la misma
// fila, y nada lo decía.
//
// ── POR QUÉ NO ALCANZA CON PROBAR LA FUNCIÓN ──────────────────────────────
//
// Porque el defecto no estaba en cómo navega, estaba en QUIÉN LLAMA A QUIÉN. Por
// eso estos candados miran el despacho: que exista la rama, que use el campo
// correcto y que el otro camino no pueda colarse.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");

// Los comentarios se sacan ANTES de mirar: este archivo explica el defecto con
// las mismas palabras que busca, así que sin esto los candados se pondrían
// verdes leyendo la prosa que los describe. Ya pasó tres veces en este repo.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const PAGINA = leer("app/modulos/productos/page.jsx");
const TABLA = leer("components/productos/SunmiTablaProductos.jsx");
const SERVICIO = leer("lib/combos/service.js");

test("C1. CARD DEL CELULAR + PRODUCTO NORMAL → EDITOR NORMAL", () => {
  // El camino que ya andaba y que no se puede perder al agregar la rama del
  // combo. Se afirma que el despachador existe, que la card lo usa, y que el
  // caso normal sigue yendo a `abrirEditar` con el id del ProductoBase.
  assert.match(PAGINA, /onEditar=\{\(\) => editarDesdeLaCard\(p\)\}/, "la card no usa el despachador");
  assert.match(PAGINA, /const editarDesdeLaCard = \(p\) => \{/, "no existe el despachador");
  assert.match(PAGINA, /abrirEditar\(p\.id\);/, "el producto normal ya no va al editor normal");

  // Y NO VOLVIÓ EL LLAMADO DIRECTO, que es la forma en que esto se desarma: si
  // alguien "simplifica" el despacho de vuelta a una línea, la rama del combo
  // desaparece sin que nada más se rompa.
  assert.doesNotMatch(
    PAGINA,
    /onEditar=\{\(\) => abrirEditar\(/,
    "la card volvió a llamar a abrirEditar directo, sin decidir si es combo"
  );
});

test("C2. CARD DEL CELULAR + COMBO → EDITAR-COMBO CON `localProductoId`", () => {
  // La rama nueva, y con el campo que corresponde.
  assert.match(
    PAGINA,
    /if \(p\?\.esCombo === true\) \{\s*abrirEditarCombo\(p\.localProductoId\);/,
    "el combo no se despacha a abrirEditarCombo con localProductoId"
  );

  // Y `abrirEditarCombo` lleva a la pantalla que YA existe, no a una nueva.
  assert.match(PAGINA, /router\.push\(`\/modulos\/productos\/editar-combo\/\$\{productoLocalId\}`\)/);
  assert.ok(
    fs.existsSync(path.join(RAIZ, "app/modulos/productos/editar-combo/[productoLocalId]/page.jsx")),
    "la ruta de editar combo no existe"
  );

  // Y esa pantalla usa el MISMO formulario que crear, que es lo aprobado.
  const pantalla = leer("app/modulos/productos/editar-combo/[productoLocalId]/page.jsx");
  assert.match(pantalla, /import FormCombo from "@\/components\/productos\/FormCombo"/);
  assert.match(pantalla, /<FormCombo/);
});

test("C3. JAMÁS SE IDENTIFICA UN COMBO CON `ProductoBase.id`", () => {
  // ── LA REGLA, Y POR QUÉ NO ES UNA PREFERENCIA DE NOMBRES ────────────────
  //
  // Son dos números distintos. El backend valida pertenencia al local contra
  // `ProductoLocal.id`; pasarle el del producto base no da un error de permisos,
  // da OTRA FILA o ninguna. Un combo abierto con el id equivocado no se ve como
  // un error: se ve como otro combo.
  //
  // Se afirma que la rama del combo no tiene ningún camino hacia `p.id`, ni
  // siquiera como red de seguridad — un `?? p.id` ahí sería exactamente el
  // defecto original, disfrazado de precaución.
  const rama = PAGINA.match(/const editarDesdeLaCard[\s\S]*?\n  \};/);
  assert.ok(rama, "no se encontró el despachador");
  const cuerpoCombo = rama[0].slice(0, rama[0].indexOf("return;"));
  assert.doesNotMatch(cuerpoCombo, /p\.id/, "la rama del combo puede caer en el id del producto base");

  // ── Y EL CAMPO INEXISTENTE QUE ESTABA ESCONDIDO EN LA LÍNEA VIEJA ───────
  //
  // Decía `p.id ?? p.productoLocalId`, y `p.productoLocalId` NO EXISTE: el
  // mapper produce `localProductoId`. O sea que el `??` nunca disparaba — era
  // una red que no atajaba nada y hacía creer que el caso estaba contemplado.
  const mapper = leer("lib/mappers/producto.js");
  assert.match(mapper, /localProductoId:/, "el mapper dejó de exponer localProductoId");
  assert.doesNotMatch(mapper, /productoLocalId:/, "apareció un segundo nombre para el mismo campo");
  assert.doesNotMatch(
    PAGINA,
    /p\.productoLocalId/,
    "volvió `p.productoLocalId`, que no existe en la fila"
  );
});

test("C4. LAS DOS SUPERFICIES DESPACHAN IGUAL, Y EL BACKEND SIGUE RECHAZANDO", () => {
  // ── LA MITAD DE ARRIBA ──────────────────────────────────────────────────
  //
  // El escritorio ya lo hacía bien y no se tocó. Se afirma que sigue igual: si
  // mañana alguien cambia una de las dos superficies, esto obliga a mirar la
  // otra — que es lo que faltó cuando se escribió la card.
  assert.match(
    TABLA,
    /if \(onEditarCombo && row\.localProductoId\) onEditarCombo\(row\.localProductoId\)/,
    "el escritorio cambió su forma de despachar combos"
  );
  assert.match(PAGINA, /onEditarCombo=\{abrirEditarCombo\}/, "la tabla dejó de recibir el despacho de combos");

  // ── LA MITAD DE ABAJO: LA SEGURIDAD NO SE AFLOJÓ ────────────────────────
  //
  // Este arreglo es de navegación y no toca permisos, pero el candado mira las
  // cuatro validaciones igual: son lo que impide editar el combo de otro local,
  // y un cambio de ruta es exactamente el momento en que alguien las "simplifica"
  // para que la pantalla nueva ande.
  //
  // Se afirma el CÓDIGO de cada una, no solo el texto: un 403 que pasa a 200 con
  // el mismo mensaje sería una puerta abierta con cartel de cerrada.
  assert.match(SERVICIO, /if \(!pl\) throw errCombo\("El combo no existe\.", 404\)/);
  assert.match(SERVICIO, /if \(pl\.localId !== Number\(localId\)\) throw errCombo\([^)]*, 403\)/);
  assert.match(SERVICIO, /if \(pl\.base\.grupoId !== Number\(grupoId\)\) throw errCombo\([^)]*, 403\)/);
  assert.match(
    SERVICIO,
    /if \(pl\.base\.creadoEnLocalId !== Number\(localId\)\) \{\s*throw errCombo\([^)]*, 403\)/,
    "se aflojó la validación de que el combo se edita SOLO desde el local que lo creó"
  );
  assert.match(SERVICIO, /if \(!esComboBase\(pl\.base\)\) throw errCombo\([^)]*, 400\)/);
});
