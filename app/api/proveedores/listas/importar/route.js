// POST /api/proveedores/listas/importar
//
// Sube el Excel de un proveedor, lo concilia contra el catálogo y GUARDA el
// resultado. NO aplica ningún costo: lo que queda es una propuesta revisable.
//
// ── EL ORDEN IMPORTA ────────────────────────────────────────────────────────
//
// Validar → leer bytes → hashear → mirar si ya está → parsear → cargar el ERP →
// conciliar → RECIÉN AHÍ abrir la transacción → cabecera → filas → cerrar.
//
// Todo lo caro pasa ANTES de abrir la transacción. Parsear 917 filas y hacer tres
// consultas de catálogo con una transacción abierta sería tener la base tomada
// varios segundos mientras el POS atiende clientes. Adentro de la transacción
// solo quedan los INSERT.
//
// ── LO QUE ESTA RUTA NO HACE ────────────────────────────────────────────────
//
// No toca ProductoBase ni ProductoLocal, no recalcula precios de venta, no crea
// vínculos de código y no confirma sugerencias. Esta etapa termina en CONCILIADA.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
// Namespace import, NO default: el build ESM de `xlsx` (xlsx.mjs) no exporta
// default, y Turbopack falla al compilar la ruta. Es la forma que ya usa el
// resto del ERP. Con `node --test` el default funcionaba por interop de CJS, así
// que el problema solo aparecía al servir la aplicación.
import * as XLSX from "xlsx";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere, getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import { conciliarLista } from "@/lib/proveedores/listas/conciliarLista";
import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import {
  LIMITES,
  ESTADO_IMPORTACION,
  MODO_PRECIO_VENTA,
  ERROR_UPLOAD,
  validarArchivo,
  filasAPersistir,
  contadoresDeCabecera,
  enLotes,
  OPCIONES_TX,
} from "@/lib/proveedores/listas/persistencia";
import {
  configuracionParaLaLista,
  TEXTO_FALTA_CONFIGURACION,
} from "@/lib/proveedores/listas/configuracionProveedor";
// PARA QUÉ SE SUBIÓ LA LISTA, y la conversión del 0 a 0 en un control.
import { MODO_LISTA, resolverModo } from "@/lib/proveedores/listas/modoDeLaLista";
import {
  leerArchivoDeLista,
  TEXTO_MOTIVO_LECTURA_ARCHIVO,
} from "@/lib/proveedores/listas/lectura/lecturaDeArchivo";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import {
  recetaAplicable,
  TEXTO_MOTIVO_RECETA,
  diferenciaDeEstructura,
} from "@/lib/proveedores/listas/lectura/recetaDeLista";
import {
  filasDelArchivo,
  decidirColumnaDeLaLista,
  aplicarEleccion,
} from "@/lib/proveedores/listas/importacionGenerica";

/**
 * EL CAMINO GENÉRICO: abrir el archivo y saber qué columna es cada cosa.
 *
 * Devuelve las filas con TODOS los precios candidatos adentro; cuál de ellos es
 * el precio se decide más adelante, cuando ya están el catálogo y el rango.
 *
 * Corta con 409 en los dos casos en que hace falta una persona:
 *
 *   FALTA_CONFIRMAR_COLUMNAS  es la primera lista de este proveedor, o el
 *                             archivo cambió de estructura. No se adivina: el
 *                             mapa que quedó guardado apunta a columnas por
 *                             número, y una columna de más corre todos los
 *                             índices sin que nada falle.
 *   (el motor no pudo elegir) lo resuelve el paso 8.bis, que es el que sabe.
 *
 * El 409 lleva TODO lo que la pantalla necesita para preguntar —los títulos, la
 * propuesta con ejemplos, la huella— así que no hace falta volver a subir el
 * archivo para contestar.
 */
async function leerArchivoGenerico({ bytes, nombre, proveedor, form }) {
  const leido = await leerArchivoDeLista(bytes, { nombre, hoja: form.get("hoja") || null });
  if (!leido.ok) {
    return {
      ok: false,
      status: 400,
      cuerpo: {
        ok: false,
        codigo: leido.motivo,
        error: TEXTO_MOTIVO_LECTURA_ARCHIVO[leido.motivo] ?? "No se pudo leer el archivo.",
        formato: leido.formato,
      },
    };
  }

  const { tabla } = leido;
  const columnas = tabla.titulos.map((titulo, indice) => ({
    indice,
    titulo,
    valores: tabla.filas.map((f) => f.valores[indice]),
  }));
  const propuesta = proponerMapeo(columnas);
  const uso = recetaAplicable({
    guardada: proveedor.listaRecetaLectura,
    huella: proveedor.listaRecetaHuella,
    titulos: tabla.titulos,
  });

  const descartes = {};
  for (const d of tabla.filasDescartadas) descartes[d.motivo] = (descartes[d.motivo] ?? 0) + 1;
  const ejemplos = tabla.filas.slice(0, 8).map((f) => ({ y: f.y, pagina: f.pagina, valores: f.valores }));

  if (!uso.ok) {
    return {
      ok: false,
      status: 409,
      cuerpo: {
        ok: false,
        codigo: "FALTA_CONFIRMAR_COLUMNAS",
        error: TEXTO_MOTIVO_RECETA[uso.motivo],
        motivoConfirmacion: uso.motivo,
        queCambio: diferenciaDeEstructura({ huella: proveedor.listaRecetaHuella, titulos: tabla.titulos }),
        titulos: tabla.titulos,
        mapeo: propuesta.mapeo,
        propuesta: {
          confianza: propuesta.confianza,
          motivosDeDuda: propuesta.motivosDeDuda,
          columnas: propuesta.columnas,
        },
        huella: uso.huellaNueva,
        ejemplos,
        conteo: { filas: tabla.filas.length, descartadas: tabla.filasDescartadas.length, descartesPorMotivo: descartes },
        formato: leido.formato,
      },
    };
  }

  const mapeo = {
    codigo: uso.receta.codigo,
    codigoBarra: uso.receta.codigoBarra,
    descripcion: uso.receta.descripcion,
    cantidad: uso.receta.cantidad,
    descuento: uso.receta.descuento,
    precios: uso.receta.precios,
  };

  // La columna elegida a mano, si la pantalla la mandó. Se valida contra las
  // candidatas: un índice que no es una de ellas no se acepta, porque sería
  // costear con una columna que ni siquiera parece un precio.
  const columnaPedida = Number(form.get("columnaPrecio"));
  const eleccionManual = Number.isInteger(columnaPedida) && mapeo.precios.includes(columnaPedida)
    ? { columna: columnaPedida, conDescuento: leerBooleano(form.get("conDescuento")) === true }
    : null;

  return {
    ok: true,
    mapeo,
    titulos: tabla.titulos,
    huella: uso.huellaNueva,
    formato: leido.formato,
    descartes,
    ejemplos,
    eleccionManual,
    salidaParser: {
      productos: filasDelArchivo({ tabla, mapeo, hojaNombre: leido.detalle?.hoja ?? null }),
      categorias: [],
      advertencias: [],
      errores: [],
      resumen: {
        hojaNombre: leido.detalle?.hoja ?? null,
        formato: leido.formato,
        productos: tabla.filas.length,
        filasDescartadas: tabla.filasDescartadas.length,
        descartesPorMotivo: descartes,
      },
    },
  };
}

/**
 * El "sí o no" de los impuestos adicionales, tal como viaja en el formulario.
 *
 * Devuelve `undefined` cuando el formulario no lo mandó, que NO es lo mismo que
 * "no": undefined deja que mande lo que tiene guardado el proveedor, y false
 * significa que alguien contestó que no. Si esto devolviera false ante la
 * ausencia, subir una lista sin tocar el campo borraría la respuesta del
 * proveedor.
 */
function leerBooleano(valor) {
  if (valor === null || valor === undefined || valor === "") return undefined;
  const v = String(valor).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "si" || v === "sí") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

export async function POST(req) {
  try {
    // ── 1. Sesión, permiso y contexto ────────────────────────────────────
    //
    // Importar listas mueve el costo de todo el catálogo de un proveedor: por
    // ahora es exclusivo de administradores. `esAdmin` es cómo el ERP reconoce
    // al administrador (permisos incluye "*"); no se inventa ningún rol nuevo.
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { session, grupoId, localId } = scope;

    // ── 2. El formulario ─────────────────────────────────────────────────
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Se esperaba un formulario con el archivo." },
        { status: 400 }
      );
    }

    const archivo = form.get("archivo") ?? form.get("file");
    const proveedorId = Number(form.get("proveedorId"));
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return NextResponse.json(
        { ok: false, error: "Falta el archivo.", codigo: ERROR_UPLOAD.SIN_ARCHIVO },
        { status: 400 }
      );
    }

    // ── 3. El proveedor tiene que ser de este alcance ────────────────────
    //
    // `Proveedor` no tiene grupoId: su pertenencia se deriva de los productos y
    // del local creador. `proveedorVisibleWhere` es la regla canónica del ERP y
    // se reutiliza tal cual, en vez de inventar otra. El id llega por el
    // formulario pero NO se confía: se busca con el filtro de visibilidad, así
    // que un proveedor de otro alcance simplemente no existe para esta consulta.
    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, ...proveedorVisibleWhere(localId, grupoId) },
      select: {
        id: true, nombre: true, parserListaId: true, activo: true,
        listaAumentoEsperadoMinPct: true, listaAumentoEsperadoMaxPct: true,
        listaRecargoPct: true, listaImpuestoAdicionalPct: true, listaImpuestosDefinidos: true,
        listaRecetaLectura: true, listaRecetaHuella: true,
      },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado en tu alcance." },
        { status: 404 }
      );
    }

    const reg = resolverParserDeProveedor(proveedor);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error, codigo: reg.codigo }, { status: 400 });
    }

    // ── 3.bis. QUÉ ARCHIVOS ACEPTA ESTE PROVEEDOR ───────────────────────
    //
    // La validación va DESPUÉS de resolver el parser y no antes, porque la
    // respuesta depende de cuál sea: el de Arcor lee un .xlsx y nada más, y el
    // genérico lee además PDF, .xls y .csv. Validar antes obligaría a aceptar la
    // unión de todas las extensiones y a rechazar el archivo recién al parsear,
    // con un mensaje mucho peor.
    const chequeo = validarArchivo({
      nombre: archivo.name,
      tamano: archivo.size,
      mime: archivo.type,
      extensionesPermitidas: reg.extensiones,
      mimesPermitidos: reg.generico ? LIMITES.mimesLista : LIMITES.mimes,
      queSeEsperaba: reg.generico ? "un PDF, una planilla o un CSV" : "una planilla",
    });
    if (!chequeo.ok) {
      return NextResponse.json(
        { ok: false, error: chequeo.error, codigo: chequeo.codigo },
        { status: 400 }
      );
    }

    // ── 4. Bytes y hash ──────────────────────────────────────────────────
    //
    // El hash se calcula ANTES de parsear: es la identidad del archivo y no
    // depende de que el contenido sea legible.
    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "El archivo está vacío.", codigo: ERROR_UPLOAD.ARCHIVO_VACIO },
        { status: 400 }
      );
    }
    const archivoHash = createHash("sha256").update(bytes).digest("hex");

    // ── 5. ¿Ya se subió este archivo? ────────────────────────────────────
    //
    // Chequeo previo para dar un mensaje claro. La garantía DURA es el índice
    // único (grupo, proveedor, hash): si dos pedidos entran a la vez, el segundo
    // choca contra la base y se resuelve más abajo. El nombre del archivo no se
    // usa como criterio: el mismo Excel se baja dos veces con nombres distintos.
    //
    // SOLO BLOQUEAN LAS IMPORTACIONES ABIERTAS.
    //
    // El índice único es PARCIAL: ocupan el archivo únicamente las que están en
    // borrador, conciliadas o parcialmente aplicadas. Una cancelada o una ya
    // terminada son historial, no un conflicto, y no impiden volver a importar
    // la misma lista del proveedor.
    //
    // La garantía real se conserva: sigue siendo imposible tener dos procesos
    // ABIERTOS del mismo archivo, que es el duplicado que hace daño. Antes el
    // bloqueo era para siempre y dejaba al proveedor sin poder mandar una lista
    // nueva nunca más.
    const previa = await prisma.importacionListaProveedor.findFirst({
      where: {
        grupoId, proveedorId, archivoHash,
        estado: { in: ["BORRADOR", "CONCILIADA", "PARCIALMENTE_APLICADA"] },
      },
      select: { id: true, createdAt: true, estado: true, archivoNombre: true },
    });
    if (previa) {
      return NextResponse.json(
        {
          ok: false,
          error: "Este archivo ya fue importado.",
          codigo: "IMPORTACION_DUPLICADA",
          importacionExistente: previa,
        },
        { status: 409 }
      );
    }

    // ── 6. Parsear ───────────────────────────────────────────────────────
    //
    // Dos caminos y una sola salida. El de Arcor lee su Excel con las columnas
    // que ese proveedor manda siempre; el genérico abre PDF, planilla o CSV y
    // averigua qué columna es cada cosa. Los dos entregan la misma lista de
    // productos, así que de acá para abajo el motor no sabe cuál corrió.
    //
    // `cellFormula` para poder distinguir una fórmula sin valor cacheado de una
    // celda vacía. No se ejecuta ninguna fórmula ni ninguna macro: `xlsx` no las
    // corre, y el .xlsm ni siquiera pasa la validación de extensión.
    let salidaParser;
    let generico = null;
    if (reg.generico) {
      generico = await leerArchivoGenerico({ bytes, nombre: archivo.name, proveedor, form });
      if (!generico.ok) return NextResponse.json(generico.cuerpo, { status: generico.status });
      salidaParser = generico.salidaParser;
    } else {
      try {
        const wb = XLSX.read(bytes, { type: "buffer", cellFormula: true });
        salidaParser = reg.parser(wb);
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: "No se pudo leer el archivo como planilla.", codigo: "PARSER_ERROR" },
          { status: 400 }
        );
      }
    }

    const erroresDeArchivo = (salidaParser.errores ?? []).filter((e) => e.filaExcel === undefined);
    if (erroresDeArchivo.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: erroresDeArchivo[0].mensaje ?? "El archivo no tiene el formato esperado.",
          codigo: erroresDeArchivo[0].codigo ?? "PARSER_ERROR",
          detalle: erroresDeArchivo,
        },
        { status: 400 }
      );
    }

    if ((salidaParser.productos ?? []).length === 0) {
      return NextResponse.json(
        { ok: false, error: "El archivo no tiene productos.", codigo: ERROR_UPLOAD.ARCHIVO_VACIO },
        { status: 400 }
      );
    }
    if (salidaParser.productos.length > LIMITES.filasMax) {
      return NextResponse.json(
        {
          ok: false,
          error: `El archivo supera el límite de ${LIMITES.filasMax} filas.`,
          codigo: ERROR_UPLOAD.DEMASIADAS_FILAS,
        },
        { status: 400 }
      );
    }

    // ── 7. El catálogo, en bloque ────────────────────────────────────────
    // `localId` va también: define qué productos se ven —un exclusivo de otro
    // local no puede sugerirse— y qué códigos de barras propios cuentan.
    const { codigosProveedor, productos, diagnostico, lecturasRecordadas } = await cargarDatosDeConciliacion({
      grupoId,
      proveedorId,
      localId,
    });
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);

    // ── 8. La configuración comercial, que ahora es del PROVEEDOR ────────
    //
    // El rango de aumento esperado, el recargo y el impuesto adicional salen de
    // la ficha del proveedor. El formulario puede pisarlos SOLO PARA ESTA LISTA:
    // guardar los valores en el proveedor es otra acción, en otra ruta, porque un
    // mes raro no puede reescribir el criterio de todos los meses sin que nadie
    // lo pida.
    //
    // Y SI FALTA ALGO, NO SE CONCILIA. Antes se caía a las constantes del código
    // —10 a 20 de rango, 5 de recargo— y el resultado se veía igual que uno
    // evaluado con el criterio de Emanuel. Con el rango de fábrica puesto, todas
    // las filas de una lista real caen fuera del rango: el default no era una
    // comodidad, era una respuesta inventada.
    // ── PARA QUÉ SE SUBIÓ ESTA LISTA ─────────────────────────────────────
    //
    // Se resuelve ANTES de la configuración porque cambia lo que la
    // configuración tiene que exigir: controlar no pide rango.
    //
    // Y acá es donde el 0 a 0 escrito a mano se convierte en un control, con su
    // aviso. Nadie espera que sus costos suban "entre 0 % y 0 %": quien escribe
    // eso está pidiendo que no se cambie nada. Tratarlo como una lista de
    // actualizar es lo que produjo las 213 filas diciendo "entre 0,0 % y 0,0 %".
    const { modo, aviso: avisoDeModo } = resolverModo({
      modoPedido: form.get("modo"),
      minPct: form.get("aumentoEsperadoMinPct"),
      maxPct: form.get("aumentoEsperadoMaxPct"),
    });
    // Si hubo aviso, el control salió de un 0 a 0 y no de elegirlo. Se guarda
    // como booleano acá porque abajo decide qué rango se asienta en la cabecera.
    const elCeroACero = avisoDeModo !== null;

    const resuelta = configuracionParaLaLista(proveedor, {
      minPct: form.get("aumentoEsperadoMinPct"),
      maxPct: form.get("aumentoEsperadoMaxPct"),
      recargoPct: form.get("recargoPct"),
      impuestoAdicionalPct: form.get("impuestoAdicionalPct"),
      impuestosDefinidos: leerBooleano(form.get("impuestosDefinidos")),
      modo,
    });
    if (!resuelta.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: resuelta.faltan.map((f) => TEXTO_FALTA_CONFIGURACION[f]).join(" "),
          codigo: "CONFIGURACION_INCOMPLETA",
          faltan: resuelta.faltan,
        },
        { status: 400 }
      );
    }

    const recargoPct = resuelta.config.recargoPct;
    const impuestoAdicionalPct = resuelta.config.impuestoAdicionalPct;
    // `umbralVariacionPct` deja de ser una constante del proveedor: es el techo
    // del rango. Un aumento por encima del máximo esperado ES la variación alta,
    // y tener dos números para el mismo hecho garantizaba que un día dijeran
    // cosas distintas. El 30 fijo de `CONFIG_ARCOR` se fue con esto.
    const umbralVariacionPct = resuelta.config.maxPct;
    const config = { ...reg.config, recargoPct, umbralVariacionPct, impuestoAdicionalPct };

    // La cabecera todavía no existe —se crea en el paso 9— así que al motor se le
    // pasa el rango con el que va a nacer, y ES EL MISMO OBJETO que se persiste
    // unas líneas más abajo. No hay forma de que la cabecera diga un criterio y el
    // motor haya usado otro.
    //
    // El rango se ASIENTA, no se deja implícito. Antes estas dos columnas nacían
    // nulas y todo caía al default del sistema: funcionaba, pero la importación no
    // guardaba con qué criterio se la evaluó, así que cambiar el default mañana
    // reescribiría en silencio el criterio de todas las viejas. Es la misma razón
    // por la que el rango se congela en la fila al confirmar.
    const cabecera = {
      // ── CONTROLANDO A PROPÓSITO, EL RANGO SE ASIENTA EN NULL ───────────
      //
      // No es un descuido: es que no hay ningún criterio de rango que asentar.
      // Dejar el del proveedor —que es lo que haría `configuracionParaLaLista`
      // por su cuenta, porque cae a la ficha cuando el formulario viene vacío—
      // guardaría un "se evaluó con 5 a 8" sobre una lista que no se evaluó con
      // ningún porcentaje.
      //
      // Y ADEMÁS ES LO QUE DISTINGUE LOS DOS CONTROLES. Un control elegido a
      // mano queda con el rango en null; uno que salió de un 0 a 0 escrito a
      // mano queda con 0 y 0, que es lo que la persona efectivamente escribió.
      // `fueUnCeroACeroConvertido` lee esos dos hechos y contesta cuál fue, sin
      // que haga falta una columna más.
      aumentoEsperadoMinPct: modo === MODO_LISTA.CONTROLAR && !elCeroACero ? null : resuelta.config.minPct,
      aumentoEsperadoMaxPct: modo === MODO_LISTA.CONTROLAR && !elCeroACero ? null : resuelta.config.maxPct,
      impuestoAdicionalPct,
      // EL MODO VIAJA CON EL RANGO Y POR EL MISMO MOTIVO: es de esta
      // importación, no del proveedor. Y como este objeto es EL MISMO que se
      // persiste y el que se le pasa al motor, no hay forma de que la cabecera
      // diga que es un control y el motor haya conciliado como si actualizara.
      modo,
    };

    // ── 8.bis. QUÉ COLUMNA DEL ARCHIVO ES EL PRECIO ──────────────────────
    //
    // Solo el camino genérico. Es una decisión DE LA LISTA y no de cada fila:
    // una fila sola no puede decir cuál de las seis columnas es el precio,
    // porque siempre hay una que le queda linda a su costo viejo. Lo que la
    // decide es que la misma columna le quede bien a las novecientas.
    //
    // Va acá y no en el paso 6 porque necesita las dos cosas que recién ahora
    // existen: el catálogo —para saber contra qué costo se compara cada fila— y
    // el rango esperado del proveedor, que es el criterio.
    let decisionDeLectura = null;
    let filasParaConciliar = salidaParser.productos;
    if (generico) {
      const rango = { minPct: resuelta.config.minPct, maxPct: resuelta.config.maxPct };
      const decision = decidirColumnaDeLaLista({
        filas: salidaParser.productos,
        productos,
        codigosProveedor,
        columnasDePrecio: generico.mapeo.precios,
        // EL MODO ENTRA ACÁ, y es la mitad del arreglo: sin él, `decidirLista`
        // puntúa cada columna por caída en rango, y con el rango en cero eso
        // exige que el precio dé el costo de hoy al centavo. Las dos columnas de
        // Arcor sacaron cero y el motor pidió elegir sin mostrar evidencia.
        config: { rango, recargoPct, impuestoAdicionalPct, pisoPrecioCreible: reg.config.pisoPrecioCreible, modo },
      });

      // A MANO GANA, pero se informa igual lo que el motor habría elegido: si
      // alguien eligió la columna equivocada, la única forma de darse cuenta es
      // ver que el sistema decía otra cosa.
      const eleccion = generico.eleccionManual ?? decision.eleccion;

      if (!eleccion) {
        return NextResponse.json(
          {
            ok: false,
            codigo: decision.motivoLista,
            error: decision.textoMotivoLista,
            // Con qué elegir a mano: cada columna candidata, cómo le fue, y sus
            // valores de ejemplo. Es la pantalla 3 abierta en "elegí el precio".
            opciones: decision.opciones.map((o) => ({
              columna: o.columna,
              titulo: generico.titulos[o.columna] ?? "",
              conDescuento: o.conDescuento,
              explicadas: o.explicadas,
              comparables: o.comparables,
            })),
            titulos: generico.titulos,
            mapeo: generico.mapeo,
            huella: generico.huella,
            ejemplos: generico.ejemplos,
          },
          { status: 409 }
        );
      }

      filasParaConciliar = aplicarEleccion({ filas: salidaParser.productos, eleccion });
      decisionDeLectura = {
        columna: eleccion.columna,
        titulo: generico.titulos[eleccion.columna] ?? "",
        conDescuento: eleccion.conDescuento === true,
        // ── "A MANO" ES HABER CORREGIDO AL MOTOR, NO HABERLE DICHO QUE SÍ ───
        //
        // La pantalla 3 manda siempre la columna, también cuando la persona
        // aprieta "Está bien, seguir" sobre la que el motor propuso. Mirando
        // solo `eleccionManual !== null`, aceptar quedaba registrado como elegir,
        // y el resultado decía "La elegiste vos" sobre una columna que la
        // persona nunca tocó. Es un dato de auditoría: si un costo sale mal, la
        // primera pregunta es quién eligió esa columna.
        aMano:
          generico.eleccionManual !== null &&
          (decision.eleccion === null ||
            decision.eleccion.columna !== eleccion.columna ||
            decision.eleccion.conDescuento !== eleccion.conDescuento),
        explicadas: decision.eleccion?.explicadas ?? null,
        comparables: decision.eleccion?.comparables ?? null,
        // Lo que el motor habría elegido solo, esté o no de acuerdo con lo que
        // se eligió a mano.
        delMotor: decision.eleccion
          ? { columna: decision.eleccion.columna, conDescuento: decision.eleccion.conDescuento }
          : null,
        opciones: decision.opciones.map((o) => ({
          columna: o.columna,
          titulo: generico.titulos[o.columna] ?? "",
          conDescuento: o.conDescuento,
          explicadas: o.explicadas,
          comparables: o.comparables,
        })),
        titulos: generico.titulos,
        mapeo: generico.mapeo,
        huella: generico.huella,
        formato: generico.formato,
        descartes: generico.descartes,
      };
    }

    const conciliacion = conciliarLista({
      filas: filasParaConciliar,
      productos,
      codigosProveedor,
      contexto: { grupoId, proveedorId, operandoEnLocalId: localId, depositoLocalId, cabecera, lecturasRecordadas },
      config,
    });

    const contadores = contadoresDeCabecera(conciliacion);
    const filas = filasAPersistir(conciliacion);

    // ── 9. Persistir, todo o nada ────────────────────────────────────────
    //
    // La cabecera y las filas van en la MISMA transacción: si falla un lote, no
    // queda una cabecera huérfana diciendo que hay 917 filas que no existen.
    const ahora = new Date();
    let importacion;
    try {
      importacion = await prisma.$transaction(async (tx) => {
        const cab = await tx.importacionListaProveedor.create({
          data: {
            grupoId,
            proveedorId,
            usuarioId: session.id,
            localOperativoId: localId,
            archivoNombre: String(archivo.name).slice(0, 255),
            archivoTamano: bytes.length,
            archivoHash,
            // Sin almacenamiento permanente todavía: ver la nota del schema.
            archivoUbicacion: null,
            parser: reg.id,
            parserVersion: reg.parserVersion,
            recargoPct,
            umbralVariacionPct,
            // El mismo objeto que se le pasó al motor. Ver la nota del paso 8.
            ...cabecera,
            modoPrecioVenta: MODO_PRECIO_VENTA.NO_TOCAR,
            estado: ESTADO_IMPORTACION.BORRADOR,
            // CON QUÉ COLUMNA SE LEYÓ ESTA LISTA, asentado con la importación.
            //
            // Es el mismo motivo por el que se asienta el rango: dentro de tres
            // meses, mirando una conciliación vieja, "el precio salió de la
            // columna FINAL, sin aplicar el descuento" es la única forma de
            // entender por qué los números son los que son. Y `decisionDeLectura`
            // guarda además lo que el motor habría elegido solo, así que una
            // elección a mano equivocada se puede encontrar después.
            columnaPrecioElegida: decisionDeLectura ? String(decisionDeLectura.titulo || decisionDeLectura.columna) : null,
            descuentoAplicado: decisionDeLectura ? decisionDeLectura.conDescuento : null,
            decisionDeLectura: decisionDeLectura ?? undefined,
            ...contadores,
          },
          select: { id: true },
        });

        for (const lote of enLotes(filas, 500)) {
          await tx.importacionListaFila.createMany({
            data: lote.map((f) => ({ ...f, importacionId: cab.id })),
          });
        }

        // Recién con todas las filas adentro la importación pasa a CONCILIADA.
        return tx.importacionListaProveedor.update({
          where: { id: cab.id },
          data: { estado: ESTADO_IMPORTACION.CONCILIADA, conciliadaEn: ahora },
        });
      }, OPCIONES_TX);
    } catch (e) {
      // La carrera contra el índice único: dos pedidos con el mismo archivo al
      // mismo tiempo. El que perdió devuelve el mismo 409 que el chequeo previo.
      //
      // SOLO SI EL CHOQUE ES ÉSE. Antes cualquier P2002 contestaba "este archivo
      // ya fue importado", y eso mandó una tarde entera a buscar una importación
      // duplicada que no existía: el choque real estaba en otra tabla y el
      // mensaje señalaba a la equivocada. Cuando no es el del archivo se relanza,
      // y lo atiende el catch de afuera, que sí lo registra.
      const choqueDelArchivo =
        e?.code === "P2002" &&
        String(JSON.stringify(e?.meta?.target ?? "")).toLowerCase().includes("hash");
      if (choqueDelArchivo) {
        const existente = await prisma.importacionListaProveedor.findFirst({
          where: { grupoId, proveedorId, archivoHash },
          select: { id: true, createdAt: true, estado: true, archivoNombre: true },
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Este archivo ya fue importado.",
            codigo: "IMPORTACION_DUPLICADA",
            importacionExistente: existente,
          },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({
      ok: true,
      importacionId: importacion.id,
      estado: importacion.estado,
      proveedor: { id: proveedor.id, nombre: proveedor.nombre },
      parser: { id: reg.id, version: reg.parserVersion },
      // PARA QUÉ SE LEYÓ, Y SI HUBO QUE CORREGIRLO. El aviso viaja porque un
      // cambio de comportamiento que no se anuncia es indistinguible de un
      // defecto: quien puso 0 a 0 tiene que enterarse de que se tomó como un
      // control, y no descubrirlo porque la pantalla siguiente dice otra cosa.
      modo,
      avisoDeModo,
      lectura: decisionDeLectura,
      archivo: { nombre: archivo.name, tamano: bytes.length, hash: archivoHash },
      resumen: {
        ...conciliacion.resumen,
        recargoPct,
        umbralVariacionPct,
        categoriasEnArchivo: (salidaParser.categorias ?? []).length,
        advertenciasParser: (salidaParser.advertencias ?? []).length,
        catalogo: diagnostico,
      },
      faltantes: conciliacion.faltantes.length,
    });
  } catch (error) {
    // EL MENSAJE DICE QUÉ PASÓ Y QUÉ HACER. "Error interno" fue lo único que se
    // vio el día que producción se cayó, y no le sirvió a nadie.
    console.error("Error importando lista de proveedor:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo terminar de importar la lista. No se guardó nada: probá de nuevo, y si sigue avisá con el nombre del archivo.",
      },
      { status: 500 }
    );
  }
}
