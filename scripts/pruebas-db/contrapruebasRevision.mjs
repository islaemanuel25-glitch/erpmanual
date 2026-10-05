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
import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const ORIGEN = process.cwd();

// ── LAS DEFENSAS QUE VIVEN EN UNA MIGRACIÓN ─────────────────────────────────
//
// Romper un .js en la copia alcanza porque la suite lo importa de la copia. Una
// migración no: la base de la prueba ya la tiene aplicada, y editar el archivo
// no la cambia. Para esos casos (`migracion`) la suite corre contra una base
// AISLADA: una copia de la de la prueba (CREATE DATABASE … TEMPLATE), donde se
// deshacen los objetos de esa migración y se vuelve a correr el archivo YA
// ROTO. Así lo que se prueba es el texto de la migración, el mismo que va a
// producción, y la base de la prueba no se toca. La aislada se tira al final.
//
// El SQL se aplica con psql y los datos de conexión por variables PG*: la URL
// lleva la contraseña y un error de execFileSync imprime los argumentos.
const VERIFICACION_EFECTIVO = "prisma/migrations/20261004120000_verificacion_efectivo/migration.sql";
const DESHACER_VERIFICACION_EFECTIVO = `
  DROP TABLE "VerificacionEfectivoEntrega", "VerificacionEfectivo" CASCADE;
  DROP TYPE "EstadoVerificacionEfectivo", "ClaseEntregaEfectivo";
  DROP FUNCTION "verificacion_entrega_foto_fiel"(), "verificacion_declarado_es_la_suma"(),
    "verificacion_solo_se_anula"(), "verificacion_entrega_inmutable"(), "verificacion_efectivo_no_se_borra"();`;

// La del turno operativo deshace solo lo suyo. `verificacion_solo_se_anula` la
// reemplaza con CREATE OR REPLACE y se vuelve a reemplazar al reaplicar.
const TURNO_OPERATIVO = "prisma/migrations/20261004200000_turno_operativo/migration.sql";
const DESHACER_TURNO_OPERATIVO = `
  DROP TRIGGER "VerificacionEfectivoEntrega_turno_operativo" ON "VerificacionEfectivoEntrega";
  DROP TRIGGER "Turno_turno_operativo_inmutable" ON "Turno";
  DROP FUNCTION "verificacion_entrega_del_turno_operativo"(), "turno_operativo_de_caja_inmutable"();
  ALTER TABLE "VerificacionEfectivo" DROP COLUMN "turnoOperativoId", DROP COLUMN "fechaOperativa";
  ALTER TABLE "Turno" DROP COLUMN "turnoOperativoId", DROP COLUMN "fechaOperativa";
  DROP TABLE "TurnoOperativo";`;

// La corrección del turno de una caja abierta solo reemplaza el cuerpo de la
// función del trigger. Romperla no necesita deshacer nada: la versión rota la
// vuelve a reemplazar. Y como pisa a la del turno operativo, se reaplica sana
// después de cualquier caso que rompa aquélla.
const CORRECCION_TURNO_OPERATIVO = "prisma/migrations/20261005100000_correccion_turno_operativo_de_caja/migration.sql";
const MIGRACION_CORRECCION_TURNO_OPERATIVO = { deshacer: "SELECT 1;" };
const MIGRACION_TURNO_OPERATIVO = { deshacer: DESHACER_TURNO_OPERATIVO, despues: [CORRECCION_TURNO_OPERATIVO] };

// Para romper la de verificación hay que sacar antes la del turno operativo,
// que le agrega columnas y triggers, y reaplicarla sana después.
const MIGRACION_VERIFICACION_EFECTIVO = {
  deshacer: DESHACER_TURNO_OPERATIVO + DESHACER_VERIFICACION_EFECTIVO,
  despues: [TURNO_OPERATIVO, CORRECCION_TURNO_OPERATIVO],
};

const entornoPg = (url) => ({
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
});
const psql = (url, args) =>
  execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { env: entornoPg(url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Crea la base aislada con la migración rota aplicada. Devuelve su URL y cómo tirarla. */
async function baseAislada(c, archivoRoto) {
  const origen = new URL(process.env.DATABASE_URL);
  const base = origen.pathname.slice(1);
  const nombre = `${base}_contra_${String(c.n).toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const mantenimiento = new URL(origen);
  mantenimiento.pathname = "/postgres";
  // ESCRITURA: la fábrica exige servidor local y NODE_ENV distinto de production.
  const admin = await crearClientePrisma({ nivel: ESCRITURA, url: mantenimiento.toString() });
  const tirar = () => admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
  const tirarYSoltar = async () => {
    await tirar();
    await admin.$disconnect();
  };
  const url = new URL(origen);
  url.pathname = `/${nombre}`;
  try {
    await tirar();
    await admin.$executeRawUnsafe(`CREATE DATABASE "${nombre}" TEMPLATE "${base}"`);
    psql(url, ["-c", c.migracion.deshacer]);
    psql(url, ["-f", archivoRoto]);
    // Las migraciones POSTERIORES que tocan lo mismo se reaplican, sanas,
    // encima de la rota: la suite corre con el código de hoy y necesita el
    // esquema de hoy. `deshacer` ya las quitó antes.
    for (const posterior of c.migracion.despues ?? []) psql(url, ["-f", path.join(ORIGEN, posterior)]);
  } catch (e) {
    await tirarYSoltar().catch(() => {});
    throw e;
  }
  return { url: url.toString(), tirar: tirarYSoltar };
}

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
    // Desde la PR 4 los vínculos se leen junto con las verificaciones y llegan
    // en `vinculos`: el defecto es el mismo, clasificar sin ellos.
    inyecciones: [{ de: "clasificarMovimientos(movimientos, vinculos);", a: "clasificarMovimientos(movimientos, {});" }],
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
  // ── LA VERIFICACIÓN DE EFECTIVO: LAS DEFENSAS ESTÁN EN LA MIGRACIÓN ─────
  //
  // Se rompe el TEXTO de la migración y se corre la suite contra una base
  // aislada donde se aplicó así (ver `baseAislada`). El montaje solo —cajas,
  // ventas, retiros y cierres por las rutas— ya son ~40 afirmaciones.
  {
    n: "TV-1",
    defecto: "una entrega puede quedar en dos verificaciones vigentes",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    inyecciones: [{
      de: "CREATE UNIQUE INDEX \"VerificacionEfectivoEntrega_una_vigente_por_movimiento\"",
      a: "CREATE INDEX \"VerificacionEfectivoEntrega_una_vigente_por_movimiento\"",
    }],
    esperadas: [
      "otra verificación vigente sobre la misma entrega: rechazada",
      "la segunda queda esperando en el índice, no adivina",
      "la segunda se rechaza al ver confirmada la primera",
    ],
  },
  {
    n: "TV-2",
    defecto: "la foto de una entrega verificada se puede editar",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    inyecciones: [{
      de: "CREATE TRIGGER \"VerificacionEfectivoEntrega_inmutable\" BEFORE UPDATE ON \"VerificacionEfectivoEntrega\"\n  FOR EACH ROW EXECUTE FUNCTION \"verificacion_entrega_inmutable\"();",
      a: "",
    }],
    esperadas: ["editar la foto de una entrega: rechazado"],
  },
  {
    n: "TV-3",
    defecto: "la foto deja de compararse con el importe real del movimiento",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    inyecciones: [{ de: "  IF NEW.\"montoDeclaradoSnapshot\" <> mov.\"monto\"\n     OR ", a: "  IF " }],
    esperadas: ["foto con monto falso: rechazada", "verificar de nuevo con la foto vieja: rechazado"],
  },
  {
    n: "TV-4",
    defecto: "el declarado puede no ser la suma de las entregas",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    inyecciones: [{ de: "  IF suma <> declarado THEN", a: "  IF false THEN" }],
    esperadas: ["declarado distinto de la suma: rechazado al confirmar"],
  },
  {
    n: "TV-5",
    defecto: "una verificación mezcla entregas de dos locales",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    // Las DOS mitades: el trigger compara la foto con el local real del turno y
    // la FK compuesta ata la foto al local del padre. Cualquiera de las dos
    // frena uno de los dos caminos; para que el defecto vuelva hay que sacar ambas.
    inyecciones: [
      { de: "     OR NEW.\"localIdSnapshot\" <> tur.\"localId\"\n", a: "" },
      {
        de: "ALTER TABLE \"VerificacionEfectivoEntrega\" ADD CONSTRAINT \"VerificacionEfectivoEntrega_verificacionEfectivoId_localId_fkey\" FOREIGN KEY (\"verificacionEfectivoId\", \"localIdSnapshot\") REFERENCES \"VerificacionEfectivo\"(\"id\", \"localId\") ON DELETE RESTRICT ON UPDATE RESTRICT;",
        a: "",
      },
    ],
    esperadas: [
      "una entrega del local B en una verificación del A: rechazada",
      "la foto con el local real B bajo un padre del A: rechazada",
    ],
  },
  {
    n: "TV-6",
    defecto: "la clave de idempotencia deja de ser única en el local",
    archivo: VERIFICACION_EFECTIVO,
    migracion: MIGRACION_VERIFICACION_EFECTIVO,
    suite: "scripts/pruebas-db/verificacionEfectivo.mjs",
    minimo: 40,
    inyecciones: [{
      de: "CREATE UNIQUE INDEX \"VerificacionEfectivo_localId_idempotencyKey_key\"",
      a: "CREATE INDEX \"VerificacionEfectivo_localId_idempotencyKey_key\"",
    }],
    esperadas: ["misma clave en el mismo local: rechazada"],
  },
  // ── VERIFICAR Y ANULAR: LAS REGLAS DE LAS ACCIONES (PR #137) ────────────
  //
  // Rompen el código de las acciones, la lectura y la corrección, y corren
  // verificacionEfectivoAcciones.mjs, que va siempre por las rutas. El montaje
  // solo —cajas, ventas, cierres, incidentes— ya pasa las 40 afirmaciones.
  {
    n: "VA-1",
    defecto: "verificar deja de tomar el turno y se cruza con la corrección",
    archivo: "lib/tesoreria/verificacionEfectivoServer.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "  for (const turnoId of turnoIds) await bloquearTurno(tx, turnoId);\n\n  // La clave", a: "\n  // La clave" }],
    esperadas: ["las dos quedaron esperando el turno", "[31] orden 2: la corrección se aplica"],
  },
  {
    n: "VA-2",
    defecto: "la corrección histórica vuelve a reescribir una entrega verificada",
    archivo: "lib/caja/correcciones/motor.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "      if (verificadas.length) {", a: "      if (false) {" }],
    esperadas: [
      "[28] el ensayo se rechaza con ENTREGA_VERIFICADA_EN_TESORERIA",
      "[30] Admin por la ruta de aplicar: 409 ENTREGA_VERIFICADA_EN_TESORERIA",
      "[31] orden 1: la corrección se rechaza por Tesorería",
    ],
  },
  {
    n: "VA-3",
    defecto: "la misma clave con otro contenido devuelve la verificación de antes",
    archivo: "lib/tesoreria/verificacionEfectivoServer.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "  if (!mismoContenido(contenidoGuardado(previa), pedido)) {", a: "  if (false) {" }],
    esperadas: ["[18] misma clave, otro importe: 409"],
  },
  {
    n: "VA-4",
    defecto: "un local verifica entregas de otro",
    archivo: "lib/tesoreria/verificacionEfectivoServer.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "  if (filas.some((f) => !visibles.includes(f.turno.localId))) {", a: "  if (false) {" }],
    esperadas: ["[5] A no verifica una entrega de B: 403"],
  },
  {
    n: "VA-5",
    defecto: "el cliente vuelve a poder mandar el declarado",
    archivo: "lib/tesoreria/verificacionEfectivo.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "  if (ajenos.length) {", a: "  if (false) {" }],
    esperadas: ["[13] mandar importeDeclarado: 400"],
  },
  {
    n: "VA-6",
    defecto: "la lectura deja de avisar una verificación desactualizada",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "    if (!motivos.length) continue;", a: "    continue;" }],
    esperadas: ["[35] VERIFICACION_DESACTUALIZADA, con la verificación y el motivo"],
  },
  {
    n: "VA-7",
    defecto: "verificar vuelve a abrirse con tesoreria.ver",
    archivo: "app/api/finanzas/tesoreria/verificaciones/route.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "checkPerm(session, PERMISO_VERIFICAR_EFECTIVO)", a: "checkPerm(session, \"tesoreria.ver\")" }],
    esperadas: ["[2] tesoreria.ver solo no verifica: 403"],
  },
  {
    n: "VA-8",
    defecto: "anular dos veces deja de ser seguro",
    archivo: "lib/tesoreria/verificacionEfectivoServer.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "  if (actual.estado === ESTADO_VERIFICACION.ANULADA) {", a: "  if (false) {" }],
    esperadas: ["[24] anular otra vez: 200, ya estaba, sin pisar el motivo", "[26] las dos contestan 200"],
  },
  // ── EL TURNO OPERATIVO ───────────────────────────────────────────────────
  //
  // Rompen una defensa a la vez —en el código o en el texto de la migración— y
  // corren turnoOperativo.mjs, que abre las cajas por las rutas. El montaje
  // solo —catálogo, aperturas, ventas y cierres— ya pasa las 30 afirmaciones.
  {
    n: "TO-1",
    defecto: "abrir caja deja de exigir un turno de este local y activo",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 5,
    inyecciones: [{ de: "  if (!valido.valido) return { ok: false, status: valido.status", a: "  if (false) return { ok: false, status: valido.status" }],
    esperadas: ["con un turno de otro local: 400 y su código", "con un turno inactivo: 400 y su código"],
  },
  {
    n: "TO-2",
    defecto: "Tesorería vuelve a agrupar por el día y no por el turno de la caja",
    archivo: "lib/tesoreria/turnoComercial.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (caja.turnoOperativoId != null && fecha) {", a: "  if (false) {" }],
    esperadas: ["Mañana y Tarde del mismo día: grupos distintos", "y se llama por el turno, con su criterio"],
  },
  {
    n: "TO-3",
    defecto: "una verificación vuelve a poder mezclar turnos o fechas",
    archivo: "lib/tesoreria/verificacionEfectivoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (claves.length > 1) {\n    const turnos", a: "  if (false) {\n    const turnos" }],
    esperadas: ["Mañana + Tarde: 400 TURNOS_OPERATIVOS_MEZCLADOS", "Mañana de hoy + Mañana de ayer: 400 FECHAS_OPERATIVAS_MEZCLADAS"],
  },
  {
    n: "TO-4",
    // Desde 20261005100000 el turno de una caja ABIERTA se corrige de un
    // turno a otro. Lo que sigue prohibido es todo lo demás, y sin el trigger
    // pasa todo: el backfill, perder el turno y cambiar el de una caja cerrada.
    defecto: "el turno y la fecha de una caja se pueden cambiar sin ninguna condición",
    archivo: TURNO_OPERATIVO,
    migracion: MIGRACION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 5,
    inyecciones: [{
      de: "CREATE TRIGGER \"Turno_turno_operativo_inmutable\" BEFORE UPDATE OF \"turnoOperativoId\", \"fechaOperativa\" ON \"Turno\"\n  FOR EACH ROW EXECUTE FUNCTION \"turno_operativo_de_caja_inmutable\"();",
      a: "",
    }],
    esperadas: [
      "[TO-4] una caja vieja no recibe turno después: no hay backfill posible",
      "[TO-4] una caja cerrada no cambia su turno",
      "[TO-4] la base tampoco cambia el turno de una caja con efectivo verificado",
    ],
  },
  // ── LA CORRECCIÓN DEL TURNO DE UNA CAJA ABIERTA ─────────────────────────
  {
    n: "TO-4b",
    defecto: "la base deja corregir el turno de una caja cerrada, en cierre o anulada",
    archivo: CORRECCION_TURNO_OPERATIVO,
    migracion: MIGRACION_CORRECCION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    // La condición entera, el antes y el después: la primera versión apagaba
    // solo el antes y el después la seguía frenando —con la caja ya cerrada,
    // NEW trae el mismo `cierre`—, así que la contraprueba no probaba nada.
    inyecciones: [{
      de: "  IF OLD.\"cierre\" IS NOT NULL OR OLD.\"cierreEnPreparacionEn\" IS NOT NULL OR OLD.\"anuladoEn\" IS NOT NULL\n     OR NEW.\"cierre\" IS NOT NULL OR NEW.\"cierreEnPreparacionEn\" IS NOT NULL OR NEW.\"anuladoEn\" IS NOT NULL THEN",
      a: "  IF false THEN",
    }],
    esperadas: ["[TO-4] una caja cerrada no cambia su turno", "[TO-4] una caja anulada no cambia su turno"],
  },
  {
    n: "TO-4c",
    defecto: "la base deja corregir el turno de una caja con efectivo en una verificación vigente",
    archivo: CORRECCION_TURNO_OPERATIVO,
    migracion: MIGRACION_CORRECCION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "     WHERE m.\"turnoId\" = OLD.\"id\" AND e.\"vigente\"", a: "     WHERE false" }],
    esperadas: ["[TO-4] la base tampoco cambia el turno de una caja con efectivo verificado"],
  },
  {
    n: "TO-4d",
    defecto: "la base deja asignarle turno a una caja que se abrió sin turno",
    archivo: CORRECCION_TURNO_OPERATIVO,
    migracion: MIGRACION_CORRECCION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  IF OLD.\"turnoOperativoId\" IS NULL OR OLD.\"fechaOperativa\" IS NULL\n     OR NEW", a: "  IF false\n     AND NEW" }],
    esperadas: ["[TO-4] una caja vieja no recibe turno después: no hay backfill posible"],
  },
  {
    n: "TO-CC1",
    defecto: "las opciones de la corrección se calculan con la hora de ahora y no con la apertura de la caja",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [
      { de: "localId: caja.localId, ahora: caja.apertura });", a: "localId: caja.localId, ahora: new Date() });" },
      { de: "    ahora: caja.apertura,\n  });", a: "    ahora: new Date(),\n  });" },
    ],
    esperadas: [
      "[TO-CC1] las opciones son las de la APERTURA de la caja: domingo 23:30",
      "[TO-CC1] y las de otra caja, abierta el lunes 22:00, son otras: la hora de ahora no las cambia",
    ],
  },
  {
    n: "TO-CC2",
    defecto: "la corrección acepta cualquier turno activo del local",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "  if (!ocurrencia.valido) return { ok: false, status: ocurrencia.status, codigo: ocurrencia.codigo, error: ocurrencia.error };",
      a: "  if (false) return null;",
    }],
    esperadas: ["[TO-CC3] un turno activo que en la apertura no era posible: 409 y su código"],
  },
  {
    n: "TO-CC3",
    defecto: "la corrección guarda la fecha operativa que manda el cliente",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "  await tx.turno.update({ where: { id: caja.id }, data: elegido.datos, select: { id: true } });",
      a: "  await tx.turno.update({ where: { id: caja.id }, data: { ...elegido.datos, ...(body?.fechaOperativa ? { fechaOperativa: new Date(body.fechaOperativa) } : {}) }, select: { id: true } });",
    }],
    esperadas: ["[TO-CC2] la fecha que mandó el cliente se ignora: la base tiene la del servidor"],
  },
  {
    n: "TO-CC4",
    defecto: "la corrección no mira si la caja sigue abierta",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (estadoDelTurno(caja) !== ESTADO_TURNO.ABIERTO) {", a: "  if (false) {" }],
    esperadas: ["[TO-CC8] una caja cerrada: 409 y su código, sin cambios", "[TO-CC8] una caja anulada: 409 y su código, sin cambios"],
  },
  {
    n: "TO-5",
    defecto: "la base acepta una entrega de otro turno en una verificación",
    archivo: TURNO_OPERATIVO,
    migracion: MIGRACION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "CREATE TRIGGER \"VerificacionEfectivoEntrega_turno_operativo\" BEFORE INSERT ON \"VerificacionEfectivoEntrega\"\n  FOR EACH ROW EXECUTE FUNCTION \"verificacion_entrega_del_turno_operativo\"();",
      a: "",
    }],
    esperadas: ["la base no acepta una entrega de Tarde en una verificación de Mañana"],
  },
  // ── LA VENTANA DE RECONOCIMIENTO DEL TURNO ──────────────────────────────
  {
    n: "TO-H3",
    defecto: "con dos coincidencias la apertura elige la primera en vez de preguntar",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (candidatosIds.length === 1) return {", a: "  if (candidatosIds.length >= 1) return {" }],
    esperadas: ["[TO-H3] dos coincidencias: pregunta y no propone ninguno"],
  },
  {
    n: "TO-H8",
    defecto: "una ventana que cruza la medianoche deja la jornada en el día en que empieza",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  return v.inicio > v.fin ? sumarDias(dia, 1) : dia;", a: "  return dia;" }],
    esperadas: ["[TO-C1] domingo 23:30 + turno 23→01: jornada del LUNES", "[TO-C4] lunes 22:00: el siguiente del ciclo es el que cruza, del MARTES"],
  },
  {
    n: "TO-H10",
    defecto: "la apertura guarda el día de hoy sin validar el turno final contra el ciclo",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "  const ocurrencia = ocurrenciaDeApertura(activos, turno.id, momentoArgentina(ahora));",
      a: "  const ocurrencia = { valido: true, fechaOperativa: momentoArgentina(ahora).fecha };",
    }],
    esperadas: ["[TO-C4] lunes 22:00: el siguiente del ciclo es el que cruza, del MARTES", "[TO-C5][TO-C8] lunes 22:00: el de la mañana, ya pasado y a dos pasos, se rechaza"],
  },
  // ── EL CICLO DE TURNOS ──────────────────────────────────────────────────
  {
    n: "TO-C5",
    defecto: "la apertura deja saltar a un turno lejano del ciclo",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "    if (d.inicio === masReciente || d.enVentana) {", a: "    if (true) {" }],
    esperadas: [
      "[TO-C5][TO-C8] lunes 22:00: el de la mañana, ya pasado y a dos pasos, se rechaza",
      "[TO-C9] la pantalla recibe el actual y el próximo, y no el pasado",
      "[TO-C8] abrir por la ruta con el turno pasado: 409, aunque esté activo y sea del local",
    ],
  },
  {
    n: "TO-C11",
    defecto: "vuelve la fecha por el extremo horario más cercano para un turno fuera del ciclo",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    // Las dos mitades del defecto viejo: el turno fuera del ciclo se acepta, y
    // su fecha sale de qué extremo de la ventana está más cerca.
    inyecciones: [
      {
        de: "const enElDia = (x) => ((x % MINUTOS_DEL_DIA) + MINUTOS_DEL_DIA) % MINUTOS_DEL_DIA;",
        a: "const enElDia = (x) => ((x % MINUTOS_DEL_DIA) + MINUTOS_DEL_DIA) % MINUTOS_DEL_DIA;\nconst cercano = (ts, id, { fecha, minuto }) => { const t = (ts || []).find((x) => x.id === id); const v = t && ventanaDe(t); if (!v) return null; const mitad = (v.fin + v.inicio) / 2; return { id, nombre: t.nombre, fechaOperativa: v.inicio > v.fin && minuto >= mitad ? sumarDias(fecha, 1) : fecha }; };",
      },
      {
        de: "  const opcion = ciclo.opciones.find((o) => o.id === turnoId);",
        a: "  const opcion = ciclo.opciones.find((o) => o.id === turnoId) ?? cercano(turnos, turnoId, momento);",
      },
    ],
    esperadas: [
      "[TO-C5][TO-C8] lunes 22:00: el de la mañana, ya pasado y a dos pasos, se rechaza",
      "[TO-C8] abrir por la ruta con el turno pasado: 409, aunque esté activo y sea del local",
    ],
  },
  {
    n: "TO-C13",
    defecto: "el ciclo ignora el orden configurado y sigue el horario",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id);",
      a: "    .sort((a, b) => (minutosDeHora(a.horaInicioReconocimiento) ?? 0) - (minutosDeHora(b.horaInicioReconocimiento) ?? 0) || a.id - b.id);",
    }],
    esperadas: ["[TO-C13] con otro orden, a las 22:00 el siguiente es el de la mañana del martes"],
  },
  // ── LA TRANSICIÓN POR LOCAL ─────────────────────────────────────────────
  {
    n: "TO-T4",
    defecto: "un local que ya usa turnos vuelve a abrir cajas sin turno",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{
      de: "    if (legado) return { ok: true, datos: SIN_TURNO, turno: null, legado: true };",
      a: "    return { ok: true, datos: SIN_TURNO, turno: null, legado: true };",
    }],
    esperadas: ["[TO-T4][TO-T8] una apertura sin turno ya no abre: 400 y su código", "[TO-T4] y no se escribió ninguna caja sin turno"],
  },
  {
    n: "TO-T9",
    defecto: "desactivar todos los turnos devuelve el local al modo legado",
    archivo: "lib/caja/turnoOperativoServer.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  return { activos, legado: filas === 0 };", a: "  return { activos, legado: activos.length === 0 };" }],
    esperadas: ["[TO-T9] sin turnos activos el local NO vuelve al legado: se dice qué falta", "[TO-T9] y una apertura sin turno no abre: 409"],
  },
  // ── UN TURNO ACTIVO TIENE HORARIO ───────────────────────────────────────
  {
    n: "TO-HR1",
    defecto: "la regla deja guardar un turno activo sin horario",
    archivo: "lib/caja/turnoOperativo.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  if (horaInicioReconocimiento != null && horaFinReconocimiento != null) return null;", a: "  return null;" }],
    esperadas: ["[TO-HR1] dar de alta sin horario: 400 y su código"],
  },
  {
    n: "TO-HR2",
    defecto: "la edición mira el activo que había y deja activar un turno sin horario",
    archivo: "app/api/config/turnos-operativos/[id]/route.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "rechazoPorFaltaDeHorario({ ...actual, ...data });", a: "rechazoPorFaltaDeHorario({ ...actual, ...data, activo: actual.activo });" }],
    esperadas: ["[TO-HR2] activarlo sin horario: 400 y su código"],
  },
  {
    n: "TO-HR3",
    defecto: "la edición mira el horario que había y deja sacárselo a un turno activo",
    archivo: "app/api/config/turnos-operativos/[id]/route.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "rechazoPorFaltaDeHorario({ ...actual, ...data });", a: "rechazoPorFaltaDeHorario({ ...data, ...actual });" }],
    esperadas: ["[TO-HR3] sacarle el horario a un turno activo: 400 y su código"],
  },
  {
    n: "TO-HR5",
    defecto: "la base guarda un turno activo sin horario",
    archivo: TURNO_OPERATIVO,
    migracion: MIGRACION_TURNO_OPERATIVO,
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "CHECK (\n      NOT \"activo\" OR (", a: "CHECK (\n      true OR (" }],
    esperadas: ["[TO-HR5] la base no guarda un turno activo sin horario", "[TO-HR5] ni le saca el horario a uno activo"],
  },
  {
    n: "TO-HR7",
    defecto: "el primer turno de un local se crea sin horario y lo saca del legado",
    archivo: "app/api/config/turnos-operativos/route.js",
    suite: "scripts/pruebas-db/turnoOperativo.mjs",
    minimo: 30,
    inyecciones: [{ de: "  const sinHorario = rechazoPorFaltaDeHorario({ activo: true, ...rango.rango });", a: "  const sinHorario = null;" }],
    esperadas: ["[TO-HR7] un primer turno sin horario no se crea: 400 y su código"],
  },
  // ── EL CONTRATO DE LA PANTALLA MÓVIL (PR #138) ───────────────────────────
  //
  // Lo que la pantalla no puede comprobar sola: que un período mal pedido no se
  // convierta en otro, que el botón que se ofrece sea el que el servidor
  // acepta, que los nombres salgan de la base y que un acto que cruza no se
  // reparta.
  {
    n: "TC-1",
    defecto: "un rango «Otro» mal armado cae en silencio a otro período",
    archivo: "app/api/finanzas/tesoreria/route.js",
    suite: "scripts/pruebas-db/tesoreriaApi.mjs",
    minimo: 30,
    inyecciones: [{
      de: "if (leido.error) return NextResponse.json({ ok: false, error: leido.error }, { status: 400 });\n      rangoFijo = leido.rango;",
      a: "rangoFijo = leido.rango ?? null;",
    }],
    esperadas: ["desde inválido: 400 con mensaje, sin lectura", "desde después de hasta: 400 con mensaje, sin lectura"],
  },
  {
    n: "TC-2",
    defecto: "un gasto sin beneficiario se nombra con otro dato",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/tesoreriaApi.mjs",
    minimo: 30,
    inyecciones: [{ de: "beneficiario: p.gasto?.beneficiario ?? null,", a: "beneficiario: p.gasto?.beneficiario ?? p.gasto?.concepto ?? null," }],
    esperadas: ["egreso exterior de un gasto: concepto y categoría reales, sin beneficiario cargado → null"],
  },
  {
    n: "TC-3",
    defecto: "la pantalla ofrece verificar sin el permiso de verificar",
    archivo: "app/api/finanzas/tesoreria/route.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "puedeVerificarEfectivo: checkPerm(session, PERMISO_VERIFICAR_EFECTIVO).ok,", a: "puedeVerificarEfectivo: true," }],
    esperadas: ["solo ver: no ofrece ni verificar ni anular", "ver + anular"],
  },
  {
    n: "TC-4",
    defecto: "sin operador, el verificador se completa con la cuenta",
    archivo: "lib/tesoreria/verificacionEfectivoLectura.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{
      de: "verificadaPorOperador: v.verificadaPorOperadorId == null ? null : { id: v.verificadaPorOperadorId, nombre: null },",
      a: "verificadaPorOperador: persona(v.verificadaPor),",
    }],
    esperadas: ["sin PIN, el operador es null y no se completa con la cuenta"],
  },
  {
    n: "TC-5",
    defecto: "un acto que cruza el período se da por completo",
    archivo: "lib/tesoreria/lecturaTesoreria.js",
    suite: "scripts/pruebas-db/verificacionEfectivoAcciones.mjs",
    minimo: 40,
    inyecciones: [{ de: "actosQueCruzanIds: actosDe.filter((a) => !a.completo).map((a) => a.id),", a: "actosQueCruzanIds: []," }],
    esperadas: ["y se nombra entre los que cruzan", "en el día anterior también cruza"],
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

  let aislada = null;
  if (c.migracion) {
    try {
      aislada = await baseAislada(c, archivo);
    } catch (e) {
      // Una migración rota que ni siquiera aplica no prueba nada de la suite.
      console.log(`✗ ${c.n}  la migración rota no se pudo aplicar en la base aislada: ${`${e.stderr || ""}${e.message}`.split("\n")[0]}`);
      fallas++;
      fs.rmSync(raiz, { recursive: true, force: true });
      continue;
    }
  }

  let salida = "";
  try {
    salida = execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", c.suite || "scripts/pruebas-db/recepcionTransferencias.mjs"],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...entornoHijo(), ...(aislada ? { DATABASE_URL: aislada.url } : {}) } }
    );
  } catch (e) {
    salida = `${e.stdout || ""}${e.stderr || ""}`;
  } finally {
    if (aislada) await aislada.tirar().catch((e) => console.log(`  (no se pudo tirar la base aislada: ${e.message})`));
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
