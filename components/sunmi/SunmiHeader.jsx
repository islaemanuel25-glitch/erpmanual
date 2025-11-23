// components/sunmi/SunmiHeader.jsx
export default function SunmiHeader({ title, color = "amber", children }) {
  const cls =
    color === "cyan"
      ? "bg-cyan-600 text-white"
      : "bg-amber-500 text-slate-900";

  return (
    <div className={`
      ${cls}
      rounded-xl 
      px-4 py-3 
      text-lg font-semibold 
      mb-3
      shadow-md
      flex flex-col gap-1
    `}>
      {title}
      {children}
    </div>
  );
}
