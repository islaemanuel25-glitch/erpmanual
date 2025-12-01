"use client";

export default function SunmiListCard({ children, className = "" }) {
  return (
    <div className={`flex flex-col ${className}`}>
      {children}
    </div>
  );
}
