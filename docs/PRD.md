# Supersede — PRD & Spec

**Track:** Education
**One-liner:** Version control for what an organization believes. Watch the
sources of truth, walk the dependency graph to everything downstream of a
dead rule — documents *and people* — retrain on exactly the delta, and
produce the audit trail that proves the organization actually changed.

*Rev 2 — after external review (sol, 2026-07-14): product split into two
configurations so the pharma buyer and the hospital demo stop being one
blurred product; audit claims restated in observable terms (assigned →
assessed → remediated → rechecked, never "belief displaced"); approval
workflow specified; automated watchers cut from v1; demo personas seeded,
plus one live extraction so the graph isn't a hidden fixture.*

## 1. Problem

Experts rarely fail from ignorance; they fail from confident outdated
knowledge, and confidence is precisely what prevents looking things up. You
google what you know you don't know. You never google what you're wrong and
sure about.

Organizations have no propagation mechanism between "the source changed" and
"everything built on it": power posing collapsed in 2015 and is still taught
in corporate trainings; clinical guidance takes years to displace what
clinicians learned in residency; tax preparers apply last year's thresholds
from muscle memory. Existing tools attack fragments: retraction alerts stop
at direct citations, compliance training assigns "re-read the policy"
(click-through, untargeted), spaced-repetition tools strengthen memory but
nothing *displaces* it.

Two gaps, one platform, two configurations: (a) nobody maintains the
dependency graph from sources to downstream artifacts and people;
(b) nobody retrains on the *divergence* — the cases where old and new rules
disagree — which is the only part that needs retraining.

## 2. Two configurations, two buyers

**Propagate (v1 commercial — pharma medical affairs / promotional review).**
Artifact governance only, no people layer. Every marketing claim legally
requires substantiation; a retracted or superseded source is regulatory
exposure (FDA/EMA). Claims libraries are already structured — the easiest
graph to build, an existing budget line, and deadline-shaped pain.
Scope: graph builder + change events + blast radius + artifact remediation +
audit trail. FRs 1–2, 4–7, 11.

**Displace (v2 vertical — hospital CME/quality; also the hackathon demo).**
Adds the people layer: role mapping, instinct probes, artifact-correction
exercises, decay rechecks. Buyer: CME/quality directors under Joint
Commission audit pressure.
Scope: adds FRs 3, 8–10.

The end users of Displace are professionals being checked. Their experience
must be short, specific, and dignified — 10 minutes on their actual delta,
not an hour of generic compliance video. This is the adoption make-or-break.

## 3. Goals / non-goals

**Goals**
- G1: Extract a claims/dependency graph from an organization's corpus with
  per-edge confidence and quoted evidence spans, human-reviewable.
- G2: On a source-of-truth change, produce a triaged blast-radius report —
  load-bearing vs peripheral dependencies — within 1 day of the change being
  entered.
- G3 *(Displace)*: Generate expert-approved divergence cases (old rule ≠ new
  rule answers) and identify which affected people **answered with the old
  rule when assessed** — stated exactly that way. A probe measures one
  response under one wording at one time; the product never claims to
  measure belief.
- G4: Emit an audit trail in observable terms: **assigned → assessed →
  remediated → rechecked**, per person per change, with reviewer approvals
  and version locking (§5.5). The product proves process completion and
  assessed responses, and says so; it does not certify minds.
- G5: Uncertainty visible everywhere; the system never silently guesses.

**Non-goals**
- Not an LMS (integrates with one; SCORM/xAPI export) and not a course
  authoring tool.
- Not medical/legal advice: it flags dependency on changed sources and
  drills the difference; professionals and their reviewers decide substance.
- Does not grade people for punishment; reports aggregate by default,
  individual-level visibility is a buyer-configured policy decision (works
  councils / HR constraints in EU markets).
- v1 has **no automated watcher feeds** (cut after review): manual
  ChangeEvent entry by the customer's designated owner is the v1 path, and
  it's an honest one — the differentiated loop is propagation + remediation
  + proof, not feed coverage. Feeds return as a v2 convenience.

## 4. Data model

```
Source(id, kind ∈ {guideline, regulation, paper, standard, internal_policy},
       version, status ∈ {active, superseded, retracted, corrected}, effective_date)
Claim(id, text, evidence_span, extracted_from → Artifact, supports[] → Source,
      load_bearing_score, confidence, review_status)
Artifact(id, kind ∈ {protocol, course, claim_library_entry, decision_doc,
        marketing_material}, owner → Person, version_lock)
Person(id, role, acts_on[] → Claim)          // Displace only, via role→artifact
ChangeEvent(id, source → Source, old_version, new_version, diff_summary,
            entered_by, validated_by)
DivergenceCase(id, change_event, scenario, old_answer, new_answer, rationale,
               citations{old, new}, status ∈ {draft, approved, retired},
               approved_by, approved_at, version_lock)
Probe(id, person, case@version, answered_with ∈ {old, new, other},
      delivery_evidence, ts)
Remediation(id, person, artifact_exercise, status, recheck_at, recheck_result)
ApprovalRecord(id, actor, role, object_ref@version, action, ts)   // append-only
```

The audit trail is the join: ChangeEvent → affected Claims/Artifacts/(People)
→ Probes → Remediations → rechecks, every step carrying its ApprovalRecord
and version locks.

## 5. Product surfaces & functional requirements

### 5.1 Graph builder (Propagate + Displace)
- FR-1: Corpus ingestion (docs, LMS content, claims libraries, wikis);
  GPT 5.6 extracts claims + source links with quoted evidence spans and
  confidence; below-threshold extractions queue for human review — the
  review UI is a first-class surface with a measured reviewer-effort budget
  (target: < 15 min review per 50 extracted claims by corpus #3).
- FR-2: Load-bearing scoring: does the artifact survive without this claim?
  (structural position + LLM judgment, shown with rationale).
- FR-3 *(Displace)*: People mapping via role → artifact ("all ICU nurses act
  on protocol P-114"), imported from HRIS/LMS. Reported everywhere as
  **potential exposure**, never as knowledge.

### 5.2 Change events (both)
- FR-4: Manual ChangeEvent entry: designated customer owner enters the
  change; a second reviewer validates it (validated_by) before propagation
  runs. Machine-readable diff summary: old rule / new rule / facially
  affected population.

### 5.3 Blast radius & divergence (both; cases are Displace-gated)
- FR-6: On validated ChangeEvent: walk the graph, produce the triaged
  report — load-bearing dependents (rewrite required), peripheral mentions
  (line edits), affected people via role mapping (Displace), each with
  confidence and evidence spans.
- FR-7: Divergence case generator: scenarios where old and new rules give
  different answers, with rationale citing both versions. **Approval gate is
  mandatory:** no case reaches a learner without expert sign-off; cases are
  version-locked at approval; ambiguous cases are retired, not patched
  in-flight (a case answered "old" only counts toward metrics if the case
  was approved and unambiguous — see §8).

### 5.4 Probe → remediate → recheck (Displace)
- FR-8: Instinct probes: approved cases delivered cold (no "the rule
  changed!" banner), 2–4 minutes, mobile-friendly, delivery evidence
  recorded (assigned, opened, completed). Answering with the old rule = an
  assessed old-rule response, located to a person and a case.
- FR-9: Remediation: correct a realistic artifact (order set, return,
  config, claim text) with feedback citing the new source. Passive re-read
  is never the remediation.
- FR-10: Decay rechecks: re-probe with a *different approved case* from the
  same divergence at 30/90 days (same-case retest measures memorization of
  the probe, not the rule).

### 5.5 Audit & approval workflow (both — this is the product in
regulated verticals)
- FR-11: Audit dashboard per ChangeEvent: % artifacts updated (with version
  locks), % affected people assigned / assessed / remediated /
  recheck-clean. Exportable report in exactly those observable terms.
- FR-12: Approval workflow, specified: the customer designates roles for
  (a) ChangeEvent validation, (b) dependency-edge review, (c) divergence-
  case approval, (d) release authorization to affected users. Every action
  writes an append-only ApprovalRecord with authenticated actor and
  version-locked object. Retention policy and export verification
  (checksummed report bundles) included. Without FR-12 the word
  "regulator-grade" is not used anywhere in the product or pitch.

## 6. Architecture

- Postgres for the graph (typed tables); pgvector for corpus retrieval;
  object storage for source documents and report bundles.
- Extraction, divergence generation, probe grading: GPT 5.6 with
  schema-constrained outputs; every generated case stores both rule
  citations; grading of free-text probe answers cites the divergence
  rationale and routes "other/ambiguous" to human review rather than
  forcing old/new.
- Approval workflow + append-only ApprovalRecords + version locking from
  v1 (§5.5).
- Integrations: LMS export (SCORM/xAPI), HRIS import (Displace), Slack/email
  probe delivery with delivery evidence.

## 7. Hackathon vertical slice (Displace configuration, hospital setting)

Fictional hospital dataset: 3 protocols, 1 CME module, a claims sheet, 8
**seeded test personas** across 2 roles (no audience volunteers — scripted
personas with predetermined response patterns, declared as such). One planted
change: an anticoagulation guideline tightens a threshold (modeled on a real
guideline revision, fictional numbers).

Demo script (≈ 5 min):
1. **Live extraction first** (so the graph is visibly not a fixture): paste
   one protocol, watch GPT 5.6 extract three claims with quoted spans and
   link them to sources on screen.
2. Enter the ChangeEvent manually (the honest v1 path — say so); reviewer
   validation click shown.
3. Blast radius renders: protocol P-114 load-bearing (quoted span shown),
   CME module peripheral, 6 of 8 personas potentially exposed via role —
   confidence on every edge.
4. Divergence generator produces 3 cases; expert-approval step shown on one
   (approve, version-lock); show the case: same patient vignette, old rule
   says treat, new rule says hold — both citations visible.
5. Probes run against the seeded personas; persona "R.N. Adams" answers with
   the old rule → assessed old-rule response flagged → artifact-correction
   exercise (edit the order set) → passes → recheck scheduled with a
   different case.
6. Audit dashboard: assigned / assessed / remediated / recheck-pending, per
   person per change, ApprovalRecords visible. The compliance-buyer money
   shot, in honest language.

Real: extraction, graph, blast radius, divergence generation + approval
flow, probes, audit state machine. Seeded: corpus and personas (declared).
Manual: the ChangeEvent (which is the real v1 design, not a mock).

## 8. Success metrics

- Extraction precision on labeled corpus (per-edge, human-reviewed sample)
  AND reviewer-effort budget (FR-1) — precision achieved by drowning
  reviewers doesn't count.
- ChangeEvent-to-report latency (< 1 day from validated entry).
- % probes answering old-rule, **counted only on expert-approved,
  post-hoc-unambiguous cases** (cases retired for ambiguity are excluded
  retroactively). If the rate is ~0, investigate both directions: perfect
  org or toothless cases.
- Recheck outcomes at 90 days on *different-case* rechecks (FR-10).
- Buyer metric: audit-report acceptance by a real compliance officer pilot;
  for Propagate: claims-library coverage and time-to-remediation per
  ChangeEvent.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Extraction errors poison trust | Confidence + quoted spans + review queue with effort budget; approval gates on everything learner-facing |
| Feels like surveillance to professionals | Aggregate-by-default; short, delta-only, dignified UX; observable-terms language (assessed response, not "doesn't know") |
| Medical/legal liability | Assistive positioning, expert sign-off gates (FR-7, FR-12), no autonomous artifact changes |
| Two-products blur returns | Configuration split is contractual: Propagate SKU has no people layer; Displace is a separate vertical with its own onboarding |
| Long enterprise sales cycles | Propagate wedge = pharma claims libraries (existing budget line, structured corpus, deadline pressure) |
| Probe results over-read by buyers | Report language is generated from the observable-terms vocabulary only; "belief", "knows", "competent" are banned strings in report templates |

## 10. Open questions

- Individual-visible vs aggregate-only reporting: policy default per market
  (EU works-council constraints)?
- Pricing: per ChangeEvent processed, per monitored source, or per seat?
  Split by SKU (Propagate per-library, Displace per-seat)?
- When automated watchers return (v2): which feeds first, and does the
  customer's validation step remain mandatory (recommended: yes)?
- How much of Boundary Case Atlas's mechanic (find the flipping assumption)
  becomes a learner-facing exercise type vs internal case-gen machinery?
