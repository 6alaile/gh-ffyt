"""
research.py — research agent for brief enrichment.

Scrapes live data from multiple sources and synthesizes findings into
a structured research report that can be merged into a brief.

Data sources:
- Reddit (r/soccer match threads for fan sentiment)
- RSS feeds (BBC Sport, ESPN for match reports)
- Google Trends (topic validation and search volume)
- Stats APIs (placeholder for future integration)

Mode 1: Enrich existing user input (user provides match details + voice)
Mode 2: Topic-only research (user provides just a topic, agent finds everything)
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import feedparser
import praw
import requests


@dataclass
class ResearchFindings:
    """Structured research output that can be merged into a brief."""
    teams: list[str]
    key_moments: list[str]
    fan_sentiment: list[str]
    match_reports: list[str]
    stats: dict[str, Any]
    trends_volume: int | None
    source_urls: list[str]


def research_topic(topic: str, mode: str = "enrich") -> ResearchFindings:
    """Research a topic and return structured findings.
    
    Args:
        topic: The match/topic to research (e.g. "Liverpool vs Man City")
        mode: "enrich" (add to user input) or "full" (generate everything)
    
    Returns:
        ResearchFindings with scraped data
    """
    findings = ResearchFindings(
        teams=[],
        key_moments=[],
        fan_sentiment=[],
        match_reports=[],
        stats={},
        trends_volume=None,
        source_urls=[],
    )
    
    # Extract team names from topic
    teams = _extract_teams(topic)
    findings.teams = teams
    
    # Reddit scraping (fan sentiment)
    reddit_data = _scrape_reddit(topic, teams)
    findings.fan_sentiment = reddit_data["comments"]
    findings.source_urls.extend(reddit_data["urls"])
    
    # RSS feeds (match reports)
    rss_data = _scrape_rss_feeds(topic, teams)
    findings.match_reports = rss_data["articles"]
    findings.source_urls.extend(rss_data["urls"])
    
    # Google Trends (topic validation)
    trends_volume = _check_google_trends(topic)
    findings.trends_volume = trends_volume
    
    # Placeholder for stats API (future)
    # findings.stats = _fetch_match_stats(teams)
    
    return findings


def _extract_teams(topic: str) -> list[str]:
    """Extract team names from topic string."""
    # Simple regex for "Team A vs Team B" pattern
    vs_pattern = r"(\w+(?:\s+\w+)*)\s+(?:vs|versus|v|against)\s+(\w+(?:\s+\w+)*)"
    match = re.search(vs_pattern, topic, re.IGNORECASE)
    if match:
        return [match.group(1).strip(), match.group(2).strip()]
    return []


def _scrape_reddit(topic: str, teams: list[str]) -> dict[str, Any]:
    """Scrape Reddit r/soccer for match threads and top comments."""
    try:
        reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID", ""),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET", ""),
            user_agent="md2yt/1.0",
        )
        
        # Search for match threads
        search_query = " ".join(teams) if teams else topic
        subreddit = reddit.subreddit("soccer")
        posts = subreddit.search(search_query, limit=5, time_filter="week")
        
        comments = []
        urls = []
        for post in posts:
            if "match thread" in post.title.lower() or "post match" in post.title.lower():
                urls.append(f"https://reddit.com{post.permalink}")
                post.comments.replace_more(limit=0)
                for comment in post.comments[:10]:
                    if hasattr(comment, "body") and len(comment.body) > 20:
                        comments.append(comment.body[:200])
        
        return {"comments": comments[:20], "urls": urls}
    except Exception as e:
        print(f"Reddit scraping failed: {e}")
        return {"comments": [], "urls": []}


def _scrape_rss_feeds(topic: str, teams: list[str]) -> dict[str, Any]:
    """Scrape RSS feeds from BBC Sport and ESPN for match reports."""
    feeds = [
        "https://feeds.bbci.co.uk/sport/football/rss.xml",
        "https://www.espn.com/espn/rss/soccer/news",
    ]
    
    articles = []
    urls = []
    search_terms = teams + [topic]
    
    for feed_url in feeds:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:20]:
                title = entry.get("title", "")
                summary = entry.get("summary", entry.get("description", ""))
                
                # Check if any search term appears in title or summary
                if any(term.lower() in title.lower() or term.lower() in summary.lower() 
                       for term in search_terms):
                    articles.append(f"{title}: {summary[:200]}")
                    urls.append(entry.get("link", ""))
        except Exception as e:
            print(f"RSS feed scraping failed for {feed_url}: {e}")
    
    return {"articles": articles[:10], "urls": urls[:10]}


def _check_google_trends(topic: str) -> int | None:
    """Check Google Trends search volume (placeholder - requires pytrends)."""
    try:
        from pytrends.request import TrendReq
        
        pytrends = TrendReq(hl="en-US", tz=0)
        pytrends.build_payload([topic], timeframe="now 7-d")
        data = pytrends.interest_over_time()
        
        if not data.empty and topic in data.columns:
            return int(data[topic].mean())
        return None
    except ImportError:
        print("pytrends not installed - skipping Google Trends")
        return None
    except Exception as e:
        print(f"Google Trends check failed: {e}")
        return None


def synthesize_brief(
    user_input: dict[str, str],
    findings: ResearchFindings,
    mode: str = "enrich"
) -> str:
    """Synthesize research findings into a markdown brief.
    
    Args:
        user_input: Form fields from the user (matchTitle, teams, keyMoments, etc.)
        findings: Research data from research_topic()
        mode: "enrich" (merge with user input) or "full" (generate from scratch)
    
    Returns:
        Markdown brief text
    """
    # Use findings to enrich user input
    title = user_input.get("matchTitle", "") or " vs ".join(findings.teams)
    teams = user_input.get("teams", "") or ", ".join(findings.teams)
    
    # Merge key moments from user + research
    user_moments = user_input.get("keyMoments", "")
    research_moments = "\n".join(f"- {m}" for m in findings.key_moments[:5])
    
    # Synthesize fan sentiment
    sentiment = "\n".join(f"- {s[:100]}..." for s in findings.fan_sentiment[:3])
    
    # Build the brief markdown
    brief = f"""# Content Brief: {title}

## The Idea
**Core concept:** {user_input.get('analysisAngle', 'Match analysis')}
**Match:** {teams}
**Tone:** {user_input.get('tone', 'analytical')}

---

## Key Moments
{user_moments}

### Additional Context from Research:
{research_moments if research_moments else "No additional moments found"}

---

## Fan Reactions (from Reddit r/soccer):
{sentiment if sentiment else "No sentiment data available"}

---

## Match Reports:
{chr(10).join(f"- {r[:150]}..." for r in findings.match_reports[:3]) if findings.match_reports else "No match reports found"}

---

## Script Outline

| # | Scene Title | Duration | Voiceover / On-screen Text | Visual Direction | Notes |
|---|-------------|----------|---------------------------|-----------------|-------|
| 1 | Hook | 0-8s | TODO: Add hook script | Match highlights | Opening scene |
| 2 | Analysis | 8-60s | TODO: Add analysis | Tactical graphics | Main content |
| 3 | CTA | 60-75s | {user_input.get('cta', 'Subscribe for more')} | Channel logo | Closing |

---

## YouTube Metadata

**Title options:**
1. {title}
2. TODO: Add alternative title

**Description:** TODO: Add description

**Tags:** {', '.join(findings.teams)}, football, soccer, match analysis

---

## Research Sources
{chr(10).join(f"- {url}" for url in findings.source_urls[:10])}

---

**Generated:*
