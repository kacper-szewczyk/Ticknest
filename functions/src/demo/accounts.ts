// The public demo accounts. No Firebase imports, so the web app can import this list for the sign-in screen.

export type DemoAccountRole = 'owner' | 'manager' | 'member'

export type DemoAccount = {
  email: string
  /** Public on purpose: anyone can sign in to the demo with it. */
  password: string
  displayName: string
  /** IANA time zone the account works in; time entries follow its local workday. */
  timezone: string
  role: DemoAccountRole
}

export const DEMO_PASSWORD = 'ticknest-demo'

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'owner@demo.ticknest.app',
    password: DEMO_PASSWORD,
    displayName: 'Olivia Novak',
    timezone: 'Europe/Warsaw',
    role: 'owner',
  },
  {
    email: 'manager@demo.ticknest.app',
    password: DEMO_PASSWORD,
    displayName: 'Maya Okafor',
    timezone: 'Europe/Warsaw',
    role: 'manager',
  },
  {
    email: 'alice@demo.ticknest.app',
    password: DEMO_PASSWORD,
    displayName: 'Alice Moreau',
    timezone: 'Europe/Warsaw',
    role: 'member',
  },
  {
    email: 'ben@demo.ticknest.app',
    password: DEMO_PASSWORD,
    displayName: 'Ben Carter',
    timezone: 'America/New_York',
    role: 'member',
  },
  {
    email: 'chloe@demo.ticknest.app',
    password: DEMO_PASSWORD,
    displayName: 'Chloe Lindqvist',
    timezone: 'Europe/London',
    role: 'member',
  },
]

/** Receives the seeded pending invitation; no account exists for it. */
export const DEMO_INVITEE_EMAIL = 'dana@demo.ticknest.app'
