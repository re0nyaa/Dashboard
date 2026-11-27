export type ScheduleItem = {
    id?: string
    calendarId?: string
    title: string
    start: string
    end?: string
    allDay?: boolean
    description?: string
    location?: string
    attendees?: string[]
    hangoutLink?: string
    sourceId?: string
    color?: string
    source?: "ical" | "google"
}

export type GoogleCalendarMeta = {
    id: string
    summary: string
    primary?: boolean
    backgroundColor: string
    accessRole: string
}

export type GoogleAuthStatus = {
    connected: boolean
    user: {
        email: string
        name?: string
        picture?: string
    } | null
}

export type GoogleEventInput = {
    calendarId?: string
    eventId?: string
    title: string
    startDate: string
    endDate?: string
    startTime?: string
    endTime?: string
    allDay?: boolean
    description?: string
    location?: string
    attendees?: string[]
    addGoogleMeet?: boolean
    recurrence?: "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    reminderMinutes?: number | null
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

export async function fetchGoogleAuthStatus(): Promise<GoogleAuthStatus> {
    try {
        const res = await fetch("/api/google/auth", { cache: "no-store" })
        if (!res.ok) return { connected: false, user: null }
        return (await res.json()) as GoogleAuthStatus
    } catch {
        return { connected: false, user: null }
    }
}

export async function logoutGoogle(): Promise<void> {
    await fetch("/api/google/auth", { method: "DELETE" })
}

export async function fetchGoogleCalendarData(options?: {
    timeMin?: string
    timeMax?: string
}): Promise<{
    connected: boolean
    calendars: GoogleCalendarMeta[]
    events: ScheduleItem[]
}> {
    try {
        const url = new URL("/api/google/events", window.location.origin)
        if (options?.timeMin) url.searchParams.set("timeMin", options.timeMin)
        if (options?.timeMax) url.searchParams.set("timeMax", options.timeMax)
        const res = await fetch(url.toString(), { cache: "no-store" })
        if (!res.ok) return { connected: false, calendars: [], events: [] }
        return (await res.json()) as {
            connected: boolean
            calendars: GoogleCalendarMeta[]
            events: ScheduleItem[]
        }
    } catch {
        return { connected: false, calendars: [], events: [] }
    }
}

export async function createGoogleEvent(input: GoogleEventInput): Promise<void> {
    const res = await fetch("/api/google/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "일정 생성에 실패했습니다.")
    }
}

export async function updateGoogleEvent(input: GoogleEventInput): Promise<void> {
    const res = await fetch("/api/google/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "일정 수정에 실패했습니다.")
    }
}

export async function deleteGoogleEvent(calendarId: string, eventId: string): Promise<void> {
    const res = await fetch("/api/google/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarId, eventId }),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "일정 삭제에 실패했습니다.")
    }
}
