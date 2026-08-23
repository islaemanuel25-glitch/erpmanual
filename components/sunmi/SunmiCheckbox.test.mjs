import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiCheckbox from "@/components/sunmi/SunmiCheckbox";

test("SunmiCheckbox usa estados y colores del kit", () => {
  const html = renderToStaticMarkup(
    createElement(SunmiCheckbox, {
      checked: true,
      ariaLabel: "Columna visible",
      onChange: () => {},
    })
  );

  assert.match(html, /type="checkbox"/);
  assert.match(html, /sunmi-badge-accent/);
  assert.match(html, /aria-label="Columna visible"/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(html, /rgba?\(/);
});

test("SunmiCheckbox muestra el estado bloqueado", () => {
  const html = renderToStaticMarkup(
    createElement(SunmiCheckbox, {
      checked: true,
      disabled: true,
      ariaLabel: "Columna fija",
    })
  );

  assert.match(html, /disabled=""/);
  assert.match(html, /opacity-50/);
});
