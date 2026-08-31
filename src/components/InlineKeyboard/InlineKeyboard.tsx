import './InlineKeyboard.css'

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
  maxLength?: number
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

export default function InlineKeyboard({ value, onChange, onSubmit, disabled = false, maxLength = 40 }: Props) {
  const press = (key: string) => {
    if (disabled) return
    if (key === '⌫') onChange(value.slice(0, -1))
    else if (key === '↵') onSubmit?.()
    else if (value.length < maxLength) onChange(value + key)
  }
  return (
    <div className="inline-keyboard" aria-label="On-screen keyboard">
      {ROWS.map((row) => <div className="inline-keyboard__row" key={row}>
        {[...row].map((key) => <button type="button" key={key} disabled={disabled} onClick={() => press(key)}>{key}</button>)}
      </div>)}
      <div className="inline-keyboard__row inline-keyboard__row--bottom">
        <button type="button" disabled={disabled} onClick={() => press('⌫')} aria-label="Backspace">⌫</button>
        <button type="button" disabled={disabled} onClick={() => press(' ')}>Space</button>
        <button type="button" disabled={disabled} onClick={() => press('↵')} aria-label="Submit">↵</button>
      </div>
    </div>
  )
}
