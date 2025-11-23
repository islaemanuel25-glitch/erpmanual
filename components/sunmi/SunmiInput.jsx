export default function SunmiInput({ className = "", ...props }) {
  const isDate = props.type === "date";

  return (
    <input
      {...props}
      className={`
        px-2 py-1 w-full rounded 
        bg-slate-900/60 border border-slate-600 
        text-slate-100 text-sm 
        focus:ring-1 focus:ring-amber-400 
        ${isDate ? "cursor-pointer" : ""}
        ${className}
      `}
    />
  );
}
