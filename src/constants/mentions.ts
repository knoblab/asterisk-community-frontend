export type MentionType = 'bot' | 'role' | 'user';

export interface MentionCheckResult {
  enabled: boolean;
  disabledMessage?: string;
}

export interface MentionDefinition {
  id: string;
  handle: string; // e.g. '@asterisk'
  name: string;
  description?: string;
  type: MentionType;
  badge?: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
  iconType?: 'knoblab' | 'user' | 'role';
  checkEnabled?: (context: { aiEnabled: boolean | null }) => MentionCheckResult;
}

/**
 * Built-in registered mentions registry.
 * Can be dynamically extended via registerMention().
 */
export const REGISTERED_MENTIONS: MentionDefinition[] = [
  {
    id: 'asterisk',
    handle: '@asterisk',
    name: 'asterisk',
    description: 'AI 어시스턴트',
    type: 'bot',
    badge: 'AI',
    badgeBgColor: 'rgba(229, 57, 53, 0.14)',
    badgeTextColor: 'var(--color-functional-red)',
    iconType: 'knoblab',
    checkEnabled: ({ aiEnabled }) => ({
      enabled: aiEnabled !== false,
      disabledMessage: '준비중인 기능입니다',
    }),
  },
];

/**
 * Register a new mention definition dynamically for future feature expansion.
 */
export const registerMention = (definition: MentionDefinition): void => {
  const existingIdx = REGISTERED_MENTIONS.findIndex(
    (m) => m.id === definition.id || m.handle.toLowerCase() === definition.handle.toLowerCase()
  );
  if (existingIdx >= 0) {
    REGISTERED_MENTIONS[existingIdx] = definition;
  } else {
    REGISTERED_MENTIONS.push(definition);
  }
};

/**
 * Return all registered mentions.
 */
export const getRegisteredMentions = (): MentionDefinition[] => {
  return [...REGISTERED_MENTIONS];
};

/**
 * Find a registered mention by its handle (e.g. '@asterisk') or id ('asterisk').
 */
export const getKnownMention = (handleOrId?: string | null): MentionDefinition | undefined => {
  if (!handleOrId) return undefined;
  const normalized = handleOrId.trim().toLowerCase();
  const handleWithAt = normalized.startsWith('@') ? normalized : `@${normalized}`;
  return REGISTERED_MENTIONS.find(
    (m) => m.handle.toLowerCase() === handleWithAt || m.id.toLowerCase() === normalized
  );
};

/**
 * Check whether a handle is an existing registered mention.
 */
export const isKnownMention = (handle?: string | null): boolean => {
  return Boolean(getKnownMention(handle));
};

/**
 * Filter mentions matching typed query (e.g. after typing '@' or '@ast').
 */
export const filterMentions = (
  query: string,
  _context?: { aiEnabled?: boolean | null }
): MentionDefinition[] => {
  const cleanQuery = query.replace(/^@/, '').trim().toLowerCase();
  if (!cleanQuery) {
    return getRegisteredMentions();
  }
  return getRegisteredMentions().filter((m) => {
    const handleWithoutAt = m.handle.slice(1).toLowerCase();
    const nameLower = m.name.toLowerCase();
    const idLower = m.id.toLowerCase();
    return (
      handleWithoutAt.includes(cleanQuery) ||
      nameLower.includes(cleanQuery) ||
      idLower.includes(cleanQuery)
    );
  });
};
