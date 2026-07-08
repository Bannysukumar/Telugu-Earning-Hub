import { Link, useSearch } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button, Input, Label, Card } from "@/components/ui/core";
import { User, Mail, Lock, Phone } from "lucide-react";
import { BrandMark, SITE_NAME } from "@/lib/brand";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const registerSchema = z
  .object({
    name: z.string().min(2, "Full name is required (at least 2 characters)"),
    email: z.string().min(1, "Email is required").email("Invalid email address"),
    phone: z.string().trim().min(1, "Mobile number is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    referralCode: z.string().trim().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine((d, ctx) => {
    const digits = d.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile number (10–15 digits)",
        path: ["phone"],
      });
    }
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { login: setAuth } = useAuth();
  const { mutate: doRegister, isPending } = useRegister();
  const search = useSearch();
  const referralFromUrl = new URLSearchParams(search).get("ref") ?? "";
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      referralCode: referralFromUrl,
    },
  });

  const onSubmit = (data: RegisterForm) => {
    doRegister(
      {
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          confirmPassword: data.confirmPassword,
          phone: data.phone,
          referralCode: data.referralCode?.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          setAuth(res.token, res.user);
          toast.success("Account created successfully!");
          window.location.href = "/dashboard";
        },
        onError: (err: any) => {
          toast.error(err.message || "Registration failed");
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex bg-background relative">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          className="w-full h-full object-cover opacity-20 mix-blend-screen"
          alt="bg"
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10 py-12">
        <Card className="w-full max-w-md p-8 glass-card">
          <div className="flex justify-center mb-6">
            <BrandMark
              href="/"
              showText={false}
              className="group"
              logoClassName="h-14 w-14 group-hover:scale-105 transition-transform"
            />
          </div>

          <h2 className="text-2xl font-display font-bold text-center mb-2">Create an Account</h2>
          <p className="text-center text-muted-foreground mb-8">Join {SITE_NAME} and start earning daily ROI</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input {...register("name")} className="pl-10" placeholder="John Doe" required autoComplete="name" />
              </div>
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  {...register("email")}
                  type="email"
                  className="pl-10"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Mobile number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  {...register("phone")}
                  type="tel"
                  className="pl-10"
                  placeholder="10-digit mobile number"
                  required
                  autoComplete="tel"
                />
              </div>
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Referral code (optional)</Label>
              <Input {...register("referralCode")} placeholder="Sponsor user ID from referral link" />
              {errors.referralCode && <p className="text-sm text-destructive">{errors.referralCode.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  {...register("password")}
                  className="pl-10"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  {...register("confirmPassword")}
                  className="pl-10"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={isPending}>
              Create Account
            </Button>
          </form>

          <p className="text-center mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
