import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/providers/AuthContext";

export const metadata: Metadata = {
  title: "IoT Manager",
  description: "IoT device management admin panel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-[#F6F8FB] text-gray-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
