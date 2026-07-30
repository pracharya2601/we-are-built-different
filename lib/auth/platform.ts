import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getDb } from "../../db";
import {
  bootstrapPlatformOwnerFromVerifiedIdentity,
  isPlatformOwner,
} from "../data";
import { requireAuthContext } from "./context";
import { AuthError, type AuthContext } from "./types";

export async function requirePlatformOwner(
  request?: Request,
): Promise<AuthContext> {
  const auth = await requireAuthContext(request);
  await bootstrapPlatformOwnerFromVerifiedIdentity(getDb(), auth.userId);
  if (!(await isPlatformOwner(getDb(), auth.userId))) {
    throw new AuthError(
      "platform_owner_required",
      "Active platform-owner access is required.",
      403,
    );
  }
  return auth;
}

export async function PlatformOwnerGuard({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requirePlatformOwner();
    return children;
  } catch (error) {
    if (
      error instanceof AuthError &&
      error.code === "authentication_required"
    ) {
      redirect(
        `/api/auth/login?returnTo=${encodeURIComponent("/dashboard/admin/calls")}`,
      );
    }
    if (error instanceof AuthError && error.status === 403) {
      redirect("/auth/forbidden");
    }
    throw error;
  }
}
