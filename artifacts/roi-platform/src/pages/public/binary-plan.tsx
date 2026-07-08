import { PublicLayout } from "@/components/layout/public-layout";
import { Badge, Button, Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/core";
import { Link } from "wouter";
import { formatINR } from "@/lib/utils";
import { Gem, GitBranch, Users, Wallet, ShieldCheck, TrendingUp } from "lucide-react";

const JOIN = 200;
const CAP = 400;
const DAILY_ROI = 100 / 3;
const ROI_DAYS = 12;
const PAIR_PAYOUT = 80;
const DIRECT_BONUS = 20;
const MIN_WITHDRAW = 100;
const FEE_PCT = 10;

export default function BinaryPlan() {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4 gap-1.5">
            <Gem className="h-3.5 w-3.5" />
            Published plan rules
          </Badge>
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-4">
            Smart Binary <span className="text-gradient">MLM Plan</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {formatINR(JOIN)} joining · {formatINR(CAP)} maximum payout per position (2×) · stack multiple activations · binary matching + optional daily ROI
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register">
              <Button size="lg">Get started</Button>
            </Link>
            <Link href="/plans">
              <Button variant="outline" size="lg">
                Activate from wallet
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-8">
          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Joining & earning limit
              </h2>
              <ul className="space-y-2 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Joining:</strong> {formatINR(JOIN)} per user.
                </li>
                <li>
                  <strong className="text-foreground">2× cap:</strong> each position can earn at most {formatINR(CAP)} in total credited income. After that,{" "}
                  <strong className="text-foreground">all income types stop</strong> (ROI, binary, level or cashback if any, and direct referral bonus) until the user{" "}
                  <strong className="text-foreground">activates the same plan again or upgrades</strong> (each activation is a separate position).
                </li>
                <li>
                  Withdrawal remains available for whatever eligible balance remains in the wallet subject to the rules below.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Multiple activations
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Members may activate the <strong className="text-foreground">same plan more than once</strong>, including while another position on that plan is still active.
                Each purchase is tracked separately with its own {formatINR(CAP)} earning ceiling and ROI schedule.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                ROI path (non-referrers)
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Users who do not refer can still work toward recovery through daily ROI on each {formatINR(JOIN)} position (subject to that position&apos;s 2× cap).
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>
                  Daily ROI: 16.67% of {formatINR(JOIN)} ≈ {formatINR(DAILY_ROI)}/day
                </li>
                <li>Duration: {ROI_DAYS} payout days → total ROI {formatINR(CAP)} (2×), if the cap is reached on schedule</li>
                <li>Active promoters can hit the cap faster (often around six days or sooner depending on team volume)</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                Direct binary income (no level binary)
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each account has one <strong className="text-foreground">direct left</strong> and one{" "}
                <strong className="text-foreground">direct right</strong> position. Binary income is paid only when those two{" "}
                <strong className="text-foreground">direct</strong> members activate — not from deeper downline matching or multi-level leg volume.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>
                  When your direct left and direct right each activate at {formatINR(JOIN)}, you qualify for direct binary pairing ({formatINR(PAIR_PAYOUT)} per pair, subject to
                  the 2× cap).
                </li>
                <li>Volume from your directs&apos; teams does not count toward your left/right legs — there is no level binary income.</li>
                <li>Up to five pairs can contribute toward the {formatINR(CAP)} ceiling alongside ROI and direct referral bonus.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold">Direct referral bonus</h2>
              <p className="text-muted-foreground leading-relaxed">
                {formatINR(DIRECT_BONUS)} per direct ({FEE_PCT}% of joining). Two directs → {formatINR(DIRECT_BONUS * 2)} instant bonus (still counts toward the 2× cap; stops with
                all other incomes once the cap is reached until reactivation).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Withdrawals, fee & minimum
              </h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Company maintenance:</strong> {FEE_PCT}% deducted on every approved withdrawal (e.g. withdraw {formatINR(CAP)} → fee{" "}
                  {formatINR((CAP * FEE_PCT) / 100)} → net {formatINR(CAP - (CAP * FEE_PCT) / 100)}).
                </li>
                <li>
                  <strong className="text-foreground">Minimum withdrawal:</strong> {formatINR(MIN_WITHDRAW)}
                </li>
                <li>
                  <strong className="text-foreground">Withdraw when:</strong> wallet balance is available, request ≥ {formatINR(MIN_WITHDRAW)}, and admin approval rules are met
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold">Example (2 directs, binary + bonus)</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                User A joins at {formatINR(JOIN)} and sponsors two users: direct bonus {formatINR(40)}, binary {formatINR(PAIR_PAYOUT)} per pair — combined ceiling still{" "}
                {formatINR(CAP)}. After {FEE_PCT}% maintenance on withdrawal, net cash-out on a full {formatINR(CAP)} request is {formatINR(360)}.
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                User B joins at {formatINR(JOIN)} but does not refer: ROI accrues over the published schedule with the same {formatINR(CAP)} maximum for that position. They may
                activate again later to open a fresh position.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold">After 2× — what stops?</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                When total credited earnings reach {formatINR(CAP)} for the {formatINR(JOIN)} cycle, the account is <strong className="text-foreground">capped</strong>. ROI,
                binary matching (direct legs only), and direct bonuses all pause until the user purchases the plan again or upgrades. Then caps and incomes reset to the new
                package rules.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Income type</TableHead>
                    <TableHead className="text-right">At cap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["ROI", "Stops"],
                    ["Binary matching", "Stops"],
                    ["Level binary (not offered)", "N/A"],
                    ["Direct referral bonus", "Stops (recommended)"],
                    ["Withdrawal", "Allowed for eligible wallet balance"],
                  ].map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell className="text-muted-foreground">{k}</TableCell>
                      <TableCell className="text-right font-medium">{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold">Recommended allocation from each {formatINR(JOIN)}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Direct bonus pool", 20],
                    ["Binary pool allocation", 100],
                    ["ROI pool allocation", 50],
                    ["Company reserve", 30],
                  ].map(([label, amt]) => (
                    <TableRow key={String(label)}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatINR(amt as number)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 md:p-8 space-y-4">
              <h2 className="text-xl font-display font-bold">Premium upgrade ladder (after first cap)</h2>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{formatINR(500)} → earn up to {formatINR(1000)}</li>
                <li>{formatINR(1000)} → earn up to {formatINR(2000)}</li>
                <li>{formatINR(5000)} → earn up to {formatINR(10000)}</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Upgrades keep members engaged after a cycle completes and reset the earning ceiling to the next package&apos;s 2× rule.
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 md:p-8">
              <h2 className="text-xl font-display font-bold mb-2">Why this structure</h2>
              <p className="text-muted-foreground leading-relaxed">
                Low entry ({formatINR(JOIN)}), predictable {formatINR(CAP)} liability per position, freedom to stack the same plan again, passive ROI lane, binary acceleration for
                builders, {FEE_PCT}% maintenance on cash-outs, and {formatINR(MIN_WITHDRAW)} minimum withdrawals keep the experience simple while aligning incentives for users and
                the company.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
