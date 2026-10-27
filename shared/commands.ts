// The commands people type, shared by the CLI's --help, the skill installer and the website's Install section,
// so the three can never disagree. No DOM or Node imports.

export const PKG_NAME = 'reasontrail';
export const NPX = `npx ${PKG_NAME}`;

/** Where `install-skill` puts the skill, per agent (home-relative, as the help text prints them). */
export const SKILL_HOMES = {
  claude: '~/.claude/skills',
  grok: '~/.grok/skills',
  codex: '~/.agents/skills',
} as const;

/** How each agent invokes an installed skill. */
export const SKILL_CALL = { slash: `/${PKG_NAME}`, codex: `$${PKG_NAME}` } as const;

/** The commands the website shows, in order. Each one must parse with the CLI's own argument reader. */
export const COMMANDS = {
  installSkill: `${NPX} install-skill`,
  installOne: `${NPX} install-skill --target codex`,
  open: NPX,
  list: `${NPX} --list`,
  share: `${NPX} --share`,
  file: `${NPX} path/to/session.jsonl`,
} as const;
