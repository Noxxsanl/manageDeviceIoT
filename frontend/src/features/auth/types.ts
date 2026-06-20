export type UserRole = "admin" | "operator" | "viewer";

export type User = {
  id: number;
  username: string;
  role: UserRole;
};
