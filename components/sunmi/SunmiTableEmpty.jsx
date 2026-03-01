"use client";

export default function SunmiTableEmpty({
  message = "Sin datos disponibles",
  colSpan = 50,
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-center py-3 sunmi-text-muted text-[12px] italic"
      >
        {message}
      </td>
    </tr>
  );
}
