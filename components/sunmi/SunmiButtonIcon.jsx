"use client";

export default function SunmiButtonIcon({
  color = "amber",
  children,
  className = "",
  ...props
}) {
  const base = `
    p-1
    rounded-md
    flex items-center justify-center
    transition
    text-[13px]
  `;

  const styles = {
    amber: `${base} bg-slate-800 text-amber-400 hover:bg-slate-700`,
    red:   `${base} bg-slate-800 text-red-400 hover:bg-slate-700`,
    slate: `${base} bg-slate-800 text-slate-300 hover:bg-slate-700`,
  };

  return (
    <button
      {...props}
      className={`${styles[color] || styles.amber} ${className}`}
    >
      {children}
    </button>
  );
}
