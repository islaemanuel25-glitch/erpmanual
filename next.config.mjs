/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Requerido para Next 16 + Supabase Auth (estabiliza cookies y sesión)
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },

  // ✅ Necesario para que Next maneje las cookies correctamente en producción y dev
  output: "standalone", 

  // ✅ Permite CORS y manejo estándar de las requests (opcional pero recomendado)
  // basePath: "",
};

export default nextConfig;
