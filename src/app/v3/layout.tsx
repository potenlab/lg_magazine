import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Magazine STORY · Vision Express V3",
  description: "당신만을 위한 단 한 호의 매거진",
};

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
