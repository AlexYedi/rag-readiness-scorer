import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Load API key — Turbopack root mismatch prevents .env.local from loading in dev.
// On Vercel, process.env works natively. This fallback reads .env.local directly.
function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  try {
    const { join } = require("path");
    const envPath = join(process.cwd(), ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/ANTHROPIC_API_KEY=(.*)/);
    if (match) return match[1].trim();
  } catch {
    // File not found — fall through
  }

  return "";
}

const SCORING_PROMPT = `You are a RAG Readiness Scorer. You evaluate documents for their readiness to be used in Retrieval-Augmented Generation (RAG) systems.

Score the document across these 5 dimensions, each on an A-F letter grade:

1. **Metadata Quality** — Does the document have clear titles, headings, dates, authors, or other structural metadata that helps a retrieval system understand what it contains?

2. **Semantic Clarity** — Is the language precise and unambiguous? Would an embedding model produce meaningful vectors from this text, or is it full of jargon without context, acronyms without definitions, or vague references?

3. **Structure for Chunking** — Is the document organized in a way that can be split into self-contained chunks? Are there logical sections, paragraphs that stand alone, or is it one continuous stream where meaning depends on distant context?

4. **Completeness** — Does the document contain enough information to answer questions about its topic, or does it reference external documents, assume prior knowledge, or leave gaps?

5. **Currency** — Is the information current and timestamped, or is it undated and potentially stale?

For each dimension:
- Give a letter grade (A, B, C, D, or F)
- Write 1-2 sentences explaining the grade
- Provide 1 specific remediation suggestion

After scoring all 5 dimensions, provide:
- An **overall readiness grade** (weighted average, letter grade)
- A **1-paragraph summary** of the document's RAG readiness

Respond in this exact JSON format:
{
  "dimensions": [
    {
      "name": "Metadata Quality",
      "grade": "B",
      "explanation": "...",
      "remediation": "..."
    },
    ...
  ],
  "overallGrade": "B",
  "summary": "..."
}`;

export async function POST(request: NextRequest) {
  try {
    const { document } = await request.json();

    if (!document || typeof document !== "string" || document.trim().length === 0) {
      return NextResponse.json(
        { error: "Please provide a document to score." },
        { status: 400 }
      );
    }

    if (document.length > 50000) {
      return NextResponse.json(
        { error: "Document too long. Please keep it under 50,000 characters." },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not found in environment." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Score this document for RAG readiness:\n\n---\n${document}\n---`,
        },
      ],
      system: SCORING_PROMPT,
    });

    const textContent = message.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "No response from scoring model." },
        { status: 500 }
      );
    }

    // Parse the JSON response from Claude
    const responseText = textContent.text;

    // Extract JSON from the response (Claude sometimes wraps in markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse scoring response.", raw: responseText },
        { status: 500 }
      );
    }

    const scores = JSON.parse(jsonMatch[0]);

    return NextResponse.json(scores);
  } catch (error) {
    console.error("Scoring error:", error);
    return NextResponse.json(
      { error: "Failed to score document. Check API key and try again." },
      { status: 500 }
    );
  }
}
