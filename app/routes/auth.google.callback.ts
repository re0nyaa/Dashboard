import {
    buildClearAuthCookies,
    buildTokenCookies,
    COOKIE_STATE,
    exchangeGoogleCode,
    parseCookies,
} from "../utils/googleAuth.server"

export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const error = url.searchParams.get("error")

    if (error || !code) {
        return new Response(null, {
            status: 302,
            headers: { Location: `/?gcal_error=${encodeURIComponent(error ?? "missing_code")}` },
        })
    }

    const cookies = parseCookies(request.headers.get("cookie"))
    if (!cookies[COOKIE_STATE] || cookies[COOKIE_STATE] !== state) {
        return new Response(null, {
            status: 302,
            headers: { Location: "/?gcal_error=invalid_state" },
        })
    }

    try {
        const tokens = await exchangeGoogleCode(code, request.url)
        const headers = new Headers({ Location: "/" })
        for (const c of buildClearAuthCookies()) headers.append("Set-Cookie", c)
        for (const c of buildTokenCookies(tokens)) headers.append("Set-Cookie", c)
        return new Response(null, { status: 302, headers })
    } catch (e) {
        const msg = e instanceof Error ? e.message : "token_exchange_failed"
        return new Response(null, {
            status: 302,
            headers: { Location: `/?gcal_error=${encodeURIComponent(msg)}` },
        })
    }
}
