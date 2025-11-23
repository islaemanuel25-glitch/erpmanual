export default function Filtros({ children }) {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-2xl bg-white p-3 shadow md:flex-row md:items-end">
      {children}
    </div>
  );
}
