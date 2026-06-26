//
// Verbatim default copy supplied by the client. Stored as markdown.
// Headings use ##, lists use -, horizontal rules use ---.
// On first deploy these become version 1 of each page.

export interface LegalSeed {
  slug: string;
  title: string;
  bodyMarkdown: string;
}

export const DEFAULT_LEGAL_PAGES: LegalSeed[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    bodyMarkdown: `Welcome to VOCALMATCH.

By creating an account or using VOCALMATCH, you agree to these Terms of Service.

Users are responsible for maintaining account security and for all activity conducted under their accounts.

Users may upload songs, lyrics, recordings, performances, videos, images, comments, and related content.

Users represent and warrant that they own or control all rights necessary to upload such content.

Users retain ownership of their content.

By uploading content, users grant VOCALMATCH a worldwide, non-exclusive, royalty-free license to host, display, stream, reproduce, promote, archive, distribute, and share such content within the VOCALMATCH platform and related promotional activities.

Users may not:

- Upload content they do not own or control
- Manipulate voting systems
- Use bots or automated voting
- Impersonate others
- Harass users
- Upload unlawful content
- Interfere with platform operations

VOCALMATCH reserves the right to suspend accounts, remove content, investigate suspicious activity, and enforce platform rules.

All competition outcomes, rankings, voting results, and platform decisions are final.

VOCALMATCH is provided on an "AS IS" and "AS AVAILABLE" basis.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    bodyMarkdown: `VOCALMATCH may collect:

- Name
- Username
- Email address
- IP address
- Device information
- Browser information
- Uploaded content
- Voting activity
- Platform interactions

Information is used to:

- Operate the platform
- Improve services
- Maintain security
- Administer competitions
- Communicate with users
- Prevent abuse and fraud

VOCALMATCH does not sell personal information.

Users may request account deletion by contacting support.`,
  },
  {
    slug: 'dmca',
    title: 'Copyright & DMCA Policy',
    bodyMarkdown: `VOCALMATCH respects intellectual property rights.

Users may upload only content they own or are authorized to use.

Copyright owners who believe content infringes their rights may submit a copyright complaint containing:

- Identification of copyrighted work
- Identification of allegedly infringing material
- Contact information
- Good-faith statement
- Statement under penalty of perjury

VOCALMATCH reserves the right to remove content, suspend repeat infringers, and investigate copyright complaints.

**Copyright Contact:** [copyright@vocalmatch.com](mailto:copyright@vocalmatch.com)`,
  },
  {
    slug: 'competition-rules',
    title: 'Official Competition Rules',
    bodyMarkdown: `Participation in VOCALMATCH competitions is subject to platform rules.

VOCALMATCH reserves the right to:

- Verify eligibility
- Remove fraudulent votes
- Resolve ties
- Disqualify participants
- Modify competition structures
- Investigate suspicious activity

Champion status, rankings, battle outcomes, streaks, and leaderboard positions are determined according to VOCALMATCH platform rules.

All platform decisions regarding competitions are final.`,
  },
  {
    slug: 'community',
    title: 'Community Standards',
    bodyMarkdown: `Users must:

- Respect other users
- Upload lawful content
- Participate honestly

Users may not:

- Cheat
- Manipulate votes
- Harass users
- Upload hateful content
- Upload pornography
- Upload illegal content
- Violate copyrights

VOCALMATCH reserves the right to remove content and suspend accounts that violate community standards.`,
  },
  {
    slug: 'contact',
    title: 'Contact',
    bodyMarkdown: `**Support:** [support@vocalmatch.com](mailto:support@vocalmatch.com)

**Legal:** [legal@vocalmatch.com](mailto:legal@vocalmatch.com)

**Copyright:** [copyright@vocalmatch.com](mailto:copyright@vocalmatch.com)

**General:** [info@vocalmatch.com](mailto:info@vocalmatch.com)`,
  },
];
