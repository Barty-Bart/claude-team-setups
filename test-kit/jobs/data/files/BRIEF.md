# Kettle & Co: analysis brief

Kettle & Co is a (made-up) tea subscription company. The chief executive wants to understand how 2025 went and what to fix first. You have three exports in `data/`. They are messy. Clean them, answer the twelve questions below exactly, and write a report she can read in five minutes.

## The data
- `data/customers.csv`: `customer_id, email, signup_date, country, plan, referral_source`
- `data/orders.csv`: `order_id, customer_id, order_date, amount, currency, status, coupon`
- `data/tickets.csv` (support tickets): `ticket_id, customer_id, opened_at, category, resolved_at, satisfaction`

## Cleaning rules (follow these exactly, so the answers can be checked)
1. Customers whose email ends in `@kettletest.example` are internal test accounts. Leave them, their orders and their tickets out of everything.
2. Rows in `orders.csv` that are exact copies of another row are export errors. Count each such order once.
3. Leave out orders whose `customer_id` is not in `customers.csv`, and orders with no amount.
4. Dates are either `YYYY-MM-DD` or `DD/MM/YYYY` (a date with slashes is always day first).
5. Amounts may carry a currency symbol and spaces; ignore them. The `currency` column decides the currency. Convert to US dollars at fixed rates: 1 EUR = 1.10 USD, 1 GBP = 1.30 USD.
6. `status` and `plan` values differ in capitalisation and stray spaces; treat `Paid`, `paid ` and `PAID` as the same. Order statuses are paid, refunded and failed. Revenue means the US-dollar total of paid orders.
7. Country names: `USA` and `US` mean United States; `UK` and `U.K.` mean United Kingdom; `DE` and `Deutschland` mean Germany.
8. A ticket whose `resolved_at` is earlier than its `opened_at` is a data error; leave it out of resolution times. A ticket with no `resolved_at` is still open. Satisfaction is 1 to 5 and is often missing.

## Deliverable 1: `answers.json`
One JSON object with exactly these keys:
| Key | Meaning | Format |
|---|---|---|
| `q1_real_customers` | Number of customers after rule 1 | integer |
| `q2_revenue_2025_usd` | Revenue from orders dated in 2025 | number, 2 decimals |
| `q3_best_month_2025` | The month of 2025 with the highest revenue | `"YYYY-MM"` |
| `q4_biggest_drop_month_2025` | The month of 2025 whose revenue fell the most, in dollars, compared with the calendar month before it (January is compared with December 2024) | `"YYYY-MM"` |
| `q5_refund_rate_pct` | Refunded orders as a percentage of paid plus refunded orders, all dates | number, 1 decimal |
| `q6_top_country_by_customers` | The country with the most customers, using the full country name | string |
| `q7_aov_by_plan_usd` | Average value of a paid order, by the customer's plan | `{"basic": n, "plus": n, "premium": n}`, 2 decimals |
| `q8_repeat_customer_pct` | Of the customers with at least one paid order, the percentage with two or more | number, 1 decimal |
| `q9_highest_refund_source` | The referral source with the highest refund rate (as defined in q5) | string |
| `q10_median_resolution_hours` | Median hours from opened to resolved, over resolved tickets (rule 8); with an even count, the mean of the two middle values | number, 1 decimal |
| `q11_lowest_satisfaction_category` | The ticket category with the lowest average satisfaction, over tickets that have a rating | string |
| `q12_coupon_order_pct` | Percentage of paid orders that used a coupon | number, 1 decimal |

## Deliverable 2: `report.html`
A single self-contained HTML file (no network requests, no external scripts, fonts or images) for the chief executive:
- A short summary at the top: the three or four things she most needs to know, in plain language, with the numbers.
- At least four charts that you draw yourself (inline SVG or canvas), each with a title, labelled axes or values, and a one-line takeaway. Monthly revenue must be one of them.
- What is going wrong and where: look beyond the twelve questions for anything in the data that explains the problems you find.
- Three recommendations, each tied to a number from the data.
- A short "how the data was cleaned" section with counts of what was removed and why.
- It must read well on a laptop and print sensibly. Write for a busy non-technical reader.

## Deliverable 3: the code
Keep the script or scripts that produced the answers and the charts in this folder, and say in `README.md` how to run them again.
