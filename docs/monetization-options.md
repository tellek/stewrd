# Monetization Options For Stewrd

Context: solo developer, side project, Tauri desktop app with a plugin system. Goal is to earn some money while keeping the source public and buildable by anyone.

Current state worth knowing before anything else: **there is no `LICENSE` file in the repo.** With no license, the code is technically "all rights reserved" — nobody may legally use or redistribute it. Whatever path you pick, step one is adding an explicit license. That choice constrains several of the options below, so read Section 8 first if you're short on time.

---

## 1. Paid Pre-Built Binaries ("Pay For Convenience")

Source is public and anyone can compile it. You sell signed, notarized, auto-updating installers. The canonical example is **Aseprite** ($19.99 one-time, source on GitHub, EULA forbids redistributing binaries) — a genuinely successful one-person-scale product. **Ardour** (DAW, GPL) does the same with a pay-what-you-want floor and gates binaries + updates behind it.

Note the honest caveat: Aseprite is *not* OSI open source anymore — it moved from GPLv2 to a custom EULA precisely to stop people redistributing the binaries. If you stay GPL, anyone who buys a binary may legally re-upload it (Ardour accepts this and relies on goodwill + update access as the real product).

- **Pros:** No feature crippling — the free and paid product are identical, which avoids the resentment open-core generates. Very aligned with a plugin app where the "product" is the shell. Windows code signing plus auto-update is real work a user genuinely doesn't want to do.
- **Cons:** Needs a store, license key issuance, and an update server. Code-signing certificates cost ~$200-500/yr (OV/EV), Apple Developer $99/yr. Conversion is low when building is easy — and Stewrd builds with `npm` + `cargo`, which is easy for your likely audience (developers).
- **Effort:** Medium. A week or two: Lemon Squeezy / Paddle / Gumroad for checkout and tax handling (merchant-of-record so you don't handle VAT), plus a signed release pipeline.
- **Realistic revenue:** $0-300/mo for a niche dev tool with a small audience. Aseprite-scale ($1M+) came from a large non-technical audience (pixel artists) who couldn't compile. Stewrd's audience can compile.

**Verdict:** Reasonable, but weak fit specifically because your users are developers.

---

## 2. Open Core (Free Shell, Paid Plugins Or Paid Features)

Host app stays free and open. Certain plugins — or host features like cloud sync, team layouts, advanced theming — are commercial.

Stewrd is unusually well suited to this structurally: the host already treats plugins as separately-distributed folders with their own `plugin.json`, `dist/index.js`, and per-plugin storage. A paid plugin doesn't need to be in the repo at all. You can sell a closed-source plugin without changing the host's license at all.

- **Pros:** Cleanest separation. The OSS story stays completely honest ("the app is free and open; I also sell some plugins"). Lets you charge more for a plugin solving a specific expensive problem than you could for a generic shell. Incremental — ship one paid plugin, see if anyone buys.
- **Cons:** Nothing stops someone reimplementing a paid plugin as a free one, since the whole API is public. Requires at least one plugin with obvious standalone value. Splits your attention between platform and product.
- **Effort:** Low to start (no host changes at all — just build a plugin and sell it as a zip; the host already installs `.zip` plugin archives). Medium if you add license-key validation.
- **Realistic revenue:** Entirely dependent on the plugin. A genuinely useful niche plugin at $15-40 one-time could do $50-500/mo. Zero if the plugin isn't compelling.

**Verdict:** Strongest structural fit. No license gymnastics needed.

---

## 3. Hosted Sync / Cloud Add-On (Self-Host Free, Hosted Paid)

Obsidian is the reference case: the app and its 1,000+ community plugins are entirely free, and revenue comes from **Sync** ($4-8/user/mo) and **Publish** ($8/site/mo). This sustains a small independent team. The key insight is that nothing inside the editor is paywalled — the paid products are *services*, which can't be pirated or compiled away.

For Stewrd, the analogue is syncing plugin settings, saved layouts, themes, and `storage/` JSON across machines.

- **Pros:** Recurring revenue, not one-time. Immune to "just build it yourself" — you can't self-compile a server you don't run. Doesn't compromise the open-source story at all.
- **Cons:** You are now running infrastructure with uptime, backups, security, and E2E encryption obligations — forever, as a side project. Hosting costs eat thin margins at low volume. Sync is only valuable once users have data worth syncing, which means Stewrd needs real adoption first.
- **Effort:** High. Server, auth, billing, conflict resolution, encryption. Months, not weeks.
- **Realistic revenue:** $0 for a long time, then potentially the best long-run option — but requires a user base in the thousands before it's worth the ops burden.

**Verdict:** Right idea, wrong time. Park it until adoption justifies it.

---

## 4. Sponsors / Donations

GitHub Sponsors, Ko-fi, Open Collective. Also worth noting Obsidian's **Catalyst** tier — a pure donation dressed up as early access to insider builds, which converts far better than a naked "donate" button.

The data is blunt: fewer than 12% of open source maintainers earn anything at all, and documented solo-maintainer Sponsors income tends to sit in the hundreds-of-dollars-per-year range. $1,000/mo is considered a notable milestone, and the six-figure cases (Caleb Porzio, Evan You) are audience-driven outliers who had large followings first.

- **Pros:** Effectively zero effort to set up. No licensing implications. No support obligations. Stacks with every other option.
- **Cons:** Not a revenue strategy. Income tracks your audience size, not your software quality.
- **Effort:** One hour.
- **Realistic revenue:** $0-50/mo without an existing audience.

**Verdict:** Turn it on because it's free. Don't plan around it.

---

## 5. Plugin Marketplace Revenue Share

Host a marketplace, take 10-30% of paid third-party plugins.

This only works with a large third-party developer ecosystem. Obsidian, with 1,400+ community plugins and millions of users, still hasn't built one — and users keep requesting it. Stewrd currently has one plugin author: you.

- **Pros:** Scales without you writing the plugins.
- **Cons:** Requires payments, licensing, hosting, review, refunds, and chargeback handling — for other people's products. Meaningless below roughly 50 third-party plugins and tens of thousands of users.
- **Effort:** Very high.
- **Realistic revenue:** $0 for the foreseeable future.

**Verdict:** Not applicable yet. Revisit if a third-party plugin ecosystem ever materializes.

---

## 6. Dual Licensing / Commercial Use License

Ship under a copyleft license (GPL/AGPL) and sell a separate commercial license to anyone who can't accept copyleft terms. Qt, MySQL, and Sidekiq are the well-known examples.

A softer variant is Obsidian's: the app is free for everyone, and the **$50/user/yr commercial license is voluntary** — it's a donation with an invoice attached, unenforceable by design since they collect no telemetry. Some companies pay anyway because their procurement wants a receipt.

- **Pros:** Stays genuinely open source (GPL is OSI-approved). Real money per deal when it lands. The voluntary variant costs nothing to try.
- **Cons:** Classic dual licensing only produces revenue from *businesses embedding your code*, which is unlikely for an end-user desktop app. Strict dual licensing also requires a Contributor License Agreement from every contributor, which deters contributions. Voluntary licensing yields nearly nothing at small scale.
- **Effort:** Low (voluntary) to medium (real dual licensing with a CLA).
- **Realistic revenue:** Near zero for a desktop app. This model fits libraries and servers.

**Verdict:** Skip the classic version. The voluntary "support license" variant is a cheap add-on later.

---

## 7. Adjacent Revenue

Worth naming even though it's not product revenue: consulting, custom plugin development for companies, sponsored plugin work ("pay me $2k to build the plugin your team needs"), or writing/content around the project. For most solo OSS developers this genuinely out-earns every option above in year one, and paid custom plugins also grow the ecosystem.

- **Effort:** Low, but trades time for money and doesn't compound.
- **Realistic revenue:** Highly variable; often the largest single line item early on.

---

## 8. License Choice — The Decision That Gates Everything

| License | Open source? | Stops rebranded resale? | Notes |
|---|---|---|---|
| MIT / Apache 2.0 | Yes (OSI) | No | Maximum adoption. Anyone can fork, rebrand, and sell. |
| GPLv3 | Yes (OSI) | Partially | A fork must also be GPL and publish source. Doesn't stop selling, does stop closed rebranding. Compatible with selling binaries (Ardour's model). |
| AGPLv3 | Yes (OSI) | Partially | Extends GPL to network use. Overkill for a desktop app. |
| Fair Source / PolyForm Shield / Noncommercial | **No** | Yes | Lawyer-drafted, standardized non-compete terms. Practically fine for users; violates OSI's "no discrimination against fields of endeavor." |
| BUSL 1.1 | **No** (converts later) | Yes, temporarily | Parametrized: you set the Additional Use Grant. Must convert to a GPL-compatible license within 4 years. Designed for the cloud-vendor problem, not desktop apps. |
| Custom EULA (Aseprite style) | **No** | Yes | Source visible, compiling for yourself allowed, redistribution forbidden. Maximum protection of binary sales; guarantees FOSS-community friction and possible forks (Aseprite got forked as LibreSprite). |

The real tradeoff: OSI-approved licenses get you goodwill, contributors, package-manager inclusion, and HN/Reddit reception. Source-available licenses protect revenue but reliably generate "this isn't open source" pushback, and every one of the well-known cases (HashiCorp, Elastic, Redis) got forked.

For a side project seeking adoption first, the pushback costs more than the protection is worth. Nobody is going to rebrand and resell a niche plugin shell. That risk is roughly theoretical at your scale.

---

## Comparison Summary

| Option | Effort | Realistic revenue (year 1) | OSS-compatible | Fit |
|---|---|---|---|---|
| Paid binaries | Medium | $0-300/mo | Yes (GPL) or via EULA | Weak — dev audience can compile |
| Open core / paid plugins | Low-Medium | $0-500/mo | Yes | **Strong** |
| Hosted sync | High | ~$0 | Yes | Premature |
| Sponsors / donations | Trivial | $0-50/mo | Yes | Free to add |
| Marketplace rev share | Very high | $0 | Yes | Not applicable |
| Dual / commercial license | Low-Medium | ~$0 | Yes | Weak for desktop |
| Consulting / paid plugin work | Low | Variable, often highest | Yes | Strong, doesn't compound |

---

## Recommendation

**Do these three, in this order.**

**1. License it now — Apache 2.0 or GPLv3.** Pick GPLv3 if you want forks to stay open and want the Ardour-style option of selling binaries later; Apache 2.0 if adoption matters more than control. Either way, add the `LICENSE` file this week. Also add a short `NOTICE`/trademark line reserving the "Stewrd" name — a trademark reservation stops rebranded resale far more cheaply than a restrictive license does, and costs you nothing in community goodwill.

**2. Turn on GitHub Sponsors today.** Five minutes. Add an Obsidian-Catalyst-style tier ($5-10/mo for insider builds and a name in the app's Settings > General credits) rather than a bare donate button. Expect very little, but it's free and it stacks.

**3. Make paid plugins your actual revenue bet.** This is the only option that fits both your architecture and your constraints:
   - The plugin loader already installs `.zip` archives from an arbitrary source, so a paid plugin needs **no host changes at all** to ship.
   - A closed-source plugin doesn't compromise the host's open-source status.
   - It's testable cheaply: build one, sell it on Lemon Squeezy or Gumroad, and see if anyone bites before investing further.
   - Licensing can start as pure honor-system (a key stored via `api.storage`, checked locally). Do not build license-server infrastructure until you have paying customers to justify it.

   Pick a plugin with obvious standalone value to a specific niche — something a person would already pay $20 for as a standalone app, that happens to be better inside Stewrd.

**Explicitly defer:** hosted sync (until you have thousands of users), the marketplace (until third-party plugin authors exist), and any source-available license (until someone actually threatens the revenue, which almost certainly won't happen).

**Set expectations honestly:** the realistic year-one outcome for a niche solo desktop tool is $0-200/month from product revenue, with consulting or sponsored plugin work likely exceeding it. The value of doing this now isn't the money — it's having the license, payment rail, and one paid plugin already in place if Stewrd ever does find an audience.

---

## Sources

- [Aseprite — Wikipedia](https://en.wikipedia.org/wiki/Aseprite) (license history, paid-binary model)
- [Paid vs. Open Source Aseprite: The Difference](https://en.bioerrorlog.work/entry/aseprite-open-vs-paid-version)
- [HN discussion: Aseprite's sell-the-binaries model](https://news.ycombinator.com/item?id=32578049)
- [Obsidian Pricing](https://obsidian.md/pricing)
- [Obsidian as an example of thoughtful pricing strategy](https://www.robinlandy.com/blog/obsidian-as-an-example-of-thoughtful-pricing-strategy-and-the-power-of-product-tradeoffs)
- [Obsidian forum — paid plugin market request](https://forum.obsidian.md/t/paid-plugin-market-and-how-to-solve-unmaintained-plugins/109137)
- [A Comprehensive Guide to Source-Available Software Licenses — FOSSA](https://fossa.com/blog/comprehensive-guide-source-available-software-licenses/)
- [Business Source License — Wikipedia](https://en.wikipedia.org/wiki/Business_Source_License)
- [Why I Chose the PolyForm Shield License](https://devantler.tech/blog/why-i-chose-the-polyform-shield-license-for-ksail/)
- [List of Source Available Licenses](https://sourceavailable.org/list-of-source-available-licenses/)
- [awesome-oss-monetization](https://github.com/PayDevs/awesome-oss-monetization)
- [I Just Hit $100k/yr On GitHub Sponsors — Caleb Porzio](https://calebporzio.com/i-just-hit-dollar-100000yr-on-github-sponsors-heres-how-i-did-it)
- [My GitHub Sponsors revenue 2022 — azu](https://dev.to/azu/my-github-sponsors-revenue-2022-38ab)
- [How Developers Monetize Open Source Projects in 2026](https://www.ossphere.dev/blog/how-developers-monetize-open-source-projects-in-2026)
