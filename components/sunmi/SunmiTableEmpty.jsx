"use client";

export default function SunmiTableEmpty({ message = "Sin datos disponibles" }) {
  return (
    <tr>
      <td
        colSpan={50}
        className="
          text-center 
          py-3                 /* antes py-6 */
          text-slate-500 
          text-[12px]          /* ahora igual que la tabla */
          italic
        "
      >
        {message}
      </td>
    </tr>
  );
}
