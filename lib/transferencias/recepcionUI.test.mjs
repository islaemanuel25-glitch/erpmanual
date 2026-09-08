// LA PANTALLA DE RECEPCIÓN REPRESENTA LO QUE LLEGÓ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/recepcionUI.test.mjs
//
// ── QUÉ DEFIENDE ESTE ARCHIVO ─────────────────────────────────────────────
//
// El backend ya sabe recibir de más y recibir un producto que el remito no
// menciona: se desplegó el 2026-09-08. Lo que faltaba era la pantalla, y la
// pantalla puede romper el backend de dos maneras que ningún candado del
// servidor ve:
//
//   · mandando la cantidad YA convertida, y entonces el servidor multiplica por
//     el factor una segunda vez;
//   · eligiendo ella la unidad cuando el operador no la eligió.
//
// Las dos escriben stock mal y ninguna deja rastro de por qué. Por eso la lógica
// vive en `recepcionUI.js` como funciones puras y se prueba acá, y por eso los
// candados de estructura leen el fuente de los componentes SIN COMENTARIOS: esta
// tanda escribió mucha prosa que nombra "UNIDAD", "Faltante" y "BULTO", y un
// candado que busque texto los encuentra en la prosa y da verde sin que el código
// diga nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESTADO_LINEA,
  MENSAJE_YA_EXISTIA,
  MOTIVOS_FALTANTE,
  MOTIVOS_SOBRANTE,
  cuerpoQuitarLinea,
  diferenciaDeLinea,
  estadoDeLinea,
  motivoSigueSiendoValido,
  motivosParaDiferencia,
  opcionesDeUnidad,
  previsualizarIngresoFisico,
  sePuedeQuitarLinea,
  signoDeDiferencia,
  validarLineaNueva,
} from "./recepcionUI.js";
import { fmtDiferencia } from "@/components/transferencias/detallePresentacion";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const TABLA = "components/transferencias/TablaDetalleTransferencia.jsx";
const AGREGAR = "components/transferencias/AgregarProductoRecibido.jsx";
const PAGINA = "app/modulos/transferencias/[id]/page.jsx";
const ACCIONES = "components/transferencias/AccionesRecepcion.jsx";
const PRESENTACION = "components/transferencias/detallePresentacion.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// 1-2. RECIBIR DE MÁS SE PUEDE REPRESENTAR, Y SE LEE CON SIGNO
// ═══════════════════════════════════════════════════════════════════════════

test("1. recibido MAYOR que enviado es un estado representable, no un error", () => {
  assert.equal(estadoDeLinea({ enviada: 10, recibida: 15 }), ESTADO_LINEA.EXCEDENTE);
  assert.equal(estadoDeLinea({ enviada: 10, recibida: 10 }), ESTADO_LINEA.EXACTO);
  assert.equal(estadoDeLinea({ enviada: 10, recibida: 8 }), ESTADO_LINEA.FALTANTE);

  // ── Y LA PANTALLA NO VUELVE A PONER EL TOPE QUE EL BACKEND SACÓ ──────────
  //
  // La primera versión de esta afirmación buscaba patrones de texto
  // —`Math.min(...enviada)`, `recibido > enviada`— y la CONTRAPRUEBA la
  // encontró vacía: metiendo un tope real, `if (num(valor) > enviada) valor =
  // String(Math.min(num(valor), enviada))`, el candado siguió en VERDE. El
  // `[^)]*` se cortaba en el paréntesis de `num(valor)` y ninguna de las dos
  // alternativas coincidía.
  //
  // Un candado que no atrapa lo que dice defender es peor que no tenerlo,
  // porque el verde se lee igual. Así que ahora se EJERCE el handler con un
  // doble falso en vez de leerlo: se le manda 15 sobre 10 y se mira qué guardó.
  // Cualquier recorte, redondeo o conversión aparece en el valor, escrito como
  // esté escrito.
  const tabla = leerSinComentarios(TABLA);
  const cuerpo = tabla.slice(
    tabla.indexOf("const onRecibidoChange"),
    tabla.indexOf("const onMotivoChange")
  );
  assert.ok(cuerpo.length > 0, "no se pudo aislar onRecibidoChange");

  let guardado;
  const editItems = [{ recibido: "10", motivoPrincipal: "" }];
  const cambiar = (idx, campo, valor, extra) => {
    guardado = { idx, campo, valor, extra };
  };
  const num = (v) => (Number.isNaN(Number(v)) ? 0 : Number(v));
  // Se construye el handler a partir del fuente REAL del componente: si alguien
  // agrega un recorte adentro, esta función lo trae.
  const onRecibidoChange = new Function(
    "editItems",
    "cambiar",
    "num",
    "motivoSigueSiendoValido",
    `${cuerpo.replace(/^\s*const onRecibidoChange =/, "return")}`
  )(editItems, cambiar, num, motivoSigueSiendoValido);

  onRecibidoChange(0, 10, "15");
  assert.equal(
    String(guardado.valor),
    "15",
    `el handler guardó ${JSON.stringify(guardado.valor)}: lo recibido se está topeando o convirtiendo`
  );
  assert.equal(guardado.campo, "recibido");
});

test("2. la diferencia se calcula con signo y se lee '+5'", () => {
  assert.equal(diferenciaDeLinea({ enviada: 10, recibida: 15 }), 5);
  assert.equal(diferenciaDeLinea({ enviada: 10, recibida: 8 }), -2);
  assert.equal(diferenciaDeLinea({ enviada: 10, recibida: 10 }), 0);

  assert.equal(signoDeDiferencia(5), "+");
  assert.equal(signoDeDiferencia(-5), "", "el menos ya lo trae el número: '--5' sería un defecto");
  assert.equal(signoDeDiferencia(0), "");

  // El texto completo, que es lo que se ve.
  assert.equal(fmtDiferencia(5), "+5");
  assert.equal(fmtDiferencia(-2), "-2");
  assert.equal(fmtDiferencia(0), "0");
  assert.equal(fmtDiferencia(null), "—", "sin recepción cargada no hay diferencia que mostrar");
});

test("2b. el caso del pedido, entero: enviado 10, recibido 15, se muestra +5", () => {
  const enviada = 10;
  const recibida = 15;
  assert.equal(estadoDeLinea({ enviada, recibida }), ESTADO_LINEA.EXCEDENTE);
  assert.equal(fmtDiferencia(diferenciaDeLinea({ enviada, recibida })), "+5");
  // Y el remito sigue diciendo 10: nada de esto reescribe lo enviado.
  assert.equal(enviada, 10);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 y 16. LOS MOTIVOS SIGUEN AL SIGNO
// ═══════════════════════════════════════════════════════════════════════════

test("3. una diferencia POSITIVA ofrece Sobrante, y no ofrece Faltante", () => {
  const ops = motivosParaDiferencia({ enviada: 10, recibida: 15 });
  const valores = ops.map((o) => o.value);
  assert.deepEqual(valores, ["Sobrante", "Otro"]);
  assert.ok(!valores.includes("Faltante"), "pedir que un sobrante se clasifique como falta");
});

test("16. y los motivos NEGATIVOS siguen siendo los de siempre", () => {
  const valores = motivosParaDiferencia({ enviada: 10, recibida: 8 }).map((o) => o.value);
  assert.deepEqual(valores, ["Faltante", "Producto dañado", "Otro"]);
  assert.deepEqual(MOTIVOS_FALTANTE.map((m) => m.value), ["Faltante", "Producto dañado", "Otro"]);
  assert.deepEqual(MOTIVOS_SOBRANTE.map((m) => m.value), ["Sobrante", "Otro"]);
});

test("3b. sin diferencia no se pide motivo", () => {
  assert.deepEqual(motivosParaDiferencia({ enviada: 10, recibida: 10 }), []);
  assert.deepEqual(motivosParaDiferencia({ enviada: 10, recibida: null }), []);
});

test("3c. un motivo que deja de tener sentido al cambiar el signo se limpia", () => {
  // Cargó 8 sobre 10 y eligió "Faltante"; después corrige a 15.
  assert.equal(
    motivoSigueSiendoValido({ enviada: 10, recibida: 8, motivoPrincipal: "Faltante" }),
    true
  );
  assert.equal(
    motivoSigueSiendoValido({ enviada: 10, recibida: 15, motivoPrincipal: "Faltante" }),
    false,
    "quedaría un motivo que dice lo contrario de lo que pasó"
  );
  // "Otro" sirve para los dos signos.
  assert.equal(motivoSigueSiendoValido({ enviada: 10, recibida: 15, motivoPrincipal: "Otro" }), true);
  // Igualar las cantidades lo limpia, como ya pasaba antes.
  assert.equal(
    motivoSigueSiendoValido({ enviada: 10, recibida: 10, motivoPrincipal: "Faltante" }),
    false
  );
  // Sin motivo no hay nada que limpiar.
  assert.equal(motivoSigueSiendoValido({ enviada: 10, recibida: 15, motivoPrincipal: "" }), true);
});

test("18. la card del teléfono y la fila del escritorio ofrecen LOS MISMOS motivos", () => {
  const tabla = leerSinComentarios(TABLA);
  // Dos llamadas: una en el bloque `md:hidden` y otra en el `hidden md:block`.
  const llamadas = (tabla.match(/motivosParaDiferencia\(/g) || []).length;
  assert.equal(llamadas, 2, `hay ${llamadas} usos: tienen que ser los dos, card y tabla`);

  // Y no quedó la lista fija vieja escrita a mano en ninguna de las dos.
  assert.ok(
    !/const MOTIVOS\s*=/.test(tabla),
    "volvió la lista fija de motivos: no puede seguir al signo"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-5. LA UNIDAD NO SE ADIVINA
// ═══════════════════════════════════════════════════════════════════════════

test("4. la unidad de un producto extra EMPIEZA SIN ELEGIR", () => {
  const src = leerSinComentarios(AGREGAR);
  assert.ok(
    /useState\(null\)/.test(src.slice(src.indexOf("const [unidad,"))) ||
      /const \[unidad, setUnidad\] = useState\(null\)/.test(src),
    "la unidad tiene que arrancar en null"
  );
  assert.ok(
    !/useState\(["'](UNIDAD|BULTO)["']\)/.test(src),
    "la unidad arranca preseleccionada: eso es elegir por el operador"
  );
  assert.ok(
    !/unidad\s*\|\|\s*["'](UNIDAD|BULTO)["']/.test(src),
    "volvió el default silencioso de unidad"
  );

  // Cambiar de producto la vuelve a poner en null: arrastrar "BULTO" de un x6 a
  // un x24 es el error que esta pantalla existe para no cometer.
  assert.ok(/setUnidad\(null\)/.test(src), "elegir otro producto no reinicia la unidad");

  // Y las opciones no traen ninguna marcada.
  const ops = opcionesDeUnidad({ factorPack: 6 });
  assert.deepEqual(ops.map((o) => o.clave), ["UNIDAD", "BULTO"]);
  assert.ok(!ops.some((o) => o.preseleccionado || o.default), "una opción viene marcada");
  assert.equal(ops[1].texto, "BULTO · x6", "el factor tiene que estar a la vista al elegir");

  // Un producto sin bulto no ofrece BULTO: "BULTO · x1" no significa nada.
  assert.deepEqual(opcionesDeUnidad({ factorPack: 1 }).map((o) => o.clave), ["UNIDAD"]);
});

test("5. sin unidad NO se arma el pedido, y por lo tanto no hay POST", () => {
  const r = validarLineaNueva({
    transferenciaId: 7,
    producto: { productoLocalId: 33, factorPack: 6 },
    unidadEnviada: null,
    recibido: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "UNIDAD_ENVIADA_AUSENTE");
  assert.equal(r.cuerpo, undefined, "no puede haber cuerpo que mandar");
  assert.match(r.mensaje, /UNIDAD|BULTO/, "el mensaje tiene que decir qué falta elegir");

  for (const vacio of [undefined, ""]) {
    assert.equal(
      validarLineaNueva({
        transferenciaId: 7,
        producto: { productoLocalId: 33 },
        unidadEnviada: vacio,
        recibido: 2,
      }).ok,
      false,
      `unidadEnviada=${JSON.stringify(vacio)} tendría que rechazarse`
    );
  }

  // Y una unidad inventada tampoco pasa.
  const rara = validarLineaNueva({
    transferenciaId: 7,
    producto: { productoLocalId: 33 },
    unidadEnviada: "CAJON",
    recibido: 2,
  });
  assert.equal(rara.ok, false);
  assert.equal(rara.error, "UNIDAD_ENVIADA_DESCONOCIDA");
});

test("5b. el componente CORTA antes de llamar al servidor", () => {
  const src = leerSinComentarios(AGREGAR);
  const posValidar = src.indexOf("validarLineaNueva(");
  const posPost = src.indexOf("onAgregar(");
  assert.ok(posValidar > 0 && posPost > 0);
  assert.ok(posValidar < posPost, "se llama al servidor antes de validar la unidad");
  assert.match(
    src,
    /if \(!plan\.ok\) \{[\s\S]{0,200}return;/,
    "el rechazo no corta: seguiría hasta el POST"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 6-8. EL FACTOR SE APLICA UNA SOLA VEZ, Y NO ACÁ
// ═══════════════════════════════════════════════════════════════════════════

test("6. BULTO x6 con 2 recibidos manda recibido: 2 — NO 12", () => {
  const r = validarLineaNueva({
    transferenciaId: 7,
    producto: { productoLocalId: 33, factorPack: 6 },
    unidadEnviada: "BULTO",
    recibido: 2,
  });
  assert.equal(r.ok, true);
  assert.equal(r.cuerpo.recibido, 2, "mandar 12 haría que el servidor multiplique dos veces: 72");
  assert.equal(r.cuerpo.unidadEnviada, "BULTO");
  assert.notEqual(r.cuerpo.recibido, 12);

  // El caso x20 del backend, por si alguien cambia el factor de ejemplo.
  const r20 = validarLineaNueva({
    transferenciaId: 7,
    producto: { productoLocalId: 33, factorPack: 20 },
    unidadEnviada: "BULTO",
    recibido: 3,
  });
  assert.equal(r20.cuerpo.recibido, 3);
});

test("6b. y el componente no multiplica por su cuenta en ningún lado", () => {
  const src = leerSinComentarios(AGREGAR);
  assert.ok(
    !/\*\s*factorPack|factorPack\s*\*/.test(src),
    "hay una multiplicación por el factor en el componente: la conversión es del servidor"
  );
  // La preview y el cuerpo salen de dos funciones distintas, a propósito.
  assert.ok(src.includes("previsualizarIngresoFisico"), "falta la preview");
  assert.ok(src.includes("validarLineaNueva"), "falta el armado del cuerpo");
});

test("7. la preview física muestra 12 y NO viaja", () => {
  assert.equal(previsualizarIngresoFisico({ cantidad: 2, unidad: "BULTO", factorPack: 6 }), 12);
  assert.equal(previsualizarIngresoFisico({ cantidad: 3, unidad: "BULTO", factorPack: 20 }), 60);

  // En UNIDAD no hay nada que aclarar: repetir el mismo número es ruido.
  assert.equal(previsualizarIngresoFisico({ cantidad: 2, unidad: "UNIDAD", factorPack: 6 }), null);
  // Factor 1 tampoco.
  assert.equal(previsualizarIngresoFisico({ cantidad: 2, unidad: "BULTO", factorPack: 1 }), null);
  // Sin cantidad, nada.
  assert.equal(previsualizarIngresoFisico({ cantidad: "", unidad: "BULTO", factorPack: 6 }), null);
  assert.equal(previsualizarIngresoFisico({ cantidad: 0, unidad: "BULTO", factorPack: 6 }), null);

  // LA AFIRMACIÓN QUE IMPORTA: el número de la preview y el del cuerpo son
  // distintos, y el que viaja es el chico.
  const preview = previsualizarIngresoFisico({ cantidad: 2, unidad: "BULTO", factorPack: 6 });
  const cuerpo = validarLineaNueva({
    transferenciaId: 1,
    producto: { productoLocalId: 9, factorPack: 6 },
    unidadEnviada: "BULTO",
    recibido: 2,
  }).cuerpo;
  assert.equal(preview, 12);
  assert.equal(cuerpo.recibido, 2);
  assert.notEqual(preview, cuerpo.recibido, "si fueran el mismo, uno de los dos está mal");
});

test("8. el POST lleva el productoLocalId REAL del catálogo del origen", () => {
  const r = validarLineaNueva({
    transferenciaId: 7,
    producto: { productoLocalId: 4321, factorPack: 1 },
    unidadEnviada: "UNIDAD",
    recibido: 5,
  });
  assert.equal(r.cuerpo.productoLocalId, 4321);
  assert.equal(r.cuerpo.transferenciaId, 7);
  assert.deepEqual(Object.keys(r.cuerpo).sort(), [
    "productoLocalId",
    "recibido",
    "transferenciaId",
    "unidadEnviada",
  ]);

  // Sin producto elegido no hay cuerpo.
  assert.equal(
    validarLineaNueva({ transferenciaId: 7, producto: null, unidadEnviada: "UNIDAD", recibido: 1 }).ok,
    false
  );

  // Y la pantalla NUNCA manda un origenId: el origen sale de la transferencia
  // persistida y pedirlo dejaría espiar el catálogo de otro local.
  const src = leerSinComentarios(AGREGAR);
  assert.ok(!/origenId/.test(src), "la pantalla manda un origenId");
});

test("8b. una cantidad que no es un número no arma pedido", () => {
  for (const mala of ["", null, undefined, 0, -3, "abc"]) {
    const r = validarLineaNueva({
      transferenciaId: 1,
      producto: { productoLocalId: 9 },
      unidadEnviada: "UNIDAD",
      recibido: mala,
    });
    assert.equal(r.ok, false, `recibido=${JSON.stringify(mala)} tendría que rechazarse`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 9-13. YA EXISTÍA, QUITAR, Y RECARGAR DEL SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

test("9. yaExistia NO cierra, NO recarga y NO duplica: dice dónde corregir", () => {
  const modal = leerSinComentarios(AGREGAR);
  assert.ok(modal.includes("yaExistia"), "el modal no mira la respuesta yaExistia");
  assert.match(
    modal,
    /if \(json\.yaExistia\) \{[\s\S]{0,220}return;/,
    "yaExistia tiene que cortar antes de cerrar el modal"
  );
  assert.ok(modal.includes("MENSAJE_YA_EXISTIA"), "falta el mensaje compartido");
  assert.match(MENSAJE_YA_EXISTIA, /ya figura|corregí/i);

  const pagina = leerSinComentarios(PAGINA);
  assert.match(
    pagina,
    /json\?\.ok && !json\.yaExistia\) await cargar\(\)/,
    "yaExistia no puede disparar una recarga: no cambió nada en el servidor"
  );

  // Y en ningún lado se suma la cantidad sola.
  assert.ok(
    !/recibido\s*\+=|\+\s*Number\(cantidad\)/.test(modal),
    "la pantalla suma la cantidad a ciegas sobre la línea que ya existe"
  );
});

test("10. una línea agregada se muestra marcada como tal", () => {
  const presentacion = leerSinComentarios(PRESENTACION);
  assert.ok(presentacion.includes("BadgeAgregado"), "falta el badge");
  assert.match(presentacion, /agregadoEnRecepcion/, "el badge no mira el campo del servidor");
  assert.match(presentacion, /Agregado en recepci/, "el badge no dice qué es");

  // Y se dibuja en LAS DOS presentaciones.
  const tabla = leerSinComentarios(TABLA);
  assert.equal(
    (tabla.match(/<BadgeAgregado/g) || []).length,
    2,
    "el badge tiene que estar en la card y en la fila"
  );
});

test("11. SOLO una línea agregada ofrece quitarse", () => {
  assert.equal(
    sePuedeQuitarLinea({ linea: { agregadoEnRecepcion: true }, puedeRecibir: true }),
    true
  );
  assert.equal(
    sePuedeQuitarLinea({ linea: { agregadoEnRecepcion: false }, puedeRecibir: true }),
    false,
    "una línea del REMITO no se borra: haría desaparecer mercadería que sí salió"
  );
  assert.equal(sePuedeQuitarLinea({ linea: {}, puedeRecibir: true }), false);
  // Sin permiso de recibir, tampoco.
  assert.equal(
    sePuedeQuitarLinea({ linea: { agregadoEnRecepcion: true }, puedeRecibir: false }),
    false
  );

  // La tabla no dibuja el botón por su cuenta: pasa por el predicado.
  const tabla = leerSinComentarios(TABLA);
  assert.equal(
    (tabla.match(/sePuedeQuitar &&/g) || []).length,
    2,
    "las dos presentaciones tienen que preguntar antes de dibujar Quitar"
  );
  assert.ok(
    !/onQuitarLinea\(d\.id\)[\s\S]{0,40}<\/SunmiButton>\s*\)\s*\}\s*<\/td>\s*\)\s*:/.test(tabla),
    "hay un Quitar deshabilitado en vez de ausente"
  );
});

test("12. el DELETE manda transferenciaId y detalleId, y nada más", () => {
  const cuerpo = cuerpoQuitarLinea({ transferenciaId: "7", detalleId: "88" });
  assert.deepEqual(cuerpo, { transferenciaId: 7, detalleId: 88 });
  assert.equal(typeof cuerpo.detalleId, "number", "el id tiene que ir como número");

  const pagina = leerSinComentarios(PAGINA);
  assert.match(pagina, /method: "DELETE"/, "no hay DELETE");
  assert.ok(pagina.includes("cuerpoQuitarLinea"), "el cuerpo se arma a mano en vez de reusar");
});

test("13. después de agregar y de quitar se RECARGA del servidor", () => {
  const pagina = leerSinComentarios(PAGINA);

  const agregar = pagina.slice(pagina.indexOf("const agregarLinea"), pagina.indexOf("const quitarLinea"));
  assert.match(agregar, /await cargar\(\)/, "agregar no recarga del servidor");

  const quitar = pagina.slice(pagina.indexOf("const quitarLinea"));
  assert.match(quitar.slice(0, 900), /await cargar\(\)/, "quitar no recarga del servidor");

  // Y no se inventa la línea en el estado local.
  assert.ok(
    !/setEditItems\(\[\s*\.\.\.editItems,|editItems\.concat\(/.test(pagina),
    "la pantalla agrega la línea a mano en vez de leerla del servidor"
  );
  assert.ok(
    !/setItem\(\{ \.\.\.item, items:/.test(pagina),
    "la pantalla parchea el item en vez de releerlo"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 14-15 y 17. LO QUE NO SE PODÍA ROMPER
// ═══════════════════════════════════════════════════════════════════════════

test("14. confirmar sigue BLOQUEADO con cambios sin guardar", () => {
  const pagina = leerSinComentarios(PAGINA);
  const confirmar = pagina.slice(pagina.indexOf("const confirmarRecepcion"));
  assert.match(
    confirmar.slice(0, 400),
    /if \(dirty\) \{[\s\S]{0,200}return;/,
    "se perdió el bloqueo por cambios sin guardar"
  );

  // Y NO se agregó un guardado silencioso como efecto lateral de confirmar: ese
  // contrato no existe y escribir cantidades que nadie pidió es peor que un cartel.
  assert.ok(
    !/guardarCambios\(\)[\s\S]{0,80}confirmar-recepcion/.test(pagina),
    "confirmar guarda solo: eso es un contrato nuevo que nadie pidió"
  );

  // Lo que sí se agregó es que la regla se VEA antes de tocar el botón.
  const acciones = leerSinComentarios(ACCIONES);
  assert.ok(acciones.includes("AVISO_SIN_GUARDAR"), "falta el aviso a la vista");
  assert.match(acciones, /dirty &&/, "el aviso no depende de que haya cambios");
});

test("15. un estado no editable no muestra Agregar ni Quitar", () => {
  const pagina = leerSinComentarios(PAGINA);

  // La regla vive en UN lugar: `puedeRecibir` ya exige estado Enviada/Recibiendo
  // y ser el destino. La tabla no la repite, recibe —o no— el handler.
  assert.match(
    pagina,
    /onAgregarProducto=\{puedeRecibir \? \(\) => setAgregarAbierto\(true\) : null\}/,
    "el botón de agregar no está atado a puedeRecibir"
  );
  assert.match(
    pagina,
    /onQuitarLinea=\{puedeRecibir \? quitarLinea : null\}/,
    "quitar no está atado a puedeRecibir"
  );
  assert.match(
    pagina,
    /estadoValido =\s*item\.estado === "Enviada" \|\| item\.estado === "Recibiendo"/,
    "cambió qué estados permiten recibir"
  );

  // Y la tabla no dibuja nada si no le pasaron el handler.
  const tabla = leerSinComentarios(TABLA);
  assert.match(tabla, /\{onAgregarProducto && \(/, "el botón se dibuja sin handler");
  assert.match(tabla, /sePuedeQuitar && onQuitarLinea &&/, "quitar se dibuja sin handler");
});

test("17. recibido 0 sigue siendo 0 y no vuelve a ser lo enviado", () => {
  // El distingo que ya costó una corrección en esta pantalla: null es "todavía
  // no se contó", 0 es "no llegó nada". No se colapsan.
  assert.equal(estadoDeLinea({ enviada: 10, recibida: null }), ESTADO_LINEA.SIN_RECEPCION);
  assert.equal(estadoDeLinea({ enviada: 10, recibida: 0 }), ESTADO_LINEA.FALTANTE);
  assert.equal(diferenciaDeLinea({ enviada: 10, recibida: null }), null);
  assert.equal(diferenciaDeLinea({ enviada: 10, recibida: 0 }), -10);
  assert.equal(fmtDiferencia(diferenciaDeLinea({ enviada: 10, recibida: 0 })), "-10");

  // Y la página conserva el ternario que los separa al construir editItems.
  const pagina = leerSinComentarios(PAGINA);
  assert.match(
    pagina,
    /d\.cantidadRecibida == null \? d\.cantidadEnviada : d\.cantidadRecibida/,
    "volvió el fallback por truthiness: un 0 guardado reaparecería como el total enviado"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LO VISUAL QUE SÍ SE PUEDE AFIRMAR SIN NAVEGADOR
// ═══════════════════════════════════════════════════════════════════════════

test("el excedente NO se pinta como un error de validación", () => {
  const tabla = leerSinComentarios(TABLA);
  // El faltante conserva el rojo; el excedente usa el tono de aviso. Son dos
  // cosas distintas y la pantalla no puede decir que llegar de más está mal.
  assert.match(tabla, /FALTANTE\) tono = "sunmi-state-danger-soft"/);
  assert.match(tabla, /EXCEDENTE\) tono = "sunmi-state-warning-soft"/);
  assert.match(tabla, /FALTANTE\) return "sunmi-text-danger"/);
  assert.match(tabla, /EXCEDENTE\) return "sunmi-text-warning"/);
});

test("no hay colores ni medidas crudas en lo que se escribió esta tanda", () => {
  for (const rel of [AGREGAR, TABLA, PAGINA, ACCIONES, PRESENTACION]) {
    const src = leerSinComentarios(rel);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), `${rel} tiene un color hex`);
    assert.ok(!/rgba?\(/.test(src), `${rel} tiene un color rgb`);
    assert.ok(!/style=\{\{[^}]*(color|background)/i.test(src), `${rel} pinta con estilo inline`);
  }
});

test("una sola pieza para el teléfono y el escritorio: no hay dos modales", () => {
  const src = leerSinComentarios(AGREGAR);
  assert.match(src, /forma="hoja-o-centrado"/, "la forma responsive del kit no se usa");
  assert.equal(
    (src.match(/<SunmiModalLayout/g) || []).length,
    1,
    "hay más de un modal: sería una lógica por presentación"
  );
  // El kit, no piezas nuevas.
  for (const pieza of ["SunmiModalLayout", "SunmiButton", "SunmiInput", "SunmiCampoBusquedaVoz", "SunmiSelectorUnidad"]) {
    assert.ok(src.includes(pieza), `${pieza} tendría que reusarse`);
  }
});
