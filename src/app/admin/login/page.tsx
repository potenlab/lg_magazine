"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/admin";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "로그인에 실패했습니다.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f3ea] px-6 text-[#2f261f]">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-md border border-[#e4dccd] bg-white p-7 shadow-sm"
      >
        <p className="text-[11px] font-semibold tracking-[0.24em] text-[#9b8768]">MAGAZINE ADMIN</p>
        <h1 className="mt-2 text-xl font-semibold">관리자 로그인</h1>
        <p className="mt-2 text-sm text-[#7d705f]">접근 비밀번호를 입력해주세요.</p>

        <label className="mt-5 block text-xs font-semibold text-[#5d4d3b]">
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-2 w-full rounded-md border border-[#d8cbb8] bg-[#fffdf8] px-3 py-2 text-sm text-[#2f261f] outline-none focus:border-[#a08c6b]"
          />
        </label>

        {error && <p className="mt-3 text-xs text-[#9b4b3e]">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-5 w-full rounded-md bg-[#34251b] px-4 py-2 text-sm font-semibold text-[#fffdf8] disabled:opacity-40"
        >
          {loading ? "확인 중..." : "들어가기"}
        </button>
      </form>
    </main>
  );
}
