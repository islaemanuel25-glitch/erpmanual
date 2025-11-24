"use client";

export default function SunmiTableEmpty({ message = "Sin datos disponibles" }) {
  return (
    <tr>
      <td
        colSpan={50}
        className="text-center py-6 text-slate-500 text-[13px] italic"
      >
        {message}
      </td>
    </tr>
  );
}
