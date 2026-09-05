"use client";

import { useState } from "react";

/* ================================================================
   SETTINGS PAGE
   Configure application variables including YouTube posting and auth.
   ================================================================ */

type SettingsSection = "general" | "youtube" | "auth" | "advanced";

/* ================================================================
   MOCK SETTINGS: Placeholder until real settings API is implemented
   ================================================================ */
const INITIAL_SETTINGS = {
  general: {
    appName: "MD2YT",
    autoEnhance: true,
    renderQuality: "high",
  },
  youtube: {
    channelId: "",
    apiKey: "",
    autoUpload: false,
    defaultCategory: "22",
    defaultPrivacy: "private",
  },
  auth: {
    githubToken: "",
    openRouterKey: "",
    geminiKey: "",
  },
  advanced: {
    maxConcurrentRenders: 3,
    retryOnFailure: true,
    logRetentionDays: 30,
  },
};

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [saved, setSaved] = useState(false);

  /* ================================================================
     HANDLER: Update settings
     ================================================================ */
  function updateSettings(section: SettingsSection, key: string, value: string | boolean | number) {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
    setSaved(false);
  }

  /* ================================================================
     HANDLER: Save settings
     ================================================================ */
  function handleSave() {
    // TODO: Implement actual settings save API
    console.log("Saving settings:", settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  /* ================================================================
     HELPER: Get section title
     ================================================================ */
  function getSectionTitle(section: SettingsSection): string {
    switch (section) {
      case "general": return "General";
      case "youtube": return "YouTube";
      case "auth": return "Authentication";
      case "advanced": return "Advanced";
    }
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
      {/* ================================================================
         HEADER SECTION
         Page title and save button.
         ================================================================ */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-4xl font-extrabold text-fg leading-tight">Settings</h1>
          <p className="text-fg-muted text-[14px] mt-1.5">Configure application variables</p>
        </div>
        <button
          onClick={handleSave}
          className={`px-6 py-2.5 font-medium text-sm rounded-lg transition-all ${
            saved
              ? "bg-success text-bg"
              : "bg-accent text-bg hover:bg-accent-hover shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
          }`}
        >
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* ================================================================
         SETTINGS LAYOUT
         Sidebar navigation + settings content.
         ================================================================ */}
      <div className="flex gap-8">
        {/* Section Navigation */}
        <div className="w-48 flex-shrink-0">
          <nav className="flex flex-col gap-1">
            {(["general", "youtube", "auth", "advanced"] as SettingsSection[]).map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`text-left px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-colors ${
                  activeSection === section
                    ? "text-fg bg-bg-elevated"
                    : "text-fg-muted hover:text-fg hover:bg-bg-elevated/50"
                }`}
              >
                {getSectionTitle(section)}
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          {/* ================================================================
             GENERAL SETTINGS
             Basic application configuration.
             ================================================================ */}
          {activeSection === "general" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-fg mb-4">General Settings</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">App Name</label>
                  <input
                    type="text"
                    value={settings.general.appName}
                    onChange={(e) => updateSettings("general", "appName", e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Render Quality</label>
                  <select
                    value={settings.general.renderQuality}
                    onChange={(e) => updateSettings("general", "renderQuality", e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  >
                    <option value="low">Low (Faster)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (Slower)</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoEnhance"
                    checked={settings.general.autoEnhance}
                    onChange={(e) => updateSettings("general", "autoEnhance", e.target.checked)}
                    className="w-5 h-5 bg-bg border border-rule rounded accent-accent"
                  />
                  <label htmlFor="autoEnhance" className="text-fg">Auto-enhance scripts</label>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
             YOUTUBE SETTINGS
             YouTube API configuration for video uploads.
             ================================================================ */}
          {activeSection === "youtube" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-fg mb-4">YouTube Settings</h2>
              
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-fg font-semibold">YouTube API Required</p>
                    <p className="text-fg-muted text-[13px] mt-1">
                      To enable automatic video uploads, configure your YouTube API credentials below.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Channel ID</label>
                  <input
                    type="text"
                    value={settings.youtube.channelId}
                    onChange={(e) => updateSettings("youtube", "channelId", e.target.value)}
                    placeholder="UC..."
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">API Key</label>
                  <input
                    type="password"
                    value={settings.youtube.apiKey}
                    onChange={(e) => updateSettings("youtube", "apiKey", e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Default Category</label>
                  <select
                    value={settings.youtube.defaultCategory}
                    onChange={(e) => updateSettings("youtube", "defaultCategory", e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  >
                    <option value="22">People & Blogs</option>
                    <option value="17">Sports</option>
                    <option value="24">Entertainment</option>
                    <option value="28">Science & Technology</option>
                  </select>
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Default Privacy</label>
                  <select
                    value={settings.youtube.defaultPrivacy}
                    onChange={(e) => updateSettings("youtube", "defaultPrivacy", e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 md:col-span-2">
                  <input
                    type="checkbox"
                    id="autoUpload"
                    checked={settings.youtube.autoUpload}
                    onChange={(e) => updateSettings("youtube", "autoUpload", e.target.checked)}
                    className="w-5 h-5 bg-bg border border-rule rounded accent-accent"
                  />
                  <label htmlFor="autoUpload" className="text-fg">Automatically upload videos after render</label>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
             AUTH SETTINGS
             API keys and authentication tokens.
             ================================================================ */}
          {activeSection === "auth" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-fg mb-4">Authentication</h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">GitHub Token</label>
                  <input
                    type="password"
                    value={settings.auth.githubToken}
                    onChange={(e) => updateSettings("auth", "githubToken", e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                  <p className="text-fg-muted text-[12px] mt-2">Required for GitHub Actions integration and artifact downloads.</p>
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">OpenRouter API Key</label>
                  <input
                    type="password"
                    value={settings.auth.openRouterKey}
                    onChange={(e) => updateSettings("auth", "openRouterKey", e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                  <p className="text-fg-muted text-[12px] mt-2">Used for LLM-powered script enhancement.</p>
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Gemini API Key</label>
                  <input
                    type="password"
                    value={settings.auth.geminiKey}
                    onChange={(e) => updateSettings("auth", "geminiKey", e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                  <p className="text-fg-muted text-[12px] mt-2">Alternative LLM provider for script generation.</p>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
             ADVANCED SETTINGS
             Technical configuration options.
             ================================================================ */}
          {activeSection === "advanced" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-fg mb-4">Advanced Settings</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Max Concurrent Renders</label>
                  <input
                    type="number"
                    value={settings.advanced.maxConcurrentRenders}
                    onChange={(e) => updateSettings("advanced", "maxConcurrentRenders", parseInt(e.target.value) || 1)}
                    min="1"
                    max="10"
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Log Retention (Days)</label>
                  <input
                    type="number"
                    value={settings.advanced.logRetentionDays}
                    onChange={(e) => updateSettings("advanced", "logRetentionDays", parseInt(e.target.value) || 7)}
                    min="1"
                    max="365"
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 md:col-span-2">
                  <input
                    type="checkbox"
                    id="retryOnFailure"
                    checked={settings.advanced.retryOnFailure}
                    onChange={(e) => updateSettings("advanced", "retryOnFailure", e.target.checked)}
                    className="w-5 h-5 bg-bg border border-rule rounded accent-accent"
                  />
                  <label htmlFor="retryOnFailure" className="text-fg">Automatically retry failed renders</label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
