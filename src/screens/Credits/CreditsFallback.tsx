type CreditsFallbackProps = {
  posterUrl?: string
}

export default function CreditsFallback({ posterUrl }: CreditsFallbackProps) {
  return (
    <div className="credits-fallback" aria-hidden="true" data-testid="credits-background-fallback">
      <div
        className="credits-fallback__skyline"
        style={posterUrl ? { backgroundImage: `url(${JSON.stringify(posterUrl)})` } : undefined}
        aria-hidden="true"
      />
      <div className="credits-fallback__lights" aria-hidden="true" />
    </div>
  )
}
