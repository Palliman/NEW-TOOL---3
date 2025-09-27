import SEOContentGraderStandalone from "@/components/seo-content-grader"
import { Navigation } from "@/components/navigation"

export default function ToolPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-6 py-8">
        <SEOContentGraderStandalone />
      </main>
    </div>
  )
}
