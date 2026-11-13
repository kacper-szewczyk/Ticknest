# Launch kit

Plans and copy for the public launch of Ticknest in English and Polish. Tracked in [#252](https://github.com/kacper-szewczyk/Ticknest/issues/252).

- [Accounts and bios](accounts.md): every channel, what to set up, and the bio text to paste.
- [Launch-day checklist](launch-day-checklist.md): the order of posts on launch day and the exact text for each channel.

## Links used everywhere

| What                  | URL                                          |
| --------------------- | -------------------------------------------- |
| Repository            | https://github.com/kacper-szewczyk/Ticknest  |
| Landing page (EN)     | https://ticknest-landing.vercel.app          |
| Landing page (PL)     | https://ticknest-landing.vercel.app/pl/      |
| Live demo             | https://ticknest-pi.vercel.app               |
| Screenshots (EN / PL) | `docs/screenshots/en`, `docs/screenshots/pl` |

## UTM tags

The landing page counts visits with cookieless analytics (Umami, set up in the [ticknest-landing](https://github.com/kacper-szewczyk/ticknest-landing) repo), so tag every link to it to see which channel brought the visitor. The app and the GitHub repository have no analytics, so tags on demo and repository links do nothing.

Add `?utm_source=<source>&utm_medium=<medium>` and, for launch-day posts, `&utm_campaign=launch`. Use `utm_content` to tell apart several posts on one source, such as subreddits.

| Channel                      | `utm_source`               | `utm_medium`         |
| ---------------------------- | -------------------------- | -------------------- |
| Hacker News                  | `hackernews`               | `social`             |
| Reddit                       | `reddit`                   | `social`             |
| Product Hunt                 | `producthunt`              | `social`             |
| LinkedIn                     | `linkedin`                 | `social` / `profile` |
| X, Bluesky, Mastodon         | `x`, `bluesky`, `mastodon` | `social` / `profile` |
| Wykop                        | `wykop`                    | `social` / `profile` |
| 4programmers.net             | `4programmers`             | `social` / `profile` |
| dev.to, Polish blog          | `devto`, `blog`            | `article`            |
| Indie Hackers                | `indiehackers`             | `social`             |
| README (set in the repo)     | `github`                   | `readme`             |
| Demo sign-in screen (in app) | `demo`                     | `sign-in`            |

Use `profile` for bio and profile links, and `social` for posts. Example: `https://ticknest-landing.vercel.app/pl/?utm_source=wykop&utm_medium=social&utm_campaign=launch`.

## Timeline

Dates are relative to launch day (T-0). Pick a Tuesday, Wednesday or Thursday for T-0.

| When         | What                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-21 or T-14 | Create every account in [accounts.md](accounts.md), add the bio and links. Start the warm-up: comment and help on HN, Reddit, Wykop and 4programmers without linking Ticknest. |
| T-14         | Read the self-promotion rules of each subreddit and forum and note them in the checklist. Create the Product Hunt upcoming page.                                               |
| T-14 to T-1  | One or two build-in-public posts a week on X, Bluesky, Mastodon and LinkedIn (drafts in the checklist).                                                                        |
| T-7          | Write the dev.to and Polish blog articles and save them as drafts. Message the Product Hunt supporters list with the date. Check the demo is healthy.                          |
| T-1          | Re-read every post in the checklist against the current README and landing page. Reset the demo data. Schedule the Product Hunt launch for 00:01 PT.                           |
| T-0          | Follow the [launch-day checklist](launch-day-checklist.md).                                                                                                                    |
| T+1 to T+7   | Answer every comment and issue. Write a short "what we learned" post with the numbers.                                                                                         |

## Ground rules

- Post from your personal accounts, in first person, as the maker.
- Never ask for upvotes, and never send people a direct link to vote. HN, Reddit and Product Hunt all penalise vote rings. Ask for feedback instead.
- Say up front that you made it. Add the disclosure the subreddit or forum asks for.
- Keep every claim in step with the README: the cost estimate is an estimate, and the "What Ticknest doesn't do (yet)" list is part of the pitch.
- Stay around for the first few hours after each post to answer comments.
