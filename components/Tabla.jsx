"use client";

export default function Tabla({ columnas = [], datos = [], acciones }) {
  return (
    <div className="w-full h-full min-h-0 overflow-auto block">

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            {columnas.map((c) => (
              <th
                key={c.key}
                className="px-4 py-3 font-semibold text-gray-700 uppercase text-xs tracking-wide"
              >
                {c.titulo}
              </th>
            ))}

            {acciones ? (
              <th className="px-4 py-3 font-semibold text-gray-700 uppercase text-xs tracking-wide">
                Acciones
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {datos.length === 0 && (
            <tr>
              <td
                colSpan={columnas.length + (acciones ? 1 : 0)}
                className="px-4 py-6 text-center text-gray-500"
              >
                Sin registros
              </td>
            </tr>
          )}

          {datos.map((row) => (
            <tr
              key={row.id}
              className="border-b last:border-0 hover:bg-gray-50 transition"
            >
              {columnas.map((c) => (
                <td key={c.key} className="px-4 py-3 text-gray-800">
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}

              {acciones ? (
                <td className="px-4 py-3 text-right">
                  {acciones(row)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}
