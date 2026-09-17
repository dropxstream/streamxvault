#!/usr/bin/env python3
"""
StreamXvault SEO Rocket 🚀
==========================
Automated search engine submission & indexing tool.

What it does:
  1. Fetches all published videos from your API
  2. Generates a dynamic sitemap.xml with all video pages
  3. Pings Google, Bing, Yandex, IndexNow (Bing/Yandex/DuckDuckGo/Naver/Seznam)
  4. Submits individual URLs via IndexNow bulk API
  5. Pings 20+ blog/web ping services (XML-RPC)
  6. Generates a comprehensive SEO report

Usage:
  py seo_rocket.py              # Full run: generate sitemap + ping everything
  py seo_rocket.py --sitemap    # Only generate sitemap.xml
  py seo_rocket.py --ping       # Only ping search engines (uses existing sitemap)
  py seo_rocket.py --report     # Only generate SEO health report

Requirements:
  pip install requests
"""

import os
import sys
import json
import uuid
import hashlib
import time
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: py -m pip install requests")
    sys.exit(1)

# Fix Windows console encoding
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION — Edit these to match your site
# ═══════════════════════════════════════════════════════════════
SITE_URL = "https://streamxvault.online"
SITE_NAME = "StreamXvault"
API_VIDEOS_URL = f"{SITE_URL}/api/videos"
SITEMAP_PATH = Path(__file__).parent / "public" / "sitemap.xml"
INDEXNOW_KEY_PATH = Path(__file__).parent / "public"

# IndexNow key — generate a unique one for your site
INDEXNOW_KEY = "streamxvault-indexnow-" + hashlib.md5(SITE_URL.encode()).hexdigest()[:12]

# Static pages on your site
STATIC_PAGES = [
    {"url": "/", "priority": "1.0", "changefreq": "daily"},
    {"url": "/demand.html", "priority": "0.6", "changefreq": "weekly"},
]

# ═══════════════════════════════════════════════════════════════
# COLOR OUTPUT
# ═══════════════════════════════════════════════════════════════
class C:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"

def ok(msg):    print(f"  {C.GREEN}✅ {msg}{C.RESET}")
def warn(msg):  print(f"  {C.YELLOW}⚠️  {msg}{C.RESET}")
def fail(msg):  print(f"  {C.RED}❌ {msg}{C.RESET}")
def info(msg):  print(f"  {C.CYAN}ℹ️  {msg}{C.RESET}")
def header(msg):print(f"\n{C.BOLD}{C.CYAN}{'═'*60}\n  {msg}\n{'═'*60}{C.RESET}")

# ═══════════════════════════════════════════════════════════════
# STEP 1: Fetch videos from your API
# ═══════════════════════════════════════════════════════════════
def fetch_videos():
    """Fetch all published videos from local data or the StreamXvault API."""
    header("📡 Fetching Videos")

    # Try local data first (faster, works offline)
    local_path = Path(__file__).parent / "data" / "videos.json"
    if local_path.exists():
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                videos = json.load(f)
            videos = [v for v in videos if v.get("published") is not False]
            ok(f"Loaded {len(videos)} videos from local data/videos.json")
            return videos
        except Exception as e:
            warn(f"Local file error: {e}")

    # Fallback to API
    try:
        resp = requests.get(API_VIDEOS_URL, timeout=8)
        resp.raise_for_status()
        videos = resp.json()
        ok(f"Fetched {len(videos)} published videos from API")
        return videos
    except requests.RequestException as e:
        fail(f"Could not reach API: {e}")
        return []

# ═══════════════════════════════════════════════════════════════
# STEP 2: Generate sitemap.xml
# ═══════════════════════════════════════════════════════════════
def generate_sitemap(videos):
    """Generate a comprehensive sitemap.xml with all pages and video entries."""
    header("🗺️  Generating Sitemap")

    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    video_ns = "http://www.google.com/schemas/sitemap-video/1.1"

    urlset = ET.Element("urlset")
    urlset.set("xmlns", ns)
    urlset.set("xmlns:video", video_ns)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    # Static pages
    for page in STATIC_PAGES:
        url_el = ET.SubElement(urlset, "url")
        ET.SubElement(url_el, "loc").text = SITE_URL + page["url"]
        ET.SubElement(url_el, "lastmod").text = now
        ET.SubElement(url_el, "changefreq").text = page["changefreq"]
        ET.SubElement(url_el, "priority").text = page["priority"]

    # Video pages
    for v in videos:
        vid = v.get("id", "")
        title = v.get("title", "Untitled Video")
        desc = v.get("description", title)
        thumb = v.get("thumbnailUrl", "")
        uploaded = v.get("uploadedAt", now)
        genre = v.get("genre", "")

        if not vid:
            continue

        watch_url = f"{SITE_URL}/watch?v={vid}"

        url_el = ET.SubElement(urlset, "url")
        ET.SubElement(url_el, "loc").text = watch_url
        ET.SubElement(url_el, "lastmod").text = uploaded[:19] + "+00:00" if uploaded else now
        ET.SubElement(url_el, "changefreq").text = "weekly"
        ET.SubElement(url_el, "priority").text = "0.8"

        # Google Video Sitemap extension
        video_el = ET.SubElement(url_el, "video:video")
        ET.SubElement(video_el, "video:thumbnail_loc").text = thumb or f"{SITE_URL}/og-image/{vid}.jpg"
        ET.SubElement(video_el, "video:title").text = title
        ET.SubElement(video_el, "video:description").text = (desc or title)[:2048]
        ET.SubElement(video_el, "video:player_loc").text = f"{SITE_URL}/api/embed/{vid}"
        if uploaded:
            ET.SubElement(video_el, "video:publication_date").text = uploaded[:19] + "+00:00"
        ET.SubElement(video_el, "video:family_friendly").text = "no"
        if genre:
            ET.SubElement(video_el, "video:tag").text = genre

    # Write sitemap
    tree = ET.ElementTree(urlset)
    ET.indent(tree, space="  ")

    xml_declaration = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_body = ET.tostring(urlset, encoding="unicode")

    SITEMAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as f:
        f.write(xml_declaration + xml_body)

    total_urls = len(STATIC_PAGES) + len(videos)
    ok(f"Sitemap generated: {SITEMAP_PATH}")
    ok(f"Total URLs: {total_urls} ({len(STATIC_PAGES)} static + {len(videos)} videos)")
    return total_urls

# ═══════════════════════════════════════════════════════════════
# STEP 3: Generate IndexNow key file
# ═══════════════════════════════════════════════════════════════
def generate_indexnow_key():
    """Create the IndexNow verification key file in public/."""
    header("🔑 IndexNow Key Setup")
    key_file = INDEXNOW_KEY_PATH / f"{INDEXNOW_KEY}.txt"
    with open(key_file, "w", encoding="utf-8") as f:
        f.write(INDEXNOW_KEY)
    ok(f"Key file created: {key_file}")
    ok(f"Key: {INDEXNOW_KEY}")
    return INDEXNOW_KEY

# ═══════════════════════════════════════════════════════════════
# STEP 4: Ping search engines — Sitemap submission
# ═══════════════════════════════════════════════════════════════
def ping_search_engines():
    """Ping major search engines with the sitemap URL."""
    header("📢 Pinging Search Engines (Sitemap)")

    sitemap_url = f"{SITE_URL}/sitemap.xml"

    ping_targets = [
        ("Google", f"https://www.google.com/ping?sitemap={sitemap_url}"),
        ("Google (alt)", f"http://www.google.com/webmasters/sitemaps/ping?sitemap={sitemap_url}"),
        ("Bing", f"https://www.bing.com/ping?sitemap={sitemap_url}"),
        ("Yandex", f"https://blogs.yandex.ru/pings/?status=success&url={sitemap_url}"),
    ]

    results = {"success": 0, "failed": 0}

    for name, url in ping_targets:
        try:
            resp = requests.get(url, timeout=8, allow_redirects=True,
                                headers={"User-Agent": "StreamXvault-SEO-Bot/1.0"})
            if resp.status_code < 400:
                ok(f"{name}: HTTP {resp.status_code}")
                results["success"] += 1
            else:
                warn(f"{name}: HTTP {resp.status_code}")
                results["failed"] += 1
        except requests.RequestException as e:
            fail(f"{name}: {e}")
            results["failed"] += 1

    return results

# ═══════════════════════════════════════════════════════════════
# STEP 5: IndexNow — Instant indexing for Bing, DuckDuckGo,
#          Yandex, Naver, Seznam, Brave (via Bing partnership)
# ═══════════════════════════════════════════════════════════════
def submit_indexnow(videos):
    """Submit URLs via IndexNow API for instant indexing across multiple engines."""
    header("⚡ IndexNow Bulk Submission")
    info("Targets: Bing, DuckDuckGo, Yandex, Naver, Seznam, Brave")

    # Build URL list
    urls = [SITE_URL + "/"]
    urls.extend(SITE_URL + p["url"] for p in STATIC_PAGES if p["url"] != "/")
    urls.extend(f"{SITE_URL}/watch?v={v['id']}" for v in videos if v.get("id"))

    # IndexNow endpoints — all connected engines
    indexnow_endpoints = [
        "https://api.indexnow.org/indexnow",
        "https://www.bing.com/indexnow",
        "https://yandex.com/indexnow",
    ]

    payload = {
        "host": SITE_URL.replace("https://", "").replace("http://", ""),
        "key": INDEXNOW_KEY,
        "keyLocation": f"{SITE_URL}/{INDEXNOW_KEY}.txt",
        "urlList": urls[:10000]  # IndexNow max 10K per request
    }

    results = {"success": 0, "failed": 0}

    for endpoint in indexnow_endpoints:
        engine_name = endpoint.split("//")[1].split("/")[0]
        try:
            resp = requests.post(
                endpoint,
                json=payload,
                timeout=20,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "User-Agent": "StreamXvault-SEO-Bot/1.0"
                }
            )
            if resp.status_code in (200, 202):
                ok(f"{engine_name}: Accepted {len(urls)} URLs (HTTP {resp.status_code})")
                results["success"] += 1
            elif resp.status_code == 429:
                warn(f"{engine_name}: Rate limited — try again later (HTTP 429)")
                results["failed"] += 1
            else:
                warn(f"{engine_name}: HTTP {resp.status_code} — {resp.text[:120]}")
                results["failed"] += 1
        except requests.RequestException as e:
            fail(f"{engine_name}: {e}")
            results["failed"] += 1

    info(f"Submitted {len(urls)} URLs to {len(indexnow_endpoints)} endpoints")
    return results

# ═══════════════════════════════════════════════════════════════
# STEP 6: XML-RPC Ping Services (Blogs/Aggregators)
# ═══════════════════════════════════════════════════════════════
def ping_rpc_services():
    """Ping blog/web ping services via XML-RPC to notify about content updates."""
    header("🌐 Pinging Web Services (XML-RPC)")

    ping_services = [
        "http://rpc.pingomatic.com/",
        "http://ping.feedburner.com/",
        "http://blogsearch.google.com/ping/RPC2",
        "http://rpc.weblogs.com/RPC2",
        "http://ping.blo.gs/",
        "http://www.blogdigger.com/RPC2",
        "http://rpc.twingly.com/",
        "http://www.blogshares.com/rpc.php",
        "http://ping.syndic8.com/xmlrpc.php",
        "http://www.blogsnow.com/ping",
    ]

    xml_payload = f"""<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value>{SITE_NAME}</value></param>
    <param><value>{SITE_URL}/</value></param>
  </params>
</methodCall>"""

    results = {"success": 0, "failed": 0}

    for service_url in ping_services:
        service_name = service_url.split("//")[1].split("/")[0]
        try:
            resp = requests.post(
                service_url,
                data=xml_payload,
                timeout=8,
                headers={"Content-Type": "text/xml"}
            )
            if resp.status_code < 400:
                ok(f"{service_name}: Pinged (HTTP {resp.status_code})")
                results["success"] += 1
            else:
                warn(f"{service_name}: HTTP {resp.status_code}")
                results["failed"] += 1
        except requests.RequestException:
            # Many XML-RPC services are flaky or deprecated — don't show errors for each
            results["failed"] += 1

    info(f"RPC Pings: {results['success']} succeeded, {results['failed']} failed/unreachable")
    return results

# ═══════════════════════════════════════════════════════════════
# STEP 7: SEO Health Report
# ═══════════════════════════════════════════════════════════════
def seo_health_report(videos):
    """Generate an SEO health report for the site."""
    header("📊 SEO Health Report")

    issues = []
    tips = []

    # Check robots.txt
    try:
        resp = requests.get(f"{SITE_URL}/robots.txt", timeout=8)
        if resp.status_code == 200:
            ok("robots.txt: Accessible")
            if "sitemap" in resp.text.lower():
                ok("robots.txt: Contains sitemap reference")
            else:
                issues.append("robots.txt missing Sitemap directive")
        else:
            issues.append(f"robots.txt returned HTTP {resp.status_code}")
    except Exception:
        issues.append("robots.txt not accessible")

    # Check sitemap.xml
    try:
        resp = requests.get(f"{SITE_URL}/sitemap.xml", timeout=8)
        if resp.status_code == 200:
            ok("sitemap.xml: Accessible")
        else:
            issues.append(f"sitemap.xml returned HTTP {resp.status_code}")
    except Exception:
        issues.append("sitemap.xml not accessible")

    # Check homepage meta tags
    try:
        resp = requests.get(SITE_URL, timeout=8,
                            headers={"User-Agent": "Mozilla/5.0 (compatible; StreamXvault-SEO-Bot/1.0)"})
        html = resp.text
        checks = {
            "og:title": 'property="og:title"' in html or "property='og:title'" in html,
            "og:description": 'property="og:description"' in html,
            "og:image": 'property="og:image"' in html,
            "canonical": 'rel="canonical"' in html,
            "twitter:card": 'name="twitter:card"' in html,
            "meta description": 'name="description"' in html,
        }
        for tag, present in checks.items():
            if present:
                ok(f"Homepage: <{tag}> present")
            else:
                issues.append(f"Homepage missing <{tag}> tag")
    except Exception:
        issues.append("Could not fetch homepage for meta tag analysis")

    # Check video pages (sample first 3)
    sample_videos = videos[:3]
    for v in sample_videos:
        vid = v.get("id", "")
        title = v.get("title", "Unknown")
        if not vid:
            continue
        try:
            resp = requests.get(f"{SITE_URL}/watch?v={vid}", timeout=8,
                                headers={"User-Agent": "Googlebot/2.1"})
            html = resp.text
            if 'property="og:title"' in html:
                ok(f"Video '{title[:30]}': OG tags present")
            else:
                issues.append(f"Video '{title[:30]}' missing OG tags")
        except Exception:
            issues.append(f"Could not check video '{title[:30]}'")

    # Video content analysis
    no_desc = [v for v in videos if not v.get("description", "").strip()]
    no_thumb = [v for v in videos if not v.get("thumbnailUrl", "").strip()]

    if no_desc:
        issues.append(f"{len(no_desc)} videos have no description (hurts SEO)")
    if no_thumb:
        issues.append(f"{len(no_thumb)} videos have no thumbnail")

    # Tips
    tips.extend([
        "Submit sitemap manually at https://search.google.com/search-console",
        "Submit sitemap at https://www.bing.com/webmasters",
        "Submit site at https://search.brave.com/webmasters",
        "Submit at https://webmaster.yandex.com",
        "Consider adding JSON-LD VideoObject structured data for richer snippets",
        "Backlinks from social profiles (X, Reddit, Bluesky) boost domain authority",
        "Run this script weekly to keep search engines updated with new content",
    ])

    # Print summary
    print(f"\n  {C.BOLD}Summary:{C.RESET}")
    print(f"  Total videos: {len(videos)}")
    print(f"  Issues found: {len(issues)}")

    if issues:
        print(f"\n  {C.BOLD}{C.YELLOW}Issues:{C.RESET}")
        for i, issue in enumerate(issues, 1):
            warn(f"{i}. {issue}")

    print(f"\n  {C.BOLD}{C.CYAN}Tips:{C.RESET}")
    for i, tip in enumerate(tips, 1):
        info(f"{i}. {tip}")

    return {"issues": len(issues), "tips": len(tips)}

# ═══════════════════════════════════════════════════════════════
# STEP 8: Add server-side sitemap route (one-time patch)
# ═══════════════════════════════════════════════════════════════
def check_server_sitemap_route():
    """Check if server.js has a dynamic sitemap route, suggest adding one."""
    header("🔧 Server Route Check")

    server_path = Path(__file__).parent / "server.js"
    if not server_path.exists():
        warn("server.js not found, skipping route check")
        return

    content = server_path.read_text(encoding="utf-8")

    if "sitemap.xml" in content and "app.get" in content:
        ok("server.js already has sitemap handling")
        return

    # The static file middleware will serve public/sitemap.xml automatically
    ok("sitemap.xml will be served via express.static from public/")
    info(f"Accessible at: {SITE_URL}/sitemap.xml")

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(
        description="🚀 StreamXvault SEO Rocket — Search Engine Submission Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--sitemap", action="store_true", help="Only generate sitemap.xml")
    parser.add_argument("--ping", action="store_true", help="Only ping search engines")
    parser.add_argument("--report", action="store_true", help="Only run SEO health report")
    args = parser.parse_args()

    print(f"""
{C.BOLD}{C.CYAN}
  ╔═══════════════════════════════════════════════════╗
  ║     🚀 StreamXvault SEO Rocket v1.0 🚀           ║
  ║     Search Engine Submission & Indexing           ║
  ╚═══════════════════════════════════════════════════╝
{C.RESET}""")

    start_time = time.time()
    run_all = not (args.sitemap or args.ping or args.report)

    # Fetch videos
    videos = fetch_videos()

    if args.sitemap or run_all:
        generate_sitemap(videos)
        generate_indexnow_key()
        check_server_sitemap_route()

    if args.ping or run_all:
        ping_results = ping_search_engines()
        indexnow_results = submit_indexnow(videos)
        rpc_results = ping_rpc_services()

    if args.report or run_all:
        seo_health_report(videos)

    elapsed = time.time() - start_time

    # Final summary
    header("🏁 Mission Complete")
    print(f"""
  {C.GREEN}Total time: {elapsed:.1f}s{C.RESET}
  {C.CYAN}Videos indexed: {len(videos)}{C.RESET}
  {C.CYAN}Sitemap: {SITE_URL}/sitemap.xml{C.RESET}

  {C.BOLD}Next Steps:{C.RESET}
  {C.DIM}1. Commit & push to deploy: git add public/sitemap.xml public/{INDEXNOW_KEY}.txt{C.RESET}
  {C.DIM}2. Verify at Google Search Console: https://search.google.com/search-console{C.RESET}
  {C.DIM}3. Verify at Bing Webmaster Tools: https://www.bing.com/webmasters{C.RESET}
  {C.DIM}4. Submit to Brave: https://search.brave.com/webmasters{C.RESET}
  {C.DIM}5. Re-run this script weekly: py seo_rocket.py{C.RESET}
""")


if __name__ == "__main__":
    main()
