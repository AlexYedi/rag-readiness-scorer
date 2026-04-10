"use client";

import { useState } from "react";

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
  // Simple icon mapping using unicode — keeps bundle tiny
  const icons: Record<string, string> = {
    "Metadata Quality": "\u{1F3F7}",
    "Semantic Clarity": "\u{1F50D}",
    "Structure for Chunking": "\u{1F9E9}",
    "Completeness": "\u{1F4CB}",
    "Currency & Temporality": "\u{231B}",
  };
  return <span className="text-lg">{icons[name] || "\u{1F4CA}"}</span>;
}

export default function Home() {
  const [document, setDocument] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRemediation, setShowRemediation] = useState<Record<number, boolean>>({});

  const handleScore = async () => {
    if (!document.trim()) {
      setError("Paste a document to score.");
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

  const toggleRemediation = (index: number) => {
    setShowRemediation((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
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
            Paste a document. Get scored across 5 dimensions for
            retrieval-augmented generation readiness.
          </p>
        </div>

        {/* Input */}
        <div className="mb-6">
          <textarea
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="Paste your document here — event invites, meeting notes, research briefs, knowledge base articles..."
            className="w-full h-48 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600 resize-y font-mono text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-zinc-500">
              {document.length.toLocaleString()} / 50,000 characters
            </span>
            <button
              onClick={handleScore}
              disabled={loading || !document.trim()}
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
                  {/* Score bar at top of card */}
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

                    {/* Expandable remediation */}
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
                onClick={() => {
                  setResult(null);
                  setDocument("");
                  setShowRemediation({});
                }}
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
