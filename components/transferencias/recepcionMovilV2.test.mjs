// LA V2 MÓVIL DEL CONTROL FÍSICO: LO QUE SE FUE Y LO QUE NO SE PUEDE PERDER.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/recepcionMovilV2.test.mjs
//
// ── QUÉ AFIRMA ESTE ARCHIVO ──────────────────────────────────────────────
//
// Los diez puntos que la V2 se comprometió a cumplir, escritos como
// afirmaciones sobre el código y no como intenciones. La mitad son NEGATIVOS
// —que algo dejó de estar— y esos son los que más falta hacen: lo que se saca
// vuelve solo, porque el que lo vuelve a escribir no sabe que se había sacado a
// propósito.
//
// ── POR QUÉ MIRA EL CÓDIGO Y NO RENDERIZA ────────────────────────────────
//
// Lo que hay que afirmar acá es de COMPOSICIÓN —qué se monta, dónde y bajo qué
// corte—, y eso vive en el árbol de JSX. Renderizar `RecepcionMovil` exigiría
// simular el shell, el contexto de acción, el router y los modales por portal
// para terminar afirmando lo mismo. Los candados de render que ya existen
// —`controlFisicoRender.test.mjs`— cubren lo que sí se puede montar suelto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PLACEHOLDER_BUSCADOR } from "./RecepcionMovil.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Sin comentarios: acá la prosa NOMBRA lo que se prohíbe, igual que siempre. */
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const MOVIL = "components/transferencias/RecepcionMovil.jsx";
const WORKSPACE = "components/transferencias/WorkspaceRecepcion.jsx";
const PAGINA = "app/modulos/transferencias/[id]/page.jsx";
const FICHA = "components/transferencias/FichaProductoRecepcion.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// 1-3. UN SOLO ENCABEZADO
// ═══════════════════════════════════════════════════════════════════════════

test("1. el teléfono NO dibuja un segundo «Volver a transferencias»", () => {
  const movil = codigoDe(MOVIL);
  assert.ok(
    !/Volver a transferencias/.test(movil),
    "volvió el segundo encabezado adentro del contenido"
  );

  // En la página sigue existiendo, pero SOLO para escritorio: la franja entera
  // está detrás de `hidden md:flex`, que es el mismo corte que usa el shell para
  // su fila de título. O manda uno o manda el otro, nunca los dos.
  const pagina = codigoDe(PAGINA);
  const franja = pagina.indexOf('className="hidden md:flex items-start justify-between');
  assert.ok(franja > 0, "la franja del encabezado dejó de estar acotada a escritorio");
  const posVolver = pagina.indexOf("Volver a transferencias");
  assert.ok(posVolver > franja, "el botón viejo quedó fuera de la franja de escritorio");
});

test("2. el teléfono NO dibuja «Volver al listado»", () => {
  // El producto ya no reemplaza a la lista: se abre en una hoja y la lista queda
  // atrás. Ese botón era la consecuencia del reemplazo y no tiene qué hacer.
  for (const rel of [MOVIL, WORKSPACE]) {
    const src = codigoDe(rel);
    if (rel === MOVIL) {
      assert.ok(!/Volver al listado/.test(src), "volvió el segundo Volver en el teléfono");
    }
  }
  // En escritorio ese botón nunca existió en la rama de dos columnas; el que
  // había era del apilado `lg:hidden`, que sigue siendo de escritorio.
  const ws = codigoDe(WORKSPACE);
  const apilado = ws.indexOf('className="lg:hidden space-y-2"');
  const escritorio = ws.indexOf('className="hidden md:block space-y-3"');
  assert.ok(escritorio > 0, "se perdió el envoltorio de escritorio");
  assert.ok(apilado > escritorio, "el apilado con «Volver al listado» salió de escritorio");
});

test("3. el «Volver» del teléfono usa el slot del shell y SunmiBackButton", () => {
  const pagina = codigoDe(PAGINA);
  assert.match(
    pagina,
    /useAccionDePagina\(\(\) => <SunmiBackButton href=\{LISTADO\} \/>, \[\]\)/,
    "la pantalla no registra su acción en el slot genérico del shell"
  );
  assert.match(pagina, /from "@\/app\/context\/AccionDePaginaContext"/);
  assert.match(pagina, /from "@\/components\/sunmi\/SunmiBackButton"/);

  // Y no se inventó un mecanismo propio ni se tocó el shell.
  assert.ok(!/AccionDePaginaProvider/.test(pagina), "la pantalla no monta su propio proveedor");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-5. EL BUSCADOR ES EL DEL ERP
// ═══════════════════════════════════════════════════════════════════════════

test("4. usa el SunmiCampoBusquedaVoz que ya existe, no uno nuevo", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /from "@\/components\/sunmi\/SunmiCampoBusquedaVoz"/);
  assert.match(movil, /<SunmiCampoBusquedaVoz/);
  assert.equal(PLACEHOLDER_BUSCADOR, "Buscar producto, código o categoría...");
  assert.ok(movil.includes("placeholder={PLACEHOLDER_BUSCADOR}"));

  // El Enter sigue entrando por el mismo handler que el escritorio: un lector
  // físico teclea el código y manda Enter, y eso lo resuelve la cascada.
  assert.match(movil, /onKeyDown=\{onTeclear\}/);
});

test("5. NO existe el botón «Escanear» pegado al buscador", () => {
  const movil = codigoDe(MOVIL);

  // Lo que se descartó es el botón ámbar al lado del campo. Se afirma sobre el
  // TEXTO exacto que tenía, y sobre que no quedó ningún botón que abra el
  // escáner en el bloque del buscador.
  assert.ok(!/"Escanear código"/.test(movil), "volvió el botón descartado");
  assert.ok(!/>\s*Escanear código\s*</.test(movil));

  // La cámara sigue accesible, pero desde "Más acciones", que es la superficie
  // aprobada menos invasiva mientras no haya una composición para ella.
  const posBuscador = movil.indexOf("<SunmiCampoBusquedaVoz");
  const posEscaner = movil.indexOf("onAbrirEscaner()");
  const posMasAcciones = movil.indexOf("TITULO_MAS_ACCIONES}");
  assert.ok(posEscaner > 0, "se perdió el acceso a la cámara");
  assert.ok(
    posEscaner > posMasAcciones,
    "el acceso a la cámara volvió al flujo principal en vez de vivir en Más acciones"
  );
  assert.ok(posEscaner > posBuscador + 500, "quedó un disparador de cámara pegado al buscador");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. EL PRODUCTO ES UNA HOJA
// ═══════════════════════════════════════════════════════════════════════════

test("6. el producto se presenta en una hoja del kit, no en un overlay a mano", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /from "@\/components\/sunmi\/SunmiModalLayout"/);

  // Tres hojas: producto, más acciones e información general. Las tres con la
  // forma del kit, ninguna con una capa escrita a mano.
  const hojas = [...movil.matchAll(/forma="hoja"/g)];
  assert.equal(hojas.length, 3, "cambió la cantidad de hojas de la composición móvil");
  assert.ok(
    !/fixed inset-0/.test(movil),
    "hay una capa de modal escrita a mano: eso ya lo resuelve SunmiModalLayout"
  );

  // La ficha va SIN su tarjeta adentro de la hoja, y cierra sola al guardar.
  assert.match(movil, /enHoja\n/);
  assert.match(movil, /onGuardado=\{onCerrarProducto\}/);

  const ficha = codigoDe(FICHA);
  assert.match(ficha, /const Envoltorio = enHoja \? "div" : SunmiCard/);
  // Y solo cierra cuando salió BIEN.
  assert.match(ficha, /setError\([\s\S]{0,80}\);\s*return;\s*\}\s*onGuardado\?\.\(\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. LO ADMINISTRATIVO NO OCUPA EL FLUJO FÍSICO
// ═══════════════════════════════════════════════════════════════════════════

test("7. PDF, ticket y cancelación no están expandidos en el flujo principal", () => {
  const movil = codigoDe(MOVIL);

  // Los cuatro existen, y los cuatro están DESPUÉS de que se abre la hoja de
  // "Más acciones". Si alguno subiera al flujo, su posición caería antes.
  const inicioHoja = movil.indexOf("open={masAcciones}");
  assert.ok(inicioHoja > 0, "se perdió la hoja de Más acciones");

  for (const texto of ["PDF de envío", "PDF de recepción", "Imprimir ticket POS", "Cancelar transferencia"]) {
    const pos = movil.indexOf(texto);
    assert.ok(pos > 0, `desapareció «${texto}»`);
    assert.ok(pos > inicioHoja, `«${texto}» volvió al flujo físico`);
  }

  // Y en la página, la card de acciones quedó acotada a escritorio.
  const pagina = codigoDe(PAGINA);
  const posDiv = pagina.indexOf('<div className="hidden md:block">');
  const posAcciones = pagina.indexOf("<AccionesRecepcion");
  assert.ok(posDiv > 0 && posAcciones > posDiv, "la card de acciones sigue expandida en el teléfono");

  // La información general tampoco: se llega por la hoja, con el MISMO componente.
  assert.match(movil, /<TransferenciaHeader item=\{item\} \/>/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. EL ESCRITORIO NO SE REHIZO
// ═══════════════════════════════════════════════════════════════════════════

test("8. escritorio conserva su composición y sus contratos", () => {
  const ws = codigoDe(WORKSPACE);

  // Las piezas del escritorio siguen ahí, con el mismo contrato.
  assert.match(ws, /<ResumenControlFisico resumen=\{resumen\} filtro=\{filtro\} onFiltrar=\{setFiltro\} \/>/);
  assert.match(ws, /<SunmiSelectorUnidad/, "el escritorio perdió su selector de tabs");
  assert.match(ws, /<SunmiChipsFiltro/, "el escritorio perdió sus chips de categoría");
  assert.match(ws, /className="hidden lg:grid lg:grid-cols-2 gap-3 items-start"/);
  assert.match(ws, /<SectionHead\s*\n\s*title="Control de recepción"/);

  // Y todo eso vive detrás del corte `md`, así que de 768 px para arriba se
  // dibuja exactamente lo que se dibujaba antes.
  const escritorio = ws.indexOf('<div className="hidden md:block space-y-3">');
  assert.ok(escritorio > 0, "se perdió el envoltorio de escritorio");
  for (const marca of ["<ResumenControlFisico", "<SunmiSelectorUnidad", "<SunmiChipsFiltro", "hidden lg:grid"]) {
    assert.ok(ws.indexOf(marca) > escritorio, `${marca} quedó fuera del envoltorio de escritorio`);
  }

  // La ficha de escritorio NO va en hoja: su default es la tarjeta de siempre.
  const ficha = codigoDe(FICHA);
  assert.match(ficha, /enHoja = false/, "la ficha cambió su default y eso movería el escritorio");
});

test("8b. UNA sola lógica: la composición móvil no decide nada", () => {
  const movil = codigoDe(MOVIL);

  // No busca, no filtra, no resuelve códigos y no llama a ningún endpoint.
  for (const prohibido of [
    "productosVisibles(", "resumenDeRecepcion(", "categoriasDelRemito(",
    "resolverEntrada(", "fetch(", "useMemo(",
  ]) {
    assert.ok(
      !movil.includes(prohibido),
      `la composición móvil está decidiendo por su cuenta: «${prohibido}»`
    );
  }

  // Su único estado son las dos hojas que abre. Eso es qué se ve, no negocio.
  const estados = [...movil.matchAll(/useState\(/g)];
  assert.equal(estados.length, 2, "la composición móvil se guardó estado de negocio");

  // Y el cerebro le pasa lo que ya calculó.
  const ws = codigoDe(WORKSPACE);
  assert.match(ws, /<RecepcionMovil/);
  for (const prop of ["resumen={resumen}", "categorias={categorias}", "onRevisar={onRevisar}"]) {
    assert.ok(ws.includes(prop), `el cerebro dejó de pasarle ${prop}`);
  }

  // ── EL ORDEN DEL TELÉFONO TAMBIÉN LO DECIDE EL CEREBRO ──────────────────
  //
  // Decía `visibles={visibles}`. El V15 manda lo no declarado al TOPE en el
  // teléfono, y ese reordenamiento vive en el workspace y no acá: la lista sale
  // de `productosVisibles`, que comparten las dos superficies, y reordenarla
  // allá movería escritorio.
  //
  // Lo que este candado sigue defendiendo es lo mismo de antes: que la
  // composición móvil reciba la lista hecha y no se arme una. Por eso se exige
  // que `visiblesMovil` DERIVE de `visibles` —misma fuente, solo otro orden— y
  // que el móvil no ordene nada por su cuenta.
  assert.ok(ws.includes("visibles={visiblesMovil}"), "el cerebro dejó de pasarle la lista del móvil");
  assert.match(ws, /const visiblesMovil = useMemo\(/, "el orden del móvil dejó de vivir en el cerebro");
  assert.match(ws, /\[\.\.\.visibles\]\.sort\(/, "la lista del móvil dejó de derivar de `visibles`");
  assert.ok(!movil.includes(".sort("), "la composición móvil se puso a ordenar por su cuenta");
});

// ═══════════════════════════════════════════════════════════════════════════
// 9-10. LA REGLA DE CONFIRMAR, Y NADA DE BACKEND
// ═══════════════════════════════════════════════════════════════════════════

test("9. confirmar sigue bloqueado mientras queden productos sin revisar", () => {
  const movil = codigoDe(MOVIL);

  // El deshabilitado se DERIVA del resumen, no de una segunda cuenta.
  assert.match(movil, /const pendientes = resumen\?\.pendientes \?\? 0/);
  assert.match(movil, /const todoRevisado = pendientes === 0 && \(resumen\?\.totalRemito \?\? 0\) > 0/);

  // ── AHORA SON DOS IMPEDIMENTOS, NO UNO ──────────────────────────────────
  //
  // Decía `disabled={!todoRevisado || confirmando}`. El V15 agrega el segundo
  // caso del diseño: una diferencia que nadie explicó también traba el cierre.
  // No es aflojar el candado — es que ahora hay más razones para no dejar
  // confirmar, y las dos siguen derivando del mismo resumen.
  //
  // `trabado` junta las dos para que el botón tenga UNA condición y el aviso
  // pueda decir cuál de las dos es. Si el botón las evaluara por su cuenta,
  // podrían decir cosas distintas.
  // El V16 sumó la tercera causa: un no declarado agregado en cero es un
  // borrador, y confirmarlo sería cerrar el remito con una línea que no
  // informa nada. Las tres van en la MISMA condición.
  assert.match(movil, /const trabado = !todoRevisado \|\| sinMotivo > 0 \|\| sinCargar > 0/);
  assert.match(movil, /const sinCargar = \(item\?\.items \|\| \[\]\)\.filter\(/);
  assert.match(movil, /disabled=\{trabado \|\| confirmando\}/);

  // ── EL AVISO SE FUE EN EL V16; LA REGLA NO ──────────────────────────────
  //
  // Este candado exigía `const avisoDeCierre =` y el texto "diferencias sin
  // motivo". Ese renglón se sacó de la barra porque era el tercer lugar
  // contando lo mismo, y con él se fue la constante: dejarla habría sido código
  // muerto con un candado defendiéndolo.
  //
  // Lo que se exige ahora es que no haya vuelto por otra puerta —que el botón
  // no evalúe las dos causas por su cuenta— y que `sinMotivo` siga derivándose
  // de las líneas. Sin esto, alguien podría dejar `trabado` intacto y aun así
  // habilitar el botón desde otro lado.
  assert.ok(!movil.includes("avisoDeCierre"), "volvió el aviso que el V16 sacó de la barra");
  assert.match(movil, /const sinMotivo = \(item\?\.items \|\| \[\]\)\.filter\(/);
  assert.equal(
    (movil.match(/disabled=\{trabado/g) || []).length,
    1,
    "hay más de un lugar decidiendo si se puede confirmar"
  );

  // Y el servidor sigue siendo la autoridad: la guarda no se tocó.
  const confirmar = codigoDe("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(confirmar, /PRODUCTOS_SIN_REVISAR/, "se perdió la guarda del servidor");
  assert.match(confirmar, /originalesSinRevisar\(/);
});

test("10. ninguna modificación de schema, migraciones ni endpoints", () => {
  // Se afirma sobre el CONTENIDO, no sobre el diff: un candado que mira `git`
  // no corre en la imagen, y uno que mira el diff afirma sobre la rama y no
  // sobre el código. Lo que tiene que seguir cierto es que las piezas de esta
  // tanda no llaman a ningún endpoint nuevo ni tocan Prisma.
  const movil = codigoDe(MOVIL);
  const filtro = codigoDe("components/sunmi/SunmiFiltroEstado.jsx");

  for (const src of [movil, filtro]) {
    assert.ok(!/fetch\(/.test(src), "una pieza de presentación está llamando a la API");
    assert.ok(!/prisma/i.test(src), "una pieza de presentación nombra Prisma");
    assert.ok(!/\/api\/transferencias\/(revisar-producto|confirmar-recepcion|guardar-recepcion)/.test(src));
  }

  // La única migración de esta línea de trabajo sigue siendo la que ya está en
  // producción, y esta tanda no agrega ninguna.
  // ── EL CONTEO SUBIÓ A 9, Y SE ACTUALIZA A PROPÓSITO ───────────────────
  //
  // La V2 móvil no traía migraciones y este candado lo fijaba en 8. El
  // 2026-09-09 entró `20260909170000_presentacion_envio_snapshot`, que es de
  // OTRA tanda —la del formato de origen— y está autorizada: congela en qué
  // presentación salió la mercadería para que editar el catálogo no reescriba
  // un remito ya despachado.
  //
  // Lo que este candado sigue afirmando es que nadie agregue una migración sin
  // que se note. Por eso se nombran las dos.
  const migraciones = fs
    .readdirSync(path.join(RAIZ, "prisma/migrations"))
    .filter((d) => /^\d/.test(d));
  // El 2026-09-10 entro la tercera: `20260910120000_presentacion_adoptada_en_recepcion`,
  // que registra QUIEN y CUANDO adopto la presentacion actual sobre una linea
  // historica. Dos columnas nulables y una FK, sin backfill.
  assert.equal(migraciones.length, 10, "aparecio una migracion que nadie declaro aca");
  assert.ok(migraciones.includes("20260908213000_recepcion_control_fisico"));
  assert.ok(migraciones.includes("20260909170000_presentacion_envio_snapshot"));
  assert.ok(migraciones.includes("20260910120000_presentacion_adoptada_en_recepcion"));
});
