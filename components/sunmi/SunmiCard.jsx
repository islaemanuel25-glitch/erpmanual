// components/sunmi/SunmiCard.jsx
export default function SunmiCard({ children }) {
  return (
    <div className="
      sunmi-card 
      bg-slate-900/70 
      border border-slate-700 
      rounded-2xl 
      shadow-xl 
      p-3 sm:p-5
    ">
      {children}
    </div>
  );
}
