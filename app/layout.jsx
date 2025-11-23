import "./globals.css";
import { UserProvider } from "@/app/context/UserContext";

export const metadata = {
  title: "ERP Azul",
  description: "Sistema de gestión minimarket",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
