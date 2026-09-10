/** Localize conflict scan findings (backend returns stable ids + English fallback). */
import en from '../locales/en';

const EN_FINDINGS = en.conflictFindings || {};
const EN_ACTIONS = en.deepRepairActions || {};

function proxyScopeLabel(scope, t) {
  if (scope === 'hkcu') return t.conflictScopeHkcu || 'HKCU';
  if (scope === 'hklm') return t.conflictScopeHklm || 'HKLM';
  return scope.toUpperCase();
}

export function localizeConflictFinding(f, t) {
  if (!f) return { title: '', detail: '' };
  const { id, title, detail } = f;

  if (id.startsWith('port_')) {
    const port = id.slice(5);
    return {
      title: typeof t.conflictFindingPortTitle === 'function'
        ? t.conflictFindingPortTitle(port)
        : `Port ${port} in use`,
      detail: t.conflictFindingPortDetail || detail,
    };
  }

  if (id.startsWith('proxy_')) {
    const scope = id.slice(6);
    return {
      title: typeof t.conflictFindingProxyTitle === 'function'
        ? t.conflictFindingProxyTitle(proxyScopeLabel(scope, t))
        : title,
      detail,
    };
  }

  if (id.startsWith('pac_')) {
    const scope = id.slice(4);
    return {
      title: typeof t.conflictFindingPacTitle === 'function'
        ? t.conflictFindingPacTitle(proxyScopeLabel(scope, t))
        : title,
      detail,
    };
  }

  const map = t.conflictFindings || EN_FINDINGS;
  if (map[id]) {
    return map[id];
  }

  return { title, detail };
}

export function formatDeepRepairSummary(result, t) {
  if (!result) return '';
  if (typeof result === 'string') return result;

  const keys = result.action_keys ?? result.actionKeys ?? [];
  const partial = result.partial ?? false;
  const actions = t.deepRepairActions || EN_ACTIONS;
  const parts = keys.map((k) => actions[k] || k);
  if (partial) parts.push(t.deepRepairPartialHint);
  return parts.filter(Boolean).join('; ');
}
