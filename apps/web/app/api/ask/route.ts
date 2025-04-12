import { ask } from "@/lib/answer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 500) {
    return Response.json({ error: "Send {\"question\": string} of 1 to 500 characters." }, { status: 400 });
  }
  try {
    return Response.json(await ask(question));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong answering that question." }, { status: 500 });
  }
}
