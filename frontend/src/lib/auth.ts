import type { User } from "@/types/user";

export const AUTH_TOKEN_COOKIE = "auth_token";
export const AUTH_USER_COOKIE = "auth_user";
export const AUTH_USER_STORAGE_KEY = "iot_admin_user";

export const AUTH_ROUTES = {
  login: "/login",
  forgotPassword: "/forgot-password",
  dashboard: "/dashboard",
} as const;

const MOCK_ACCOUNT = {
  username: "admin",
  password: "123456",
} as const;

const MOCK_TOKEN = "mock-iot-admin-token";
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function setCookie(name: string, value: string, maxAge: number) {
  if (!canUseBrowserStorage()) return;

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

function getCookie(name: string) {
  if (!canUseBrowserStorage()) return null;

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function deleteCookie(name: string) {
  setCookie(name, "", 0);
}

export async function login(username: string, password: string, remember = false): Promise<User> {
  const normalizedUsername = username.trim();

  if (!normalizedUsername || !password) {
    throw new Error("Username and password are required.");
  }

  if (normalizedUsername !== MOCK_ACCOUNT.username || password !== MOCK_ACCOUNT.password) {
    throw new Error("Invalid username or password.");
  }

  const user: User = { username: normalizedUsername };
  const maxAge = remember ? ONE_WEEK_SECONDS : 60 * 60 * 8;

  setCookie(AUTH_TOKEN_COOKIE, MOCK_TOKEN, maxAge);
  setCookie(AUTH_USER_COOKIE, JSON.stringify(user), maxAge);

  if (canUseBrowserStorage()) {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  }

  return user;
}

export function logout() {
  deleteCookie(AUTH_TOKEN_COOKIE);
  deleteCookie(AUTH_USER_COOKIE);

  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }
}

export function isAuthenticated() {
  return Boolean(getCookie(AUTH_TOKEN_COOKIE));
}

export function getUser(): User | null {
  if (!canUseBrowserStorage()) return null;

  const cookieUser = getCookie(AUTH_USER_COOKIE);
  const storedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
  const rawUser = cookieUser ?? storedUser;

  if (!rawUser) return null;

  try {
    const parsedUser = JSON.parse(rawUser) as User;
    return parsedUser?.username ? { username: parsedUser.username } : null;
  } catch {
    logout();
    return null;
  }
}
