// components/pos-transferencias/nueva/ResumenPreparados.jsx
"use client";

export default function ResumenPreparados({ total }) {
  return (
    <div className="border rounded p-3 bg-white shadow-sm text-sm flex justify-between">
      <span>
        Productos preparados: <strong>{total}</strong>
      </span>

      <span className="text-gray-500">
        (Se envían solo los productos preparados)
      </span>
    </div>
  );
}
