export type ScheduleItem = {
    title: string
    start: string
    end?: string
    allDay?: boolean
    sourceId?: string
    color?: string
}

export async function fetchSchedule(options?: { limit?: number }): Promise<ScheduleItem[]> {
    try {
        const url = new URL("/api/schedule", window.location.origin)
        if (options?.limit != null) {
            url.searchParams.set("limit", String(options.limit))
        }

        const response = await fetch(url.toString(), {
            cache: "no-store",
        })
        if (!response.ok) return []

        const data = (await response.json()) as unknown
        if (!Array.isArray(data)) return []

        return data.filter((x): x is ScheduleItem => {
            if (!x || typeof x !== "object") return false
            const anyX = x as any
            return (
                typeof anyX.title === "string" &&
                typeof anyX.start === "string" &&
                (anyX.end == null || typeof anyX.end === "string") &&
                (anyX.sourceId == null || typeof anyX.sourceId === "string") &&
                (anyX.color == null || typeof anyX.color === "string")
            )
        })
    } catch (error) {
        console.error("Error fetching schedule:", error)
        return []
    }
}
