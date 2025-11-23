"use client";

import { PencilSimple, TrashSimple } from "@phosphor-icons/react";

export default function Tabla({ columnas = [], datos = [], acciones }) {
  return (
    <div
      className="w-full overflow-x-auto rounded-2xl bg-white shadow"
      autoComplete="off"
    >
      <table
        className="min-w-full text-sm"
        autoComplete="off"
        inputMode="none"
      >
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

        <tbody autoComplete="off" inputMode="none">
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
              autoComplete="off"
            >
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-gray-800"
                  autoComplete="off"
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}

              {acciones ? (
                <td className="px-4 py-3 text-right" autoComplete="off">
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
