// LAS CUATRO FORMAS SON LAS QUE EL REPO USA, Y EL VELO SE PUEDE TOCAR CON EL
// TECLADO.
//
// No se monta React acá: se afirma sobre las decisiones que se pueden leer sin
// dibujar —qué formas existen, de dónde salen, y cómo se compone la clase del
// panel— y sobre el código de la pieza. Que las cuatro se DIBUJEN como dicen se
// comprobó con capturas y está contado en el commit.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { declaraAnchoMaximo } from "@/lib/sunmi/claseNegociada";
import { declaraAncho } from "@/lib/sunmi/claseAncho";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiModalLayout.jsx"), "utf8");

/** `git grep` recorre el repo entero; `readdirSync` mira un solo nivel. */
const ejecutar = (cmd) => execSync(cmd, { cwd: RAIZ, encoding: "utf8" });

// ── LAS FORMAS ─────────────────────────────────────────────────────────────

test("las formas son EXACTAMENTE cuatro, las que existen en el repo", () => {
  // Si aparece una quinta sin una pantalla detrás, es una forma inventada — que
  // es el error que ya se cometió dos veces en este kit.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const nombres = [...bloque.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(nombres.sort(), ["cajon", "centrado", "hoja", "hoja-o-centrado"]);
});

test("cada forma dice de dónde sale", () => {
  // El encabezado nombra la pantalla de origen de cada una. Sin eso, dentro de
  // seis meses nadie sabe si `cajon` salió de algún lado o se le ocurrió a
  // alguien.
  for (const origen of ["CarritoPedido", "caja"]) {
    assert.match(SRC, new RegExp(origen), `no dice que una forma sale de ${origen}`);
  }
});

test("EL ÚNICO PUNTO DE CORTE ES `sm`, y es el que usan las de caja", () => {
  // Nada de un sistema general de breakpoints para casos que no hay.
  const cortes = [...SRC.matchAll(/\b(sm|md|lg|xl|2xl):/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(cortes)], ["sm"], cortes.join(", "));
});

// ── EL VELO ────────────────────────────────────────────────────────────────

test("el velo QUE CIERRA es un botón con etiqueta, no un div", () => {
  // Como en el carrito, que ya lo tenía bien. Un `div` con `onClick` no existe
  // para quien no usa mouse.
  assert.match(SRC, /<button\s+type="button"\s+aria-label="Cerrar"/);
});

test("el velo QUE NO CIERRA vuelve a ser un div escondido", () => {
  // Un botón que no hace nada es peor que ninguno: recibe el foco y no contesta.
  assert.match(SRC, /<div\s+aria-hidden="true"/);
  assert.match(SRC, /const cierraElVelo = !destructivo/);
});

test("NINGÚN COLOR FIJO adentro: el velo sale del token del tema", () => {
  // Es lo que arruinó a SunmiButtonIcon, que trae tres colores fijos y por eso
  // no se puede usar. El velo del carrito es `bg-black/50`; acá se conserva el
  // del kit, que ya sale del fondo del tema con transparencia.
  assert.doesNotMatch(SRC, /bg-(black|white|slate|gray|zinc|neutral|red|amber|green|blue)-?\d*\/?\d*/);
  assert.match(SRC, /var\(--app-bg\)/);
});

// ── LA CLASE DEL PANEL SE NEGOCIA ──────────────────────────────────────────

test("un `max-w-*` de la pantalla saca el de la pieza", () => {
  assert.equal(declaraAnchoMaximo("max-w-2xl"), true);
  assert.equal(declaraAnchoMaximo("!max-w-[420px]"), true);
  assert.equal(declaraAnchoMaximo("w-full"), false);
  assert.equal(declaraAnchoMaximo("min-w-0"), false);
});

test("`max-w-` NO cuenta como ancho para el input, y sí para el modal", () => {
  // Son dos preguntas distintas y a propósito: para un input, `max-w-sm` acota
  // pero no define, así que su `w-full` se queda. Para el panel del modal, el
  // `max-w-*` ES el ancho que se quiere.
  assert.equal(declaraAncho("max-w-sm"), false);
  assert.equal(declaraAnchoMaximo("max-w-sm"), true);
});

test("la pieza retira lo suyo cuando la pantalla declara", () => {
  const bloque = SRC.slice(SRC.indexOf("const clasesDelPanel"), SRC.indexOf("const cierraElVelo"));
  assert.match(bloque, /declaraAncho\(pedido\) \? "" : "w-full"/);
  assert.match(bloque, /declaraAnchoMaximo\(pedido\) \? "" : maxWidth/);
});

// ── EL APILADO ES UN SOLO NÚMERO ───────────────────────────────────────────

test("hay UN z y va en la capa, con el default de siempre", () => {
  assert.match(SRC, /z = 9999/, "cambió el default: eso mueve todos los modales");
  assert.match(SRC, /style=\{\{ zIndex: z \}\}/);
  assert.match(SRC, /className=\{`fixed inset-0 \$\{f\.capa\}`\}/, "la capa no puede traer su propio z-*");
});

test("EL VELO Y EL PANEL NO LLEVAN Z PROPIO", () => {
  // Es lo que mantiene atómico el contexto de apilado. El día que cada uno tenga
  // el suyo, algo de afuera se puede volver a meter en el medio — que es
  // exactamente lo que le pasó al cartel de identificarse en producción.
  const cuerpo = SRC.slice(SRC.indexOf("return ("));
  const velos = cuerpo.match(/className="absolute inset-0[^"]*"/g) ?? [];
  assert.equal(velos.length, 2, "el velo dejó de tener dos formas: revisar este candado");
  for (const v of velos) assert.doesNotMatch(v, /\bz-/, v);
  const panel = SRC.slice(SRC.indexOf("const clasesDelPanel"), SRC.indexOf("const cierraElVelo"));
  assert.doesNotMatch(panel, /\bz-\[/, "el panel se ganó un z propio");
});

test("NO HAY UN SEGUNDO NÚMERO que se pueda pasar por separado", () => {
  // Ni zVelo, ni zPanel, ni nada parecido. Si aparece, el número deja de ser uno
  // y vuelve el hueco.
  const firma = SRC.slice(SRC.indexOf("export default function"), SRC.indexOf("}) {"));
  const zetas = [...firma.matchAll(/^\s*(z[A-Za-z]*)\s*[=,]/gm)].map((m) => m[1]);
  assert.deepEqual(zetas, ["z"], zetas.join(", "));
});

test("el cartel de identificarse sigue arriba de este default", () => {
  // La otra mitad de la misma regla. El candado de ModalPedirOperador mira que
  // ninguna capa lo tape; este mira desde el otro lado, para que subir el default
  // del kit no lo deje debajo sin que nadie lo note.
  const cartel = fs.readFileSync(path.join(RAIZ, "components/operador/ModalPedirOperador.jsx"), "utf8");
  const zCartel = Number(cartel.match(/fixed inset-0 z-\[(\d+)\]/)[1]);
  const zKit = Number(SRC.match(/z = (\d+)/)[1]);
  assert.ok(zCartel > zKit, `el cartel quedó en ${zCartel} y el kit en ${zKit}`);
});

// ── EL INTERIOR NO SE REPINTA ──────────────────────────────────────────────

test("el espaciado del cuerpo y del pie es parámetro, con el valor de siempre", () => {
  assert.match(SRC, /espacioCuerpo = "mt-2 gap-3"/, "cambió el default: eso mueve los cuatro usos actuales");
  assert.match(SRC, /espacioPie = "mt-3"/);
});

test("EL `gap-3` NO ESTÁ CLAVADO en el cuerpo", () => {
  // Si volviera a estarlo, migrar la capa de una pantalla le separaría todos los
  // campos del formulario — que es exactamente lo que emparejar NO es.
  const cuerpo = SRC.slice(SRC.indexOf("flex flex-col ${altoEnElCuerpo}"), SRC.indexOf("{children}"));
  assert.doesNotMatch(cuerpo, /gap-3/, "el gap volvió a ser fijo");
  assert.doesNotMatch(cuerpo, /mt-2/, "el margen volvió a ser fijo");
  assert.match(cuerpo, /\$\{espacioCuerpo\}/);
});

test("EL CUERPO ACEPTA UNA REFERENCIA, y va en el div que scrollea", () => {
  // `ModalProveedor` la usa para mandar el scroll arriba al reabrirse. Si la
  // referencia terminara en otro div —la capa, el panel, la tarjeta— la pantalla
  // seguiría compilando y el scroll no volvería nunca: `scrollTop = 0` sobre algo
  // que no scrollea no hace nada y no avisa.
  const cuerpo = SRC.slice(SRC.indexOf("ref={refCuerpo}"), SRC.indexOf("{children}"));
  assert.match(cuerpo, /\$\{altoEnElCuerpo\}/, "la referencia no está en el div que lleva el alto");
  assert.match(cuerpo, /overflow-y-auto/, "la referencia no está en el div que scrollea");
});

test("EL ALTO ES UNO SOLO Y LA FORMA DECIDE DÓNDE CAE", () => {
  // Mismo patrón que el `z`: un valor del que la pieza deriva los destinos. Dos
  // parámetros sueltos dejarían ponerlos incoherentes sin que nadie se entere.
  const firma = SRC.slice(SRC.indexOf("export default function"), SRC.indexOf("}) {"));
  const altos = [...firma.matchAll(/^\s*(alto[A-Za-z]*)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(altos, ["alto"], altos.join(", "));

  // Dónde cae cada forma, y que el cuerpo crezca contra la tarjeta cuando el
  // tope está allá: sin `min-h-0` un hijo flex no baja de su contenido y el
  // scroll no aparece nunca.
  assert.match(SRC, /const altoEnLaTarjeta = f\.altoVa === "tarjeta" \? alto : ""/);
  assert.match(SRC, /const altoEnElCuerpo = f\.altoVa === "cuerpo" \? alto : "flex-1 min-h-0"/);

  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const destino = (nombre) => {
    const i = bloque.indexOf(nombre);
    return (bloque.slice(i, bloque.indexOf("}", i)).match(/altoVa:\s*"(\w+)"/) || [])[1];
  };
  assert.equal(destino("centrado:"), "cuerpo");
  assert.equal(destino("hoja:"), "tarjeta");
  assert.equal(destino('"hoja-o-centrado"'), "tarjeta");
  // El cajón ya fija su alto con `h-full`: un tope encima sería contradictorio.
  assert.equal(destino("cajon:"), "ninguno");
});

test("el alto conserva el 65vh de siempre por default", () => {
  assert.match(SRC, /alto = "max-h-\[65vh\]"/, "cambió el default: eso mueve todos los migrados");
  const cuerpo = SRC.slice(SRC.indexOf("flex flex-col ${altoEnElCuerpo}"), SRC.indexOf("{children}"));
  assert.match(cuerpo, /overflow-y-auto/, "el scroll sí sigue clavado: sin él un modal largo empuja la pantalla");
});

// ── EL REDONDEO LO DERIVA LA FORMA ─────────────────────────────────────────

test("UNA HOJA SE REDONDEA ARRIBA Y QUEDA RECTA ABAJO", () => {
  // Una hoja pegada al borde con las esquinas de abajo redondeadas deja dos
  // medialunas de fondo y se ve rota. Es parte de lo que la forma significa, no
  // una preferencia: si lo declarara la pantalla, la próxima que use `hoja` y se
  // olvide nace mal.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const forma = (nombre) => {
    const i = bloque.indexOf(nombre);
    return bloque.slice(i, bloque.indexOf("}", i));
  };
  for (const nombre of ["hoja:", '"hoja-o-centrado"']) {
    const f = forma(nombre);
    assert.match(f, /!rounded-t-2xl/, `${nombre} no redondea arriba`);
    assert.match(f, /!rounded-b-none/, `${nombre} no queda recta abajo`);
    // Y la columna, por la misma razón que el redondeo: una hoja cuyo pie se va
    // con el scroll está rota. `cajon` ya lo llevaba desde antes.
    assert.match(f, /flex flex-col/, `${nombre} no es columna: el pie se iría con el scroll`);
  }
  // Y la que se centra de `sm` para arriba recupera las cuatro esquinas ahí.
  assert.match(forma('"hoja-o-centrado"'), /sm:!rounded-t-xl sm:!rounded-b-xl/);
  // La centrada no declara nada: se queda con el `rounded-xl` de la tarjeta.
  assert.doesNotMatch(forma("centrado:"), /rounded/);
});

test("LO QUE LA TARJETA RECIBE VIENE CON `!`, PORQUE SunmiCard CONCATENA", () => {
  // Sin `!important` gana la clase que Tailwind haya escrito última en la hoja
  // de estilos, no la que alguien quiso. Es el defecto que ya se comió una vez:
  // el `p-0 overflow-hidden` de tres modales nunca hizo nada y nadie lo sabía.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  for (const m of bloque.matchAll(/tarjeta:\s*"([^"]*)"/g)) {
    for (const token of m[1].split(/\s+/).filter(Boolean)) {
      if (/^(h-full|flex|flex-col)$/.test(token)) continue; // estructura, no pelea con nada
      assert.match(token, /^[a-z0-9:]*!/, `la forma pasa "${token}" sin !: no le va a ganar a SunmiCard`);
    }
  }
});

test("LA TARJETA LLEVA SU MARCA, que es lo que la hace comparable", () => {
  // El arnés recorta por selector y el antes y el después tienen que compartirlo.
  // Un selector posicional se rompe en cada migración, porque la tarjeta deja de
  // ser el primer hijo de la capa en cuanto aparece el velo. Si esta marca se
  // cae, la comparación byte a byte se pierde y nadie se entera hasta la
  // siguiente tanda.
  assert.match(SRC, /data-sunmi-modal="tarjeta"/);
  // Y que SunmiCard reenvíe lo que le llega, o la marca no llega al DOM.
  const card = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiCard.jsx"), "utf8");
  assert.match(card, /\.\.\.props/, "SunmiCard dejó de reenviar props: la marca no llega al DOM");
  assert.match(card, /<div\s*\n?\s*\{\.\.\.props\}/, "los props no se reenvían al div");
});

test("el padding y la sombra de la tarjeta son props, con el default del kit", () => {
  // La alternativa era hacer negociable el className de SunmiCard, y se descartó
  // contando: 246 usos, 151 con className, 109 declaran padding. Todas dibujan
  // 21px hoy porque el p-6 de la pieza les gana; negociar movería media
  // aplicación por una pantalla.
  assert.match(SRC, /paddingTarjeta = ""/);
  assert.match(SRC, /sombraTarjeta = ""/);
  assert.match(SRC, /\[f\.tarjeta, altoEnLaTarjeta, paddingTarjeta, sombraTarjeta\]/);
});

// ── ACCESIBILIDAD ──────────────────────────────────────────────────────────

test("acepta las etiquetas y cae al título cuando no le pasan ninguna", () => {
  assert.match(SRC, /"aria-label": ariaLabel/);
  assert.match(SRC, /"aria-labelledby": ariaLabelledBy/);
  assert.match(SRC, /role = "dialog"/);
  assert.match(SRC, /aria-modal="true"/);
  assert.match(SRC, /ariaLabel \?\? \(ariaLabelledBy \? undefined : title\)/);
});

// ── QUIÉN DECLARA `destructivo` Y QUIÉN NO ─────────────────────────────────

test("LOS FORMULARIOS NO SE CIERRAN AL TOCAR EL VELO, Y LOS DEMÁS SÍ", () => {
  // El criterio es qué se PIERDE al cerrar sin querer, no qué tan peligrosa es
  // la acción. Está escrito al lado del prop y la lista se decidió abriendo cada
  // pantalla, una por una.
  //
  // Este candado existe porque la decisión no vive en ningún lado del código:
  // sin él, un modal de carga nuevo nace cerrando al tocar afuera y nadie se
  // entera hasta que alguien pierde un formulario lleno.
  const declaran = {
    // Carga y edición: hay algo escrito que se puede perder.
    "components/locales/ModalLocal.jsx": true,
    "components/proveedores/ModalProveedor.jsx": true,
    "components/usuarios/ModalUsuario.jsx": true,
    "components/operadores/ModalOperador.jsx": true,
    "components/roles/ModalRol.jsx": true,
    "components/categorias/ModalCategoria.jsx": true,
    "components/compras-proveedor/ModalVincularCodigo.jsx": true,
    "components/listas-precios/ModalListaPrecio.jsx": true,
    "components/caja/ModalCambioPrevio.jsx": true,
    // Informativos, de confirmación y de selección: cerrarlos no pierde nada.
    // `ModalPreviewPrecio` tiene un campo y NO lleva destructivo a propósito: lo
    // único que se escribe ahí es el buscador, y perder un término de búsqueda
    // no es perder nada. El criterio es qué se pierde, no si hay un input.
    "components/listas-precios/ModalPreviewPrecio.jsx": false,
    // Se vuelven a abrir y listo.
    "components/productos/ModalVerComposicion.jsx": false,
    "components/proveedores/ModalCodigosProveedor.jsx": false,
    "components/compras-proveedor/ModalEnviarPedido.jsx": false,
    "components/comprobantes/PanelComprobantes.jsx": false,
    // Estos dos lo declaran por el criterio VIEJO —la acción es peligrosa— y
    // quedan así a propósito. Se revisan al cerrar la fase 2, junto con el
    // renombre de `destructivo`.
    "components/proveedores/listas/ModalRevertir.jsx": true,
    "components/proveedores/listas/ModalTerminar.jsx": true,
  };

  // Que la lista sea TODOS los que usan la pieza, no los que alguien recordó.
  // Enumerado sobre el repo entero, no sobre una carpeta.
  const usan = ejecutar("git grep -l SunmiModalLayout -- app components")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith("SunmiModalLayout.jsx") && !l.endsWith(".test.mjs"));
  assert.deepEqual(
    usan.sort(),
    Object.keys(declaran).sort(),
    "apareció o desapareció un consumidor de la pieza y esta lista no lo dice"
  );

  for (const [ruta, esperado] of Object.entries(declaran)) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    // Se busca el prop pasado a la pieza, no la palabra suelta.
    const loPasa = /\n\s*destructivo(\s*=\s*\{?(true|false)\}?)?\s*\n/.test(texto);
    assert.equal(
      loPasa,
      esperado,
      esperado
        ? `${ruta} es de carga o edición y dejó de declarar destructivo: el velo le tira lo escrito`
        : `${ruta} no tiene nada que perder al cerrarse y declara destructivo de más`
    );
  }
});

test("los cuatro usos de hoy NO pasan forma: el default es el de siempre", () => {
  // Si alguno pasara una forma, esta tanda habría migrado algo, y no es lo que
  // se acordó: la pieza cambia, las pantallas no.
  const usos = [
    "components/comprobantes/PanelComprobantes.jsx",
    "components/productos/ModalVerComposicion.jsx",
    "components/proveedores/listas/ModalRevertir.jsx",
    "components/proveedores/listas/ModalTerminar.jsx",
  ];
  for (const ruta of usos) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.match(texto, /SunmiModalLayout/, `${ruta} dejó de usar el modal`);
    assert.doesNotMatch(texto, /forma=/, `${ruta} ya está migrado y esta tanda no migraba nada`);
  }
});
