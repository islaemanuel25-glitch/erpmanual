// SEMBRAR LO MÍNIMO PARA QUE EL POS DEL RUNNER PUEDA COBRAR.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/sembrar-visual-pos.mjs
//
// ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
//
// `prisma/seed.js` crea el grupo, los tres locales y el usuario, y NO crea
// ningún producto. La sonda de modalidades tiene que buscar un producto, tocarlo
// y llegar al panel de cobro: sin producto, su primer paso falla por FIXTURE y
// ese rojo se leería como un defecto de la UI, que es lo peor que puede pasarle
// a una medición.
//
// Y sin TURNO abierto el POS ni siquiera dibuja el panel: redirige a la pantalla
// de apertura. Una sonda ahí no mide la pantalla de cobro, mide otra.
//
// ── LO QUE NO HACE ─────────────────────────────────────────────────────────
//
// No toca `prisma/seed.js`. El seed produce el escenario base de cualquier
// entorno que lo corra; los datos de una prueba viven en la prueba.
//
// No toca la lógica de productos ni la configuración de medios: eso lo siembra
// `sembrar-visual-medios-cobro.mjs`, que corre antes.
//
// ── DÓNDE CORRE Y DÓNDE NO ─────────────────────────────────────────────────
//
// Solo contra una base descartable. `scripts/lib/clientePrisma.mjs` en nivel
// ESCRITURA exige host local y NODE_ENV distinto de production, y aborta con
// código 2 si algo de eso falla. En la práctica vive en el runner efímero.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const { crearProductoVendible, abrirTurnoDePrueba } = await import("./fixturePos.mjs");

const arg = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

// El nombre del local donde se para la sonda. Es un LOCAL y no el depósito
// porque el POS de un depósito se comporta distinto, y lo que hay que medir es
// la pantalla del que vende.
const LOCAL = arg("local", "Local 1");
// Un nombre que no se parece a nada del seed: la sonda lo busca por él, así que
// tiene que ser inequívoco. Si el buscador devolviera dos cosas, tocaría la
// equivocada y la medición sería sobre otro producto.
const PRODUCTO = arg("producto", "Sonda Modalidades Producto");
const PRECIO = Number(arg("precio", "1000"));

async function main() {
  const grupo = await prisma.grupo.findFirst({ orderBy: { id: "asc" } });
  if (!grupo) {
    console.error("ABORTADO: no hay ningún grupo. ¿Corrió `prisma/seed.js` antes?");
    process.exit(2);
  }

  const local = await prisma.local.findFirst({ where: { nombre: LOCAL } });
  if (!local) {
    console.error(`ABORTADO: no existe el local "${LOCAL}". ¿Corrió \`prisma/seed.js\` antes?`);
    process.exit(2);
  }

  // El gate de operador es de otro módulo y no es lo que se está midiendo: se
  // apaga explícitamente en vez de esquivarlo fabricando un voucher firmado.
  await prisma.configuracionLocal.upsert({
    where: { localId: local.id },
    update: { exigirOperador: false, allowNegativeStock: true },
    create: { localId: local.id, exigirOperador: false, allowNegativeStock: true },
  });

  const usuario = await prisma.usuario.findFirst({ orderBy: { id: "asc" } });
  if (!usuario) {
    console.error("ABORTADO: no hay ningún usuario. ¿Corrió `prisma/seed.js` antes?");
    process.exit(2);
  }

  const yaEsta = await prisma.productoLocal.findFirst({
    where: { localId: local.id, nombre: PRODUCTO },
  });
  const producto = yaEsta
    ? { baseId: yaEsta.baseId, productoLocalId: yaEsta.id }
    : await crearProductoVendible(prisma, {
        grupoId: grupo.id,
        localId: local.id,
        nombre: PRODUCTO,
        precioVenta: PRECIO,
      });

  const turno = await abrirTurnoDePrueba(prisma, { localId: local.id, vendedorId: usuario.id });

  console.log(`local: ${local.nombre} (id ${local.id})`);
  console.log(`producto: "${PRODUCTO}" $${PRECIO} (productoLocalId ${producto.productoLocalId})`);
  console.log(`turno abierto: id ${turno.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
