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

Score the document across 5 dimensions using the rubrics below. For each dimension, assign a numeric score (0-100) and a letter grade using this scale:
  A = 90-100 (excellent, RAG-ready as-is)
  B = 75-89  (good, minor improvements needed)
  C = 60-74  (adequate, meaningful gaps to address)
  D = 40-59  (poor, significant rework needed)
  F = 0-39   (failing, not usable for RAG without major revision)

## Dimension Rubrics

### 1. Metadata Quality
What to evaluate: titles, headings, dates, author attribution, version info, source identifiers, document type indicators.
- A: Has a clear title, hierarchical headings, date(s), author/source, and document type is evident from metadata alone.
- B: Has title and most headings, but missing 1-2 metadata elements (e.g., no date or no author).
- C: Has a title or main heading, but lacks dates, authorship, and structural headings for subsections.
- D: No clear title. Some implicit structure but a retrieval system cannot determine what this document is about from metadata alone.
- F: No title, no headings, no dates, no attribution. Raw text blob.

### 2. Semantic Clarity
What to evaluate: precision of language, acronym definitions, jargon contextualization, referential clarity (no dangling "this", "it", "the system" without antecedent), consistent terminology.
- A: All technical terms defined or contextually clear. No undefined acronyms. Pronouns and references resolve within the same paragraph. Consistent naming throughout.
- B: Most terms are clear. 1-2 undefined acronyms or ambiguous references. A reader unfamiliar with the domain could follow 80%+ of the content.
- C: Multiple undefined acronyms or jargon clusters. Some sentences require prior context to parse. An embedding model would produce noisy vectors for 20-40% of paragraphs.
- D: Heavy jargon without definitions. Frequent ambiguous references ("as mentioned above," "the previous approach"). Meaning depends heavily on assumed context.
- F: Largely opaque without domain expertise. Most sentences contain undefined terms, internal references, or shorthand that would produce meaningless embeddings.

### 3. Structure for Chunking
What to evaluate: logical section breaks, self-contained paragraphs, whether chunks can stand alone without surrounding context, lists vs. prose, table formatting.
- A: Clear hierarchical sections. Each section/paragraph is self-contained. Lists and tables are well-formatted. A 500-token chunk from any part would be independently useful.
- B: Good section structure. Most paragraphs are self-contained. 1-2 sections where meaning flows across boundaries and would be broken by naive chunking.
- C: Some headings exist but sections are uneven. Multiple paragraphs that start with "Additionally," "Furthermore," or back-reference prior sections. Chunking would require overlap or semantic splitting.
- D: Minimal structure. Long continuous paragraphs. Meaning builds cumulatively — removing any section loses context for later sections.
- F: Stream of consciousness. No sections, no paragraph breaks, or single massive paragraph. Cannot be chunked without losing coherence.

### 4. Completeness
What to evaluate: whether the document answers the questions its topic implies, whether it references external docs without summarizing them, whether there are obvious gaps.
- A: Self-contained. All claims are supported within the document. A reader could answer detailed questions about the topic using only this document.
- B: Mostly self-contained. 1-2 external references that are briefly summarized. Minor gaps that a knowledgeable reader would fill.
- C: References external documents, links, or assumed knowledge in multiple places. A RAG system retrieving this chunk would give partial answers that frustrate users.
- D: Heavily dependent on external context. Multiple "see [other doc]" references without summaries. Major topic areas mentioned but not explained.
- F: Fragment or stub. Cannot answer basic questions about its own stated topic. Mostly pointers to other resources.

### 5. Currency & Temporality
What to evaluate: presence of dates, timestamps, version numbers, temporal language ("recently," "upcoming" without dates), whether information could become stale.
- A: Explicit dates/timestamps on the document and key claims. Version info if applicable. Any temporal language is anchored to specific dates.
- B: Document date present. Most time-sensitive claims are dated. 1-2 uses of relative time ("recently") without anchoring.
- C: No document date but content implies a timeframe. Multiple relative time references. A retrieval system cannot determine if this information is current.
- D: No dates anywhere. Multiple claims that are clearly time-sensitive but undated. "Current pricing," "our latest release" with no version or date.
- F: No temporal indicators at all. Impossible to determine when this was written or whether any claim is still valid.

## Scoring Instructions
- Score each dimension independently. Do not let one dimension's score influence another.
- In the explanation, cite specific evidence from the document (quote or reference specific sections/lines).
- In the remediation, give a concrete action the author can take. Bad: "Add more metadata." Good: "Add a document title as an H1 heading, and include an 'Author' and 'Last Updated' line below it."
- The overall score is the arithmetic mean of the 5 dimension scores (rounded to nearest integer). The overall letter grade follows the same scale.

Respond in this exact JSON format:
{
  "dimensions": [
    {
      "name": "Metadata Quality",
      "score": 82,
      "grade": "B",
      "explanation": "...",
      "remediation": "..."
    }
  ],
  "overallScore": 78,
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
