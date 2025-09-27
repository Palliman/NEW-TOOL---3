"use client"

import { useEffect, useState, useRef } from "react"
import DensityGateV2, { type DensityGateTargets, type DensityGateResult } from "./DensityGate_v2" // keep this file next to this page
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import JSZip from "jszip"

/**
 * SEO Content Grader – Standalone v1.3
 * ------------------------------------
 * Drop/paste up to 20 drafts. The app will:
 *  - Normalize text → HTML, auto‑analyze, and auto‑fill primary/secondaries
 *  - Set sensible default targets (density, word count, Flesch)
 *  - Immediately evaluate via DensityGateV2 and bucket into “Passed” / “Didn't Pass”
 *  - Enforce brand tokens, scrub hallucinated URLs, export passed items as .zip
 *  - Auto‑fix failing drafts via OpenAI/xAI with backoff + queued concurrency
 *  - Persist session (IndexedDB) so you can close/reopen the tab
 *
 * NOTE: Requires your DensityGate_v2.tsx next to this file.
 */

// ---------------- Types ----------------
export type Draft = {
  id: string
  name: string
  raw: string
  html: string
  meta: { title?: string; description?: string; h1?: string; primary: string; secondaries: string[] }
  gate?: DensityGateResult
  fixedHtml?: string
  useFixConstraints?: boolean
  stats?: {
    wordCount: number
    flesch?: number
    topTerms?: string[]
    suggestedPrimary?: string
    suggestedSecondaries?: string[]
    suggestedPrimaryCount?: number
  }
  history: { step: "upload" | "eval" | "fix"; at: number; notes?: string }[]
}

export type Provider = "openai" | "xai"

// ---------------- Utils ----------------
const uid = () => Math.random().toString(36).slice(2)

function normalizeToHtml(input: string): string {
  const maybeHtml = /<\w+[^>]*>/.test(input)
  if (maybeHtml) return input
  const paras = input
    .split(/\n{2,}/g)
    .map((x) => `<p>${x.replace(/\n/g, "<br/>")}</p>`)
    .join("\n")
  return paras || `<p>${input}</p>`
}

function downloadFile(name: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function downloadZip(
  files: { path: string; content: string }[],
  zipName = "passed_{YYYY}{MM}{DD}_{HH}{mm}_{count}.zip",
) {
  const zip = new JSZip()
  files.forEach((f) => zip.file(f.path, f.content))
  const blob = await zip.generateAsync({ type: "blob" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = formatZipName(zipName, files.length)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function formatZipName(pattern: string, count: number) {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  const YYYY = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const DD = pad(d.getDate())
  const HH = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return pattern
    .replaceAll("{YYYY}", String(YYYY))
    .replaceAll("{MM}", MM)
    .replaceAll("{DD}", DD)
    .replaceAll("{HH}", HH)
    .replaceAll("{mm}", mm)
    .replaceAll("{count}", String(count))
}

// --- text analysis for auto-fill ---
const STOP = new Set(
  "a,an,the,of,for,and,or,if,in,on,at,to,from,by,with,as,is,are,was,were,be,been,being,it,its,that,this,these,those,you,your,our,we,they,them,he,she,his,her,not,no,yes,do,does,did,have,has,had,can,could,should,would,may,might,will,just,than,then,so,too,very,into,over,under,about,after,before,also,more,most,less,least,up,down,out,off,how,what,why,when,where,which,who,whom".split(
    ",",
  ),
)
function stripHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent || ""
}
function fleschReadingEase(text: string) {
  const sentences = text.split(/[.!?]+\s/).filter(Boolean).length || 1
  const words = text
    .trim()
    .split(/[^A-Za-z0-9']+/)
    .filter(Boolean)
  const syllables = words.reduce((t, w) => t + Math.max(1, (w.match(/[aeiouy]{1,2}/gi) || []).length), 0)
  const W = words.length || 1
  const S = sentences || 1
  const sylPerWord = syllables / W
  return Math.round(206.835 - 1.015 * (W / S) - 84.6 * sylPerWord)
}
function analyzeContent(html: string) {
  const text = stripHtml(html).toLowerCase()
  const tokens = text.split(/[^a-z0-9']+/).filter(Boolean)
  const wordCount = tokens.length
  const freq = new Map<string, number>()
  tokens.forEach((t) => {
    if (!STOP.has(t) && t.length > 2) freq.set(t, (freq.get(t) || 0) + 1)
  })
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t)
  const suggestedPrimary = top[0]
  const suggestedSecondaries = top.slice(1, 6)
  const primaryPct = 0.014 // ~1.4%
  const suggestedPrimaryCount = Math.max(3, Math.round(wordCount * primaryPct))
  const flesch = fleschReadingEase(text)
  return { wordCount, topTerms: top, suggestedPrimary, suggestedSecondaries, suggestedPrimaryCount, flesch }
}

// --- URL hallucination helpers ---
function extractUrls(html: string): Set<string> {
  const set = new Set<string>()
  const doc = new DOMParser().parseFromString(html, "text/html")
  doc.querySelectorAll("a[href]").forEach((a) => {
    try {
      set.add(new URL((a as HTMLAnchorElement).href).href)
    } catch {}
  })
  return set
}
function stripNewUrls(originalHtml: string, newHtml: string, allowDomains: string[]): string {
  const before = extractUrls(originalHtml)
  const doc = new DOMParser().parseFromString(newHtml, "text/html")
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = (a as HTMLAnchorElement).href
    let ok = before.has(href)
    if (!ok) {
      try {
        const u = new URL(href)
        ok = allowDomains.some((dom) => u.hostname === dom || u.hostname.endsWith(`.${dom}`))
      } catch {}
    }
    if (!ok) {
      const span = doc.createTextNode((a as HTMLAnchorElement).textContent || "")
      a.replaceWith(span)
    }
  })
  return doc.body.innerHTML
}

// --- LLM with backoff ---
async function callLLM(provider: Provider, apiKey: string, system: string, user: string, attempt = 0): Promise<string> {
  if (!apiKey) throw new Error("Missing API key")
  const maxAttempts = 5
  const baseDelay = 800
  const doFetch = async () => {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
        }),
      })
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
      const j = await r.json()
      return j?.choices?.[0]?.message?.content ?? ""
    } else {
      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "grok-2-latest",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
        }),
      })
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
      const j = await r.json()
      return j?.choices?.[0]?.message?.content ?? ""
    }
  }
  try {
    return await doFetch()
  } catch (e: any) {
    const status = e?.status || 0
    if (attempt < maxAttempts - 1 && (status === 429 || status >= 500)) {
      const jitter = Math.random() * 200
      const delay = Math.min(8000, baseDelay * Math.pow(2, attempt)) + jitter
      await new Promise((r) => setTimeout(r, delay))
      return callLLM(provider, apiKey, system, user, attempt + 1)
    }
    throw e
  }
}

// --- tiny semaphore ---
async function runWithConcurrency<T>(pool: number, tasks: (() => Promise<T>)[]) {
  const results: T[] = []
  let i = 0
  const workers = Array(Math.max(1, pool))
    .fill(0)
    .map(async () => {
      while (i < tasks.length) {
        const cur = i++
        results[cur] = await tasks[cur]()
      }
    })
  await Promise.all(workers)
  return results
}

// --- IndexedDB persistence ---
const DB_NAME = "dg_session_db"
const STORE = "session"
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbSet<T>(key: string, value: T) {
  const db = await idbOpen()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(value as any, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idbOpen()
  const out = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return out
}

// --- prompt builder ---
function buildFixPrompt(d: Draft, useConstraints: boolean): { system: string; user: string } {
  const g = d.gate!
  const failing = (g?.checks || []).filter((c: any) => !c.pass)
  const hints = failing.map((c: any) => `- ${c.label}${c.hint ? ` (hint: ${c.hint})` : ""}`).join("\n")
  const system = `You are an SEO editor that must EXACTLY satisfy the following guardrails.\nReturn ONLY valid HTML for the article body. Do not add scripts or external links except where specified.\nPreserve meaning. Improve clarity. Obey every requirement.`
  const user =
    (useConstraints ? `Fix this article so it PASSES all checks.\nFAILURES TO FIX:\n${hints || "(none)"}\n\n` : "") +
    `PRIMARY: "${d.meta.primary}"\nSECONDARIES: ${d.meta.secondaries.map((s) => `"${s}"`).join(", ")}\nTITLE: ${d.meta.title ?? "(none)"}\nMETA DESCRIPTION: ${d.meta.description ?? "(none)"}\nH1: ${d.meta.h1 ?? "(none)"}\n\nARTICLE HTML:\n${d.html}`
  return { system, user }
}

// ---------------- Main ----------------
export default function SEOContentGraderStandalone() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [provider, setProvider] = useState<Provider>("openai")
  const [apiKey, setApiKey] = useState<string>("")
  const [targets, setTargets] = useState<Partial<DensityGateTargets>>({})
  const [autoLoop, setAutoLoop] = useState(true)
  const [maxPasses, setMaxPasses] = useState(3)
  const [busy, setBusy] = useState(false)

  // Guardrails + ops
  const [brandTokens, setBrandTokens] = useState<string>("PacketDrip, BitCans, Drip Demons")
  const [allowDomains, setAllowDomains] = useState<string>("yourdomain.com")
  const [concurrency, setConcurrency] = useState<number>(3)
  const [zipPattern, setZipPattern] = useState("passed_{YYYY}{MM}{DD}_{HH}{mm}_{count}.zip")

  const isInitialLoad = useRef(true)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedProvider = localStorage.getItem("dg_provider") as Provider
      const savedApiKey = localStorage.getItem("dg_apiKey")

      if (savedProvider) setProvider(savedProvider)
      if (savedApiKey) setApiKey(savedApiKey)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const saved = await idbGet<any>("dg_session")
      if (saved) {
        setDrafts(saved.drafts || [])
        setTargets(saved.targets || {})
        setProvider(saved.provider || "openai")
        setApiKey(saved.apiKey || "")
        setAutoLoop(Boolean(saved.autoLoop))
        setMaxPasses(saved.maxPasses || 3)
        setConcurrency(saved.concurrency || 3)
        setZipPattern(saved.zipPattern || "passed_{YYYY}{MM}{DD}_{HH}{mm}_{count}.zip")
        setBrandTokens(saved.brandTokens || "")
        setAllowDomains(saved.allowDomains || "yourdomain.com")
      }
      // Mark initial load as complete
      isInitialLoad.current = false
    })()
  }, [])

  useEffect(() => {
    // Skip persistence during initial load to prevent infinite loop
    if (isInitialLoad.current) return

    idbSet("dg_session", {
      drafts,
      targets,
      provider,
      apiKey,
      autoLoop,
      maxPasses,
      concurrency,
      zipPattern,
      brandTokens,
      allowDomains,
    })
  }, [drafts, targets, provider, apiKey, autoLoop, maxPasses, concurrency, zipPattern, brandTokens, allowDomains])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dg_provider", provider)
    }
  }, [provider])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dg_apiKey", apiKey)
    }
  }, [apiKey])

  // Upload handlers
  const onFiles = async (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).slice(0, 20)
    const texts = await Promise.all(arr.map((f) => f.text()))
    const newDrafts: Draft[] = texts.map((raw, i) => {
      const html = normalizeToHtml(raw)
      const stats = analyzeContent(html)
      return {
        id: uid(),
        name: arr[i].name || `Draft_${i + 1}.txt`,
        raw,
        html,
        meta: { primary: stats.suggestedPrimary || "", secondaries: stats.suggestedSecondaries || [] },
        useFixConstraints: true,
        stats,
        history: [{ step: "upload", at: Date.now(), notes: `auto-init ${stats.wordCount} words` }],
      }
    })
    // sensible defaults
    setTargets((t) => ({
      primaryMin: t.primaryMin ?? 0.01,
      primaryMax: t.primaryMax ?? 0.018,
      wordCountMin: t.wordCountMin ?? 1200,
      fleschMin: t.fleschMin ?? 55,
    }))
    setDrafts((d) => [...d, ...newDrafts])
  }

  const onPasteBulk = (bulk: string) => {
    const chunks = bulk
      .split(/\n\n-----+\n\n|\n\n\n+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
    const newDrafts: Draft[] = chunks.map((raw, i) => {
      const html = normalizeToHtml(raw)
      const stats = analyzeContent(html)
      return {
        id: uid(),
        name: `Pasted_${drafts.length + i + 1}.txt`,
        raw,
        html,
        meta: { primary: stats.suggestedPrimary || "", secondaries: stats.suggestedSecondaries || [] },
        useFixConstraints: true,
        stats,
        history: [{ step: "upload", at: Date.now(), notes: `auto-init ${stats.wordCount} words` }],
      }
    })
    setTargets((t) => ({
      primaryMin: t.primaryMin ?? 0.01,
      primaryMax: t.primaryMax ?? 0.018,
      wordCountMin: t.wordCountMin ?? 1200,
      fleschMin: t.fleschMin ?? 55,
    }))
    setDrafts((d) => [...d, ...newDrafts])
  }

  const updateDraftMeta = (id: string, meta: Partial<Draft["meta"]>) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, meta: { ...d.meta, ...meta } } : d)))
  const toggleConstraints = (id: string, val: boolean) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, useFixConstraints: val } : d)))
  const onEvaluate = (id: string, gate: DensityGateResult) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, gate } : d)))

  const passed = drafts.filter((d) => d.gate?.pass)
  const failed = drafts.filter((d) => d.gate && !d.gate.pass)

  // Fix one with URL hallucination scrub + brand tokens through targets
  const fixOne = async (d: Draft) => {
    const { system, user } = buildFixPrompt(d, d.useFixConstraints !== false)
    const originalHtml = d.html
    let html = await callLLM(provider, apiKey, system, user)
    const allow = allowDomains
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    html = stripNewUrls(originalHtml, html, allow)
    setDrafts((list) =>
      list.map((x) =>
        x.id === d.id ? { ...x, fixedHtml: html, html, history: [...x.history, { step: "fix", at: Date.now() }] } : x,
      ),
    )
  }

  // Concurrency‑controlled auto‑fix queue
  const fixAll = async () => {
    setBusy(true)
    try {
      for (let pass = 1; pass <= maxPasses; pass++) {
        const needFix = drafts.filter((d) => d.gate && !d.gate.pass)
        if (needFix.length === 0) break
        const tasks = needFix.map((d) => () => fixOne(d))
        await runWithConcurrency(concurrency, tasks)
        if (!autoLoop) break
        await new Promise((r) => setTimeout(r, 50))
      }
    } finally {
      setBusy(false)
    }
  }

  const savePassedAsZip = async () => {
    const files = passed.map((d) => ({ path: d.name.replace(/\.[^.]+$/, "") + "_PASSED.html", content: d.html }))
    const zipName = formatZipName(zipPattern, files.length)
    await downloadZip(files, zipName)
  }

  const saveAllAudits = async () => {
    const payload = drafts.map((d) => ({
      id: d.id,
      name: d.name,
      passed: !!d.gate?.pass,
      audit: d.gate?.auditJson ?? null,
    }))
    downloadFile("density_audits.json", JSON.stringify(payload, null, 2), "application/json")
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">DensityGate – Bulk Draft Uploader</h1>
        <div className="flex items-center gap-3">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="openai">OpenAI</option>
            <option value="xai">xAI Grok</option>
          </select>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key (stored locally)"
            className="w-72"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Upload drafts (1–20)</Label>
              <Input type="file" accept=".txt,.md,.html" multiple onChange={(e) => onFiles(e.target.files)} />
              <p className="text-xs opacity-70 mt-1">Accepted: .txt, .md, .html</p>
            </div>
            <div>
              <Label>Or paste drafts (separate with a blank line or a line of dashes)</Label>
              <Textarea
                rows={6}
                placeholder={"Draft A...\n\n-----\n\nDraft B..."}
                onBlur={(e) => e.target.value.trim() && onPasteBulk(e.target.value)}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>Primary density min/max (%)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="1.0"
                  onChange={(e) => setTargets((t) => ({ ...t, primaryMin: (+e.target.value || 0) / 100 }))}
                />
                <Input
                  type="number"
                  step="0.1"
                  placeholder="1.8"
                  onChange={(e) => setTargets((t) => ({ ...t, primaryMax: (+e.target.value || 0) / 100 }))}
                />
              </div>
            </div>
            <div>
              <Label>Word count min</Label>
              <Input
                type="number"
                placeholder="1200"
                onChange={(e) => setTargets((t) => ({ ...t, wordCountMin: +e.target.value || undefined }))}
              />
            </div>
            <div>
              <Label>Flesch min</Label>
              <Input
                type="number"
                placeholder="55"
                onChange={(e) => setTargets((t) => ({ ...t, fleschMin: +e.target.value || undefined }))}
              />
            </div>
            <div>
              <Label>Zip name pattern</Label>
              <Input
                value={zipPattern}
                onChange={(e) => setZipPattern(e.target.value)}
                placeholder="passed_{YYYY}{MM}{DD}_{HH}{mm}_{count}.zip"
              />
            </div>
          </div>

          {/* Guardrail hardening */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Brand Tokens (required in content)</Label>
              <Input
                value={brandTokens}
                onChange={(e) => setBrandTokens(e.target.value)}
                placeholder="PacketDrip, BitCans, Drip Demons"
              />
              <p className="text-xs opacity-70 mt-1">Comma-separated brand terms that must appear</p>
            </div>
            <div className="md:col-span-2">
              <Label>Allowed Domains (for links)</Label>
              <Input
                value={allowDomains}
                onChange={(e) => setAllowDomains(e.target.value)}
                placeholder="yourdomain.com, docs.yourdomain.com"
              />
              <p className="text-xs opacity-70 mt-1">AI-added links to other domains will be stripped</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <Label>Auto-loop fix → re-gate</Label>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={autoLoop} onCheckedChange={setAutoLoop} id="autoloop" />
                <Input
                  type="number"
                  className="w-24"
                  value={maxPasses}
                  onChange={(e) => setMaxPasses(Math.max(1, +e.target.value || 1))}
                />
              </div>
              <p className="text-xs opacity-70 mt-1">Max passes</p>
            </div>
            <div>
              <Label>Concurrency (fix queue)</Label>
              <Input
                type="number"
                className="w-28"
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, +e.target.value || 1))}
              />
              <p className="text-xs opacity-70 mt-1">How many drafts to fix at once</p>
            </div>
            <div>
              <Button className="mt-6" variant="secondary" onClick={saveAllAudits}>
                Export audits JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Didn't Pass */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Didn't Pass</h2>
            <Button disabled={busy || failed.length === 0 || !apiKey} onClick={fixAll}>
              {busy ? "Fixing..." : `Auto-fix ${failed.length || 0}`}
            </Button>
          </div>
          <div className="space-y-4">
            {failed.map((d) => (
              <Card key={d.id} className="border-red-500/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.name}</div>
                    <div className="flex gap-2 items-center">
                      <Badge variant="destructive">Didn't Pass</Badge>
                      <Button size="sm" variant="outline" onClick={() => fixOne(d)} disabled={busy || !apiKey}>
                        Fix this
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          downloadFile(d.name.replace(/\.[^.]+$/, "") + "_CURRENT.html", d.html, "text/html")
                        }
                      >
                        Save current
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-2">
                    <Input
                      placeholder="Primary keyword (exact phrase)"
                      value={d.meta.primary}
                      onChange={(e) => updateDraftMeta(d.id, { primary: e.target.value })}
                    />
                    <Input
                      placeholder="Secondaries (comma‑sep)"
                      value={d.meta.secondaries.join(", ")}
                      onChange={(e) =>
                        updateDraftMeta(d.id, {
                          secondaries: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <Input
                      placeholder="Title (optional)"
                      value={d.meta.title || ""}
                      onChange={(e) => updateDraftMeta(d.id, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Meta description (optional)"
                      value={d.meta.description || ""}
                      onChange={(e) => updateDraftMeta(d.id, { description: e.target.value })}
                    />
                  </div>

                  {d.stats && (
                    <p className="text-xs opacity-70">
                      {d.stats.wordCount} words · Flesch≈{d.stats.flesch} · suggested primary:{" "}
                      <strong>{d.stats.suggestedPrimary}</strong> (~{d.stats.suggestedPrimaryCount} mentions)
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={d.useFixConstraints !== false}
                      onCheckedChange={(v) => toggleConstraints(d.id, v)}
                      id={`con-${d.id}`}
                    />
                    <Label htmlFor={`con-${d.id}`}>Use fixes as constraints</Label>
                  </div>

                  <DensityGateV2
                    draftHtml={d.html}
                    primary={d.meta.primary}
                    secondaries={d.meta.secondaries}
                    title={d.meta.title}
                    metaDescription={d.meta.description}
                    h1={d.meta.h1}
                    targets={{
                      ...targets,
                      brandTokens: brandTokens
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }}
                    onEvaluate={(res) => onEvaluate(d.id, res)}
                  />
                </CardContent>
              </Card>
            ))}
            {failed.length === 0 && <p className="text-sm opacity-70">No drafts in “Didn't Pass”.</p>}
          </div>
        </section>

        {/* Passed */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Passed</h2>
            <Button variant="outline" onClick={savePassedAsZip} disabled={passed.length === 0}>
              Save all passed (.zip)
            </Button>
          </div>
          <div className="space-y-4">
            {passed.map((d) => (
              <Card key={d.id} className="border-emerald-500/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.name.replace(/\.[^.]+$/, "") + "_PASSED.html"}</div>
                    <div className="flex gap-2 items-center">
                      <Badge variant="success" className="bg-emerald-600">
                        Passed
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadFile(d.name.replace(/\.[^.]+$/, "") + "_PASSED.html", d.html, "text/html")
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  <DensityGateV2
                    draftHtml={d.html}
                    primary={d.meta.primary}
                    secondaries={d.meta.secondaries}
                    title={d.meta.title}
                    metaDescription={d.meta.description}
                    h1={d.meta.h1}
                    targets={{
                      ...targets,
                      brandTokens: brandTokens
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }}
                    onEvaluate={(res) => onEvaluate(d.id, res)}
                  />
                </CardContent>
              </Card>
            ))}
            {passed.length === 0 && <p className="text-sm opacity-70">No passed drafts yet.</p>}
          </div>
        </section>
      </div>

      {/* Un‑evaluated */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Un‑evaluated</h2>
        <div className="grid gap-4">
          {drafts
            .filter((d) => !d.gate)
            .map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.name}</div>
                    <div className="flex gap-2 items-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDrafts((list) =>
                            list.map((x) => (x.id === d.id ? { ...x, html: normalizeToHtml(x.raw) } : x)),
                          )
                        }
                      >
                        Normalize
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setDrafts((list) => list.map((x) => (x.id === d.id ? { ...x, gate: { ...x.gate! } } : x)))
                        }
                      >
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-2">
                    <Input
                      placeholder="Primary keyword (exact phrase)"
                      value={d.meta.primary}
                      onChange={(e) => updateDraftMeta(d.id, { primary: e.target.value })}
                    />
                    <Input
                      placeholder="Secondaries (comma‑sep)"
                      value={d.meta.secondaries.join(", ")}
                      onChange={(e) =>
                        updateDraftMeta(d.id, {
                          secondaries: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <Input
                      placeholder="Title (optional)"
                      value={d.meta.title || ""}
                      onChange={(e) => updateDraftMeta(d.id, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Meta description (optional)"
                      value={d.meta.description || ""}
                      onChange={(e) => updateDraftMeta(d.id, { description: e.target.value })}
                    />
                  </div>

                  {d.stats && (
                    <p className="text-xs opacity-70">
                      {d.stats.wordCount} words · Flesch≈{d.stats.flesch} · suggested primary:{" "}
                      <strong>{d.stats.suggestedPrimary}</strong> (~{d.stats.suggestedPrimaryCount} mentions)
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={d.useFixConstraints !== false}
                      onCheckedChange={(v) => toggleConstraints(d.id, v)}
                      id={`con-${d.id}-u`}
                    />
                    <Label htmlFor={`con-${d.id}-u`}>Use fixes as constraints</Label>
                  </div>

                  <DensityGateV2
                    draftHtml={d.html}
                    primary={d.meta.primary}
                    secondaries={d.meta.secondaries}
                    title={d.meta.title}
                    metaDescription={d.meta.description}
                    h1={d.meta.h1}
                    targets={{
                      ...targets,
                      brandTokens: brandTokens
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }}
                    onEvaluate={(res) => onEvaluate(d.id, res)}
                  />
                </CardContent>
              </Card>
            ))}
          {drafts.filter((d) => !d.gate).length === 0 && (
            <p className="text-sm opacity-70">All drafts have been evaluated.</p>
          )}
        </div>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between py-4">
        <p className="text-xs opacity-70">
          Nothing is uploaded to a server by default. Keys in localStorage; drafts & settings persist in IndexedDB.
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("dg_apiKey")
              }
              setApiKey("")
            }}
          >
            Clear key
          </Button>
          <Button variant="destructive" onClick={() => setDrafts([])}>
            Reset session
          </Button>
        </div>
      </div>
    </div>
  )
}
