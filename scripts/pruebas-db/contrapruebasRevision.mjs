// CONTRAPRUEBAS CONTRA POSTGRES DE LOS DOS DEFECTOS QUE VIVEN EN LA BASE.
//
// Las contrapruebas de `scripts/contrapruebas-revision.mjs` rompen y miran
// candados de texto. Estas dos rompen y miran DATOS: se reintroduce el defecto,
// se corre la suite de recepción de verdad contra Postgres, y se exige que las
// afirmaciones que lo cubren se pongan rojas.
//
// Se corre con la misma DATABASE_URL que la suite:
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/contrapruebasRevision.mjs
//
// Cada caso arranca de un esquema limpio, porque la suite monta y desmonta sus
// propios datos y dos corridas encimadas se estorban.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ORIGEN = process.cwd();

const CASOS = [
  {
    n: 1,
    defecto: "desmarcar vuelve a pasar por el validador y usa el fallback de lo enviado",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    // ── HAY QUE ROMPER LAS DOS MITADES, Y ESO SE APRENDIÓ ACÁ ──────────────
    //
    // El arreglo del defecto 1 tiene dos partes: el camino propio de desmarcar,
    // y que la validación parta de lo PERSISTIDO. La primera versión de esta
    // contraprueba rompía solo la primera y la suite se quedaba verde — porque
    // la segunda alcanza sola para que el conteo sobreviva.
    //
    // Eso no era un candado flojo: es que las dos mitades se tapan entre sí, y
    // cualquiera de las dos sostiene el dato. Para volver al defecto de verdad
    // —"desmarcar usa el fallback de lo enviado"— hay que sacar las dos.
    inyecciones: [
      { de: "      if (!revisado) {", a: "      if (false) {" },
      { de: "          recibido: d.recibido,", a: "          recibido: undefined," },
      {
        de: "          recibidoUnidadesSueltas: d.recibidoUnidadesSueltas,",
        a: "          recibidoUnidadesSueltas: undefined,",
      },
    ],
    // Lo que tiene que gritar: el conteo de 5 bultos y 5 sueltas volviendo a
    // 6 y 0 por tocar "desmarcar".
    esperadas: [
      "H · el recibido SIGUE en 5",
      "H · las sueltas SIGUEN en 5",
    ],
  },
  {
    n: 6,
    defecto: "el ajuste informativo del origen vuelve a ignorar las sueltas",
    archivo: "app/api/transferencias/detalle/route.js",
    inyecciones: [
      {
        de: "              recibidaSueltas: d.recibidoUnidadesSueltas,",
        a: "              recibidaSueltas: null,",
      },
    ],
    esperadas: [
      "I.2 · al origen se le devuelve 1, no 6",
    ],
  },
  // ── LOS TRES DE LA SEGUNDA REVISIÓN (2026-09-09) ────────────────────────
  //
  // El del dirty fantasma NO se puede probar con un helper suelto: la sección J
  // recorre el camino real —abrir, revisar contra el endpoint, recargar por el
  // endpoint de detalle, reconciliar, confirmar— y es esa juntura la que lo
  // producía. Acá se reintroduce la preservación legacy y esa sección tiene que
  // gritar.
  {
    n: "I-1",
    defecto: "vuelve la preservación legacy después de una revisión con diferencia",
    archivo: "lib/transferencias/recepcionUI.js",
    inyecciones: [
      {
        de: "  const conservar = modo === MODO_RECEPCION.EDITOR_LOTES && preservar === true;",
        a: "  const conservar = preservar === true;",
      },
    ],
    esperadas: [
      "J · NO queda dirty fantasma",
      "J · y editItems refleja lo guardado, no la propuesta vieja",
    ],
  },
  {
    n: "I-2",
    defecto: "el chip de categoría del remito vuelve a filtrar los no declarados",
    archivo: "lib/transferencias/controlFisico.js",
    inyecciones: [
      { de: "  if (categoriaId && !filtraNoDeclarados) {", a: "  if (categoriaId) {" },
    ],
    esperadas: [
      "K · y con el chip del remito activo la lista muestra 1, no 0",
    ],
  },
  {
    n: "I-3",
    defecto: "Enter vuelve a ser siempre un escaneo",
    archivo: "lib/transferencias/controlFisico.js",
    inyecciones: [
      { de: "  if (porTexto.length === 1) {", a: "  if (false) {" },
    ],
    esperadas: [
      "L · una sola coincidencia por nombre abre",
    ],
  },
  // ── LO QUE UNA COMPRA SUMÓ AL STOCK, CONGELADO (Finanzas 1.b) ─────────────
  //
  // Corren contra `recepcionCompras.mjs`, que compara en cada caso el delta
  // real de `StockLocal` contra lo congelado. Por eso rompen DATOS y no texto:
  // la contraprueba de texto del mismo defecto está en
  // `scripts/contrapruebas-revision.mjs` (SI-1 a SI-3).
  {
    n: "SI-1",
    defecto: "el cierre vuelve a congelar `cantidadRecibida × factor_pack` en vez de lo que sumó",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      {
        de: "          stockIngresado: incremento,",
        a: "          stockIngresado: cantRecibida * Math.max(1, Number(base?.factor_pack || 1)),",
      },
    ],
    // Donde esa cuenta no es lo que entró: el pack con sueltas (72 contra 77),
    // los kilos y el fiambre del local. Donde coincide —10 bultos de 12— no
    // grita, y está bien: ahí la cuenta vieja todavía no miente.
    esperadas: [
      "PACK con sueltas: stockIngresado es lo que sumó el stock",
      "KG pesado: stockIngresado es lo que sumó el stock",
      "PIEZA en local: stockIngresado es lo que sumó el stock",
    ],
  },
  {
    n: "SI-2",
    defecto: "la unidad deja de salir del destino real y se toma como si todo fuera el depósito",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      {
        de: "unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito });",
        a: "unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito: true });",
      },
    ],
    esperadas: [
      "PIEZA en local: la unidad es KG",
      "el mismo producto congeló dos unidades distintas, porque entró distinto",
    ],
  },
  {
    n: "SI-3",
    defecto: "una línea que no sumó nada queda en NULL en vez de 0 con su unidad",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      { de: "            detCero.stockIngresado = 0;\n", a: "" },
      { de: "            detCero.stockIngresadoUnidad = unidadIngreso;\n", a: "" },
    ],
    esperadas: [
      "cero declarado: 0 UNIDAD y cantidadRecibida 0",
      "sin declarar: 0 UNIDAD, y cantidadRecibida sigue en null (nadie contó)",
    ],
  },
  // ── EL FRENO DE COSTO DE LA RECEPCIÓN ──────────────────────────────────
  //
  // Corren contra `frenoDeCosto.mjs`, que cierra por la ruta real con un costo
  // maestro distinto de cero y mira qué quedó escrito. El defecto que las trajo
  // no lo veía ningún candado de texto: el cierre LEÍA `base?.precio_costo`,
  // pero el `select` no lo traía.
  //
  // El piso es 20 y no más: la suite tiene 60 afirmaciones y sacar el costo
  // maestro apaga el freno entero, así que en FC-1 caen 23 a la vez y quedan
  // 37 en verde. El piso está para distinguir "abortó al montar" —cero— de
  // "corrió y gritó", no para contar cuánto grita.
  {
    n: "FC-1",
    defecto: "el select de la base vuelve a no traer precio_costo",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "                    precio_costo: true,\n", a: "" }],
    esperadas: [
      "A: frena con 409",
      "F costo del bulto en línea UNIDAD: el costo maestro queda en 61703",
    ],
  },
  {
    n: "FC-2",
    defecto: "el cierre ignora la aceptación que la hoja de Corregir dejó guardada",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "const aceptada = costosAceptados.has(det.id) || aceptadoEnElPapel(det.id, costoFinal, base);",
        a: "const aceptada = costosAceptados.has(det.id);",
      },
    ],
    esperadas: ["C: cierra", "C: el costo maestro queda en 1150"],
  },
  {
    n: "FC-3",
    defecto: "el freno vuelve a correr sobre una línea excluida del costo",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "if (escribeCosto && sugerida.exigeElegir && !aceptada) {",
        a: "if (sugerida.exigeElegir && !aceptada) {",
      },
    ],
    esperadas: ["I: cierra"],
  },
  {
    n: "FC-4",
    defecto: "la conversión vuelve a multiplicar por 30 el costo del bulto de la hamburguesa",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "          costoActual: base?.precio_costo ?? null,", a: "          costoActual: null," }],
    // Sin el costo actual, la línea UNIDAD se multiplica por 30 y el freno la
    // para como error de escala: el cierre legítimo deja de cerrar.
    esperadas: ["F costo del bulto en línea UNIDAD: cierra"],
  },
  {
    n: "FC-5",
    defecto: "\"Dejar el que tenía\" vuelve a pasar por el freno como candidata a escribir costo",
    archivo: "lib/compras-proveedor/cierreDeRecepcion.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "(f) => f?.sinPapel === true || decisionVigente(f)?.decision === DECISION_DE_PRECIO.DEJA_EL_MIO",
        a: "(f) => f?.sinPapel === true",
      },
    ],
    esperadas: ["L1: la pantalla excluye ESA línea del costo", "L1: cierra"],
  },
  {
    n: "FC-6",
    defecto: "se excluye por la última decisión del producto aunque sus precios no sean los de la fila",
    archivo: "lib/compras-proveedor/cierreDeRecepcion.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "decisionVigente(f)?.decision", a: "f?.decisionPrecio?.decision" }],
    esperadas: ["L3: con otros números no está vigente y no se excluye", "L3: frena con 409"],
  },
  {
    n: "FC-7",
    defecto: "la hoja ignora el catálogo movido y dice 'sin diferencia' con papel igual a la línea",
    archivo: "lib/compras-proveedor/estadoDeLineaFacturada.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "precioCambio(fila) || fila?.catalogoMovido === true", a: "precioCambio(fila)" }],
    esperadas: ["M-A: hay que decidir el precio", "M-A: no dice 'sin diferencia': queda con precio distinto"],
  },
  {
    n: "FC-8",
    defecto: "aceptar con el catálogo movido no guarda la decisión y la hoja vuelve a preguntar",
    archivo: "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "precioAEscribir) || catalogoMovido) {", a: "precioAEscribir)) {" }],
    esperadas: ["M-C: la hoja ya no vuelve a preguntar"],
  },
  {
    n: "FC-9",
    defecto: "una decisión nueva deja de guardar el catálogo que se miró al tomarla",
    archivo: "lib/compras-proveedor/comprobante/guardarDecisionDePrecio.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "      costoMaestroObservado,\n      comprobanteLineaId,\n      decididaPorUsuarioId: usuarioId,\n      decididaEn: cuando,\n    },\n    // LA DE AHORA",
        a: "      costoMaestroObservado: null,\n      comprobanteLineaId,\n      decididaPorUsuarioId: usuarioId,\n      decididaEn: cuando,\n    },\n    // LA DE AHORA",
      },
    ],
    esperadas: ["N1: la decisión guarda el catálogo observado, 800", "N1: vigente, la hoja no pregunta"],
  },
  {
    n: "FC-10",
    defecto: "una aceptación sigue autorizando el costo después de que el catálogo cambió",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "        mismoPrecio(d.precioFacturado, costo) &&\n        mismoCatalogoQueAlDecidir(d, base?.precio_costo)",
        a: "        mismoPrecio(d.precioFacturado, costo)",
      },
    ],
    esperadas: ["N2 aceptación vieja: frena con 409", "N2: el catálogo sigue en 1.500"],
  },
  {
    n: "FC-11",
    defecto: "'dejar el que tenía' sigue vigente después de que el catálogo cambió",
    archivo: "lib/compras-proveedor/decisionDePrecio.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "  if (!mismoCatalogoQueAlDecidir(d, fila?.costoMaestroCatalogo)) return null;\n", a: "" }],
    esperadas: ["N5: la hoja vuelve a preguntar", "N5: recargada, la pantalla ya no la excluye"],
  },
  {
    n: "FC-12",
    defecto: "una decisión histórica sin lo observado se rellena con el catálogo de hoy",
    archivo: "lib/compras-proveedor/comprobante/analisisDeComprobante.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "d.costoMaestroObservado == null ? null : Number(d.costoMaestroObservado)",
        a: "Number(d.costoMaestroObservado ?? catalogo.find((p) => p.id === d.productoBaseId)?.precio_costo)",
      },
    ],
    esperadas: ["N7: una ACEPTA histórica no vale", "N7: una DEJA histórica no excluye"],
  },
  {
    n: "FC-13",
    defecto: "volver a decidir no actualiza lo observado y la decisión vencida no tiene salida",
    archivo: "lib/compras-proveedor/comprobante/guardarDecisionDePrecio.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "    update: {\n      decision,\n      precioFacturado,\n      precioPropio,\n      costoMaestroObservado,\n",
        a: "    update: {\n      decision,\n      precioFacturado,\n      precioPropio,\n",
      },
    ],
    esperadas: ["N3: la decisión nueva guarda 1.500", "N3: cierra"],
  },
  // ── LOS CANDADOS DEL CICLO DE CIERRE DE CAJA ────────────────────────────
  //
  // Corren contra `cierreCaja.mjs`, que ejerce las rutas reales. La carrera se
  // fuerza con una transacción que retiene la fila del turno, así que el rojo
  // de CC-1 no depende del azar: con el WHERE viejo, el cierre clásico escribe
  // siempre después del corte.
  {
    n: "CC-1",
    defecto: "el cierre clásico vuelve a cerrar un turno con el corte tomado en el medio",
    archivo: "app/api/pos-ventas/turnos/cerrar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    // Desde #132 el cierre clásico tiene DOS defensas contra el corte que entra en
    // el medio: relee el turno con el lock tomado, y el UPDATE sigue con el WHERE
    // operativo. Cualquiera de las dos sola lo frena, así que el defecto se
    // inyecta sacando las dos; con una sola, esta contraprueba quedaría en verde
    // sin decir nada.
    inyecciones: [
      { de: "where: { id: turnoId, ...WHERE_TURNO_OPERATIVO },", a: "where: { id: turnoId, cierre: null }," },
      {
        de: "      if (estadoDelTurno(vigente) === ESTADO_TURNO.CIERRE_EN_PREPARACION) {\n",
        a: "      if (false) {\n",
      },
    ],
    esperadas: [
      "A1: el cierre clásico pierde con 409",
      "A1: nunca queda un turno CERRADO con un corte vivo",
    ],
  },
  {
    n: "CC-2",
    defecto: "la corrección completa vuelve a decidir 'abierto' mirando solo `cierre`",
    archivo: "lib/pos-ventas/correccionCompletaServer.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "  const estado = estadoDelTurno(venta.turno);\n",
        a: "  const estado = venta.turno.cierre == null ? ESTADO_TURNO.ABIERTO : ESTADO_TURNO.CERRADO;\n",
      },
    ],
    esperadas: ["B EN CIERRE: rechaza con 409", "B EN CIERRE: los pagos no se reescriben"],
  },
  {
    // La regla puede estar bien y ser inalcanzable: si la consulta no trae la
    // columna, `cierreEnPreparacionEn` llega `undefined` y el turno con el corte
    // tomado se lee ABIERTO.
    n: "CC-3",
    defecto: "la venta a corregir se vuelve a cargar sin `cierreEnPreparacionEn`",
    archivo: "lib/pos-ventas/correccionCompletaServer.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "turno: { select: { id: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true } },",
        a: "turno: { select: { id: true, cierre: true, anuladoEn: true } },",
      },
    ],
    esperadas: ["B EN CIERRE: rechaza con 409"],
  },
  {
    n: "CC-4",
    defecto: "cancelar vuelve a confiar en la etiqueta y deshace un corte con el plazo vencido",
    archivo: "app/api/pos-ventas/cierres/[token]/cancelar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      { de: "if (!cierreCancelable(fila, ahora)) {", a: "if (fila.estado !== ESTADO_CIERRE.PREPARANDO) {" },
    ],
    esperadas: [
      "C vencido sin marcar: cancelar rechaza con 409",
      "C vencido sin marcar: el turno no vuelve a operar",
    ],
  },
  // ── CERRAR SIN CONTEO ────────────────────────────────────────────────────
  //
  // Cada una rompe una de las reglas que hacen honesta la resolución: que solo
  // aplique a un corte vencido por tiempo, que lo desconocido quede en NULL, que
  // haya permiso y evidencia, que no se resuelva dos veces, y que las pantallas
  // lo lean.
  {
    n: "CC-5",
    defecto: "cerrar sin conteo deja de exigir que el corte haya vencido por tiempo",
    archivo: "lib/caja/cierreRelevo.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "  return cierreConfirmable(cierre) && cierreAtrasado(cierre, ahora);",
        a: "  return cierreConfirmable(cierre);",
      },
    ],
    esperadas: ["D1 vigente: rechaza con 409", "D1: el turno sigue en preparación"],
  },
  {
    n: "CC-6",
    defecto: "el contado se vuelve a inventar con el esperado",
    archivo: "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [{ de: "          montoRealEfectivo: null,", a: "          montoRealEfectivo: fila.efectivoEsperadoCorte," }],
    esperadas: ["D10 el contado queda NULL, no 0 ni el esperado"],
  },
  {
    n: "CC-7",
    defecto: "la diferencia desconocida se vuelve a escribir como cero",
    archivo: "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [{ de: "          diferenciaEfectivo: null,", a: "          diferenciaEfectivo: 0," }],
    esperadas: ["D11 la diferencia queda NULL, no 0"],
  },
  {
    n: "CC-8",
    defecto: "la segunda llamada deja de reconocer que ya estaba resuelto",
    archivo: "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "      if (fila.estado === ESTADO_CIERRE.CERRADO_SIN_CONTEO) return { yaEstaba: fila, repetido: true };\n",
        a: "",
      },
    ],
    esperadas: ["D16 la segunda llamada no vuelve a resolver", "D16b las dos contestan bien"],
  },
  {
    n: "CC-9",
    defecto: "cerrar sin conteo deja de pedir el permiso excepcional",
    archivo: "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      { de: "    const perm = checkPerm(session, PERMISO_CERRAR_SIN_CONTEO);", a: "    const perm = { ok: true };" },
    ],
    esperadas: ["D7 sin permiso: rechaza con 403", "D7: sin bitácora"],
  },
  {
    n: "CC-10",
    defecto: "la resolución deja de escribir su evidencia en la bitácora",
    archivo: "app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [{ de: "      await tx.auditoriaBitacora.create({", a: "      await (async () => ({}))({" }],
    esperadas: ["D15 hay UNA fila de bitácora"],
  },
  {
    n: "CC-11",
    defecto: "el resumen del turno vuelve a no traer el corte resuelto sin conteo",
    archivo: "app/api/pos-ventas/turnos/resumen/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: 'estado: { in: ["PREPARANDO", "CONFIRMADO", "VENCIDO", "CERRADO_SIN_CONTEO"] }',
        a: 'estado: { in: ["PREPARANDO", "CONFIRMADO", "VENCIDO"] }',
      },
    ],
    esperadas: ["D19 el resumen trae el corte resuelto sin conteo"],
  },
  {
    n: "CC-12",
    defecto: "Finanzas vuelve a leer un cerrado sin contado como 'turno abierto'",
    archivo: "app/api/finanzas/turno/[turnoId]/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 20,
    inyecciones: [{ de: "        cerrado: estadoDelTurno(turno) === ESTADO_TURNO.CERRADO,\n", a: "" }],
    esperadas: ["D19 Finanzas dice 'cerrado sin conteo', no 'turno abierto'", "D19 sin diferencia inventada"],
  },
  // ── El error ×1000: la cantidad de billetes escrita como monto ────────────
  // Una por cada camino donde ya ocurrió en producción, más la confirmación.
  {
    n: "CC-13",
    defecto: "la recepción de sobre vuelve a aceptar {1000: 23000} contra un sobre de $23.000",
    archivo: "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [{ de: "      if (!proporcion.valido) {", a: "      if (false) {" }],
    esperadas: [
      "E1 A: {1000: 23000} contra un sobre de $23.000 NO pasa, aunque traiga motivo",
      "E1 A: el sobre sigue reservado y sin destino",
    ],
  },
  {
    n: "CC-14",
    defecto: "el corte de cierre vuelve a aceptar {1000: 23000} de cambio con $45.000 esperados",
    archivo: "app/api/pos-ventas/cierres/iniciar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [{ de: "      if (!proporcion.valido) {", a: "      if (false) {" }],
    esperadas: [
      "E4 C: dejar {1000: 23000} de cambio con $45.000 esperados NO pasa",
      "E4 C: no se tomó el corte",
    ],
  },
  {
    n: "CC-15",
    defecto: "el conteo del cierre pierde su referencia y acepta {1000: 8000} contra $8.000",
    archivo: "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [
      { de: "        referencia: Number(cierre.efectivoRetiradoEsperado),", a: "        referencia: 0," },
    ],
    esperadas: [
      "E5 C: contar {1000: 8000} de retiro con $8.000 esperados NO cierra",
      "E5 C: no hay arqueo final",
    ],
  },
  {
    n: "CC-16",
    defecto: "el retiro parcial vuelve a aceptar el ×1000 en el cambio y en el conteo",
    archivo: "app/api/pos-ventas/retiros/iniciar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [{ de: "      if (!proporcion.valido) {", a: "      if (false) {" }],
    esperadas: ["E8 C: el retiro con {1000: 23000} de cambio y $45.000 esperados NO arranca"],
  },
  {
    n: "CC-17",
    defecto: "la confirmación del retiro pierde su referencia",
    archivo: "app/api/pos-ventas/retiros/[token]/confirmar/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [
      { de: "      referencia: Number(retiro.efectivoRetiradoEsperado),", a: "      referencia: 0," },
    ],
    esperadas: ["E9 C: contar {1000: 43000} con $43.000 de retiro esperado NO confirma", "E9 C: no hay movimiento"],
  },
  {
    n: "CC-18",
    defecto: "cualquier total escrito en pesos destraba, coincida o no con lo cargado",
    archivo: "lib/caja/desgloseServidor.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [
      { de: "  if (escrito !== null && aCentavos(escrito) === aCentavos(total)) {", a: "  if (escrito !== null) {" },
    ],
    esperadas: ["E2 A: escribir $23.000 —lo que se creía contar— no lo destraba"],
  },
  {
    n: "CC-19",
    defecto: "la apertura sin sobre vuelve a aceptar {1000: 23000} sin pedir nada",
    archivo: "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [{ de: "    if (!proporcion.valido) {", a: "    if (false) {" }],
    esperadas: ["F1 A: {1000: 23000} sin total confirmado NO abre", "F1 H: no se creó ningún turno"],
  },
  {
    // El borde medido: 500 billetes es un conteo posible, 501 ya no.
    n: "CC-20",
    defecto: "el umbral por fila se corre uno y 500 billetes pasa a pedir confirmación",
    archivo: "lib/caja/desgloseServidor.js",
    suite: "scripts/pruebas-db/cierreCaja.mjs",
    minimo: 100,
    inyecciones: [
      {
        de: "    if (!Number.isFinite(cantidad) || cantidad <= tope) continue;",
        a: "    if (!Number.isFinite(cantidad) || cantidad < tope) continue;",
      },
    ],
    esperadas: ["F5 E: {1000: 500} no activa por cantidad"],
  },
  // ── La corrección histórica de caja ────────────────────────────────────────
  {
    n: "CH-1",
    // El defecto peligroso no es "el ensayo sigue hasta aplicar" —eso explota sin
    // autorización y se deshace igual; fue la primera versión de esta
    // contraprueba y no probó nada—. Es que el ensayo DEVUELVA en vez de tirar:
    // devolver confirma la transacción con los UPDATE adentro.
    defecto: "el ensayo en seco devuelve en vez de deshacer y deja escritos los UPDATE",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      if (!aplicar) throw new Deshacer(", a: "      if (!aplicar) return (" }],
    esperadas: ["2: después del ensayo, NADA cambió en la base (ni registro, ni bitácora)"],
  },
  {
    n: "CH-2",
    defecto: "la aplicación deja de exigir la huella autorizada",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      if (aplicar && hash !== manifiesto.autorizacion.hash) {", a: "      if (false) {" }],
    esperadas: [
      "3: huella distinta a la del plan de hoy: no se aplica",
      "5: la huella autorizada ya no es la de hoy: no se aplica",
    ],
  },
  {
    n: "CH-3",
    defecto: "un PROPUESTO se puede aplicar",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (aplicar && manifiesto.estado !== ESTADO_MANIFIESTO.AUTORIZADO) {", a: "  if (false) {" }],
    esperadas: ["3: un PROPUESTO no se aplica"],
  },
  {
    n: "CH-4",
    defecto: "la segunda aplicación del mismo código deja de reconocer la primera",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      if (previa) {", a: "      if (false) {" }],
    esperadas: ["9: YA_APLICADA"],
  },
  {
    n: "CH-5",
    defecto: "el plan deja de comparar el valor anterior que declara el manifiesto",
    archivo: "lib/caja/correcciones/plan.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      if (!mismoValor(corte[campo], c.antes[campo])) {", a: "      if (false) {" }],
    esperadas: ["4: el ensayo lo rechaza nombrando el campo"],
  },
  // ── El corte vencido sin conteo (I5) ──
  {
    n: "CH-6",
    defecto: "el corte vencido deja de proteger el fondo del turno receptor",
    archivo: "lib/caja/correcciones/plan.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      else if (!mismoValor(receptor.montoInicial, sobre.totalRecibido)) {", a: "      else if (false) {" }],
    esperadas: ["12: si el fondo del receptor cambió, no se aplica"],
  },
  {
    n: "CH-7",
    defecto: "el corte vencido se corrige aunque ya tenga conteo del cajón",
    archivo: "lib/caja/correcciones/plan.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (corte.desgloseContado != null || corte.totalContado != null) errores.push(", a: "  if (false) errores.push(" }],
    esperadas: ["12: si el corte tiene conteo, no se aplica"],
  },
  {
    n: "CH-8",
    defecto: "el motor deja de leer el turno que recibió el sobre del corte vencido",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/correccionCaja.mjs",
    minimo: 30,
    inyecciones: [{ de: "      if (s?.turnoDestinoId) protegidos.add(s.turnoDestinoId);", a: "" }],
    esperadas: ["12: ensayo sin errores"],
  },
  // ── CAJA +/− CONTRA EL CORTE Y EL CIERRE (#133) ─────────────────────────
  //
  // Cada una saca UNA defensa de `caja-movimientos/crear` y la carrera forzada
  // tiene que mostrar el movimiento entrando después del corte o del cierre.
  // Insertar con el cliente de afuera no va acá: se traba contra el lock de su
  // propia transacción hasta el timeout, y lo ataja el candado de texto
  // lib/caja/cajaMovimientoAtomico.test.mjs.
  {
    n: "CM-1",
    defecto: "Caja +/− vuelve a escribir sin tomar el turno",
    archivo: "app/api/pos-ventas/caja-movimientos/crear/route.js",
    suite: "scripts/pruebas-db/cajaMovimientoAtomico.mjs",
    minimo: 60,
    inyecciones: [{ de: "      await bloquearTurno(tx, turnoId);\n", a: "" }],
    esperadas: [
      "Caja +/− se rechaza: turno en preparación de cierre",
      "no existe ningún CajaMovimiento",
      "Caja +/− se rechaza: turno cerrado",
    ],
  },
  {
    n: "CM-2",
    defecto: "Caja +/− vuelve a validar el turno solo afuera de la transacción",
    archivo: "app/api/pos-ventas/caja-movimientos/crear/route.js",
    suite: "scripts/pruebas-db/cajaMovimientoAtomico.mjs",
    minimo: 60,
    inyecciones: [{ de: "      if (rechazoVigente) return { rechazo: rechazoVigente };", a: "      if (false) return { rechazo: rechazoVigente };" }],
    esperadas: [
      "Caja +/− se rechaza: turno en preparación de cierre",
      "Caja +/− se rechaza: turno cerrado",
      "A 200, corte 200, B 409",
    ],
  },
  {
    n: "CM-3",
    defecto: "Caja +/− vuelve a admitir un movimiento después del corte",
    archivo: "app/api/pos-ventas/caja-movimientos/crear/route.js",
    suite: "scripts/pruebas-db/cajaMovimientoAtomico.mjs",
    minimo: 60,
    inyecciones: [{ de: "  if (turno.cierreEnPreparacionEn !== null) {", a: "  if (false) {" }],
    esperadas: ["Caja +/− se rechaza: turno en preparación de cierre", "existe A y no existe B, sin duplicados"],
  },
  {
    n: "CM-4",
    defecto: "Caja +/− vuelve a admitir un movimiento después del cierre",
    archivo: "app/api/pos-ventas/caja-movimientos/crear/route.js",
    suite: "scripts/pruebas-db/cajaMovimientoAtomico.mjs",
    minimo: 60,
    inyecciones: [{ de: "  if (turno.cierre !== null) {", a: "  if (false) {" }],
    esperadas: ["Caja +/− se rechaza: turno cerrado", "no existe ningún CajaMovimiento manual"],
  },
  // ── LA LECTURA DE TESORERÍA ──────────────────────────────────────────────
  //
  // Cada una saca UNA defensa de la lectura y la prueba de base, que arma las
  // filas con las rutas reales, tiene que verla.
  {
    n: "TE-1",
    defecto: "Tesorería vuelve a restar el pago hecho desde la caja",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/tesoreriaLectura.mjs",
    minimo: 40,
    inyecciones: [{
      de: "const baseConocidaCentavos = entregaCentavos + t.digital - egresosExterioresCentavos;",
      a: "const baseConocidaCentavos = entregaCentavos + t.digital - egresosExterioresCentavos - pagosDesdeCajaCentavos;",
    }],
    esperadas: ["la base sube exactamente $130.000 (no $110.000)"],
  },
  {
    n: "TE-2",
    defecto: "el movimiento de un pago vuelve a contarse como manual",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/tesoreriaLectura.mjs",
    minimo: 40,
    inyecciones: [{ de: "    } else if (esPagoClase(m)) {", a: "    } else if (false) {" }],
    esperadas: ["su movimiento no es manual ni entrega"],
  },
  {
    n: "TE-3",
    defecto: "la lectura deja de clasificar por vínculo y pierde las entregas",
    archivo: "lib/tesoreria/lecturaTesoreriaServer.js",
    suite: "scripts/pruebas-db/tesoreriaLectura.mjs",
    minimo: 30,
    inyecciones: [{ de: "    await vinculosDeMovimientos(db, movimientos.map((m) => m.id))", a: "    {}" }],
    esperadas: ["efectivo entregado consolidado $110.000", "caja 1: una RECAUDACION y un CIERRE, cada uno una vez"],
  },
  {
    n: "TE-4",
    defecto: "un cierre sin conteo vuelve a leerse como $0 entregado",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/tesoreriaLectura.mjs",
    minimo: 40,
    inyecciones: [{ de: "c.sinImporteDeclarado && c.entregas.length === 0 ? null :", a: "false ? null :" }],
    esperadas: ["sin importe declarado: null, no 0"],
  },
  {
    n: "TE-5",
    defecto: "un pago en efectivo desde la caja vuelve a tomarse como egreso exterior",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/tesoreriaLectura.mjs",
    minimo: 40,
    inyecciones: [{ de: "    if (p.cajaMovimientoId != null && p.turnoId != null) {", a: "    if (false) {" }],
    esperadas: ["el pago no es egreso exterior", "el pago figura desde la caja, una vez"],
  },
  // ── LA PUERTA DE TESORERÍA: GET /api/finanzas/tesoreria ─────────────────
  {
    n: "TA-1",
    defecto: "la API de Tesorería vuelve a abrirse con finanzas.ver",
    archivo: "app/api/finanzas/tesoreria/route.js",
    suite: "scripts/pruebas-db/tesoreriaApi.mjs",
    // El montaje solo ya son ~33 afirmaciones (cajas, ventas, cierres): con eso
    // se sabe que la suite corrió aunque la sección D se corte por el defecto.
    minimo: 30,
    inyecciones: [{ de: "checkPerm(session, PERMISO_VER_TESORERIA)", a: "checkPerm(session, \"finanzas.ver\")" }],
    esperadas: ["con finanzas.ver y sin tesoreria.ver: 403"],
  },
  {
    n: "TA-2",
    defecto: "la API de Tesorería deja de mirar el local pedido",
    archivo: "app/api/finanzas/tesoreria/route.js",
    suite: "scripts/pruebas-db/tesoreriaApi.mjs",
    // El montaje solo ya son ~33 afirmaciones (cajas, ventas, cierres): con eso
    // se sabe que la suite corrió aunque la sección D se corte por el defecto.
    minimo: 30,
    inyecciones: [{ de: "      esDeposito,\n      localDeLaSesion: vista.localId,", a: "      esDeposito: true,\n      localDeLaSesion: vista.localId," }],
    esperadas: ["A pidiendo B por destino: 403", "B pidiendo A por destino: 403"],
  },
];

// Sin argumento corren todos. Con un prefijo —`SI-`— solo los casos cuyo número
// empieza así: es lo que usa el CI, que no tiene por qué pagar los minutos de
// la suite de transferencias para probar la de compras.
const PREFIJO = process.argv[2] || "";
const ELEGIDOS = CASOS.filter((c) => String(c.n).startsWith(PREFIJO));
if (ELEGIDOS.length === 0) {
  console.log(`✗ ningún caso empieza con «${PREFIJO}»: no se probó nada`);
  process.exit(1);
}

// `node_modules` se ENLAZA, no se copia. Copiarlo entero daba un árbol a medias
// —`next/server` dejaba de resolver, con un mensaje que apuntaba a otro lado— y
// además tarda. Enlazado, la resolución sube desde la copia, encuentra el enlace
// y entra al mismo árbol de siempre. Nada de lo que se rompe a propósito vive
// ahí adentro.
const copiar = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), "contra-db-"));
  for (const entrada of fs.readdirSync(ORIGEN)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    execFileSync("cp", ["-a", path.join(ORIGEN, entrada), destino]);
  }
  fs.symlinkSync(path.join(ORIGEN, "node_modules"), path.join(destino, "node_modules"));
  return destino;
};

/**
 * El entorno del hijo, SIN la marca de registro del cargador de alias.
 *
 * `scripts/alias-loader.mjs` se protege de registrarse en cadena con
 * `__ERPAZUL_ALIAS_LOADER__` en el entorno. Este script corre con el cargador
 * puesto, así que la marca ya está — y heredarla hacía que el hijo importara el
 * cargador y NO lo registrara. El síntoma no se parecía en nada a la causa:
 * `next/server` dejaba de resolver y el mensaje culpaba a `node_modules`, que
 * estaba perfecto.
 */
const entornoHijo = () => {
  const env = { ...process.env };
  delete env.__ERPAZUL_ALIAS_LOADER__;
  return env;
};

let fallas = 0;
for (const c of ELEGIDOS) {
  const raiz = copiar();
  const archivo = path.join(raiz, c.archivo);
  let texto = fs.readFileSync(archivo, "utf8");

  // Cada inyección tiene que aplicar, y una sola vez. Un ancla que no engancha
  // deja el archivo sano y la suite verde, y eso se lee como "el candado no
  // sirve" cuando lo que no sirvió fue el destrozo.
  let ancladas = true;
  for (const iny of c.inyecciones) {
    const apariciones = texto.split(iny.de).length - 1;
    if (apariciones !== 1) {
      console.log(`✗ ${c.n}  una inyección no aplica (${apariciones} coincidencias de «${iny.de.trim()}»)`);
      ancladas = false;
      break;
    }
    texto = texto.replace(iny.de, iny.a);
  }
  if (!ancladas) {
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }
  fs.writeFileSync(archivo, texto);

  let salida = "";
  try {
    salida = execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", c.suite || "scripts/pruebas-db/recepcionTransferencias.mjs"],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: entornoHijo() }
    );
  } catch (e) {
    salida = `${e.stdout || ""}${e.stderr || ""}`;
  }

  // Que la suite haya CORRIDO: si abortó al montar, el rojo no prueba nada.
  const corrio = /Afirmaciones que pasaron: (\d+)/.exec(salida);
  const pasadas = corrio ? Number(corrio[1]) : 0;
  // El piso es de cada suite: la de compras tiene menos afirmaciones que la de
  // transferencias, y un piso de 100 la daría siempre por no corrida.
  if (pasadas < (c.minimo ?? 100)) {
    console.log(`✗ ${c.n}  la suite no llegó a correr (${pasadas} afirmaciones): el rojo no vale`);
    console.log(salida.split("\n").slice(0, 12).map((l) => `     | ${l}`).join("\n"));
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }

  const faltantes = c.esperadas.filter((t) => !salida.includes(`✗ [`) || !salida.includes(t + " —"));
  if (faltantes.length === 0) {
    console.log(`✓ ${c.n}  ${c.defecto} → ROJO en: ${c.esperadas.join(" · ")}`);
  } else {
    console.log(`✗ ${c.n}  ${c.defecto} → NO se pusieron rojas: ${faltantes.join(" · ")}`);
    fallas++;
  }
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(fallas === 0
  ? `\n${ELEGIDOS.length}/${ELEGIDOS.length} contrapruebas de base en rojo, como corresponde`
  : `\n${fallas} contrapruebas de base NO probaron nada`);
process.exit(fallas === 0 ? 0 : 1);
