// CONTRAPRUEBAS DE LOS SIETE DEFECTOS DE LA REVISIÓN.
//
// Un candado que nunca se vio en rojo no afirma nada: se ve igual que uno que
// acompaña. Acá se reintroduce cada defecto, uno por vez, sobre una COPIA
// descartable, y se exige que el candado que lo defiende se ponga rojo.
//
// Dos cuidados que ya se cobraron en este proyecto:
//
//  1. Se verifica que la inyección OCURRIÓ. Una vez se rompió un parámetro que
//     la función nunca reenviaba: el candado siguió verde y por un rato pareció
//     que el candado era flojo, cuando el flojo era el destrozo.
//  2. Se exige que el rojo sea el DEL CANDADO ESPERADO, por nombre. Un archivo
//     que deja de parsear pone todo rojo y eso no prueba nada.
//
//   node scripts/contrapruebas-revision.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ORIGEN = process.cwd();

const CASOS = [
  {
    n: 1,
    defecto: "desmarcar vuelve a pasar por el validador y reescribe el conteo",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    de: "      if (!revisado) {",
    a: "      if (false) {",
    candado: "1. desmarcar toca SOLO los tres campos de la revisión",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "1b",
    defecto: "la validación vuelve a partir de lo enviado y no de lo persistido",
    // El ancla se MUDÓ, y el script lo dijo en voz alta: "la inyección no aplica
    // (0 coincidencias)". Al centralizar la escala de recepción, el armado del
    // detalle a validar salió de la ruta y pasó a `detalleParaValidar`, en el
    // dominio compartido. La contraprueba sigue al código: si se quedaba
    // apuntando al archivo viejo, inyectaba sobre nada y dejaba de probar que el
    // candado 1b sirve — que es exactamente lo que este script existe para
    // detectar, y por eso frena el CI en vez de pasar en verde.
    //
    // La indentación baja de diez espacios a seis: allá la línea vivía dentro
    // del objeto de la llamada, acá dentro del objeto que devuelve la función.
    archivo: "lib/transferencias/recepcionServidor.js",
    de: "      recibido: d.recibido,",
    a: "      recibido: body.recibido,",
    candado: "1b. y marcar con un cuerpo PARCIAL conserva lo persistido",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 2,
    defecto: "vuelve el stock del origen a la pantalla de recepción",
    archivo: "components/transferencias/AgregarProductoRecibido.jsx",
    de: "          <span className=\"font-mono\">{p.codigoBarra || \"Sin código\"}</span>",
    a: "          <span className=\"font-mono\">Stock origen {p.stockActual}</span>",
    candado: "2. la búsqueda de producto no declarado no muestra stock ni costo",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 3,
    defecto: "el catálogo del origen vuelve a estar disponible siempre",
    archivo: "components/transferencias/WorkspaceRecepcion.jsx",
    // El ancla es la del BOTÓN, no la del texto del aviso. Apuntarle al texto
    // fue lo que la primera corrida dejó pasar, y recortarla a la indentación
    // del botón no alcanzó: con ocho espacios el ancla vive DENTRO de la línea
    // de doce. Se ancla en la línea siguiente, que es la que la distingue.
    // ── LA GUARDA CAMBIÓ DE FORMA ────────────────────────────────────────
    //
    // Era `aviso === MENSAJE_NO_FIGURA`, y ese aviso solo existía después de
    // tocar Enter. Ahora la guarda es `noFigura`, un booleano derivado del texto
    // contra la transferencia completa. El ancla sigue al código: lo que se
    // inyecta —sacarle la condición al botón— es exactamente lo mismo.
    // Y la sangria bajo de diez a ocho espacios cuando el bloque salio de
    // adentro de la card de busqueda para irse debajo de los filtros. El ancla
    // sigue al codigo: con la vieja no matcheaba nada y el script lo dijo.
    de: "noFigura && puedeRecibir && (\n        <SunmiButton color=\"slate\"",
    a: "puedeRecibir && (\n        <SunmiButton color=\"slate\"",
    candado: "3. la acción del catálogo del origen solo existe tras no encontrar",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 4,
    defecto: "vuelve el copy que suena a agregarse mercadería",
    archivo: "components/transferencias/AgregarProductoRecibido.jsx",
    de: "export const ACCION_AGREGAR = \"Informar producto no declarado\";",
    a: "export const ACCION_AGREGAR = \"Agregar a recepción\";",
    candado: "4. el lenguaje es INFORMAR una inconsistencia, no agregarse mercadería",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 5,
    defecto: "el producto no declarado vuelve a inventar una categoría del remito",
    archivo: "lib/transferencias/controlFisico.js",
    de: "    if (d.agregadoEnRecepcion === true) continue;",
    a: "    if (false) continue;",
    candado: "5. un producto no declarado NO contamina las categorías del remito",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6",
    defecto: "la tabla histórica vuelve a restar en la escala del pack",
    archivo: "components/transferencias/TablaDetalleTransferencia.jsx",
    de: "    const diff = envFis == null || recFis == null ? null : recFis - envFis;",
    a: "    const diff = recibido == null ? null : recibido - enviada;",
    candado: "6. la tabla histórica mide la diferencia en FÍSICO",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6b",
    defecto: "el ajuste informativo del origen vuelve a ignorar las sueltas",
    archivo: "app/api/transferencias/detalle/route.js",
    de: "              recibidaSueltas: d.recibidoUnidadesSueltas,",
    a: "              recibidaSueltas: null,",
    candado: "6b. el endpoint de detalle pasa las sueltas al ajuste del origen",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6c",
    defecto: "el tile de diferencias vuelve a comparar cantidades de presentación",
    archivo: "app/modulos/transferencias/[id]/page.jsx",
    de: "    const e = estadoDeProducto({ ...d, revisadoEnRecepcion: true });",
    a: "    return num(d.cantidadRecibida) !== num(d.cantidadEnviada);",
    candado: "6c. el tile de la página cuenta diferencias con el MISMO estado que las cards",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6e",
    defecto: "la valorización vuelve a ignorar las sueltas",
    archivo: "lib/transferencias/costoTransferencia.js",
    de: "  return rec + sueltas / f;",
    a: "  return rec;",
    candado: "6e. la VALORIZACIÓN incluye las sueltas, y esa división es de dinero",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 7,
    defecto: "la recepción vuelve a tener su propia lista de códigos escaneables",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  return codigosDeItem(d);",
    a: "  return [d.codigoBarraPropio, d.codigoBarra, d.codigoBarraSecundario].filter(Boolean);",
    candado: "7. los códigos escaneables salen de `codigosDeItem`, no de una lista propia",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  // ── LOS TRES DE LA SEGUNDA REVISIÓN (2026-09-09) ────────────────────────
  {
    n: "I-1",
    defecto: "el editor por lotes vuelve a gobernar el puesto de control físico",
    archivo: "lib/transferencias/recepcionUI.js",
    de: "  const conservar = modo === MODO_RECEPCION.EDITOR_LOTES && preservar === true;",
    a: "  const conservar = preservar === true;",
    candado: "1. contar 5 packs + 5 sueltas y recargar NO deja un dirty fantasma",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-1b",
    defecto: "Confirmar vuelve a leer el dirty crudo del editor por lotes",
    archivo: "app/modulos/transferencias/[id]/page.jsx",
    de: "  const dirtyEfectivo = modo === MODO_RECEPCION.EDITOR_LOTES && dirty;",
    a: "  const dirtyEfectivo = dirty;",
    candado: "1e. LA CONEXIÓN REAL: la página no puede dejar que el legacy la gobierne",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-1c",
    defecto: "revisar vuelve a pedir la preservación legacy",
    archivo: "app/modulos/transferencias/[id]/page.jsx",
    // ── EL ANCLA TENÍA QUE CRECER: DEJÓ DE SER ÚNICA ─────────────────────
    //
    // `if (json?.ok) await cargar();` aparecía una sola vez. El 2026-09-10 se
    // sumó `adoptarPresentacion`, que recarga fresco por el mismo motivo y con
    // la misma línea — así que el ancla pasó a matchear dos lugares y el script
    // lo dijo: "la inyección no aplica (2 coincidencias)".
    //
    // Se ancla desde el `fetch`, que sí identifica a cuál de los dos handlers
    // pertenece. Inyectar en el equivocado habría puesto en rojo un candado que
    // no es el que este caso defiende.
    de:
      '"/api/transferencias/revisar-producto", {\n' +
      "        method: \"POST\",\n" +
      "        body: JSON.stringify({ transferenciaId: item.id, ...cuerpo }),\n" +
      "      });\n" +
      "      const json = await res.json();\n" +
      "      if (json?.ok) await cargar();",
    a:
      '"/api/transferencias/revisar-producto", {\n' +
      "        method: \"POST\",\n" +
      "        body: JSON.stringify({ transferenciaId: item.id, ...cuerpo }),\n" +
      "      });\n" +
      "      const json = await res.json();\n" +
      "      if (json?.ok) await cargar({ preservarEdicion: true });",
    candado: "1e. LA CONEXIÓN REAL: la página no puede dejar que el legacy la gobierne",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-2",
    defecto: "el chip de categoría del remito vuelve a filtrar los no declarados",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  if (categoriaId && !filtraNoDeclarados) {",
    a: "  if (categoriaId) {",
    candado: "2. con una categoría del remito elegida, los NO DECLARADOS igual aparecen",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-3",
    defecto: "Enter vuelve a ser siempre un escaneo: un nombre único ya no abre",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  if (porTexto.length === 1) {",
    a: "  if (false) {",
    candado: "3b. una sola coincidencia POR NOMBRE también abre",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-3b",
    defecto: "con varios resultados se elige el primero al azar",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  return { tipo: RESOLUCION.LISTA, resultados: porTexto, porCodigo: false };",
    a: "  return { tipo: RESOLUCION.ABRIR, producto: porTexto[0], porCodigo: false };",
    candado: "3c. con varias coincidencias NO se elige una, y NO se dice que no figura",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  {
    n: "I-3c",
    defecto: "la cámara vuelve a caer por nombre y abre el producto equivocado",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  if (soloCodigo) return { tipo: RESOLUCION.NO_FIGURA, resultados: [], porCodigo: true };",
    a: "  if (false) return { tipo: RESOLUCION.NO_FIGURA, resultados: [], porCodigo: true };",
    candado: "3e. la CÁMARA no cae por nombre: un código que no está es 'no figura'",
    suite: "lib/transferencias/integracionRecepcion.test.mjs",
  },
  // ── LOS CUATRO DE LA LIMPIEZA DE HARDCODEO (2026-09-09) ────────────────
  //
  // El trinquete global quedó verde con estos adentro, así que el candado de
  // cero hardcodeo es lo único que los cubre. Que se ponga rojo con cada uno es
  // lo que separa ese candado de un archivo que acompaña.
  {
    n: "H-1",
    defecto: "vuelve la grilla de valor arbitrario al puesto de trabajo",
    archivo: "components/transferencias/WorkspaceRecepcion.jsx",
    de: '<div className="hidden lg:grid lg:grid-cols-2 gap-3 items-start">',
    a: '<div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">',
    candado: "las piezas del control físico no tienen NINGÚN valor visual arbitrario",
    suite: "components/transferencias/ceroHardcodeoControlFisico.test.mjs",
  },
  {
    n: "H-2",
    defecto: "el escáner del kit vuelve a conocer el número del apilado",
    archivo: "components/sunmi/SunmiEscanerCodigoBarra.jsx",
    de: "      z={NIVEL_MODAL_GLOBAL}",
    a: "      z={9999}",
    candado: "las piezas del control físico no tienen NINGÚN valor visual arbitrario",
    suite: "components/transferencias/ceroHardcodeoControlFisico.test.mjs",
  },
  {
    n: "H-3",
    defecto: "el escáner vuelve a elegir su propia medida responsive",
    archivo: "components/sunmi/SunmiEscanerCodigoBarra.jsx",
    de: '      forma="hoja-o-centrado"',
    a: '      forma="hoja-o-centrado"\n      maxWidth="sm:max-w-lg"',
    candado: "las piezas del control físico no tienen NINGÚN valor visual arbitrario",
    suite: "components/transferencias/ceroHardcodeoControlFisico.test.mjs",
  },
  {
    n: "H-4",
    defecto: "vuelve la grilla arbitraria del pie de producto no declarado",
    archivo: "components/transferencias/AgregarProductoRecibido.jsx",
    de: '<div className="flex flex-col sm:flex-row gap-2 w-full">',
    a: '<div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 w-full">',
    candado: "las piezas del control físico no tienen NINGÚN valor visual arbitrario",
    suite: "components/transferencias/ceroHardcodeoControlFisico.test.mjs",
  },
  {
    n: "24-25",
    defecto: "marcar deja de escribir la autoría",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    de: "          revisadoEnRecepcionPorId: usuarioId,",
    a: "          revisadoEnRecepcionPorId: Number(body?.usuarioId || 0),",
    candado: "24-25. guardar un borrador NO marca revisado; revisar SÍ lo persiste",
    suite: "lib/transferencias/controlFisico.test.mjs",
  },

  // ── LOS TRES DE LA TANDA DE UX, 2026-09-10 ─────────────────────────────
  //
  // Un candado que nunca se vio en rojo se lee igual que uno que funciona. Los
  // tres defectos que esta tanda vino a cerrar tienen su inyección acá.
  {
    n: "U-1",
    defecto: "«Todos» vuelve a esconder los productos no declarados",
    archivo: "lib/transferencias/controlFisico.js",
    // El ancla lleva la línea de arriba porque `return true;` solo, en un
    // archivo con siete `case`, no identifica cuál se está rompiendo.
    de: "      // 52. Los dos números son correctos porque cuentan cosas distintas.\n      return true;",
    a: "      // 52. Los dos números son correctos porque cuentan cosas distintas.\n      return esDelRemito;",
    candado: "4. un no declarado aparece en «Todos»",
    suite: "lib/transferencias/busquedaYNoDeclarados.test.mjs",
  },
  {
    n: "U-2",
    defecto: "«no figura» vuelve a decidirse contra la lista FILTRADA",
    archivo: "components/transferencias/WorkspaceRecepcion.jsx",
    // Es el error exacto que el nombre del parámetro existe para evitar: con la
    // lista filtrada, un producto tapado por un filtro se lee como ausente y la
    // pantalla ofrece duplicarlo.
    de: "    () => items.length > 0 && faltaEnLaTransferencia(items, texto),",
    a: "    () => items.length > 0 && faltaEnLaTransferencia(visibles, texto),",
    candado: "2c. LA CONTRAPRUEBA: preguntarle a la lista filtrada daría lo contrario",
    suite: "lib/transferencias/busquedaYNoDeclarados.test.mjs",
  },
  {
    n: "U-3",
    defecto: "adoptar vuelve a poder pisar una presentación registrada al despachar",
    archivo: "lib/transferencias/adopcionDePresentacion.js",
    de: "  if (linea.presentacionEnvio) {\n    return { ok: false, motivo: MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT };",
    a: "  if (false) {\n    return { ok: false, motivo: MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT };",
    candado: "16. una línea CON snapshot de despacho no ofrece adoptar nada",
    suite: "lib/transferencias/adopcionDePresentacion.test.mjs",
  },
];

// `node_modules` se ENLAZA en vez de copiarse: son doce copias y nada de lo que
// se rompe a propósito vive ahí adentro. `.git` tampoco viaja.
const copiar = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), "contra-"));
  for (const entrada of fs.readdirSync(ORIGEN)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    execFileSync("cp", ["-a", path.join(ORIGEN, entrada), destino]);
  }
  fs.symlinkSync(path.join(ORIGEN, "node_modules"), path.join(destino, "node_modules"));
  return destino;
};

const correr = (raiz, suite) => {
  try {
    return execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", "--test", suite],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
};

let fallas = 0;
for (const c of CASOS) {
  const raiz = copiar();
  const archivo = path.join(raiz, c.archivo);
  const antes = fs.readFileSync(archivo, "utf8");

  // 1. La inyección tiene que ocurrir de verdad, y una sola vez.
  const apariciones = antes.split(c.de).length - 1;
  if (apariciones !== 1) {
    console.log(`✗ ${c.n}  la inyección no aplica (${apariciones} coincidencias de la ancla)`);
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }
  fs.writeFileSync(archivo, antes.replace(c.de, c.a));

  // 2. El candado esperado tiene que ponerse rojo, POR SU NOMBRE.
  const salida = correr(raiz, c.suite);
  const rojoEsperado = salida.includes(`not ok`) && salida.includes(c.candado)
    && new RegExp(`not ok \\d+ - ${c.candado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(salida);

  // 3. Y el archivo tiene que seguir parseando: un rojo por sintaxis rota no
  //    prueba que el candado mire nada.
  const explotoTodo = /Cannot find module|SyntaxError/.test(salida);

  if (rojoEsperado && !explotoTodo) {
    console.log(`✓ ${c.n}  ${c.defecto} → ROJO en «${c.candado}»`);
  } else {
    console.log(`✗ ${c.n}  ${c.defecto} → el candado NO se puso rojo`);
    if (explotoTodo) console.log("     (el módulo no cargó: el rojo no vale)");
    fallas++;
  }
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(fallas === 0 ? `\n${CASOS.length}/${CASOS.length} contrapruebas en rojo, como corresponde` : `\n${fallas} contrapruebas NO probaron nada`);
process.exit(fallas === 0 ? 0 : 1);
