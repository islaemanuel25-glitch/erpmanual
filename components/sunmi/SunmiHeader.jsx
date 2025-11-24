export default function SunmiHeader({ title, color = "amber", children }) {
  const cls =
    color === "cyan"
      ? "bg-cyan-400 text-slate-900"
      : "bg-amber-400 text-slate-900";

  return (
    <div
      className={`
        ${cls}
        rounded-xl 
        px-4 py-2 
        text-[13px]
        font-bold
        tracking-wide
        uppercase
        shadow-md
        mb-2
      `}
    >
      {title}
      {children}
    </div>
  );
}
