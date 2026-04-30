import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api"];
const OPERATOR_ALLOWED_PREFIXES = ["/", "/campo", "/api", "/_next", "/favicon", "/robots.txt", "/sitemap.xml"];

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

function isOperatorAllowedPath(pathname: string) {
  return OPERATOR_ALLOWED_PREFIXES.some((prefix) => {
    if (prefix === "/") {
      return pathname === "/";
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

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

  const sessionRole = getSessionRoleFromToken(request.cookies.get("eg_session")?.value);
  if (sessionRole === "OPERATOR" && !isOperatorAllowedPath(pathname)) {
    const campoUrl = request.nextUrl.clone();
    campoUrl.pathname = withBasePath("/campo");
    campoUrl.search = "";
    return NextResponse.redirect(campoUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
