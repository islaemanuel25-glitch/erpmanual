export default function SunmiInput({ className = "", ...props }) {

  return (
    <input
      {...props}
      className={`
        px-2 py-1.5          /* reducido */
        w-full rounded-md
        bg-slate-900 text-slate-100
        placeholder-slate-500
        border border-slate-700
        text-[13px]
        focus:border-amber-400
        outline-none
        ${className}
      `}
    />
  );
}
