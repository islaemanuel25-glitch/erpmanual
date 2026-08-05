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
import XLSX from "xlsx";

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

/** Un porcentaje del formulario, o el default de la configuración. */
function porcentaje(valor, porDefecto) {
  if (valor === null || valor === undefined || valor === "") return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return porDefecto;
  return n;
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

    const chequeo = validarArchivo({
      nombre: archivo.name,
      tamano: archivo.size,
      mime: archivo.type,
    });
    if (!chequeo.ok) {
      return NextResponse.json(
        { ok: false, error: chequeo.error, codigo: chequeo.codigo },
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
      select: { id: true, nombre: true, parserListaId: true, activo: true },
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
    // EL BLOQUEO ES GLOBAL Y PARA SIEMPRE, INCLUSO SI LA ANTERIOR SE DESCARTÓ.
    //
    // El índice único no mira el estado, así que una importación DESCARTADA
    // sigue ocupando el hash: el mismo archivo no se puede volver a subir. Es
    // deliberado en esta versión y conviene saberlo, porque el flujo natural de
    // "me equivoqué, la descarto y la vuelvo a subir" NO funciona todavía.
    //
    // Se conserva así a propósito. Las alternativas —un índice parcial que
    // excluya DESCARTADA, o sumar el estado a la clave— cambian la garantía de
    // idempotencia contra carreras, que es lo que hoy impide que dos pedidos
    // simultáneos creen dos importaciones del mismo archivo. Rediseñar eso es
    // una decisión de otra etapa; agregar una excepción a medias sería peor que
    // el problema. Mientras tanto, la salida es reimportar desde un archivo
    // distinto o rehabilitar la importación existente.
    const previa = await prisma.importacionListaProveedor.findFirst({
      where: { grupoId, proveedorId, archivoHash },
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
    // `cellFormula` para poder distinguir una fórmula sin valor cacheado de una
    // celda vacía. No se ejecuta ninguna fórmula ni ninguna macro: `xlsx` no las
    // corre, y el .xlsm ni siquiera pasa la validación de extensión.
    let salidaParser;
    try {
      const wb = XLSX.read(bytes, { type: "buffer", cellFormula: true });
      salidaParser = reg.parser(wb);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "No se pudo leer el archivo como planilla.", codigo: "PARSER_ERROR" },
        { status: 400 }
      );
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
    const { codigosProveedor, productos, diagnostico } = await cargarDatosDeConciliacion({
      grupoId,
      proveedorId,
      localId,
    });
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);

    // ── 8. Conciliar, en memoria ─────────────────────────────────────────
    const recargoPct = porcentaje(form.get("recargoPct"), reg.config.recargoPct);
    const umbralVariacionPct = porcentaje(
      form.get("umbralVariacionPct"),
      reg.config.umbralVariacionPct
    );
    const config = { ...reg.config, recargoPct, umbralVariacionPct };

    const conciliacion = conciliarLista({
      filas: salidaParser.productos,
      productos,
      codigosProveedor,
      contexto: { grupoId, proveedorId, operandoEnLocalId: localId, depositoLocalId },
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
            modoPrecioVenta: MODO_PRECIO_VENTA.NO_TOCAR,
            estado: ESTADO_IMPORTACION.BORRADOR,
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
      if (e?.code === "P2002") {
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
    console.error("Error importando lista de proveedor:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
