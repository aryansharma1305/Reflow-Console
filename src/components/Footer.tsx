"use client";

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-border-subtle bg-surface px-8 py-4 flex items-center justify-between text-xs text-text-muted">
            <p>© {year} ReFlow IoT Systems. All rights reserved.</p>
            <div className="flex items-center gap-6">
                <a href="#" className="hover:text-text-primary transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-text-primary transition-colors">Privacy Policy</a>
            </div>
        </footer>
    );
}
