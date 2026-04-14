'use client'
import { useState } from 'react'

export default function PreviewPanel({ result, loading, landingUrl, adCopy, adText, ocrError, improvedHtml, improvedError }) {
    const [tab, setTab] = useState('side')
    const tabs = [['side', 'Side by side'], ['orig', 'Original view'], ['pers', 'Improved view']]

    const hasResult = result?.original && result?.personalized
    const liveUrl = toSafeWebsiteUrl(landingUrl)

    return (
        <div style={{ background: '#110f24', border: '1px solid #1c1830', borderRadius: 16, padding: 24 }}>

            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {tabs.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{
                        fontSize: 13, padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                        border: tab === id ? 'none' : '1px solid #1c1830',
                        background: tab === id ? '#7c3aed' : 'transparent',
                        color: tab === id ? '#fff' : '#6b7280',
                        fontWeight: tab === id ? 600 : 400,
                    }}>
                        {label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: tab === 'side' ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>
                {(tab === 'side' || tab === 'orig') && (
                    <PreviewBox label="Original website (live)" dotColor="#22c55e" accent={false}>
                        <LiveWebsitePanel liveUrl={liveUrl} loading={loading} hasResult={hasResult} result={result} />
                    </PreviewBox>
                )}
                {(tab === 'side' || tab === 'pers') && (
                    <PreviewBox label="Improved design preview" dotColor="#7c3aed" accent>
                        <ImprovedDesignPanel
                            loading={loading}
                            adText={adText}
                            ocrError={ocrError}
                            improvedHtml={improvedHtml}
                            improvedError={improvedError}
                        />
                    </PreviewBox>
                )}
            </div>

            {result?.changes_summary?.length > 0 && (
                <div style={{ background: '#0a0814', border: '1px solid #1c1830', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        What changed
                    </p>
                    {result.changes_summary.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#7c3aed', marginTop: 5, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{c}</span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid #1c1830' }}>
                <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>Changes summary</p>
                    <p style={{ fontSize: 12, color: '#4b5563' }}>
                        {hasResult
                            ? `${result.changes_summary?.length || 0} updates · hero copy ready to paste`
                            : 'Will appear after personalization runs'}
                    </p>
                </div>
                <button
                    disabled={!hasResult}
                    onClick={() => {
                        if (!hasResult) return
                        const { headline, subheadline, cta, urgency_line } = result.personalized
                        const text = `Headline\n${headline}\n\nSubheadline\n${subheadline}\n\nCTA\n${cta}\n\nUrgency\n${urgency_line}\n`
                        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                        const a = document.createElement('a')
                        a.href = URL.createObjectURL(blob)
                        a.download = 'personalized-hero-copy.txt'
                        a.click()
                        URL.revokeObjectURL(a.href)
                    }}
                    style={{
                        fontSize: 13, padding: '8px 16px', border: '1px solid #2e2650',
                        borderRadius: 8, background: 'transparent',
                        color: hasResult ? '#a78bfa' : '#374151',
                        cursor: hasResult ? 'pointer' : 'not-allowed',
                    }}
                >
                    Download copy
                </button>
            </div>
        </div>
    )
}

function PreviewBox({ label, dotColor, accent, children }) {
    return (
        <div style={{ border: `1px solid ${accent ? '#2e2650' : '#1c1830'}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#0a0814', borderBottom: `1px solid ${accent ? '#2e2650' : '#1c1830'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: accent ? '#c4b5fd' : '#6b7280' }}>{label}</span>
            </div>
            <div style={{ padding: 0, minHeight: 320 }}>
                {children}
            </div>
        </div>
    )
}

function toSafeWebsiteUrl(raw) {
    if (!raw || typeof raw !== 'string') return ''
    const trimmed = raw.trim()
    if (!trimmed) return ''
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
        const parsed = new URL(withScheme)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
        return parsed.toString()
    } catch {
        return ''
    }
}

function LiveWebsitePanel({ liveUrl, loading, hasResult, result }) {
    if (!liveUrl) {
        return (
            <div style={{ padding: 20 }}>
                <EmptyState text="Enter a valid landing page URL to see the live website preview here." />
            </div>
        )
    }

    return (
        <div>
            <iframe
                title="Original website live preview"
                src={liveUrl}
                style={{
                    width: '100%',
                    minHeight: 460,
                    border: 'none',
                    background: '#0a0814',
                }}
                referrerPolicy="no-referrer-when-downgrade"
            />
            <div style={{ padding: 14, borderTop: '1px solid #1c1830', background: '#0a0814' }}>
                {loading && !hasResult ? (
                    <SkeletonLoader accent={false} />
                ) : hasResult ? (
                    <HeroContentCard variant="original" data={result.original} compact />
                ) : (
                    <p style={{ fontSize: 12, color: '#6b7280' }}>
                        Run personalization to extract original headline, subheadline, and CTA from this page.
                    </p>
                )}
            </div>
        </div>
    )
}

function ImprovedDesignPanel({ loading, adText, ocrError, improvedHtml, improvedError }) {
    if (loading && !improvedHtml) {
        return (
            <div style={{ padding: 20 }}>
                <SkeletonLoader accent />
            </div>
        )
    }

    if (improvedError && !improvedHtml) {
        return (
            <div style={{ padding: 20 }}>
                <EmptyState text="Unable to generate preview" />
            </div>
        )
    }

    if (improvedHtml) {
        return (
            <div style={{ padding: 20 }}>
                {!!ocrError && (
                    <p style={{
                        fontSize: 12,
                        color: '#fca5a5',
                        border: '1px solid #7f1d1d',
                        background: '#1f0b0b',
                        padding: 10,
                        borderRadius: 8,
                        lineHeight: 1.5,
                        marginBottom: 12,
                    }}>
                        OCR failed. Using ad copy fallback if available.
                    </p>
                )}
                {!!adText?.trim() && (
                    <p style={{
                        fontSize: 12,
                        color: '#a78bfa',
                        border: '1px solid #2e2650',
                        background: '#0a0814',
                        padding: 10,
                        borderRadius: 8,
                        lineHeight: 1.5,
                        marginBottom: 12,
                    }}>
                        Extracted ad text: {adText.trim()}
                    </p>
                )}
                <div style={{ border: '1px solid #2e2650', borderRadius: 10, overflow: 'hidden' }}>
                    <iframe
                        title="Improved design preview"
                        sandbox=""
                        srcDoc={improvedHtml}
                        style={{ width: '100%', minHeight: 540, border: 'none', background: '#fff' }}
                    />
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: 20 }}>
            <EmptyState text="Run personalization to generate the improved design based on your ad creative." />
        </div>
    )
}

function fieldLabel(text) {
    return (
        <p style={{
            fontSize: 10, fontWeight: 600, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px',
        }}>
            {text}
        </p>
    )
}

function HeroContentCard({ variant, data, compact = false }) {
    const muted = variant === 'original'
    return (
        <div style={{ padding: compact ? 0 : 20 }}>
            <div style={{
                borderRadius: 12,
                border: '1px solid #1c1830',
                background: '#0a0814',
                padding: compact ? '16px 14px' : '22px 20px',
            }}>
                {fieldLabel('Headline')}
                <p style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.35, margin: '0 0 18px' }}>
                    {data.headline}
                </p>
                {fieldLabel('Subheadline')}
                <p style={{ fontSize: compact ? 13 : 14, color: muted ? '#9ca3af' : '#c4b5fd', lineHeight: 1.55, margin: '0 0 18px' }}>
                    {data.subheadline}
                </p>
                {fieldLabel('Primary CTA')}
                <div style={{
                    display: 'inline-block',
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: '1px solid #2e2650',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    background: '#110f24',
                }}>
                    {data.cta}
                </div>
            </div>
        </div>
    )
}

function PersonalizedHeroCard({ data, compact = false }) {
    return (
        <div style={{ padding: compact ? 0 : 20 }}>
            <div style={{
                borderRadius: 12,
                border: '1px solid #4c1d95',
                background: 'linear-gradient(165deg, #1e1b4b 0%, #110f24 55%, #0a0814 100%)',
                padding: compact ? '16px 14px' : '22px 20px',
                boxShadow: '0 0 0 1px rgba(124, 58, 237, 0.15)',
            }}>
                {fieldLabel('Headline')}
                <p style={{ fontSize: compact ? 17 : 19, fontWeight: 800, color: '#fff', lineHeight: 1.3, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
                    {data.headline}
                </p>
                {fieldLabel('Subheadline')}
                <p style={{ fontSize: 14, color: '#c4b5fd', lineHeight: 1.55, margin: '0 0 20px' }}>
                    {data.subheadline}
                </p>
                {fieldLabel('CTA')}
                <button
                    type="button"
                    style={{
                        display: 'inline-block',
                        padding: '12px 22px',
                        borderRadius: 8,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#fff',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                        cursor: 'default',
                        marginBottom: 14,
                        boxShadow: '0 4px 16px rgba(124, 58, 237, 0.35)',
                    }}
                >
                    {data.cta}
                </button>
                {fieldLabel('Urgency')}
                <p style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', margin: 0, lineHeight: 1.5 }}>
                    {data.urgency_line}
                </p>
            </div>
        </div>
    )
}

function SkeletonLoader({ accent }) {
    const base = accent ? '#2e2650' : '#1c1830'
    const hi = accent ? '#4c1d95' : '#2e2650'
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[[hi, '55%', 12], [base, '100%', 16], [base, '90%', 12], [hi, '40%', 36], [base, '70%', 10]].map(([bg, w, h], i) => (
                <div key={i} style={{ background: bg, borderRadius: 6, height: h, width: w }} />
            ))}
        </div>
    )
}

function EmptyState({ text }) {
    return (
        <div style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1a1535', border: '1px solid #2e2650', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6, maxWidth: 280, padding: '0 8px' }}>{text}</p>
        </div>
    )
}
