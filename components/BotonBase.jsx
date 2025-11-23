"use client";

export default function BotonBase({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="
        px-6 py-2
        bg-blue-600 
        text-white 
        font-semibold
        rounded-full
        shadow-sm
        hover:bg-blue-700
        active:scale-95
        transition-all
        cursor-pointer
      "
    >
      {children}
    </button>
  );
}
