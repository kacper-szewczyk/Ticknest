// When the public demo resets. No Firebase imports, so the web app can show the next reset time.

/** IANA time zone the reset schedule is evaluated in. */
export const DEMO_RESET_TIME_ZONE = 'Europe/Warsaw'
/** Local hour (0-23) of the daily reset, in DEMO_RESET_TIME_ZONE. */
export const DEMO_RESET_HOUR = 3
/** Cloud Scheduler cron expression for the daily reset. */
export const DEMO_RESET_SCHEDULE = `0 ${DEMO_RESET_HOUR} * * *`
