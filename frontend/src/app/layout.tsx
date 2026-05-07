import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IoT Manager Admin Panel",
  description: "Production-ready IoT admin panel built with Next.js, TailwindCSS and mock data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="min-h-screen w-full">
            <Navbar />
            <Sidebar />
            <main className="min-h-[calc(100vh-5rem)] w-full overflow-y-auto bg-slate-950 pt-20 lg:pl-72">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
