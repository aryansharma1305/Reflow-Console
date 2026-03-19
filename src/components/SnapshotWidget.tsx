"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Shield } from "lucide-react";

const barData = [
    { height: 45, color: "bg-primary/30" },
    { height: 70, color: "bg-primary/50" },
    { height: 55, color: "bg-primary/40" },
    { height: 90, color: "bg-primary" },
    { height: 65, color: "bg-primary/50" },
    { height: 80, color: "bg-primary/70" },
    { height: 50, color: "bg-primary/40" },
    { height: 35, color: "bg-primary/25" },
];

export default function SnapshotWidget() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl bg-white border border-border-subtle p-5"
        >
            <h3 className="text-sm font-bold text-text-primary mb-4">
                Today&apos;s Snapshot
            </h3>

            {/* Usage Load Bar Chart */}
            <div className="mb-5">
                <p className="text-xs text-text-muted mb-3">Usage Load</p>
                <div className="flex items-end gap-2 h-24">
                    {barData.map((bar, i) => (
                        <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: `${bar.height}%` }}
                            transition={{ duration: 0.5, delay: 0.4 + i * 0.05 }}
                            className={`flex-1 ${bar.color} rounded-t-md`}
                        />
                    ))}
                </div>
            </div>

            {/* System Status */}
            <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="text-sm text-text-primary font-medium">System Status</span>
                </div>
                <span className="text-sm font-semibold text-success">Optimal</span>
            </div>

            {/* Alerts Resolved */}
            <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-text-muted" />
                    <span className="text-sm text-text-primary font-medium">Alerts Resolved</span>
                </div>
                <span className="text-sm font-bold text-text-primary">3</span>
            </div>
        </motion.div>
    );
}
