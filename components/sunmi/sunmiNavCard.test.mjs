// CANDADO: LA TARJETA DE NAVEGACIÓN, DIBUJADA DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiNavCard.test.mjs
//
// ── LO QUE MÁS SE CUIDA ────────────────────────────────────────────────────
//
// Que una tarjeta SIN destino no dibuje la flecha. No es estética: esta pantalla
// ya tuvo el defecto —una sección apagada con el chevron puesto, prometiendo una
// navegación que no existía— y lo que lo hizo posible fue que la decisión de
// envolver en un `Link` viviera en la página, separada de la decisión de dibujar
// la flecha. Acá las dos salen del mismo dato, y esto lo comprueba.
//
// Se ejecuta el JSX en vez de leerlo, por el motivo de siempre: un identificador
// sin importar compila, pasa el lint, pasa los candados y revienta en la pantalla.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiNavCard from "@/components/sunmi/SunmiNavCard";

const Icono = (props) => createElement("svg", { ...props, "data-icono": "" });

const dibujar = (props) =>
  renderToStaticMarkup(
    createElement(SunmiNavCard, {
      icon: Icono,
      label: "Cobros",
      descripcion: "Medios de pago, recargos, comisiones e integraciones",
      ...props,
    })
  );

test("con destino: navega y muestra la flecha", () => {
  const html = dibujar({ href: "/modulos/configuracion/pos-ventas/cobros" });
  assert.match(html, /<a[^>]+href="\/modulos\/configuracion\/pos-ventas\/cobros"/);
  assert.match(html, /<svg/, "falta el icono o la flecha");
  assert.ok(html.includes("Cobros"));
  assert.ok(html.includes("Medios de pago"));
});

test("SIN destino: no navega y NO dibuja la flecha", () => {
  const conFlecha = dibujar({ href: "/algun/lado" });
  const sinFlecha = dibujar({ href: null });

  assert.equal(sinFlecha.includes("<a "), false, "una tarjeta sin destino no puede ser un enlace");

  // Contar los <svg> es lo que distingue: con destino hay dos —icono y flecha—,
  // sin destino queda solo el icono. Comparar contra el caso bueno es lo que
  // evita que este candado pase por mirar el lugar equivocado.
  const svgsCon = (conFlecha.match(/<svg/g) || []).length;
  const svgsSin = (sinFlecha.match(/<svg/g) || []).length;
  assert.equal(svgsCon, 2, "con destino tienen que estar el icono y la flecha");
  assert.equal(svgsSin, 1, "sin destino tiene que quedar solo el icono");
});

test("el estado se muestra al lado, y solo si se lo pasan", () => {
  assert.match(dibujar({ href: null, estado: "Próximamente" }), /Próximamente/);
  assert.equal(dibujar({ href: "/x" }).includes("Próximamente"), false);
});

test("atenuado usa las clases del kit, no un color propio", () => {
  const apagada = dibujar({ href: null, atenuado: true, estado: "Próximamente" });
  const encendida = dibujar({ href: "/x" });

  assert.match(apagada, /opacity-60/);
  assert.match(apagada, /sunmi-badge-muted/);
  assert.equal(encendida.includes("opacity-60"), false);
  assert.match(encendida, /sunmi-badge-accent/);

  // Ninguna paleta paralela: ni un color literal ni una clase de color cruda.
  assert.doesNotMatch(apagada + encendida, /#[0-9a-fA-F]{3,8}\b/);
});

test("sin icono no se rompe: dibuja la tarjeta igual", () => {
  const html = dibujar({ icon: null, href: "/x" });
  assert.ok(html.includes("Cobros"));
});

// ══════════════════════════════════════════════════════════════════════════
// EL REDONDEL ADMITE UNA SIGLA, PORQUE NO TODO TIENE ICONO
// ══════════════════════════════════════════════════════════════════════════
//
// Cobros muestra las iniciales del medio: el nombre lo escribe cada local, así
// que no hay icono que le corresponda. Lo que NO puede pasar es que eso derive
// en una segunda tarjeta con su propia geometría.

test("una insignia se dibuja adentro del mismo redondel que el icono", () => {
  const html = dibujar({ icon: null, insignia: "MP", href: "/x" });
  assert.ok(html.includes("MP"));
  assert.match(html, /size-12[^"]*rounded-xl/, "el redondel tiene que ser el mismo");
});

test("la insignia gana sobre el icono, y entonces no se dibujan los dos", () => {
  const html = dibujar({ insignia: "EF", href: "/x" });
  assert.ok(html.includes("EF"));
  // Con destino hay dos <svg> —icono y flecha—; con insignia queda solo la
  // flecha, porque el icono lo reemplazó la sigla.
  assert.equal((html.match(/<svg/g) || []).length, 1);
});

test("la insignia respeta el estado atenuado igual que el icono", () => {
  const apagada = dibujar({ insignia: "CR", href: null, atenuado: true });
  assert.match(apagada, /sunmi-badge-muted/);
  assert.equal(apagada.includes("sunmi-badge-accent"), false);
});
