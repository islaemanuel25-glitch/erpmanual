export default function SunmiButton({ color = "cyan", children, ...props }) {
  const base = `
    h-[36px]              /* ⬅ Altura compacta */
    px-4
    rounded-md
    text-[13px]
    font-medium
    transition-all
  `;

  const styles = {
    amber: `${base} bg-amber-400 text-slate-900 hover:bg-amber-300`,
    red:   `${base} bg-red-500 text-white hover:bg-red-400`,
    cyan:  `${base} bg-cyan-500 text-slate-900 hover:bg-cyan-400`,
  };

  return (
    <button {...props} className={styles[color] || styles.cyan}>
      {children}
    </button>
  );
}
