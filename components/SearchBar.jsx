"use client";

export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="
        w-full px-4
        h-[42px]
        border border-gray-300 rounded-lg
        text-gray-700 
        bg-white
        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
        transition
      "
    />
  );
}
