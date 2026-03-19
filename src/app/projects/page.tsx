"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import ProjectCard from "@/components/ProjectCard";
import LogoLoader from "@/components/LogoLoader";
import {
  getAllProjects,
  getUserEmail,
  getUserName,
  isAuthenticated,
  getProjectDevices,
} from "@/lib/api";
import { useOrgGuard } from "@/lib/useOrgGuard";
import OrganizationSetup from "@/components/OrganizationSetup";
import { Plus, ArrowRight } from "lucide-react";

interface Project {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  devices?: { serial_no?: string; name?: string }[];
  owner?: string;
  status?: string;
  createdBy?: { name?: string; email?: string };
  members?: { user?: { email?: string; name?: string }; role?: string }[];
  updatedAt?: string;
}


export default function ProjectsPage() {
  const router = useRouter();
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showOrgSetup, setShowOrgSetup] = useState(false);

  const { hasOrg, orgChecked } = useOrgGuard();

  const email = getUserEmail();
  const fullName = getUserName();

  useEffect(() => {
    async function fetchProjects() {
      if (!isAuthenticated()) {
        router.push("/login");
        return;
      }

      try {
        const data = await getAllProjects();
        const projectList = data?.data?.projects || data?.projects || [];
        const userEmail = getUserEmail();

        // Fetch devices for each project to make the count dynamic
        const projectsWithDevices = await Promise.all(
          projectList.map(async (p: Project) => {
            try {
              const projId = p.id || p._id;
              if (projId) {
                const devsData = await getProjectDevices(projId);
                const devs = devsData?.data?.devices || devsData?.devices || [];
                return { ...p, devices: devs };
              }
            } catch (err) {
              console.error(`Failed to fetch devices for project ${p.id || p._id}`, err);
            }
            return p;
          })
        );

        // Separate owned vs shared
        const owned = projectsWithDevices.filter(
          (p: Project) => p.createdBy?.email === userEmail
        );
        const shared = projectsWithDevices.filter(
          (p: Project) => p.createdBy?.email !== userEmail
        );

        setOwnProjects(owned.length > 0 ? owned : projectsWithDevices);
        setSharedProjects(shared);
        setError(null);
      } catch (err) {
        console.error("Error fetching projects:", err);
        setError("Could not connect to backend. Please check your connection.");
        setOwnProjects([]);
        setSharedProjects([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  if (loading) {
    return <LogoLoader text="Loading your projects..." />;
  }

  // Show org setup modal when triggered
  if (showOrgSetup) {
    return (
      <OrganizationSetup
        onComplete={() => {
          setShowOrgSetup(false);
          window.location.reload();
        }}
      />
    );
  }

  return (
    <DashboardLayout
      title="My Projects"
      breadcrumbs={[
        { label: "Workspace", href: "/" },
        { label: "Projects" },
      ]}
      user={{ name: fullName || "", email: email || "" }}
    >
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h2 className="text-2xl font-bold text-text-primary">My Projects</h2>
            <p className="text-sm text-text-muted mt-1">
              Manage your IoT deployments and configure device groups.
            </p>
            {error && (
              <p className="text-xs text-amber-600 mt-1">⚠ {error}</p>
            )}
          </div>
          <button
            onClick={() => {
              if (orgChecked && !hasOrg) {
                setShowOrgSetup(true);
              } else {
                router.push("/projects/new");
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </motion.div>

        {/* Owned Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-text-primary">Owned Projects</h3>
              <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                {ownProjects.length}
              </span>
            </div>
            <button className="text-xs font-medium text-primary hover:text-primary-hover transition-colors inline-flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {ownProjects.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-text-muted text-sm">No projects yet. Create your first project!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownProjects.map((project, index) => (
                <ProjectCard
                  key={project.id || project._id}
                  project={{ ...project, _id: project.id || project._id || "" }}
                  index={index}
                  variant="horizontal"
                />
              ))}
            </div>
          )}
        </section>

        {/* Shared with you */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-base font-bold text-text-primary">Shared with you</h3>
            <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
              {sharedProjects.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sharedProjects.map((project, index) => (
              <ProjectCard
                key={project.id || project._id}
                project={{
                  ...project,
                  _id: project.id || project._id || "",
                  owner: project.createdBy?.name || project.owner || "Unknown",
                }}
                index={index}
                isShared
              />
            ))}

            {/* Create New Project Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              onClick={() => router.push("/projects/new")}
              className="rounded-xl p-5 bg-white border-2 border-dashed border-border-default hover:border-primary/40 cursor-pointer flex flex-col items-center justify-center min-h-[180px] transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-muted flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                <Plus className="w-6 h-6 text-text-muted group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Create New Project</p>
              <p className="text-xs text-text-muted mt-1">Start a new IoT deployment</p>
            </motion.div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
