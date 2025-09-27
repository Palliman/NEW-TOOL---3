import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Navigation } from "@/components/navigation"
import { CheckCircle, Zap, Target, BarChart3 } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-8 text-balance">
            The complete platform to <span className="text-primary">grade SEO content.</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto text-pretty">
            Your team's toolkit to stop guessing and start optimizing. Securely analyze, grade, and scale the best SEO
            content with AI-powered automation.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/tool">
              <Button size="lg" className="text-base px-8">
                Try the Tool
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="text-base px-8 bg-transparent">
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold mb-2">20 drafts</div>
              <div className="text-muted-foreground text-sm">analyzed at once.</div>
              <div className="mt-4 text-xs font-medium">BULK PROCESSING</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold mb-2">98% faster</div>
              <div className="text-muted-foreground text-sm">content optimization.</div>
              <div className="mt-4 text-xs font-medium">AI POWERED</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold mb-2">300% increase</div>
              <div className="text-muted-foreground text-sm">in SEO compliance.</div>
              <div className="mt-4 text-xs font-medium">PROVEN RESULTS</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold mb-2">6x faster</div>
              <div className="text-muted-foreground text-sm">to publish + rank.</div>
              <div className="mt-4 text-xs font-medium">TIME SAVINGS</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-primary">Automation</span>
            </div>

            <h2 className="text-4xl font-bold mb-6 text-balance">Faster optimization. More rankings.</h2>

            <p className="text-lg text-muted-foreground mb-8 text-pretty">
              The platform for rapid SEO progress. Let your team focus on creating great content instead of manual
              optimization with automated grading, AI-powered fixes, and integrated brand compliance.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Bulk content analysis and grading</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>AI-powered content optimization</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Brand token enforcement</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Export ready-to-publish content</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <Card className="bg-card/50 border-border/50 p-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Content Analysis</span>
                  <span className="text-xs text-muted-foreground">Real-time</span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Keyword Density</span>
                    </div>
                    <span className="text-sm font-medium text-green-500">Passed</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Word Count</span>
                    </div>
                    <span className="text-sm font-medium text-green-500">Passed</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Readability</span>
                    </div>
                    <span className="text-sm font-medium text-green-500">Passed</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Button size="sm" className="w-full">
                    Export Content
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold mb-6 text-balance">Make content optimization seamless.</h2>

          <p className="text-lg text-muted-foreground mb-8 text-pretty">
            Tools for your team to analyze, grade, and optimize content faster with AI-powered automation.
          </p>

          <Link href="/tool">
            <Button size="lg" className="text-base px-8">
              Start Grading Content
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
