const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

export const BASE_PATH = rawBasePath
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

export function withBasePath(pathname: string): string {
  if (!pathname.startsWith("/")) {
    throw new Error(`Expected an absolute pathname, received: ${pathname}`);
  }

  if (!BASE_PATH) {
    return pathname;
  }

  if (pathname === "/") {
    return BASE_PATH;
  }

  return `${BASE_PATH}${pathname}`;
}
