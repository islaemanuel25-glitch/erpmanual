import "./globals.css";
import { UserProvider } from "@/app/context/UserContext";
import ThemeClientWrapper from "@/components/sunmi/ThemeClientWrapper";
import AparienciaInstitucionalSync from "@/components/sunmi/AparienciaInstitucionalSync";
import { DEFAULT_SUNMI_THEME_KEY } from "@/lib/sunmiThemes";
import { resolverTemaInstitucionalSSR } from "@/lib/apariencia/temaServidor";

export const metadata = {
  title: "ERP Azul",
  description: "Sistema de gestión minimarket",
};

// Precedencia del tema: preferencia PERSONAL (localStorage, cliente) → INSTITUCIONAL
// del local (resuelto acá en SSR) → default. Pintar el institucional en el primer
// HTML evita el flash (dark→tema del local) en dispositivos sin preferencia personal.
// Si hay preferencia personal, el <script> de abajo la aplica y gana (server no la ve).
export default async function RootLayout({ children }) {
  const temaInstitucional = await resolverTemaInstitucionalSSR(); // clave válida o null
  const temaInicial = temaInstitucional || DEFAULT_SUNMI_THEME_KEY;

  return (
    <html lang="es" data-theme={temaInicial} suppressHydrationWarning>
      <head>
        <script
          // Solo pisa data-theme si HAY una preferencia personal válida en este
          // dispositivo. Si no hay, respeta el tema institucional ya pintado por
          // el server (antes forzaba "sunmiDark" y reintroducía el flash).
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("erp-sunmi-theme");if(typeof t==="string"&&t.length>=1&&/^[a-zA-Z0-9_-]+$/.test(t)){document.documentElement.dataset.theme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeClientWrapper institucionalInicial={temaInstitucional}>
          <UserProvider>
            <AparienciaInstitucionalSync />
            {children}
          </UserProvider>
        </ThemeClientWrapper>
      </body>
    </html>
  );
}
