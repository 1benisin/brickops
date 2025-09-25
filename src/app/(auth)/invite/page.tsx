"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function InviteRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams?.get("token");
    if (token) {
      router.replace(`/signup?inviteToken=${encodeURIComponent(token)}`);
      return;
    }
    const code = searchParams?.get("code") || searchParams?.get("inviteCode");
    if (code) {
      router.replace(`/signup?inviteCode=${encodeURIComponent(code)}`);
      return;
    }
    router.replace("/signup");
  }, [router, searchParams]);

  return null;
}
