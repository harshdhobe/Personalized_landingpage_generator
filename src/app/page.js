'use client'
import { useState } from 'react'
import Tesseract from 'tesseract.js'
import AdInput from './components/AdInput'
import PreviewPanel from './components/PreviewPanel'

export default function Home() {
  const [adImage, setAdImage] = useState(null)
  const [adImagePreview, setAdImagePreview] = useState(null)
  const [landingUrl, setLandingUrl] = useState('')
  const [adCopy, setAdCopy] = useState('')
  const [result, setResult] = useState(null)
  const [adText, setAdText] = useState('')
  const [ocrError, setOcrError] = useState(null)
  const [improvedHtml, setImprovedHtml] = useState('')
  const [improvedError, setImprovedError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleImageSelected = async (file) => {
    setOcrError(null)
    setAdText('')
    try {
      const { data } = await Tesseract.recognize(file, 'eng')
      const extracted = (data?.text || '').replace(/\s+/g, ' ').trim()
      if (!extracted) {
        setOcrError('Could not detect text in the uploaded image.')
        return
      }
      setAdText(extracted)
    } catch {
      setOcrError('OCR failed. Could not read text from this image.')
    }
  }

  const generateImprovedPreview = async (landingPageUrl, extractedAdText) => {
    const res = await fetch('/api/improved-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landingPageUrl,
        adText: extractedAdText || adCopy || '',
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error || 'Unable to generate preview')
    }
    return json.html
  }

  const handlePersonalize = async () => {
    if (!landingUrl) { setError('Please enter a landing page URL'); return }
    setLoading(true)
    setError(null)
    setImprovedError(null)
    setResult(null)

    try {
      // convert image to base64 if uploaded
      let adImageBase64 = null
      let adImageMime = null
      if (adImage) {
        const buffer = await adImage.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        bytes.forEach(b => binary += String.fromCharCode(b))
        adImageBase64 = btoa(binary)
        adImageMime = adImage.type && adImage.type.startsWith('image/') ? adImage.type : 'image/jpeg'
      }

      const personalizePromise = fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingUrl, adCopy, adImageBase64, adImageMime }),
      })
        .then(async (res) => {
          const json = await res.json()
          if (!res.ok || json.error) {
            throw new Error(json.error || 'Something went wrong')
          }
          return json.data
        })

      const improvedPromise = generateImprovedPreview(landingUrl, adText)

      const [personalizeOutcome, improvedOutcome] = await Promise.allSettled([
        personalizePromise,
        improvedPromise,
      ])

      if (personalizeOutcome.status === 'fulfilled') {
        setResult(personalizeOutcome.value)
      } else {
        setError(personalizeOutcome.reason?.message || 'Something went wrong')
      }

      if (improvedOutcome.status === 'fulfilled') {
        setImprovedHtml(improvedOutcome.value)
        setImprovedError(null)
      } else {
        setImprovedError('Unable to generate preview')
      }

    } catch (err) {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ background: '#0a0814', minHeight: '100vh' }}>
      <nav style={{
        background: '#0a0814', borderBottom: '1px solid #1c1830',
        padding: '0 32px', height: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: '#7c3aed', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>troopod</span>
        </div>
        <span style={{ fontSize: 12, background: '#1c1830', color: '#a78bfa', padding: '5px 14px', borderRadius: 20, border: '1px solid #2e2650' }}>
          Landing Page Personalizer
        </span>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 32px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 8 }}>
            Personalize your landing page
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
            Input your ad creative and landing page URL — AI will rewrite key copy elements to match your ad messaging and boost conversions.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
          <AdInput
            adImage={adImage} adImagePreview={adImagePreview}
            setAdImage={setAdImage} setAdImagePreview={setAdImagePreview}
            landingUrl={landingUrl} setLandingUrl={setLandingUrl}
            adCopy={adCopy} setAdCopy={setAdCopy}
            onImageSelected={handleImageSelected}
            onPersonalize={handlePersonalize} loading={loading} error={error}
          />
          <PreviewPanel
            result={result}
            loading={loading}
            landingUrl={landingUrl}
            adCopy={adCopy}
            adText={adText}
            ocrError={ocrError}
            improvedHtml={improvedHtml}
            improvedError={improvedError}
          />
        </div>
      </div>
    </main>
  )
}