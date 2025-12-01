export default function SunmiSeparator({ label, className = "" }) {
  return (
    <div
      className={`
        flex items-center gap-2
        text-[12px] text-slate-400
        my-2          /* antes my-4 o my-6 */
        ${className}
      `}
    >
      <div className="flex-1 h-px bg-slate-700/60" />
      {label && <span className="whitespace-nowrap">{label}</span>}
      <div className="flex-1 h-px bg-slate-700/60" />
    </div>
  );
}
