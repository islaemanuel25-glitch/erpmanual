/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: isProd
        ? ["https://operix.cloud"]
        : ["http://localhost:3000", "http://127.0.0.1:3000"],
    },
  },

  // ── PDFJS NO SE EMPAQUETA ────────────────────────────────────────────────
  //
  // `pdfjs-dist` carga su worker con un import dinámico a un archivo hermano
  // —`pdf.worker.mjs`—. Empaquetado, ese hermano no existe: el bundler le cambia
  // el nombre al módulo principal y deja al worker afuera, y la lectura de
  // cualquier PDF termina en "Setting up fake worker failed: Cannot find module
  // .next/dev/server/chunks/pdf.worker.mjs".
  //
  // Lo peligroso es cómo se veía: el error llegaba a la pantalla como "el archivo
  // no se pudo abrir, puede estar dañado o protegido", sobre un PDF que estaba
  // perfecto. El usuario le pide otro archivo al proveedor y el problema sigue.
  // Ni el build ni la suite lo ven —los candados corren en Node, donde el import
  // resuelve bien—: apareció en la primera llamada real al endpoint.
  //
  // Marcándolo como externo, Node lo resuelve desde `node_modules` en tiempo de
  // ejecución y el worker aparece al lado, que es donde el paquete lo busca.
  serverExternalPackages: ["pdfjs-dist"],

  // ── Y EL WORKER SE COPIA A MANO AL PAQUETE DE PRODUCCIÓN ─────────────────
  //
  // Marcarlo como externo alcanza en desarrollo y NO alcanza en el build: el
  // trazador sigue las importaciones estáticas y la de `pdf.worker.mjs` es
  // dinámica, así que la deja afuera. Comprobado: sin este renglón,
  // `.next/standalone/node_modules/pdfjs-dist/legacy/build/` queda con `pdf.mjs`
  // y sin el worker, y el error que ya se arregló en desarrollo volvería tal cual
  // el día del despliegue —con el mensaje de "archivo dañado" sobre un PDF sano—.
  //
  // Es la familia de fallas que el CLAUDE.md llama "algo que no falla donde se
  // rompe": el build pasa en verde, los candados pasan en verde, y se cae en el
  // VPS con la lista de un proveedor adelante.
  outputFileTracingIncludes: {
    "/api/proveedores/listas/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },

  output: "standalone",
};

export default nextConfig;
