export type SessionRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";

export const getHomePathForRole = (role?: string | null) => {
  if (role === "OPERATOR") return "/campo";
  if (role === "SUPERVISOR") return "/supervision";
  return "/dashboard";
};

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });

export const canSeeLink = (role: string | null, pathname: string) => {
  if (!role) return false;

  const adminOnlyPrefixes = ["/admin/users", "/admin/planes", "/admin/ai-settings"];
  if (matchesPrefix(pathname, adminOnlyPrefixes)) {
    return role === "OWNER" || role === "ADMIN";
  }

  if (role === "READONLY") {
    return matchesPrefix(pathname, ["/", "/dashboard", "/animals", "/traceability", "/licencia"]);
  }

  if (role === "OPERATOR") {
    return matchesPrefix(pathname, ["/", "/campo", "/licencia"]);
  }

  if (role === "SUPERVISOR") {
    return matchesPrefix(pathname, ["/", "/supervision", "/commands", "/gestion/tareas", "/dashboard", "/traceability", "/insumos", "/health", "/licencia"]);
  }

  return true;
};
