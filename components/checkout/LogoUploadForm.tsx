"use client";

import Link from "next/link";
import { useState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Validation (client-side) ────────────────────────────────────────────────
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUrl(url: string): boolean {
  if (!url) return true; // optional
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function LogoUploadForm({ zoneId }: { zoneId: string }) {
  const [brandName, setBrandName] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle logo file selection → immediate upload
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoFile(file);
    setLogoUrl(null);
    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/uploads/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as { url: string };
      setLogoUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Handle form submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    // Client-side validation
    if (!brandName.trim()) {
      setSubmitError("Brand name is required");
      return;
    }
    if (!validateEmail(buyerEmail)) {
      setSubmitError("Please enter a valid email address");
      return;
    }
    if (brandUrl && !validateUrl(brandUrl)) {
      setSubmitError("Please enter a valid URL (including https://)");
      return;
    }
    if (!logoUrl) {
      setSubmitError("Please upload a logo first");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // SECURITY: send only the spot identifier plus order details. Price and
        // Dodo product ID are resolved server-side — never sent from here.
        body: JSON.stringify({
          spotId: zoneId,
          brandName: brandName.trim(),
          brandUrl: brandUrl.trim() || undefined,
          buyerEmail: buyerEmail.trim(),
          logoUrl,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const hint =
          data.code === "DODO_AUTH_FAILED"
            ? " (payment provider rejected the server credentials — reservation released)"
            : data.code === "DODO_NOT_CONFIGURED"
              ? " (payments not configured on the server — reservation released)"
              : "";
        throw new Error(`${data.error || `Checkout failed (${res.status})`}${hint}`);
      }

      const data = (await res.json()) as { checkoutUrl?: string };
      if (data.checkoutUrl) {
        // Redirect the buyer to Dodo's hosted checkout.
        window.location.href = data.checkoutUrl;
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Success state
  if (submitted) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center">
        <div className="text-3xl mb-3">✓</div>
        <h2 className="font-serif text-lg font-semibold text-green-300 mb-2">
          Claim Submitted
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Your spot has been reserved. Redirecting to Dodo Payments for secure
          checkout…
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
        >
          ← Back to marketplace
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h2 className="font-serif text-lg font-semibold text-amber-100">
        Your Brand Details
      </h2>

      {/* Brand Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brandName" className="text-zinc-300">
          Brand Name <span className="text-red-400">*</span>
        </Label>
        <Input
          id="brandName"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="Acme Co"
          className="bg-zinc-900 border-white/10 text-zinc-100 placeholder:text-zinc-600"
          required
        />
      </div>

      {/* Brand URL */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brandUrl" className="text-zinc-300">
          Website URL <span className="text-zinc-600">(optional)</span>
        </Label>
        <Input
          id="brandUrl"
          type="url"
          value={brandUrl}
          onChange={(e) => setBrandUrl(e.target.value)}
          placeholder="https://acme.com"
          className="bg-zinc-900 border-white/10 text-zinc-100 placeholder:text-zinc-600"
        />
      </div>

      {/* Buyer Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buyerEmail" className="text-zinc-300">
          Your Email <span className="text-red-400">*</span>
        </Label>
        <Input
          id="buyerEmail"
          type="email"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          placeholder="you@acme.com"
          className="bg-zinc-900 border-white/10 text-zinc-100 placeholder:text-zinc-600"
          required
        />
      </div>

      {/* Logo Upload */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-zinc-300">
          Brand Logo <span className="text-red-400">*</span>
        </Label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="border-black/10 text-zinc-900 hover:text-white"
          >
            {uploading
              ? "Uploading…"
              : logoFile
                ? "Change logo"
                : "Choose file"}
          </Button>
          {logoUrl && (
            <span className="text-xs text-green-400">✓ Uploaded</span>
          )}
          {uploadError && (
            <span className="text-xs text-red-400">{uploadError}</span>
          )}
        </div>
        {logoUrl && (
          <div className="mt-2">
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 w-12 rounded-lg object-contain border border-white/10"
            />
          </div>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
          {submitError}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={submitting || !logoUrl}
        className="w-full bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold"
      >
        {submitting ? "Submitting…" : "Submit Claim"}
      </Button>

      <p className="text-center text-xs text-zinc-600">
        You&rsquo;ll be redirected to Dodo Payments (test mode) to complete the
        purchase securely.
      </p>
    </form>
  );
}
