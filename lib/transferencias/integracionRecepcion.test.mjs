// LOS TRES DEFECTOS DE INTEGRACIÓN DE LA SEGUNDA REVISIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/integracionRecepcion.test.mjs
//
// Los tres tienen la misma forma y por eso van juntos: cada pieza estaba bien y
// el defecto vivía en el CABLE entre dos. `reconciliarEditItems` es correcta,
// `filaDeServidor` es correcta, y juntarlas después de una revisión producía un
// bloqueo imposible de resolver. `categoriasDelRemito` excluye los agregados y
// `productosVisibles` los filtraba igual. `buscarPorCodigoExacto` es correcta
// para un escáner y estaba atada a la tecla Enter de un campo que también busca
// por nombre.
//
// Ninguno de los tres se ve probando las piezas por separado, y las piezas
// estaban todas verdes.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODO_RECEPCION,
  modoDeRecepcion,
  siguienteEdicion,
} from "./recepcionUI.js";
import {
  FILTRO,
  RESOLUCION,
  productosVisibles,
  resolverEntrada,
  resumenDeRecepcion,
} from "./controlFisico.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const PAGINA = "app/modulos/transferencias/[id]/page.jsx";
const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";
const LIB_UI = "lib/transferencias/recepcionUI.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. EL DIRTY FANTASMA
// ═══════════════════════════════════════════════════════════════════════════
//
// El caso exacto del pedido, con las formas que el endpoint devuelve de verdad.

/** La línea tal como sale de `/api/transferencias/detalle` ANTES de contar. */
const SIN_CONTAR = Object.freeze({
  id: 10,
  nombre: "Fanta Naranja 2,25 L",
  cantidadEnviada: 6,
  unidadEnviada: "BULTO",
  factorPack: 6,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: null,
  motivoPrincipal: null,
  motivoDetalle: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
});

/** La misma línea DESPUÉS de que el operador contara 5 packs y 5 sueltas. */
const CONTADA = Object.freeze({
  ...SIN_CONTAR,
  cantidadRecibida: 5,
  recibidoUnidadesSueltas: 5,
  motivoPrincipal: "Faltante",
  revisadoEnRecepcion: true,
});

test("1. contar 5 packs + 5 sueltas y recargar NO deja un dirty fantasma", () => {
  // Paso 1 — la pantalla abre. El editor por lotes PROPONE lo enviado, que es lo
  // correcto en su lugar: sin recepción cargada, la propuesta es 6.
  const alAbrir = siguienteEdicion({
    modo: MODO_RECEPCION.CONTROL_FISICO,
    preservar: false,
    items: [SIN_CONTAR],
  });
  assert.equal(alAbrir.editItems[0].recibido, 6, "la propuesta de lo enviado sigue existiendo");
  assert.equal(alAbrir.dirty, false);

  // Paso 2 — el operador cuenta en la ficha 5 packs + 5 sueltas y marca revisado.
  // El servidor persiste 5 y 5, y la pantalla recarga.
  const trasRevisar = siguienteEdicion({
    modo: MODO_RECEPCION.CONTROL_FISICO,
    preservar: true, // aunque el llamador lo pida, en control físico no significa nada
    items: [CONTADA],
    previos: alAbrir.editItems,
  });

  assert.equal(trasRevisar.dirty, false, "el dirty fantasma volvió: Confirmar quedaría bloqueado sin botón que lo resuelva");
  assert.equal(
    trasRevisar.editItems[0].recibido,
    5,
    "editItems tiene que reflejar lo que el servidor guardó, no la propuesta vieja"
  );
});

test("1b. y el fantasma EXISTE de verdad: en modo editor por lotes, el mismo caso da dirty", () => {
  // Sin esto el candado de arriba no probaría nada: podría estar dando false
  // porque el escenario no genera ninguna diferencia. Genera una, y grande —6
  // contra 5— y lo que la apaga es el modo.
  const previos = siguienteEdicion({
    modo: MODO_RECEPCION.EDITOR_LOTES,
    preservar: false,
    items: [SIN_CONTAR],
  }).editItems;

  const enLotes = siguienteEdicion({
    modo: MODO_RECEPCION.EDITOR_LOTES,
    preservar: true,
    items: [CONTADA],
    previos,
  });

  assert.equal(enLotes.dirty, true, "el escenario tiene que generar la diferencia que el modo apaga");
  assert.equal(enLotes.editItems[0].recibido, 6, "y el editor por lotes SÍ conserva lo escrito");
});

test("1c. el editor por lotes NO se tocó: sigue preservando y sigue avisando", () => {
  // El caso real que la preservación existe para resolver: alguien escribió 15
  // sobre 10, no guardó, y agrega un producto. El 15 tiene que sobrevivir.
  const frescos = [
    { id: 1, cantidadEnviada: 10, cantidadRecibida: null, agregadoEnRecepcion: false },
  ];
  const escrito = [{ id: 1, enviado: 10, recibido: 15, motivoPrincipal: "Sobrante", motivoDetalle: "" }];

  const r = siguienteEdicion({
    modo: MODO_RECEPCION.EDITOR_LOTES,
    preservar: true,
    items: frescos,
    previos: escrito,
  });
  assert.equal(r.editItems[0].recibido, 15, "se perdió lo que el operador tenía escrito");
  assert.equal(r.dirty, true, "y el aviso de guardar tiene que seguir encendido");

  // Y cuando ya no queda edición pendiente, el aviso se apaga solo. Lo pendiente
  // son los TRES campos editables, no solo la cantidad: si el servidor ya tiene
  // el 15 pero no el motivo, todavía hay algo que guardar.
  const sinPendiente = siguienteEdicion({
    modo: MODO_RECEPCION.EDITOR_LOTES,
    preservar: true,
    items: [
      {
        id: 1, cantidadEnviada: 10, cantidadRecibida: 15,
        motivoPrincipal: "Sobrante", motivoDetalle: "", agregadoEnRecepcion: false,
      },
    ],
    previos: escrito,
  });
  assert.equal(sinPendiente.dirty, false, "el aviso quedaría encendido sin nada que guardar");
});

test("1d. el modo sale de una sola pregunta, la misma que monta el componente", () => {
  assert.equal(modoDeRecepcion({ puedeRecibir: true }), MODO_RECEPCION.CONTROL_FISICO);
  assert.equal(modoDeRecepcion({ puedeRecibir: false }), MODO_RECEPCION.EDITOR_LOTES);
  // Sin dato es el editor histórico: es el modo que no escribe nada.
  assert.equal(modoDeRecepcion({}), MODO_RECEPCION.EDITOR_LOTES);
  assert.equal(modoDeRecepcion(), MODO_RECEPCION.EDITOR_LOTES);
});

test("1e. LA CONEXIÓN REAL: la página no puede dejar que el legacy la gobierne", () => {
  const pagina = leerSinComentarios(PAGINA);

  // El mismo `puedeRecibir` decide el modo Y qué componente se monta. Si fueran
  // dos condiciones, un día dirían cosas distintas.
  assert.match(pagina, /const modo = modoDeRecepcion\(\{ puedeRecibir \}\)/);
  assert.match(pagina, /\{puedeRecibir \? \(\s*<WorkspaceRecepcion/);

  // La recarga delega: la página no elige entre construir y reconciliar.
  assert.match(pagina, /siguienteEdicion\(\{\s*modo,/);
  assert.ok(
    !/construirEditItems|reconciliarEditItems|hayEdicionPendiente/.test(pagina),
    "la página volvió a decidir el camino por su cuenta"
  );

  // Confirmar lee el dirty APAGADO en control físico, no el crudo.
  const confirmar = pagina.slice(pagina.indexOf("const confirmarRecepcion"));
  assert.match(confirmar.slice(0, 700), /if \(dirtyEfectivo\)/);
  assert.ok(
    !/if \(dirty\) \{/.test(confirmar.slice(0, 700)),
    "quedó el bloqueo por el dirty crudo"
  );
  assert.match(pagina, /const dirtyEfectivo = modo === MODO_RECEPCION\.EDITOR_LOTES && dirty/);

  // Y lo que se le pasa a la card de acciones es el efectivo: si fuera el crudo,
  // el aviso "tenés cambios sin guardar" se vería igual en el puesto de trabajo.
  assert.match(pagina, /dirty=\{dirtyEfectivo\}/);

  // Revisar recarga FRESCO. No es lo mismo que agregar o quitar.
  const revisar = pagina.slice(pagina.indexOf("const revisarProducto"));
  const cuerpoRevisar = revisar.slice(0, revisar.indexOf("const quitarLinea"));
  assert.match(cuerpoRevisar, /if \(json\?\.ok\) await cargar\(\);/);
  assert.ok(
    !/preservarEdicion/.test(cuerpoRevisar),
    "revisar volvió a pedir preservación: es la puerta por la que entró el fantasma"
  );

  // Y NO se resolvió con un setDirty(false) puesto después de cada fetch.
  const apagones = [...pagina.matchAll(/setDirty\(false\)/g)];
  assert.ok(
    apagones.length === 0,
    `hay ${apagones.length} setDirty(false) sueltos: eso tapa el síntoma y deja la causa`
  );
});

test("1f. la garantía vive en el helper, así que no depende de que la página acierte", () => {
  const lib = leerSinComentarios(LIB_UI);
  assert.match(
    lib,
    /const conservar = modo === MODO_RECEPCION\.EDITOR_LOTES && preservar === true/,
    "la compuerta del modo desapareció del helper"
  );
  // Aunque el llamador insista, en control físico no se reconcilia.
  const r = siguienteEdicion({
    modo: MODO_RECEPCION.CONTROL_FISICO,
    preservar: true,
    items: [{ id: 1, cantidadEnviada: 10, cantidadRecibida: 3, agregadoEnRecepcion: false }],
    previos: [{ id: 1, enviado: 10, recibido: 99, motivoPrincipal: "Otro", motivoDetalle: "x" }],
  });
  assert.equal(r.editItems[0].recibido, 3, "se preservó una edición que no existe");
  assert.equal(r.dirty, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA CARD Y SU FILTRO TIENEN QUE DECIR LO MISMO
// ═══════════════════════════════════════════════════════════════════════════

const GOLOSINA = {
  id: 1,
  nombre: "9 de Oro",
  categoria: { id: 7, nombre: "Golosinas" },
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  cantidadEnviada: 3,
  unidadEnviada: "UNIDAD",
};
const EXTRA_LIMPIEZA = {
  id: 2,
  nombre: "Lavandina 1 L",
  categoria: { id: 4, nombre: "Limpieza" },
  agregadoEnRecepcion: true,
  cantidadRecibida: 2,
  unidadEnviada: "UNIDAD",
};

test("2. con una categoría del remito elegida, los NO DECLARADOS igual aparecen", () => {
  const items = [GOLOSINA, EXTRA_LIMPIEZA];

  const vistos = productosVisibles(items, {
    filtro: FILTRO.NO_DECLARADOS,
    categoriaId: "7", // Golosinas, del remito
  });

  assert.equal(vistos.length, 1, "la card diría 1 y la pantalla mostraría 0");
  assert.equal(vistos[0].id, EXTRA_LIMPIEZA.id);
});

test("2b. la métrica de la card y su filtro coinciden SIEMPRE, con cualquier chip", () => {
  const items = [GOLOSINA, EXTRA_LIMPIEZA];
  const resumen = resumenDeRecepcion(items);

  // Es el invariante que el defecto rompía: la card es un contador y el filtro es
  // el mismo estado usado como predicado. Si difieren, uno de los dos miente.
  for (const categoriaId of [null, "7", "4", "sin-categoria", "999"]) {
    assert.equal(
      productosVisibles(items, { filtro: FILTRO.NO_DECLARADOS, categoriaId }).length,
      resumen.noDeclarados,
      `con el chip ${categoriaId} la card y la lista dejan de coincidir`
    );
  }
});

test("2c. y la categoría SIGUE filtrando en los tabs del remito", () => {
  // El arreglo no puede volverse "la categoría ya no filtra nada". Solo deja de
  // aplicar en la lista donde esos chips no significan nada.
  const otra = { ...GOLOSINA, id: 3, nombre: "Ala", categoria: { id: 4, nombre: "Limpieza" } };
  const items = [GOLOSINA, otra, EXTRA_LIMPIEZA];

  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.TODOS, categoriaId: "7" }).map((d) => d.id),
    [1]
  );
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.PENDIENTES, categoriaId: "4" }).map((d) => d.id),
    [3]
  );
  // ── EL CHIP SIGUE FILTRANDO, TAMBIEN A LOS AGREGADOS ──────────────
  //
  // Aca se afirmaba que un no declarado no entra NUNCA en "Todos". Eso cambio:
  // "Todos" es ahora toda la mercaderia de la recepcion, agregados incluidos.
  //
  // Lo que este candado defiende sigue en pie —que el chip de categoria no deje
  // de filtrar— y se afirma sobre el caso que corresponde: con un chip elegido,
  // solo se ve lo de esa categoria, venga del remito o no.
  // El agregado es de Limpieza. Con el chip de Golosinas NO se ve; con el de
  // Limpieza SI, porque le corresponde; y sin chip tambien. El chip filtra a
  // todos por igual — eso es lo que no puede dejar de pasar.
  assert.ok(
    !productosVisibles(items, { filtro: FILTRO.TODOS, categoriaId: "7" }).some((d) => d.id === 2),
    "el chip de categoria dejo de filtrar a los agregados"
  );
  assert.ok(
    productosVisibles(items, { filtro: FILTRO.TODOS, categoriaId: "4" }).some((d) => d.id === 2),
    "con su propia categoria elegida, el agregado tiene que verse"
  );
  assert.ok(
    productosVisibles(items, { filtro: FILTRO.TODOS, categoriaId: null }).some((d) => d.id === 2),
    "sin chip, el agregado tiene que verse en Todos"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENTER NO ES SIEMPRE UN ESCANEO
// ═══════════════════════════════════════════════════════════════════════════

const FANTA = {
  id: 1, nombre: "Fanta Naranja 2,25 L", codigoBarra: "779001", agregadoEnRecepcion: false,
};
const FANTA_LIMON = {
  id: 2, nombre: "Fanta Limón 2,25 L", codigoBarra: "779002", agregadoEnRecepcion: false,
};
const FANTA_500 = {
  id: 3, nombre: "Fanta Naranja 500 ml", codigoBarra: "779003", agregadoEnRecepcion: false,
};
const COCA = {
  id: 4, nombre: "Coca Cola 2,25 L", codigoBarra: "779004", agregadoEnRecepcion: false,
};

test("3. un código exacto abre el producto, y eso no cambió", () => {
  const r = resolverEntrada([FANTA, COCA], "779001");
  assert.equal(r.tipo, RESOLUCION.ABRIR);
  assert.equal(r.producto.id, FANTA.id);
  assert.equal(r.porCodigo, true, "el campo se limpia solo si fue un código");
});

test("3b. una sola coincidencia POR NOMBRE también abre", () => {
  // El caso del pedido: la lista encontró "Fanta Naranja 2,25 L" por nombre y
  // Enter contestaba "este producto no figura en esta transferencia".
  const r = resolverEntrada([FANTA, COCA], "Fanta");
  assert.equal(r.tipo, RESOLUCION.ABRIR);
  assert.equal(r.producto.id, FANTA.id);
  assert.equal(r.porCodigo, false, "no fue un código: el texto buscado no se borra");
});

test("3c. con varias coincidencias NO se elige una, y NO se dice que no figura", () => {
  const items = [FANTA, FANTA_LIMON, FANTA_500, COCA];
  const r = resolverEntrada(items, "Fanta");

  assert.equal(r.tipo, RESOLUCION.LISTA);
  assert.notEqual(r.tipo, RESOLUCION.ABRIR, "abrir la primera es adivinar cuál tiene en la mano");
  assert.notEqual(r.tipo, RESOLUCION.NO_FIGURA, "decir que no figura sobre tres que están listados es falso");
  assert.deepEqual(r.resultados.map((d) => d.id), [1, 2, 3]);
});

test("3d. sin ninguna coincidencia, recién ahí NO FIGURA", () => {
  const r = resolverEntrada([FANTA, COCA], "xyz inexistente");
  assert.equal(r.tipo, RESOLUCION.NO_FIGURA);
  assert.deepEqual(r.resultados, []);
});

test("3e. la CÁMARA no cae por nombre: un código que no está es 'no figura'", () => {
  // Sin esto, escanear un código cuyos dígitos aparecen en el nombre de otro
  // producto abriría el producto equivocado con la mercadería en la mano.
  const conNumeroEnElNombre = { id: 9, nombre: "Aceite 900 ml", codigoBarra: "111", agregadoEnRecepcion: false };
  const r = resolverEntrada([conNumeroEnElNombre], "900", { soloCodigo: true });
  assert.equal(r.tipo, RESOLUCION.NO_FIGURA);

  // Y por texto, la misma entrada sí lo encontraría: la diferencia es real.
  assert.equal(resolverEntrada([conNumeroEnElNombre], "900").tipo, RESOLUCION.ABRIR);

  // El código exacto sigue funcionando en el modo cámara.
  assert.equal(resolverEntrada([conNumeroEnElNombre], "111", { soloCodigo: true }).tipo, RESOLUCION.ABRIR);
});

test("3f. un código exacto le gana a la búsqueda por texto", () => {
  // Si el código escaneado además aparece dentro del nombre de otros productos,
  // manda el código: es el escalón 1 de la cascada.
  const raro = { id: 8, nombre: "Pack 779001 unidades", codigoBarra: "555", agregadoEnRecepcion: false };
  const r = resolverEntrada([FANTA, raro], "779001");
  assert.equal(r.tipo, RESOLUCION.ABRIR);
  assert.equal(r.producto.id, FANTA.id, "ganó el nombre por sobre el código exacto");
});

test("3g. un producto ya agregado se abre, no se vuelve a agregar", () => {
  const agregado = { id: 5, nombre: "Lavandina", codigoBarra: "888", agregadoEnRecepcion: true };
  const r = resolverEntrada([FANTA, agregado], "888");
  assert.equal(r.tipo, RESOLUCION.ABRIR);
  assert.equal(r.producto.id, agregado.id);
});

test("3h. LA CONEXIÓN REAL: el workspace aplica la cascada y no busca por su cuenta", () => {
  const ws = leerSinComentarios(WORKSPACE);

  assert.match(ws, /resolverEntrada\(items, entrada, opciones\)/, "el workspace no usa la cascada");
  assert.ok(
    !/buscarPorCodigoExacto\(/.test(ws),
    "el workspace volvió a resolver el Enter por su cuenta, con código exacto y nada más"
  );

  // La cámara pasa `soloCodigo`; el teclado no.
  const escanear = ws.slice(ws.indexOf("const alEscanear"), ws.indexOf("const alTeclear"));
  assert.match(escanear, /resolver\(codigo, \{ soloCodigo: true \}\)/);
  const teclear = ws.slice(ws.indexOf("const alTeclear"));
  assert.match(teclear.slice(0, 400), /resolver\(texto\.trim\(\)\)/);
  assert.ok(
    !/soloCodigo/.test(teclear.slice(0, 400)),
    "el teclado quedó restringido a código exacto: vuelve el 'no figura' falso"
  );

  // ── EL "NO FIGURA" YA NO SE ENCIENDE ACA: SE DERIVA ───────────────
  //
  // Este bloque exigia `setAviso(MENSAJE_NO_FIGURA)` adentro de la rama
  // NO_FIGURA de `resolver`. Ese era el defecto: el camino de salida existia
  // solo despues de tocar Enter. Ahora lo deriva `faltaEnLaTransferencia`
  // mientras se escribe, contra la transferencia COMPLETA.
  //
  // Lo que el candado defiende no cambio —que no se diga "no figura" sobre algo
  // que esta en pantalla— y se afirma donde vive ahora.
  const bloqueResolver = ws.slice(ws.indexOf("const resolver ="), ws.indexOf("const alEscanear"));
  assert.match(bloqueResolver, /if \(r\.tipo === RESOLUCION\.NO_FIGURA\) \{[\s\S]{0,200}setTexto\(/);
  assert.ok(
    !/setAviso\(MENSAJE_NO_FIGURA\)/.test(bloqueResolver),
    "el aviso volvio a depender de haber tocado Enter"
  );
  assert.match(ws, /faltaEnLaTransferencia\(items, texto\)/);
});
