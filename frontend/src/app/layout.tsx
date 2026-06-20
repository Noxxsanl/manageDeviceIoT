import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { ThemeProvider } from "next-themes";

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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-screen bg-[#F6F8FB] dark:bg-slate-900 text-gray-900 dark:text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
