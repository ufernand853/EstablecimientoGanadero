export type SessionRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";

export const getHomePathForRole = (role?: string | null) => {
  if (role === "OPERATOR") return "/campo";
  if (role === "SUPERVISOR") return "/supervision";
  return "/dashboard";
};

export const canSeeLink = (role: string | null, pathname: string) => {
  if (role === "OPERATOR") return pathname === "/" || pathname === "/campo";
  if (role === "SUPERVISOR") {
    return [
      "/",
      "/supervision",
      "/commands",
      "/gestion/tareas",
      "/dashboard",
      "/traceability",
      "/traceability/dashboard",
      "/insumos",
      "/health",
    ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return true;
};
