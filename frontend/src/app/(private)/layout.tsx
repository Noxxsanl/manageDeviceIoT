import Sidebar from "@/layout/Sidebar";
import Header from "@/layout/Header";
import { DevicesProvider } from "@/providers/DevicesContext";
import { AddDeviceProvider } from "@/providers/AddDeviceContext";

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
