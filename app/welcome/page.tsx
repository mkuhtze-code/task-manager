import Link from 'next/link';
import DayRailDemo from '@/components/DayRailDemo';
import ThinkingDemo from '@/components/ThinkingDemo';
import ReshuffleDemo from '@/components/ReshuffleDemo';
import RequestAccessForm from '@/components/RequestAccessForm';
import RevealSection from '@/components/RevealSection';
import './welcome.css';

export const metadata = {
  title: 'Dokkit — give your thoughts somewhere to go',
  description:
    'Dokkit was created because most productivity tools are good at organizing tasks, but not at understanding how people actually think.',
};

export default function Welcome() {
  return (
    <div className="welcome-page">
      {/* If JS never loads, sections default to opacity:0 via CSS until
          the observer fires. This forces them visible instead. */}
      <noscript>
        <style>{`.w-section,.w-closing{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div className="w-shell">
        <nav className="w-nav">
          <span className="w-nav-mark">Dokkit</span>
          <Link href="/" className="w-nav-signin">Sign in</Link>
        </nav>

        <header className="w-hero w-dark-panel">
          <div className="w-shell-inner">
          <p className="w-hero-eyebrow">Private beta</p>
          <h1>Give your thoughts<br />somewhere to go.</h1>
          <p className="w-hero-sub">
            Most tools ask you to reorganize how you think around their system.
            Dokkit does the opposite — it adapts to you.
          </p>

          <DayRailDemo />

          <div className="w-cta-row" style={{ marginTop: 40 }}>
            <a href="#request-access" className="w-btn w-btn-primary">
              Request access
            </a>
            <Link href="/" className="w-btn w-btn-ghost">
              Already invited? Sign in
            </Link>
          </div>
          </div>
        </header>

        <RevealSection className="w-section">
          <p className="w-section-eyebrow">Where it comes from</p>
          <h2>Built from a list kept<br />under the keyboard.</h2>
          <p className="w-section-lead">
            A piece of paper works fine for remembering things. The list was never
            the problem. The real problem was carrying thoughts: things to
            remember, ideas that aren't ready to act on yet, problems waiting on
            someone else, tasks that can't move until something else happens first.
            Dokkit became a place for those to live — not just a faster way to check
            boxes.
          </p>

          <div className="w-compare" style={{ marginTop: 32 }}>
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
          <p className="w-compare-caption">
            Works the same whether it's client work, a two-person shop, or a farm's
            morning list. You do these, I'll do those.
          </p>
        </RevealSection>

        <RevealSection className="w-section">
          <p className="w-section-eyebrow">Not another productivity app</p>
          <h2>The vocabulary is different<br />on purpose.</h2>
          <p className="w-section-lead">
            If a word implied failure, we changed it. The vocabulary is different
            because what the tool expects of you is different.
          </p>
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
                <span className="w-reframe-new">Capacity awareness</span>
                <span className="w-reframe-desc">The only question is whether today's list matches today's time.</span>
              </span>
            </div>
            <div className="w-reframe-row">
              <span className="w-reframe-old">Inbox</span>
              <span className="w-reframe-arrow">→</span>
              <span className="w-reframe-new-block">
                <span className="w-reframe-new">Holding space</span>
                <span className="w-reframe-desc">Not everything captured needs immediate action.</span>
              </span>
            </div>
          </div>
        </RevealSection>

        <RevealSection className="w-section w-dark-panel">
          <div className="w-shell-inner">
          <p className="w-section-eyebrow">A different kind of unfinished</p>
          <h2>The waiting room.</h2>
          <p className="w-section-lead">
            Not every thought is ready to become a task. Some things are just
            waiting — and Dokkit doesn't force those into a checklist before they're
            ready.
          </p>
          <div className="w-waiting-grid" style={{ marginTop: 28 }}>
            <div className="w-waiting-pill">Waiting for information</div>
            <div className="w-waiting-pill">Waiting for a decision</div>
            <div className="w-waiting-pill">Waiting for the right time</div>
            <div className="w-waiting-pill">Waiting for clarity</div>
          </div>
          <p className="w-section-note">
            Unfinished doesn't always mean incomplete. Sometimes it just means not
            yet — and that's allowed to sit there without becoming a failure.
          </p>

          <div className="w-principles-strip" style={{ marginTop: 36 }}>
            <span>Capacity over completion</span>
            <span>Patterns over scores</span>
            <span>Personal data over comparison</span>
            <span>No streaks</span>
            <span>No leaderboards</span>
            <span>No guilt</span>
          </div>
          </div>
        </RevealSection>

        <RevealSection className="w-section">
          <p className="w-section-eyebrow">How it thinks</p>
          <h2>Dokkit learns how long<br />things actually take you.</h2>
          <p className="w-section-lead">
            Every task remembers what it actually took, not just what you typed. Type
            something you've done before — even worded a little differently — and
            Dokkit recognizes it and offers what it usually takes, no extra step
            required.
          </p>

          <ThinkingDemo />

          <p className="w-section-note">
            Tap the suggestion or ignore it — either way, nothing changes without you.
            The same pattern also feeds into whether today's list actually fits the
            time you have left, even before you accept anything. Confidence builds
            honestly over time too: <span className="mono">just noticed</span> → <span className="mono">fairly confident</span> → <span className="mono">well known</span> — always shown plainly, never as a score. And it's entirely
            yours: nothing here is compared against anyone else's pace.
          </p>
        </RevealSection>

        <RevealSection className="w-section">
          <p className="w-section-eyebrow">How it reshuffles</p>
          <h2>Your list rearranges<br />around your day.</h2>
          <p className="w-section-lead">
            Add something new and Dokkit doesn't just drop it at the bottom. It checks
            what still fits in the time you actually have left, and moves things
            around so today stays honest — nothing fails, it just gets pushed instead
            of forced.
          </p>

          <ReshuffleDemo />
        </RevealSection>

        <RevealSection className="w-section">
          <p className="w-section-eyebrow">A closer look</p>
          <h2>What it actually<br />looks like.</h2>
          <div className="w-mockup-grid">
            <div className="w-mockup-frame">
              <div className="w-mockup-screen">
                <div className="w-mock-date-row">
                  <span>Tuesday · Aug 4</span>
                  <span>⚙</span>
                </div>
                <div className="w-mock-compare-row">
                  <div className="w-mock-compare-stat">
                    <div className="w-mock-compare-number">3h 10m</div>
                    <div className="w-mock-compare-label">time left</div>
                  </div>
                  <span className="w-mock-fit-icon">✓</span>
                  <div className="w-mock-compare-stat">
                    <div className="w-mock-compare-number">2h 55m</div>
                    <div className="w-mock-compare-label">to get done</div>
                  </div>
                </div>
                <div className="w-mock-rail">
                  <div className="w-mock-rail-fill" />
                  <div className="w-mock-rail-dot" />
                </div>
                <div className="w-mock-rail-endpoints">
                  <span>8a</span>
                  <span>4p</span>
                </div>
                <div className="w-mock-task-row" style={{ marginTop: 14 }}>
                  <span className="w-mock-task-dot" />
                  <span className="w-mock-task-text">Revise quote</span>
                  <span className="w-mock-tag">usually ~45m</span>
                </div>
                <div className="w-mock-task-row">
                  <span className="w-mock-task-dot hazard" />
                  <span className="w-mock-task-text">Draft proposal</span>
                  <span className="w-mock-tag">due today</span>
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
                    <div className="w-mock-pattern-name">Revise quote</div>
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
        </RevealSection>

        <RevealSection className="w-closing" id="request-access">
          <div className="w-closing-badge">
            <span className="w-closing-badge-dot" />
            Currently a private beta
          </div>
          <h2>I built Dokkit because<br />I needed it.</h2>
          <p className="w-closing-sub">
            If you've ever needed a tool that bends around your day instead of
            asking you to bend around it — this might be it. I'm looking for a few
            people to tell me if it helps them too. No pitch, no funnel. Just your
            name and email — I'll reach out personally.
          </p>
          <RequestAccessForm />
        </RevealSection>

        <footer className="w-footer">
          Dokkit — give your thoughts somewhere to go.
        </footer>
      </div>
    </div>
  );
}
