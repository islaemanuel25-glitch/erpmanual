// EL RENGLÓN DEL PAPEL SOBREVIVE A QUE EL PAPEL SE VUELVA A LEER.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/resolverLineaDelPapel.test.mjs
//
// ── EL CASO, MEDIDO CONTRA PRODUCCIÓN EL 2026-09-22 ───────────────────────
//
// Pedido 242, Papas Congeladas. "Dejar el que tenía" contestaba en rojo
// "No existe esa línea." y la decisión no se guardaba.
//
// El comprobante 13 del 242 tiene DIEZ lecturas —de las 16:27 del 21 a las
// 02:17 del 22— y cada una hace `comprobanteLinea.deleteMany` del comprobante
// entero y vuelve a crear los renglones. Sus renglones vivos son los ids 173 a
// 183; entre el 125 y el 172 hay cuarenta y ocho ids muertos, que son los que
// las lecturas anteriores habían creado. Un teléfono con la pantalla abierta
// desde antes manda un id que ya no existe.
//
// Los números de este candado son ésos, no inventados.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolverLineaDelPapel,
  textoComparable,
  SE_VOLVIO_A_LEER,
  NO_ES_DE_ESTE_PEDIDO,
  HAY_DOS_IGUALES,
} from "@/lib/compras-proveedor/comprobante/resolverLineaDelPapel";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Los once renglones vivos del 242, con su texto real del papel. */
const VIVOS = [
  { id: 173, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-" },
  { id: 174, textoCrudo: "TREMS MANTECA X100 GS 60" },
  { id: 175, textoCrudo: "TREMS QUESO RALL 40GR X20 6" },
  { id: 176, textoCrudo: "PATY CLASICO FLOW X80GR X2 30" },
  { id: 182, textoCrudo: "POK SAL PIC FINO X 4U 1" },
];

/** Una base de mentira con la forma exacta de las dos consultas que se hacen. */
function baseCon(vivos, { pedido = 242 } = {}) {
  // Cada renglón sabe de qué pedido es; sin eso el `pedidoId` del where no se
  // puede ejercer y el candado quedaría verde sin probar nada.
  const filas = vivos.map((l) => ({ pedido, ...l }));
  return {
    comprobanteLinea: {
      async findFirst({ where }) {
        const p = where?.comprobante?.pedidoId;
        return (
          filas.find((l) => l.id === where.id && (p === undefined || l.pedido === p)) ?? null
        );
      },
      async findMany({ where }) {
        const p = where?.comprobante?.pedidoId;
        return filas.filter((l) => p === undefined || l.pedido === p);
      },
    },
  };
}

test("EL ID QUE VIVE SE USA TAL CUAL, SIN SEGUNDA CONSULTA", async () => {
  let consultasDeReemplazo = 0;
  const prisma = baseCon(VIVOS);
  prisma.comprobanteLinea.findMany = async () => {
    consultasDeReemplazo += 1;
    return VIVOS;
  };
  const r = await resolverLineaDelPapel(prisma, {
    grupoId: 1, lineaId: 173, pedidoId: 242, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-", select: {},
  });
  assert.equal(r.linea.id, 173);
  assert.equal(r.reemplazada, false);
  assert.equal(r.motivo, null);
  assert.equal(consultasDeReemplazo, 0, "buscó el reemplazo de un renglón que estaba");
});

test("UN ID MUERTO SE VUELVE A ENCONTRAR POR EL TEXTO DEL PAPEL", async () => {
  // 124 es uno de los cuarenta y ocho ids que la relectura dejó muertos.
  const r = await resolverLineaDelPapel(baseCon(VIVOS), {
    grupoId: 1, lineaId: 124, pedidoId: 242, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-", select: {},
  });
  assert.equal(r.linea.id, 173, "no encontró el renglón nuevo del mismo producto");
  assert.equal(r.reemplazada, true);
  assert.equal(r.motivo, null);
});

test("Y NO LE IMPORTAN LAS MAYÚSCULAS NI LOS ESPACIOS DE MÁS", async () => {
  const r = await resolverLineaDelPapel(baseCon(VIVOS), {
    grupoId: 1, lineaId: 124, pedidoId: 242, textoCrudo: "  butler c.  trad 9mm x2,5kg -6-  ", select: {},
  });
  assert.equal(r.linea.id, 173);
  assert.equal(textoComparable("  A   b "), "a b");
});

test("SI HAY DOS RENGLONES CON EL MISMO TEXTO, NO SE ELIGE NINGUNO", async () => {
  // Un papel puede traer dos veces el mismo producto. Decidir el precio del
  // renglón equivocado escribe un costo que nadie pidió.
  const dobles = [...VIVOS, { id: 190, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-" }];
  const r = await resolverLineaDelPapel(baseCon(dobles), {
    grupoId: 1, lineaId: 124, pedidoId: 242, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-", select: {},
  });
  assert.equal(r.linea, null);
  assert.equal(r.motivo, HAY_DOS_IGUALES);
});

test("SIN CON QUÉ BUSCAR, SE DICE QUÉ PASÓ — NO SE ADIVINA", async () => {
  for (const falta of [
    { lineaId: 124, pedidoId: null, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-" },
    { lineaId: 124, pedidoId: 242, textoCrudo: null },
    { lineaId: null, pedidoId: 242, textoCrudo: null },
  ]) {
    const r = await resolverLineaDelPapel(baseCon(VIVOS), { grupoId: 1, ...falta, select: {} });
    assert.equal(r.linea, null);
    assert.equal(r.motivo, SE_VOLVIO_A_LEER);
  }
  // Y un renglón cuyo texto ya no está en el pedido tampoco se adivina.
  const otro = await resolverLineaDelPapel(baseCon(VIVOS), {
    grupoId: 1, lineaId: 124, pedidoId: 242, textoCrudo: "ALGO QUE NO ESTÁ EN EL PAPEL", select: {},
  });
  assert.equal(otro.linea, null);
  assert.equal(otro.motivo, SE_VOLVIO_A_LEER);
  // Un pedido sin ningún renglón dice otra cosa, porque es otra cosa.
  const vacio = await resolverLineaDelPapel(baseCon([]), {
    grupoId: 1, lineaId: 124, pedidoId: 999, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-", select: {},
  });
  assert.equal(vacio.motivo, NO_ES_DE_ESTE_PEDIDO);
});

test("LOS TRES MENSAJES ESTÁN EN CASTELLANO Y DICEN QUÉ HACER", () => {
  for (const t of [SE_VOLVIO_A_LEER, NO_ES_DE_ESTE_PEDIDO, HAY_DOS_IGUALES]) {
    assert.ok(t.length > 40, "un mensaje de una palabra no explica nada");
    assert.ok(!/línea|id\b|404|null|undefined/i.test(t), `habla de adentro: ${t}`);
    assert.match(t, /Actualizá|Volvé/, "no dice qué hacer");
  }
  // Y el de la relectura dice lo único que la persona necesita saber además:
  // que lo que estaba por guardar NO se guardó.
  assert.match(SE_VOLVIO_A_LEER, /no se guardó/);
});

// ── Y LAS TRES RUTAS LO USAN, QUE ES DONDE ESTABA EL DEFECTO ──────────────

const RUTAS = [
  "app/api/compras-proveedor/comprobantes/aceptar-precio/route.js",
  "app/api/compras-proveedor/comprobantes/marcar-revisada/route.js",
  "app/api/compras-proveedor/comprobantes/vincular/route.js",
];

test("NINGUNA DE LAS TRES RUTAS DEL CONTROL VUELVE A DECIR «No existe esa línea»", () => {
  for (const ruta of RUTAS) {
    const codigo = codigoDe(ruta);
    assert.ok(
      !/No existe esa línea/.test(codigo),
      `${ruta} le sigue mandando a la persona un mensaje de adentro`
    );
    assert.match(codigo, /resolverLineaDelPapel\(prisma, \{/, `${ruta} no resuelve el renglón`);
    assert.match(codigo, /textoCrudo: body\?\.textoCrudo/, `${ruta} no recibe con qué reencontrarlo`);
    assert.match(codigo, /pedidoId: body\?\.pedidoId/, `${ruta} no recibe de qué pedido es`);
  }
});

test("Y LA PANTALLA DEL TELÉFONO MANDA CON QUÉ REENCONTRARLO", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  // Las tres escrituras del control: precio aceptado, precio propio y vínculo,
  // más la marca de revisado.
  assert.equal(
    (pagina.match(/pedidoId: Number\(id\)/g) || []).length,
    4,
    "alguna de las cuatro escrituras del control sigue mandando solo el id del renglón"
  );
  assert.match(pagina, /textoCrudo: fila\?\.textoCrudo \?\? null/);
  // Y la marca viaja con el renglón entero, no con su id suelto.
  assert.match(pagina, /const marcarRevisada = useCallback\(async \(renglon, revisada = true\)/);
  assert.ok(
    !/marcarRevisada\([^)]*\.lineaId/.test(pagina),
    "quedó un llamador mandando solo el id"
  );
  // La hoja de Corregir manda el texto impreso al guardar.
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /textoCrudo: fila\.textoCrudo \?\? null/);
});

test("UN ID VIVO PERO DE OTRO PEDIDO NO SE DEVUELVE", async () => {
  // ── EL DEFECTO SILENCIOSO, MEDIDO CONTRA PRODUCCIÓN ─────────────────
  //
  // El id 124 es uno de los que la relectura del 242 dejó atrás, y está VIVO:
  // es del comprobante 5, de otro pedido. Buscando solo por id y grupo —como
  // buscaban las tres rutas— un teléfono con la pantalla vieja del 242 pedía
  // decidir el precio de un renglón de otra factura y el servidor se lo daba.
  // La forma ruidosa del mismo defecto es el "No existe esa línea."; ésta no
  // hacía ruido y escribía en el renglón equivocado.
  const deOtroPedido = baseCon(
    [{ id: 124, textoCrudo: "ALGO DE OTRA FACTURA", pedido: 28 }, ...VIVOS],
    { pedido: 242 }
  );
  const r = await resolverLineaDelPapel(deOtroPedido, {
    grupoId: 1, lineaId: 124, pedidoId: 242, textoCrudo: "BUTLER C. TRAD 9MM X2,5KG -6-", select: {},
  });
  // No devuelve el 124: devuelve el renglón del 242 que dice lo mismo que el papel.
  assert.equal(r.linea.id, 173);
  assert.equal(r.reemplazada, true);
});
