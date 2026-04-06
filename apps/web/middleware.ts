import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api"];

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

  const isAuthenticated = request.cookies.get("eg_auth")?.value === "1";

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
