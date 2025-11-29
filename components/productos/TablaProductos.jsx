"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function TablaProductos({
  rows,
  columns,
  page,
  totalPages,
  onNext,
  onPrev,
  onEditar,
  onEliminar,
  catalogos,
}) {
  // Diccionarios
  const CAT = Object.fromEntries(
    (catalogos?.CATEGORIAS ?? []).map((c) => [String(c.id), c.nombre])
  );
  const PROV = Object.fromEntries(
    (catalogos?.PROVEEDORES ?? []).map((p) => [String(p.id), p.nombre])
  );
  const AREA = Object.fromEntries(
    (catalogos?.AREAS ?? []).map((a) => [String(a.id), a.nombre])
  );

  const money = (value) => {
    if (value === null || value === undefined) return "-";
    const n = Number(value);
    if (isNaN(n)) return "-";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(n);
  };

  // Definiciones Sunmi V2 (camelCase)
  const DEFINICIONES = {
    imagenUrl: {
      titulo: "Imagen",
      render: (v, row) =>
        row.imagenUrl ? (
          <img
            src={row.imagenUrl}
            className="w-12 h-12 rounded-md object-cover border border-slate-700"
          />
        ) : (
          <div className="w-12 h-12 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500">
            -
          </div>
        ),
    },

    codigoBarra: { titulo: "Código" },
    sku: { titulo: "SKU" },
    nombre: { titulo: "Nombre" },

    categoriaId: {
      titulo: "Categoría",
      render: (v) =>
        v ? <SunmiPill color="cyan">{CAT[String(v)]}</SunmiPill> : "-",
    },

    proveedorId: {
      titulo: "Proveedor",
      render: (v) =>
        v ? <SunmiPill color="amber">{PROV[String(v)]}</SunmiPill> : "-",
    },

    areaFisicaId: {
      titulo: "Área",
      render: (v) =>
        v ? <SunmiPill color="slate">{AREA[String(v)]}</SunmiPill> : "-",
    },

    unidadMedida: {
      titulo: "Unidad",
      render: (v) => <SunmiPill color="cyan">{v}</SunmiPill>,
    },

    factorPack: { titulo: "Pack" },
    pesoKg: { titulo: "Peso (kg)" },
    volumenMl: { titulo: "Vol (ml)" },

    precioCosto: {
      titulo: "Costo",
      render: (v) => money(v),
    },

    margen: {
      titulo: "Margen %",
      render: (v) => (v !== null ? `${v}%` : "-"),
    },

    precioVenta: {
      titulo: "Venta",
      render: (v) => money(v),
    },

    ivaPorcentaje: {
      titulo: "IVA %",
      render: (v) => (v ? `${v}%` : "-"),
    },

    fechaVencimiento: {
      titulo: "Vencimiento",
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "-"),
    },

    esCombo: {
      titulo: "Combo",
      render: (v) =>
        v ? (
          <SunmiPill color="amber">Sí</SunmiPill>
        ) : (
          <SunmiPill color="slate">No</SunmiPill>
        ),
    },

    activo: {
      titulo: "Estado",
      render: (v) => <SunmiBadgeEstado value={v} />,
    },
  };

  const colsVisibles = columns
    .map((c) => {
      const def = DEFINICIONES[c.key];
      if (!def) return null;
      return {
        key: c.key,
        titulo: def.titulo,
        render: def.render,
      };
    })
    .filter(Boolean);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      <SunmiTable
        headers={[...colsVisibles.map((c) => c.titulo), "Acciones"]}
      >
        {rows.length === 0 ? (
          <SunmiTableEmpty label="Sin productos" />
        ) : (
          rows.map((row) => (
            <SunmiTableRow key={row.id}>
              {colsVisibles.map((c) => (
                <td key={c.key} className="px-3 py-2 text-[13px]">
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                </td>
              ))}

              {/* ACCIONES */}
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => onEditar(row.id)}
                    className="text-amber-300 hover:text-amber-200 text-[15px]"
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => onEliminar(row.id)}
                    className="text-red-400 hover:text-red-300 text-[15px]"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      {/* PAGINACIÓN */}
      <div className="flex justify-between p-3 border-t border-slate-800">
        <SunmiButton
          color="slate"
          disabled={page <= 1}
          onClick={onPrev}
        >
          « Anterior
        </SunmiButton>

        <SunmiButton
          color="slate"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Siguiente »
        </SunmiButton>
      </div>
    </div>
  );
}
