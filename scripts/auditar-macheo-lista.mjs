// scripts/auditar-macheo-lista.mjs
//
// AUDITORÍA DE SOLO LECTURA del macheo de una importación.
//
// Responde una pregunta concreta: de los productos que se le compran a este
// proveedor y que tienen un código interno activo suyo, ¿cuáles NO quedaron
// vinculados a ninguna fila del archivo, y por qué exactamente?
//
// El "por qué" no se reconstruye a mano: se reejecuta EL MISMO motor que usa la
// conciliación, y se mira a qué resolvió cada fila. Una explicación derivada por
// separado se desincronizaría del comportamiento real en la primera regla que
// cambie, y entonces el informe diría una cosa y el sistema haría otra.
//
// NO ESCRIBE NADA. Ni una sola llamada de escritura, ni transacciones.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/auditar-macheo-lista.mjs --id 1

import { PrismaClient } from "@prisma/client";

import { cargarDatosDeConciliacion } from "../lib/proveedores/listas/cargaErp.js";
import {
  TIPO_COINCIDENCIA,
  indexarCodigosProveedor,
  macheePorCodigo,
} from "../lib/proveedores/listas/conciliarLista.js";
import {
  clavesDeCodigo,
  esCodigoNumerico,
  sufijoNumerico,
  LONGITUDES_SUFIJO,
} from "../lib/proveedores/listas/normalizarCodigo.js";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const ID = Number(args[args.indexOf("--id") + 1]);
if (!Number.isInteger(ID) || ID <= 0) {
  console.error("Falta --id <importacionId>");
  process.exit(1);
}

/** Línea legible por máquina, para poder volcarla a un archivo sin ambigüedad. */
const campos = (...xs) => xs.map((x) => (x === null || x === undefined ? "" : String(x))).join("|");

async function main() {
  const cab = await prisma.importacionListaProveedor.findUnique({
    where: { id: ID },
    include: { proveedor: { select: { id: true, nombre: true } } },
  });
  if (!cab) {
    console.error(`No existe la importación ${ID}.`);
    process.exit(1);
  }

  const proveedorId = cab.proveedorId;

  // ── Datos, exactamente los que ve la conciliación ────────────────────────
  const datos = await cargarDatosDeConciliacion(
    { grupoId: cab.grupoId, proveedorId, localId: cab.localOperativoId },
    prisma
  );

  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID },
    orderBy: { filaExcel: "asc" },
    select: {
      id: true, filaExcel: true, codigoCrudo: true, codigoNormalizado: true,
      codigoComparableSinCeros: true, descripcionProveedor: true,
      unidadProveedor: true, precioConIva: true,
      productoBaseId: true, tipoCoincidencia: true, estado: true,
    },
  });

  // ── El motor, otra vez, para saber a qué resolvió cada fila ──────────────
  const indice = indexarCodigosProveedor(datos.codigosProveedor);
  const resolucion = new Map(); // filaId → { tipo, productoBaseId, candidatos }
  const macheadosPorProducto = new Map(); // productoBaseId → [filas]

  for (const f of filas) {
    const r = macheePorCodigo(indice, f);
    const productoBaseId =
      r.tipo !== TIPO_COINCIDENCIA.AMBIGUA && r.tipo !== TIPO_COINCIDENCIA.NINGUNA
        ? r.candidatos[0]?.productoBaseId ?? null
        : null;
    resolucion.set(f.id, {
      tipo: r.tipo,
      productoBaseId,
      candidatos: (r.candidatos ?? []).map((c) => c.productoBaseId),
      sufijoDigitos: r.sufijoDigitos ?? null,
    });
    if (productoBaseId !== null) {
      if (!macheadosPorProducto.has(productoBaseId)) macheadosPorProducto.set(productoBaseId, []);
      macheadosPorProducto.get(productoBaseId).push(f);
    }
  }

  // ── Índices del Excel para poder buscar candidatas ───────────────────────
  const filasPorCodigo = new Map();
  const filasPorSufijo = new Map(LONGITUDES_SUFIJO.map((n) => [n, new Map()]));
  for (const f of filas) {
    const { normalizado } = clavesDeCodigo(f.codigoNormalizado ?? f.codigoCrudo);
    if (!normalizado) continue;
    if (!filasPorCodigo.has(normalizado)) filasPorCodigo.set(normalizado, []);
    filasPorCodigo.get(normalizado).push(f);
    if (!esCodigoNumerico(normalizado)) continue;
    for (const n of LONGITUDES_SUFIJO) {
      const suf = sufijoNumerico(normalizado, n);
      if (!suf) continue;
      const m = filasPorSufijo.get(n);
      if (!m.has(suf)) m.set(suf, []);
      m.get(suf).push(f);
    }
  }

  // ── Los vínculos activos, por producto ───────────────────────────────────
  const vinculosActivos = await prisma.productoCodigoProveedor.findMany({
    where: { grupoId: cab.grupoId, proveedorId, activo: true },
    select: { id: true, productoBaseId: true, codigoInterno: true, activo: true },
  });
  const codigosPorProducto = new Map();
  for (const v of vinculosActivos) {
    if (!codigosPorProducto.has(v.productoBaseId)) codigosPorProducto.set(v.productoBaseId, []);
    codigosPorProducto.get(v.productoBaseId).push(v);
  }

  // ── El universo, con su relación de proveedor ────────────────────────────
  const universo = await prisma.productoBase.findMany({
    where: {
      grupoId: cab.grupoId,
      OR: [
        { proveedor_id: proveedorId },
        { proveedor2_id: proveedorId },
        { proveedor3_id: proveedorId },
      ],
    },
    select: {
      id: true, nombre: true, activo: true,
      proveedor_id: true, proveedor2_id: true, proveedor3_id: true,
    },
    orderBy: { id: "asc" },
  });

  const relacionDe = (p) =>
    p.proveedor_id === proveedorId ? 1 : p.proveedor2_id === proveedorId ? 2 : 3;

  // ── Clasificación ────────────────────────────────────────────────────────
  const conCodigoMacheados = [];
  const conCodigoNoMacheados = [];
  const sinCodigoActivo = [];

  for (const p of universo) {
    const codigos = codigosPorProducto.get(p.id) ?? [];
    if (codigos.length === 0) {
      sinCodigoActivo.push(p);
      continue;
    }
    if (macheadosPorProducto.has(p.id)) conCodigoMacheados.push({ p, codigos });
    else conCodigoNoMacheados.push({ p, codigos });
  }

  // ── El diagnóstico de cada no macheado ───────────────────────────────────
  const detalle = conCodigoNoMacheados.map(({ p, codigos }) => {
    // Un producto puede tener más de un código; se audita cada uno y se toma el
    // diagnóstico más informativo.
    const porCodigo = codigos.map((v) => {
      const { normalizado } = clavesDeCodigo(v.codigoInterno);
      const numerico = esCodigoNumerico(normalizado);

      const exactas = filasPorCodigo.get(normalizado) ?? [];
      const sufijos = {};
      let primeraLongitudConCandidatas = null;
      if (numerico) {
        for (const n of LONGITUDES_SUFIJO) {
          const suf = sufijoNumerico(normalizado, n);
          if (!suf) continue;
          const encontradas = filasPorSufijo.get(n).get(suf) ?? [];
          sufijos[n] = encontradas;
          if (encontradas.length > 0 && primeraLongitudConCandidatas === null) {
            primeraLongitudConCandidatas = n;
          }
        }
      }

      const candidatas = [
        ...exactas,
        ...(primeraLongitudConCandidatas ? sufijos[primeraLongitudConCandidatas] : []),
      ];
      const unicas = [...new Map(candidatas.map((f) => [f.id, f])).values()];

      // ¿Alguna de las candidatas quedó ambigua?
      const ambigua = unicas.some((f) => resolucion.get(f.id)?.tipo === TIPO_COINCIDENCIA.AMBIGUA);

      let motivo;
      if (unicas.length === 0) {
        motivo = numerico
          ? "El código no aparece en el archivo, ni exacto ni por sufijo de 8 a 4."
          : normalizado
            ? "El código es alfanumérico: solo machea exacto, y no está en el archivo."
            : "El vínculo no tiene un código utilizable.";
      } else if (ambigua) {
        motivo = "La fila que lo alcanzaba quedó AMBIGUA: comparte terminación con otro producto y no se elige ninguno.";
      } else {
        // Las candidatas existen pero resolvieron a otro producto.
        const destinos = [...new Set(unicas.map((f) => resolucion.get(f.id)?.productoBaseId).filter((x) => x !== null))];
        motivo = destinos.length
          ? `La fila que lo alcanzaba macheó con otro producto por un criterio más fuerte (producto ${destinos.join(", ")}).`
          : "Hay filas con terminación parecida, pero ninguna resolvió a este producto.";
      }

      return {
        codigoInterno: v.codigoInterno,
        normalizado,
        numerico,
        exactoEnExcel: exactas.length > 0,
        sufijos: Object.fromEntries(
          Object.entries(sufijos).map(([n, fs]) => [n, fs.length])
        ),
        longitudUsada: primeraLongitudConCandidatas,
        ambigua,
        motivo,
        candidatas: unicas.slice(0, 4).map((f) => ({
          filaExcel: f.filaExcel,
          codigo: f.codigoCrudo,
          descripcion: f.descripcionProveedor,
          resolvioA: resolucion.get(f.id)?.productoBaseId ?? null,
          tipo: resolucion.get(f.id)?.tipo ?? null,
        })),
      };
    });

    return { p, relacion: relacionDe(p), porCodigo };
  });

  // ── Salida ───────────────────────────────────────────────────────────────
  const sinCandidatas = detalle.filter((d) => d.porCodigo.every((c) => c.candidatas.length === 0));

  console.log("### RESUMEN");
  console.log(campos("proveedor", cab.proveedor.nombre));
  console.log(campos("archivo", cab.archivoNombre));
  console.log(campos("filas_excel", filas.length));
  console.log(campos("universo_productos_arcor", universo.length));
  console.log(campos("con_codigo_activo", conCodigoMacheados.length + conCodigoNoMacheados.length));
  console.log(campos("con_codigo_macheados", conCodigoMacheados.length));
  console.log(campos("con_codigo_no_macheados", conCodigoNoMacheados.length));
  console.log(campos("sin_codigo_activo", sinCodigoActivo.length));
  console.log(campos("no_aparecen_en_excel", sinCandidatas.length));
  console.log(campos("vinculos_activos", vinculosActivos.length));

  console.log("### MACHEADOS");
  for (const { p, codigos } of conCodigoMacheados) {
    const fs = macheadosPorProducto.get(p.id) ?? [];
    for (const f of fs) {
      const r = resolucion.get(f.id);
      console.log(campos(
        "M", p.id, p.nombre, codigos.map((c) => c.codigoInterno).join(" / "),
        relacionDe(p), p.activo ? "SI" : "NO",
        r.tipo, r.sufijoDigitos ?? "", f.filaExcel, f.codigoCrudo, f.descripcionProveedor
      ));
    }
  }

  console.log("### NO_MACHEADOS");
  for (const d of detalle) {
    for (const c of d.porCodigo) {
      const sufTxt = LONGITUDES_SUFIJO.map((n) => `${n}:${c.sufijos[n] ?? "-"}`).join(" ");
      console.log(campos(
        "N", d.p.id, d.p.nombre, c.codigoInterno, d.relacion, d.p.activo ? "SI" : "NO",
        c.exactoEnExcel ? "SI" : "NO", sufTxt, c.longitudUsada ?? "",
        c.ambigua ? "SI" : "NO", c.motivo,
        c.candidatas.map((x) => `fila ${x.filaExcel} cod ${x.codigo} → ${x.resolvioA ?? x.tipo}`).join(" ; ")
      ));
    }
  }

  console.log("### SIN_CODIGO_ACTIVO");
  for (const p of sinCodigoActivo) {
    console.log(campos("S", p.id, p.nombre, "", relacionDe(p), p.activo ? "SI" : "NO"));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
