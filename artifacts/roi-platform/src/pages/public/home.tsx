import { PublicLayout } from "@/components/layout/public-layout";
import { Button, Card, CardContent } from "@/components/ui/core";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ShieldCheck, TrendingUp, Zap, ArrowRight, ChevronRight } from "lucide-react";
import { useGetPlans } from "@workspace/api-client-react";
import { formatINR } from "@/lib/utils";

export default function Home() {
  const { data: plans } = useGetPlans();

  return (
    <PublicLayout>
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Abstract dark background" 
            className="w-full h-full object-cover opacity-50 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-6 text-sm font-medium">
              <Zap className="h-4 w-4" /> Next-generation Investment Platform
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-extrabold mb-8 leading-tight">
              Grow Your Wealth with <br className="hidden md:block"/> 
              <span className="text-gradient">Daily Returns</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed">
              Experience transparent, automated, and secure investments. Earn up to 0.5% daily ROI automatically credited to your wallet until your investment doubles.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto gap-2 group">
                  Start Investing <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/plans">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  View Plans
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Three simple steps to start earning passive income today.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 -translate-y-1/2 z-0" />
            
            {[
              { icon: ShieldCheck, title: "Create Account", desc: "Sign up securely in less than 2 minutes." },
              { icon: TrendingUp, title: "Choose a Plan", desc: "Select an investment plan that fits your goals." },
              { icon: Zap, title: "Earn Daily", desc: "Watch your wallet grow with daily ROI payouts." }
            ].map((step, i) => (
              <div key={i} className="relative z-10 glass-card rounded-3xl p-8 text-center hover-lift">
                <div className="w-16 h-16 mx-auto bg-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6">
                  <step.icon className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PLANS */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Featured Plans</h2>
              <p className="text-muted-foreground max-w-2xl">Discover our most popular investment packages.</p>
            </div>
            <Link href="/plans" className="hidden md:flex items-center text-primary font-medium hover:underline">
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans?.slice(0, 4).map((plan) => (
              <Card key={plan.id} className="hover-lift border-primary/20 bg-gradient-to-b from-card to-background">
                <div className="p-6 border-b border-border">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <div className="text-3xl font-display font-bold text-primary mb-2">
                    {formatINR(plan.amount)}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description || 'Standard Investment Package'}</p>
                </div>
                <CardContent className="p-6">
                  <ul className="space-y-4 mb-6 text-sm">
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">Daily ROI</span>
                      <span className="font-semibold text-emerald-400">{formatINR(plan.dailyRoi)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">Max Return</span>
                      <span className="font-semibold">{formatINR(plan.maxReturn)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-semibold">{plan.maxDays} Days</span>
                    </li>
                  </ul>
                  <Link href={`/login`}>
                    <Button className="w-full">Invest Now</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
