"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { usePathname } from "next/navigation"

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center justify-between p-6 border-b border-border/40">
      <div className="flex items-center space-x-8">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">SG</span>
          </div>
          <span className="font-semibold text-lg">SEO Grader</span>
        </Link>

        <div className="hidden md:flex items-center space-x-6">
          <Link
            href="/"
            className={`text-sm transition-colors hover:text-foreground ${
              pathname === "/" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Home
          </Link>
          <Link
            href="/tool"
            className={`text-sm transition-colors hover:text-foreground ${
              pathname === "/tool" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Tool
          </Link>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Link href="/tool">
          <Button variant="default" size="sm">
            Get Started
          </Button>
        </Link>
      </div>
    </nav>
  )
}
