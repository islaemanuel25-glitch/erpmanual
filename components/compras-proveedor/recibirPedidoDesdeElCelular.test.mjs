// LA PANTALLA "RECIBIR PEDIDO" EN EL CELULAR: BORRAR UNA FACTURA, ANULAR UN
// PEDIDO QUE NO VA A LLEGAR, Y CONTAR PRODUCTOS DEL PAPEL Y NO RENGLONES.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/recibirPedidoDesdeElCelular.test.mjs
//
// Los tres los vio Emanuel en producción en su celular (e1fd632e, 2026-10-22):
//
//   1. La tarjeta "Factura 1 · 1 hoja · 17 productos ✓ cierra" no ofrecía
//      borrar. El borrado existía, pero un toque más adentro: con el rediseño
//      de la fila (18a4e401) se mudó a la hoja de detalle, y nada en la tarjeta
//      dice que se puede tocar.
//   2. Golosimax #261 y Secco #256 esperaban con cero productos y sin factura,
//      y anular solo se ofrecía antes de enviar.
//   3. "17 productos" en la factura y "4 de 4 llegaron" en el pedido: la
//      tarjeta contaba envases y cargos, y un pedido nacido de la factura se
//      comparaba contra sí mismo.
//
// Los candados que miran código sacan los comentarios antes de mirar (regla 5
// de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ConfirmarConNumeros from "./ConfirmarConNumeros.jsx";
import { sePuedeAnular, textoDeAnular } from "../../lib/compras-proveedor/anularPedido.js";
import { productosDelPapel } from "../../lib/compras-proveedor/comprobante/cobertura.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const textoDe = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const codigoDe = (rel) =>
  textoDe(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PANEL = "components/comprobantes/PanelComprobantes.jsx";
const RECEPCION = "app/modulos/compras-proveedor/[id]/page.jsx";
const ANULAR = "app/api/compras-proveedor/anular/[id]/route.js";
const LISTAR = "app/api/compras-proveedor/comprobantes/listar/route.js";

// ══════════════════════════════════════════════════════════════════════════
// 1. BORRAR UNA FACTURA DESDE LA TARJETA DEL CELULAR
// ══════════════════════════════════════════════════════════════════════════

test("1 · LA TARJETA DEL CELULAR OFRECE BORRAR, AL LADO Y NO ADENTRO", () => {
  const c = codigoDe(PANEL);
  // La lista del celular, desde su contenedor hasta la cobertura.
  const inicio = c.indexOf('<div className="md:hidden flex flex-col gap-1">');
  const fin = c.indexOf("cobertura?.nacidoDeFactura", inicio);
  assert.ok(inicio > 0 && fin > inicio, "no se encontró la lista del celular; revisá este candado");
  const lista = c.slice(inicio, fin);
  // El botón está, con la misma regla que la tabla de escritorio y la hoja.
  assert.match(
    lista,
    /\{puedeRecibir && sePuedeBorrar\(c\)\.ok && \(\s*<SunmiButton\s+color="red"[\s\S]*?onClick=\{\(\) => setBorrando\(c\)\}[\s\S]*?Borrar\s*<\/SunmiButton>/,
    "la tarjeta del celular no ofrece borrar"
  );
  // Al LADO de la tarjeta: un botón dentro de otro no es HTML válido, y el
  // toque iría a los dos.
  const tarjeta = lista.slice(lista.indexOf("<SunmiActionCard"), lista.indexOf("</SunmiActionCard>"));
  assert.ok(!/setBorrando/.test(tarjeta), "el borrado quedó adentro de la tarjeta que abre el detalle");
  // Y la hoja de detalle lo sigue teniendo.
  assert.match(c, /Borrar esta factura/);
});

test("1 · LA CONFIRMACIÓN ES LA QUE YA EXISTÍA: con números, ámbar aparte, y el rojo debajo del que cancela", () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmarConNumeros, {
      titulo: "¿Borrar este comprobante?",
      texto: "Vas a borrar el comprobante A 0011-00794708. Se van sus 17 productos leídos y su foto. No se puede deshacer.",
      aviso: "3 productos ya están vinculados al pedido.",
      textoNo: "No, dejarlo",
      textoSi: "Sí, borrarlo",
      textoHaciendo: "Borrando…",
      onNo: () => {},
      onSi: () => {},
    })
  );
  assert.ok(html.indexOf("No, dejarlo") < html.indexOf("Sí, borrarlo"), "el rojo quedó arriba del que cancela");
  assert.match(html, /sunmi-text-warning[^>]*>3 productos ya están vinculados/);
  // El panel la usa con su ruta de siempre: no hay otra.
  const c = codigoDe(PANEL);
  assert.match(c, /<ConfirmarConNumeros\s+titulo="¿Borrar este comprobante\?"/);
  assert.match(c, /fetch\(`\/api\/compras-proveedor\/comprobantes\/borrar\/\$\{c\.id\}`/);
  assert.ok(!/<SunmiModalLayout[^>]*title="¿Borrar este comprobante\?"/.test(c), "quedó una copia del modal");
});

// ══════════════════════════════════════════════════════════════════════════
// 2. ANULAR UN PEDIDO QUE NO VA A LLEGAR
// ══════════════════════════════════════════════════════════════════════════

test("2 · SE ANULA DESDE CUALQUIER ESTADO MENOS RECIBIDO Y ANULADO: la regla que ya tenía la ruta", () => {
  for (const e of ["BORRADOR", "CONFIRMADO", "ENVIADO"]) assert.equal(sePuedeAnular(e), true, e);
  for (const e of ["RECIBIDO", "ANULADO"]) assert.equal(sePuedeAnular(e), false, e);
  assert.match(codigoDe(ANULAR), /if \(!sePuedeAnular\(pedido\.estado\)\)/);
  assert.match(codigoDe(ANULAR), /checkPerm\(session, "compras\.crear"\)/);
});

test("2 · LA CONFIRMACIÓN DICE CON NÚMEROS QUÉ SE LLEVA: Golosimax #261, cero productos y sin factura", () => {
  const d = textoDeAnular({ pedidoId: 261, proveedor: "Golosimax", productos: 0, facturas: 0 });
  assert.match(d.texto, /Vas a anular el pedido #261 de Golosimax\./);
  // Cero es un dato: se dice, no se calla.
  assert.match(d.texto, /No tiene ningún producto\./);
  assert.match(d.texto, /No se borra nada: queda anulado y sale de Recibir mercadería\./);
  assert.equal(d.aviso, null, "sin facturas no hay nada que avisar en ámbar");
});

test("2 · CON FACTURAS SUBIDAS, EL AVISO APARTE LAS CUENTA", () => {
  const una = textoDeAnular({ pedidoId: 259, productos: 4, facturas: 1 });
  assert.match(una.texto, /Tiene 4 productos\./);
  assert.match(una.aviso, /^Tiene 1 factura subida: se anula con el pedido\./);
  assert.match(una.aviso, /subirla de nuevo/);
  const dos = textoDeAnular({ pedidoId: 259, productos: 1, facturas: 2 });
  assert.match(dos.texto, /Tiene 1 producto\./);
  assert.match(dos.aviso, /^Tiene 2 facturas subidas: se anulan con el pedido\./);
});

test("2 · LA RUTA ANULA EL PEDIDO Y SUS FACTURAS EN LA MISMA TRANSACCIÓN, Y NO BORRA NADA", () => {
  const r = codigoDe(ANULAR);
  assert.match(
    r,
    /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*tx\.pedidoProveedor\.update\([\s\S]*estado: "ANULADO"[\s\S]*tx\.comprobanteProveedor\.updateMany\(\{\s*where: \{ pedidoId, grupoId, estado: \{ not: "ANULADO" \} \},\s*data: \{ estado: "ANULADO" \}/
  );
  assert.ok(!/\.delete(Many)?\(/.test(r), "anular borró algo de la base");
  assert.ok(!/"Error interno"/.test(r), "el error volvió a ser mudo");
});

test("2 · EL BOTÓN VA AL PIE DE LA RECEPCIÓN, CON PERMISO, Y USA LA RUTA DE SIEMPRE", () => {
  const p = codigoDe(RECEPCION);
  // Afuera de la lista —los pedidos sin productos no la tienen— y colgado de
  // la recepción, con el permiso que pide la ruta.
  assert.match(
    p,
    /\{esRecepcion && puedeAnularP && sePuedeAnular\(pedido\.estado\) && \([\s\S]{0,200}?<SunmiButton\s+color="red"[\s\S]*?Anular pedido/
  );
  assert.match(p, /const puedeAnularP = esAdminP \|\| permisosP\.includes\("compras\.crear"\)/);
  const boton = p.indexOf("Anular pedido\n");
  const lista = p.lastIndexOf("<ListaDeLaFactura");
  assert.ok(boton > lista, "el botón de anular quedó arriba de la lista");
  // La confirmación es la misma pieza que la del borrado.
  assert.match(p, /<ConfirmarConNumeros\s+titulo="¿Anular este pedido\?"/);
  // Por `ejecutarAccion("anular")`, la ruta que ya existía: no hay una nueva.
  assert.match(p, /const data = await ejecutarAccion\("anular"\);/);
  assert.match(p, /url = `\/api\/compras-proveedor\/anular\/\$\{id\}`/);
  // Y si salió, de vuelta a la lista, de donde el pedido ya no aparece.
  assert.match(p, /router\.push\("\/modulos\/compras-proveedor\/recepcion"\)/);
  // Sin el `confirm()` del navegador en este camino.
  const handler = p.slice(p.indexOf("async function anularDesdeLaRecepcion"), p.indexOf("const buscarExtra"));
  assert.ok(!/confirm\(/.test(handler));
});

test("2 · RECIBIR MERCADERÍA SOLO LISTA LOS ENVIADOS: el anulado sale solo", () => {
  assert.match(codigoDe("app/modulos/compras-proveedor/recepcion/page.jsx"), /estado: "ENVIADO"/);
});

// ══════════════════════════════════════════════════════════════════════════
// 3. PRODUCTOS DEL PAPEL, NO RENGLONES
// ══════════════════════════════════════════════════════════════════════════

test("3 · ENVASES Y CARGOS NO SON PRODUCTOS; UN RENGLÓN SIN TIPO SÍ", () => {
  const r = productosDelPapel([
    { comprobanteId: 7, tipoRenglon: "MERCADERIA", productoLocalId: 11 },
    { comprobanteId: 7, tipoRenglon: "MERCADERIA", productoLocalId: null },
    { comprobanteId: 7, tipoRenglon: null, productoLocalId: 12 },
    { comprobanteId: 7, tipoRenglon: "ENVASE", productoLocalId: null },
    { comprobanteId: 7, tipoRenglon: "CARGO", productoLocalId: null },
    { comprobanteId: 8, tipoRenglon: "MERCADERIA", productoLocalId: 0 },
  ]);
  assert.deepEqual(r.get(7), { productos: 3, conProducto: 2 });
  // Un id 0 es un id, no un vacío.
  assert.deepEqual(r.get(8), { productos: 1, conProducto: 1 });
  assert.equal(productosDelPapel().size, 0);
});

test("3 · LA TARJETA CUENTA PRODUCTOS DEL PAPEL, Y EL PEDIDO NACIDO DE FACTURA SE MIDE CONTRA EL PAPEL", () => {
  const c = codigoDe(PANEL);
  const lista = c.slice(c.indexOf('<div className="md:hidden flex flex-col gap-1">'));
  assert.match(lista, /c\.productosDelPapel === 1 \? "producto" : "productos"/);
  assert.ok(!/c\._count\?\.lineas\s*\?\s*` · \$\{c\._count\.lineas\}/.test(c), "la tarjeta volvió a contar renglones");
  // Nacido de factura: "N de M con producto", no "N de N llegaron".
  assert.match(c, /cobertura\?\.nacidoDeFactura\s*\?\s*cobertura\.productosDelPapel > 0/);
  assert.match(c, /`\$\{cobertura\.conProducto\} de \$\{cobertura\.productosDelPapel\} con producto`/);
  // El pedido normal sigue igual.
  assert.match(c, /`\$\{cobertura\.cubiertas\} de \$\{cobertura\.totalPedido\} llegaron`/);
  // Y la ruta lo arma con la función probada arriba, sin envases.
  const r = codigoDe(LISTAR);
  assert.match(r, /const delPapel = productosDelPapel\(lineasDeLosPapeles\)/);
  assert.match(r, /select: \{ comprobanteId: true, tipoRenglon: true, productoLocalId: true \}/);
  assert.match(r, /nacidoDeFactura: pedido\?\.nacidoDeFactura === true/);
  // `_count.lineas` se queda: es lo que se lleva un borrado.
  assert.match(r, /_count: \{ select: \{ lineas: true \} \}/);
});
