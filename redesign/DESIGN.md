# Community Hedge Fund DAO — Visual Redesign (DESIGN.md)

> **This is the *visual* design-system spec** for a full redesign of the dApp — a fresh
> identity, not an evolution of the current amber/purple/slate theme. It is the source
> of truth for the Stitch design system and the eventual localhost rebuild.
> (Product mechanics live in `../docs/DESIGN.md` — this file does not change them.)

**Scope:** redesign **Overview · Vote · Portfolio · Leaderboard · Agents**. *Rewards is out of scope.*
**Platform:** desktop web first. **Themes:** light + dark (both first-class).

---

## 1. Brand essence

A community fund where **money buys influence and being right earns it.** The UI should feel
like a **friendly, trustworthy consumer-fintech app** — think Robinhood / Kalshi — that
happens to be fully on-chain. Approachable, confident, and legible to a first-time user,
but dense enough to respect a trader.

- **Personality:** clear · friendly · confident · honest. Never intimidating, never "crypto-loud."
- **Hierarchy:** one **big number** leads every screen; everything else supports it.
- **Voice / microcopy:** plain-spoken and human. Short. "Cast your vote." "Being right earns influence." "Closes in 0:41." No jargon walls, no exclamation spam.
- **Honesty:** demo-mode is always disclosed (replay badge). Gains and losses are shown truthfully.

---

## 2. Color

Brand spine is a **trust blue → indigo**. Gains/losses use a **separate** green/red so "brand
blue" never competes with "profit green." Two full themes; same tokens, different values.

### Signature
- **Brand gradient** (logo mark, hero accents, key CTAs): `linear-gradient(135deg, #2D6BFF 0%, #5B4FE0 100%)` — blue → indigo.
- **Primary brand:** `#3B5BFF` (indigo-blue).

### Brand ramp (indigo-blue)
`50 #EEF2FF` · `100 #E0E7FF` · `200 #C7D2FE` · `300 #A5B4FC` · `400 #6E83FF` · `500 #4F6BFF` · `600 #3B5BFF` (primary) · `700 #2C46E0` · `800 #1F33A8` · `900 #18255E`

### Light theme
| Token | Value | Use |
|---|---|---|
| `bg` | `#F6F7FB` | app background (cool off-white) |
| `surface` | `#FFFFFF` | cards, panels |
| `surface-2` | `#F0F2F8` | inset / hover wells |
| `border` | `#E6E8F0` | hairlines |
| `border-strong` | `#D3D7E4` | dividers, inputs |
| `text` | `#0E1116` | primary text |
| `text-muted` | `#5B6172` | secondary text |
| `text-subtle` | `#8A90A2` | captions, placeholders |
| `primary` | `#3B5BFF` | brand actions |
| `primary-text` | `#2C46E0` | brand text on light (AA) |
| `on-primary` | `#FFFFFF` | text/icon on a filled primary button |

### Dark theme
| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0D14` | app background (deep blue-black) |
| `surface` | `#12141D` | cards, panels |
| `surface-2` | `#181B26` | inset / hover wells |
| `border` | `#232634` | hairlines |
| `border-strong` | `#323648` | dividers, inputs |
| `text` | `#F4F6FB` | primary text |
| `text-muted` | `#9AA1B2` | secondary text |
| `text-subtle` | `#6B7280` | captions, placeholders |
| `primary` | `#5B72FF` | brand actions (lifted for dark) |
| `primary-text` | `#8EA0FF` | brand text on dark |
| `on-primary` | `#0B0D14` | text/icon on a filled primary button |

### Semantic — gains / losses (theme-agnostic intent, with text-safe variants)
| Intent | Fill | Text on light | Text on dark |
|---|---|---|---|
| **Positive / gain** | `#12B981` | `#047C57` | `#34E0A6` |
| **Negative / loss** | `#F5484A` | `#D11F2D` | `#FF7B7D` |
| **Neutral / flat** | `#8A90A2` | `#5B6172` | `#9AA1B2` |

> **Never color-only.** Always pair gain/loss with a sign and arrow (`▲ +14.8%` / `▼ −0.4%`).
> Use the *Text* variants for numbers on a surface; reserve *Fill* for chips, bars, and dots.

---

## 3. Typography

**Friendly geometric.** Distinctive but warm; built for big numbers.

- **Display / headings:** **Plus Jakarta Sans** (600–800). Rounded, characterful, confident.
- **Body / UI / labels:** **DM Sans** (400–600). Clean, neutral, pairs cleanly with Jakarta.
- **Numerals:** DM Sans with **tabular figures** everywhere data lives (prices, %, timers, VP) to prevent layout shift.
- **Mono (accents only):** **JetBrains Mono** for addresses, tx hashes, contract IDs.

### Scale (desktop)
| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display-xl` | 56 / 60 | 800 | the one hero number per screen |
| `display-l` | 40 / 44 | 700 | secondary big numbers |
| `h1` | 32 / 38 | 700 | page titles |
| `h2` | 24 / 30 | 600 | section titles |
| `h3` | 18 / 24 | 600 | card titles |
| `body-l` | 16 / 24 | 400 | default body |
| `body-m` | 14 / 20 | 400 | dense rows, secondary |
| `label` | 13 / 16 | 500 | uppercase eyebrow labels (`letter-spacing: .04em`) |
| `caption` | 12 / 16 | 500 | captions, chip text |

---

## 4. Shape, spacing & elevation

**Rounded & roomy.**

- **Radius:** cards `16px` · inputs/buttons `12px` · **pills** (primary CTAs, chips, tags, toggles) `full` · small chips `8px`.
- **Grid:** 8px base. Card padding `20–24px`. Section gaps `24–32px`. Page max-width ~`1200px`, centered, comfortable gutters.
- **Elevation:** soft, low. Light: `0 1px 2px rgba(16,17,22,.04), 0 8px 24px rgba(16,17,22,.06)`. Dark: lean on `surface`/`border` contrast + a faint `0 8px 24px rgba(0,0,0,.4)`; avoid heavy glows.
- **Borders over shadows** for structure in dark mode; shadows for lift in light mode.

---

## 5. Iconography & imagery

- **Icons:** rounded line icons, ~1.75px stroke (Lucide / Phosphor style). Friendly, consistent weight.
- **Avatars:** circular, colored initial chips (deterministic color per member). Agents get a subtle bot glyph; humans a person glyph.
- **Token/ticker marks:** rounded-square chips with the symbol (e.g. `NVDA`), muted background.
- **Charts:** clean line/area, soft gridlines, rounded caps, gradient area-fill under the line. Benchmark (S&P) as a dashed neutral line. No 3D, no clutter.

---

## 6. Motion

Gentle, spring-y, purposeful — friendly, not flashy.

- Numbers **roll/count up** on change; price cells **flash** gain/loss briefly then settle.
- Content **fades + rises** 8px on mount (`200–320ms`, ease-out).
- Sliders give immediate, springy feedback. The **cycle clock** animates its progress smoothly.
- **Respect `prefers-reduced-motion`** — disable transforms/flashes, keep instant state.

---

## 7. Component kit

The pieces these five screens need:

- **Top nav** — logo + wordmark, **pill tab bar** (active tab = filled brand pill), right side: wallet balance, `Verified` badge, account avatar.
- **Cycle status bar** — live state (`Voting open` / `Holding basket`), countdown, progress, cycle # + market week. Friendly, prominent, full-width.
- **Stat card** — eyebrow label + `display` number + delta chip. The workhorse.
- **Delta chip** — pill with arrow + signed %, in gain/loss color.
- **Performance chart card** — fund vs S&P, legend, range, "outperforming" badge.
- **Allocation slider row** *(Vote)* — ticker + name, slider, live %, normalized-to-100 hint.
- **Voting-power card** *(Vote)* — VP big number; capital share + accuracy share + confidence-ramp bars.
- **Leaderboard row** — rank, avatar, name, Human/Agent tag, accuracy, capital, **VP bar**. Plus a hero "skill out-votes capital" comparison block.
- **Agent card** — avatar, strategy tag, stats, **LLM thesis quote**, this-cycle allocation bars, **Delegate** pill button.
- **Buttons** — primary (filled brand pill), secondary (tinted), ghost; sizes sm/md/lg.
- **Badges/tags** — Human / Agent, strategy, `Verified`, **demo-mode replay** badge.
- **Toast** — resolve notifications ("Cycle 22 resolved · trailed S&P by 0.4%").
- **Inputs** — rounded, clear focus ring (2px brand), inline affordances (e.g. "+ Mint demo USDC").

---

## 8. Accessibility

- **Contrast:** WCAG AA for all text; use the *Text* gain/loss variants on surfaces.
- **Never color alone:** signs + arrows + (where useful) labels accompany every gain/loss.
- **Focus:** visible 2px brand focus ring, `2px` offset, on every interactive element.
- **Tabular numerals** for all data to stop layout shift.
- **Reduced motion** fully supported.
- Hit targets ≥ 40px; slider handles large and grabbable.

---

## 9. Per-screen direction

**Overview** — One hero: fund value / return, huge. Live cycle bar beneath. Stat row (AUM · return · alpha · cycle). Fund-vs-S&P chart + current basket side-by-side. Primary CTAs: *Cast your vote*, *See the leaderboard*. Demo-replay badge up top.

**Vote** — Left: allocation slider list across the mock universe, "normalized to 100%" hint, sticky *Submit vote*. Right: your **voting power** card (capital + accuracy + confidence ramp) and **Delegate to an agent** (copy an agent's allocation — "votes through your account, same path").

**Portfolio** — Hero: your position value + % of fund. Stat row (NAV/share · S&P benchmark · alpha). Big fund-vs-S&P performance chart. Your-stake details (deposited, accuracy, cycles, claimable). Deposit box (+ mint demo USDC), epoch-lock note.

**Leaderboard** — Hero comparison: *most accurate* (small wallet, high VP) vs *largest wallet* — "X holds \$2K but out-votes \$12K. Being right earns influence." Toggle **Voting Power ↔ Accuracy**. Ranked list of humans + agents on one board (rank, avatar, tag, accuracy, capital, VP bar).

**Agents** — Intro: "an agent is just an automated human — same voting path," with World ID / Dynamic chips. Grid of 6 agent cards: stats + LLM thesis + this-cycle allocation bars + one-tap **Delegate**.

---

## 10. Out of scope
- **Rewards** screen — excluded from this redesign per direction.
- Wiring to contracts/keeper/wallets — visual + prototype only; data stays mocked.
