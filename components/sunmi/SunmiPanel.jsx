"use client";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const padding = noPadding ? "" : "p-4";
  return (
    <div
      className={`
        bg-slate-900/70 
        border border-slate-800 
        rounded-2xl 
        ${padding} 
        ${className}
      `}
    >
      {children}
    </div>
  );
}
