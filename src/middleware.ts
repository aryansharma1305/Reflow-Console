import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define which routes require authentication
const PROTECTED_ROUTES = [
  "/analytics",
  "/devices",
  "/projects",
  "/reports",
  "/settings",
  "/access",
  "/shared",
];

// Routes that should NOT redirect to login
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/register",
  "/verify-otp",
  "/forgot-password",
  "/",
];

/**
 * Middleware to protect routes and require authentication
 * Run before any route handler
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get auth token from cookie or Authorization header
  const tokenFromCookie = request.cookies.get("auth_token")?.value;
  const tokenFromHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  const token = tokenFromCookie || tokenFromHeader;
  
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Log for debugging
  console.log(`[Middleware] Path: ${pathname}, Token: ${token ? "✓" : "✗"}, Protected: ${isProtectedRoute}, Public: ${isPublicRoute}`);

  // ── Allow public routes without auth ──
  if (isPublicRoute) {
    // If already authenticated and trying to access auth pages, redirect to dashboard
    if (token && (pathname === "/login" || pathname === "/signup" || pathname === "/register")) {
      console.log(`[Middleware] Authenticated user at auth page, redirecting to dashboard`);
      return NextResponse.redirect(new URL("/", request.url));
    }
    console.log(`[Middleware] Allowing public route: ${pathname}`);
    return NextResponse.next();
  }

  // ── Protect authenticated routes ──
  if (isProtectedRoute) {
    // No token = not authenticated, redirect to login
    if (!token) {
      console.log(`[Middleware] No token found for route: ${pathname}, redirecting to login`);
      return NextResponse.redirect(new URL("/login", request.url));
    }
    
    // Token exists, allow access (org setup can be handled by individual pages/components)
    console.log(`[Middleware] Token found for route: ${pathname}, allowing access`);
  }

  return NextResponse.next();
}

/**
 * Configure which routes the middleware applies to
 * This prevents running middleware on static assets, api routes, etc.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
