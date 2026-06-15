<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 배포 / 커밋 규칙
- **Vercel 토큰**: `<로컬 secrets 참조 — 레포에 평문 커밋 금지>`
- **커밋 author 는 반드시 `dev@potenlab.dev`**
  - 사용 예: `git -c user.name="Potenlab" -c user.email="dev@potenlab.dev" commit -m "..."`
  - Vercel Hobby 플랜 collaborator 제한 때문에 다른 이메일로 커밋하면 자동 배포가 스킵됨.
