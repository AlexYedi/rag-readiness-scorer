"use client";

import { useState } from "react";

interface Dimension {
  name: string;
  grade: string;
  explanation: string;
  remediation: string;
}

interface ScoreResult {
  dimensions: Dimension[];
  overallGrade: string;
  summary: string;
}

const gradeColor: Record<string, string> = {
  A: "text-green-600 bg-green-50 border-green-200",
  B: "text-blue-600 bg-blue-50 border-blue-200",
  C: "text-yellow-600 bg-yellow-50 border-yellow-200",
  D: "text-orange-600 bg-orange-50 border-orange-200",
  F: "text-red-600 bg-red-50 border-red-200",
};

export default function Home() {
  const [document, setDocument] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleScore = async () => {
    if (!document.trim()) {
      setError("Paste a document to score.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            RAG Readiness Scorer
          </h1>
          <p className="mt-2 text-zinc-400">
            Paste a document. Get scored across 5 readiness dimensions for
            retrieval-augmented generation.
          </p>
        </div>

        {/* Input */}
        <div className="mb-6">
          <textarea
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="Paste your document here..."
            className="w-full h-48 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-y font-mono text-sm"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-zinc-500">
              {document.length.toLocaleString()} / 50,000 characters
            </span>
            <button
              onClick={handleScore}
              disabled={loading || !document.trim()}
              className="px-6 py-2.5 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Scoring..." : "Score Document"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mb-6 p-8 bg-zinc-900 border border-zinc-800 rounded-lg text-center">
            <div className="animate-pulse text-zinc-400">
              Analyzing document across 5 RAG readiness dimensions...
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Overall Grade */}
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center gap-4">
                <div
                  className={`text-4xl font-bold px-4 py-2 rounded-lg border ${gradeColor[result.overallGrade] || "text-zinc-400 bg-zinc-800 border-zinc-700"}`}
                >
                  {result.overallGrade}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    Overall RAG Readiness
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    {result.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* Dimension Cards */}
            {result.dimensions.map((dim, i) => (
              <div
                key={i}
                className="p-5 bg-zinc-900 border border-zinc-800 rounded-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{dim.name}</h3>
                  <span
                    className={`text-xl font-bold px-3 py-1 rounded border ${gradeColor[dim.grade] || "text-zinc-400 bg-zinc-800 border-zinc-700"}`}
                  >
                    {dim.grade}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 mb-3">{dim.explanation}</p>
                <div className="text-sm text-zinc-500 border-t border-zinc-800 pt-3">
                  <span className="font-medium text-zinc-400">Fix: </span>
                  {dim.remediation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
