"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getOrganization, createOrganization, saveOrgConfirmed, saveOrgSetupSkipped } from "@/lib/api";
import { Building2, ArrowRight, Loader2, CheckCircle2, X } from "lucide-react";

interface OrganizationSetupProps {
    onComplete: () => void;
}

export default function OrganizationSetup({ onComplete }: OrganizationSetupProps) {
    const [checking, setChecking] = useState(true);
    const [hasOrg, setHasOrg] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Check if user already belongs to an org
        async function checkOrg() {
            // Check session cache first to avoid redundant API calls
            if (typeof window !== "undefined" && sessionStorage.getItem("org_confirmed")) {
                setHasOrg(true);
                onComplete();
                return;
            }
            try {
                const data = await getOrganization();
                // Use HTTP status as the definitive signal:
                // 200 = user is in an org, anything else (404 etc.) = no org
                if (data.ok === true) {
                    saveOrgConfirmed();
                    setHasOrg(true);
                    onComplete();
                    return;
                }
            } catch {
                // Network error — show setup
            } finally {
                setChecking(false);
            }
        }
        checkOrg();
    }, [onComplete]);

    const handleSkip = () => {
        saveOrgSetupSkipped();
        onComplete();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Organization name is required.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const data = await createOrganization(name.trim(), description.trim());
            if (data?.data?.id || data?.data?._id || data?.success || data?.name) {
                saveOrgConfirmed();
                setSuccess(true);
                setTimeout(() => {
                    onComplete();
                }, 1400);
            } else {
                setError(data?.message || data?.error || "Failed to create organization. Please try again.");
            }
        } catch {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Silently skip if checking or already has org
    if (checking || hasOrg) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="org-setup-overlay"
                className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                {/* Backdrop */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-blue-950/80 via-slate-900/80 to-slate-800/80 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />

                {/* Modal card */}
                <motion.div
                    className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 }}
                >
                    {/* Decorative top band */}
                    <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700" />

                    <div className="p-8 sm:p-10">
                        {/* Skip button */}
                        <button
                            onClick={handleSkip}
                            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors p-1"
                            aria-label="Skip"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Icon */}
                        <motion.div
                            className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-6"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
                        >
                            <Building2 className="w-7 h-7 text-blue-600" />
                        </motion.div>

                        {/* Title */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                        >
                            <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                Set up your Organisation
                            </h2>
                            <p className="text-sm text-gray-500 mb-8">
                                Create an organisation to manage projects, devices, and team members under a single workspace.
                            </p>
                        </motion.div>

                        {/* Success state */}
                        {success ? (
                            <motion.div
                                className="flex flex-col items-center justify-center py-8 gap-4"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                </div>
                                <p className="text-lg font-semibold text-gray-800">Organisation Created!</p>
                                <p className="text-sm text-gray-500">Taking you to your dashboard…</p>
                            </motion.div>
                        ) : (
                            <motion.form
                                onSubmit={handleSubmit}
                                className="space-y-5"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                            >
                                {error && (
                                    <motion.div
                                        className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        {error}
                                    </motion.div>
                                )}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Organisation Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                                        placeholder="e.g. Acme Industries"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 bg-gray-50 focus:bg-white text-sm"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Description <span className="text-gray-400 font-normal">(optional)</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Brief description of your organisation…"
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 bg-gray-50 focus:bg-white text-sm resize-none"
                                    />
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading || !name.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-500/20 disabled:shadow-none"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Creating…
                                            </>
                                        ) : (
                                            <>
                                                Create Organisation
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSkip}
                                        className="px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
                                    >
                                        Skip
                                    </button>
                                </div>

                                <p className="text-center text-xs text-gray-400 mt-2">
                                    You can always create or join an organisation later from Settings.
                                </p>
                            </motion.form>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
