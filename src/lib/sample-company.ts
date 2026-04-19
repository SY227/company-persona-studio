import type { SourceMaterial } from "@/lib/types";

const sampleMaterials: SourceMaterial[] = [
  {
    id: "sample-deck",
    label: "Northstar Operating Brief",
    kind: "sample",
    excerpt:
      "Northstar helps CFO teams close faster with less spreadsheet sprawl.",
    text: `Northstar Systems is a finance operations software company focused on mid-market and upper-mid-market teams.

We help CFOs, controllers, and FP&A leaders replace brittle spreadsheet workflows with a calmer operating system for monthly close, board reporting, and cross-functional planning.

Northstar does not position itself as magic. We position around control, operational clarity, faster cycles, and fewer surprises. The product matters, but confidence matters just as much.

Our value proposition:
- Cut close-cycle friction without forcing a rip-and-replace.
- Give finance leadership one clean operating view of recurring work.
- Reduce reconciliation fire drills and reporting bottlenecks.
- Make planning conversations more grounded and less reactive.

Northstar's tone is precise, calm, and executive-ready. We avoid hype. We do not say we "revolutionize" finance. We say we make important work easier to run.

Preferred messaging themes:
- operational clarity
- institutional-quality reporting
- fewer handoff failures
- a system finance can trust
- practical AI applied inside real workflows

What we avoid:
- flashy consumer language
- vague claims about transformation
- anthropomorphic AI language
- anything that sounds unserious in front of a CFO or audit committee

Northstar is especially strong for companies that have grown beyond ad hoc spreadsheets but do not want a heavy, painful platform rollout.

We often describe the product as a steady operating layer for finance teams that need better coordination, better visibility, and faster decisions.`
  },
  {
    id: "sample-founder-letter",
    label: "Founder Letter",
    kind: "sample",
    excerpt:
      "Good systems reduce drama. Great systems make steady performance repeatable.",
    text: `When finance infrastructure is fragile, every reporting cycle becomes a coordination problem.

The issue is rarely effort. Teams are already working hard. The issue is that too much institutional knowledge lives in scattered sheets, inboxes, and manual follow-ups.

We built Northstar because finance leaders deserve systems that reward discipline. Good systems reduce drama. Great systems make steady performance repeatable.

That is how we think about product design. We are not building a novelty layer on top of existing chaos. We are building software that helps capable teams operate with more confidence.

Our customers want fewer last-minute escalations, cleaner board materials, and a better sense of what changed and why. They want a system that fits how finance work is actually run.

That practical lens shapes everything from product decisions to customer conversations. We try to be measured, direct, and useful.`
  },
  {
    id: "sample-sales-email",
    label: "Sales Email Sequence",
    kind: "sample",
    excerpt:
      "If the close process depends on heroic follow-up, there is usually a systems issue underneath it.",
    text: `Subject: A calmer month-end close

Most finance teams do not need more dashboards. They need less operating drag.

If the close process depends on heroic follow-up, there is usually a systems issue underneath it. Northstar gives finance teams a shared layer for task coordination, exception tracking, and reporting readiness.

That usually means shorter cycles, cleaner handoffs, and less time spent reconciling different versions of the truth.

We are happy to show a live workflow if useful. In twenty minutes, teams usually know whether the fit is real.

---

Subject: Where Northstar tends to fit best

We tend to be most useful once a company has real finance complexity but still wants an implementation that feels pragmatic.

If the team is managing close, board reporting, and planning across spreadsheets, email, and tribal knowledge, Northstar can create structure without forcing a giant change program.

The headline is not automation for its own sake. It is a finance operating system that lowers friction and improves confidence.`
  },
];

export const SAMPLE_COMPANY = {
  id: "northstar-systems",
  name: "Northstar Systems",
  materials: sampleMaterials,
};
