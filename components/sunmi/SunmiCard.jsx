export default function SunmiCard({ children }) {
  return (
    <div
      className="
        sunmi-card 
        bg-slate-950/80
        border border-slate-800
        rounded-2xl 
        shadow-xl 
        p-4
        backdrop-blur-md
      "
    >
      {children}
    </div>
  );
}
