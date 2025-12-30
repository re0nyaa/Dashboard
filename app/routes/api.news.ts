import type { NewsItem } from "../utils/rss"
import { XMLParser } from "fast-xml-parser"

function stripHtml(input: string): string {
    return input
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\([^)]*?=연합뉴스\)\s*[^=]+?(기자|특파원)\s*=\s*/u, "")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#9650;/g, " ")
        .replace(/&#9660;/g, " ")
        .trim()
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const limitParam = url.searchParams.get("limit")
    const limit = Math.min(
        100,
        Math.max(1, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 25)
    )

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const uri = process.env.NEWS_RSS_URI ?? "https://www.yna.co.kr/rss/news.xml"
    try {
        const response = await fetch(uri, {
            signal: controller.signal,
            headers: {
                accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
                "user-agent": "Mozilla/5.0 (compatible; 29inch-dashboard/1.0; +https://localhost)",
            },
        })

        if (!response.ok) {
            return new Response(JSON.stringify([] satisfies NewsItem[]), {
                status: 200,
                headers: {
                    "content-type": "application/json; charset=utf-8",
                },
            })
        }

        const xmlText = await response.text()

        const parser = new XMLParser({
            ignoreAttributes: false,
        })

        const parsed = parser.parse(xmlText) as any
        const channel = parsed?.rss?.channel
        const itemsRaw = toArray(channel?.item)
            .filter((item: any) => {
                const title = String(item?.title ?? "").trim()
                return title !== "[알림] 연합뉴스 콘텐츠 저작권 고지"
            })
            .slice(0, 5)
        const items: NewsItem[] = itemsRaw.slice(0, limit).map((item: any) => {
            const title = String(item?.title ?? "").trim()
            const link = String(item?.link ?? "").trim()
            const pubDate = String(item?.pubDate ?? "").trim()

            const descriptionRaw = String(item?.description ?? "")
            const description = stripHtml(descriptionRaw)

            const mediaContent = item?.["media:content"]
            const imageUrl =
                (mediaContent &&
                    (Array.isArray(mediaContent)
                        ? mediaContent[0]?.["@_url"]
                        : mediaContent?.["@_url"])) ||
                undefined

            return {
                title,
                description,
                link,
                pubDate,
                imageUrl,
            }
        })

        return new Response(JSON.stringify(items), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=120",
            },
        })
    } catch (error) {
        console.error("Error fetching news (server):", error)
        return new Response(JSON.stringify([] satisfies NewsItem[]), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
            },
        })
    } finally {
        clearTimeout(timeout)
    }
}
