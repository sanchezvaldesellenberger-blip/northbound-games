import { createHandler } from "./handler.mjs";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const publicKeys = JSON.parse(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}",
);
Deno.serve(
  createHandler({
    url: Deno.env.get("SUPABASE_URL") || "",
    secretKey: secretKeys.default || "",
    publishableKeys: Object.values(publicKeys),
  }),
);
