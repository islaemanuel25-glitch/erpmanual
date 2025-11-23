"use client";

export default function TablaDepositos({ depositos, onQuitar }) {
  if (!depositos || depositos.length === 0) {
    return (
      <div className="bg-gray-50 text-gray-500 rounded-md border p-4 text-center">
        No hay depósitos asignados al grupo.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="px-4 py-2 text-left">#ID</th>
            <th className="px-4 py-2 text-left">Nombre del Depósito</th>
            <th className="px-4 py-2 text-center w-32">Acción</th>
          </tr>
        </thead>
        <tbody>
          {depositos.map((d) => (
            <tr
              key={d.localId}
              className="border-t hover:bg-blue-50 transition-colors"
            >
              <td className="px-4 py-2">{d.local.id}</td>
              <td className="px-4 py-2 font-medium text-gray-800">
                {d.local.nombre}
              </td>
              <td className="px-4 py-2 text-center">
                <button
                  onClick={() => onQuitar(d.localId)}
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
