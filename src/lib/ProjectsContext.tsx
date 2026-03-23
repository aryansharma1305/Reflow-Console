"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
    getAllProjects,
    getProjectDevices,
    isAuthenticated,
    getUserEmail,
} from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────

interface Device {
    id?: string;
    _id?: string;
    serial_no?: string;
    serialNumber?: string;
    name?: string;
    description?: string;
    projectName?: string;
    projectId?: string;
}

interface Project {
    id?: string;
    _id?: string;
    name: string;
    description?: string;
    devices?: Device[];
    owner?: string;
    status?: string;
    createdBy?: { name?: string; email?: string };
    members?: { user?: { email?: string; name?: string }; role?: string }[];
    updatedAt?: string;
}

interface ProjectsContextValue {
    projects: Project[];
    devices: Device[];
    loading: boolean;
    error: string | null;
    /** Force a fresh re-fetch from the backend */
    refresh: () => Promise<void>;
    /** Get devices for a specific project */
    getDevicesForProject: (projectId: string) => Device[];
    /** Last fetch timestamp */
    lastFetched: number | null;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

export function ProjectsProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<number | null>(null);

    const fetchAll = useCallback(async () => {
        if (!isAuthenticated()) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.time("[Cache] fetchAll");

            const data = await getAllProjects();
            const projectList: Project[] = Array.isArray(data)
                ? data
                : (data?.data?.projects || data?.projects || data?.data || []);

            // If projects already have devices nested, use them directly.
            // Otherwise fetch devices per project concurrently.
            const allDevices: Device[] = [];
            let needsDeviceFetch = false;

            for (const p of projectList) {
                if (!p.devices || !Array.isArray(p.devices) || p.devices.length === 0) {
                    needsDeviceFetch = true;
                    break;
                }
            }

            if (needsDeviceFetch) {
                const results = await Promise.allSettled(
                    projectList.map(async (p) => {
                        const pId = p.id || p._id || "";
                        if (!pId) return [];
                        if (p.devices && Array.isArray(p.devices) && p.devices.length > 0) {
                            return p.devices;
                        }
                        try {
                            const res = await getProjectDevices(pId);
                            const devs = res?.data?.devices || res?.devices || [];
                            p.devices = devs; // attach to project
                            return devs;
                        } catch {
                            return [];
                        }
                    })
                );

                for (let i = 0; i < projectList.length; i++) {
                    const result = results[i];
                    const pId = projectList[i].id || projectList[i]._id || "";
                    const devs = result.status === "fulfilled" ? result.value : [];
                    for (const d of devs) {
                        allDevices.push({
                            ...d,
                            projectName: projectList[i].name,
                            projectId: pId,
                        });
                    }
                }
            } else {
                // All projects already have devices
                for (const p of projectList) {
                    const pId = p.id || p._id || "";
                    for (const d of (p.devices || [])) {
                        allDevices.push({
                            ...d,
                            projectName: p.name,
                            projectId: pId,
                        });
                    }
                }
            }

            setProjects(projectList);
            setDevices(allDevices);
            setLastFetched(Date.now());
            console.timeEnd("[Cache] fetchAll");
        } catch (err) {
            console.error("[Cache] Error fetching data:", err);
            setError("Could not load data. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch on mount
    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const getDevicesForProject = useCallback(
        (projectId: string) => {
            return devices.filter((d) => d.projectId === projectId);
        },
        [devices]
    );

    return (
        <ProjectsContext.Provider
            value={{
                projects,
                devices,
                loading,
                error,
                refresh: fetchAll,
                getDevicesForProject,
                lastFetched,
            }}
        >
            {children}
        </ProjectsContext.Provider>
    );
}

// ── Hook ─────────────────────────────────────────────────────────

export function useProjects() {
    const ctx = useContext(ProjectsContext);
    if (!ctx) {
        throw new Error("useProjects must be used within a ProjectsProvider");
    }
    return ctx;
}
