"use client";

import { Pencil, Trash2 } from "lucide-react";

export default function TablaAcciones({ onEditar, onEliminar }) {
  return (
    <div className="flex items-center gap-3">

      <button
        onClick={onEditar}
        className="
          p-2 bg-blue-100 text-blue-600 
          rounded-full hover:bg-blue-200 
          transition cursor-pointer
        "
      >
        <Pencil size={16} />
      </button>

      <button
        onClick={onEliminar}
        className="
          p-2 bg-red-100 text-red-600 
          rounded-full hover:bg-red-200 
          transition cursor-pointer
        "
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
