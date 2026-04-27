"use client";

export default function SunmiPageSizer({
  value = 25,
  onChange,
  options = [25, 50, 100],
  label = "Mostrar",
  className = "",
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="sunmi-text-muted text-[11px]">{label}</span>
      {options.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onChange(size)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
            value === size ? "sunmi-badge-accent" : "sunmi-control"
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}
