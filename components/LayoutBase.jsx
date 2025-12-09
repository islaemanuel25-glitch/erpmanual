"use client";

import LayoutController from "./layout/LayoutController";

export default function LayoutBase({ children }) {
  // LayoutBase delega completamente en LayoutController
  return <LayoutController>{children}</LayoutController>;
}
