"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";
import BobAIPanel from "./BobAIPanel";
import { BobAIProvider, useBobAI } from "./BobAIContext";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

function LayoutInner({
  children,
  title,
  subtitle,
  breadcrumbs,
  user,
}: DashboardLayoutProps) {
  const { isOpen, close, deviceId } = useBobAI();

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden">
      <Sidebar user={user} />
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative"
      >
        <Header title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-y-auto px-6 py-6 bg-background relative z-0">
          {children}
        </main>
        <Footer />
        <BobAIPanel isOpen={isOpen} onClose={close} deviceId={deviceId} />
      </div>
    </div>
  );
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  return (
    <BobAIProvider>
      <LayoutInner {...props} />
    </BobAIProvider>
  );
}

