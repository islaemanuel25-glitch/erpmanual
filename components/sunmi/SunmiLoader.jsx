"use client";

export default function SunmiLoader({ size = 20 }) {
  return (
    <div className="flex justify-center py-2">    {/* antes py-4 */}
      <div
        className="
          animate-spin 
          rounded-full 
          border border-slate-700       /* antes border-2 */
          border-t-amber-400
        "
        style={{
          width: size,                  /* antes 28 by default */
          height: size,
        }}
      />
    </div>
  );
}
