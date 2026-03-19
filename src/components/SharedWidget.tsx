"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface SharedProject {
    id: string;
    name: string;
    owner: string;
    role: "Editor" | "Viewer" | "Admin";
    avatar?: string;
}

const sharedProjects: SharedProject[] = [
    { id: "1", name: "Cooling System v2", owner: "Jane Doe", role: "Editor" },
    { id: "2", name: "Grid Monitor Alpha", owner: "Robert Fox", role: "Viewer" },
];

const roleStyles: Record<string, string> = {
    Editor: "badge-editor",
    Viewer: "badge-viewer",
    Admin: "badge-admin",
};

const avatarColors = ["bg-blue-500", "bg-purple-500", "bg-teal-500"];

export default function SharedWidget() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-xl bg-white border border-border-subtle p-5"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Shared with you</h3>
                <button className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-colors">
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-3">
                {sharedProjects.map((project, i) => (
                    <div
                        key={project.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                        <div
                            className={`w-9 h-9 rounded-full ${avatarColors[i % avatarColors.length]
                                } flex items-center justify-center flex-shrink-0`}
                        >
                            <span className="text-xs font-bold text-white">
                                {project.owner
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                                {project.name}
                            </p>
                            <p className="text-[11px] text-text-muted">
                                Owner: {project.owner}
                            </p>
                        </div>
                        <span className={`badge ${roleStyles[project.role]}`}>
                            {project.role}
                        </span>
                    </div>
                ))}
            </div>

            <button className="mt-3 w-full py-2 text-xs font-medium text-text-muted border border-border-subtle rounded-lg hover:bg-surface-muted transition-colors">
                View All Shared Projects
            </button>
        </motion.div>
    );
}
