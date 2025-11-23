"use client";

export default function TablaLocales({ items, onQuitar }) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-gray-50 text-gray-500 rounded-md border p-4 text-center">
        No hay locales asignados al grupo.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="px-4 py-2 text-left">#ID</th>
            <th className="px-4 py-2 text-left">Nombre del Local</th>
            <th className="px-4 py-2 text-center w-32">Acción</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.local.id}
              className="border-t hover:bg-green-50 transition-colors"
            >
              <td className="px-4 py-2">{r.local.id}</td>
              <td className="px-4 py-2 font-medium text-gray-800">
                {r.local.nombre}
              </td>
              <td className="px-4 py-2 text-center">
                <button
                  onClick={() => onQuitar(r.local.id)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-md shadow-sm transition"
                >
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
