# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- First view: a bundled sample garden ("The old lighthouse keeper opened the door and") drawn as a tree of next-token branches whose thickness follows probability, with no key and no network.
- The "specimen plate" look: warm paper and moss-ink colours in light and dark themes (contrast and colour-blind checked), self-hosted IBM Plex Mono and Instrument Serif, the token-garden logo, wordmark and favicon, and a specimen label beside each garden showing its prompt, model, k and recording date. On small screens the garden scrolls sideways instead of shrinking its labels.
- The garden reads at a glance: branch thickness is the chance of each next token, a dashed "other tokens" stub shows the share outside the top-k, marker shapes and dash patterns tell grown, growable and not-recorded branches apart (never colour alone), hovering a branch shows its exact percentage and the path chance, a readout under the drawing spells the continuation being read, and a legend explains thickness and markers. Spaces and newlines in tokens are shown as `·` and `↵`. On phones the drawing opens at the first fork with a "Scroll sideways" cue.
- Explore the recorded garden: click a branch to grow or collapse it (the branch you clicked stays still while the tree reshapes, and only the new branches grow in, with no motion when reduced motion is on); a branch outside the recording shows a calm "Not in this recording." note without any network request. The address bar always reopens the fork you are reading (`?path=1.0`), "Copy link" in the header copies it, and a link that goes past the recording opens as far as it can with a short notice. Thick dashed branches keep real dashes.
- Keyboard and screen readers: the garden is one Tab stop and a real tree (arrow keys, Home/End, Enter/Space to grow or collapse), so even the thinnest branch is reachable and shows its percentage on focus; each branch is announced like "looked, 8.9 percent". A "Table view" lists every visible branch with the same numbers, a polite status line announces growth, not-recorded notes and copied links, and on phones the focused branch never hides under the sticky readout.
