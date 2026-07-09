export type SessionRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";

export const getHomePathForRole = (role?: string | null) => {
  return "/dashboard";
};

export const canSeeLink = (role: string | null, pathname: string) => {
  return true;
};
