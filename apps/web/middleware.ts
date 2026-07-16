import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/planes", "/registro", "/pago", "/api"];
const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|txt|xml|webmanifest)$/i;
const OPERATOR_ALLOWED_PREFIXES = ["/", "/campo", "/licencia", "/api", "/_next", "/favicon", "/robots.txt", "/sitemap.xml"];
const READONLY_ALLOWED_PREFIXES = [
  "/",
  "/dashboard",
  "/animals",
  "/traceability",
  "/licencia",
  "/api",
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];
const SUPERVISOR_ALLOWED_PREFIXES = [
  "/",
  "/supervision",
  "/commands",
  "/gestion/tareas",
  "/dashboard",
  "/traceability",
  "/insumos",
  "/health",
  "/licencia",
  "/api",
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];

function getHomePathForRole(role: string | null) {
  if (role === "OPERATOR") return "/campo";
  if (role === "SUPERVISOR") return "/supervision";
  return "/dashboard";
}

function getSessionRoleFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function isAllowedPath(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const BASE_PATH = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";

function stripBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}

function withBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === "/") return BASE_PATH;
  return `${BASE_PATH}${pathname}`;
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function middleware(request: NextRequest) {
  const originalPathname = request.nextUrl.pathname;
  const pathname = stripBasePath(originalPathname);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasLegacyAuth = request.cookies.get("eg_auth")?.value === "1";
  const sessionToken = request.cookies.get("eg_session")?.value;
  const hasSessionAuth = Boolean(sessionToken);
  const isAuthenticated = hasLegacyAuth || hasSessionAuth;

  if (!isAuthenticated && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = withBasePath("/login");
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const sessionRole = getSessionRoleFromToken(sessionToken);

  if (isAuthenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = withBasePath(getHomePathForRole(sessionRole));
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  if (sessionRole === "OPERATOR" && !isAllowedPath(pathname, OPERATOR_ALLOWED_PREFIXES)) {
    const campoUrl = request.nextUrl.clone();
    campoUrl.pathname = withBasePath("/campo");
    campoUrl.search = "";
    return NextResponse.redirect(campoUrl);
  }

  if (sessionRole === "READONLY" && !isAllowedPath(pathname, READONLY_ALLOWED_PREFIXES)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = withBasePath("/dashboard");
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  if (sessionRole === "SUPERVISOR" && !isAllowedPath(pathname, SUPERVISOR_ALLOWED_PREFIXES)) {
    const supervisionUrl = request.nextUrl.clone();
    supervisionUrl.pathname = withBasePath("/supervision");
    supervisionUrl.search = "";
    return NextResponse.redirect(supervisionUrl);
  }

  if (pathname === "/" && (sessionRole === "OPERATOR" || sessionRole === "SUPERVISOR" || sessionRole === "READONLY")) {
    const roleHomeUrl = request.nextUrl.clone();
    roleHomeUrl.pathname = withBasePath(getHomePathForRole(sessionRole));
    roleHomeUrl.search = "";
    return NextResponse.redirect(roleHomeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
