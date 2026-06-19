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
        <div className="bg-[#F6F8FB] text-gray-900">
          <Sidebar />
          <div className="ml-60 flex h-screen flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-[#F6F8FB] px-5 py-5 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </AddDeviceProvider>
    </DevicesProvider>
  );
}
