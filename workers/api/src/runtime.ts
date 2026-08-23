export type AppEnv = Env & {
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  OPENROUTER_KEY?: string;
};
