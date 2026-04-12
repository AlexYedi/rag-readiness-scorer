"use client";

import { useState, useRef, useCallback } from "react";

interface Dimension {
  name: string;
  score: number;
  grade: string;
  explanation: string;
  remediation: string;
}

interface ScoreResult {
  dimensions: Dimension[];
  overallScore: number;
  overallGrade: string;
  summary: string;
}

// Dark-theme grade colors — bg works on zinc-950, text pops
const gradeConfig: Record<string, { text: string; bg: string; border: string; bar: string; ring: string }> = {
  A: { text: "text-emerald-400", bg: "bg-emerald-950/50", border: "border-emerald-800", bar: "bg-emerald-500", ring: "stroke-emerald-500" },
  B: { text: "text-blue-400", bg: "bg-blue-950/50", border: "border-blue-800", bar: "bg-blue-500", ring: "stroke-blue-500" },
  C: { text: "text-amber-400", bg: "bg-amber-950/50", border: "border-amber-800", bar: "bg-amber-500", ring: "stroke-amber-500" },
  D: { text: "text-orange-400", bg: "bg-orange-950/50", border: "border-orange-800", bar: "bg-orange-500", ring: "stroke-orange-500" },
  F: { text: "text-red-400", bg: "bg-red-950/50", border: "border-red-800", bar: "bg-red-500", ring: "stroke-red-500" },
};

const fallbackGrade = { text: "text-zinc-400", bg: "bg-zinc-800", border: "border-zinc-700", bar: "bg-zinc-500", ring: "stroke-zinc-500" };

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.csv,.json";
const ACCEPTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];

function ScoreRing({ score, grade, size = 120 }: { score: number; grade: string; size?: number }) {
  const config = gradeConfig[grade] || fallbackGrade;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${config.ring} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${config.text}`}>{grade}</span>
        <span className="text-xs text-zinc-500">{score}/100</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, grade }: { score: number; grade: string }) {
  const config = gradeConfig[grade] || fallbackGrade;
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${config.bar} transition-all duration-700 ease-out`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function DimensionIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    "Metadata Quality": "\u{1F3F7}",
    "Semantic Clarity": "\u{1F50D}",
    "Structure for Chunking": "\u{1F9E9}",
    "Completeness": "\u{1F4CB}",
    "Currency & Temporality": "\u{231B}",
  };
  return <span className="text-lg">{icons[name] || "\u{1F4CA}"}</span>;
}

type InputMode = "paste" | "upload";

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [document, setDocument] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [showRemediation, setShowRemediation] = useState<Record<number, boolean>>({});
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractTextFromFile = async (file: File): Promise<string> => {
    setExtracting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract text.");
      }

      if (data.truncated) {
        setError(`File truncated from ${data.originalLength.toLocaleString()} to 50,000 characters.`);
      }

      return data.text;
    } finally {
      setExtracting(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!ACCEPTED_MIME.includes(file.type) && !file.name.match(/\.(pdf|docx|txt|md|csv|json)$/i)) {
      setError("Unsupported file type. Use PDF, DOCX, TXT, MD, CSV, or JSON.");
      return;
    }

    setFileName(file.name);
    setError("");

    try {
      const text = await extractTextFromFile(file);
      setDocument(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract text from file.");
      setFileName("");
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      setInputMode("upload");
      await handleFileSelect(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleScore = async () => {
    if (!document.trim()) {
      setError("Paste a document or upload a file to score.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setShowRemediation({});

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setResult(data);
    } catch {
      setError("Failed to connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setDocument("");
    setFileName("");
    setShowRemediation({});
    setError("");
  };

  const toggleRemediation = (index: number) => {
    setShowRemediation((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const hasInput = document.trim().length > 0;

  return (
    <div
      className="min-h-screen bg-zinc-950 text-zinc-100"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Full-page drag overlay */}
      {dragActive && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="p-8 border-2 border-dashed border-blue-500 rounded-2xl bg-blue-950/30">
            <p className="text-lg text-blue-400 font-medium">Drop file to score</p>
            <p className="text-sm text-zinc-500 mt-1">PDF, DOCX, TXT, MD, CSV, JSON</p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-lg" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              RAG Readiness Scorer
            </h1>
          </div>
          <p className="text-zinc-400 text-sm sm:text-base">
            Paste text or upload a file. Get scored across 5 dimensions for
            retrieval-augmented generation readiness.
          </p>
        </div>

        {/* Input mode tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setInputMode("paste")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              inputMode === "paste"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Paste text
          </button>
          <button
            onClick={() => setInputMode("upload")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              inputMode === "upload"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Upload file
          </button>
        </div>

        {/* Input area */}
        <div className="mb-6">
          {inputMode === "paste" ? (
            <textarea
              value={document}
              onChange={(e) => { setDocument(e.target.value); setFileName(""); }}
              placeholder="Paste your document here — event invites, meeting notes, research briefs, knowledge base articles..."
              className="w-full h-48 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600 resize-y font-mono text-sm leading-relaxed"
            />
          ) : (
            <div className="space-y-3">
              {/* Drop zone */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 p-4 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center gap-3 hover:border-zinc-500 hover:bg-zinc-900/80 transition-colors cursor-pointer"
              >
                <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {extracting ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Extracting text...
                  </div>
                ) : fileName ? (
                  <div className="text-center">
                    <p className="text-sm text-zinc-300 font-medium">{fileName}</p>
                    <p className="text-xs text-zinc-500 mt-1">{document.length.toLocaleString()} characters extracted. Click to replace.</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-zinc-400">
                      Click to select or drag and drop
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      PDF, DOCX, TXT, MD, CSV, JSON — up to 10MB
                    </p>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
                className="hidden"
              />

              {/* Show extracted text preview */}
              {document && (
                <div className="relative">
                  <textarea
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="w-full h-32 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600 resize-y font-mono text-sm leading-relaxed"
                  />
                  <div className="absolute top-2 right-2">
                    <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
                      Extracted text — editable
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-zinc-500">
              {document.length.toLocaleString()} / 50,000 characters
              {fileName && <span className="ml-2 text-zinc-600">from {fileName}</span>}
            </span>
            <button
              onClick={handleScore}
              disabled={loading || extracting || !hasInput}
              className="px-6 py-2.5 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scoring...
                </span>
              ) : (
                "Score Document"
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 mb-6">
            <div className="h-32 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4 animate-in fade-in duration-500">
            {/* Source indicator */}
            {fileName && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Scored from: {fileName}
              </div>
            )}

            {/* Overall Score Card */}
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
              <div className="flex items-center gap-6">
                <ScoreRing score={result.overallScore} grade={result.overallGrade} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold mb-1">
                    Overall RAG Readiness
                  </h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {result.summary}
                  </p>
                </div>
              </div>

              {/* Mini score strip */}
              <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-5 gap-2">
                {result.dimensions.map((dim, i) => {
                  const config = gradeConfig[dim.grade] || fallbackGrade;
                  return (
                    <div key={i} className="text-center">
                      <div className={`text-lg font-bold ${config.text}`}>{dim.grade}</div>
                      <div className="text-[10px] text-zinc-500 leading-tight mt-0.5 truncate">
                        {dim.name.replace("& Temporality", "& Time")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dimension Cards */}
            {result.dimensions.map((dim, i) => {
              const config = gradeConfig[dim.grade] || fallbackGrade;
              const isOpen = showRemediation[i];

              return (
                <div
                  key={i}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <ScoreBar score={dim.score} grade={dim.grade} />

                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <DimensionIcon name={dim.name} />
                        <h3 className="font-semibold">{dim.name}</h3>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm text-zinc-500 tabular-nums">{dim.score}/100</span>
                        <span
                          className={`text-xl font-bold px-3 py-0.5 rounded-lg border ${config.text} ${config.bg} ${config.border}`}
                        >
                          {dim.grade}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-zinc-300 leading-relaxed">{dim.explanation}</p>

                    <button
                      onClick={() => toggleRemediation(i)}
                      className="mt-3 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      How to fix
                    </button>
                    {isOpen && (
                      <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-400 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        {dim.remediation}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Score again */}
            <div className="pt-2 text-center">
              <button
                onClick={handleReset}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Score another document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
