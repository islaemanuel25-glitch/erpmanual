import "./globals.css";
import { UserProvider } from "@/app/context/UserContext";
import ThemeClientWrapper from "@/components/sunmi/ThemeClientWrapper";
import AparienciaInstitucionalSync from "@/components/sunmi/AparienciaInstitucionalSync";

export const metadata = {
  title: "ERP Azul",
  description: "Sistema de gestión minimarket",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("erp-sunmi-theme");if(typeof t!=="string"||t.length<1||!/^[a-zA-Z0-9_-]+$/.test(t))t="sunmiDark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="sunmiDark";}})();`,
          }}
        />
      </head>
      <body>
        <ThemeClientWrapper>
          <UserProvider>
            <AparienciaInstitucionalSync />
            {children}
          </UserProvider>
        </ThemeClientWrapper>
      </body>
    </html>
  );
}
