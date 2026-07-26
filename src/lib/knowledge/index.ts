/**
 * The platform knowledge library.
 *
 * Two audiences, one search index. Combining them here rather than keeping two
 * separate libraries means a question can be answered from whichever side has
 * the better article, while the `audience` field still prevents a member ever
 * being shown staff operations material.
 */

import type { KbArticle } from './types';
import { STAFF_ARTICLES } from './staff';
import { MEMBER_ARTICLES } from './member';

export const ALL_ARTICLES: KbArticle[] = [...STAFF_ARTICLES, ...MEMBER_ARTICLES];

export { STAFF_ARTICLES, MEMBER_ARTICLES };
export * from './types';
export { search, byCategory, articleBySlug, tokenize, stem } from './search';
export { answer, suggestedQuestions, type AccountFacts, type Answer } from './answer';
