"use client";

import { ReactNode } from "react";
import { ProjectsProvider } from "@/lib/ProjectsContext";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <ProjectsProvider>
            {children}
        </ProjectsProvider>
    );
}
