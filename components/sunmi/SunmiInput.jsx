export default function SunmiInput({ className = "", ...props }) {
  const isDate = props.type === "date";

  return (
    <input
      {...props}
      autoComplete="new-password"
      autoCorrect="off"
      spellCheck={false}
      className={`
        px-3 py-2 w-full rounded-md
        bg-slate-900 text-slate-100
        placeholder-slate-500
        border border-slate-700
        text-[13px]
        appearance-none
        focus:border-amber-400
        focus:outline-none
        focus:ring-0
        ${isDate ? "cursor-pointer" : ""}
        ${className}
      `}
    />
  );
}
