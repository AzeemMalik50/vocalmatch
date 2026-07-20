import type { Metadata } from 'next';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'About',
  description:
    'The story behind VOCALMATCH — one song, two voices, one crown.',
};

/**
 * Public /about page.
 *
 * Long-form founder story from Vincent Lloyd Thompson, followed by
 * distilled Mission / Vision / Purpose blocks. Section order matches
 * the Phase 1 spec.
 */
export default function AboutPage() {
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-black py-16 md:py-24 border-b border-stage-800">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at 30% 40%, rgba(220,46,60,0.45) 0%, transparent 55%), radial-gradient(circle at 70% 60%, rgba(212,165,75,0.28) 0%, transparent 55%)',
            }}
          />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-spotlight font-black mb-3">
              About VOCALMATCH
            </p>
            <h1 className="font-display text-5xl md:text-7xl font-black text-white leading-none mb-6">
              One Song.
              <br />
              Two Voices.
              <br />
              <span className="text-gold">One Crown.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
              A premium entertainment platform where every performance is a
              title fight — and the Crown can be taken at any time.
            </p>
          </div>
        </section>

        {/* Founder story */}
        <section className="bg-background py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-black mb-3">
              Founder Story
            </p>
            <h2 className="font-display text-3xl md:text-5xl font-black text-white mb-8">
              The Story Behind VOCALMATCH
            </h2>

            <div className="space-y-5 text-base md:text-lg text-white/75 leading-relaxed">
              <p>
                My name is <span className="text-white font-semibold">Vincent Lloyd Thompson</span>, and music has been
                the soundtrack of my life for as long as I can remember.
              </p>
              <p>
                At eight years old, I discovered the joy of singing. My mother was a wonderful singer, and I like to
                think I inherited her gift. Our home was filled with the timeless voices of Nat King Cole, Billie
                Holiday, Johnny Mathis, and Dionne Warwick. She owned their albums, and I would spend countless hours
                sitting in front of our stereo, singing every song from beginning to end.
              </p>
              <PullLine>Those weren&rsquo;t just records. They were my classroom.</PullLine>
              <p>
                Without realizing it, I was learning phrasing, emotion, melody, and the power of a great song. Music
                wasn&rsquo;t just something I enjoyed — it became part of who I was.
              </p>
              <p>Then, at thirteen years old, something extraordinary happened.</p>
              <PullLine>I discovered I could write songs.</PullLine>
              <p>
                It felt as though someone had flipped a switch inside me. Songwriting came as naturally as breathing.
                Melodies flowed effortlessly. Lyrics seemed to write themselves. Every new idea led to another song, and
                before long, I had built a growing catalog of original music.
              </p>
              <p>
                From that moment on, I knew exactly what I wanted to do with my life. I wanted to become a recording
                artist.
              </p>
              <p>
                Back then, there was no YouTube. No Spotify. No TikTok. No social media. If you wanted to be discovered,
                you mailed demo tapes to record companies and hoped someone in the A&amp;R department would actually
                listen. It was a dream shared by thousands, but realized by very few.
              </p>
              <p>One day, that dream suddenly felt real. I came home to a voicemail that changed everything.</p>
              <PullLine>
                &ldquo;Vincent, Columbia Records heard your song, Love Maze, and we&rsquo;d like to hear more.&rdquo;
              </PullLine>
              <p>I was twenty-one years old. It was one of the most exciting moments of my life.</p>
              <p>
                But I was also young, inexperienced, and completely unaware of how the music business really worked. I
                didn&rsquo;t understand that when a major record company falls in love with one song, the next songs
                you send have to be just as unforgettable. Unfortunately, mine weren&rsquo;t. The opportunity slipped
                away almost as quickly as it had arrived.
              </p>
              <p>At first, I was disappointed. Eventually, I realized something much bigger.</p>
              <p>
                Breaking into the music industry wasn&rsquo;t simply about talent. Thousands of gifted singers and
                brilliant songwriters were never being discovered. Incredible songs disappeared before anyone heard
                them. Extraordinary voices never got the opportunity they deserved.
              </p>
              <p>That realization never left me.</p>
              <p>
                Years later, the internet changed everything. For the first time in history, artists no longer needed
                permission from record labels to share their music with the world. The gatekeepers were no longer the
                only path to success.
              </p>
              <p>That&rsquo;s when an idea came to me — an idea I couldn&rsquo;t stop thinking about.</p>
              <p>
                What if there was a platform where great songs and great voices could be discovered together? What if
                every singer performed the exact same song, allowing audiences to hear, for the first time, how
                differently one song could be interpreted? What if the world — not judges, not record executives, not
                industry insiders — decided which voice connected most deeply with the song? And what if one
                extraordinary song could launch multiple extraordinary careers?
              </p>
              <PullLine>That idea became VOCALMATCH.</PullLine>
              <p>
                The original vision was developed as a television series. I spent years refining the format, producing
                presentation materials, and pitching it to the entertainment industry. The concept generated interest,
                including conversations with Warner Bros., and I truly believed the dream was within reach.
              </p>
              <p>
                Then the world changed. COVID brought countless projects across the entertainment industry to a
                standstill, and VOCALMATCH was one of them.
              </p>
              <p>Many people would have walked away. I couldn&rsquo;t.</p>
              <p>Because this was never just a television show. It was a mission.</p>
              <p>There&rsquo;s an old saying:</p>
              <PullLine>
                &ldquo;If the mountain won&rsquo;t come to Mohammed, then Mohammed must go to the mountain.&rdquo;
              </PullLine>
              <p>
                So instead of waiting for television to embrace the idea, I decided to build it myself. Today, after
                decades of dreaming, writing, learning, failing, growing, and refusing to give up, that vision has
                evolved into <span className="text-white font-semibold">VOCALMATCH 2.0</span>.
              </p>
            </div>
          </div>
        </section>

        {/* Mission / Why / Vision / Purpose */}
        <section className="bg-black py-16 md:py-24 border-t border-stage-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-14 md:space-y-16">
            <AboutBlock
              eyebrow="Mission"
              title="Our Mission"
              body={
                'At VOCALMATCH, our mission is to discover and celebrate the extraordinary connection between great songs and unforgettable voices.\n\n' +
                'We believe that a truly great song deserves its greatest voice. By giving talented singers the opportunity to compete on the same song, and empowering audiences around the world to decide the winner, we are creating a new kind of music competition built on authenticity, talent, and passion.\n\n' +
                'VOCALMATCH exists to give gifted singers, songwriters, and creators a global stage where talent — not industry connections — determines success. Every performance is an opportunity to inspire, every challenge is a chance to earn the crown, and every vote helps shape the future of music.\n\n' +
                'We are committed to restoring the song to its rightful place at the center of the music experience while creating a transparent, exciting, and community-driven platform where artists can be discovered and celebrated.'
              }
            />

            <AboutBlock
              eyebrow="Why VOCALMATCH Exists"
              title="Talent, not connections"
              body="Thousands of gifted singers and brilliant songwriters were never being discovered. Incredible songs disappeared before anyone heard them. Extraordinary voices never got the opportunity they deserved. VOCALMATCH exists so that talent — not connections — has the opportunity to rise."
            />

            <AboutBlock
              eyebrow="Vision"
              title="The world decides"
              body="A platform where great songs and great voices are discovered together. Where every singer performs the exact same song, and audiences hear — for the first time — how differently one song can be interpreted. Where the world decides which voice connects most deeply with the song. And where one extraordinary song can launch multiple extraordinary careers."
            />

            <AboutBlock
              eyebrow="Purpose"
              title="One life at a time"
              body={
                'If one undiscovered songwriter hears their song performed around the world…\n' +
                'If one unknown singer finally finds the audience they deserve…\n' +
                'If one life is changed because this platform gave them a chance…\n\n' +
                'Then every setback, every disappointment, and every year spent believing in this dream will have been worth it.'
              }
            />

            {/* Championship Experience Design Principles — added per
                spec addendum. Every page in Phase 1 should reinforce
                these principles; this block is the reference the rest
                of the platform is designed against. */}
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-black mb-3">
                Design Principles
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-black text-white mb-6">
                Every page is a championship
              </h2>
              <p className="text-base md:text-lg text-white/70 leading-relaxed mb-6">
                VOCALMATCH is not a traditional singing competition — it&rsquo;s a
                live, ongoing championship. Every page, every animation, every
                line of copy is designed to reinforce one idea: the Crown is on
                the line, right now.
              </p>
              <ul className="space-y-3">
                {[
                  'The Crown is on the Line.',
                  'The Official Voice is defending the Crown.',
                  'The Challenger is trying to take it.',
                  'The audience decides the outcome.',
                  'Every vote matters.',
                  'Every battle has consequences.',
                  'Every visitor should leave wondering, “Who will wear the Crown next?”',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 text-white/80"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 rounded-full bg-gold shrink-0"
                    />
                    <span className="text-base md:text-lg leading-relaxed">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-white/50 italic">
                These principles guide presentation, messaging, animation, and
                user experience across the entire platform.
              </p>
            </div>

            <div className="text-center pt-6">
              <p className="text-white/60 italic mb-6">
                No judges. No gatekeepers.
              </p>
              <p className="font-display text-3xl md:text-5xl font-black text-white leading-none mb-4">
                One Song. Two Voices.
                <br />
                <span className="text-gold">One Crown.</span>
              </p>
              <p className="text-white/70">The world decides.</p>
              <p className="mt-8 text-xs uppercase tracking-[0.35em] text-spotlight font-black">
                Welcome to VOCALMATCH.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function PullLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-lg md:text-xl font-display text-gold border-l-2 border-gold/60 pl-4 py-1 italic">
      {children}
    </p>
  );
}

function AboutBlock({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-black mb-3">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl md:text-4xl font-black text-white mb-4">
        {title}
      </h2>
      <p className="text-base md:text-lg text-white/70 leading-relaxed whitespace-pre-line">
        {body}
      </p>
    </div>
  );
}
