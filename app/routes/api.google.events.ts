import { getValidGoogleSession, googleCalendarFetch } from "../utils/googleAuth.server"
import type { GoogleCalendarMeta, ScheduleItem } from "../utils/schedule"

function startOfTodayIso() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

function endOfRangeIso(days = 30) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59).toISOString()
}

function buildGoogleEventPayload(body: {
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
    recurrence?: string
    reminderMinutes?: number | null
}) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul"
    const base: Record<string, any> = {
        summary: body.title,
        description: body.description || undefined,
        location: body.location || undefined,
    }

    if (Array.isArray(body.attendees) && body.attendees.length > 0) {
        base.attendees = body.attendees.map((email) => ({ email }))
    }

    if (body.addGoogleMeet) {
        base.conferenceData = {
            createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
            },
        }
    }

    if (body.recurrence) {
        base.recurrence = [`RRULE:FREQ=${body.recurrence}`]
    }

    if (typeof body.reminderMinutes === "number") {
        base.reminders = {
            useDefault: false,
            overrides: [{ method: "popup", minutes: body.reminderMinutes }],
        }
    }

    if (body.allDay) {
        const endDate = body.endDate || body.startDate
        // Google Calendar all-day end.date is exclusive
        const endObj = new Date(`${endDate}T00:00:00`)
        endObj.setDate(endObj.getDate() + 1)
        const exclusiveEnd = endObj.toISOString().slice(0, 10)
        return {
            ...base,
            start: { date: body.startDate },
            end: { date: exclusiveEnd },
        }
    }

    const startTime = body.startTime || "09:00"
    const endTime = body.endTime || "10:00"
    const endDate = body.endDate || body.startDate
    return {
        ...base,
        start: { dateTime: `${body.startDate}T${startTime}:00`, timeZone: tz },
        end: { dateTime: `${endDate}T${endTime}:00`, timeZone: tz },
    }
}

export async function loader({ request }: { request: Request }) {
    const session = await getValidGoogleSession(request)
    if (!session) {
        return Response.json(
            { connected: false, calendars: [], events: [] },
            { status: 401, headers: { "cache-control": "no-store" } }
        )
    }

    const url = new URL(request.url)
    const timeMin = url.searchParams.get("timeMin") || startOfTodayIso()
    const timeMax = url.searchParams.get("timeMax") || endOfRangeIso(30)

    const calListRes = await googleCalendarFetch(
        session.accessToken,
        "/users/me/calendarList?minAccessRole=reader"
    )
    if (!calListRes.ok) {
        return Response.json(
            { error: "캘린더 목록을 불러오지 못했습니다." },
            { status: calListRes.status }
        )
    }

    const calListData = (await calListRes.json()) as { items?: any[] }
    const calendars: GoogleCalendarMeta[] = (calListData.items ?? [])
        .filter((c) => c.selected !== false)
        .map((c) => ({
            id: String(c.id),
            summary: String(c.summary ?? "기본 캘린더"),
            primary: Boolean(c.primary),
            backgroundColor: c.backgroundColor ? String(c.backgroundColor) : "#6E8BFF",
            accessRole: String(c.accessRole ?? "reader"),
        }))

    const eventResults = await Promise.allSettled(
        calendars.map(async (cal) => {
            const params = new URLSearchParams({
                timeMin,
                timeMax,
                singleEvents: "true",
                orderBy: "startTime",
                maxResults: "50",
            })
            const evRes = await googleCalendarFetch(
                session.accessToken,
                `/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`
            )
            if (!evRes.ok) return [] as ScheduleItem[]
            const evData = (await evRes.json()) as { items?: any[] }
            return (evData.items ?? [])
                .filter((ev) => ev.status !== "cancelled")
                .map((ev) => {
                    const isAllDay = Boolean(ev.start?.date && !ev.start?.dateTime)
                    const startRaw = ev.start?.dateTime ?? `${ev.start?.date}T00:00:00`
                    let endRaw = ev.end?.dateTime
                    if (!endRaw && ev.end?.date) {
                        // Google all-day end.date is exclusive; subtract 1ms for inclusive display
                        const d = new Date(`${ev.end.date}T00:00:00`)
                        d.setDate(d.getDate() - 1)
                        endRaw = d.toISOString()
                    }
                    return {
                        id: String(ev.id),
                        calendarId: cal.id,
                        title: String(ev.summary ?? "(제목 없음)"),
                        start: new Date(startRaw).toISOString(),
                        end: endRaw ? new Date(endRaw).toISOString() : undefined,
                        allDay: isAllDay,
                        description: ev.description ? String(ev.description) : undefined,
                        location: ev.location ? String(ev.location) : undefined,
                        attendees: Array.isArray(ev.attendees)
                            ? ev.attendees
                                  .map((a: any) => (a?.email ? String(a.email) : ""))
                                  .filter(Boolean)
                            : undefined,
                        hangoutLink: ev.hangoutLink ? String(ev.hangoutLink) : undefined,
                        sourceId: `google:${cal.id}`,
                        color: cal.backgroundColor,
                        source: "google" as const,
                    } satisfies ScheduleItem
                })
        })
    )

    const events = eventResults
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    const headers = new Headers({ "cache-control": "no-store" })
    for (const c of session.setCookies) headers.append("Set-Cookie", c)

    return Response.json({ connected: true, calendars, events }, { headers })
}

export async function action({ request }: { request: Request }) {
    const session = await getValidGoogleSession(request)
    if (!session) {
        return Response.json({ error: "Google 로그인이 필요합니다." }, { status: 401 })
    }

    const headers = new Headers({ "cache-control": "no-store" })
    for (const c of session.setCookies) headers.append("Set-Cookie", c)

    if (request.method === "POST") {
        const body = await request.json()
        const calendarId = String(body.calendarId || "primary")
        const payload = buildGoogleEventPayload(body)

        const meetParam = body.addGoogleMeet ? "?conferenceDataVersion=1" : ""
        const res = await googleCalendarFetch(
            session.accessToken,
            `/calendars/${encodeURIComponent(calendarId)}/events${meetParam}`,
            { method: "POST", body: JSON.stringify(payload) }
        )
        if (!res.ok) {
            const err = await res.text().catch(() => "")
            return Response.json({ error: `일정 생성 실패: ${err}` }, { status: res.status, headers })
        }
        const created = await res.json()
        return Response.json({ ok: true, event: created }, { headers })
    }

    if (request.method === "PATCH") {
        const body = await request.json()
        const calendarId = String(body.calendarId || "primary")
        const eventId = String(body.eventId || "")
        if (!eventId) {
            return Response.json({ error: "eventId가 필요합니다." }, { status: 400, headers })
        }
        const payload = buildGoogleEventPayload(body)

        const meetParam = body.addGoogleMeet ? "?conferenceDataVersion=1" : ""
        const res = await googleCalendarFetch(
            session.accessToken,
            `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${meetParam}`,
            { method: "PATCH", body: JSON.stringify(payload) }
        )
        if (!res.ok) {
            const err = await res.text().catch(() => "")
            return Response.json({ error: `일정 수정 실패: ${err}` }, { status: res.status, headers })
        }
        const updated = await res.json()
        return Response.json({ ok: true, event: updated }, { headers })
    }

    if (request.method === "DELETE") {
        const body = await request.json()
        const calendarId = String(body.calendarId || "primary")
        const eventId = String(body.eventId || "")
        if (!eventId) {
            return Response.json({ error: "eventId가 필요합니다." }, { status: 400, headers })
        }

        const res = await googleCalendarFetch(
            session.accessToken,
            `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            { method: "DELETE" }
        )
        if (!res.ok && res.status !== 204) {
            const err = await res.text().catch(() => "")
            return Response.json({ error: `일정 삭제 실패: ${err}` }, { status: res.status, headers })
        }
        return Response.json({ ok: true }, { headers })
    }

    return new Response("Method Not Allowed", { status: 405, headers })
}
