import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api"];

// Routes restricted to ADMIN / OWNER
const MANAGER_ONLY_ROUTES = ["/traceability/dashboard", "/admin"];
// Routes restricted to OPERATOR, ADMIN, OWNER (not READONLY)
const OPERATOR_ONLY_ROUTES = ["/campo"];

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const BASE_PATH = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";

function stripBasePath(pathname: string): string {
  if (!BASE_PATH) {
    return pathname;
  }

  if (pathname === BASE_PATH) {
    return "/";
  }

  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length);
  }

  return pathname;
}

function withBasePath(pathname: string): string {
  if (!BASE_PATH) {
    return pathname;
  }

  if (pathname === "/") {
    return BASE_PATH;
  }

  return `${BASE_PATH}${pathname}`;
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isManagerOnlyRoute(pathname: string) {
  return MANAGER_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isOperatorOnlyRoute(pathname: string) {
  return OPERATOR_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function redirectWithDenied(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone();
  url.pathname = withBasePath("/dashboard");
  url.search = "";
  url.searchParams.set("denied", reason);
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const originalPathname = request.nextUrl.pathname;
  const pathname = stripBasePath(originalPathname);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  ) {
    return NextResponse.next();
  }

  const hasLegacyAuth = request.cookies.get("eg_auth")?.value === "1";
  const hasSessionAuth = Boolean(request.cookies.get("eg_session")?.value);
  const isAuthenticated = hasLegacyAuth || hasSessionAuth;

  if (!isAuthenticated && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = withBasePath("/login");
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = withBasePath("/dashboard");
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // Role-based access control.
  // Only enforced when using session auth + eg_role cookie is present.
  // Legacy eg_auth=1 users bypass role checks (treated as OWNER).
  if (isAuthenticated && hasSessionAuth && !hasLegacyAuth) {
    const role = request.cookies.get("eg_role")?.value ?? "";

    // Only restrict when we have a known role (backward-compat: empty role = pass through).
    if (role) {
      const isManager = role === "OWNER" || role === "ADMIN";
      const isOperatorOrAbove = isManager || role === "OPERATOR";

      if (isManagerOnlyRoute(pathname) && !isManager) {
        return redirectWithDenied(request, "manager");
      }

      if (isOperatorOnlyRoute(pathname) && !isOperatorOrAbove) {
        return redirectWithDenied(request, "operator");
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
