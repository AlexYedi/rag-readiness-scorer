import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const fileType = SUPPORTED_TYPES[mimeType];

  switch (fileType) {
    case "pdf": {
      // pdf-parse v1 is a CJS module — require() avoids Turbopack ESM issues
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      return result.text;
    }
    case "docx": {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt":
    case "md":
    case "csv":
    case "json":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "text/plain";
    if (!SUPPORTED_TYPES[mimeType]) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, MD, CSV, JSON.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await extractText(buffer, mimeType);

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from file. The file may be empty or image-only." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: text.slice(0, 50000),
      fileName: file.name,
      fileType: SUPPORTED_TYPES[mimeType],
      originalLength: text.length,
      truncated: text.length > 50000,
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract text from file." },
      { status: 500 }
    );
  }
}
