from pathlib import Path
import re

path = Path('src/components/TetrisComp/TetrisComp.tsx')
source = path.read_text()

import_anchor = "import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'\n"
import_line = "import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'\n"
if import_line not in source:
    if import_anchor not in source:
        raise SystemExit('Tetris import anchor not found')
    source = source.replace(import_anchor, import_anchor + import_line, 1)

houseguest_pattern = re.compile(
    r'''      \{participant\?\.avatar \? \(\n'''
    r'''\s*<img src=\{participant\.avatar\} alt="" draggable=\{false\} />\n'''
    r'''\s*\) : \(\n'''
    r'''\s*initials \|\| '\?'\n'''
    r'''\s*\)\}'''
)
houseguest_replacement = '''      {participant ? (
        <ResolvedAvatarImage
          id={participant.id}
          name={participant.name}
          avatar={participant.avatar}
          isUser={participant.isHuman}
          alt=""
          draggable={false}
        />
      ) : (
        initials || '?'
      )}'''
source, houseguest_count = houseguest_pattern.subn(houseguest_replacement, source, count=1)
if houseguest_count != 1:
    raise SystemExit(f'Expected one HouseguestAvatar image block, found {houseguest_count}')

cell_pattern = re.compile(
    r'''  return participant\?\.avatar \? \(\n'''
    r'''\s*<img className="tetris-avatar-cell-image" src=\{participant\.avatar\} alt="" draggable=\{false\} />\n'''
    r'''\s*\) : \(\n'''
    r'''\s*<span className="tetris-avatar-cell-initials">\{initials \|\| '\?'\}</span>\n'''
    r'''\s*\)'''
)
cell_replacement = '''  return participant ? (
    <ResolvedAvatarImage
      id={participant.id}
      name={participant.name}
      avatar={participant.avatar}
      isUser={participant.isHuman}
      className="tetris-avatar-cell-image"
      alt=""
      draggable={false}
    />
  ) : (
    <span className="tetris-avatar-cell-initials">{initials || '?'}</span>
  )'''
source, cell_count = cell_pattern.subn(cell_replacement, source, count=1)
if cell_count != 1:
    raise SystemExit(f'Expected one AvatarCell image block, found {cell_count}')

path.write_text(source)
