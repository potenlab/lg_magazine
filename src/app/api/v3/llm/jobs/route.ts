import { NextResponse } from "next/server";
import { getJob } from "@/lib/llm/jobQueue";

export const runtime = "nodejs";

// Poll a queued LLM job: GET /api/v3/llm/jobs?id=<jobId>
//   { status: "queued", position: 7 }       — still in line
//   { status: "running", position: 0 }      — being processed
//   { status: "done", result: ... }         — finished, take the result
//   { status: "error", error: "..." }       — failed
//   404                                       — unknown/expired (client should resubmit)
//
// NOTE: jobs live in the memory of the replica that handled the POST, so polls
// must be routed to that same replica (nginx sticky sessions). A 404 here on a
// known-good id usually means the poll hit a different replica.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(job);
}
