import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

const PROMPT_TEMPLATE = `SYSTEM:
You are a CRO (Conversion Rate Optimization) expert and landing page optimizer.

USER:
You are given:

1. Ad creative text:
{adText}

2. Landing page URL:
{landingPageUrl}

Your task:

* Analyze the ad intent (offer, audience, tone)
* Infer the current landing page structure
* Redesign the landing page to match the ad

IMPORTANT RULES:

* Do NOT create a completely new page
* Preserve structure (header, sections, flow)
* Only improve:

  * Headlines
  * Hero section
  * CTA text
  * Section messaging
* Ensure strong message match with the ad
* Apply CRO best practices

OUTPUT FORMAT:
Return clean HTML for the improved version of the page.
Keep it structured and realistic (no placeholders like lorem ipsum).`

function buildPrompt(adText, landingPageUrl) {
    return PROMPT_TEMPLATE
        .replace('{adText}', adText || '')
        .replace('{landingPageUrl}', landingPageUrl || '')
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseStatusCode(err) {
    const msg = String(err?.message || '')
    const m = msg.match(/\[(\d{3})\s/)
    return m ? Number(m[1]) : null
}

function parseRetryDelaySeconds(err) {
    const msg = String(err?.message || '')
    const m = msg.match(/Please retry in\s+([0-9.]+)s/i)
    if (m) return Math.max(1, Math.ceil(Number(m[1])))
    const m2 = msg.match(/"retryDelay":"(\d+)s"/i)
    if (m2) return Math.max(1, Number(m2[1]))
    return null
}

function isQuotaExceededError(err) {
    const msg = String(err?.message || '')
    return /quota exceeded|Too Many Requests|rate[- ]?limit/i.test(msg)
}

function modelCandidates() {
    const preferred = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    return [...new Set([
        preferred,
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
    ])]
}

function cleanHtml(raw) {
    let html = String(raw || '').trim()
    html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    return html
}

function looksLikeHtmlDocument(text) {
    const t = String(text || '')
    return /<(html|body|main|section|header|footer|div|h1|h2|p|button|a)\b/i.test(t)
}

async function rewriteAsHtml(model, draftText, landingPageUrl, adText) {
    const prompt = `Convert the following draft into a realistic, clean landing-page HTML document.
Return ONLY HTML (no markdown, no explanation, no code fences).
Preserve typical landing-page structure and CRO improvements.
Do not ask questions.

Landing page URL: ${landingPageUrl}
Ad creative text: ${adText || '(not available)'}

Draft:
${draftText}`

    const result = await model.generateContent(prompt)
    return cleanHtml(result.response.text())
}

function escapeHtmlText(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function fallbackHtmlFromText(rawText, landingPageUrl, adText) {
    const lines = String(rawText || '')
        .replace(/\*\*/g, '')
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8)

    const heading = escapeHtmlText(lines[0] || 'Improved landing page preview')
    const sub = escapeHtmlText(lines[1] || 'Message match optimized for your ad creative.')
    const bullets = lines.slice(2, 7).map((x) => `<li>${escapeHtmlText(x)}</li>`).join('')
    const safeUrl = escapeHtmlText(landingPageUrl || '')
    const safeAd = escapeHtmlText(adText || '')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Improved Landing Page Preview</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #ffffff; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 20px 48px; }
    .hero { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    h1 { font-size: 32px; margin: 0 0 10px; line-height: 1.2; }
    p { margin: 0 0 14px; line-height: 1.6; color: #374151; }
    .cta { display: inline-block; text-decoration: none; background: #111827; color: white; padding: 12px 18px; border-radius: 8px; font-weight: 600; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-bottom: 12px; }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin-bottom: 8px; color: #374151; }
    .meta { margin-top: 14px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>${heading}</h1>
      <p>${sub}</p>
      <a href="#" class="cta">Get Started</a>
      <p class="meta">Preview source URL: ${safeUrl}</p>
      <p class="meta">Ad context: ${safeAd || 'Not available from OCR.'}</p>
    </section>
    <section class="card">
      <h2>Messaging Improvements</h2>
      <ul>${bullets || '<li>Aligned headline and CTA with ad intent.</li><li>Refined section messaging for clarity and conversion.</li>'}</ul>
    </section>
  </main>
</body>
</html>`
}

async function generatePreviewHtml(prompt, landingPageUrl, adText) {
    const candidates = modelCandidates()
    const maxAttemptsPerModel = Number(process.env.GEMINI_MAX_ATTEMPTS_PER_MODEL || 2)
    const baseDelayMs = Number(process.env.GEMINI_RETRY_BASE_DELAY_MS || 700)
    let lastError = null

    for (const modelId of candidates) {
        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
            },
        })

        for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
            try {
                const result = await model.generateContent(prompt)
                let html = cleanHtml(result.response.text())
                if (!looksLikeHtmlDocument(html)) {
                    html = await rewriteAsHtml(model, html, landingPageUrl, adText)
                }
                if (!looksLikeHtmlDocument(html)) {
                    html = fallbackHtmlFromText(html, landingPageUrl, adText)
                }
                return { html, modelId, attempts: attempt }
            } catch (err) {
                lastError = err
                const status = parseStatusCode(err)
                const retryable = status === null || RETRYABLE_STATUS.has(status)
                if (!retryable || attempt === maxAttemptsPerModel) break
                const jitter = Math.floor(Math.random() * 250)
                await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter)
            }
        }
    }

    throw lastError || new Error('Unable to generate preview')
}

export async function POST(req) {
    try {
        const { adText, landingPageUrl } = await req.json()
        if (!landingPageUrl || !String(landingPageUrl).trim()) {
            return Response.json({ error: 'Landing page URL is required.' }, { status: 400 })
        }

        const prompt = buildPrompt(String(adText || ''), String(landingPageUrl || ''))
        const { html, modelId, attempts } = await generatePreviewHtml(prompt, String(landingPageUrl || ''), String(adText || ''))
        console.log(`Improved preview generated (model=${modelId}, attempts=${attempts})`)

        return Response.json({ success: true, html })
    } catch (err) {
        console.error('Improved preview generation failed:', err?.message || err)
        if (isQuotaExceededError(err)) {
            const retryAfter = parseRetryDelaySeconds(err)
            const retryText = retryAfter ? ` Please wait ${retryAfter}s and try again.` : ' Please try again shortly.'
            return Response.json({
                error: `Gemini API quota/rate limit reached.${retryText}`,
                code: 'quota_exceeded',
                retry_after_seconds: retryAfter,
            }, { status: 429 })
        }
        return Response.json({ error: 'Unable to generate preview' }, { status: 500 })
    }
}

