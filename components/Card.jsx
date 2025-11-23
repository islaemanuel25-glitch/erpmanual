export default function Card({ titulo, children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow ${className}`}>
      {titulo ? <h3 className="mb-2 text-lg font-semibold">{titulo}</h3> : null}
      {children}
    </div>
  );
}
