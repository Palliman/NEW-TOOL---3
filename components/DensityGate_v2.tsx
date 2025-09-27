"use client"

import React from "react"
import { Badge } from "@/components/ui/badge"

export type DensityGateTargets = {
  primaryMin?: number
  primaryMax?: number
  wordCountMin?: number
  fleschMin?: number
  brandTokens?: string[]
}

export type DensityGateResult = {
  pass: boolean
  checks?: Array<{
    pass: boolean
    label: string
    hint?: string
  }>
  auditJson?: any
}

interface DensityGateV2Props {
  draftHtml: string
  primary: string
  secondaries: string[]
  title?: string
  metaDescription?: string
  h1?: string
  targets: DensityGateTargets
  onEvaluate: (result: DensityGateResult) => void
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent || ""
}

function calculateKeywordDensity(text: string, keyword: string): number {
  if (!keyword.trim()) return 0
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  const keywordWords = keyword.toLowerCase().split(/\s+/).filter(Boolean)

  if (keywordWords.length === 1) {
    const matches = words.filter((word) => word === keywordWords[0]).length
    return words.length > 0 ? (matches / words.length) * 100 : 0
  } else {
    // For multi-word keywords, look for exact phrase matches
    const textLower = text.toLowerCase()
    const keywordLower = keyword.toLowerCase()
    const matches = (textLower.match(new RegExp(keywordLower, "g")) || []).length
    return words.length > 0 ? ((matches * keywordWords.length) / words.length) * 100 : 0
  }
}

function calculateFleschScore(text: string): number {
  const sentences = text.split(/[.!?]+\s/).filter(Boolean).length || 1
  const words = text
    .trim()
    .split(/[^\w']+/)
    .filter(Boolean)
  const syllables = words.reduce((total, word) => {
    return total + Math.max(1, (word.match(/[aeiouy]{1,2}/gi) || []).length)
  }, 0)

  const avgWordsPerSentence = words.length / sentences
  const avgSyllablesPerWord = syllables / words.length

  return Math.round(206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)
}

export default function DensityGateV2({
  draftHtml,
  primary,
  secondaries,
  title,
  metaDescription,
  h1,
  targets,
  onEvaluate,
}: DensityGateV2Props) {
  const [isEvaluating, setIsEvaluating] = React.useState(false)
  const [result, setResult] = React.useState<DensityGateResult | null>(null)

  React.useEffect(() => {
    if (!draftHtml || !primary) return

    setIsEvaluating(true)

    // Small delay to prevent blocking the UI
    const timeoutId = setTimeout(() => {
      try {
        const text = stripHtml(draftHtml)
        const wordCount = text.split(/\s+/).filter(Boolean).length
        const fleschScore = calculateFleschScore(text)
        const primaryDensity = calculateKeywordDensity(text, primary)

        const checks = []

        // Word count check
        const wordCountMin = targets.wordCountMin || 1200
        checks.push({
          pass: wordCount >= wordCountMin,
          label: `Word count (${wordCount}/${wordCountMin})`,
          hint: wordCount < wordCountMin ? `Need ${wordCountMin - wordCount} more words` : "Good word count",
        })

        // Primary keyword density check
        const primaryMin = (targets.primaryMin || 0.01) * 100
        const primaryMax = (targets.primaryMax || 0.018) * 100
        checks.push({
          pass: primaryDensity >= primaryMin && primaryDensity <= primaryMax,
          label: `Primary density (${primaryDensity.toFixed(2)}%)`,
          hint:
            primaryDensity < primaryMin
              ? `Too low, target ${primaryMin}-${primaryMax}%`
              : primaryDensity > primaryMax
                ? `Too high, target ${primaryMin}-${primaryMax}%`
                : "Good density",
        })

        // Flesch readability check
        const fleschMin = targets.fleschMin || 55
        checks.push({
          pass: fleschScore >= fleschMin,
          label: `Readability (${fleschScore}/${fleschMin})`,
          hint: fleschScore < fleschMin ? "Content is too complex" : "Good readability",
        })

        // Brand tokens check
        if (targets.brandTokens && targets.brandTokens.length > 0) {
          const textLower = text.toLowerCase()
          const missingTokens = targets.brandTokens.filter((token) => !textLower.includes(token.toLowerCase()))
          checks.push({
            pass: missingTokens.length === 0,
            label: `Brand tokens (${targets.brandTokens.length - missingTokens.length}/${targets.brandTokens.length})`,
            hint: missingTokens.length > 0 ? `Missing: ${missingTokens.join(", ")}` : "All brand tokens present",
          })
        }

        const allPassed = checks.every((check) => check.pass)

        const evaluationResult: DensityGateResult = {
          pass: allPassed,
          checks,
          auditJson: {
            evaluated: true,
            timestamp: Date.now(),
            wordCount,
            fleschScore,
            primaryDensity,
            primary,
            secondaries,
            targets,
          },
        }

        setResult(evaluationResult)
        onEvaluate(evaluationResult)
      } catch (error) {
        console.error("[v0] Error in DensityGate evaluation:", error)
        const fallbackResult: DensityGateResult = {
          pass: false,
          checks: [
            {
              pass: false,
              label: "Evaluation error",
              hint: "Failed to evaluate content",
            },
          ],
          auditJson: { error: true, timestamp: Date.now() },
        }
        setResult(fallbackResult)
        onEvaluate(fallbackResult)
      } finally {
        setIsEvaluating(false)
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [draftHtml, primary, secondaries, title, metaDescription, h1, targets, onEvaluate])

  if (isEvaluating) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <p className="text-sm text-muted-foreground">Evaluating content...</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <p className="text-sm text-muted-foreground">Ready to evaluate</p>
      </div>
    )
  }

  return (
    <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={result.pass ? "success" : "destructive"} className={result.pass ? "bg-emerald-600" : ""}>
          {result.pass ? "PASSED" : "FAILED"}
        </Badge>
        <span className="text-sm font-medium">SEO Evaluation</span>
      </div>

      {result.checks && result.checks.length > 0 && (
        <div className="space-y-2">
          {result.checks.map((check, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className={check.pass ? "text-emerald-600" : "text-red-600"}>
                {check.pass ? "✓" : "✗"} {check.label}
              </span>
              {check.hint && <span className="text-xs text-muted-foreground">{check.hint}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Primary: "{primary}" | Secondaries: {secondaries.join(", ") || "none"}
      </div>
    </div>
  )
}
