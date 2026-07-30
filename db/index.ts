import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Start the app with the configured local Cloudflare runtime."
    );
  }

  return drizzle(env.DB, { schema });
}

export type AppDatabase = ReturnType<typeof getDb>;
export { schema };
