"use client";

import { useEffect, useRef, useState } from "react";

export default function BriefFormPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Brief Creator</h1>
      <p className="text-muted mb-6">
        Describe the match you just watched. This will generate a brief that feeds
        into the MD2YT pipeline to create a video spec and render.
      </p>
      <form className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium">Match Title</label>
          <input
            type="text"
            placeholder="e.g. Why Liverpool's Midfield Collapsed"
            className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Teams Involved</label>
          <input
            type="text"
            placeholder="e.g. Liverpool vs Manchester City"
            className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Key Moments</label>
          <textarea
            rows={3}
            placeholder="e.g. Liverpool conceded 2 in last 15 min, midfield overrun"
            className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500 resize-y"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Analysis Angle</label>
          <select className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500">
            <option value="defensive-collapse">Defensive collapse — why it happened</option>
            <option value="high-line-exposed">High line exposed — tactical analysis</option>
            <option value="title-implications">Title race implications</option>
            <option value="player-performance">Individual player performance</option>
            <option value="other">Other...</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Tone</label>
          <select className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500">
            <option value="analytical">Analytical — data-driven, stats-focused</option>
            <option value="energetic">Energetic — passionate, fan-focused</option>
            <option value="subdued">Subdued — calm, reflective</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">CTA (Call to Action)</label>
          <input
            type="text"
            placeholder='e.g. "Which team should we break down next?"'
            className="block w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary-500 focus:border-primary-500"
            required
          />
        </div>
        <button
          type="submit"
          className="btn-primary w-full"
        >
          Generate Brief
        </button>
      </form>
    </div>
  );
}
