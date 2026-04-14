import { GoogleGenerativeAI } from '@google/generative-ai'
import * as cheerio from 'cheerio'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MAX_HTML_FETCH = Number(process.env.PERSONALIZE_MAX_HTML_FETCH) || 500_000
const MAX_PLAIN_CONTEXT = Number(process.env.PERSONALIZE_MAX_CONTEXT) || 12_000
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

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
    const fallbacks = [
        preferred,
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
    ]
    return [...new Set(fallbacks.filter(Boolean))]
}

async function generateWithRetry(parts) {
    const candidates = modelCandidates()
    const maxAttemptsPerModel = Number(process.env.GEMINI_MAX_ATTEMPTS_PER_MODEL || 2)
    const baseDelayMs = Number(process.env.GEMINI_RETRY_BASE_DELAY_MS || 700)
    let lastError = null

    for (const modelId of candidates) {
        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.2,
            },
        })

        for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
            try {
                const geminiResult = await model.generateContent({ contents: [{ role: 'user', parts }] })
                return { rawText: geminiResult.response.text(), modelId, attempts: attempt }
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

    throw lastError || new Error('Failed to generate content with all configured Gemini models.')
}

function stripScripts(html) {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
}

function stripScriptsLoose(html) {
    return stripScripts(html).replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function looksLikeHtml(s) {
    const t = s.trim()
    return /<(html|body|head|div|main|section|article|!DOCTYPE)\b/i.test(t)
}

function escapeHtmlText(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function wrapPlainManualContent(text) {
    const body = escapeHtmlText(text).split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Manual content</title></head><body><main>${body}</main></body></html>`
}

function clampHtml(html) {
    if (html.length <= MAX_HTML_FETCH) return html
    return html.slice(0, MAX_HTML_FETCH)
}

function extractPlainContext(html) {
    try {
        const $ = cheerio.load(html)
        $('script, noscript, style, svg').remove()
        const t = $('body').text().replace(/\s+/g, ' ').trim()
        return t.slice(0, MAX_PLAIN_CONTEXT)
    } catch {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PLAIN_CONTEXT)
    }
}

async function fetchPageHtml(url) {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
    } catch (e) {
        console.error('Fetch HTML failed:', e.message)
        return null
    }
}

function notInChrome($, el) {
    return !$(el).closest('footer, nav').length
}

function firstHeadlineEl($, root) {
    let h = root.find('h1').filter((_, el) => notInChrome($, el)).first()
    if (h.length) return h
    h = root
        .find('[class*="text-3xl"],[class*="text-4xl"],[class*="text-5xl"],[class*="text-6xl"]')
        .filter((_, el) => {
            if (!notInChrome($, el)) return false
            const $e = $(el)
            const t = $e.text().replace(/\s+/g, ' ').trim()
            if (t.length < 12 || t.length > 400) return false
            if ($e.find('p, h1, h2, section').length > 2) return false
            return true
        })
        .first()
    return h
}

function getCtaText($, el) {
    const $el = $(el)
    if (!$el.length) return ''
    if ($el.is('input')) return ($el.attr('value') || '').replace(/\s+/g, ' ').trim()
    let best = ''
    let bestLen = 0
    $el.find('span').each((_, s) => {
        const $s = $(s)
        const txt = $s.text().replace(/\s+/g, ' ').trim()
        if (!txt || !/[a-zA-Z0-9\u0900-\u097F]/.test(txt)) return
        if (txt.length > bestLen) {
            bestLen = txt.length
            best = txt
        }
    })
    if (best) return best
    return $el.text().replace(/\s+/g, ' ').trim()
}

function extractHeroFromHtml(html) {
    try {
        const $ = cheerio.load(html, { decodeEntities: false })
        const body = $('body')
        if (!body.length) return { headline: '', subheadline: '', cta: '' }

        const scope = body.find('main, [role="main"], #__next').first()
        const root = scope.length ? scope : body

        const h1 = firstHeadlineEl($, root)
        let headline = h1.length ? h1.text().replace(/\s+/g, ' ').trim() : ''

        const sub = root
            .find('h2, h3')
            .filter((_, el) => {
                if (!notInChrome($, el)) return false
                const t = $(el).text().replace(/\s+/g, ' ').trim()
                return t.length >= 4 && t.length < 400
            })
            .first()
        let subheadline = sub.length ? sub.text().replace(/\s+/g, ' ').trim() : ''
        if (h1.length && sub.length && sub.get(0) === h1.get(0)) subheadline = ''

        let ctaEl = root
            .find('button, a[class*="btn"], a[class*="Button"], input[type="submit"], [role="button"], a[class*="inline-flex"]')
            .filter((_, el) => {
                if (!notInChrome($, el)) return false
                const t = $(el).text().replace(/\s+/g, ' ').trim() || $(el).attr('value') || ''
                return t.length > 0 && t.length < 200
            })
            .first()

        if (!ctaEl.length) {
            ctaEl = root.find('a').filter((_, el) => {
                if (!notInChrome($, el)) return false
                const t = $(el).text().trim()
                return t.length > 2 && t.length < 80
            }).first()
        }

        let cta = ctaEl.length ? getCtaText($, ctaEl[0]) : ''

        if (!headline || !subheadline || !cta) {
            const paras = root
                .find('main p, p')
                .filter((_, el) => notInChrome($, el))
                .toArray()
                .map((p) => $(p).text().replace(/\s+/g, ' ').trim())
                .filter((t) => t.length > 20)

            if (!headline && paras[0]) headline = paras[0].slice(0, 300)
            if (!subheadline && paras[1]) subheadline = paras[1].slice(0, 300)
            else if (!subheadline && paras[0] && headline && paras[0] !== headline) subheadline = paras[0].slice(0, 300)
            if (!cta) cta = 'Get started'
        }

        return {
            headline: headline || '',
            subheadline: subheadline || '',
            cta: cta || '',
        }
    } catch {
        return { headline: '', subheadline: '', cta: '' }
    }
}

function buildPersonalizationPrompt(extracted, plainContext, adCopy) {
    return `You improve landing page HERO copy for CRO (conversion rate optimization).

EXTRACTED FROM THE LANDING PAGE (source of truth for "before" state):
- Headline: ${JSON.stringify(extracted.headline || '(none detected)')}
- Subheadline: ${JSON.stringify(extracted.subheadline || '(none detected)')}
- Primary CTA text: ${JSON.stringify(extracted.cta || '(none detected)')}

ADDITIONAL PAGE TEXT (context only):
${plainContext}

AD COPY (user):
${adCopy ? JSON.stringify(adCopy) : 'Not provided — use any ad image and the page text only; do not invent discounts or offers not implied there.'}

RULES:
- Align headline, subheadline, and CTA with the ad intent (tone, offer, urgency) without inventing fake deals.
- Keep each line concise and high-converting; similar or shorter length than the originals when possible.
- Preserve the topic of the site (same product/service/community focus).

OUTPUT: One JSON object only. No markdown, no code fences, no extra text.
Keys (all strings non-empty):
- "headline" — personalized main headline
- "subheadline" — personalized supporting line
- "cta" — personalized primary button CTA text only
- "urgency_line" — one short urgency or scarcity line (e.g. limited time), grounded in ad/page only
- "changes_summary" — array of 3–8 short bullets describing what you changed`
}

function extractJsonObject(s) {
    const start = s.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let inStr = false
    let esc = false
    let q = ''
    for (let i = start; i < s.length; i++) {
        const c = s[i]
        if (inStr) {
            if (esc) {
                esc = false
                continue
            }
            if (c === '\\') {
                esc = true
                continue
            }
            if (c === q) inStr = false
            continue
        }
        if (c === '"' || c === "'") {
            inStr = true
            q = c
            continue
        }
        if (c === '{') depth++
        else if (c === '}') {
            depth--
            if (depth === 0) return s.slice(start, i + 1)
        }
    }
    return null
}

function parseCopyJson(rawText) {
    let t = rawText.replace(/^\uFEFF/, '').trim()
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const slice = extractJsonObject(t) || t
    return JSON.parse(slice)
}

export async function POST(req) {
    try {
        const { landingUrl, adCopy, adImageBase64, adImageMime, manualContent } = await req.json()

        if (!landingUrl && !manualContent) {
            return Response.json({ error: 'Please enter a landing page URL or paste page content.' }, { status: 400 })
        }

        let pageHtml = ''

        if (manualContent && manualContent.trim().length > 30) {
            const mc = manualContent.trim()
            pageHtml = looksLikeHtml(mc) ? stripScriptsLoose(mc) : wrapPlainManualContent(mc)
            console.log('Using manual content, length:', pageHtml.length)
        } else {
            console.log('Fetching HTML:', landingUrl)
            const raw = await fetchPageHtml(landingUrl)
            if (!raw || raw.length < 50) {
                return Response.json({
                    error: 'Could not fetch this page. Try another URL or paste content.',
                    hint: 'manual',
                }, { status: 400 })
            }
            pageHtml = stripScriptsLoose(raw)
            console.log('Fetched HTML length:', pageHtml.length)
        }

        pageHtml = clampHtml(pageHtml)
        const extracted = extractHeroFromHtml(pageHtml)
        const plainContext = extractPlainContext(pageHtml)
        const prompt = buildPersonalizationPrompt(extracted, plainContext, adCopy)

        const parts = [{ text: prompt }]
        if (adImageBase64) {
            const mime = typeof adImageMime === 'string' && adImageMime.startsWith('image/') ? adImageMime : 'image/jpeg'
            parts.unshift({
                inlineData: {
                    mimeType: mime,
                    data: adImageBase64,
                },
            })
        }

        const { rawText, modelId, attempts } = await generateWithRetry(parts)
        console.log(`Gemini response length: ${rawText.length} (model=${modelId}, attempts=${attempts})`)

        let copy
        try {
            copy = parseCopyJson(rawText)
        } catch (e) {
            console.error('JSON parse error:', e.message, rawText.slice(0, 600))
            return Response.json({ error: 'AI returned malformed output. Please try again.' }, { status: 500 })
        }

        const required = ['headline', 'subheadline', 'cta', 'urgency_line']
        for (const field of required) {
            if (!copy[field] || typeof copy[field] !== 'string' || !copy[field].trim()) {
                return Response.json({ error: `Missing or empty field in AI output: ${field}` }, { status: 500 })
            }
        }

        const changes_summary = Array.isArray(copy.changes_summary)
            ? copy.changes_summary.filter((x) => typeof x === 'string')
            : []

        return Response.json({
            success: true,
            data: {
                original: {
                    headline: extracted.headline || '—',
                    subheadline: extracted.subheadline || '—',
                    cta: extracted.cta || '—',
                },
                personalized: {
                    headline: copy.headline.trim(),
                    subheadline: copy.subheadline.trim(),
                    cta: copy.cta.trim(),
                    urgency_line: copy.urgency_line.trim(),
                },
                changes_summary,
            },
        })
    } catch (err) {
        console.error('API error:', err)
        if (isQuotaExceededError(err)) {
            const retryAfter = parseRetryDelaySeconds(err)
            const retryText = retryAfter ? ` Please wait ${retryAfter}s and try again.` : ' Please try again shortly.'
            return Response.json({
                error: `Gemini API quota/rate limit reached.${retryText}`,
                code: 'quota_exceeded',
                retry_after_seconds: retryAfter,
            }, { status: 429 })
        }
        return Response.json({ error: 'Something went wrong while generating personalization.' }, { status: 500 })
    }
}
