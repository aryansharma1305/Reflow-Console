"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface BobAIContextValue {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    deviceId?: string;
    setDeviceId: (id: string) => void;
}

const BobAIContext = createContext<BobAIContextValue>({
    isOpen: false,
    open: () => { },
    close: () => { },
    toggle: () => { },
    setDeviceId: () => { },
});

export function BobAIProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

    return (
        <BobAIContext.Provider
            value={{
                isOpen,
                open: () => setIsOpen(true),
                close: () => setIsOpen(false),
                toggle: () => setIsOpen((v) => !v),
                deviceId,
                setDeviceId,
            }}
        >
            {children}
        </BobAIContext.Provider>
    );
}

export function useBobAI() {
    return useContext(BobAIContext);
}
