# Tidewater Cycles: website brief

Build a complete, polished multi-page website for Tidewater Cycles, a bike shop, repair workshop and bike-hire business in the (made-up) harbour town of Port Calder. The site should make a visitor want to walk in, and it should look like the work of a good small design studio.

## Deliverable
- Static HTML, CSS and JavaScript in this folder. No build step, no server code, no network requests at runtime (no CDNs, web fonts, remote images or analytics). All graphics are made in code (inline SVG, CSS) or are local files you create.
- Every page must work when opened directly (`file://`) and when served by any static file server from this folder, so all links are relative.
- Pages and file names (required):
  - `index.html` (home)
  - `services.html` (repairs and servicing)
  - `hire.html` (bike hire)
  - `about.html`
  - `journal.html` (list of the three journal posts) and one page per post: `journal/spring-service-checklist.html`, `journal/coast-path-loop.html`, `journal/choosing-a-first-e-bike.html`
  - `contact.html`

## The business (use these facts; write the rest of the copy yourself)
- Tidewater Cycles, 14 Quay Street, Port Calder PC4 2HB. Phone 01632 960 417. Email hello@tidewatercycles.example.
- Opening hours: Tuesday to Friday 9:00 to 17:30, Saturday 9:00 to 16:00, closed Sunday and Monday.
- Founded in 2011 by Maren Okafor (owner, head mechanic). The team: Maren Okafor; Joss Whitlow (workshop mechanic, wheel builder); Priya Raman (hire desk and shop floor).
- Services and prices:
  | Service | Price |
  |---|---|
  | Safety check | £25 |
  | Standard service | £65 |
  | Full overhaul | £140 |
  | Puncture repair | £12 |
  | Wheel true | £20 |
  | E-bike diagnostic | £45 |
- Hire bikes and day rates:
  | Bike | Value for `#hire-bike` | Per day |
  |---|---|---|
  | City bike | `city` | £22 |
  | Hybrid | `hybrid` | £28 |
  | E-bike | `ebike` | £48 |
  | Kids bike | `kids` | £12 |
  Hiring for 3 days or more takes 15% off the bike rate. A helmet costs £3 per day and is never discounted. Hire is for 1 to 14 days.
- Journal posts (write each one yourself, at least 180 words, with a date in 2026):
  - "Spring service checklist"
  - "The Coast Path loop: 18 miles from our door"
  - "Choosing a first e-bike"

## Requirements
1. Every page has the same header and footer. The header has the business name and a `<nav>` that links to the six main pages (Home, Services, Hire, About, Journal, Contact). The link for the current page carries `aria-current="page"` (journal posts mark Journal). The footer shows the address, phone number and opening hours.
2. Every page has `<html lang="en">`, a unique `<title>`, a unique meta description and exactly one `<h1>`. Every image or meaningful SVG has a text alternative.
3. Layout adapts from 360 px wide phones to 1920 px desktops with no horizontal scrolling. At 640 px wide and below, the nav links are hidden behind a `<button>` with `aria-expanded` that opens and closes them.
4. Home: a hero section, a short summary of the three sides of the business (repairs, hire, shop) with links to the relevant pages, today's opening hours, and a teaser for the latest journal post.
5. Services: every service with its price, a short description of each, and a FAQ of at least four questions built with `<details>`.
6. Hire: the four bikes with their day rates, and a price calculator: a `<select id="hire-bike">` (option values `city`, `hybrid`, `ebike`, `kids`), `<input type="number" id="hire-days">` (1 to 14), `<input type="checkbox" id="hire-helmet">` and an element `id="hire-total"` that always shows the total for the current choices as pounds and pence, for example `£22.00`. It updates as soon as an input changes. Days outside 1 to 14 are clamped into that range.
7. About: the story of the shop and the three team members.
8. Journal: `journal.html` lists the three posts with title, date and a summary, each linking to its page. Each post page has the post in an `<article>` and a link back to `journal.html`.
9. Contact: address, phone, email, opening hours and a form `<form id="contact-form">` with fields named `name` (required), `email` (required, must look like an email address), `phone` (optional), `topic` (a select: Repair, Hire, Sales, Other) and `message` (required, at least 20 characters). On submit, the page validates in JavaScript: each invalid field gets `aria-invalid="true"` and a visible error message next to it, and nothing else happens. When everything is valid, no network request is made; the form is replaced or followed by a confirmation in an element `id="form-status"` that includes the sender's name. `#form-status` is empty until then.
10. Quality: consistent visual design across pages, good typography, sensible spacing, visible keyboard focus, sufficient colour contrast, and no console errors.
