// components/sunmi/SunmiTable.jsx
export default function SunmiTable({ children, className = "" }) {
  return (
    <div className="sunmi-table-wrapper">
      <table
        className={`sunmi-table w-full text-[13px] ${className}`}
      >
        {children}
      </table>
    </div>
  );
}
