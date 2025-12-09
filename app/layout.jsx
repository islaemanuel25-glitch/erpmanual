import "./globals.css";
import { UserProvider } from "@/app/context/UserContext";
import ThemeClientWrapper from "@/components/sunmi/ThemeClientWrapper";
import { UIConfigProvider } from "@/components/providers/UIConfigProvider";
import { LayoutModeProvider } from "@/components/providers/LayoutModeProvider";
import { SidebarConfigProvider } from "@/components/providers/SidebarConfigProvider";

export const metadata = {
  title: "ERP Azul",
  description: "Sistema de gestión minimarket",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {/* 1) UIConfigProvider SIEMPRE VA PRIMERO */}
        <UIConfigProvider>
          {/* 2) ThemeClientWrapper DEBE ESTAR ADENTRO */}
          <ThemeClientWrapper>
            {/* 3) LayoutModeProvider para controlar layouts */}
            <LayoutModeProvider>
              {/* 4) SidebarConfigProvider para configurar sidebar */}
              <SidebarConfigProvider>
                {/* 5) Providers de usuario y resto */}
                <UserProvider>
                  {children}
                </UserProvider>
              </SidebarConfigProvider>
            </LayoutModeProvider>
          </ThemeClientWrapper>
        </UIConfigProvider>
      </body>
    </html>
  );
}
