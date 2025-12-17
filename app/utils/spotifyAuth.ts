const STORAGE_KEYS = {
    accessToken: "spotify_access_token",
    refreshToken: "spotify_refresh_token",
    expiresAt: "spotify_expires_at",
    pkceVerifier: "spotify_pkce_verifier",
    authState: "spotify_auth_state",
} as const

type TokenResponse = {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
    scope?: string
}

function getClientId(): string {
    const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
    if (!id) throw new Error("Missing VITE_SPOTIFY_CLIENT_ID")
    return id
}

function getRedirectUri(): string {
    return (
        import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
        window.location.origin + "/callback"
    )
}

function base64UrlEncode(bytes: ArrayBuffer) {
    const uint8 = new Uint8Array(bytes)
    let str = ""
    for (let i = 0; i < uint8.length; i++) str += String.fromCharCode(uint8[i])
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function sha256(value: string): Promise<ArrayBuffer> {
    const enc = new TextEncoder()
    return crypto.subtle.digest("SHA-256", enc.encode(value))
}

function randomString(len = 64) {
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    const bytes = new Uint8Array(len)
    crypto.getRandomValues(bytes)
    let out = ""
    for (const b of bytes) out += alphabet[b % alphabet.length]
    return out
}

function setStored(key: keyof typeof STORAGE_KEYS, value: string) {
    localStorage.setItem(STORAGE_KEYS[key], value)
}

function getStored(key: keyof typeof STORAGE_KEYS) {
    return localStorage.getItem(STORAGE_KEYS[key])
}

function removeStored(key: keyof typeof STORAGE_KEYS) {
    localStorage.removeItem(STORAGE_KEYS[key])
}

export function logoutSpotify() {
    removeStored("accessToken")
    removeStored("refreshToken")
    removeStored("expiresAt")
    removeStored("pkceVerifier")
    removeStored("authState")
}

export async function startSpotifyLogin() {
    const clientId = getClientId()
    const redirectUri = getRedirectUri()

    const verifier = randomString(96)
    const challenge = base64UrlEncode(await sha256(verifier))
    const state = randomString(24)

    setStored("pkceVerifier", verifier)
    setStored("authState", state)

    const scope = [
        "user-read-playback-state",
        "user-read-currently-playing",
        "user-modify-playback-state",
        "user-library-modify",
        "user-read-recently-played",
    ].join(" ")

    const url = new URL("https://accounts.spotify.com/authorize")
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("scope", scope)
    url.searchParams.set("state", state)
    url.searchParams.set("code_challenge_method", "S256")
    url.searchParams.set("code_challenge", challenge)

    window.location.assign(url.toString())
}

async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const clientId = getClientId()
    const redirectUri = getRedirectUri()
    const verifier = getStored("pkceVerifier")
    if (!verifier) throw new Error("Missing PKCE verifier")

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        }),
    })

    if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Token exchange failed: ${res.status} ${txt}`)
    }

    return (await res.json()) as TokenResponse
}

async function refreshAccessToken(
    refreshToken: string
): Promise<TokenResponse> {
    const clientId = getClientId()
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
        }),
    })

    if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Token refresh failed: ${res.status} ${txt}`)
    }

    return (await res.json()) as TokenResponse
}

function storeTokens(token: TokenResponse) {
    const expiresAt = String(Date.now() + token.expires_in * 1000)
    setStored("accessToken", token.access_token)
    setStored("expiresAt", expiresAt)
    if (token.refresh_token) setStored("refreshToken", token.refresh_token)
}

function clearAuthParamsFromUrl() {
    const url = new URL(window.location.href)
    url.searchParams.delete("code")
    url.searchParams.delete("state")
    url.searchParams.delete("error")
    window.history.replaceState({}, document.title, url.toString())
}

export async function handleSpotifyCallback(): Promise<boolean> {
    const url = new URL(window.location.href)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const error = url.searchParams.get("error")

    if (!code && !error) return false

    try {
        if (error) throw new Error(error)
        const expectedState = getStored("authState")
        if (!expectedState || expectedState !== state) {
            throw new Error("Invalid OAuth state")
        }

        const token = await exchangeCodeForToken(code!)
        storeTokens(token)
        return true
    } finally {
        clearAuthParamsFromUrl()
        removeStored("pkceVerifier")
        removeStored("authState")
    }
}

export async function getValidSpotifyAccessToken(): Promise<string | null> {
    const accessToken = getStored("accessToken")
    const expiresAt = Number(getStored("expiresAt") ?? "0")

    if (accessToken && Date.now() < expiresAt - 30_000) {
        return accessToken
    }

    const refreshTokenValue = getStored("refreshToken")
    if (!refreshTokenValue) return null

    const refreshed = await refreshAccessToken(refreshTokenValue)
    storeTokens(refreshed)
    return refreshed.access_token
}
