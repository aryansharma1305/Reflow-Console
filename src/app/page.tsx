"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import ProjectCard from "@/components/ProjectCard";
import SnapshotWidget from "@/components/SnapshotWidget";
import SharedWidget from "@/components/SharedWidget";
import LogoLoader from "@/components/LogoLoader";
import OrganizationSetup from "@/components/OrganizationSetup";
import { POLLING_CONFIG } from "@/config/constants";
import {
  getAllProjects,
  getProjectDevices,
  getUserEmail,
  getUserName,
  isAuthenticated,
} from "@/lib/api";
import { useOrgGuard } from "@/lib/useOrgGuard";
import {
  FolderOpen,
  Cpu,
  Activity,
  Share2,
  Plus,
  Filter,
  Wifi,
} from "lucide-react";

interface User {
  name?: string;
  email?: string;
  role?: string;
}

interface Device {
  id?: string;
  _id?: string;
  serial_no?: string;
  serialNumber?: string;
  name?: string;
}

interface Project {
  id?: string;
  _id?: string;
  name: string;
  devices?: Device[];
  owner?: string;
  status?: string;
  createdBy?: { name?: string; email?: string };
  members?: { user?: { email?: string }; role?: string }[];
}

interface Stats {
  totalProjects: number;
  totalDevices: number;
  activeDevices: number;
  sharedProjects: number;
}

// ── Quick MQTT status check ──────────────────────────────────────
async function checkDeviceOnline(serialId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/mqtt-readings?serialId=${serialId}`);
    if (!res.ok) return false;
    const data = await res.json();
    return (
      !data.error &&
      [data.RawCH1, data.RawCH2, data.RawCH3, data.RawCH4, data.RawCH5, data.RawCH6].some(
        (v) => v !== null && v !== undefined
      )
    );
  } catch {
    return false;
  }
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showOrgSetup, setShowOrgSetup] = useState(false);
  const { hasOrg, orgChecked } = useOrgGuard();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalProjects: 0,
    totalDevices: 0,
    activeDevices: 0,
    sharedProjects: 0,
  });
  const [mqttChecking, setMqttChecking] = useState(false);

  useEffect(() => {
    const email = getUserEmail();
    const name = getUserName();
    const token = isAuthenticated();
    if (token) {
      setUser({ name: name || "User", email: email || "user@example.com", role: "User" });
    }
    if (searchParams.get("setup") === "org") {
      const skipped = typeof window !== "undefined" && sessionStorage.getItem("org_setup_skipped");
      if (!skipped) setShowOrgSetup(true);
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchData() {
      const timeoutId = setTimeout(() => { if (loading) setLoading(false); }, 8000);
      try {
        if (!isAuthenticated()) { router.push("/login"); return; }

        const data = await getAllProjects();
        const projectList: Project[] = data?.data?.projects || data?.projects || [];
        setProjects(projectList);

        // Collect all devices with their serial numbers
        const allDeviceSerials: string[] = [];
        for (const p of projectList) {
          const pId = p.id || p._id || "";
          try {
            const res = await getProjectDevices(pId);
            const devs = res?.data?.devices || res?.devices || [];
            devs.forEach((d: Device) => {
              const serial = d.serialNumber || d.serial_no || d.id || d._id;
              if (serial) allDeviceSerials.push(serial);
            });
          } catch {
            // fall through, use devices in project
          }
        }

        // Also pick up devices nested in the project list itself (fallback)
        projectList.forEach((p) => {
          (p.devices || []).forEach((d) => {
            const s = d.serialNumber || d.serial_no || d.id || d._id;
            if (s && !allDeviceSerials.includes(s)) allDeviceSerials.push(s);
          });
        });

        const totalDevices = allDeviceSerials.length;

        setStats({
          totalProjects: projectList.length,
          totalDevices,
          activeDevices: 0, // will be updated by MQTT check below
          sharedProjects: projectList.filter(
            (p: Project) => p.createdBy?.email !== getUserEmail()
          ).length,
        });
        setError(null);

        // ── MQTT online check ─────────────────────────────────
        if (allDeviceSerials.length > 0) {
          setMqttChecking(true);
          const results = await Promise.allSettled(
            allDeviceSerials.map(checkDeviceOnline)
          );
          const onlineCount = results.filter(
            (r) => r.status === "fulfilled" && r.value === true
          ).length;
          setStats((prev) => ({ ...prev, activeDevices: onlineCount }));
          setMqttChecking(false);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Could not connect to backend. Please check your connection.");
        setProjects([]);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }
    fetchData();
    // Re-check MQTT status
    const mqttRefresh = setInterval(async () => {
      if (!isAuthenticated()) return;
      const data = await getAllProjects().catch(() => null);
      if (!data) return;
      const projectList: Project[] = data?.data?.projects || data?.projects || [];
      const serials: string[] = [];
      projectList.forEach((p) => {
        (p.devices || []).forEach((d) => {
          const s = d.serialNumber || d.serial_no || d.id || d._id;
          if (s) serials.push(s);
        });
      });
      if (serials.length === 0) return;
      const results = await Promise.allSettled(serials.map(checkDeviceOnline));
      const onlineCount = results.filter(
        (r) => r.status === "fulfilled" && r.value === true
      ).length;
      setStats((prev) => ({
        ...prev,
        totalDevices: serials.length,
        activeDevices: onlineCount,
      }));
    }, POLLING_CONFIG.DASHBOARD_MQTT_REFRESH);

    return () => clearInterval(mqttRefresh);
  }, []);

  if (loading) return <LogoLoader text="Initializing console..." />;

  const handleOrgSetupComplete = () => setShowOrgSetup(false);
  const firstName = user?.name?.split(" ")[0] || "User";
  const uptimePct =
    stats.totalDevices > 0
      ? Math.round((stats.activeDevices / stats.totalDevices) * 100)
      : 0;

  return (
    <>
      {showOrgSetup && <OrganizationSetup onComplete={handleOrgSetupComplete} />}
      <DashboardLayout
        title="Overview"
        breadcrumbs={[{ label: "Workspace", href: "/" }, { label: "Overview" }]}
        user={user}
      >
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Main content */}
          <div className="space-y-6 min-w-0">
            {/* Welcome Section */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 className="text-2xl font-bold text-text-primary">
                  Welcome back, {firstName}!
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  Here&apos;s what&apos;s happening with your projects today.
                </p>
                {error && <p className="text-xs text-amber-600 mt-1">⚠ {error}</p>}
                {mqttChecking && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    <Wifi className="w-3 h-3 animate-pulse" /> Checking MQTT status…
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">
                  <Filter className="w-4 h-4" />
                  Filter
                </button>
                <button
                  onClick={() => {
                    if (orgChecked && !hasOrg) { setShowOrgSetup(true); return; }
                    router.push("/projects/new");
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              </div>
            </motion.section>

            {/* Stat Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Projects"
                value={stats.totalProjects}
                change={`${stats.totalProjects} owned`}
                changeType="positive"
                icon={FolderOpen}
                iconColor="text-blue-600"
                iconBg="bg-blue-100"
                index={0}
              />
              <StatCard
                title="Total Devices"
                value={stats.totalDevices}
                subtitle="Across all projects"
                icon={Cpu}
                iconColor="text-amber-600"
                iconBg="bg-amber-100"
                index={1}
              />
              <StatCard
                title="Online Now"
                value={stats.activeDevices}
                change={
                  mqttChecking
                    ? "● Checking MQTT…"
                    : stats.totalDevices > 0
                    ? `● ${uptimePct}% Online`
                    : "● No devices"
                }
                changeType={stats.activeDevices > 0 ? "positive" : "neutral"}
                icon={Activity}
                iconColor={stats.activeDevices > 0 ? "text-green-600" : "text-slate-400"}
                iconBg={stats.activeDevices > 0 ? "bg-green-100" : "bg-slate-100"}
                index={2}
              />
              <StatCard
                title="Shared Access"
                value={stats.sharedProjects}
                subtitle={`${stats.sharedProjects} shared project${stats.sharedProjects !== 1 ? "s" : ""}`}
                icon={Share2}
                iconColor="text-purple-600"
                iconBg="bg-purple-100"
                index={3}
              />
            </section>

            {/* Recent Projects */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary">Recent Projects</h3>
                <button
                  onClick={() => router.push("/projects")}
                  className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
                >
                  View All
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-text-muted text-sm">
                    No projects yet. Create your first project to get started.
                  </p>
                  <button
                    onClick={() => {
                      if (orgChecked && !hasOrg) { setShowOrgSetup(true); return; }
                      router.push("/projects/new");
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.slice(0, 4).map((project, index) => (
                    <ProjectCard
                      key={project.id || project._id}
                      project={{ ...project, _id: project.id || project._id || "" }}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar */}
          <aside className="space-y-4">
            <SnapshotWidget />
            <SharedWidget />
          </aside>
        </div>
      </DashboardLayout>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<LogoLoader text="Initializing console..." />}>
      <DashboardContent />
    </Suspense>
  );
}
