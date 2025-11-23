"use client";

export default function Input({
  label,
  value,
  onChange,
  name,
  type = "text",
  placeholder = "",
  required = false,
  error = "",
  className = "",
  disabled = false,
  size = "normal", // normal | chico | grande
}) {
  const tamaños = {
    normal: "px-3 py-2 text-sm",
    chico: "px-2 py-1.5 text-xs",
    grande: "px-4 py-3 text-base",
  };

  const handleChange = (e) => {
    let val = e.target.value;

    // ✅ Convertir a número si corresponde
    if (type === "number") {
      val = val === "" ? "" : Number(val);
    }

    // ✅ Devolver SIEMPRE un valor limpio
    onChange(val);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block mb-1 text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <input
        name={name}
        type={type}
        value={value ?? ""}        // ✅ Nunca undefined, nunca objetos
        onChange={handleChange}    // ✅ Sanitizado
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-xl border border-gray-300 bg-white text-gray-900 shadow-sm 
          focus:outline-none focus:ring-2 focus:ring-blue-500 
          disabled:opacity-50 disabled:cursor-not-allowed 
          ${tamaños[size]}`}
      />

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
