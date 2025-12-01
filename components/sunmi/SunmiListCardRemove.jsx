
"use client";

import { X } from "lucide-react";

export default function SunmiListCardRemove({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="
        w-6 h-6
        flex items-center justify-center
        rounded-md
        hover:bg-slate-800/50
        transition
      "
    >
      <X size={14} />
    </button>
  );
}
