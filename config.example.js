// DYSON 9 configuration.
// Only the publishable (anon) key belongs in this file. NEVER put a secret / service_role key here.
window.DYSON_CONFIG = {
  VERSION: '9.0',
  SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_YOUR_KEY',

  // Phone sign-in maps a phone number to <digits>@AUTH_DOMAIN (password based, no SMS).
  AUTH_DOMAIN: 'gmail.com',

  // OPTIONAL ----------------------------------------------------------------
  // Calls & Dyson Live use STUN by default. For users behind strict NATs / mobile carriers
  // add a TURN server (e.g. from Twilio, Metered, Cloudflare or your own coturn):
  // ICE_SERVERS: [
  //   { urls: 'stun:stun.l.google.com:19302' },
  //   { urls: 'turn:YOUR_TURN_HOST:3478', username: 'USER', credential: 'PASS' }
  // ],

  // Point the AI Assistant at your own endpoint (see edge-function-ai.ts) for open-ended LLM answers.
  // AI_ENDPOINT: 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/dyson-ai',

  // Shown in Help & Support:
  // SUPPORT_EMAIL: 'support@example.com',
};
