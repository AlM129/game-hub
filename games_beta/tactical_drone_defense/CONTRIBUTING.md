# Contributing to Tactical Drone Defense

## Purpose

This document defines the rules and guidelines for contributing code to Tactical Drone Defense. These rules apply to both human developers and AI coding agents.

---

## General Rules

### Before Making Changes

- **Understand existing systems** — Read the relevant source files and documentation before modifying code.
- **Do not rewrite working code unnecessarily** — If a system works and is maintainable, extend it rather than replacing it.
- **Preserve backwards compatibility** — When possible, ensure existing functionality continues to work after your changes.
- **Document your changes** — Update documentation (README, DEVELOPMENT, CHANGELOG) when adding or modifying features.

### Code Style

- Maintain clear, descriptive variable and function names
- Add comments for complex systems, algorithms, or non-obvious behavior
- Keep files organized by responsibility (one file per system)
- Avoid creating duplicate systems — check if existing functionality can be extended

---

## Testing Requirement

> **Every change must be tested in the running game before being considered complete.**

### Required Testing Steps

1. **Run the game** — Serve the project directory and open in a browser
2. **Verify the changed feature** — Test that your modification works as intended
3. **Check browser console** — Look for errors, warnings, or unexpected log output
4. **Test related systems** — Ensure your change doesn't break adjacent functionality

### Never

- Mark a task complete without runtime testing
- Assume code will work without verifying in the browser
- Skip testing because "it's just a small change"

---

## AI Agent Rules

AI agents (including Cline, Copilot, and other coding assistants) must follow these additional rules:

### Required Reading

Before making any changes, AI agents must read:

- `README.md` — Project overview and feature documentation
- `DEVELOPMENT.md` — Architecture and system documentation
- Relevant source files for the system being modified

### Prohibited Actions

- **Do not guess project behavior** — If documentation is unclear, read the source code to verify
- **Do not delete systems without approval** — Removing functionality requires explicit discussion
- **Do not make major architecture changes without asking** — Restructuring core systems needs human review

### Required Actions

- **Test changes manually** — Run the game and verify the feature works
- **Document what was changed** — Update CHANGELOG.md with clear descriptions
- **Check for side effects** — Ensure changes don't break other systems

---

## Versioning

This project follows **Semantic Versioning** (SemVer):

```
Major.Minor.Patch
```

- **Major**: Breaking changes or major new features
- **Minor**: New features, non-breaking additions
- **Patch**: Bug fixes, small improvements

### Development Builds

Development versions use the format:

```
v2.0.0-devXX
```

Where `XX` is the build number (e.g., `dev40`).

### Version Update Rules

- Update version numbers consistently across all files
- Current version is defined in `js/main.js` as `VERSION`
- Update `CHANGELOG.md` with each version change
- Include the version in `index.html` title

---

## Bug Fixes

When fixing bugs, document the following in your commit/PR:

1. **Cause** — What was the root cause of the bug?
2. **Fix** — What change was made to resolve it?
3. **Testing performed** — What steps were taken to verify the fix?

### Bug Fix Checklist

- [ ] Identify root cause
- [ ] Implement fix
- [ ] Test in running game
- [ ] Check browser console for errors
- [ ] Test related systems for regression
- [ ] Update CHANGELOG.md

---

## Feature Additions

Before adding new features, document:

1. **Purpose** — Why is this feature needed?
2. **Design** — How will it be implemented? What systems will it affect?
3. **Possible side effects** — What existing functionality might be impacted?

### Feature Addition Checklist

- [ ] Document purpose and design
- [ ] Implement the feature
- [ ] Test in running game
- [ ] Check browser console for errors
- [ ] Test all related systems
- [ ] Update README.md (if user-facing feature)
- [ ] Update DEVELOPMENT.md (if architecture change)
- [ ] Update CHANGELOG.md
- [ ] Add test cases to TESTING.md (if applicable)

---

## Code Quality Standards

### Naming Conventions

- **Variables**: camelCase (`playerHealth`, `isFiring`)
- **Functions**: camelCase (`spawnEnemy()`, `takeDamage()`)
- **Constants**: UPPER_SNAKE_CASE (`PLAYER_SPEED`, `CLIP_SIZE`)
- **Classes/Constructors**: Not used (project uses functions and objects)

### File Organization

- Each major system gets its own file in `js/`
- Related utilities stay together (e.g., all enemy types in `enemies.js`)
- HTML structure in `index.html`, styles in `css/main.css`

### Comment Guidelines

- Add comments for:
  - Complex algorithms or state machines
  - Non-obvious behavior or workarounds
  - Public API functions (parameters, return values)
  - Game constants with units
- Do NOT add comments for:
  - Obvious code (`// increment counter`)
  - Self-documenting code with clear naming

---

## Pull Request Process

1. Make changes in a feature branch
2. Test thoroughly (see Testing Requirement above)
3. Update documentation as needed
4. Update CHANGELOG.md
5. Submit pull request with clear description of changes

### PR Description Template

```markdown
## Summary
Brief description of changes

## Changes Made
- List of specific changes

## Testing Performed
- What was tested
- How it was tested
- Results

## Related Issues
Closes #(issue number)
```

---

## Questions?

If you're unsure about any aspect of the codebase or contribution process:

- Read the source files — they are the source of truth
- Check existing documentation (README, DEVELOPMENT, TESTING)
- Ask the project maintainer for clarification