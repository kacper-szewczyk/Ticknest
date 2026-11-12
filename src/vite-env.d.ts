/** Application version from package.json, injected at build time by Vite. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Cloud Functions region. Defaults to `europe-west1`; must match `FUNCTIONS_REGION` in `functions/.env`. */
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string
  /** reCAPTCHA Enterprise site key. When set, Firebase App Check is initialized. */
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string
  /** App Check debug token registered in the Firebase console, or `true` to generate one in the console log. */
  readonly VITE_APP_CHECK_DEBUG_TOKEN?: string
  /** `true` shows the demo reset banner and demo accounts. Anything else (or unset) disables demo mode. */
  readonly VITE_DEMO_MODE?: string
  /** With `VITE_DEMO_MODE=true`, `true` replaces the app with a "demo paused" page that makes no Firebase requests. */
  readonly VITE_DEMO_PAUSED?: string
  /** `false` hides Google sign-in, for hosts that are not Firebase authorized domains. Anything else (or unset) keeps it. */
  readonly VITE_GOOGLE_SIGN_IN_ENABLED?: string
  /** `false` hides the budgets feature (My budgets, Budget progress, Budgets). Anything else (or unset) keeps it. */
  readonly VITE_FEATURE_BUDGETS_ENABLED?: string
  /** `true` shows the time-off feature (Time off, Time-off approvals, leave settings). Anything else (or unset) hides it. */
  readonly VITE_FEATURE_TIME_OFF_ENABLED?: string
}
