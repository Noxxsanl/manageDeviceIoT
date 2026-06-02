import Sidebar from "@/components/Sidebar";
import Header from "@/components/layout/Header";
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
        <div className="bg-slate-950 text-slate-100">
          <Sidebar />
          <div className="ml-60 flex h-screen flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-slate-950 px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
              {children}
            </main>
          </div>
        </div>
      </AddDeviceProvider>
    </DevicesProvider>
  );
}
