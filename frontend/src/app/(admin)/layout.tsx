import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "IoT Manager Admin Panel",
  description: "Production-ready IoT admin panel built with Next.js, TailwindCSS and mock data.",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-20">
        <div className="flex min-h-[calc(100vh-5rem)]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-slate-950 px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
