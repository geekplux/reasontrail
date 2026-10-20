# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- First view: a bundled sample garden ("The old lighthouse keeper opened the door and") drawn as a tree of next-token branches whose thickness follows probability, with no key and no network.
- The "specimen plate" look: warm paper and moss-ink colours in light and dark themes (contrast and colour-blind checked), self-hosted IBM Plex Mono and Instrument Serif, the token-garden logo, wordmark and favicon, and a specimen label beside each garden showing its prompt, model, k and recording date. On small screens the garden scrolls sideways instead of shrinking its labels.
- The garden reads at a glance: branch thickness is the chance of each next token, a dashed "other tokens" stub shows the share outside the top-k, marker shapes and dash patterns tell grown, growable and not-recorded branches apart (never colour alone), hovering a branch shows its exact percentage and the path chance, a readout under the drawing spells the continuation being read, and a legend explains thickness and markers. Spaces and newlines in tokens are shown as `·` and `↵`. On phones the drawing opens at the first fork with a "Scroll sideways" cue.
