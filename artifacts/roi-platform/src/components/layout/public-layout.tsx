import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/core";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BrandMark, SITE_NAME } from "@/lib/brand";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Plans", path: "/plans" },
    { name: "About", path: "/about" },
    { name: "Vision", path: "/vision" },
    { name: "Contact", path: "/contact" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandMark
            href="/"
            className="min-w-0"
            logoClassName="h-9 w-9 sm:h-10 sm:w-10 group-hover:scale-105 transition-transform"
            textClassName="truncate max-w-[min(100%,14rem)] sm:max-w-none"
          />

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.path} 
                href={link.path}
                className={`text-sm font-medium transition-colors hover:text-primary ${location === link.path ? "text-primary" : "text-muted-foreground"}`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <Link href={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'}>
                <Button>Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost">Sign In</Button></Link>
                <Link href="/register"><Button>Get Started</Button></Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2 text-muted-foreground" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="md:hidden border-t border-border bg-background p-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link 
                key={link.path} 
                href={link.path}
                className="text-base font-medium px-4 py-2 hover:bg-secondary rounded-lg"
                onClick={() => setIsOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <div className="h-px bg-border my-2" />
            {user ? (
              <Link href={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'}>
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login"><Button variant="outline" className="w-full">Sign In</Button></Link>
                <Link href="/register"><Button className="w-full">Get Started</Button></Link>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border py-12 bg-card mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <BrandMark href="/" logoClassName="h-9 w-9" textClassName="text-xl" />
            </div>
            <p className="text-muted-foreground text-sm max-w-sm">
              Empowering your financial future with steady, reliable, and transparent daily ROI investments.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/plans" className="hover:text-primary transition-colors">Investment Plans</Link></li>
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
