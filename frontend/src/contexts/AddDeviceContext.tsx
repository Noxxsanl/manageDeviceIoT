"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { AddDeviceModal } from "@/components/device/AddDeviceModal";
import { useDevices } from "./DevicesContext";
import type { Device } from "@/types/device";

interface AddDeviceContextType {
  openModal: () => void;
  closeModal: () => void;
  onDeviceAdded?: (device: Device) => void;
}

const AddDeviceContext = createContext<AddDeviceContextType | undefined>(undefined);

export function AddDeviceProvider({ children }: { children: ReactNode }) {
  const { addDevice } = useDevices();
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  return (
    <AddDeviceContext.Provider value={{ openModal, closeModal, onDeviceAdded: addDevice }}>
      {children}
      <AddDeviceModal isOpen={isOpen} onClose={closeModal} />
    </AddDeviceContext.Provider>
  );
}

export function useAddDevice() {
  const context = useContext(AddDeviceContext);
  if (!context) {
    throw new Error("useAddDevice must be used within AddDeviceProvider");
  }
  return context;
}