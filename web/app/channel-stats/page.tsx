"use client";

/* ================================================================
   CHANNEL STATS PAGE
   Displays YouTube channel statistics (placeholder for API integration).
   ================================================================ */

/* ================================================================
   MOCK DATA: Placeholder stats until YouTube API is integrated
   ================================================================ */
const MOCK_STATS = {
  subscribers: "12,450",
  views: "89,234",
  watchTime: "1,245 hrs",
  videos: 47,
  avgViews: "1,898",
  engagement: "4.2%",
};

const MOCK_VIDEOS = [
  { title: "Premier League Recap - Week 15", views: "2,345", likes: "189", date: "2 days ago" },
  { title: "Transfer Deadline Day Analysis", views: "1,892", likes: "156", date: "5 days ago" },
  { title: "Champions League Preview", views: "3,456", likes: "278", date: "1 week ago" },
  { title: "Top 10 Goals of the Week", views: "4,567", likes: "367", date: "1 week ago" },
  { title: "Match Day Highlights - Derby", views: "2,789", likes: "223", date: "2 weeks ago" },
];

export default function ChannelStatsPage() {
  return (
    <div className="h-full overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
      {/* ================================================================
         HEADER SECTION
         Page title and description.
         ================================================================ */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-fg leading-tight">Channel Stats</h1>
        <p className="text-fg-muted text-[14px] mt-1.5">YouTube channel analytics</p>
      </div>

      {/* ================================================================
         API STATUS BANNER
         Notice about YouTube API integration status.
         ================================================================ */}
      <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-8">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-fg font-semibold">YouTube API Integration Pending</p>
            <p className="text-fg-muted text-[13px] mt-1">
              This page displays placeholder data. To enable real analytics, configure your YouTube API credentials in Settings.
            </p>
          </div>
        </div>
      </div>

      {/* ================================================================
         STATS GRID SECTION
         Key metrics displayed in a responsive grid.
         ================================================================ */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Subscribers</p>
          <p className="text-3xl font-bold text-fg">{MOCK_STATS.subscribers}</p>
        </div>
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Total Views</p>
          <p className="text-3xl font-bold text-fg">{MOCK_STATS.views}</p>
        </div>
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Watch Time</p>
          <p className="text-3xl font-bold text-fg">{MOCK_STATS.watchTime}</p>
        </div>
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Videos</p>
          <p className="text-3xl font-bold text-accent">{MOCK_STATS.videos}</p>
        </div>
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Avg Views</p>
          <p className="text-3xl font-bold text-fg">{MOCK_STATS.avgViews}</p>
        </div>
        <div className="bg-bg rounded-xl p-5 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-2">Engagement</p>
          <p className="text-3xl font-bold text-success">{MOCK_STATS.engagement}</p>
        </div>
      </div>

      {/* ================================================================
         TOP VIDEOS SECTION
         List of recent videos with performance metrics.
         ================================================================ */}
      <div>
        <h2 className="font-bold text-fg text-[18px] mb-4">Recent Videos</h2>
        <div className="bg-bg rounded-xl border border-rule overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-bg-elevated border-b border-rule text-fg-muted text-[12px] uppercase tracking-wider font-semibold">
            <div className="col-span-6">Title</div>
            <div className="col-span-2 text-right">Views</div>
            <div className="col-span-2 text-right">Likes</div>
            <div className="col-span-2 text-right">Date</div>
          </div>

          {/* Table Body */}
          {MOCK_VIDEOS.map((video, i) => (
            <div
              key={i}
              className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-bg-elevated/50 transition-colors ${
                i < MOCK_VIDEOS.length - 1 ? "border-b border-rule" : ""
              }`}
            >
              <div className="col-span-6">
                <span className="font-medium text-fg text-[14px]">{video.title}</span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-fg-muted text-[14px]">{video.views}</span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-fg-muted text-[14px]">{video.likes}</span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-fg-muted text-[14px]">{video.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
