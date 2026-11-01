/** Application version from package.json, injected at build time by Vite. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Cloud Functions region. Defaults to `europe-west1`; must match `FUNCTIONS_REGION` in `functions/.env`. */
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string
  /** reCAPTCHA Enterprise site key. When set, Firebase App Check is initialized. */
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string
  /** App Check debug token registered in the Firebase console, or `true` to generate one in the console log. */
  readonly VITE_APP_CHECK_DEBUG_TOKEN?: string
}
