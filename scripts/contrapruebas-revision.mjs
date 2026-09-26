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
    // La fila se mudó a `FilaCatalogoRecepcion` con el V16 —la dibujan las dos
    // superficies— así que la inyección se mudó con ella. El candado ya mira los
    // dos archivos; lo que había que seguir es DÓNDE se rompe.
    n: 2,
    defecto: "vuelve el stock del origen a la pantalla de recepción",
    archivo: "components/transferencias/FilaCatalogoRecepcion.jsx",
    de: "            <span className=\"font-mono\">{p?.codigoBarra || \"Sin código\"}</span>",
    a: "            <span className=\"font-mono\">Stock origen {p?.stockActual}</span>",
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
    de: "    const diff = envFis == null ? null : diferenciaDeLinea({ enviada: envFis, recibida: recFis });",
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

  // ── LAS TRES DEL BUSCADOR MÓVIL DE PRODUCTOS ───────────────────────────
  //
  // Son las tres formas de traer de vuelta el "quiquilmes": atar el input al
  // estado confirmado, confirmar por tecla, o volver a hidratar desde
  // `searchParams` comparando cadenas.
  {
    n: "B-1",
    defecto: "el input vuelve a mostrar el estado confirmado en vez del borrador",
    archivo: "app/modulos/productos/page.jsx",
    // Es LA línea. Con esto, un `router.replace` propio que aterriza tarde le
    // reescribe el texto a quien está escribiendo.
    de: "                  value={textoBusquedaMovil}",
    a: "                  value={filtros.search}",
    candado: "EL BUSCADOR MÓVIL MUESTRA EL BORRADOR, NO EL ESTADO CONFIRMADO",
    suite: "app/modulos/productos/buscadorMovilCableado.test.mjs",
  },
  {
    n: "B-2",
    defecto: "vuelve la confirmación por tecla: siete pedidos para «quilmes»",
    archivo: "app/modulos/productos/page.jsx",
    de: "    confirmadorRef.current.programar(texto);",
    a: "    confirmarBusquedaRef.current(texto);",
    candado: "teclear toca el borrador y NO aplica filtros de una",
    suite: "app/modulos/productos/buscadorMovilCableado.test.mjs",
  },
  {
    n: "B-3",
    defecto: "un eco propio de la URL vuelve a poder hidratar el estado",
    archivo: "lib/productos/busquedaDelCatalogo.js",
    // La clasificación vieja: cualquier cambio de URL valía, y distinguir el eco
    // quedaba en manos de comparar contra UNA sola URL recordada.
    de: "  return origen === ORIGEN_DE_URL.INICIAL || origen === ORIGEN_DE_URL.HISTORIAL;",
    a: "  return true;",
    candado: "1. UN ECO PROPIO DE LA URL NO PUEDE HIDRATAR EL ESTADO",
    suite: "lib/productos/busquedaDelCatalogo.test.mjs",
  },
  {
    n: "B-4",
    defecto: "la puerta única deja de cancelar la búsqueda diferida",
    archivo: "app/modulos/productos/page.jsx",
    // Sin esto, tocar una card o elegir un filtro en la hoja quedaba deshecho
    // 250 ms más tarde por un temporizador que nadie apagó.
    de: "    confirmadorRef.current?.cancelar();\n    setFiltros(nuevos);",
    a: "    setFiltros(nuevos);",
    candado: "LA PUERTA ÚNICA CANCELA, FIJA Y REPONE EL BORRADOR, LAS TRES JUNTAS",
    suite: "app/modulos/productos/buscadorMovilCableado.test.mjs",
  },
  {
    n: "B-5",
    defecto: "la puerta única deja de reponer el borrador",
    archivo: "app/modulos/productos/page.jsx",
    // El campo sigue diciendo "quilmes" sobre un listado que ya no la filtra.
    de: "    setTextoBusquedaMovil(nuevos.search ?? \"\");",
    a: "    void nuevos;",
    candado: "LA PUERTA ÚNICA CANCELA, FIJA Y REPONE EL BORRADOR, LAS TRES JUNTAS",
    suite: "app/modulos/productos/buscadorMovilCableado.test.mjs",
  },
  {
    n: "B-6",
    defecto: "Atrás deja de cancelar lo pendiente y la búsqueda vieja revive",
    archivo: "app/modulos/productos/page.jsx",
    de: "      confirmadorRef.current?.cancelar();\n\n      const estado = normalizarEstadoDeUrl({",
    a: "      const estado = normalizarEstadoDeUrl({",
    candado: "EL HISTORIAL CANCELA LO PENDIENTE ANTES DE HIDRATAR",
    suite: "app/modulos/productos/buscadorMovilCableado.test.mjs",
  },

  // ── LAS TRES DE LA VALORIZACIÓN DEL REMITO ────────────────────────────
  //
  // El defecto de la #198: "Costo PACK x24 · $218,75 · Total $1.312,50" sobre
  // una línea que vale $5.250 el pack y $31.500 la línea. Éstas son las tres
  // formas de traerlo de vuelta.
  {
    n: "V-1",
    defecto: "la card vuelve a mostrar el costo de la UNIDAD bajo el rótulo del PACK",
    archivo: "app/api/transferencias/detalle/route.js",
    de: "        precioCosto: remito.costoPresentacion,",
    a: "        precioCosto: costoNormalizado,",
    candado: "la ruta manda el costo DE LA PRESENTACIÓN y el subtotal DEL REMITO",
    suite: "app/api/transferencias/valorizacionDelDetalle.test.mjs",
  },
  {
    n: "V-2",
    defecto: "el subtotal vuelve a mezclar escalas: cantidad presentada × costo por unidad",
    archivo: "lib/transferencias/costoTransferencia.js",
    // Es LA línea. Sin pasar por las unidades físicas, 6 packs × 218,75 vuelve
    // a dar 1.312,50 sobre un remito de 31.500.
    de: "  const unidadesFisicas = unidadesFisicasDelDescriptor(envio);",
    a: "  const unidadesFisicas = Number(envio.cantidad) || 0;",
    // Sin `#` en el nombre a propósito: en TAP ese carácter abre un comentario,
    // node lo escapa como `\#` y el match por nombre de esta contraprueba no lo
    // encontraba — informaba "el candado NO se puso rojo" sobre un candado que
    // sí se había puesto rojo.
    candado: "T198 ·LA LÍNEA REAL: PACK x24, costo 5.250, subtotal 31.500",
    suite: "lib/transferencias/valorizacionDelRemito.test.mjs",
  },
  {
    n: "V-3",
    defecto: "valorizar lo recibido vuelve a leer `recibido` crudo, en otra escala",
    archivo: "lib/transferencias/costoTransferencia.js",
    de: "  const cantidad = recibidasFisicas / porUnidadDeLaCantidad;",
    a: "  const cantidad = aNumero(detalle.recibido) ?? 0;",
    candado: "valorizarDetalle en modo VALORIZAR mide lo RECIBIDO, y ahora en la escala correcta",
    suite: "lib/transferencias/valorizacionDelRemito.test.mjs",
  },

  // ── EL REPORTE DEL PERÍODO Y EL ACTA: LOS DOS IMPORTES, CADA UNO EN SU SITIO ─
  //
  // Las tres de arriba defienden que la ESCALA se lea bien. Estas cuatro
  // defienden lo otro que se decidió: que el reporte hable del importe ENVIADO
  // y el acta del RECIBIDO, y que ninguno de los dos pueda volver al otro sin
  // que algo se ponga rojo.
  {
    n: "V-4",
    defecto: "el reporte del período vuelve a valorizar lo RECIBIDO, así que su total cambia al contar",
    archivo: "lib/transferencias/agregadosPeriodo.js",
    de: "      // El snapshot, que es lo que fija en qué presentación salió.\n      presentacionEnvio: d.presentacionEnvio,\n      cantidadPresentada: d.cantidadPresentada,\n      factorPresentacion: d.factorPresentacion,\n      sueltasEnviadas: d.sueltasEnviadas,",
    a: "      // El snapshot, roto a propósito: el reporte vuelve a seguir lo RECIBIDO.\n      presentacionEnvio: d.presentacionEnvio,\n      cantidadPresentada: d.recibido,\n      factorPresentacion: d.factorPresentacion,\n      sueltasEnviadas: d.recibidoUnidadesSueltas,",
    candado: "E1. el importe del remito es el ENVIADO en los cinco estados de recepción",
    suite: "lib/transferencias/agregadosPeriodo.test.mjs",
  },
  {
    // ── ESTA CONTRAPRUEBA CAMBIÓ DE CANDADO, Y EL MOTIVO VALE MÁS QUE EL CASO ──
    //
    // Apuntaba a E2 y daba "el candado NO se puso rojo". No era un candado
    // débil: sacarle el snapshot al reporte NO cambia el importe enviado —la
    // reconstrucción coincide, porque `cantidad` ya está en unidades físicas—.
    // O sea que el candado tenía razón en quedarse verde y la contraprueba
    // estaba afirmando algo falso sobre el arreglo.
    //
    // Se corrigió la afirmación, no el candado: lo que el snapshot defiende acá
    // es que la FUENTE sea una sola, y eso es lo que ejerce E6.
    n: "V-5",
    defecto: "el reporte deja de pasar el snapshot y vuelve a reconstruir la presentación por su cuenta",
    archivo: "lib/transferencias/agregadosPeriodo.js",
    de: "      // El snapshot, que es lo que fija en qué presentación salió.\n      presentacionEnvio: d.presentacionEnvio,",
    a: "      // El snapshot, que es lo que fija en qué presentación salió.\n      presentacionEnvio: undefined,",
    candado: "E6. el reporte le pasa la línea COMPLETA: lee la presentación registrada, no la reconstruye",
    suite: "lib/transferencias/agregadosPeriodo.test.mjs",
  },
  {
    // Ésta sí encontró un candado débil: con `includes` suelto, renombrar la
    // clave a `presentacionEnvioNo` lo dejaba verde porque el nombre viejo es
    // prefijo del nuevo. Se endureció el candado a pedir la clave.
    n: "V-6",
    defecto: "el select de la lista deja de traer el snapshot, que es la #97 otra vez con otro sujeto",
    archivo: "app/api/transferencias/listar/route.js",
    de: "      presentacionEnvio: true,",
    a: "      presentacionEnvioNo: true,",
    candado: "TODAS las rutas que valorizan traen el snapshot de presentación de la línea",
    suite: "lib/transferencias/formaDelSelect.test.mjs",
  },
  {
    n: "V-7",
    defecto: "el acta de recepción deja de sumar las sueltas, que es donde viven las diferencias",
    archivo: "app/api/transferencias/pdf-recepcion/route.js",
    de: "          recibidoUnidadesSueltas: d.recibidoUnidadesSueltas,",
    a: "          recibidoUnidadesSueltas: 0,",
    candado: "ACTA · y la RUTA le pasa el snapshot y las sueltas, no solo `recibido`",
    suite: "lib/transferencias/formaDelSelect.test.mjs",
  },

  // ── LA CORRECCIÓN ECONÓMICA DE LA RECEPCIÓN ───────────────────────────────
  //
  // Confirmar una recepción pasó a corregir la venta vinculada. Estas seis son
  // las formas de volver a romperlo, y cada una tiene que poner rojo el candado
  // que dice defenderla.
  {
    n: "E-1",
    defecto: "confirmar deja de corregir la venta: vuelve el stock corregido con dinero original",
    archivo: "app/api/transferencias/confirmar-recepcion/route.js",
    de: "      await aplicarCorreccionEconomica(tx, {",
    a: "      await sinCorregirLaVenta(tx, {",
    candado: "20b. confirmar corrige la venta SOLO por el aplicador, no por su cuenta",
    suite: "lib/transferencias/recepcionDiferencias.test.mjs",
  },
  {
    n: "E-2",
    defecto: "el aplicador vuelve a mover stock: las mismas unidades se acreditarían DOS veces",
    archivo: "lib/transferencias/aplicarCorreccionEconomica.js",
    de: "  const porOrigen = new Map(venta.detalles.map((d) => [d.id, d]));",
    a: "  await tx.stockLocal.updateMany({});\n  const porOrigen = new Map(venta.detalles.map((d) => [d.id, d]));",
    candado: "20d. el aplicador NO mueve inventario: el stock lo movió la recepción",
    suite: "lib/transferencias/recepcionDiferencias.test.mjs",
  },
  {
    n: "E-3",
    defecto: "las sueltas vuelven a escribirse como pack fraccionario y se pierde mercadería",
    archivo: "lib/transferencias/correccionEconomica.js",
    de: "  const bultos = agrupa ? Math.floor(fisicas / f) : fisicas;",
    a: "  const bultos = agrupa ? fisicas / f : fisicas;",
    candado: "NUNCA un pack fraccionario: 5 sueltas no son 0,208 packs",
    suite: "lib/transferencias/correccionEconomica.test.mjs",
  },
  {
    n: "E-4",
    defecto: "los pagos dejan de acompañar al total: la venta cobraría un número y facturaría otro",
    archivo: "lib/transferencias/aplicarCorreccionEconomica.js",
    de: "      data: { monto: p.monto, neto: p.monto - comision },",
    a: "      data: { neto: p.monto - comision },",
    candado: "CAMINO · el pago único cierra EXACTO contra el nuevo total",
    suite: "lib/transferencias/correccionEconomicaCamino.test.mjs",
  },
  {
    n: "E-5",
    defecto: "una recepción exacta igual escribe una corrección: ruido en cada auditoría",
    archivo: "lib/transferencias/correccionEconomica.js",
    de: "    aplica: !sinCambio,",
    a: "    aplica: true,",
    candado: "CAMINO · sin diferencia NO se escribe nada de la venta",
    suite: "lib/transferencias/correccionEconomicaCamino.test.mjs",
  },
  {
    n: "E-6",
    defecto: "se abre el bloqueo global: cualquiera podría corregir a mano una venta con remito",
    archivo: "lib/ventas-internas/integracionVenta.js",
    de: "  if (!t) return null;\n  if (t.estado === \"Cancelada\") return null;",
    a: "  return null;",
    candado: "BLOQUEO · corregir a mano una venta con remito SIGUE devolviendo 409",
    suite: "lib/transferencias/correccionEconomicaCamino.test.mjs",
  },

  // ── EL PRODUCTO AGREGADO EN RECEPCIÓN ─────────────────────────────────────
  //
  // Entra al stock, así que tiene que entrar al importe. Éstas son las tres
  // formas de volver a dejarlo afuera, y las tres son silenciosas.
  {
    n: "A-1",
    defecto: "las líneas agregadas vuelven a quedar fuera del importe: stock corregido con dinero original",
    archivo: "app/api/transferencias/confirmar-recepcion/route.js",
    de: "          agregada: d.agregadoEnRecepcion === true,",
    a: "          agregada: false,",
    candado: "CABLEADO · confirmar YA NO deja las agregadas fuera del importe",
    suite: "lib/transferencias/correccionEconomicaCamino.test.mjs",
  },
  {
    n: "A-2",
    defecto: "un agregado sin precio congelado se valoriza en cero en vez de frenar",
    archivo: "lib/transferencias/correccionEconomica.js",
    de: "    if (!Number.isFinite(congelado) || congelado <= 0) {",
    a: "    if (false) {",
    candado: "AGREGADA 5 · SIN precio congelado FRENA, no vale cero ni busca el catálogo",
    suite: "lib/transferencias/correccionEconomica.test.mjs",
  },
  {
    n: "A-3",
    defecto: "el agregado se revaloriza con el catálogo del día de confirmar, no con el precio congelado",
    archivo: "app/api/transferencias/confirmar-recepcion/route.js",
    de: "          precioPresentacion: d.agregadoEnRecepcion ? d.precioCosto : null,",
    a: "          precioPresentacion: d.agregadoEnRecepcion ? d.producto.base.precio_costo : null,",
    candado: "AGREGADO · la ruta manda el precio de la COLUMNA, no del catálogo",
    suite: "lib/transferencias/correccionEconomicaCamino.test.mjs",
  },

  // ── LAS DOS DEL V21: LA VARIANTE DE ACCIÓN DE LA TARJETA ────────────────
  //
  // El modo de fallar de las dos es MUDO. No rompen el build ni ponen roja
  // ninguna otra suite: el botón se dibuja del color equivocado, o sin estilo
  // ninguno, y solo se ve abriendo esa pantalla en el teléfono. Por eso el
  // candado existe, y por eso tiene que verse en rojo al menos una vez.
  {
    n: "V21-a",
    defecto: "un color nuevo se agrega al final de la hoja y le gana a las variantes",
    archivo: "styles/sunmi.css",
    // El ancla es la llave de apertura: `.sunmi-btn-accent-outline:hover` no
    // matchea, así que hay una sola coincidencia.
    de: ".sunmi-btn-accent-outline {",
    a: ".sunmi-btn-nuevo {\n  background: var(--pos-accent);\n}\n.sunmi-btn-accent-outline {",
    candado: "toda variante se define DESPUÉS de todos los colores",
    suite: "components/sunmi/variantesDeAccion.test.mjs",
  },
  {
    n: "V21-b",
    defecto: "la variante que la tarjeta pide por className deja de existir en el CSS",
    archivo: "styles/sunmi.css",
    // Un `className` que el CSS no define es un botón SIN ESTILO que compila
    // igual: es el defecto del "botón invisible" que ya pasó con `color="accent"`.
    de: ".sunmi-btn-accent-outline {",
    a: ".sunmi-btn-accentoutline {",
    candado: "las dos variantes que usa la tarjeta de recepción existen",
    suite: "components/sunmi/variantesDeAccion.test.mjs",
  },
  // ── LA SEMANA OPERATIVA DE LA UBICACIÓN ─────────────────────────────────
  //
  // Los candados de `lib/semanaOperativa` salieron verdes en la primera corrida,
  // y un verde que nunca se vio rojo no afirma nada. Cada uno se rompe acá por
  // la regla que defiende.
  {
    n: "S-1",
    defecto: "el empalme de un cambio vuelve a ser una mini-semana en vez de la semana larga",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "    if (inicioNuevo !== D && f <= finDeLaLarga) {",
    a: "    if (false && inicioNuevo !== D && f <= finDeLaLarga) {",
    candado: "las 42 combinaciones de corte viejo → nuevo: la primera semana nueva mide entre 8 y 13 días y está marcada",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  {
    n: "S-2",
    defecto: "una vigencia a mitad de semana deja días en dos semanas",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  if (siguiente?.desde && hasta >= siguiente.desde) hasta = sumarDias(siguiente.desde, -1);",
    a: "  if (false) hasta = sumarDias(siguiente.desde, -1);",
    candado: "una fila escrita por OTRO camino a mitad de semana igual no deja días en dos semanas",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  {
    n: "S-3",
    defecto: "un cambio puede partir una semana",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  if (previa.hasta !== sumarDias(d, -1)) return",
    a: "  if (false) return",
    candado: "cada rechazo, con su código",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  {
    n: "S-4",
    defecto: "un cambio puede empezar hoy, dentro de la semana abierta",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  if (d <= h) return falla(ERROR_SEMANA.NO_FUTURA",
    a: "  if (d < h) return falla(ERROR_SEMANA.NO_FUTURA",
    candado: "cada rechazo, con su código",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  {
    n: "S-5",
    defecto: "un segundo cambio pisa al pendiente sin que nadie lo pida",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  if (pendientes.length > 0 && !reemplazarPendiente) return",
    a: "  if (false) return",
    candado: "el cambio pendiente se REEMPLAZA solo pidiéndolo, y lo que ya empezó no entra en el reemplazo",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  {
    n: "S-6",
    defecto: "Transferencias deja de mirar la semana de cada local",
    archivo: "lib/transferencias/bloquesPorLocal.js",
    de: "      rango: rangoFijo || rangoDeUbicacion({ vigencias, unidad, fecha: hoy }),",
    a: "      rango: rangoFijo || rangoDeUbicacion({ vigencias: [], unidad, fecha: hoy }),",
    candado: "PARIDAD: `bloquesPorLocal` da los mismos rangos, transferencias e importes que con el acuerdo",
    suite: "lib/semanaOperativa/semanaOperativa.test.mjs",
  },
  // ── LA SEMANA NO EXIGE PERMISOS DE TRANSFERENCIAS ───────────────────────
  //
  // Desde el PR-2 la semana se configura en Configuración. Cada contraprueba
  // repone el defecto de un lugar que decide el acceso.
  {
    n: "P-1",
    defecto: "el ítem de Configuración vuelve a pedir otro permiso: quien solo configura la semana no llega",
    archivo: "lib/menu/registry.js",
    de: "        permiso: PERMISO_SEMANA_OPERATIVA,",
    a: '        permiso: "config_local.alertas",',
    candado: "semana sí, transferencias no: semana sí, transferencias no",
    suite: "lib/semanaOperativa/permisos.test.mjs",
  },
  {
    n: "P-2",
    defecto: "la guarda de la pantalla deja afuera a quien tiene el permiso",
    archivo: "lib/semanaOperativa/rutas.js",
    de: '  return lista.includes("*") || lista.includes(PERMISO_SEMANA_OPERATIVA);',
    a: '  return lista.includes("*");',
    candado: "semana sí, transferencias no: semana sí, transferencias no",
    suite: "lib/semanaOperativa/permisos.test.mjs",
  },
  {
    n: "P-3",
    defecto: "el GET de la API vieja vuelve a exigir `transferencias.ver`",
    archivo: "app/api/transferencias/acuerdos/route.js",
    de: '    const perm = checkPerm(session, ["transferencias.ver", PERMISO_SEMANA_OPERATIVA]);',
    a: '    const perm = checkPerm(session, ["transferencias.ver"]);',
    candado: "la API vieja sigue viva, pide lo mismo que en PR-1 y respeta el alcance",
    suite: "lib/semanaOperativa/permisos.test.mjs",
  },
  {
    n: "P-4",
    defecto: "el PUT viejo vuelve a dejar cambiar cualquier local del grupo",
    archivo: "app/api/transferencias/acuerdos/route.js",
    de: "    if (localId !== scope.localId) {",
    a: "    if (false) {",
    candado: "la API vieja sigue viva, pide lo mismo que en PR-1 y respeta el alcance",
    suite: "lib/semanaOperativa/permisos.test.mjs",
  },
  {
    n: "P-5",
    defecto: "el atajo del tablero vuelve a la ruta vieja de Transferencias",
    archivo: "components/transferencias/TableroMovil.jsx",
    de: "          onConfigurarCorte={() => router.push(RUTA_SEMANA_OPERATIVA)}",
    a: '          onConfigurarCorte={() => router.push("/modulos/transferencias/corte-de-semana")}',
    candado: "los atajos llevan a la pantalla nueva, y solo desde la ubicación propia",
    suite: "lib/semanaOperativa/permisos.test.mjs",
  },
  // ── EL KIT: EL SELECTOR SE TOCA CON EL DEDO ────────────────────────────
  {
    n: "K-1",
    defecto: "las teclas del selector vuelven a los 36 px del botón",
    archivo: "components/sunmi/SunmiSelectorDeOpciones.jsx",
    de: "justify-center min-h-toque py-2.5",
    a: "justify-center py-2.5",
    candado: "cada tecla pide el mínimo táctil y el botón le cede su alto de 36 px",
    suite: "components/sunmi/selectorDeOpcionesToque.test.mjs",
  },
  {
    n: "K-2",
    defecto: "el área táctil vuelve a ser la caja: queda una franja muerta en cada gap",
    archivo: "components/sunmi/SunmiSelectorDeOpciones.jsx",
    de: "relative after:absolute after:inset-y-0 after:-inset-x-1 flex-1",
    a: "relative after:absolute after:inset-y-0 flex-1",
    candado: "cada tecla extiende su área táctil sobre el gap, sin franja muerta",
    suite: "components/sunmi/selectorDeOpcionesToque.test.mjs",
  },
  {
    n: "K-3",
    defecto: "el selector de días vuelve adentro de una tarjeta, donde a 360 px no llega a 44",
    archivo: "app/modulos/configuracion/semana-operativa/page.jsx",
    de: '          {modo === "elegir" && (\n            <div className="space-y-3">',
    a: '          {modo === "elegir" && (\n            <SunmiCard className="p-4 space-y-3">',
    candado: "el selector es el del kit, con los siete días, y FUERA de una tarjeta",
    suite: "lib/semanaOperativa/pantalla.test.mjs",
  },
  // ── EL PANEL, EN SUS DOS SUPERFICIES ───────────────────────────────────
  {
    n: "D-1",
    defecto: "el Panel vuelve a ofrecer Inicio y Configuración queda afuera",
    archivo: "lib/dashboard/accesosRapidos.js",
    de: "    return destino !== null && !esRutaDeInicio(destino);\n  });",
    a: "    return destino !== null;\n  });",
    candado: "sidebarLeft → /modulos/dashboard: el Panel ofrece todos los grupos accesibles menos Inicio",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-2",
    defecto: "vuelve el tope de ocho en la regla común: con más de ocho módulos, los últimos desaparecen",
    archivo: "lib/dashboard/accesosRapidos.js",
    de: "    return destino !== null && !esRutaDeInicio(destino);\n  });",
    a: "    return destino !== null && !esRutaDeInicio(destino);\n  }).slice(0, 8);",
    candado: "con doce módulos accesibles, el Panel ofrece los doce, en orden, sin Inicio",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-3",
    defecto: "la regla del Panel se aplica al menú general y Inicio sale de la navegación",
    archivo: "lib/menu/menuVisible.js",
    de: "    result.push({ ...group, items: visibleItems });",
    a: '    if (group.key !== "inicio") result.push({ ...group, items: visibleItems });',
    candado: "la navegación general conserva Inicio, y el botón de casa lleva al Inicio del modo",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-4",
    defecto: "el lanzador vuelve a recortar ocho por su cuenta: se arregla el dashboard y se rompe el Panel del lanzador",
    archivo: "components/layout/AppLauncher.jsx",
    de: "  const menu = gruposDelPanel(visibleMenu);",
    a: "  const menu = visibleMenu.slice(0, 8);",
    candado: "launcher → /modulos/inicio: el Panel ofrece todos los grupos accesibles menos Inicio",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-5",
    defecto: "el Inicio se reconoce por UNA ruta y no por las de todos los modos",
    archivo: "lib/menu/homeRoutes.js",
    de: "  return Object.values(HOME_ROUTES).includes(ruta) || ruta === getDefaultRoute(undefined);",
    a: "  return ruta === HOME_ROUTES.launcher;",
    candado: "launcher → /modulos/inicio: el Panel ofrece todos los grupos accesibles menos Inicio",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-6",
    defecto: "se arregla el Panel apagando Inicio en el registry: sale de toda la navegación",
    archivo: "lib/menu/registry.js",
    de: '    key: "inicio",',
    a: '    key: "inicio",\n    enabled: false,',
    candado: "la navegación general conserva Inicio, y el botón de casa lleva al Inicio del modo",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-7",
    defecto: "el lanzador usa la regla común y DESPUÉS recorta a ocho por su cuenta",
    archivo: "components/layout/AppLauncher.jsx",
    de: "  const menu = gruposDelPanel(visibleMenu);",
    a: "  const menu = gruposDelPanel(visibleMenu).slice(0, 8);",
    candado: "ninguna pieza del camino del Panel vuelve a imponer un límite",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-8",
    defecto: "los accesos rápidos usan la regla común y DESPUÉS recortan a ocho",
    archivo: "components/dashboard/AccesosRapidos.jsx",
    de: "  const accesos = accesosDelPanel(menu);",
    a: "  const accesos = accesosDelPanel(menu).slice(0, 8);",
    candado: "ninguna pieza del camino del Panel vuelve a imponer un límite",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  {
    n: "D-9",
    defecto: "vuelve una constante de máximo en la regla del Panel",
    archivo: "lib/dashboard/accesosRapidos.js",
    de: 'import { esRutaDeInicio } from "@/lib/menu/homeRoutes";',
    a: 'import { esRutaDeInicio } from "@/lib/menu/homeRoutes";\n\nexport const MAX_ACCESOS = 8;',
    candado: "ninguna pieza del camino del Panel vuelve a imponer un límite",
    suite: "lib/dashboard/accesosRapidos.test.mjs",
  },
  // ── CANCELAR SOLO LO QUE NO EMPEZÓ ─────────────────────────────────────
  {
    n: "S-7",
    defecto: "cancelar alcanza a la vigencia que empieza hoy, que ya es historia",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  const pendientes = normalizarVigencias(vigencias).filter((v) => v.desde !== null && v.desde > h);\n  if (pendientes.length === 0) return falla(ERROR_SEMANA.SIN_PENDIENTE);",
    a: "  const pendientes = normalizarVigencias(vigencias).filter((v) => v.desde !== null && v.desde >= h);\n  if (pendientes.length === 0) return falla(ERROR_SEMANA.SIN_PENDIENTE);",
    candado: "una vigencia que EMPIEZA HOY ya es historia: no se cancela",
    suite: "lib/semanaOperativa/cancelarYPrevisualizar.test.mjs",
  },
  {
    n: "S-8",
    defecto: "la vista previa deja de mirar la semana regular que sigue a la transición",
    archivo: "lib/semanaOperativa/semanaOperativa.js",
    de: "  const primeraRegular = plan.transicion ? sumarDias(plan.transicion.hasta, 1) : plan.desde;",
    a: "  const primeraRegular = plan.desde;",
    candado: "las 42 combinaciones: la previsualización dice lo mismo que `planificarCambio`",
    suite: "lib/semanaOperativa/cancelarYPrevisualizar.test.mjs",
  },
  {
    n: "S-9",
    defecto: "la pantalla calcula la vista previa con un calendario propio",
    archivo: "app/modulos/configuracion/semana-operativa/page.jsx",
    de: "    return previsualizarCambio({ vigencias: datos.vigencias, diaDeCorte: Number(dia), hoy: datos.hoy });",
    a: "    return previsualizarCambio({ vigencias: datos.vigencias, diaDeCorte: Number(dia), hoy: new Date().toISOString().slice(0, 10) });",
    candado: "la vista previa sale de la función del servidor, no de un calendario propio",
    suite: "lib/semanaOperativa/pantalla.test.mjs",
  },
  // ── LO QUE UNA COMPRA SUMÓ AL STOCK, CONGELADO (Finanzas 1.b) ─────────────
  //
  // El censo de escritores y la migración aditiva del mismo archivo enumeran
  // con git y acá no hay `.git`: sus contrapruebas se hicieron a mano sobre el
  // árbol y están en el cuerpo del commit. Los números —que lo congelado sea el
  // delta real del stock— los rompe `scripts/pruebas-db/contrapruebasRevision.mjs`
  // contra Postgres.
  {
    n: "SI-1",
    defecto: "el cierre congela `cantidadRecibida × factor_pack` en vez de lo que sumó al stock",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    de: "          stockIngresado: incremento,",
    a: "          stockIngresado: cantRecibida * Math.max(1, Number(base?.factor_pack || 1)),",
    candado: "EL CIERRE CONGELA LA MISMA VARIABLE QUE PASA AL INCREMENT DEL STOCK",
    suite: "lib/compras-proveedor/stockIngresado.test.mjs",
  },
  {
    n: "SI-2",
    defecto: "la hoja de Corregir empieza a aceptar lo congelado en el cuerpo",
    archivo: "app/api/compras-proveedor/recepcion/correccion/route.js",
    de: '    if ("kgRecibidos" in body) aGuardar.kgRecibidos = numeroONull(body.kgRecibidos);',
    a:
      '    if ("kgRecibidos" in body) aGuardar.kgRecibidos = numeroONull(body.kgRecibidos);\n' +
      '    if ("stockIngresado" in body) aGuardar.stockIngresado = numeroONull(body.stockIngresado);',
    candado: "SOLO EL CIERRE NOMBRA LO CONGELADO; NINGÚN OTRO ESCRITOR LO TOCA",
    suite: "lib/compras-proveedor/stockIngresado.test.mjs",
  },
  {
    n: "SI-3",
    defecto: "un combo en cero congela un 0, como si hubiera movido stock",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    de: "          if (!esComboBase(base)) {\n            detCero.stockIngresado = 0;",
    a: "          if (true) {\n            detCero.stockIngresado = 0;",
    candado: "EL COMBO NO LLEVA NADA, Y EL CERO SÍ LLEVA SU UNIDAD",
    suite: "lib/compras-proveedor/stockIngresado.test.mjs",
  },
  {
    // El aviso de proceso pendiente tiene que decir lo mismo que el endpoint de
    // cancelar. Lo que el endpoint hace se ejerce contra Postgres —CC-4 en
    // `scripts/pruebas-db/contrapruebasRevision.mjs`—; lo que el aviso OFRECE es
    // una función pura y se rompe acá.
    n: "CC-aviso",
    defecto: "el aviso vuelve a ofrecer 'Cancelar' sobre un cierre con el plazo vencido",
    archivo: "lib/caja/procesoPendiente.js",
    de: "  const vigente = cierreCancelable(cierre, ahora);",
    a: "  const vigente = true;",
    candado: "25b. un cierre con el plazo vencido no se ofrece cancelable, diga lo que diga `estado`",
    suite: "lib/caja/procesoPendiente.test.mjs",
  },
  {
    // Un turno cerrado sin conteo leído como "turno abierto": la pantalla le
    // diría a quien lo mira que la caja todavía no cerró.
    n: "SC-resultado",
    defecto: "el resultado de un cerrado sin contado vuelve a ser 'turno abierto'",
    archivo: "lib/caja/vistaTurno.js",
    de: "  if ((contado === null || contado === undefined) && cerrado === true) {",
    a: "  if (false) {",
    candado: "el resultado de un cerrado sin contado NO es 'turno abierto' ni un cero",
    suite: "lib/caja/cierreSinConteo.test.mjs",
  },
  {
    // Sin el retiro final, sumar los otros dos y mostrarlo como el total de lo
    // que salió del local es presentar un número menor como cierto.
    n: "SC-circuito",
    defecto: "'dinero que salió del local' vuelve a sumar sin el retiro final desconocido",
    archivo: "lib/caja/circuitoDinero.js",
    de: "  const salioDelLocal = sinConteo\n    ? null\n    : retirosManuales",
    a: "  const salioDelLocal = false\n    ? null\n    : retirosManuales",
    candado: "el circuito no presenta como cierto lo que salió del local si no se contó",
    suite: "lib/caja/cierreSinConteo.test.mjs",
  },
  // ── El error ×1000: la cantidad de billetes escrita como monto ────────────
  // Los candados de texto de `desgloseDesproporcionado.test.mjs`. Lo que las
  // rutas escriben se contraprueba contra Postgres en CC-13 a CC-18. Los dos
  // candados que enumeran con `git grep` no van acá por lo mismo que el de la
  // semana operativa: la copia descartable no lleva `.git`.
  {
    // Con un factor de 10, un solo billete de $1.000 escrito como "1000" sobre
    // una caja de $200.000 da ×6 y pasa callado.
    n: "DD-factor",
    defecto: "el factor sube a 10 y el error de una sola fila deja de verse",
    archivo: "lib/caja/desgloseServidor.js",
    de: "export const FACTOR_DESPROPORCION = 2;",
    a: "export const FACTOR_DESPROPORCION = 10;",
    candado: "C. el error de UNA fila entre varias también se activa (×6 sobre $200.000)",
    suite: "lib/caja/desgloseDesproporcionado.test.mjs",
  },
  {
    n: "DD-grilla",
    defecto: "la grilla deja de mostrar el aviso y el campo del total en pesos",
    archivo: "components/caja/TablaDenominaciones.jsx",
    de: "      {proporcion.desproporcionado && (",
    a: "      {false && (",
    candado: "la grilla de conteo evalúa con la función del servidor, no con una propia",
    suite: "lib/caja/desgloseDesproporcionado.test.mjs",
  },
  {
    n: "DD-referencia",
    defecto: "la recepción compara contra un número que no es lo que dice el sobre",
    archivo: "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    de: "        referencia: Number(sobre.total),",
    a: "        referencia: 0,",
    candado: "las referencias son las del contexto, no un número inventado",
    suite: "lib/caja/desgloseDesproporcionado.test.mjs",
  },
  {
    // Un umbral tan alto que el ×1000 típico (23.000 billetes) pasa callado.
    n: "DD-umbral",
    defecto: "el umbral por fila sube a 50.000 y la apertura sin sobre deja de ver el ×1000",
    archivo: "lib/caja/desgloseServidor.js",
    de: "export const UMBRAL_CANTIDAD_EXTRAORDINARIA = 500;",
    a: "export const UMBRAL_CANTIDAD_EXTRAORDINARIA = 50000;",
    candado: "sin sobre · A. {1000: 23000} sin total confirmado: no pasa",
    suite: "lib/caja/desgloseDesproporcionado.test.mjs",
  },
  // ── La corrección histórica de caja (lo de la base está en CH-1 a CH-5) ──
  {
    n: "CH-exclusion",
    defecto: "el turno 277 de la venta KG deja de estar excluido",
    archivo: "lib/caja/correcciones/plan.js",
    de: "  { entidad: \"Turno\", id: 277,",
    a: "  { entidad: \"Turno\", id: -277,",
    candado: "el turno 277 y el corte 85 (venta KG 9152) están excluidos aunque alguien los agregue",
    suite: "lib/caja/correcciones/plan.test.mjs",
  },
  {
    n: "CH-permiso",
    defecto: "la ruta de aplicar deja de pedir el permiso",
    archivo: "app/api/caja/correcciones/aplicar/route.js",
    de: "  const perm = requirePerm(req, PERMISO_CORREGIR_HISTORICO);",
    a: "  const perm = { ok: true, session: { id: 1 } };",
    candado: "las tres rutas exigen el permiso antes de hacer nada",
    suite: "lib/caja/correcciones/plan.test.mjs",
  },
  {
    n: "DD-sin-sobre",
    defecto: "la pantalla sin sobre deja de pasarle el umbral a la grilla",
    archivo: "app/modulos/pos-ventas/aperturas/sin-cambio/page.jsx",
    de: "    umbralCantidadPorFila: UMBRAL_CANTIDAD_EXTRAORDINARIA,",
    a: "    umbralCantidadPorFila: null,",
    candado: "la pantalla sin sobre le pasa el umbral medido a la grilla, sin inventar referencia",
    suite: "lib/caja/desgloseDesproporcionado.test.mjs",
  },
  // `lib/semanaOperativa/unaSolaFuente.test.mjs` NO está acá, y no por olvido:
  // enumera con `git ls-files`, y la copia descartable de este script no lleva
  // `.git`, así que ahí el archivo entero explota antes de llegar al candado y el
  // rojo no valdría. Sus contrapruebas se hicieron a mano sobre el árbol y están
  // en el cuerpo del commit que lo trajo.
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
