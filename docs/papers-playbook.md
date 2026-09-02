# Papers playbook — how a paper goes from arXiv to /papers

The repeatable pipeline for every entry. One paper = one reproduction repo = one MDX
post. The post is done when a stranger can read it, click the repo, and rerun the
experiment.

**Prime directive: Frankie reads the paper and writes the reproduction code himself.**
Claude's role is scaffolding around the learning, never replacing it: set up the
environment, ask the design questions, review code that's already written, help debug
*after* an attempt, and handle the site plumbing. If Claude is typing experiment code
before Frankie has, the process is being done wrong.

## 0. Pick the paper

Good candidates have ALL of:
- **One crisp, falsifiable claim** you can state in a sentence (that sentence becomes
  `repro.claim` in the frontmatter).
- **A scale knob** — the core effect survives shrinking to a tiny model / small dataset
  / one consumer GPU (Apple-silicon MPS or a single card), ideally < a few hours.
- **A result you can plot** — the money chart is reproducible as ONE figure.

If any of the three is missing, pick a different paper.

## 1. Read the paper (active pass, before any code)

Read with a pen, answering exactly these — they force real understanding and map
straight onto the Run Card and post sections:

1. **The claim:** what is the one falsifiable sentence? Which figure is the money
   figure, and what would it look like if the claim were false?
2. **The setup:** architecture, optimizer, data, and the 2–3 hyperparameters the
   effect actually depends on (vs. incidental choices).
3. **The shrink:** what can be cut while keeping the effect? What did the ablations
   say breaks it?
4. **The prediction:** write down what you expect YOUR small version to do before
   running it. (This becomes the honest material for "what matched, what didn't".)

Then explain the paper to Claude in a few sentences — teaching it back is the check
that the reading stuck. Claude asks follow-ups; gaps found here are cheaper than gaps
found mid-debugging.

## 2. Scope the smallest decisive experiment

Write these four lines BEFORE any code (they become the Run Card):
- `model:` smallest architecture that can show the effect
- `dataset:` smallest data that can show the effect
- `hardware:` what it actually runs on + wall-clock
- `claim:` the paper's claim, at THIS scale

Decide the kill criterion too: what curve/number decides reproduced vs partial vs
diverged?

## 3. Build the repro repo (sibling directory, own GitHub repo)

Layout — keep it this boring on purpose:

```
repro-<slug>/
  README.md          # claim, how to run, expected result, link to the post
  pyproject.toml     # deps via uv; pinned
  train.py           # config dataclass at top; logs metrics.csv; deterministic seed
  plot.py            # metrics.csv → results/curves.png (site palette, dark ground)
  results/
    metrics.csv      # step, train_loss, val_loss, train_acc, val_acc
    curves.png
```

Rules:
- Single-command run: `uv run train.py`. Single-command figure: `uv run plot.py`.
- `train.py` logs to CSV every eval — the post's numbers come from this file, never
  from memory or from a screenshot.
- Seed everything; print the config at startup.
- Figures: dark or transparent background (they sit on the site's dark graph-grid
  panel), Sweetie-16 series colors, readable at 640px wide.

## 4. Run

- Run locally in the background; check the CSV, not vibes.
- Record: wall-clock, hardware string, the step numbers that decide the claim.
- If it diverges from the paper — that's CONTENT, not failure. `result: "partial"` or
  `"diverged"` with an honest `delta` is a better post than a suspiciously clean repro.

## 5. Write the post

- Copy `content/papers/_template.mdx` → `content/papers/<slug>.mdx`.
- Frontmatter first: every Run Card field from the actual run (schema is zod-enforced;
  the build fails loudly if a field is missing).
- Body order is fixed: What the paper claims → Why it matters → The reproduction →
  What matched, what didn't (the `<Callout>` gets the honest divergence) → Takeaways.
- The code snippet in the post is copy-pasted from `train.py`, not paraphrased.
- Display math: `$$` delimiters on their own lines (single-line renders inline).
- Copy the final figure into `public/papers/<slug>/`.

## 6. Verify (all four, no skipping)

1. `npm run build` passes (stop the dev server first — they share `.next/`).
2. The post renders end to end: Run Card values, figure, math block, code highlighting.
3. The repo README's run command works from a fresh clone.
4. Numbers in the post == numbers in `results/metrics.csv`.

## 7. Publish

1. Push the repro repo to GitHub (public); set `repo:` in the frontmatter.
2. Set `status: "published"`, commit, push the site — RSS + sitemap update themselves.
3. Spot-check the live URL after deploy.
