"use client";

export default function Modal({ open, onClose, titulo, children, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-[90%] max-w-md rounded-2xl bg-white p-5 shadow-xl">
        {titulo ? (
          <h3 className="mb-3 text-lg font-semibold text-gray-900">{titulo}</h3>
        ) : null}
        <div className="text-sm text-gray-700">{children}</div>
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
