interface SpotifyTrack {
    id?: string
    uri?: string
    name: string
    artists: { name: string }[]
    album: {
        name: string
        images: { url: string }[]
    }
    duration_ms: number
}

export type SpotifyQueueItem = SpotifyTrack

export type SpotifyQueueState = {
    currently_playing: SpotifyTrack | null
    queue: SpotifyTrack[]
}

interface SpotifyPlayerState {
    track: SpotifyTrack | null
    is_playing: boolean
    progress_ms: number
    device: {
        name: string
    } | null
    shuffle_state?: boolean
    repeat_state?: "off" | "track" | "context"
}

export async function getSpotifyAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): Promise<string | null> {
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic " + btoa(clientId + ":" + clientSecret),
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        })

        const data = await response.json()
        return data.access_token
    } catch (error) {
        console.error("Error getting Spotify access token:", error)
        return null
    }
}

export async function getCurrentlyPlaying(
    accessToken: string
): Promise<SpotifyPlayerState | null> {
    try {
        const response = await fetch(
            "https://api.spotify.com/v1/me/player/currently-playing",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        if (response.status === 204 || response.status === 404) {
            return null
        }

        const data = await response.json()

        return {
            track: data.item,
            is_playing: data.is_playing,
            progress_ms: data.progress_ms,
            device: data.device,
        }
    } catch (error) {
        console.error("Error fetching currently playing:", error)
        return null
    }
}

export async function getPlayerState(
    accessToken: string
): Promise<SpotifyPlayerState | null> {
    try {
        const response = await fetch("https://api.spotify.com/v1/me/player", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (response.status === 204 || response.status === 404) {
            return null
        }

        const data = await response.json()

        return {
            track: data.item ?? null,
            is_playing: Boolean(data.is_playing),
            progress_ms: Number(data.progress_ms ?? 0),
            device: data.device ?? null,
            shuffle_state:
                typeof data.shuffle_state === "boolean"
                    ? data.shuffle_state
                    : undefined,
            repeat_state: data.repeat_state,
        }
    } catch (error) {
        console.error("Error fetching player state:", error)
        return null
    }
}

export async function playPause(
    accessToken: string,
    play: boolean
): Promise<boolean> {
    try {
        const endpoint = play ? "play" : "pause"
        const response = await fetch(
            `https://api.spotify.com/v1/me/player/${endpoint}`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        return response.ok
    } catch (error) {
        console.error("Error toggling playback:", error)
        return false
    }
}

export async function skipToNext(accessToken: string): Promise<boolean> {
    try {
        const response = await fetch(
            "https://api.spotify.com/v1/me/player/next",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        return response.ok
    } catch (error) {
        console.error("Error skipping to next:", error)
        return false
    }
}

export async function skipToPrevious(accessToken: string): Promise<boolean> {
    try {
        const response = await fetch(
            "https://api.spotify.com/v1/me/player/previous",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        return response.ok
    } catch (error) {
        console.error("Error skipping to previous:", error)
        return false
    }
}

export async function setShuffle(
    accessToken: string,
    enabled: boolean
): Promise<boolean> {
    try {
        const url = new URL("https://api.spotify.com/v1/me/player/shuffle")
        url.searchParams.set("state", enabled ? "true" : "false")

        const response = await fetch(url.toString(), {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        return response.ok
    } catch (error) {
        console.error("Error toggling shuffle:", error)
        return false
    }
}

export async function setRepeatMode(
    accessToken: string,
    state: "off" | "track" | "context"
): Promise<boolean> {
    try {
        const url = new URL("https://api.spotify.com/v1/me/player/repeat")
        url.searchParams.set("state", state)

        const response = await fetch(url.toString(), {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "")
            console.error(
                "Error setting repeat mode:",
                response.status,
                response.statusText,
                bodyText
            )
            return false
        }

        return true
    } catch (error) {
        console.error("Error setting repeat mode:", error)
        return false
    }
}

export async function seekToPosition(
    accessToken: string,
    positionMs: number
): Promise<boolean> {
    try {
        const clamped = Math.max(0, Math.floor(positionMs))
        const url = new URL("https://api.spotify.com/v1/me/player/seek")
        url.searchParams.set("position_ms", String(clamped))

        const response = await fetch(url.toString(), {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        return response.ok
    } catch (error) {
        console.error("Error seeking position:", error)
        return false
    }
}

export async function getQueue(
    accessToken: string
): Promise<SpotifyQueueState | null> {
    try {
        const response = await fetch(
            "https://api.spotify.com/v1/me/player/queue",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        if (!response.ok) {
            return null
        }

        const data = await response.json()
        return {
            currently_playing: data.currently_playing ?? null,
            queue: Array.isArray(data.queue) ? data.queue : [],
        }
    } catch (error) {
        console.error("Error fetching queue:", error)
        return null
    }
}

export async function getRecentlyPlayedTrack(
    accessToken: string
): Promise<SpotifyTrack | null> {
    try {
        const url = new URL(
            "https://api.spotify.com/v1/me/player/recently-played"
        )
        url.searchParams.set("limit", "1")

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!response.ok) return null
        const data = await response.json()
        const item = Array.isArray(data.items) ? data.items[0] : null
        const track = item?.track ?? null
        return track
    } catch (error) {
        console.error("Error fetching recently played:", error)
        return null
    }
}

export async function playTrackUris(
    accessToken: string,
    uris: string[],
    positionMs?: number
): Promise<boolean> {
    try {
        const body: Record<string, unknown> = { uris }
        if (typeof positionMs === "number") {
            body.position_ms = Math.max(0, Math.floor(positionMs))
        }

        const response = await fetch(
            "https://api.spotify.com/v1/me/player/play",
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify(body),
            }
        )

        return response.ok
    } catch (error) {
        console.error("Error starting playback:", error)
        return false
    }
}

export async function saveTrackToLibrary(
    accessToken: string,
    trackId: string
): Promise<boolean> {
    try {
        const url = new URL("https://api.spotify.com/v1/me/tracks")
        url.searchParams.set("ids", trackId)

        const res = await fetch(url.toString(), {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        return res.ok
    } catch (error) {
        console.error("Error saving track to library:", error)
        return false
    }
}
