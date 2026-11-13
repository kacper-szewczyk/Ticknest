# Launch-day checklist

The order of posts on launch day (T-0) and the exact text for each channel. Re-read every post on T-1 and check it still matches the README and the landing page.

Times are in Polish time (CET/CEST). Spread the posts out so you can answer comments on each one.

## Before you start

- [ ] Demo is up, the sample accounts sign in, and the data was reset in the last 24 hours.
- [ ] README, landing page and latest release are current.
- [ ] Issue templates and the discussion board (if used) are ready for feedback.
- [ ] Notifications on for GitHub issues and every channel below.

## Order

| Time (PL)   | Channel                        | Language |
| ----------- | ------------------------------ | -------- |
| 09:01       | Product Hunt (00:01 PT)        | EN       |
| 09:30       | Wykop                          | PL       |
| 10:00       | 4programmers.net               | PL       |
| 10:30       | LinkedIn (PL post)             | PL       |
| 12:00       | Polish blog article            | PL       |
| 15:00       | Hacker News (Show HN)          | EN       |
| 15:15       | X, Bluesky, Mastodon           | EN       |
| 15:30       | LinkedIn (EN post)             | EN       |
| 16:00       | dev.to article, Indie Hackers  | EN       |
| 17:00–19:00 | Reddit, one subreddit per hour | EN       |

If a subreddit's rules allow only one self-promotion post, or need a specific day, follow the rules over this table. Post r/freelance on a later day if the main launch is busy.

- [ ] Product Hunt
- [ ] Wykop
- [ ] 4programmers.net
- [ ] LinkedIn (PL)
- [ ] Polish blog article
- [ ] Hacker News
- [ ] X
- [ ] Bluesky
- [ ] Mastodon
- [ ] LinkedIn (EN)
- [ ] dev.to
- [ ] Indie Hackers
- [ ] r/selfhosted
- [ ] r/opensource
- [ ] r/SideProject
- [ ] r/freelance

## Product Hunt

**Name:** Ticknest

**Tagline (60 characters max):** Open-source time tracking for teams, in your own Firebase

**Description:**

> Ticknest is an open-source time tracker for small teams. It covers the core of a hosted tracker (timer, timesheet, clients, projects and tasks, reports with CSV and PDF export, team roles and optional budgets), but it runs in a Firebase project you own.
>
> No seat fees, no screenshots or activity monitoring, and no analytics in the app. For a team of 5 to 25 people, the measured usage usually stays within Firebase's no-cost quotas. MIT licensed. Interface in English, Spanish and Polish.

**Maker's first comment:**

> Hi everyone, I'm Kacper, and I built Ticknest.
>
> I wanted a time tracker for a small team where the data lives in our own cloud project and the bill doesn't grow with every person we add. Ticknest is the result: a React app on top of Firebase (Auth, Firestore and Cloud Functions), which you deploy to Vercel or Firebase Hosting with a step-by-step guide in the README.
>
> What it doesn't do yet: integrations, a public API, invoicing and a native mobile app.
>
> The live demo has sample accounts on the sign-in screen: https://ticknest-pi.vercel.app
>
> I'd love to hear what's missing for your team, and what would stop you from self-hosting it.

## Hacker News

**Title:** Show HN: Ticknest – open-source time tracker for small teams, on your own Firebase

**URL:** https://github.com/kacper-szewczyk/Ticknest

**First comment (post it right after submitting):**

> Hi HN, I built Ticknest, a time tracker for small teams that runs in a Firebase project you own.
>
> Why: hosted trackers charge per seat and keep your team's data on their servers. I wanted the core features (timer, timesheet, reports with CSV/PDF export, roles, budgets) with the data in my own project and no per-person pricing.
>
> How it works: a React + TypeScript single-page app, Firebase Auth, Firestore with security rules that enforce workspace roles, and a few Cloud Functions for invites and stopping timers at midnight. PDF export runs in the browser. There is no backend run by me, and no analytics or telemetry in the app.
>
> Cost: Firebase needs the Blaze plan for Functions, but I measured a workday of 5 and 25 people against the emulators and both stay within the no-cost quotas (the method and numbers are in docs/operations.md). That's an estimate, not a promise.
>
> What it doesn't do yet: integrations, a public API, invoicing, a native mobile app.
>
> Demo with sample accounts: https://ticknest-pi.vercel.app (resets every 24 hours).
>
> I'd especially like feedback on the Firestore rules and on the self-hosting steps.

## Reddit

Use the flair each subreddit asks for and add any disclosure its rules require. Answer every comment.

### r/selfhosted

**Title:** I made Ticknest, an open-source time tracker for small teams that runs in your own Firebase project

> Hi r/selfhosted, I'm the developer of Ticknest.
>
> Honest note first: it isn't self-hosted in the "runs on my box" sense. It runs in a Firebase project you own (Auth, Firestore, Cloud Functions), with the web app on Vercel or Firebase Hosting. So you own the data and the bill, but Google runs the servers. You can run all of it locally against the Firebase emulators.
>
> What it does: timer, timesheet, clients/projects/tasks, reports with CSV and PDF export, Owner/Manager/Member roles, optional budgets. No seat fees, no activity monitoring, no telemetry. MIT licensed.
>
> Repo: https://github.com/kacper-szewczyk/Ticknest
> Demo: https://ticknest-pi.vercel.app
>
> Would a Docker version with a self-hosted backend be something you'd use? I'm trying to figure out if that's worth building next.

### r/opensource

**Title:** Ticknest: an MIT-licensed time tracker for small teams, built on Firebase

> I've just released Ticknest, an open-source alternative to hosted time trackers for small teams. It runs in a Firebase project you own, so there's no seat fee and no third party holding your data.
>
> Features: timer, timesheet, reports with CSV/PDF export, team roles, budgets, and an interface in English, Spanish and Polish.
>
> It's React + TypeScript with Firestore security rules tested against the emulators, and contributions are welcome. There are issues labelled "good first issue".
>
> Repo: https://github.com/kacper-szewczyk/Ticknest
> Demo: https://ticknest-pi.vercel.app

### r/SideProject

**Title:** I built an open-source time tracker for small teams with no seat fees

> Ticknest started because I didn't want to pay per person to track time for a small team, or keep that data with someone else. It's now a full time tracker: timer, timesheet, reports with CSV/PDF export, roles and budgets, running in your own Firebase project.
>
> Stack: React, TypeScript, Firebase (Auth, Firestore, Functions), Vercel. MIT licensed.
>
> Demo with sample accounts: https://ticknest-pi.vercel.app
> Repo: https://github.com/kacper-szewczyk/Ticknest
>
> Feedback on the onboarding and the landing page is very welcome: https://ticknest-landing.vercel.app

### r/freelance

Check the rules first: many freelance subreddits don't allow tool promotion at all. If they don't, skip this post and answer questions about time tracking in comments instead, mentioning Ticknest only where it really fits.

**Title:** I made a free, open-source time tracker. What would you need from it as a freelancer?

> I'm the developer of Ticknest, an open-source time tracker built for small teams that also works for one person. It has a timer, a timesheet, clients/projects/tasks and reports you can export to CSV or PDF for a client.
>
> It runs in your own Firebase project, so the data is yours and, at freelancer scale, it costs nothing to run. It doesn't do invoicing or billable rates yet.
>
> Demo: https://ticknest-pi.vercel.app
>
> What would you need before switching from your current tracker? Billable rates and invoices are on my list; I'd like to know what else matters.

## X, Bluesky and Mastodon

**Launch post (fits 280 characters):**

> Ticknest is out: an open-source time tracker for small teams that runs in your own Firebase project.
>
> Timer, timesheet, reports with CSV/PDF, roles, budgets. No seat fees, no monitoring. MIT.
>
> Demo: https://ticknest-pi.vercel.app
> Repo: https://github.com/kacper-szewczyk/Ticknest

Attach `docs/screenshots/en/timer.gif`. Pin the post. On Mastodon add `#opensource #firebase #timetracking`.

**Follow-up thread (replies to the launch post):**

1. > Why: I wanted the data in a cloud project I own, and a bill that doesn't grow with each new person.
2. > How: React + TypeScript, Firebase Auth, Firestore security rules for workspace roles, Cloud Functions for invites and midnight auto-stop. PDF export runs in the browser.
3. > Cost: I measured a workday of 5 and 25 people against the emulators. Both stay within Firebase's no-cost quotas. Method in the docs.
4. > Not there yet: integrations, a public API, invoicing. What should come first?

**Build-in-public posts for T-14 to T-1 (pick one or two a week):**

- > Working on an open-source time tracker for small teams. The rule I set myself: no screenshots, no activity tracking, no telemetry. It records the time people enter, and that's it.
- > Measured what a 25-person team would cost on Firebase by replaying a workday against the emulators. About 37% of the free daily Firestore reads. Writing it up next.
- > Ticknest now has a team time-off calendar, and budget targets drop on approved leave. Small thing, but it's what made the budgets feel fair.
- > Added Polish and Spanish to the interface. Launching soon in English and Polish.

## LinkedIn

### EN

> I've just launched Ticknest, an open-source time tracker for small teams.
>
> Most time trackers charge per person and keep your team's data on their servers. Ticknest runs in a Firebase project you own instead: no seat fees, no screenshots or activity monitoring, and no analytics in the app.
>
> It covers the core: a timer, a timesheet, clients, projects and tasks, reports with CSV and PDF export, team roles and optional budgets. For a team of 5 to 25 people, the measured usage usually stays within Firebase's free quotas.
>
> It's MIT licensed, built with React, TypeScript and Firebase, with an interface in English, Spanish and Polish.
>
> Try the demo: https://ticknest-pi.vercel.app
> Code: https://github.com/kacper-szewczyk/Ticknest
>
> If your team tracks time, I'd like to hear what would make you switch, or what would stop you.
>
> #opensource #timetracking #firebase #react

### PL

> Właśnie wypuściłem Ticknest, otwartoźródłowy tracker czasu pracy dla małych zespołów.
>
> Większość trackerów pobiera opłatę za każdą osobę i trzyma dane zespołu na swoich serwerach. Ticknest działa w Twoim własnym projekcie Firebase: bez opłat za użytkownika, bez zrzutów ekranu i monitorowania aktywności, bez analityki w aplikacji.
>
> Ma to, co najważniejsze: timer, kartę czasu pracy, klientów, projekty i zadania, raporty z eksportem do CSV i PDF, role w zespole i opcjonalne budżety. Dla zespołu od 5 do 25 osób zmierzone zużycie zwykle mieści się w darmowych limitach Firebase.
>
> Licencja MIT, React, TypeScript i Firebase, interfejs po polsku, angielsku i hiszpańsku.
>
> Demo: https://ticknest-pi.vercel.app
> Kod: https://github.com/kacper-szewczyk/Ticknest
> Strona projektu: https://ticknest-landing.vercel.app/pl/
>
> Jeśli Twój zespół mierzy czas pracy, chętnie usłyszę, czego brakuje, żebyś się przesiadł(a).
>
> #opensource #programowanie #firebase #react

## Wykop

Add it as a link to the PL landing page (or the repository, if the rules prefer it), and say in the description that it's your project.

**Title:** Zrobiłem otwartoźródłowy tracker czasu pracy dla małych zespołów, działający w Twoim Firebase

**Description:**

> Ticknest to darmowy, otwartoźródłowy (MIT) tracker czasu: timer, karta czasu, raporty z eksportem do CSV i PDF, role w zespole i budżety. Działa w Twoim własnym projekcie Firebase, więc dane są Twoje i nie płacisz za każdego użytkownika. Interfejs po polsku. Jestem autorem, chętnie odpowiem na pytania.

**Tags:** #programowanie #opensource #webdev #firebase #javascript

## 4programmers.net

Post in the forum section for your own projects.

**Title:** Ticknest – otwartoźródłowy tracker czasu pracy (React, TypeScript, Firebase)

> Cześć, chciałbym pokazać projekt, nad którym ostatnio pracuję.
>
> Ticknest to tracker czasu pracy dla małych zespołów, na licencji MIT. Działa w projekcie Firebase należącym do użytkownika, więc nie ma opłat za osobę ani zewnętrznego serwisu, który trzyma dane.
>
> Funkcje: timer w nagłówku, karta czasu pogrupowana po dniach, klienci, projekty i zadania, raporty z eksportem do CSV i PDF (generowanym w przeglądarce), role Owner/Manager/Member, opcjonalne budżety i kalendarz urlopów. Interfejs po polsku, angielsku i hiszpańsku.
>
> Technicznie: React + TypeScript, Firebase Auth, Firestore z regułami bezpieczeństwa testowanymi na emulatorach, Cloud Functions do zaproszeń i zatrzymywania timerów o północy, testy jednostkowe i e2e w Playwright.
>
> Demo (konta przykładowe na ekranie logowania): https://ticknest-pi.vercel.app
> Kod: https://github.com/kacper-szewczyk/Ticknest
>
> Chętnie przyjmę uwagi do kodu, szczególnie do reguł Firestore i struktury danych.

## Articles

Write these by T-7 and publish them on T-0. Link each from its channel's posts.

### dev.to (EN)

**Title:** I built an open-source time tracker on Firebase. Here's what it costs to run

**Outline:**

1. Why: seat fees, data ownership, no monitoring.
2. What Ticknest does, with the screenshots from `docs/screenshots/en`.
3. Architecture: React SPA, Firebase Auth, Firestore rules for roles, Cloud Functions.
4. Measuring the cost: replaying a workday against the emulators, the 5- and 25-person numbers, and the caveats.
5. What's missing and where help is welcome.
6. Links: demo, repo, landing page.

**Tags:** `opensource`, `firebase`, `react`, `showdev`

### Polish blog article (PL)

**Title:** Zbudowałem otwartoźródłowy tracker czasu pracy na Firebase. Ile kosztuje jego utrzymanie?

Same outline as the dev.to article, using `docs/screenshots/pl` and the PL landing page.

## Indie Hackers

**Post title:** Launching Ticknest: an open-source time tracker with no seat fees

> Today I launched Ticknest, an open-source time tracker for small teams that runs in the customer's own Firebase project.
>
> The bet: small teams would rather own their data and pay Firebase's usage costs (usually $0 at 5 to 25 people) than pay a per-seat subscription. The code is MIT licensed; the project is funded by donations and paid help with setup and custom features.
>
> Demo: https://ticknest-pi.vercel.app
> Landing page: https://ticknest-landing.vercel.app
>
> I'll share the launch numbers (stars, demo sign-ins, deployments) in a week. What would you track to tell whether an open-source launch worked?

## After launch

- [ ] Answer every comment on each channel in the first 24 hours.
- [ ] Turn repeated questions into README or docs updates.
- [ ] Open issues for the feature requests that came up more than once.
- [ ] On T+7, post a short follow-up with the numbers on Indie Hackers, LinkedIn and X/Bluesky/Mastodon.
