export default function SunmiCard({ children, className = "" }) {
  return (
    <div
      className={`
        bg-slate-950/70
        border border-slate-800
        rounded-xl
        shadow-md
        p-3           /* antes p-4 / p-6 */
        backdrop-blur-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}
