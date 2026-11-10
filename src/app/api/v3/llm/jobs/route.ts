import { NextResponse } from "next/server";
import { getJob, waitForJob } from "@/lib/llm/jobQueue";

export const runtime = "nodejs";

// Poll a queued LLM job: GET /api/v3/llm/jobs?id=<jobId>[&wait=<seconds>]
//   { status: "queued", position: 7 }       — still in line
//   { status: "running", position: 0 }      — being processed
//   { status: "done", result: ... }         — finished, take the result
//   { status: "error", error: "..." }       — failed
//   404                                       — unknown/expired (client should resubmit)
//
// With ?wait=N the request is held until the job finishes or N seconds pass,
// so the browser gets the answer the moment it is ready instead of on its next
// poll. Capped well under nginx's 60 s proxy_read_timeout.
//
// NOTE: jobs live in the memory of the replica that handled the POST, so polls
// must be routed to that same replica (nginx sticky sessions). A 404 here on a
// known-good id usually means the poll hit a different replica.
const MAX_WAIT_MS = 20_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const waitSec = Number(url.searchParams.get("wait"));
  if (Number.isFinite(waitSec) && waitSec > 0) {
    await waitForJob(id, Math.min(waitSec * 1000, MAX_WAIT_MS), req.signal);
  }

  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(job);
}
