# README Catalog

Use this guide when adding, removing, renaming, or materially changing a skill.

## Rule

Update the root `README.md` in the same change.

The README is the repo index and must stay in sync with the filesystem.

## Groups

The README keeps factory workflow skills separate from the rest, in three `##` sections:

- **Factory Workflow** — `factory` and the skills it calls directly or through another skill. Order the table top-down, from high level to low level: the orchestrator first, then the stage skills in pipeline order, then skills those stages delegate to. Keep the call tree above the table in sync with the factory `SKILL.md`. Keep the multi-skill install command in sync with this section.
- **Other Skills** — standalone skills, under `###` purpose groups (currently Setup and Understand). Place a new skill in the best-fitting group; add a new `###` group only if none fits.
- **Legacy Skills** — retired skills. Retiring a skill means moving its row here, and out of the call tree if it was in the factory workflow.

## Minimum Update

- add or update the skill in the catalog table
- include the correct individual install command:

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill <skill-name>
```

- keep the README summary aligned with the skill's frontmatter and scope
