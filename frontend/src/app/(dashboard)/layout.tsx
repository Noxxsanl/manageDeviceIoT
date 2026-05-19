import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/Sidebar";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { AddDeviceProvider } from "@/contexts/AddDeviceContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DevicesProvider>
      <AddDeviceProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <Navbar />
          <div className="flex pt-20">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-slate-950 px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
              {children}
            </main>
          </div>
        </div>
      </AddDeviceProvider>
    </DevicesProvider>
  );
}
