/** Application version from package.json, injected at build time by Vite. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** reCAPTCHA Enterprise site key. When set, Firebase App Check is initialized. */
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string
  /** App Check debug token registered in the Firebase console, or `true` to generate one in the console log. */
  readonly VITE_APP_CHECK_DEBUG_TOKEN?: string
}
