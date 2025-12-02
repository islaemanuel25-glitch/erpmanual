"use client";

import LayoutController from "./layout/LayoutController";

export default function LayoutBase({ children }) {
  return <LayoutController>{children}</LayoutController>;
}
