import dotenv from "dotenv"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"

const COOKIE_ACCESS = "gcal_access_token"
const COOKIE_REFRESH = "gcal_refresh_token"
const COOKIE_EXPIRES = "gcal_expires_at"
const COOKIE_STATE = "gcal_oauth_state"

export type GoogleUserProfile = {
    email: string
    name?: string
    picture?: string
}

export type GoogleTokenSet = {
    accessToken: string
    refreshToken?: string
    expiresAt: number
}

function getGoogleClientConfig(requestUrl?: string) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        dotenv.config({ override: true })
    }
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        throw new Error("GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 설정되지 않았습니다.")
    }

    let redirectUri = process.env.GOOGLE_REDIRECT_URI
    if (!redirectUri && requestUrl) {
        const origin = new URL(requestUrl).origin
        redirectUri = `${origin}/auth/google/callback`
    }
    if (!redirectUri) {
        redirectUri = "http://127.0.0.1:5173/auth/google/callback"
    }

    return { clientId, clientSecret, redirectUri }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (!cookieHeader) return out
    for (const part of cookieHeader.split(";")) {
        const idx = part.indexOf("=")
        if (idx === -1) continue
        const key = part.slice(0, idx).trim()
        const val = part.slice(idx + 1).trim()
        if (key) out[key] = decodeURIComponent(val)
    }
    return out
}

function serializeCookie(
    name: string,
    value: string,
    opts: { maxAge?: number; path?: string; httpOnly?: boolean; sameSite?: "Lax" | "Strict" } = {}
) {
    const parts = [`${name}=${encodeURIComponent(value)}`]
    parts.push(`Path=${opts.path ?? "/"}`)
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
    if (opts.httpOnly !== false) parts.push("HttpOnly")
    parts.push(`SameSite=${opts.sameSite ?? "Lax"}`)
    return parts.join("; ")
}

export function buildTokenCookies(tokens: GoogleTokenSet): string[] {
    const headers: string[] = [
        serializeCookie(COOKIE_ACCESS, tokens.accessToken, { maxAge: 60 * 60 }),
        serializeCookie(COOKIE_EXPIRES, String(tokens.expiresAt), { maxAge: 60 * 60 * 24 * 30 }),
    ]
    if (tokens.refreshToken) {
        headers.push(
            serializeCookie(COOKIE_REFRESH, tokens.refreshToken, { maxAge: 60 * 60 * 24 * 30 })
        )
    }
    return headers
}

export function buildClearAuthCookies(): string[] {
    return [
        serializeCookie(COOKIE_ACCESS, "", { maxAge: 0 }),
        serializeCookie(COOKIE_REFRESH, "", { maxAge: 0 }),
        serializeCookie(COOKIE_EXPIRES, "", { maxAge: 0 }),
        serializeCookie(COOKIE_STATE, "", { maxAge: 0 }),
    ]
}

export function buildStateCookie(state: string): string {
    return serializeCookie(COOKIE_STATE, state, { maxAge: 60 * 10 })
}

export function createGoogleAuthUrl(requestUrl: string): { url: string; state: string } {
    const { clientId, redirectUri } = getGoogleClientConfig(requestUrl)
    const state = crypto.randomUUID()

    const url = new URL(GOOGLE_AUTH_URL)
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set(
        "scope",
        [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar",
        ].join(" ")
    )
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("prompt", "consent")
    url.searchParams.set("state", state)

    return { url: url.toString(), state }
}

export async function exchangeGoogleCode(
    code: string,
    requestUrl: string
): Promise<GoogleTokenSet> {
    const { clientId, clientSecret, redirectUri } = getGoogleClientConfig(requestUrl)
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Google 토큰 교환 실패 (${res.status}): ${text}`)
    }

    const data = (await res.json()) as {
        access_token: string
        expires_in: number
        refresh_token?: string
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    }
}

async function refreshGoogleToken(
    refreshToken: string,
    requestUrl?: string
): Promise<GoogleTokenSet> {
    const { clientId, clientSecret } = getGoogleClientConfig(requestUrl)
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    })

    if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Google 토큰 갱신 실패 (${res.status}): ${text}`)
    }

    const data = (await res.json()) as {
        access_token: string
        expires_in: number
        refresh_token?: string
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
    }
}

export async function getValidGoogleSession(
    request: Request
): Promise<{ accessToken: string; setCookies: string[] } | null> {
    const cookies = parseCookies(request.headers.get("cookie"))
    const accessToken = cookies[COOKIE_ACCESS]
    const refreshToken = cookies[COOKIE_REFRESH]
    const expiresAt = Number(cookies[COOKIE_EXPIRES] ?? "0")

    if (accessToken && Date.now() < expiresAt - 30_000) {
        return { accessToken, setCookies: [] }
    }

    if (!refreshToken) return null

    try {
        const refreshed = await refreshGoogleToken(refreshToken, request.url)
        return {
            accessToken: refreshed.accessToken,
            setCookies: buildTokenCookies(refreshed),
        }
    } catch {
        return null
    }
}

export async function fetchGoogleUserProfile(
    accessToken: string
): Promise<GoogleUserProfile | null> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
        email?: string
        name?: string
        picture?: string
    }
    if (!data.email) return null
    return {
        email: data.email,
        name: data.name,
        picture: data.picture,
    }
}

export async function googleCalendarFetch(
    accessToken: string,
    path: string,
    init?: RequestInit
): Promise<Response> {
    return fetch(`${GOOGLE_CALENDAR_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            ...(init?.headers ?? {}),
        },
    })
}

export { COOKIE_STATE }
