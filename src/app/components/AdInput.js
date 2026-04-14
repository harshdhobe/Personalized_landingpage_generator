'use client'
import { useRef } from 'react'

export default function AdInput({
    adImagePreview, setAdImage, setAdImagePreview,
    landingUrl, setLandingUrl, adCopy, setAdCopy,
    onImageSelected,
    onPersonalize, loading, error,
}) {
    const fileRef = useRef()

    const handleFile = (e) => {
        const f = e.target.files[0]; if (!f) return
        setAdImage(f); setAdImagePreview(URL.createObjectURL(f))
        if (onImageSelected) onImageSelected(f)
    }
    const handleDrop = (e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]; if (!f) return
        setAdImage(f); setAdImagePreview(URL.createObjectURL(f))
        if (onImageSelected) onImageSelected(f)
    }

    return (
        <div style={{
            background: '#110f24',
            border: '1px solid #1c1830',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
        }}>

            {/* Upload */}
            <Label text="Ad creative" />
            <div
                onClick={() => fileRef.current.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                style={{
                    border: '1.5px dashed #2e2650',
                    borderRadius: 12,
                    padding: adImagePreview ? 10 : '32px 20px',
                    textAlign: 'center',
                    marginBottom: 20,
                    background: '#0a0814',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                }}
            >
                {adImagePreview ? (
                    <img src={adImagePreview} alt="Ad preview" style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
                ) : (
                    <>
                        <div style={{
                            width: 40, height: 40, background: '#1c1830', borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Upload ad image</p>
                        <p style={{ fontSize: 12, color: '#4b5563' }}>PNG, JPG · drag & drop or click to browse</p>
                    </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {/* Inputs */}
            <Label text="Landing page URL" required />
            <Input
                value={landingUrl}
                onChange={e => setLandingUrl(e.target.value)}
                placeholder="https://yoursite.com/landing"
            />

            <Label text="Ad copy (optional)" />
            <Input
                value={adCopy}
                onChange={e => setAdCopy(e.target.value)}
                placeholder="e.g. 50% off Winter Jackets — today only"
            />

            {error && (
                <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12, marginTop: -8 }}>{error}</p>
            )}

            {/* CTA */}
            <button
                onClick={onPersonalize}
                disabled={loading}
                style={{
                    width: '100%', background: loading ? '#4c1d95' : '#7c3aed',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '13px 0', fontSize: 14, fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s',
                    marginBottom: 24,
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                {loading ? 'Personalizing...' : 'Personalize page'}
            </button>

            {/* Divider */}
            <div style={{ borderTop: '1px solid #1c1830', marginBottom: 20 }} />

            {/* What changes */}
            <Label text="What gets changed" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                    ['H1 headline matched to ad offer', '#7c3aed'],
                    ['Subheadline aligned to ad tone', '#7c3aed'],
                    ['CTA button text updated', '#7c3aed'],
                    ['Urgency line added near CTA', '#7c3aed'],
                ].map(([text]) => (
                    <div key={text} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', background: '#0a0814',
                        borderRadius: 8, border: '1px solid #1c1830',
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#9ca3af' }}>{text}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Label({ text, required }) {
    return (
        <p style={{
            fontSize: 11, fontWeight: 600, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
        }}>
            {text}{required && <span style={{ color: '#7c3aed', marginLeft: 3 }}>*</span>}
        </p>
    )
}

function Input({ value, onChange, placeholder }) {
    return (
        <input
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            style={{
                width: '100%', background: '#0a0814',
                border: '1px solid #1c1830', borderRadius: 8,
                padding: '10px 14px', fontSize: 13,
                color: '#e2e8f0', marginBottom: 16, outline: 'none',
                transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#7c3aed'}
            onBlur={e => e.target.style.borderColor = '#1c1830'}
        />
    )
}