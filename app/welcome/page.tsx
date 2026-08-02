import Link from 'next/link';
import DayRailDemo from '@/components/DayRailDemo';
import ThinkingDemo from '@/components/ThinkingDemo';
import './welcome.css';

export const metadata = {
  title: 'Dokkit — a personal thinking tool that understands time',
  description:
    "Dokkit isn't a scoreboard. It's a place to put everything down, see what actually fits today, and stop carrying it all in your head.",
};

export default function Welcome() {
  return (
    <div className="welcome-page">
      <div className="w-shell">
        <nav className="w-nav">
          <span className="w-nav-mark">Dokkit</span>
          <Link href="/" className="w-nav-signin">Sign in</Link>
        </nav>

        <header className="w-hero">
          <p className="w-hero-eyebrow">Private beta</p>
          <h1>A personal thinking tool<br />that understands time.</h1>
          <p className="w-hero-sub">
            Dokkit isn't a scoreboard. It's a place to put everything down, see what
            actually fits in the time you have left today, and stop carrying the rest
            in your head.
          </p>

          <DayRailDemo />

          <div className="w-cta-row" style={{ marginTop: 40 }}>
            <a href="mailto:hello@dokkit.app?subject=Requesting%20access%20to%20Dokkit" className="w-btn w-btn-primary">
              Request access
            </a>
            <Link href="/" className="w-btn w-btn-ghost">
              Already invited? Sign in
            </Link>
          </div>
        </header>

        <section className="w-section">
          <p className="w-section-eyebrow">Not another productivity app</p>
          <h2>The vocabulary is different<br />on purpose.</h2>
          <div className="w-reframe-list">
            <div className="w-reframe-row">
              <span className="w-reframe-old">Task management</span>
              <span className="w-reframe-arrow">→</span>
              <span className="w-reframe-new-block">
                <span className="w-reframe-new">Attention management</span>
                <span className="w-reframe-desc">Surfaces what deserves attention right now — not everything that exists.</span>
              </span>
            </div>
            <div className="w-reframe-row">
              <span className="w-reframe-old">Overdue</span>
              <span className="w-reframe-arrow">→</span>
              <span className="w-reframe-new-block">
                <span className="w-reframe-new">Carrying forward</span>
                <span className="w-reframe-desc">Nothing fails here. A task just stays active until you resolve it.</span>
              </span>
            </div>
            <div className="w-reframe-row">
              <span className="w-reframe-old">Productivity score</span>
              <span className="w-reframe-arrow">→</span>
              <span className="w-reframe-new-block">
                <span className="w-reframe-new">Capacity, not completion</span>
                <span className="w-reframe-desc">The only question is whether today's list matches today's time.</span>
              </span>
            </div>
          </div>
        </section>

        <section className="w-section">
          <p className="w-section-eyebrow">Where it comes from</p>
          <h2>Built from a list kept<br />under the keyboard.</h2>
          <div className="w-compare">
            <div className="w-compare-col w-compare-old">
              <div className="w-compare-title">The old way</div>
              <ul>
                <li>Written out each morning on paper</li>
                <li>Ticked off by hand through the day</li>
                <li>Spontaneous asks tracked from memory — and often forgotten</li>
                <li>Anything remembered right before bed is gone again by morning</li>
              </ul>
            </div>
            <div className="w-compare-col w-compare-new">
              <div className="w-compare-title">Dokkit</div>
              <ul>
                <li>Five-second capture — type it or say it</li>
                <li>Swipe to complete, the way you already do in Mail or Reminders</li>
                <li>Whatever comes up mid-day just gets dropped in, no re-planning</li>
                <li>Nothing forgotten overnight — it's still there when you open the app</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="w-section">
          <p className="w-section-eyebrow">The quiet part</p>
          <h2>Dokkit learns how long<br />things actually take you.</h2>
          <p className="w-section-lead">
            Every task remembers what it actually took, not just what you typed. Type
            something you've done before — even worded a little differently — and
            Dokkit quietly recognizes it and offers what it usually takes.
          </p>

          <ThinkingDemo />

          <p className="w-section-note">
            Tap the suggestion or ignore it — either way, nothing changes without you.
            The same pattern also quietly informs whether today's list actually fits
            the time you have left, even before you accept anything. Confidence
            builds honestly over time too: <span className="mono">just noticed</span> → <span className="mono">fairly confident</span> → <span className="mono">well known</span> — always shown plainly, never as a score. And it's entirely
            yours: nothing here is compared against anyone else's pace.
          </p>
        </section>

        <section className="w-section">
          <p className="w-section-eyebrow">A closer look</p>
          <h2>What it actually<br />looks like.</h2>
          <div className="w-mockup-grid">
            <div className="w-mockup-frame">
              <div className="w-mockup-screen">
                <div className="w-mock-date-row">
                  <span>Tuesday · Aug 4</span>
                  <span>⚙</span>
                </div>
                <div className="w-mock-ring">
                  <div className="w-mock-ring-inner">3h 10m<br />left</div>
                </div>
                <div className="w-mock-task-row">
                  <span className="w-mock-task-dot" />
                  <span className="w-mock-task-text">Quote reroof</span>
                  <span className="w-mock-tag">usually ~45m</span>
                </div>
                <div className="w-mock-task-row">
                  <span className="w-mock-task-dot hazard" />
                  <span className="w-mock-task-text">Draft proposal</span>
                  <span className="w-mock-tag">due today</span>
                </div>
                <div className="w-mock-rail">
                  <div className="w-mock-rail-fill" />
                </div>
              </div>
              <div className="w-mockup-caption">Today — capacity, not a checklist</div>
            </div>

            <div className="w-mockup-frame tilt-right">
              <div className="w-mockup-screen">
                <div className="w-mock-date-row">
                  <span>Patterns</span>
                  <span>Week</span>
                </div>
                <div className="w-mock-gauge-track">
                  <div className="w-mock-gauge-dot" />
                </div>
                <div className="w-mock-gauge-label">Your estimates are usually spot on</div>
                <div className="w-mock-pattern-row">
                  <div>
                    <div className="w-mock-pattern-name">Quote reroof</div>
                    <div className="w-mock-pattern-time">usually ~45m</div>
                  </div>
                  <span className="w-mock-confidence">Fairly confident</span>
                </div>
                <div className="w-mock-pattern-row">
                  <div>
                    <div className="w-mock-pattern-name">Team check-in</div>
                    <div className="w-mock-pattern-time">usually ~20m</div>
                  </div>
                  <span className="w-mock-confidence">Well known</span>
                </div>
              </div>
              <div className="w-mockup-caption">Patterns — a quiet look back, not a scoreboard</div>
            </div>
          </div>
        </section>

        <section className="w-section">
          <p className="w-section-eyebrow">How it works</p>
          <h2>Built the way you<br />actually work.</h2>
          <div className="w-feature-grid">
            <div className="w-feature-card">
              <div className="w-feature-title">Five-second capture</div>
              <div className="w-feature-desc">
                Type it or say it out loud. If it fits in your head for five seconds,
                it fits in Dokkit.
              </div>
            </div>
            <div className="w-feature-card">
              <div className="w-feature-title">Capacity, not a to-do list</div>
              <div className="w-feature-desc">
                A live view of what's left today, compared honestly against the time
                you actually have — not an idealized eight-hour block.
              </div>
            </div>
            <div className="w-feature-card">
              <div className="w-feature-title">Patterns, quietly</div>
              <div className="w-feature-desc">
                Dokkit notices how long things actually take you, and lets that inform
                your estimates over time — never a scoreboard, never a streak.
              </div>
            </div>
          </div>
        </section>

        <section className="w-closing">
          <div className="w-closing-badge">
            <span className="w-closing-badge-dot" />
            Currently a private beta
          </div>
          <h2>Built for one person at a time.</h2>
          <p className="w-closing-sub">
            Dokkit is being built slowly and tested with a small group of trusted
            users before opening up more widely. If that sounds like your kind of
            thing, say hello.
          </p>
          <div className="w-cta-row">
            <a href="mailto:hello@dokkit.app?subject=Requesting%20access%20to%20Dokkit" className="w-btn w-btn-primary">
              Request access
            </a>
          </div>
        </section>

        <footer className="w-footer">
          Dokkit — a personal thinking tool that understands time.
        </footer>
      </div>
    </div>
  );
}
