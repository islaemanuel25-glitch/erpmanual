export default function SunmiTable({ headers = [], children }) {
  return (
    <div className="sunmi-table-wrapper overflow-x-auto">
      <table className="sunmi-table w-full text-[13px]">
        
        {/* ===== HEADER ===== */}
        {headers.length > 0 && (
          <thead className="bg-amber-400 text-slate-900">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
        )}

        {/* ===== BODY ===== */}
        <tbody className="divide-y divide-slate-800">
          {children}
        </tbody>

      </table>
    </div>
  );
}
