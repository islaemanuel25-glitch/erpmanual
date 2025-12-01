"use client";

export default function SunmiList({
  children,
  className = "",
}) {
  return (
    <div
      className={`
        flex flex-col 
        divide-y divide-slate-800/80 
        ${className}
      `}
    >
      {children}
    </div>
  );
}
