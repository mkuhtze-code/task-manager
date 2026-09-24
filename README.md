# Dokkit

**Dokkit is a personal thinking tool that helps work fit the reality of your day.**

It is built around a simple idea:

> **You don't need to do more. You need to know what fits.**

Dokkit captures what needs attention, learns from what actually happens, and gradually adjusts how it plans around the person using it.

It is deliberately not a conventional productivity system. There are no streaks, points, leaderboards, productivity scores, or artificial pressure to keep opening the app.

The tool is intended to **conform to the user**, rather than asking the user to conform to the tool.

## What Dokkit does

### Today

Today is the main working surface.

It brings together the work that can realistically fit into the user's available capacity, rather than simply presenting an unlimited task list.

Tasks can include:

* estimated duration
* actual duration
* start/stop timing
* location
* urgency / importance
* jobs
* external calendar commitments
* tasks that appeared during the day
* carried work from previous days

The system uses what actually happened to improve future planning.

### Reality Check

Reality Check closes the loop between planning and reality.

When work is completed, partially completed, carried forward, or timed differently from the estimate, that information becomes evidence for future planning.

The aim is for Dokkit to quietly become better at answering questions such as:

* How long does this type of work actually take?
* Is this normally completed in one sitting?
* Does this kind of task usually get carried?
* What tends to fit into this person's available time?
* Which work is predictable and which is ambiguous?
* What should reasonably fit today?

The user should not need to maintain a planning system in order for the system to learn.

### Jobs

Jobs group work that spans multiple tasks or days.

A job can contain:

* tasks
* client information
* location
* progress
* historical work
* related observations

Historical task information can also be used to identify patterns between similar work.

### Meetings

Meetings provide a place to capture a conversation and its useful outcomes without requiring everything to be structured beforehand.

Meetings can contain:

* purpose / starting point
* time
* duration
* location
* associated job
* notes
* observations

The underlying principle is simple:

> **Give the meeting a starting point.**

### Travel

Travel provides a way to plan trips and understand the time available around them.

Trips can contain:

* start and end dates
* trip days
* personal or work intent
* daily availability
* planned work

The objective is not simply to create an itinerary, but to understand what can realistically fit around being away.

### Calendar integration

Dokkit can connect external calendars to account for existing commitments.

External calendar events are treated as **commitments that consume available capacity**, rather than becoming Dokkit tasks.

The current integration architecture is provider-independent, with Microsoft/Outlook Calendar implemented first.

### Notifications

Dokkit supports web push notifications and has Firebase infrastructure for web and Android notification delivery.

Web push subscriptions are stored separately from the existing Android Firebase Cloud Messaging token system.

### Admin

Dokkit includes an internal administration system for operating the product.

The admin area provides visibility into areas including:

* accounts
* activity
* usage
* product surfaces
* system health
* errors
* infrastructure
* support / feedback
* business status

Administrative access is restricted to authorised administrator accounts.

## Design principles

Dokkit is built around a few principles that influence both product behaviour and implementation.

### Reality over intention

Plans are useful, but what actually happened is better evidence.

### The tool conforms to the user

The user should not have to continually adapt their behaviour to satisfy the software.

### Progressive disclosure

Dokkit should expose complexity when it becomes useful, not require users to understand the system before they can use it.

### Low friction

Capturing something should be easier than keeping it in your head.

### No artificial engagement loops

Dokkit does not depend on:

* streaks
* points
* badges
* leaderboards
* productivity scores
* notification pressure
* daily rituals
* gamified rewards

The goal is useful interaction, not maximum interaction.

### Explainability

When Dokkit makes a decision or changes its behaviour, the system should be able to explain where that behaviour came from.

Patterns and learned behaviour are intended to make the underlying system more understandable rather than turning the product into an analytics dashboard.

## Technology

Dokkit is currently built with:

* **Next.js** — application framework
* **React** — UI
* **TypeScript** — application language
* **Supabase** — authentication and PostgreSQL database
* **Vercel** — hosting and deployment
* **Firebase** — web / Android push infrastructure
* **Vitest** — automated testing
* **Web Push** — browser notification delivery

The application uses the Next.js App Router.

The production application is served under:

`https://www.dokkit.space/app`

## Repository structure

The repository is organised around the Next.js application rather than a collection of separate products.

Broadly:

```text
app/
  Application routes and API routes

components/
  Reusable UI and product surfaces

hooks/
  React hooks and application behaviour

lib/
  Domain logic, utilities, integrations and shared services

public/
  Static assets and service-worker resources

supabase/
  Database schema and Supabase-related definitions

tests / *.test.*
  Automated application tests
```

The exact structure will continue to evolve as Dokkit develops.

## Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

Run TypeScript checking:

```bash
npm run typecheck
```

Create a production build:

```bash
npm run build
```

Run the complete CI checks locally:

```bash
npm run ci
```

`npm run ci` currently runs:

```text
npm test
npm run typecheck
npm run build
```

## Environment

Dokkit requires environment variables for its connected services.

These include configuration for:

* Supabase
* Microsoft identity / Graph integration
* calendar token encryption
* Firebase web push
* application URLs
* rate limiting / infrastructure services
* other enabled integrations

Secrets must be supplied through the appropriate local or deployment environment and should never be committed to the repository.

## Database

Dokkit uses Supabase PostgreSQL with Row Level Security (RLS).

User-owned application data is scoped to the authenticated user, with database policies enforcing ownership at the data layer.

The database contains data supporting areas such as:

* users and settings
* tasks
* task history
* task intelligence
* jobs
* meetings
* travel
* calendar connections
* external calendars
* notifications
* administration
* support and product telemetry

Database changes should be made deliberately and tested against existing installations as well as fresh databases.

## Security

Security is treated as part of the application architecture rather than an afterthought.

Key areas include:

* Supabase authentication
* Row Level Security
* server-side authorisation
* administrator access controls
* encrypted external calendar credentials
* authenticated API requests
* rate limiting
* separation of personal and administrative data
* controlled access to support and operational information

Dokkit is being developed toward a stronger operational security and compliance posture as the product matures.

## Testing

The repository includes an automated test suite covering application logic, UI behaviour and important product flows.

Before merging significant changes, the expected baseline is:

```bash
npm test
npm run typecheck
npm run build
```

The intention is to keep the application deployable while the product continues to evolve rapidly.

## Product direction

Dokkit is evolving from a simple task manager into a system that can understand enough about a person's work to make planning increasingly realistic.

The long-term loop is:

```text
What you planned
       ↓
What actually happened
       ↓
Evidence
       ↓
What Dokkit learns
       ↓
Better estimates and capacity
       ↓
A more realistic next plan
```

The important part is that this loop should happen **quietly**.

The user should not need to become a project manager, data analyst, or productivity expert to benefit from the system.

---

**Dokkit**

*Know what fits.*
