"use client";

export default function SunmiLoader({ size = 28 }) {
  return (
    <div className="flex justify-center py-4">
      <div
        className="animate-spin rounded-full border-2 border-slate-700 border-t-amber-400"
        style={{
          width: size,
          height: size,
        }}
      />
    </div>
  );
}
