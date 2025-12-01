"use client";

export default function SunmiRow({
  left,
  right,
  center = null,
  align = "center",
  className = "",
}) {
  const alignCls =
    align === "start"
      ? "items-start"
      : align === "end"
      ? "items-end"
      : "items-center";

  return (
    <div
      className={`
        flex ${alignCls} justify-between 
        gap-3 py-1
        ${className}
      `}
    >
      <div className="flex-1 min-w-0">
        {left}
      </div>

      {center && (
        <div className="flex-1 min-w-0 text-center">
          {center}
        </div>
      )}

      {right && (
        <div className="shrink-0 flex items-center gap-2">
          {right}
        </div>
      )}
    </div>
  );
}
