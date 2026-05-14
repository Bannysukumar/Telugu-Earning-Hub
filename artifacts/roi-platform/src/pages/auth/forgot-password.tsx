import { Link } from "wouter";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button, Input, Label, Card } from "@/components/ui/core";
import { Mail, ArrowLeft } from "lucide-react";
import { BrandMark } from "@/lib/brand";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { firebaseAuth } from "@/lib/firebase";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

type Form = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    try {
      await sendPasswordResetEmail(firebaseAuth, data.email.trim());
      setSent(true);
      toast.success("Check your inbox for reset instructions.");
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      if (code === "auth/user-not-found") {
        toast.error("No account found for that email.");
      } else if (code === "auth/invalid-email") {
        toast.error("Invalid email address.");
      } else {
        toast.error("Could not send reset email. Try again later.");
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          className="w-full h-full object-cover opacity-20 mix-blend-screen"
          alt=""
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <Card className="w-full max-w-md p-8 glass-card">
          <div className="flex justify-center mb-6">
            <BrandMark
              href="/"
              showText={false}
              className="group"
              logoClassName="h-14 w-14 group-hover:scale-105 transition-transform"
            />
          </div>

          <h2 className="text-2xl font-display font-bold text-center mb-2">Reset password</h2>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            Enter your account email and we will send a link to choose a new password.
          </p>

          {sent ? (
            <p className="text-center text-sm text-muted-foreground mb-6">
              If an account exists for that address, a reset email has been sent.
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input {...register("email")} className="pl-10" placeholder="you@example.com" autoComplete="email" />
                </div>
                {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
              </div>
              <Button type="submit" className="w-full" size="lg">
                Send reset link
              </Button>
            </form>
          )}

          <div className="mt-8 flex flex-col gap-3 text-center text-sm">
            <Link href="/login" className="inline-flex items-center justify-center gap-2 text-primary hover:underline font-medium">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
            <p className="text-muted-foreground">
              No account? <Link href="/register" className="text-primary hover:underline font-medium">Sign up</Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
