"use client";

export default function SunmiListItem({
  label,
  description,
  left = null,
  right = null,
  onClick,
  clickable = false,
  className = "",
}) {
  const base = `
    flex items-center justify-between 
    gap-3 py-2
  `;

  const clickableCls = clickable
    ? "cursor-pointer hover:bg-slate-900/70"
    : "";

  return (
    <div
      className={`${base} ${clickableCls} ${className}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-start gap-2 min-w-0">
        {left && <div className="mt-[2px]">{left}</div>}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] text-slate-100 truncate">
            {label}
          </span>
          {description && (
            <span className="text-[11px] text-slate-400 truncate">
              {description}
            </span>
          )}
        </div>
      </div>

      {right && (
        <div className="flex items-center gap-2 shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}
