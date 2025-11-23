"use client";

export default function Select({
  label,
  value,
  onChange,
  name,
  required = false,
  options = [], // [{ value, label }]
  placeholder = "Seleccionar...",
  className = "",
  error = "",
  disabled = false,
  size = "normal", // normal | chico | grande
  multiple = false, // ✅ agregado
}) {
  const tamaños = {
    normal: "px-3 py-2 text-sm",
    chico: "px-2 py-1.5 text-xs",
    grande: "px-4 py-3 text-base",
  };

  const handleChange = (e) => {
    if (multiple) {
      // ✅ devolver array de valores
      const vals = Array.from(
        e.target.selectedOptions,
        (opt) => opt.value
      );
      onChange(vals);
    } else {
      // ✅ devolver valor simple
      onChange(e.target.value);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block mb-1 text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <select
        name={name}
        value={value}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        multiple={multiple}            // ✅ agregado
        className={`w-full rounded-xl border border-gray-300 bg-white text-gray-900 shadow-sm 
          focus:outline-none focus:ring-2 focus:ring-blue-500 
          disabled:opacity-50 disabled:cursor-not-allowed 
          ${tamaños[size]}`}
      >
        {!multiple && (
          <option value="">{placeholder}</option>
        )}

        {options.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
