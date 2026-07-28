from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8-sig')


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')
    print(f'Updated {path}')


def replace(path: str, old: str, new: str) -> None:
    source = read(path)
    if old not in source:
        raise RuntimeError(f'Missing replacement in {path}: {old[:80]}')
    write(path, source.replace(old, new, 1))


def regex_replace(path: str, pattern: str, replacement: str) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Missing regex replacement in {path}: {pattern}')
    write(path, updated)


replace(
    'src/social/socialStoryStream.ts',
    "const nameOf = (id: string) => playerById.get(id)?.name ?? id || 'Someone'",
    "const nameOf = (id: string) => (playerById.get(id)?.name ?? id) || 'Someone'",
)

replace(
    'src/publicOpinion/publicOpinionMiddleware.ts',
    'actionHistory: nextState.social?.actionHistory ?? nextState.social?.sessionLogs ?? [],',
    'actionHistory: nextState.social?.actionHistory ?? [],',
)

regex_replace(
    'src/social/incomingInteractionPresentation.ts',
    r"const RESPONSE_STYLE_BY_TYPE: Record<IncomingInteractionResponseType, IncomingInteractionResponseStyle> = \{.*?\};\n\n",
    '',
)

source = read('src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx')
source = source.replace(
    "import { useEffect, useMemo, useRef, useState } from 'react'",
    "import { useEffect, useMemo, useRef } from 'react'",
    1,
)
source = source.replace(
    "  const [recentlyResolvedIds, setRecentlyResolvedIds] = useState<Set<string>>(() => new Set())",
    "  const recentlyResolvedIdsRef = useRef<Set<string>>(new Set())",
    1,
)
source = source.replace(
    "entry.interaction.resolved || recentlyResolvedIds.has(entry.interaction.id)",
    "entry.interaction.resolved || recentlyResolvedIdsRef.current.has(entry.interaction.id)",
    1,
)
source = source.replace(
    "!recentlyResolvedIds.has(entry.interaction.id) &&",
    "!recentlyResolvedIdsRef.current.has(entry.interaction.id) &&",
    1,
)
source = source.replace(
    "[recentlyResolvedIds, sortedInteractions]",
    "[sortedInteractions]",
    1,
)
source = source.replace(
    "[sortedInteractions, recentlyResolvedIds, currentWeek]",
    "[sortedInteractions, currentWeek]",
    1,
)
source = source.replace(
    """  useEffect(() => {
    if (!open) setRecentlyResolvedIds(new Set())
  }, [open])

""",
    '',
    1,
)
source = source.replace(
    """          setRecentlyResolvedIds((current) => {
            const next = new Set(current)
            next.add(interactionId)
            return next
          })""",
    "          recentlyResolvedIdsRef.current.add(interactionId)",
    1,
)
source = source.replace(
    """    dispatch(closeIncomingInbox())
  }, [dispatch, open, socialModuleAvailability])""",
    """    recentlyResolvedIdsRef.current.clear()
    dispatch(closeIncomingInbox())
  }, [dispatch, open, socialModuleAvailability])""",
    1,
)
source = source.replace(
    "onClick={() => dispatch(closeIncomingInbox())}",
    """onClick={() => {
                recentlyResolvedIdsRef.current.clear()
                dispatch(closeIncomingInbox())
              }}""",
    1,
)
write('src/components/IncomingInteractionsInbox/IncomingInteractionsInbox.tsx', source)

source = read('src/publicOpinion/__tests__/AudiencePulseService.test.ts')
source = source.replace(
    "{ id: 'user', name: 'You', status: 'active', isUser: true },",
    "{ id: 'user', name: 'You', avatar: '🧑', status: 'active', isUser: true },",
)
source = source.replace(
    "{ id: 'lia', name: 'Lia', status: 'active', isUser: false },",
    "{ id: 'lia', name: 'Lia', avatar: '👩', status: 'active', isUser: false },",
)
source = source.replace(
    "{ id: 'echo', name: 'Echo', status: 'active', isUser: false },",
    "{ id: 'echo', name: 'Echo', avatar: '🧑', status: 'active', isUser: false },",
)
source = source.replace(
    "{ id: 'rae', name: 'Rae', status: 'active', isUser: false },",
    "{ id: 'rae', name: 'Rae', avatar: '👩', status: 'active', isUser: false },",
)
write('src/publicOpinion/__tests__/AudiencePulseService.test.ts', source)

for diagnostic in [
    'docs/.social-ux-codemod.txt',
    'docs/.social-ux-tests.txt',
    'docs/.social-ux-static.txt',
]:
    Path(diagnostic).unlink(missing_ok=True)

print('Social UX validation follow-up complete')
