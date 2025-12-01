export default function SunmiTableRow({ children, selected = false, onClick }) {
  return (
    <tr
      onClick={onClick}
      className={`
        text-[12px]
        ${onClick ? "cursor-pointer" : ""}
        ${selected ? "bg-slate-800" : "hover:bg-slate-800/40"}
      `}
    >
      {children}
    </tr>
  );
}
