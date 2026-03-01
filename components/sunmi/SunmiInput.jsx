"use client";

export default function SunmiInput({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={`sunmi-input w-full disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    />
  );
}
