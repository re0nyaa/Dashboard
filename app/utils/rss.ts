export interface NewsItem {
    title: string
    description: string
    link: string
    pubDate: string
    imageUrl?: string
}

export async function fetchNews(limit: number = 25): Promise<NewsItem[]> {
    try {
        const response = await fetch(`/api/news?limit=${limit}`)
        const items = (await response.json()) as NewsItem[]
        return Array.isArray(items) ? items : []
    } catch (error) {
        console.error("Error fetching news:", error)
        return []
    }
}
