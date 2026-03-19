"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Cpu,
  BarChart3,
  FileText,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
  Bot,
  LucideIcon,
} from "lucide-react";
import { useBobAI } from "./BobAIContext";

interface MenuItem {
  name: string;
  icon: LucideIcon;
  path: string;
}

interface SidebarProps {
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

const menuItems: MenuItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Projects", icon: FolderOpen, path: "/projects" },
  { name: "Devices", icon: Cpu, path: "/devices" },
  { name: "Analytics", icon: BarChart3, path: "/analytics" },
  { name: "Reports", icon: FileText, path: "/reports" },
  { name: "Access", icon: Users, path: "/access" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar({ user }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const { isOpen: isBobOpen, toggle: toggleBob } = useBobAI();

  const handleLogout = (): void => {
    if (typeof window !== "undefined") {
      sessionStorage.clear();
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <aside
      className={`relative h-screen flex flex-col bg-white border-r border-border-subtle transition-all duration-300 ${isCollapsed ? "w-[72px]" : "w-[250px]"
        }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border-subtle flex-shrink-0">
        <img
          src="/translogo.png"
          alt="ReFlow Logo"
          className={`object-contain flex-shrink-0 transition-all duration-300 ${isCollapsed ? "w-8 h-8" : "h-10 w-auto max-w-[160px]"}`}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <li key={item.name}>
                <button
                  onClick={() => router.push(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${active
                    ? "bg-primary text-white font-medium"
                    : "text-text-secondary hover:bg-surface-muted"
                    } ${isCollapsed ? "justify-center px-2" : ""}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon
                    className={`w-[18px] h-[18px] flex-shrink-0 ${active ? "text-white" : "text-text-muted group-hover:text-text-secondary"
                      }`}
                  />
                  {!isCollapsed && (
                    <span className="text-[13px]">{item.name}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bob AI Button */}
      <div className="px-3 mb-3">
        <button
          onClick={toggleBob}
          title={isCollapsed ? "Bob AI" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group border ${isBobOpen
              ? "bg-primary border-primary text-white shadow-md"
              : "bg-surface text-text-primary border-border-default hover:border-primary/50 hover:shadow-sm"
            } ${isCollapsed ? "justify-center px-2" : ""}`}
        >
          <div className="relative flex-shrink-0">
            <Bot className={`w-[18px] h-[18px] ${isBobOpen ? "text-white" : "text-primary group-hover:text-primary-hover"}`} />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 ${isBobOpen ? "border-primary bg-white" : "border-white bg-primary animate-pulse"
                }`}
            />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left">
                <p className={`text-[13px] font-semibold leading-none ${isBobOpen ? "text-white" : "text-text-primary"}`}>Bob AI</p>
                <p className={`text-[10px] mt-0.5 leading-none ${isBobOpen ? "text-white/80" : "text-text-muted"}`}>
                  {isBobOpen ? "Panel open" : "Ask anything"}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${isBobOpen ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                AI
              </span>
            </>
          )}
        </button>
      </div>



      {/* User Profile */}
      <div className="px-3 pb-3 border-t border-border-subtle pt-3 flex-shrink-0">
        <div className={`flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-white">
              {user?.name?.charAt(0) || "U"}
            </span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.name || "User"}
              </p>
              <p className="text-[11px] text-text-muted truncate">
                {user?.email || "user@reflow.io"}
              </p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/5 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white shadow-md border border-border-subtle text-text-muted rounded-full flex items-center justify-center hover:bg-surface-muted transition-colors z-10"
      >
        {isCollapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}
