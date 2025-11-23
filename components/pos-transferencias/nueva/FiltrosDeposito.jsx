// components/pos-transferencias/nueva/FiltrosDeposito.jsx
"use client";

export default function FiltrosDeposito({
  areaId,
  categoriaId,
  areasFisicas,
  categorias,
  onAreaChange,
  onCategoriaChange,
  onLimpiar,
}) {
  return (
    <div className="border rounded bg-white shadow-sm p-3">
      <h2 className="font-semibold text-[15px] mb-2">
        Filtros del depósito (ordenan sugeridos)
      </h2>

      <div className="flex flex-wrap gap-3 mb-3">
        {/* Área física */}
        <select
          className="h-[32px] border rounded px-2 text-sm"
          value={areaId}
          onChange={(e) => onAreaChange(Number(e.target.value))}
        >
          <option value={0}>Área física</option>
          {areasFisicas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>

        {/* Categoría */}
        <select
          className="h-[32px] border rounded px-2 text-sm"
          value={categoriaId}
          onChange={(e) => onCategoriaChange(Number(e.target.value))}
        >
          <option value={0}>Categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        {/* Limpiar */}
        <button
          className="h-[32px] px-3 bg-gray-100 rounded text-xs"
          onClick={onLimpiar}
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
