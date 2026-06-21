# Metal Reviews Dashboard — Project Specification

> **Non-technical. Intended for exploring future capabilities.**

---

## 1. What the project is

A **personal music-review aggregator dashboard** focused on metal and progressive-rock genres.

It collects reviews from multiple specialist music-review websites, normalises the data into a single format, and presents everything in one clean, searchable, sortable web interface — so the user never has to visit each site individually to stay up to date with new albums.

---

## 2. Data Sources

The project currently connects to **four websites**. Three are active; one is blocked.

| #   | Source                                                  | Status     | Rating system                                                    |
| --- | ------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| 1   | **Angry Metal Guy** (`angrymetalguy.com`)               | ✅ Active  | Textual labels (Iconic → Unlistenable) converted to 0–10 numbers |
| 2   | **The Progressive Subway** (`theprogressivesubway.com`) | ✅ Active  | Textual labels (Sublime → Abysmal) converted to 0–10 numbers     |
| 3   | **Metal Storm** (`metalstorm.net`)                      | ✅ Active  | Numeric 1–10 (decimals, e.g. 7.3). Uses community/user score     |
| 4   | **SputnikMusic** (`sputnikmusic.com`)                   | ❌ Blocked | Currently skipped — site blocks automated access                 |

---

## 3. How Data Is Collected

### Step 1 — RSS Feed

Each active source publishes an **RSS feed** (a standard web news feed). The project reads this feed to get a list of the latest reviews: title, summary, publication date, and a link to the full article.

### Step 2 — Rating Extraction (per source)

Because most RSS feeds do **not** include the actual rating number, the project has to go and fetch it separately:

| Source                 | Where the rating comes from                                         | How it's fetched                                                                                        |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Angry Metal Guy        | Inside the full review page (HTML)                                  | Fetches the page and scans for patterns like `Rating: 3.5/5.0` or `Rating: Great`                       |
| The Progressive Subway | Sometimes in the RSS feed itself; otherwise on the full review page | Scans for a "Final verdict:" line                                                                       |
| Metal Storm            | Only on the full review page — needs JavaScript to render           | Opens each review page in a hidden browser (Puppeteer) and extracts the gold-coloured user-score number |
| SputnikMusic           | N/A                                                                 | Skipped entirely                                                                                        |

> **Note on Metal Storm**: Because that site requires JavaScript to display its content, a real invisible browser is launched in the background to load and read each page. This is slower than the other sources.

### Step 3 — Title Parsing

Review titles follow formats like `"Band Name – Album Title"`. The project automatically splits these into separate **Band** and **Album** fields.

### Step 4 — Score Normalisation

Each source uses a different rating scale. All scores are converted to a **unified 0–100 scale** for consistent sorting:

- `3.5/5` → 70
- `8.5/10` → 85
- `"Great"` (Angry Metal Guy) → 80 (= 8.0/10)
- `"Exemplary"` (Progressive Subway) → 80 (= 8.0/10)

The original score (e.g. `8.5/10`) is also kept and displayed as-is on each card.

### Step 5 — Data Written to File

All collected reviews are merged into a single file called `reviews.json` stored on the server. The web dashboard reads from this file when it loads.

---

## 4. Scheduling — When Does It Run?

The data collection runs **automatically twice per day**: at **7:00 AM** and **7:00 PM**.

It also runs **immediately on startup** (so the data is always fresh when the server first boots).

There is no manual "refresh" button in the current UI — the user sees whatever was collected in the last scheduled run.

---

## 5. Data Model — What Is Stored Per Review

Each review record contains the following pieces of information:

| Field                | Description                             | Example                            |
| -------------------- | --------------------------------------- | ---------------------------------- |
| **Band**             | Artist or band name                     | `Opeth`                            |
| **Album**            | Album or EP title                       | `The Last Will and Testament`      |
| **Source**           | Which website published the review      | `Metal Storm`                      |
| **Score**            | Original score as displayed on the site | `8.5/10`                           |
| **Normalised Score** | Score converted to 0–100 for sorting    | `85`                               |
| **Summary**          | Short excerpt from the review body      | First few sentences of the article |
| **Published Date**   | When the review was posted              | `14 Jun 2026`                      |
| **URL**              | Direct link to the original review      | `https://metalstorm.net/...`       |
| **Double-Positive**  | Special flag (see Section 7)            | `true` / `false`                   |
| **ID**               | A unique internal identifier            | Auto-generated from band + album   |

> **Genre** is defined in the data model but is **not yet populated** by any source — it is always empty currently.

---

## 6. What the Dashboard Displays

### Layout

A **dark-themed, single-page grid layout** with cards arranged in columns (1 column on mobile, 2 on tablet, 3 on desktop).

### Header / Title

`Metal Reviews Dashboard` — displayed as a large gradient-coloured heading (teal → blue).

### Controls Bar (top of page)

Three interactive controls:

| Control           | Type        | What it does                                                     |
| ----------------- | ----------- | ---------------------------------------------------------------- |
| **Search box**    | Text input  | Filters cards in real time by band name, album name, or genre    |
| **Sort dropdown** | Select menu | Sort all visible cards by **Newest** (date) or **Highest Score** |
| **Source filter** | Select menu | Show cards from **All Sources** or a single chosen source        |

### Review Cards

Each card shows:

- **"Band – Album"** as the card title (large text)
- **Source badge** (small label, e.g. "Angry Metal Guy")
- **Score badge** in yellow (e.g. `8.5/10`) — only shown if a score was found
- **Published date** in grey (e.g. `14 Jun 2026`)
- **Summary excerpt** (up to 3 lines of the review text)
- **Double-Positive indicator** (see Section 7) — a star icon + "Double‑Positive" label in cyan

### Loading State

While data is loading, a spinning teal spinner is shown in the centre of the screen.

### Empty State

If the search/filter returns no results, a grey message reads: _"No reviews match your criteria."_

### Card Interaction

- Hovering a card makes it **scale up slightly** (a subtle zoom effect)
- Clicking a card opens the **original review on the source website** in a new browser tab

---

## 7. Special Feature — "Double-Positive" Albums

This is the project's most distinctive feature.

**Definition**: An album is marked as "Double-Positive" if **both** Angry Metal Guy **and** The Progressive Subway have published a review of it **within the last 14 days**.

This signals that two independent specialist outlets agree the album is worth attention — a strong positive signal.

**Visual treatment**:

- The card gets a **glowing cyan border** and **cyan box shadow**
- A ⭐ star icon + "Double‑Positive" label appears inside the card
- All other cards have a plain dark border

---

## 8. Rating Vocabulary (How Text Ratings Are Mapped)

### Angry Metal Guy

| Label         | Numeric value |
| ------------- | ------------- |
| Iconic        | 10            |
| Excellent     | 9             |
| Great         | 8             |
| Very Good     | 7             |
| Good          | 6             |
| Mixed         | 5             |
| Disappointing | 4             |
| Bad           | 3             |
| Embarrassing  | 2             |
| Unlistenable  | 1             |

### The Progressive Subway

| Label        | Numeric value |
| ------------ | ------------- |
| Sublime      | 10            |
| Mind-blowing | 9             |
| Exemplary    | 8             |
| Noteworthy   | 7             |
| Satisfactory | 6             |
| Unremarkable | 5             |
| Weak         | 4             |
| Bad          | 3             |
| Awful        | 2             |
| Abysmal      | 1             |

---

## 9. Current Limitations & Gaps

| #   | Limitation                                      | Impact                                                                           |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | **SputnikMusic is blocked**                     | No data from a major source                                                      |
| 2   | **Genre field is always empty**                 | Genre-based search currently doesn't work                                        |
| 3   | **No manual refresh button**                    | User cannot force a data refresh from the UI                                     |
| 4   | **No pagination**                               | All reviews load at once; could be slow with many entries                        |
| 5   | **No historical archive**                       | Each ingest overwrites the data file; old reviews beyond the RSS window are lost |
| 6   | **No user accounts or personalisation**         | No way to save favourites, mark as read, or follow specific bands                |
| 7   | **No notifications**                            | No alerts when a new review of a specific artist appears                         |
| 8   | **Single-device**                               | No sync, no mobile app, no email digest                                          |
| 9   | **Double-Positive detection is only two sites** | Could be expanded to include Metal Storm                                         |
| 10  | **Scores sometimes missing**                    | If a site changes its HTML structure, rating extraction silently fails           |

---

## 10. Capability Exploration Ideas

Based on the above, here are natural directions to expand:

- **Add more sources** — other metal/prog blogs (Prog Sphere, No Clean Singing, AllMusic)
- **Fix genre data** — extract genre tags from review pages to make genre filtering work
- **Add historical archive** — keep a rolling database of all reviews, not just the latest RSS batch
- **Add notifications** — alert when a watched band/artist gets a new review
- **Add a "High Score" filter** — e.g., only show albums rated 8+/10
- **Add a timeline view** — see how many albums per week/month were reviewed
- **Restore SputnikMusic** — find a way around the block (e.g. use a proxy or official API)
- **Mobile app / PWA** — make it installable on a phone as a Progressive Web App
- **Email digest** — daily or weekly summary email of top-rated new albums
- **Band / artist tracking** — follow specific bands and get a dedicated feed for them
