import "./globals.css";
import { UserProvider } from "@/app/context/UserContext";
import ThemeClientWrapper from "@/components/sunmi/ThemeClientWrapper";

export const metadata = {
  title: "ERP Azul",
  description: "Sistema de gestión minimarket",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <ThemeClientWrapper>
          <UserProvider>{children}</UserProvider>
        </ThemeClientWrapper>
      </body>
    </html>
  );
}
