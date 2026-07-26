import { useLocation } from 'react-router-dom';

/**
 * Where knowledge links point, given which tree is rendering.
 *
 * The knowledge pages are shared between the staff app (`/knowledge`) and the
 * member portal (`/portal/knowledge`) — the server already decides what each
 * audience may read, so a second copy of these components would be two places
 * to fix the same bug. All they need is to know which prefix to build links
 * from, and the path is the honest source for that: it is what the router
 * matched, not a prop somebody has to remember to thread through.
 */
export function useKnowledgeBasePath(): string {
  const { pathname } = useLocation();
  return pathname.startsWith('/portal') ? '/portal/knowledge' : '/knowledge';
}
