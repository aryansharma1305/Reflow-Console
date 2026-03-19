"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Cpu, ArrowRight } from "lucide-react";

interface Device {
  serial_no?: string;
  name?: string;
}

interface Project {
  _id: string;
  name: string;
  devices?: Device[];
  deviceCount?: number;
  owner?: string;
  status?: string;
}

interface ProjectCardProps {
  project: Project;
  isShared?: boolean;
  index?: number;
  variant?: "grid" | "horizontal";
}

const statusConfig: Record<string, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  active: { label: "Active", dotClass: "bg-emerald-400", textClass: "text-emerald-600", bgClass: "bg-emerald-50" },
  maintenance: { label: "Maintenance", dotClass: "bg-amber-400", textClass: "text-amber-600", bgClass: "bg-amber-50" },
  offline: { label: "Offline", dotClass: "bg-red-400", textClass: "text-red-600", bgClass: "bg-red-50" },
};

// Deterministic gradient palette based on project name
const GRADIENTS = [
  { from: "#1e3a8a", to: "#3b82f6", accent: "#93c5fd" }, // deep blue → sky
  { from: "#4c1d95", to: "#8b5cf6", accent: "#c4b5fd" }, // dark violet → lavender
  { from: "#064e3b", to: "#10b981", accent: "#6ee7b7" }, // forest → emerald
  { from: "#7c2d12", to: "#f97316", accent: "#fed7aa" }, // rust → orange
  { from: "#831843", to: "#ec4899", accent: "#fbcfe8" }, // dark rose → pink
  { from: "#0c4a6e", to: "#0ea5e9", accent: "#bae6fd" }, // navy → cyan
  { from: "#365314", to: "#84cc16", accent: "#d9f99d" }, // dark olive → lime
  { from: "#1e1b4b", to: "#6366f1", accent: "#c7d2fe" }, // midnight → indigo
];

// Simple hash from project name for stable color across renders
function nameHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// SVG circuit-board pattern lines (subtle background texture)
function CircuitLines({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="20" x2="60" y2="20" stroke={color} strokeWidth="1.5" />
      <line x1="60" y1="20" x2="60" y2="0" stroke={color} strokeWidth="1.5" />
      <circle cx="60" cy="20" r="3" fill={color} />

      <line x1="80" y1="0" x2="80" y2="40" stroke={color} strokeWidth="1.5" />
      <line x1="80" y1="40" x2="130" y2="40" stroke={color} strokeWidth="1.5" />
      <circle cx="80" cy="40" r="3" fill={color} />

      <line x1="100%" y1="10" x2="80%" y2="10" stroke={color} strokeWidth="1.5" />
      <line x1="80%" y1="10" x2="80%" y2="30" stroke={color} strokeWidth="1.5" />
      <circle cx="80%" cy="10" r="3" fill={color} />

      <line x1="0" y1="55" x2="40" y2="55" stroke={color} strokeWidth="1" />
      <line x1="40" y1="55" x2="40" y2="75" stroke={color} strokeWidth="1" />
      <line x1="40" y1="75" x2="90" y2="75" stroke={color} strokeWidth="1" />
      <circle cx="40" cy="55" r="2" fill={color} />
    </svg>
  );
}

export default function ProjectCard({
  project,
  isShared = false,
  index = 0,
  variant = "grid",
}: ProjectCardProps) {
  const router = useRouter();
  const status = project.status || "active";
  const statusInfo = statusConfig[status] || statusConfig.active;
  const deviceCount = project.deviceCount ?? project.devices?.length ?? 0;

  const grad = GRADIENTS[nameHash(project.name) % GRADIENTS.length];
  const initials = project.name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("selectedProjectID", JSON.stringify(project));
    }
    router.push(`/projects/${project._id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06 + index * 0.07 }}
      onClick={handleClick}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* ── Gradient banner ── */}
      <div
        className="relative h-24 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)` }}
      >
        <CircuitLines color={grad.accent} />

        {/* Blurred orb decoration */}
        <div
          className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-30 blur-xl"
          style={{ background: grad.accent }}
        />

        {/* Initials badge */}
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm border border-white/20 backdrop-blur-sm"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            {initials || project.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Status pill top-right */}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.bgClass} ${statusInfo.textClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass} ${status === "active" ? "animate-pulse" : ""}`} />
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="px-4 pt-3 pb-4">
        <h3 className="text-[15px] font-semibold text-slate-800 truncate mb-0.5">
          {project.name}
        </h3>
        <p className="text-[10px] text-slate-400 font-mono truncate mb-4">
          {project._id}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${grad.from}18` }}
            >
              <Cpu className="w-3.5 h-3.5" style={{ color: grad.to }} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 leading-none">{deviceCount}</p>
              <p className="text-[10px] text-slate-400">Device{deviceCount !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: grad.to }}
          >
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        {/* Shared tag */}
        {isShared && project.owner && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">Shared by {project.owner}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
